"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  DownloadSimple,
  X,
  FilmStrip,
  CheckCircle,
  WarningCircle,
  CircleNotch,
  Lightning,
  FrameCorners,
  DeviceMobile,
  Timer,
} from "@phosphor-icons/react";
import { Scene } from "@/lib/types";
import {
  EXPORT_BITRATE,
  EXPORT_SIZES,
  normalizeOrientation,
  orientationLabel,
  type ExportResolution,
  type Orientation,
} from "@/lib/orientation";
import { computeSubtitleLayout, subtitleHex, type SubtitleColorId } from "@/lib/subtitles";
import { getSubtitleColor, setSubtitleColor, SUBTITLE_STYLE_EVENT } from "@/lib/client/subtitle-style";
import { SubtitleColorPicker } from "./SubtitleColorPicker";
import { detectExportEngine, type EngineInfo } from "@/lib/export/capabilities";
import { loadAssets } from "@/lib/export/render";
import { describeEncoderError, encodeWithWebCodecs } from "@/lib/export/webcodecs";
import { recordRealtime } from "@/lib/export/mediarecorder";

interface VideoExporterProps {
  title: string;
  scenes: Scene[];
  /** Формат, в котором фильм сгенерирован — стартовое значение выбора. */
  defaultOrientation?: Orientation;
  onClose: () => void;
}

const FPS = 30;
const AUDIO_SAMPLE_RATE = 44100;

const AudioContextClass =
  typeof window !== "undefined" ? window.AudioContext || (window as any).webkitAudioContext : null;

function guessResolution(): ExportResolution {
  if (typeof window === "undefined") return "1080p";
  const cores = (navigator as any).hardwareConcurrency ?? 8;
  return window.innerWidth < 640 || cores <= 4 ? "720p" : "1080p";
}

