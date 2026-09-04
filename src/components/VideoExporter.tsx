"use client";

import React, { useState, useRef } from "react";
import { Download, X, Film, CheckCircle2, AlertCircle, Loader2, Sparkles, Sliders } from "lucide-react";
import { Scene } from "@/lib/types";
import fixWebmDuration from "fix-webm-duration";

interface VideoExporterProps {
  title: string;
  scenes: Scene[];
  onClose: () => void;
}

export const VideoExporter: React.FC<VideoExporterProps> = ({ title, scenes, onClose }) => {
  const [status, setStatus] = useState<"idle" | "rendering" | "finished" | "error">("idle");
  const [progressPercent, setProgressPercent] = useState(0);
  const [statusText, setStatusText] = useState("");
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [fileSizeMb, setFileSizeMb] = useState<string | null>(null);

  const cancelRef = useRef(false);

  // Full HD 1080p, 40 FPS settings
  const WIDTH = 1920;
  const HEIGHT = 1080;
  const FPS = 40;

  const startExport = async () => {
    try {
      setStatus("rendering");
      cancelRef.current = false;
      setProgressPercent(0);
      setStatusText("Инициализация Full HD холста (1920x1080 @ 40 FPS)...");

      const canvas = document.createElement("canvas");
      canvas.width = WIDTH;
      canvas.height = HEIGHT;
      const ctx = canvas.getContext("2d", { alpha: false });
      if (!ctx) throw new Error("Не удалось инициализировать 2D контекст");

      // Audio setup using Web Audio API
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioContextClass();
      const audioDest = audioCtx.createMediaStreamDestination();

      const canvasStream = canvas.captureStream(FPS);
      const combinedStream = new MediaStream([
        ...canvasStream.getVideoTracks(),
        ...audioDest.stream.getAudioTracks(),
      ]);

      let mimeType = "video/webm;codecs=vp9,opus";
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = "video/webm;codecs=vp8,opus";
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = "video/webm";
        }
      }

      const recorder = new MediaRecorder(combinedStream, {
        mimeType,
        videoBitsPerSecond: 10000000, // 10 Mbps crisp Full HD quality
        audioBitsPerSecond: 192000,   // 192 kbps audio
      });

      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };

      let totalDurationSeconds = 0;

      recorder.onstop = () => {
        setStatusText("Финализация и запись индексных меток (cue points) для плавной перемотки...");
        const rawBlob = new Blob(chunks, { type: mimeType });
        const durationMs = Math.max(1000, Math.round(totalDurationSeconds * 1000));

        // Fix missing cues and duration so video can be seeked and scrubbed across timeline!
        try {
          fixWebmDuration(rawBlob, durationMs, (fixedBlob: Blob) => {
            const url = URL.createObjectURL(fixedBlob);
            setDownloadUrl(url);
            setFileSizeMb((fixedBlob.size / (1024 * 1024)).toFixed(1));
            setStatus("finished");
            setStatusText("Видео успешно скомпилировано в Full HD с поддержкой перемотки!");
          });
        } catch (fixErr) {
          console.warn("Duration patch fallback:", fixErr);
          const url = URL.createObjectURL(rawBlob);
          setDownloadUrl(url);
          setFileSizeMb((rawBlob.size / (1024 * 1024)).toFixed(1));
          setStatus("finished");
        }
      };

      recorder.start(500);

      // Sequentially render every scene
      for (let i = 0; i < scenes.length; i++) {
        if (cancelRef.current) {
          recorder.stop();
          return;
        }

        const scene = scenes[i];
        const sceneNum = i + 1;
        setStatusText(`Обработка кадра ${sceneNum} из ${scenes.length}: ${scene.title}`);
        setProgressPercent(Math.round((i / scenes.length) * 100));

        // 1. Preload scene image with CORS support
        const img = new Image();
        img.crossOrigin = "anonymous";
        await new Promise((resolve) => {
          img.onload = resolve;
          img.onerror = resolve;
          img.src = scene.imageUrl || "";
        });

        // 2. Decode and play audio buffer into stream
        let audioBuffer: AudioBuffer | null = null;
        let durationSec = scene.durationEstimate || 17;

        if (scene.audioUrl) {
          try {
            const audioRes = await fetch(scene.audioUrl);
            const arrayBuf = await audioRes.arrayBuffer();
            audioBuffer = await audioCtx.decodeAudioData(arrayBuf);
            durationSec = audioBuffer.duration;
          } catch (err) {
            console.warn("Audio load error for scene", sceneNum, err);
          }
        }

        totalDurationSeconds += durationSec;

        // Play audio into recorder destination
        if (audioBuffer) {
          const source = audioCtx.createBufferSource();
          source.buffer = audioBuffer;
          source.connect(audioDest);
          source.start();
        }

        // Render scene frames at 40 FPS with Ken Burns pan and zoom
        const totalFrames = Math.floor(durationSec * FPS);
        const frameIntervalMs = 1000 / FPS;
        const sceneStartTime = Date.now();

        for (let frame = 0; frame < totalFrames; frame++) {
          if (cancelRef.current) break;

          const progress = frame / totalFrames;
          const zoomScale = 1 + progress * 0.08;

          // Background canvas fill
          ctx.fillStyle = "#141218";
          ctx.fillRect(0, 0, WIDTH, HEIGHT);

          // Render image if loaded
          if (img.complete && img.naturalWidth > 0) {
            ctx.save();
            ctx.translate(WIDTH / 2, HEIGHT / 2);
            ctx.scale(zoomScale, zoomScale);
            ctx.drawImage(img, -WIDTH / 2, -HEIGHT / 2, WIDTH, HEIGHT);
            ctx.restore();
          }

          // Dark cinematic gradient for subtitles
          const gradient = ctx.createLinearGradient(0, HEIGHT - 320, 0, HEIGHT);
          gradient.addColorStop(0, "rgba(20, 18, 24, 0)");
          gradient.addColorStop(1, "rgba(20, 18, 24, 0.92)");
          ctx.fillStyle = gradient;
          ctx.fillRect(0, HEIGHT - 320, WIDTH, 320);

          // Render Subtitles in High-Resolution Google Sans style
          if (scene.narration) {
            ctx.font = "bold 34px -apple-system, BlinkMacSystemFont, 'Google Sans', sans-serif";
            ctx.fillStyle = "#FFFFFF";
            ctx.textAlign = "center";
            ctx.shadowColor = "rgba(0, 0, 0, 0.9)";
            ctx.shadowBlur = 10;

            const words = scene.narration.split(" ");
            let line = "";
            let y = HEIGHT - 110;
            const maxLineWidth = WIDTH - 280;

            for (const word of words) {
              const testLine = line + word + " ";
              if (ctx.measureText(testLine).width > maxLineWidth) {
                ctx.fillText(line, WIDTH / 2, y);
                line = word + " ";
                y += 46;
              } else {
                line = testLine;
              }
            }
            ctx.fillText(line, WIDTH / 2, y);
          }

          // Maintain strict frame timing
          const elapsed = Date.now() - sceneStartTime;
          const expected = (frame + 1) * frameIntervalMs;
          const delay = Math.max(0, expected - elapsed);
          if (delay > 0) {
            await new Promise((r) => setTimeout(r, delay));
          }
        }
      }

      setProgressPercent(100);
      recorder.stop();
    } catch (err: any) {
      console.error("Export Error:", err);
      setStatus("error");
      setStatusText(err.message || "Ошибка при сборке видео");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md select-none">
      {/* Material 3 Dialog Card */}
      <div className="bg-[#211F26] max-w-lg w-full rounded-3xl p-6 sm:p-8 border border-[#49454F]/40 shadow-2xl relative">
        <button
          onClick={() => {
            cancelRef.current = true;
            onClose();
          }}
          className="absolute top-5 right-5 p-2 rounded-full hover:bg-[#36343B] text-[#938F99] hover:text-[#E6E0E9] transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3.5 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-[#4F378B] text-[#D0BCFF] flex items-center justify-center">
            <Film className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-[#E6E0E9]">Экспорт видеоистории</h3>
            <p className="text-xs text-[#938F99] mt-0.5 truncate max-w-sm">{title}</p>
          </div>
        </div>

        {/* Specifications Chip Card */}
        <div className="p-4 rounded-2xl bg-[#2B2930] border border-[#49454F]/30 space-y-2 mb-6 text-xs text-[#CAC4D0]">
          <div className="flex items-center justify-between font-medium">
            <span className="text-[#E6E0E9] flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-[#D0BCFF]" />
              Параметры видеоролика:
            </span>
            <span className="px-2 py-0.5 rounded-full bg-[#4F378B] text-[#EADDFF] font-mono text-[11px]">
              Full HD @ 40 FPS
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 pt-1 text-[11px] text-[#938F99]">
            <div>• Разрешение: <strong className="text-[#E6E0E9]">1920 × 1080</strong></div>
            <div>• Частота кадров: <strong className="text-[#E6E0E9]">40 FPS</strong></div>
            <div>• Кадров в истории: <strong className="text-[#E6E0E9]">{scenes.length}</strong></div>
            <div>• Перемотка по таймлайну: <strong className="text-[#E6E0E9]">Включена</strong></div>
          </div>
        </div>

        {/* Progress Display */}
        {status === "rendering" && (
          <div className="space-y-3 p-4 rounded-2xl bg-[#2B2930] border border-[#D0BCFF]/30 mb-6">
            <div className="flex items-center justify-between text-xs text-[#E6E0E9]">
              <span className="flex items-center gap-2 font-medium">
                <Loader2 className="w-4 h-4 animate-spin text-[#D0BCFF]" />
                <span>Сборка 1080p видеопотока...</span>
              </span>
              <span className="font-mono font-bold text-[#D0BCFF]">{progressPercent}%</span>
            </div>
            {/* M3 Linear Progress Indicator */}
            <div className="w-full h-2 rounded-full bg-[#36343B] overflow-hidden">
              <div
                className="h-full bg-[#D0BCFF] transition-all duration-300 rounded-full"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <p className="text-[11px] text-[#938F99] truncate">{statusText}</p>
          </div>
        )}

        {/* Finished / Ready for Download */}
        {status === "finished" && downloadUrl && (
          <div className="space-y-4 p-5 rounded-2xl bg-[#1D1B20] border border-[#D0BCFF]/40 text-center mb-6">
            <div className="flex items-center justify-center gap-2 text-[#D0BCFF] font-semibold text-sm">
              <CheckCircle2 className="w-5 h-5" />
              <span>Full HD видео готово к скачиванию!</span>
            </div>
            <p className="text-xs text-[#938F99]">
              Размер файла: ~{fileSizeMb} МБ. Файл можно свободно открывать в любых плеерах и перематывать по таймлайну.
            </p>
            <a
              href={downloadUrl}
              download={`${title.replace(/[^a-zA-Z0-9а-яА-Я]/g, "_")}_1080p.webm`}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-[#D0BCFF] text-[#381E72] font-semibold text-sm shadow-md hover:opacity-90 transition-all"
            >
              <Download className="w-4 h-4" />
              <span>Сохранить файл ({fileSizeMb} МБ)</span>
            </a>
          </div>
        )}

        {/* Error */}
        {status === "error" && (
          <div className="p-4 rounded-2xl bg-[#8C1D18]/30 border border-[#F2B8B5]/30 text-xs text-[#F2B8B5] flex items-start gap-2.5 mb-6">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{statusText}</span>
          </div>
        )}

        {/* Idle action button */}
        {status === "idle" && (
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 py-3 rounded-full bg-[#2B2930] hover:bg-[#36343B] text-[#CAC4D0] font-medium text-xs transition-colors"
            >
              Отмена
            </button>
            <button
              onClick={startExport}
              className="flex-1 py-3 rounded-full bg-[#D0BCFF] text-[#381E72] font-semibold text-xs shadow-md hover:opacity-90 transition-all flex items-center justify-center gap-2"
            >
              <Film className="w-4 h-4" />
              <span>Начать экспорт (1080p, 40 FPS)</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
