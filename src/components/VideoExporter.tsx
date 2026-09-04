"use client";

import React, { useState, useRef } from "react";
import { Download, X, Film, CheckCircle2, AlertCircle, Play, Terminal, Loader2 } from "lucide-react";
import { Scene } from "@/lib/types";

interface VideoExporterProps {
  title: string;
  scenes: Scene[];
  onClose: () => void;
}

export const VideoExporter: React.FC<VideoExporterProps> = ({ title, scenes, onClose }) => {
  const [activeTab, setActiveTab] = useState<"browser" | "docker">("browser");
  const [status, setStatus] = useState<"idle" | "recording" | "finished" | "error">("idle");
  const [progressPercent, setProgressPercent] = useState(0);
  const [statusText, setStatusText] = useState("");
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  const cancelRef = useRef(false);

  // Browser-based client-side recording
  const startBrowserExport = async () => {
    try {
      setStatus("recording");
      cancelRef.current = false;
      setProgressPercent(0);
      setStatusText("Подготовка холста и звуковой дорожки...");

      const canvas = document.createElement("canvas");
      canvas.width = 1280;
      canvas.height = 720;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Не удалось создать 2D контекст");

      // Audio setup
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const dest = audioCtx.createMediaStreamDestination();

      const canvasStream = canvas.captureStream(30);
      const combinedStream = new MediaStream([
        ...canvasStream.getVideoTracks(),
        ...dest.stream.getAudioTracks(),
      ]);

      let mimeType = "video/webm;codecs=vp9,opus";
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = "video/webm";
      }

      const recorder = new MediaRecorder(combinedStream, {
        mimeType,
        videoBitsPerSecond: 3500000,
      });

      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: mimeType });
        const url = URL.createObjectURL(blob);
        setDownloadUrl(url);
        setStatus("finished");
        setStatusText("Видео успешно скомпилировано!");
      };

      recorder.start(1000);

      // Sequentially process each scene
      for (let i = 0; i < scenes.length; i++) {
        if (cancelRef.current) {
          recorder.stop();
          return;
        }

        const scene = scenes[i];
        const sceneNum = i + 1;
        setStatusText(`Обработка сцены ${sceneNum} из ${scenes.length}: ${scene.title}`);
        setProgressPercent(Math.round((i / scenes.length) * 100));

        // 1. Load image
        const img = new Image();
        img.crossOrigin = "anonymous";
        await new Promise((resolve) => {
          img.onload = resolve;
          img.onerror = resolve; // Continue even if one image fails
          img.src = scene.imageUrl || "";
        });

        // 2. Load audio buffer if available
        let audioBuffer: AudioBuffer | null = null;
        let durationSec = scene.durationEstimate || 20;

        if (scene.audioUrl) {
          try {
            const res = await fetch(scene.audioUrl);
            const arrayBuf = await res.arrayBuffer();
            audioBuffer = await audioCtx.decodeAudioData(arrayBuf);
            durationSec = audioBuffer.duration;
          } catch (err) {
            console.warn("Audio load error for scene", sceneNum, err);
          }
        }

        // Play audio buffer into destination
        if (audioBuffer) {
          const source = audioCtx.createBufferSource();
          source.buffer = audioBuffer;
          source.connect(dest);
          source.start();
        }

        // Render scene frames with Ken Burns pan/zoom
        const fps = 30;
        const totalFrames = Math.floor(durationSec * fps);
        const startTime = Date.now();

        for (let frame = 0; frame < totalFrames; frame++) {
          if (cancelRef.current) break;

          const progress = frame / totalFrames;
          const scale = 1 + progress * 0.08;

          ctx.fillStyle = "#000";
          ctx.fillRect(0, 0, canvas.width, canvas.height);

          if (img.complete && img.naturalWidth > 0) {
            ctx.save();
            ctx.translate(canvas.width / 2, canvas.height / 2);
            ctx.scale(scale, scale);
            ctx.drawImage(img, -canvas.width / 2, -canvas.height / 2, canvas.width, canvas.height);
            ctx.restore();
          }

          // Dark vignette overlay
          const gradient = ctx.createLinearGradient(0, canvas.height - 200, 0, canvas.height);
          gradient.addColorStop(0, "rgba(0,0,0,0)");
          gradient.addColorStop(1, "rgba(0,0,0,0.85)");
          ctx.fillStyle = gradient;
          ctx.fillRect(0, canvas.height - 200, canvas.width, 200);

          // Render subtitle
          ctx.font = "bold 24px -apple-system, sans-serif";
          ctx.fillStyle = "#ffffff";
          ctx.textAlign = "center";
          ctx.shadowColor = "rgba(0,0,0,0.8)";
          ctx.shadowBlur = 8;

          // Wrap subtitle text
          const words = scene.narration.split(" ");
          let line = "";
          let y = canvas.height - 70;
          for (const word of words) {
            const testLine = line + word + " ";
            if (ctx.measureText(testLine).width > canvas.width - 160) {
              ctx.fillText(line, canvas.width / 2, y);
              line = word + " ";
              y += 32;
            } else {
              line = testLine;
            }
          }
          ctx.fillText(line, canvas.width / 2, y);

          // Maintain proper timing interval
          const elapsed = Date.now() - startTime;
          const expected = (frame / fps) * 1000;
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="glass-panel-glow max-w-xl w-full rounded-2xl p-6 sm:p-8 border border-white/10 shadow-2xl relative">
        <button
          onClick={() => {
            cancelRef.current = true;
            onClose();
          }}
          className="absolute top-4 right-4 p-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <Download className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-white">Экспорт видеоролика</h3>
            <p className="text-xs text-slate-400 mt-0.5">{title}</p>
          </div>
        </div>

        {/* Tab switcher */}
        <div className="flex rounded-xl bg-white/5 p-1 mb-6 border border-white/10 text-xs">
          <button
            onClick={() => setActiveTab("browser")}
            className={`flex-1 py-2 rounded-lg font-medium transition-all ${
              activeTab === "browser"
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                : "text-slate-400 hover:text-white"
            }`}
          >
            Браузерный экспорт (Без сервера)
          </button>
          <button
            onClick={() => setActiveTab("docker")}
            className={`flex-1 py-2 rounded-lg font-medium transition-all ${
              activeTab === "docker"
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                : "text-slate-400 hover:text-white"
            }`}
          >
            Docker / FFmpeg (1080p MP4)
          </button>
        </div>

        {activeTab === "browser" ? (
          <div className="space-y-6">
            <p className="text-xs text-slate-300 leading-relaxed">
              Браузер скомпилирует все <strong>{scenes.length} сцен</strong>, картинки и озвучку в единый видеофайл с субтитрами прямо на вашем устройстве.
            </p>

            {status === "recording" && (
              <div className="space-y-3 p-4 rounded-xl bg-indigo-500/10 border border-indigo-500/20">
                <div className="flex items-center justify-between text-xs text-indigo-200">
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
                    <span>Сборка видеопотока...</span>
                  </span>
                  <span className="font-mono font-bold">{progressPercent}%</span>
                </div>
                <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-indigo-500 to-pink-500 transition-all duration-300"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <p className="text-[11px] text-slate-400 truncate">{statusText}</p>
              </div>
            )}

            {status === "finished" && downloadUrl && (
              <div className="space-y-4 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-center">
                <div className="flex items-center justify-center gap-2 text-emerald-400 font-semibold text-sm">
                  <CheckCircle2 className="w-5 h-5" />
                  <span>Видео готово к загрузке!</span>
                </div>
                <a
                  href={downloadUrl}
                  download={`${title.replace(/[^a-zA-Z0-9а-яА-Я]/g, "_")}_8min.webm`}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-sm transition-all shadow-lg shadow-emerald-600/30"
                >
                  <Download className="w-4 h-4" />
                  <span>Сохранить файл на диск</span>
                </a>
              </div>
            )}

            {status === "error" && (
              <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span>{statusText}</span>
              </div>
            )}

            {status === "idle" && (
              <button
                onClick={startBrowserExport}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 hover:from-indigo-500 hover:to-pink-500 text-white font-medium text-sm transition-all shadow-lg shadow-indigo-500/25 flex items-center justify-center gap-2"
              >
                <Film className="w-4 h-4" />
                <span>Начать сборку и скачивание</span>
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-xs text-slate-300 leading-relaxed">
              Если вам нужен сырой файл <strong>1080p MP4 (H.264 / AAC)</strong> максимального качества, вы можете собрать его локально через ваш <strong>Docker Desktop</strong> в 1 команду:
            </p>

            <div className="rounded-xl bg-black/60 p-4 border border-white/10 font-mono text-xs text-emerald-400 space-y-2 overflow-x-auto">
              <div className="text-slate-500"># 1. Запустить локальный рендерер через Docker</div>
              <div>docker compose -f docker/docker-compose.yml up</div>
            </div>

            <div className="p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-xs text-slate-300">
              Все файлы Docker и FFmpeg уже настроены в репозитории проекта в папке <code className="text-indigo-300">/docker</code>.
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
