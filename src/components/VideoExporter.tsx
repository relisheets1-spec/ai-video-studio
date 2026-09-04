"use client";

import React, { useState, useRef } from "react";
import { Download, X, Film, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
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

  // Full HD 1080p, 45 FPS
  const WIDTH = 1920;
  const HEIGHT = 1080;
  const FPS = 45;

  const startExport = async () => {
    try {
      setStatus("rendering");
      cancelRef.current = false;
      setProgressPercent(0);
      setStatusText("Подготовка Full HD холста (1920x1080 @ 45 FPS)...");

      const canvas = document.createElement("canvas");
      canvas.width = WIDTH;
      canvas.height = HEIGHT;
      const ctx = canvas.getContext("2d", { alpha: false });
      if (!ctx) throw new Error("Не удалось создать 2D контекст");

      // Web Audio API destination
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
        videoBitsPerSecond: 10000000, // 10 Mbps for crisp Full HD quality
        audioBitsPerSecond: 192000,
      });

      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };

      let totalDurationSeconds = 0;

      recorder.onstop = () => {
        setStatusText("Запись индексных меток (cue points) для плавной перемотки...");
        const rawBlob = new Blob(chunks, { type: mimeType });
        const durationMs = Math.max(1000, Math.round(totalDurationSeconds * 1000));

        // Fix timeline seeking with exact cue points and duration
        try {
          fixWebmDuration(rawBlob, durationMs, (fixedBlob: Blob) => {
            const url = URL.createObjectURL(fixedBlob);
            setDownloadUrl(url);
            setFileSizeMb((fixedBlob.size / (1024 * 1024)).toFixed(1));
            setStatus("finished");
            setStatusText("Видео Full HD скомпилировано с поддержкой перемотки!");
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
        setStatusText(`Кадр ${sceneNum} из ${scenes.length}: ${scene.title}`);
        setProgressPercent(Math.round((i / scenes.length) * 100));

        // 1. Preload image
        const img = new Image();
        img.crossOrigin = "anonymous";
        await new Promise((resolve) => {
          img.onload = resolve;
          img.onerror = resolve;
          img.src = scene.imageUrl || "";
        });

        // 2. Decode audio
        let audioBuffer: AudioBuffer | null = null;
        let durationSec = scene.durationEstimate || 17;

        if (scene.audioUrl) {
          try {
            const audioRes = await fetch(scene.audioUrl);
            const arrayBuf = await audioRes.arrayBuffer();
            audioBuffer = await audioCtx.decodeAudioData(arrayBuf);
            durationSec = audioBuffer.duration;
          } catch (err) {
            console.warn("Audio load error:", sceneNum, err);
          }
        }

        totalDurationSeconds += durationSec;

        if (audioBuffer) {
          const source = audioCtx.createBufferSource();
          source.buffer = audioBuffer;
          source.connect(audioDest);
          source.start();
        }

        // Render frames at 45 FPS
        const totalFrames = Math.floor(durationSec * FPS);
        const frameIntervalMs = 1000 / FPS;
        const sceneStartTime = Date.now();

        for (let frame = 0; frame < totalFrames; frame++) {
          if (cancelRef.current) break;

          const progress = frame / totalFrames;
          const zoomScale = 1 + progress * 0.08;

          // Black background
          ctx.fillStyle = "#09090b";
          ctx.fillRect(0, 0, WIDTH, HEIGHT);

          // Draw image
          if (img.complete && img.naturalWidth > 0) {
            ctx.save();
            ctx.translate(WIDTH / 2, HEIGHT / 2);
            ctx.scale(zoomScale, zoomScale);
            ctx.drawImage(img, -WIDTH / 2, -HEIGHT / 2, WIDTH, HEIGHT);
            ctx.restore();
          }

          // Dark vignette gradient for subtitles
          const gradient = ctx.createLinearGradient(0, HEIGHT - 330, 0, HEIGHT);
          gradient.addColorStop(0, "rgba(9, 9, 11, 0)");
          gradient.addColorStop(1, "rgba(9, 9, 11, 0.94)");
          ctx.fillStyle = gradient;
          ctx.fillRect(0, HEIGHT - 330, WIDTH, 330);

          // Subtitles (+10% increased to 39px font for crystal clear readability)
          if (scene.narration) {
            ctx.font = "bold 39px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
            ctx.fillStyle = "#FFFFFF";
            ctx.textAlign = "center";
            ctx.shadowColor = "rgba(0, 0, 0, 0.95)";
            ctx.shadowBlur = 12;

            const words = scene.narration.split(" ");
            let line = "";
            let y = HEIGHT - 110;
            const maxLineWidth = WIDTH - 260;

            for (const word of words) {
              const testLine = line + word + " ";
              if (ctx.measureText(testLine).width > maxLineWidth) {
                ctx.fillText(line, WIDTH / 2, y);
                line = word + " ";
                y += 50;
              } else {
                line = testLine;
              }
            }
            ctx.fillText(line, WIDTH / 2, y);
          }

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
      setStatusText(err.message || "Ошибка при экспорте видео");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md select-none">
      <div className="bg-zinc-950 max-w-lg w-full rounded-3xl p-7 border border-zinc-800 shadow-2xl relative">
        <button
          onClick={() => {
            cancelRef.current = true;
            onClose();
          }}
          className="absolute top-5 right-5 p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-900 transition-colors"
        >
          <X className="w-6 h-6" />
        </button>

        <div className="flex items-center gap-4 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-blue-600/20 text-blue-400 border border-blue-500/30 flex items-center justify-center shadow-lg shadow-blue-600/10">
            <Film className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-white">Экспорт в Full HD</h3>
            <p className="text-sm text-zinc-400 mt-0.5 truncate max-w-sm">{title}</p>
          </div>
        </div>

        {/* Specs Table */}
        <div className="p-5 rounded-2xl bg-zinc-900/90 border border-zinc-800/80 space-y-2.5 mb-6 text-sm text-zinc-300">
          <div className="flex justify-between items-center">
            <span className="text-zinc-400">Формат разрешения:</span>
            <span className="font-semibold text-white">1920 × 1080 (Full HD)</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-zinc-400">Частота кадров:</span>
            <span className="font-semibold text-white">45 FPS</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-zinc-400">Кадров в ролике:</span>
            <span className="font-semibold text-white">{scenes.length} кадров</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-zinc-400">Перемотка по таймлайну:</span>
            <span className="font-bold text-emerald-400">Поддерживается (Cue points)</span>
          </div>
        </div>

        {/* Progress */}
        {status === "rendering" && (
          <div className="space-y-3.5 p-5 rounded-2xl bg-zinc-900 border border-zinc-800 mb-6">
            <div className="flex items-center justify-between text-sm text-white">
              <span className="flex items-center gap-2.5 font-medium">
                <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
                <span>Сборка 1080p видео...</span>
              </span>
              <span className="font-mono font-extrabold text-blue-400 text-base">{progressPercent}%</span>
            </div>
            <div className="w-full h-3 rounded-full bg-zinc-800 overflow-hidden">
              <div
                className="h-full bg-blue-600 rounded-full transition-all duration-300 shadow-sm shadow-blue-500/50"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <p className="text-xs sm:text-sm text-zinc-400 truncate">{statusText}</p>
          </div>
        )}

        {/* Finished */}
        {status === "finished" && downloadUrl && (
          <div className="space-y-4 p-6 rounded-2xl bg-zinc-900 border border-emerald-500/30 text-center mb-6">
            <div className="flex items-center justify-center gap-2.5 text-white font-bold text-base">
              <CheckCircle2 className="w-6 h-6 text-emerald-400" />
              <span>Full HD видео успешно скомпилировано!</span>
            </div>
            <a
              href={downloadUrl}
              download={`${title.replace(/[^a-zA-Z0-9а-яА-Я]/g, "_")}_1080p_45fps.webm`}
              className="inline-flex items-center gap-2.5 px-6 py-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-base shadow-xl shadow-blue-600/30 hover:scale-[1.02] active:scale-[0.98] transition-all"
            >
              <Download className="w-5 h-5" />
              <span>Скачать файл ({fileSizeMb} МБ)</span>
            </a>
          </div>
        )}

        {/* Error */}
        {status === "error" && (
          <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-sm text-rose-300 flex items-start gap-2.5 mb-6">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-rose-400" />
            <span className="font-medium">{statusText}</span>
          </div>
        )}

        {/* Action */}
        {status === "idle" && (
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 py-3.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm font-semibold transition-colors"
            >
              Отмена
            </button>
            <button
              onClick={startExport}
              className="flex-1 py-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-base shadow-lg shadow-blue-600/30 flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-[0.98] transition-all"
            >
              <Film className="w-5 h-5" />
              <span>Экспорт 1080p (45 FPS)</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