export const VideoExporter: React.FC<VideoExporterProps> = ({ title, scenes, defaultOrientation, onClose }) => {
  const sourceOrientation = normalizeOrientation(defaultOrientation ?? scenes[0]?.orientation);

  const [status, setStatus] = useState<"idle" | "rendering" | "finished" | "error">("idle");
  const [progressPercent, setProgressPercent] = useState(0);
  const [statusText, setStatusText] = useState("");
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [fileSizeMb, setFileSizeMb] = useState<string | null>(null);
  const [outputExt, setOutputExt] = useState<"mp4" | "webm">("mp4");
  const [hiddenWarning, setHiddenWarning] = useState(false);

  const [exportOrientation, setExportOrientation] = useState<Orientation>(sourceOrientation);
  const [resolution, setResolution] = useState<ExportResolution>(guessResolution);
  const [engine, setEngine] = useState<EngineInfo | null>(null);
  const [subtitleColor, setSubtitleColorState] = useState<SubtitleColorId>(() => getSubtitleColor());

  useEffect(() => {
    const onStyle = () => setSubtitleColorState(getSubtitleColor());
    window.addEventListener(SUBTITLE_STYLE_EVENT, onStyle);
    return () => window.removeEventListener(SUBTITLE_STYLE_EVENT, onStyle);
  }, []);

  const cancelRef = useRef(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const { w: WIDTH, h: HEIGHT } = EXPORT_SIZES[resolution][exportOrientation];
  const bitrate = EXPORT_BITRATE[resolution];
  // Разметка субтитров — от выбранного холста, а не от формата генерации.
  const layout = computeSubtitleLayout(WIDTH, HEIGHT);

  const totalSeconds = scenes.reduce((acc, s) => acc + (s.actualDuration || s.durationEstimate || 0), 0);

  useEffect(() => {
    if (status !== "idle") return;
    let cancelled = false;
    setEngine(null);
    detectExportEngine(WIDTH, HEIGHT, bitrate, FPS, AUDIO_SAMPLE_RATE).then((info) => {
      if (!cancelled) setEngine(info);
    });
    return () => {
      cancelled = true;
    };
  }, [WIDTH, HEIGHT, bitrate, status]);

  useEffect(() => {
    if (status !== "rendering" || engine?.engine !== "mediarecorder") return;
    const onVisibility = () => {
      if (document.hidden) setHiddenWarning(true);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [status, engine]);

  const startExport = async () => {
    try {
      if (!engine || engine.engine === "none" || !AudioContextClass) {
        throw new Error(
          "Ваш браузер не поддерживает ни аппаратный кодировщик WebCodecs, ни запись MediaRecorder. Попробуйте Chrome, Edge, Safari 17+ или Firefox."
        );
      }

      setStatus("rendering");
      cancelRef.current = false;
      setHiddenWarning(false);
      setProgressPercent(0);
      setStatusText("Загрузка кадров и аудио...");

      const onProgress = (p: number) => setProgressPercent(p);
      const onStatus = (t: string) => setStatusText(t);

      let blob: Blob | null = null;
      let ext: "mp4" | "webm" = "mp4";

      if (engine.engine === "webcodecs" && engine.codec) {
        const audioCtx = new AudioContextClass({ sampleRate: AUDIO_SAMPLE_RATE });
        const assets = await loadAssets(scenes, audioCtx, AUDIO_SAMPLE_RATE);
        if (cancelRef.current) return;
        blob = await encodeWithWebCodecs({
          assets,
          W: WIDTH,
          H: HEIGHT,
          fps: FPS,
          bitrate,
          codec: engine.codec,
          sampleRate: AUDIO_SAMPLE_RATE,
          layout,
          subtitleColor: subtitleHex(subtitleColor),
          cancelRef,
          onProgress,
          onStatus,
        });
      } else if (engine.engine === "mediarecorder" && engine.mime) {
        // AudioContext создаётся в обработчике клика — так требует iOS.
        const audioCtx = new AudioContextClass();
        const assets = await loadAssets(scenes, audioCtx, audioCtx.sampleRate);
        if (cancelRef.current) return;
        if (!canvasRef.current) throw new Error("Холст записи не смонтирован");
        const result = await recordRealtime({
          assets,
          W: WIDTH,
          H: HEIGHT,
          fps: FPS,
          bitrate,
          mime: engine.mime,
          layout,
          subtitleColor: subtitleHex(subtitleColor),
          canvas: canvasRef.current,
          audioCtx,
          cancelRef,
          onProgress,
          onStatus,
        });
        if (result) {
          blob = result.blob;
          ext = result.ext;
        }
      }

      if (!blob) return; // отменено

      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);
      setOutputExt(ext);
      setFileSizeMb((blob.size / (1024 * 1024)).toFixed(1));
      setStatus("finished");
      setStatusText("Видео готово к загрузке");
    } catch (err: any) {
      console.error("Export Error:", err);
      setStatus("error");
      const msg = String(err?.message || "");
      setStatusText(
        /closed codec|reclaimed/i.test(msg) ? describeEncoderError(err) : msg || "Ошибка при экспорте видео"
      );
    }
  };

  const safeTitle = title.replace(/[^a-zA-Z0-9а-яА-ЯёЁәғқңөұүһіӘҒҚҢӨҰҮҺІ_-]/g, "_").slice(0, 60);
  const fileName = `${safeTitle}_${orientationLabel(exportOrientation).replace(":", "x")}_${resolution}.${outputExt}`;

  const engineLabel =
    engine === null
      ? "Проверка возможностей браузера..."
      : engine.engine === "webcodecs"
      ? "Быстрый рендер: аппаратный WebCodecs H.264/AAC"
      : engine.engine === "mediarecorder"
      ? `Совместимый режим: запись в реальном времени (~${Math.max(1, Math.ceil(totalSeconds / 60))} мин), не сворачивайте вкладку`
      : "Экспорт в этом браузере недоступен";

  const mismatch = exportOrientation !== sourceOrientation;

  const optionBtn = (active: boolean) =>
    `flex items-center gap-2.5 p-3 rounded-xl border text-left transition-colors cursor-pointer ${
      active ? "border-accent bg-accent/10 text-white" : "border-white/15 bg-white/[0.04] text-zinc-300 hover:bg-white/[0.08]"
    }`;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 animate-fade-in select-none">
      <div className="bg-stage border border-white/10 rounded-2xl p-5 sm:p-6 max-w-md w-full space-y-4 sm:space-y-5 shadow-2xl relative max-h-[95dvh] overflow-y-auto">
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-accent/10 border border-accent/30 text-accent flex items-center justify-center shrink-0">
              <FilmStrip size={18} weight="bold" />
            </div>
            <div className="min-w-0">
              <h3 className="font-extrabold text-sm text-white tracking-tight">Экспорт видео</h3>
              <p className="text-[11px] text-zinc-400 truncate">
                {WIDTH}×{HEIGHT} ({orientationLabel(exportOrientation)}) @ {FPS} FPS
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              cancelRef.current = true;
              onClose();
            }}
            className="p-1.5 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white transition-colors cursor-pointer"
            aria-label="Закрыть"
          >
            <X size={18} weight="bold" />
          </button>
        </div>

        {status === "idle" && (
          <div className="space-y-4">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500 mb-2">Формат</div>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" className={optionBtn(exportOrientation === "landscape")} onClick={() => setExportOrientation("landscape")}>
                  <FrameCorners size={20} className="shrink-0" />
                  <span className="min-w-0">
                    <span className="block text-[13px] font-semibold leading-tight">Горизонтальный 16:9</span>
                    <span className="block text-[11px] text-zinc-400 mt-0.5">
                      YouTube{sourceOrientation === "portrait" ? " · с обрезкой" : " · как снято"}
                    </span>
                  </span>
                </button>
                <button type="button" className={optionBtn(exportOrientation === "portrait")} onClick={() => setExportOrientation("portrait")}>
                  <DeviceMobile size={20} className="shrink-0" />
                  <span className="min-w-0">
                    <span className="block text-[13px] font-semibold leading-tight">Вертикальный 9:16</span>
                    <span className="block text-[11px] text-zinc-400 mt-0.5">
                      Reels · Shorts · TikTok{sourceOrientation === "landscape" ? " · с обрезкой" : " · как снято"}
                    </span>
                  </span>
                </button>
              </div>
              {mismatch && (
                <p className="text-[11.5px] text-amber-300/90 mt-2 leading-snug">
                  {sourceOrientation === "landscape"
                    ? "Кадры фильма горизонтальные — при экспорте 9:16 картинка будет обрезана по краям."
                    : "Кадры фильма вертикальные — при экспорте 16:9 картинка будет обрезана сверху и снизу."}
                </p>
              )}
            </div>

            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500 mb-2">Цвет субтитров</div>
              <div className="flex items-center gap-3 p-3 rounded-xl border border-white/15 bg-white/[0.04]">
                <SubtitleColorPicker
                  value={subtitleColor}
                  onChange={(id) => {
                    setSubtitleColorState(id);
                    setSubtitleColor(id);
                  }}
                />
                <span className="text-[11px] text-zinc-400">чёрная обводка, без подложки</span>
              </div>
            </div>

            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500 mb-2">Качество</div>
              <div className="grid grid-cols-2 gap-2">
                {(["1080p", "720p"] as ExportResolution[]).map((r) => (
                  <button key={r} type="button" className={optionBtn(resolution === r)} onClick={() => setResolution(r)}>
                    <Timer size={18} className="shrink-0" />
                    <span className="min-w-0">
                      <span className="block text-[13px] font-semibold leading-tight">{r === "1080p" ? "Full HD 1080p" : "HD 720p"}</span>
                      <span className="block text-[11px] text-zinc-400 mt-0.5">{r === "1080p" ? "Максимальное качество" : "Быстрее, легче файл"}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-white/[0.06] border border-white/10 space-y-2 text-xs">
              <div className="flex items-center justify-between gap-3 text-zinc-400">
                <span>Фильм:</span>
                <span className="font-bold text-white truncate max-w-[200px]">{title}</span>
              </div>
              <div className="flex items-center justify-between text-zinc-400">
                <span>Кадров:</span>
                <span className="font-bold text-accent">{scenes.length}</span>
              </div>
              <div className="flex items-start justify-between gap-3 text-zinc-400">
                <span className="shrink-0">Движок:</span>
                <span className={`font-bold text-right ${engine?.engine === "webcodecs" ? "text-accent" : "text-white"} flex items-start gap-1`}>
                  {engine?.engine === "webcodecs" && <Lightning size={14} weight="fill" className="shrink-0 mt-px" />}
                  <span>{engineLabel}</span>
                </span>
              </div>
            </div>

            <button
              onClick={startExport}
              disabled={engine === null || engine.engine === "none"}
              className="w-full py-3.5 rounded-xl bg-accent hover:bg-accent-hover active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed text-accent-ink font-black text-sm shadow-xl transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <Lightning size={18} weight="fill" />
              <span>Собрать видео {orientationLabel(exportOrientation)}</span>
            </button>
          </div>
        )}

        {status === "rendering" && (
          <div className="space-y-4 py-2">
            <div className="flex items-center justify-between text-xs gap-3">
              <span className="font-medium text-zinc-200 flex items-center gap-2 min-w-0">
                <CircleNotch size={16} weight="bold" className="animate-spin text-accent shrink-0" />
                <span className="truncate">{statusText}</span>
              </span>
              <span className="font-mono font-bold text-sm text-accent shrink-0">{progressPercent}%</span>
            </div>

            <div className="w-full h-2 rounded-full bg-zinc-900 overflow-hidden border border-white/10">
              <div className="h-full bg-accent transition-all duration-200 rounded-full" style={{ width: `${progressPercent}%` }} />
            </div>

            {/* Холст виден только в совместимом режиме: Safari не отдаёт кадры с невидимого холста. */}
            <canvas
              ref={canvasRef}
              className={engine?.engine === "mediarecorder" ? "w-full rounded-xl border border-white/10 bg-black" : "hidden"}
            />

            {hiddenWarning && (
              <p className="text-[11.5px] text-amber-300/90 text-center leading-snug">
                Вкладка была свёрнута — в записи возможны пропуски. Держите её открытой до конца.
              </p>
            )}

            <p className="text-[11px] text-zinc-400 text-center">
              {WIDTH}×{HEIGHT} ({orientationLabel(exportOrientation)}) @ {FPS} FPS ·{" "}
              {engine?.engine === "webcodecs" ? "аппаратная сборка" : "запись в реальном времени"}
            </p>
          </div>
        )}

        {status === "finished" && downloadUrl && (
          <div className="space-y-4 py-2 text-center">
            <div className="w-12 h-12 rounded-full bg-accent/15 border border-accent/30 text-accent flex items-center justify-center mx-auto shadow-lg">
              <CheckCircle size={26} weight="bold" />
            </div>

            <div className="space-y-1">
              <h4 className="font-bold text-base text-white">Видео собрано</h4>
              <p className="text-xs text-zinc-400">
                {orientationLabel(exportOrientation)} · {resolution} · размер <span className="font-bold text-white">{fileSizeMb} МБ</span>
              </p>
            </div>

            <a
              href={downloadUrl}
              download={fileName}
              className="w-full py-3.5 rounded-xl bg-accent hover:bg-accent-hover active:scale-[0.99] text-accent-ink font-black text-sm shadow-xl transition-all flex items-center justify-center gap-2 cursor-pointer block"
            >
              <DownloadSimple size={18} weight="bold" />
              <span>Скачать {outputExt.toUpperCase()}</span>
            </a>

            <button
              type="button"
              onClick={() => {
                setStatus("idle");
                setDownloadUrl(null);
                setProgressPercent(0);
              }}
              className="w-full py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-xs transition-colors cursor-pointer"
            >
              Собрать в другом формате
            </button>
          </div>
        )}

        {status === "error" && (
          <div className="space-y-4 py-2">
            <div className="p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2.5">
              <WarningCircle size={18} weight="bold" className="shrink-0 mt-0.5 text-rose-400" />
              <span>{statusText}</span>
            </div>
            <button
              onClick={() => setStatus("idle")}
              className="w-full py-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-xs transition-colors cursor-pointer"
            >
              Попробовать снова
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
