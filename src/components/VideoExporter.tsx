"use client";

import React, { useState, useRef } from "react";
import {
  DownloadSimple,
  X,
  FilmStrip,
  CheckCircle,
  WarningCircle,
  CircleNotch,
  Lightning,
} from "@phosphor-icons/react";
import { Scene } from "@/lib/types";
import { Muxer, ArrayBufferTarget } from "mp4-muxer";
import {
  FRAME_SIZES,
  normalizeOrientation,
  orientationLabel,
  type Orientation,
} from "@/lib/orientation";
import {
  buildCues,
  computeSubtitleLayout,
  cueIndexAt,
  estimateSceneSeconds,
  wrapLines,
  SUBTITLE_BG,
  SUBTITLE_FG,
  SUBTITLE_SHADOW,
} from "@/lib/subtitles";

interface VideoExporterProps {
  title: string;
  scenes: Scene[];
  orientation?: Orientation;
  onClose: () => void;
}

export const VideoExporter: React.FC<VideoExporterProps> = ({ title, scenes, orientation, onClose }) => {
  const [status, setStatus] = useState<"idle" | "rendering" | "finished" | "error">("idle");
  const [progressPercent, setProgressPercent] = useState(0);
  const [statusText, setStatusText] = useState("");
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [fileSizeMb, setFileSizeMb] = useState<string | null>(null);

  const cancelRef = useRef(false);

  // Кадр 1080p @ 30 FPS. Ориентацию берём из сцен: старые видео её не имеют
  // и корректно читаются как 16:9 — именно так они и были сгенерированы.
  const frameOrientation = normalizeOrientation(orientation ?? scenes[0]?.orientation);
  const { w: WIDTH, h: HEIGHT } = FRAME_SIZES[frameOrientation];
  const FPS = 30;
  const AUDIO_SAMPLE_RATE = 44100;

  // Одна разметка на весь экспорт — те же пропорции, что и в превью плеера.
  const layout = computeSubtitleLayout(WIDTH, HEIGHT);

  const startExport = async () => {
    try {
      if (typeof window === "undefined" || !("VideoEncoder" in window) || !("AudioEncoder" in window)) {
        throw new Error(
          "Ваш браузер не поддерживает аппаратный кодировщик WebCodecs H.264/AAC. Рекомендуется Chrome, Edge, Яндекс Браузер или Opera."
        );
      }

      setStatus("rendering");
      cancelRef.current = false;
      setProgressPercent(0);
      setStatusText("Параллельная предзагрузка всех кадров и аудио...");

      // Canvas
      const canvas = document.createElement("canvas");
      canvas.width = WIDTH;
      canvas.height = HEIGHT;
      const ctx = canvas.getContext("2d", { alpha: false });
      if (!ctx) throw new Error("Не удалось создать 2D контекст");

      // Audio Context
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioContextClass({ sampleRate: AUDIO_SAMPLE_RATE });

      // MP4 Muxer (ISO BMFF container)
      const target = new ArrayBufferTarget();
      const muxer = new Muxer({
        target,
        video: {
          codec: "avc",
          width: WIDTH,
          height: HEIGHT,
        },
        audio: {
          codec: "aac",
          numberOfChannels: 2,
          sampleRate: AUDIO_SAMPLE_RATE,
        },
        fastStart: "in-memory",
        firstTimestampBehavior: "offset",
      });

      // VideoEncoder
      let videoEncoderError: any = null;
      const videoEncoder = new VideoEncoder({
        output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
        error: (err) => {
          console.error("VideoEncoder error:", err);
          videoEncoderError = err;
        },
      });

      const preferredCodecs = ["avc1.4d002a", "avc1.64002a", "avc1.420034", "avc1.420028"];
      let selectedVideoCodec = preferredCodecs[0];
      for (const candidate of preferredCodecs) {
        try {
          const sup = await VideoEncoder.isConfigSupported({
            codec: candidate,
            width: WIDTH,
            height: HEIGHT,
            bitrate: 5_000_000,
            framerate: FPS,
          });
          if (sup && sup.supported) {
            selectedVideoCodec = candidate;
            break;
          }
        } catch {}
      }

      videoEncoder.configure({
        codec: selectedVideoCodec,
        width: WIDTH,
        height: HEIGHT,
        bitrate: 5_500_000,
        framerate: FPS,
        hardwareAcceleration: "prefer-hardware",
        avc: { format: "avc" },
      });

      // AudioEncoder
      let audioEncoderError: any = null;
      const audioEncoder = new AudioEncoder({
        output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
        error: (err) => {
          console.error("AudioEncoder error:", err);
          audioEncoderError = err;
        },
      });

      audioEncoder.configure({
        codec: "mp4a.40.2",
        numberOfChannels: 2,
        sampleRate: AUDIO_SAMPLE_RATE,
        bitrate: 128_000,
      });

      // 1. HIGH-SPEED PARALLEL PRELOAD
      const loadedAssets = await Promise.all(
        scenes.map(async (scene, idx) => {
          const img = new Image();
          img.crossOrigin = "anonymous";
          const imgPromise = new Promise<HTMLImageElement>((resolve) => {
            img.onload = () => resolve(img);
            img.onerror = () => resolve(img);
            img.src = scene.imageUrl || "";
          });

          let audioBuffer: AudioBuffer | null = null;
          let durationSec = scene.durationEstimate || estimateSceneSeconds(scene.narration);
          if (scene.audioUrl) {
            try {
              const res = await fetch(scene.audioUrl);
              const arr = await res.arrayBuffer();
              audioBuffer = await audioCtx.decodeAudioData(arr);
              durationSec = audioBuffer.duration;
            } catch (e) {
              console.warn("Audio load error scene", idx, e);
            }
          }

          if (!audioBuffer) {
            const sampleCount = Math.max(1, Math.round(durationSec * AUDIO_SAMPLE_RATE));
            audioBuffer = audioCtx.createBuffer(2, sampleCount, AUDIO_SAMPLE_RATE);
          }

          return {
            img: await imgPromise,
            audioBuffer,
            durationSec,
            scene,
          };
        })
      );

      if (cancelRef.current) return;

      let globalVideoFrames = 0;
      let globalAudioSamples = 0;
      const totalScenes = loadedAssets.length;

      // 2. MULTI-SCENE ENCODING LOOP
      for (let i = 0; i < totalScenes; i++) {
        if (cancelRef.current) break;

        const { img, audioBuffer, durationSec, scene } = loadedAssets[i];
        const sceneNum = i + 1;
        setStatusText(`Аппаратный рендер сцены ${sceneNum}/${totalScenes}: ${scene.title}`);

        // Fast Audio Encoding
        const left = audioBuffer.getChannelData(0);
        const right = audioBuffer.numberOfChannels > 1 ? audioBuffer.getChannelData(1) : left;
        const AAC_CHUNK = 1024;
        let audioOffset = 0;

        while (audioOffset < audioBuffer.length) {
          const chunkSize = Math.min(AAC_CHUNK, audioBuffer.length - audioOffset);
          const planarBuffer = new Float32Array(chunkSize * 2);
          planarBuffer.set(left.subarray(audioOffset, audioOffset + chunkSize), 0);
          planarBuffer.set(right.subarray(audioOffset, audioOffset + chunkSize), chunkSize);

          const timestampUs = Math.round(((globalAudioSamples + audioOffset) / AUDIO_SAMPLE_RATE) * 1_000_000);

          const audioData = new AudioData({
            format: "f32-planar",
            sampleRate: AUDIO_SAMPLE_RATE,
            numberOfFrames: chunkSize,
            numberOfChannels: 2,
            timestamp: timestampUs,
            data: planarBuffer,
          });

          audioEncoder.encode(audioData);
          audioData.close();

          audioOffset += chunkSize;

          if (audioEncoder.encodeQueueSize > 50) {
            await new Promise((r) => setTimeout(r, 0));
          }
        }
        globalAudioSamples += audioBuffer.length;

        // Субтитры: список реплик с таймкодами считается ОДИН раз на сцену.
        // Раньше getActiveSentence() звался на каждый кодируемый кадр, то есть
        // 30 x длительность раз прогонял три регулярки.
        ctx.font = layout.fontCss;
        const measure = (str: string) => ctx.measureText(str).width;
        const cues = scene.narration ? buildCues(scene.narration, durationSec) : [];
        const cueBoxes = cues.map((cue) => {
          const lines = wrapLines(cue.text, layout.maxTextW, measure);
          const widest = lines.reduce((max, line) => Math.max(max, measure(line)), 0);
          const cardW = Math.min(layout.maxCardW, widest + layout.padX * 2);
          const cardH = lines.length * layout.lineHeight + layout.padY * 2;
          return {
            lines,
            cardW,
            cardH,
            cardX: (WIDTH - cardW) / 2,
            cardY: HEIGHT - layout.bottom - cardH,
          };
        });

        const totalFrames = Math.max(1, Math.round(durationSec * FPS));

        for (let frame = 0; frame < totalFrames; frame++) {
          if (cancelRef.current) break;

          const progress = frame / totalFrames;
          const elapsedSec = progress * durationSec;
          const zoomScale = 1 + progress * 0.05;

          // Frame Drawing
          // ВНИМАНИЕ: цвета ниже запекаются в MP4 и НЕ должны зависеть от темы.
          // Не заменять на токены — иначе в светлой теме в файл попадут белые поля.
          ctx.fillStyle = "#0A0B0E";
          ctx.fillRect(0, 0, WIDTH, HEIGHT);

          if (img.complete && img.naturalWidth > 0) {
            // Вписывание по короткой стороне (cover), а не растяжение под холст:
            // gpt-image-1-mini отдаёт 3:2 / 2:3, поэтому растяжение исказило бы кадр.
            // DOM в превью уже делает object-cover — приводим холст к нему.
            const cover = Math.max(WIDTH / img.naturalWidth, HEIGHT / img.naturalHeight);
            const scale = cover * zoomScale;
            const dw = img.naturalWidth * scale;
            const dh = img.naturalHeight * scale;
            ctx.drawImage(img, (WIDTH - dw) / 2, (HEIGHT - dh) / 2, dw, dh);
          }

          // Нижняя шторка — те же пропорции, что и в превью
          const gradient = ctx.createLinearGradient(0, HEIGHT - layout.scrimH, 0, HEIGHT);
          gradient.addColorStop(0, "rgba(0, 0, 0, 0)");
          gradient.addColorStop(1, "rgba(0, 0, 0, 0.72)");
          ctx.fillStyle = gradient;
          ctx.fillRect(0, HEIGHT - layout.scrimH, WIDTH, layout.scrimH);

          // Субтитры: одна реплика за раз, позиция и кегль пропорциональны кадру
          const activeCue = cueIndexAt(cues, elapsedSec);
          const box = activeCue >= 0 ? cueBoxes[activeCue] : null;

          if (box && box.lines.length > 0) {
            ctx.save();
            // Подложка запекается в файл и тему не наследует — только литералы.
            // Обводки нет намеренно: 1.5px stroke по roundRect давал рваные
            // скругления, а залитый roundRect сглаживается чисто.
            ctx.fillStyle = SUBTITLE_BG;
            ctx.beginPath();
            if ((ctx as any).roundRect) {
              (ctx as any).roundRect(box.cardX, box.cardY, box.cardW, box.cardH, layout.radius);
            } else {
              ctx.rect(box.cardX, box.cardY, box.cardW, box.cardH);
            }
            ctx.fill();

            ctx.font = layout.fontCss;
            ctx.fillStyle = SUBTITLE_FG;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.shadowColor = SUBTITLE_SHADOW;
            ctx.shadowBlur = layout.shadowBlur;
            ctx.shadowOffsetY = layout.shadowOffsetY;

            for (let lIdx = 0; lIdx < box.lines.length; lIdx++) {
              const baselineY = box.cardY + layout.padY + layout.lineHeight * (lIdx + 0.5);
              ctx.fillText(box.lines[lIdx], WIDTH / 2, baselineY);
            }
            ctx.restore();
          }

          // Hardware Frame Encode
          const timestampUs = Math.round(globalVideoFrames * (1_000_000 / FPS));
          const isKeyFrame = globalVideoFrames % (FPS * 2) === 0;

          const videoFrame = new VideoFrame(canvas, { timestamp: timestampUs });
          videoEncoder.encode(videoFrame, { keyFrame: isKeyFrame });
          videoFrame.close();

          globalVideoFrames++;

          if (videoEncoder.encodeQueueSize > 60) {
            await new Promise((r) => setTimeout(r, 0));
          }

          if (frame % 60 === 0) {
            const overallPct = Math.min(98, Math.round(((i + frame / totalFrames) / totalScenes) * 100));
            setProgressPercent(overallPct);
            await new Promise((r) => setTimeout(r, 0));
          }
        }
      }

      if (cancelRef.current) {
        videoEncoder.close();
        audioEncoder.close();
        return;
      }

      if (videoEncoderError) throw new Error("Ошибка видеокодировщика: " + videoEncoderError.message);
      if (audioEncoderError) throw new Error("Ошибка аудиокодировщика: " + audioEncoderError.message);

      setStatusText("Финализация контейнера MP4 (moov-атом)...");
      setProgressPercent(99);

      await videoEncoder.flush();
      await audioEncoder.flush();
      videoEncoder.close();
      audioEncoder.close();

      muxer.finalize();

      const buffer = target.buffer;
      const mp4Blob = new Blob([buffer], { type: "video/mp4" });
      const url = URL.createObjectURL(mp4Blob);
      setDownloadUrl(url);
      setFileSizeMb((mp4Blob.size / (1024 * 1024)).toFixed(1));
      setStatus("finished");
      setStatusText("Чистый MP4 готов к загрузке!");
    } catch (err: any) {
      console.error("Export Error:", err);
      setStatus("error");
      setStatusText(err.message || "Ошибка при экспорте видео");
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 animate-fade-in select-none">
      <div className="bg-stage border border-white/10 rounded-2xl p-6 max-w-md w-full space-y-5 shadow-2xl relative">
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-accent/10 border border-accent/30 text-accent flex items-center justify-center">
              <FilmStrip size={18} weight="bold" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm text-white tracking-tight">Экспорт видео в MP4</h3>
              <p className="text-[11px] text-zinc-400">{WIDTH}×{HEIGHT} ({orientationLabel(frameOrientation)}) @ 30 FPS • Субтитры по одному предложению</p>
            </div>
          </div>
          <button
            onClick={() => {
              cancelRef.current = true;
              onClose();
            }}
            className="p-1.5 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white transition-colors cursor-pointer"
          >
            <X size={18} weight="bold" />
          </button>
        </div>

        {status === "idle" && (
          <div className="space-y-4">
            <div className="p-3.5 rounded-xl bg-white/[0.06] border border-white/10 space-y-2 text-xs">
              <div className="flex items-center justify-between text-zinc-400">
                <span>Фильм:</span>
                <span className="font-bold text-white truncate max-w-[200px]">{title}</span>
              </div>
              <div className="flex items-center justify-between text-zinc-400">
                <span>Кадров:</span>
                <span className="font-bold text-accent">{scenes.length} сцен</span>
              </div>
              <div className="flex items-center justify-between text-zinc-400">
                <span>Субтитры:</span>
                <span className="font-bold text-white">70% ширины, по предложению</span>
              </div>
              <div className="flex items-center justify-between text-zinc-400">
                <span>Ускорение:</span>
                <span className="font-bold text-accent flex items-center gap-1">
                  <Lightning size={14} weight="fill" /> Hardware WebCodecs
                </span>
              </div>
            </div>

            <button
              onClick={startExport}
              className="w-full py-3.5 rounded-xl bg-accent hover:bg-accent-hover active:scale-[0.99] text-accent-ink font-black text-sm shadow-xl transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <Lightning size={18} weight="fill" />
              <span>Запустить экспорт MP4</span>
            </button>
          </div>
        )}

        {status === "rendering" && (
          <div className="space-y-4 py-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-zinc-200 flex items-center gap-2">
                <CircleNotch size={16} weight="bold" className="animate-spin text-accent" />
                <span className="truncate max-w-[240px]">{statusText}</span>
              </span>
              <span className="font-mono font-bold text-sm text-accent">{progressPercent}%</span>
            </div>

            <div className="w-full h-2 rounded-full bg-zinc-900 overflow-hidden border border-white/10">
              <div
                className="h-full bg-accent transition-all duration-200 rounded-full"
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            <p className="text-[11px] text-zinc-400 text-center">
              Аппаратная сборка на GPU: {WIDTH}×{HEIGHT} ({orientationLabel(frameOrientation)}) @ 30 FPS
            </p>
          </div>
        )}

        {status === "finished" && downloadUrl && (
          <div className="space-y-4 py-2 text-center">
            <div className="w-12 h-12 rounded-full bg-accent/15 border border-accent/30 text-accent flex items-center justify-center mx-auto shadow-lg">
              <CheckCircle size={26} weight="bold" />
            </div>

            <div className="space-y-1">
              <h4 className="font-bold text-base text-white">Видео успешно собрано!</h4>
              <p className="text-xs text-zinc-400">
                Размер файла: <span className="font-bold text-white">{fileSizeMb} МБ</span>
              </p>
            </div>

            <a
              href={downloadUrl}
              download={`${title.replace(/[^a-zA-Z0-9а-яА-ЯёЁ_-]/g, "_")}_${orientationLabel(frameOrientation).replace(":", "x")}.mp4`}
              className="w-full py-3.5 rounded-xl bg-accent hover:bg-accent-hover active:scale-[0.99] text-accent-ink font-black text-sm shadow-xl transition-all flex items-center justify-center gap-2 cursor-pointer block"
            >
              <DownloadSimple size={18} weight="bold" />
              <span>Скачать файл MP4</span>
            </a>
          </div>
        )}

        {status === "error" && (
          <div className="space-y-4 py-2">
            <div className="p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2.5">
              <WarningCircle size={18} weight="bold" className="shrink-0 mt-0.5 text-rose-400" />
              <span>{statusText}</span>
            </div>
            <button
              onClick={startExport}
              className="w-full py-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-xs transition-colors cursor-pointer"
            >
              Повторить экспорт
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
