import { Muxer, ArrayBufferTarget } from "mp4-muxer";
import { sentenceOffsets } from "@/lib/subtitles";
import type { SubtitleLayout } from "@/lib/subtitles";
import { drawSceneFrame, prepareSceneCues, type LoadedAsset } from "./render";

export interface WebCodecsParams {
  assets: LoadedAsset[];
  W: number;
  H: number;
  fps: number;
  bitrate: number;
  codec: string;
  sampleRate: number;
  layout: SubtitleLayout;
  cancelRef: { current: boolean };
  onProgress: (percent: number) => void;
  onStatus: (text: string) => void;
}

/**
 * Ждём, пока очередь кодировщика опустеет ниже порога. Один setTimeout(0)
 * не давал кодировщику догнать цикл: кадры копились в очереди тысячами,
 * и flush() в конце не завершался.
 */
async function drain(
  encoder: { encodeQueueSize: number; state: string },
  below: number,
  cancelRef: { current: boolean }
): Promise<void> {
  while (encoder.encodeQueueSize > below && !cancelRef.current && encoder.state === "configured") {
    await new Promise((r) => setTimeout(r, 4));
  }
}

/** Chrome отбирает кодек у вкладки, ушедшей в фон, — объясняем это по-человечески. */
export function describeEncoderError(err: any): string {
  const msg = String(err?.message || err || "");
  if (/reclaimed|inactivity|closed codec/i.test(msg)) {
    return "Браузер освободил видеокодировщик, пока вкладка была в фоне. Держите вкладку открытой и на виду до конца сборки и повторите экспорт.";
  }
  return "Ошибка видеокодировщика: " + msg;
}

