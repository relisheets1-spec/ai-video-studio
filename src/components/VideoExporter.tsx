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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm select-none">
      <div className="bg-[#121215] max-w-md w-full rounded-2xl p-6 border border-white/10 shadow-2xl relative">
        <button
          onClick={() => {
            cancelRef.current = true;
            onClose();
          }}
          className="absolute top-4 right-4 p-2 text-zinc-400 hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-zinc-800 text-white flex items-center justify-center">
            <Film className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-white">Экспорт в Full HD</h3>
            <p className="text-xs text-zinc-400 mt-0.5 truncate max-w-xs">{title}</p>
          </div>
        </div>

        {/* Minimal Specs */}
        <div className="p-3.5 rounded-xl bg-zinc-900 border border-white/5 space-y-1.5 mb-5 text-xs text-zinc-300">
          <div className="flex justify-between">
            <span className="text-zinc-400">Формат:</span>
            <span className="font-medium text-white">1920 × 1080 (Full HD)</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-400">Частота кадров:</span>
            <span className="font-medium text-white">45 FPS</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-400">Кадров в ролике:</span>
            <span className="font-medium text-white">{scenes.length}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-400">Перемотка по таймлайну:</span>
            <span className="font-medium text-emerald-400">Поддерживается</span>
          </div>
        </div>

        {/* Progress */}
        {status === "rendering" && (
          <div className="space-y-3 p-4 rounded-xl bg-zinc-900 border border-white/10 mb-5">
            <div className="flex items-center justify-between text-xs text-white">
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />
                <span>Сборка 1080p видео...</span>
              </span>
              <span className="font-mono font-bold">{progressPercent}%</span>
            </div>
            <div className="w-full h-2 rounded-full bg-zinc-800 overflow-hidden">
              <div
                className="h-full bg-white transition-all duration-300 rounded-full"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <p className="text-[11px] text-zinc-400 truncate">{statusText}</p>
          </div>
        )}

        {/* Finished */}
        {status === "finished" && downloadUrl && (
          <div className="space-y-4 p-4 rounded-xl bg-zinc-900 border border-white/10 text-center mb-5">
            <div className="flex items-center justify-center gap-2 text-white font-medium text-xs">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>Full HD видео готово к скачиванию!</span>
            </div>
            <a
              href={downloadUrl}
              download={`${title.replace(/[^a-zA-Z0-9а-яА-Я]/g, "_")}_1080p_45fps.webm`}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white text-black font-semibold text-xs hover:bg-zinc-200 transition-all"
            >
              <Download className="w-4 h-4" />
              <span>Скачать файл ({fileSizeMb} МБ)</span>
            </a>
          </div>
        )}

        {/* Error */}
        {status === "error" && (
          <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300 flex items-start gap-2 mb-5">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{statusText}</span>
          </div>
        )}

        {/* Action */}
        {status === "idle" && (
          <div className="flex gap-2.5">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium transition-colors"
            >
              Отмена
            </button>
            <button
              onClick={startExport}
              className="flex-1 py-2.5 rounded-xl bg-white text-black hover:bg-zinc-200 font-semibold text-xs transition-all flex items-center justify-center gap-2"
            >
              <Film className="w-4 h-4" />
              <span>Экспорт 1080p (45 FPS)</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
