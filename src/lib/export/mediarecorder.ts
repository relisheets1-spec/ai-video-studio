import fixWebmDuration from "fix-webm-duration";
import { sentenceOffsets } from "@/lib/subtitles";
import type { SubtitleLayout } from "@/lib/subtitles";
import { drawSceneFrame, prepareSceneCues, type LoadedAsset } from "./render";

export interface RecorderParams {
  assets: LoadedAsset[];
  W: number;
  H: number;
  fps: number;
  bitrate: number;
  mime: string;
  layout: SubtitleLayout;
  /** Холст должен быть смонтирован и виден: Safari не отдаёт кадры с отсоединённого. */
  canvas: HTMLCanvasElement;
  audioCtx: AudioContext;
  cancelRef: { current: boolean };
  onProgress: (percent: number) => void;
  onStatus: (text: string) => void;
}

/**
 * Запасной путь без WebCodecs (iOS Safari, Firefox): захват холста и аудио
 * в реальном времени через MediaRecorder. Пятиминутный фильм пишется пять
 * минут; вкладку сворачивать нельзя.
 */
export async function recordRealtime(p: RecorderParams): Promise<{ blob: Blob; ext: "mp4" | "webm" } | null> {
  const { assets, W, H, fps, layout, canvas, audioCtx } = p;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("Не удалось создать 2D контекст");

  await audioCtx.resume();

  const stream = (canvas as any).captureStream(fps) as MediaStream;
  const dest = audioCtx.createMediaStreamDestination();
  const audioTrack = dest.stream.getAudioTracks()[0];
  if (audioTrack) stream.addTrack(audioTrack);

  const isMp4 = p.mime.startsWith("video/mp4");
  const recorder = new MediaRecorder(stream, {
    mimeType: p.mime,
    videoBitsPerSecond: p.bitrate,
    audioBitsPerSecond: 128_000,
  });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };
  const stopped = new Promise<void>((resolve) => {
    recorder.onstop = () => resolve();
  });

  // Подготовка первого кадра до старта записи, иначе первые миллисекунды чёрные.
  const colorOffsets = sentenceOffsets(assets.map((a) => a.scene.narration));
  const prepared = assets.map((asset, idx) =>
    prepareSceneCues(ctx, layout, asset.scene.narration, asset.durationSec, colorOffsets[idx], W, H)
  );
  drawSceneFrame(ctx, {
    W,
    H,
    layout,
    asset: assets[0],
    prevAsset: null,
    sceneIndex: 0,
    elapsedSec: 0,
    durationSec: assets[0].durationSec,
    cues: prepared[0].cues,
    cueBoxes: prepared[0].cueBoxes,
  });

  recorder.start(1000);

  // Аудио планируется по часам AudioContext — от них же считается время кадра.
  const t0 = audioCtx.currentTime + 0.3;
  const sceneStart: number[] = [];
  const sources: AudioBufferSourceNode[] = [];
  let t = t0;
  for (const asset of assets) {
    const src = audioCtx.createBufferSource();
    src.buffer = asset.audioBuffer;
    src.connect(dest);
    src.start(t);
    sources.push(src);
    sceneStart.push(t);
    t += asset.durationSec;
  }
  const tEnd = t;
  const total = tEnd - t0;

  await new Promise<void>((resolve) => {
    const tick = () => {
      if (p.cancelRef.current) {
        resolve();
        return;
      }
      const now = audioCtx.currentTime;
      if (now >= tEnd) {
        resolve();
        return;
      }
      let i = 0;
      while (i < assets.length - 1 && now >= sceneStart[i + 1]) i++;
      const elapsed = Math.max(0, now - sceneStart[i]);
      drawSceneFrame(ctx, {
        W,
        H,
        layout,
        asset: assets[i],
        prevAsset: i > 0 ? assets[i - 1] : null,
        sceneIndex: i,
        elapsedSec: elapsed,
        durationSec: assets[i].durationSec,
        cues: prepared[i].cues,
        cueBoxes: prepared[i].cueBoxes,
      });
      p.onStatus(`Запись сцены ${i + 1}/${assets.length}: ${assets[i].scene.title}`);
      p.onProgress(Math.min(98, Math.round(((now - t0) / total) * 100)));
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  for (const src of sources) {
    try {
      src.stop();
    } catch {}
  }
  recorder.stop();
  await stopped;

  if (p.cancelRef.current) return null;

  p.onStatus("Сборка файла...");
  p.onProgress(99);

  let blob = new Blob(chunks, { type: p.mime.split(";")[0] });
  if (!isMp4) {
    // MediaRecorder не пишет длительность в WebM — без починки файл не перематывается.
    try {
      blob = await fixWebmDuration(blob, Math.round(total * 1000), { logger: false });
    } catch (e) {
      console.warn("fix-webm-duration failed:", e);
    }
  }

  return { blob, ext: isMp4 ? "mp4" : "webm" };
}