/** Офлайн-рендер: рисуем кадры на холст и кодируем аппаратным H.264/AAC в MP4. */
export async function encodeWithWebCodecs(p: WebCodecsParams): Promise<Blob | null> {
  const { assets, W, H, fps, layout, sampleRate } = p;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("Не удалось создать 2D контекст");

  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: { codec: "avc", width: W, height: H },
    audio: { codec: "aac", numberOfChannels: 2, sampleRate },
    fastStart: "in-memory",
    firstTimestampBehavior: "offset",
  });

  let videoEncoderError: any = null;
  let videoChunks = 0;
  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => {
      videoChunks++;
      muxer.addVideoChunk(chunk, meta);
    },
    error: (err) => {
      console.error("VideoEncoder error:", err);
      videoEncoderError = err;
    },
  });
  videoEncoder.configure({
    codec: p.codec,
    width: W,
    height: H,
    bitrate: p.bitrate,
    framerate: fps,
    hardwareAcceleration: "prefer-hardware",
    avc: { format: "avc" },
  });

  let audioEncoderError: any = null;
  let audioChunks = 0;
  const audioEncoder = new AudioEncoder({
    output: (chunk, meta) => {
      audioChunks++;
      muxer.addAudioChunk(chunk, meta);
    },
    error: (err) => {
      console.error("AudioEncoder error:", err);
      audioEncoderError = err;
    },
  });
  audioEncoder.configure({
    codec: "mp4a.40.2",
    numberOfChannels: 2,
    sampleRate,
    bitrate: 128_000,
  });

  let globalVideoFrames = 0;
  let globalAudioSamples = 0;
  const totalScenes = assets.length;

  for (let i = 0; i < totalScenes; i++) {
    if (p.cancelRef.current) break;

    const asset = assets[i];
    const { audioBuffer, durationSec, scene } = asset;
    p.onStatus(`Рендер сцены ${i + 1}/${totalScenes}: ${scene.title}`);

    // Аудио сцены — целиком, порциями по 1024 сэмпла.
    const left = audioBuffer.getChannelData(0);
    const right = audioBuffer.numberOfChannels > 1 ? audioBuffer.getChannelData(1) : left;
    const AAC_CHUNK = 1024;
    let audioOffset = 0;

    while (audioOffset < audioBuffer.length) {
      const chunkSize = Math.min(AAC_CHUNK, audioBuffer.length - audioOffset);
      const planar = new Float32Array(chunkSize * 2);
      planar.set(left.subarray(audioOffset, audioOffset + chunkSize), 0);
      planar.set(right.subarray(audioOffset, audioOffset + chunkSize), chunkSize);

      const timestampUs = Math.round(((globalAudioSamples + audioOffset) / sampleRate) * 1_000_000);
      const audioData = new AudioData({
        format: "f32-planar",
        sampleRate,
        numberOfFrames: chunkSize,
        numberOfChannels: 2,
        timestamp: timestampUs,
        data: planar,
      });
      audioEncoder.encode(audioData);
      audioData.close();
      audioOffset += chunkSize;

      if (audioEncoder.encodeQueueSize > 50) await drain(audioEncoder, 16, p.cancelRef);
    }
    globalAudioSamples += audioBuffer.length;

    // Сквозной номер первого предложения сцены — от него цвет реплик, как в плеере.
    const colorBase = sentenceOffsets(assets.map((a) => a.scene.narration))[i] || 0;
    const { cues, cueBoxes } = prepareSceneCues(ctx, layout, scene.narration, durationSec, colorBase, W, H);
    const totalFrames = Math.max(1, Math.round(durationSec * fps));

    for (let frame = 0; frame < totalFrames; frame++) {
      if (p.cancelRef.current) break;

      const elapsedSec = (frame / totalFrames) * durationSec;
      drawSceneFrame(ctx, {
        W,
        H,
        layout,
        asset,
        prevAsset: i > 0 ? assets[i - 1] : null,
        sceneIndex: i,
        elapsedSec,
        durationSec,
        cues,
        cueBoxes,
      });

      const timestampUs = Math.round(globalVideoFrames * (1_000_000 / fps));
      const isKeyFrame = globalVideoFrames % (fps * 2) === 0;
      const videoFrame = new VideoFrame(canvas, { timestamp: timestampUs });
      videoEncoder.encode(videoFrame, { keyFrame: isKeyFrame });
      videoFrame.close();
      globalVideoFrames++;

      if (videoEncoderError) throw new Error(describeEncoderError(videoEncoderError));
      if (videoEncoder.encodeQueueSize > 30) await drain(videoEncoder, 8, p.cancelRef);
      if (videoEncoderError) throw new Error(describeEncoderError(videoEncoderError));
      if (frame % 60 === 0) {
        p.onProgress(Math.min(98, Math.round(((i + frame / totalFrames) / totalScenes) * 100)));
        await new Promise((r) => setTimeout(r, 0));
      }
    }
  }

  if (p.cancelRef.current) {
    videoEncoder.close();
    audioEncoder.close();
    return null;
  }

  if (videoEncoderError) throw new Error(describeEncoderError(videoEncoderError));
  if (audioEncoderError) throw new Error("Ошибка аудиокодировщика: " + audioEncoderError.message);

  p.onStatus("Финализация контейнера MP4...");
  p.onProgress(99);

  console.info(
    `[export] frames=${globalVideoFrames} videoQueue=${videoEncoder.encodeQueueSize} audioQueue=${audioEncoder.encodeQueueSize} ` +
      `chunks=${videoChunks}/${audioChunks} states=${videoEncoder.state}/${audioEncoder.state}`
  );
  await videoEncoder.flush();
  console.info(`[export] video flushed, chunks=${videoChunks}`);
  await audioEncoder.flush();
  console.info(`[export] audio flushed, chunks=${audioChunks}`);
  videoEncoder.close();
  audioEncoder.close();
  muxer.finalize();
  console.info(`[export] mp4 finalized, bytes=${target.buffer.byteLength}`);

  return new Blob([target.buffer], { type: "video/mp4" });
}
