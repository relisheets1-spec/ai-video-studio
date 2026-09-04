"use client";

import React, { useState, useRef } from "react";
import { Download, X, Film, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { Scene } from "@/lib/types";
import { Muxer, ArrayBufferTarget } from "mp4-muxer";

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
  const AUDIO_SAMPLE_RATE = 44100;

  const startExport = async () => {
    try {
      if (typeof window === "undefined" || !("VideoEncoder" in window) || !("AudioEncoder" in window)) {
        throw new Error(
          "Ваш браузер не поддерживает аппаратный кодировщик WebCodecs H.264/AAC. Для чистого экспорта MP4 используйте Google Chrome, Microsoft Edge, Яндекс Браузер или Opera."
        );
      }

      setStatus("rendering");
      cancelRef.current = false;
      setProgressPercent(0);
      setStatusText("Инициализация кодировщика H.264 + AAC...");

      // Canvas
      const canvas = document.createElement("canvas");
      canvas.width = WIDTH;
      canvas.height = HEIGHT;
      const ctx = canvas.getContext("2d", { alpha: false });
      if (!ctx) throw new Error("Не удалось создать 2D контекст");

      // Audio Context with fixed 44100 Hz sample rate
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioContextClass({ sampleRate: AUDIO_SAMPLE_RATE });

      // Target and Muxer for true MP4
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

      // VideoEncoder setup
      let videoEncoderError: any = null;
      const videoEncoder = new VideoEncoder({
        output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
        error: (err) => {
          console.error("VideoEncoder error:", err);
          videoEncoderError = err;
        },
      });

      // Codec configuration
      const preferredCodecs = ["avc1.4d002a", "avc1.64002a", "avc1.420034", "avc1.420028"];
      let selectedVideoCodec = preferredCodecs[0];
      for (const candidate of preferredCodecs) {
        try {
          const sup = await VideoEncoder.isConfigSupported({
            codec: candidate,
            width: WIDTH,
            height: HEIGHT,
            bitrate: 6_000_000,
            framerate: FPS,
          });
          if (sup && sup.supported) {
            selectedVideoCodec = candidate;
            break;
          }
        } catch {
          // ignore
        }
      }

      videoEncoder.configure({
        codec: selectedVideoCodec,
        width: WIDTH,
        height: HEIGHT,
        bitrate: 6_000_000,
        framerate: FPS,
        avc: { format: "avc" },
      });

      // AudioEncoder setup
      let audioEncoderError: any = null;
      const audioEncoder = new AudioEncoder({
        output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
        error: (err) => {
          console.error("AudioEncoder error:", err);
          audioEncoderError = err;
        },
      });

      audioEncoder.configure({
        codec: "mp4a.40.2", // AAC-LC
        numberOfChannels: 2,
        sampleRate: AUDIO_SAMPLE_RATE,
        bitrate: 128_000,
      });

      let globalVideoFrames = 0;
      let globalAudioSamples = 0;

      // Sequential scene processing with exact discrete timestamps
      for (let i = 0; i < scenes.length; i++) {
        if (cancelRef.current) break;

        const scene = scenes[i];
        const sceneNum = i + 1;
        setStatusText(`Сборка сцены ${sceneNum}/${scenes.length}: ${scene.title}`);

        // 1. Preload image
        const img = new Image();
        img.crossOrigin = "anonymous";
        await new Promise((resolve) => {
          img.onload = resolve;
          img.onerror = resolve;
          img.src = scene.imageUrl || "";
        });

        // 2. Decode audio into 44100 Hz PCM AudioBuffer
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

        // If no audio or failed, create silence
        if (!audioBuffer) {
          const sampleCount = Math.max(1, Math.round(durationSec * AUDIO_SAMPLE_RATE));
          audioBuffer = audioCtx.createBuffer(2, sampleCount, AUDIO_SAMPLE_RATE);
        }

        // 3. Encode Audio to AAC in 1024-sample frames
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

          while (audioEncoder.encodeQueueSize > 25) {
            await new Promise((r) => setTimeout(r, 4));
          }
        }
        globalAudioSamples += audioBuffer.length;

        // 4. Render and Encode Video Frames at 45 FPS
        const totalFrames = Math.max(1, Math.round(durationSec * FPS));

        for (let frame = 0; frame < totalFrames; frame++) {
          if (cancelRef.current) break;

          const progress = frame / totalFrames;
          const zoomScale = 1 + progress * 0.08;

          // Black background
          ctx.fillStyle = "#09090b";
          ctx.fillRect(0, 0, WIDTH, HEIGHT);

          // Ken Burns zoom effect
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

          // Encode VideoFrame
          const timestampUs = Math.round(globalVideoFrames * (1_000_000 / FPS));
          const isKeyFrame = globalVideoFrames % (FPS * 2) === 0; // IDR keyframe every 2 seconds

          const videoFrame = new VideoFrame(canvas, { timestamp: timestampUs });
          videoEncoder.encode(videoFrame, { keyFrame: isKeyFrame });
          videoFrame.close();

          globalVideoFrames++;

          while (videoEncoder.encodeQueueSize > 15) {
            await new Promise((r) => setTimeout(r, 6));
          }

          // Yield to browser every 25 frames for responsive UI
          if (frame % 25 === 0) {
            const overallPct = Math.min(98, Math.round(((i + frame / totalFrames) / scenes.length) * 100));
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

      setStatusText("Финализация MP4 (запись moov-атома для Clipchamp)...");
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
      setStatusText("Full HD MP4 готов к просмотру и монтажу в Clipchamp!");
    } catch (err: any) {
      console.error("Export Error:", err);
      setStatus("error");
      setStatusText(err.message || "Ошибка при экспорте видео в MP4");
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
            <h3 className="text-xl font-bold text-white">Экспорт в MP4 (Full HD)</h3>
            <p className="text-sm text-zinc-400 mt-0.5 truncate max-w-sm">{title}</p>
          </div>
        </div>

        {/* Specs Table */}
        <div className="p-5 rounded-2xl bg-zinc-900/90 border border-zinc-800/80 space-y-2.5 mb-6 text-sm text-zinc-300">
          <div className="flex justify-between items-center">
            <span className="text-zinc-400">Формат контейнера:</span>
            <span className="font-bold text-blue-400">MP4 (H.264 + AAC)</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-zinc-400">Разрешение:</span>
            <span className="font-semibold text-white">1920 × 1080 (Full HD)</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-zinc-400">Частота кадров:</span>
            <span className="font-semibold text-white">45 FPS</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-zinc-400">Совместимость:</span>
            <span className="font-bold text-emerald-400">Clipchamp, Premiere, QuickTime, Media Player</span>
          </div>
        </div>

        {/* Progress */}
        {status === "rendering" && (
          <div className="space-y-3.5 p-5 rounded-2xl bg-zinc-900 border border-zinc-800 mb-6">
            <div className="flex items-center justify-between text-sm text-white">
              <span className="flex items-center gap-2.5 font-medium">
                <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
                <span>Рендеринг Full HD MP4...</span>
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
              <span>Full HD MP4 успешно скомпилирован!</span>
            </div>
            <a
              href={downloadUrl}
              download={`${title.replace(/[^a-zA-Z0-9а-яА-Я]/g, "_")}_1080p.mp4`}
              className="inline-flex items-center gap-2.5 px-6 py-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-base shadow-xl shadow-blue-600/30 hover:scale-[1.02] active:scale-[0.98] transition-all"
            >
              <Download className="w-5 h-5" />
              <span>Скачать MP4 ({fileSizeMb} МБ)</span>
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
              className="flex-1 py-3.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm font-semibold transition-colors cursor-pointer"
            >
              Отмена
            </button>
            <button
              onClick={startExport}
              className="flex-1 py-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-base shadow-lg shadow-blue-600/30 flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer"
            >
              <Film className="w-5 h-5" />
              <span>Экспорт MP4 (1080p @ 45 FPS)</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
