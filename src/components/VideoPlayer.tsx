"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  Play,
  Pause,
  SkipForward,
  SkipBack,
  SpeakerHigh,
  SpeakerSimpleX,
  ArrowsOut,
  ArrowsIn,
  DownloadSimple,
  ClosedCaptioning,
  CircleNotch,
  CaretLeft,
  CaretRight,
} from "@phosphor-icons/react";
import { Scene } from "@/lib/types";
import {
  aspectRatioCss,
  normalizeOrientation,
  type Orientation,
} from "@/lib/orientation";
import { kenBurnsKeyframes, kenBurnsPreset } from "@/lib/kenburns";
import {
  buildCues,
  computeSubtitleLayout,
  cueIndexAt,
  estimateSceneSeconds,
  fitCuesToLines,
  wrapLines,
  subtitleHex,
  SUBTITLE_OUTLINE,
  SUBTITLE_SHADOW,
  SUBTITLE_FONT_STACK,
  SUBTITLE_FONT_WEIGHT,
  type SubtitleColorId,
} from "@/lib/subtitles";
import { getSubtitleColor, setSubtitleColor, SUBTITLE_STYLE_EVENT } from "@/lib/client/subtitle-style";
import { SubtitleColorPicker } from "./SubtitleColorPicker";

interface VideoPlayerProps {
  title: string;
  scenes: Scene[];
  orientation?: Orientation;
  onExportClick?: () => void;
}

/** Кроссфейд между кадрами — та же длительность, что XFADE_SEC в экспорте. */
const XFADE_MS = 450;
/** Высота деки под кадром в компактном режиме (для расчёта кадра в фуллскрине). */
const COMPACT_DECK_PX = 92;

export const VideoPlayer: React.FC<VideoPlayerProps> = ({ title, scenes, orientation, onExportClick }) => {
  const [currentSceneIndex, setCurrentSceneIndex] = useState(0);
  const [prevSceneIndex, setPrevSceneIndex] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [showSubtitles, setShowSubtitles] = useState(true);
  const [subtitleColor, setSubtitleColorState] = useState<SubtitleColorId>(() => getSubtitleColor());
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [sceneElapsed, setSceneElapsed] = useState(0);

  const [isScrubbing, setIsScrubbing] = useState(false);
  const [hoverTooltip, setHoverTooltip] = useState<{ sec: number; x: number; sceneTitle: string } | null>(null);

  // Реальные длительности из метаданных MP3 — плеер и экспортёр считают от одного числа.
  const [measuredDurations, setMeasuredDurations] = useState<number[]>([]);
  // Размер кадра в пикселях — от него считается кегль субтитров и компактный режим.
  const [frameBox, setFrameBox] = useState({ w: 0, h: 0 });
  const [controlsVisible, setControlsVisible] = useState(true);
  // Компактный режим: маленький кадр (телефон, вертикальный кадр на десктопе).
  // Дека уходит под кадр, пилюли ужимаются, субтитры не длиннее двух строк.
  const [compact, setCompact] = useState<boolean>(
    () => typeof window !== "undefined" && window.innerWidth < 640
  );

  const frameOrientation = normalizeOrientation(orientation ?? scenes[0]?.orientation);
  const frameAspect = aspectRatioCss(frameOrientation);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const kenBurnsRef = useRef<Animation | null>(null);
  const fsWrapperRef = useRef<HTMLDivElement | null>(null);
  const pseudoFsRef = useRef(false);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const xfadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const measureCanvasRef = useRef<CanvasRenderingContext2D | null>(null);
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const carouselRef = useRef<HTMLDivElement | null>(null);
  const audioCacheRef = useRef<Map<number, HTMLAudioElement>>(new Map());
  const animFrameRef = useRef<number | null>(null);
  const isPlayingRef = useRef(false);
  isPlayingRef.current = isPlaying;
  const compactRef = useRef(compact);
  compactRef.current = compact;
  const wasPlayingBeforeScrubRef = useRef(false);

  const currentSceneIndexRef = useRef(0);
  currentSceneIndexRef.current = currentSceneIndex;
  const sceneDurationRef = useRef(0);
  const sceneElapsedRef = useRef(0);
  const lastSceneIndexRef = useRef(0);
  const isMutedRef = useRef(false);
  isMutedRef.current = isMuted;

  const audioSignature = scenes.map((s) => s.audioUrl || "").join("|");

  /** Единственный источник длительности сцены: измеренная > серверная > оценка. */
  const durOf = useCallback(
    (index: number) =>
      measuredDurations[index] ||
      scenes[index]?.actualDuration ||
      scenes[index]?.durationEstimate ||
      estimateSceneSeconds(scenes[index]?.narration),
    [measuredDurations, scenes]
  );

  useEffect(() => {
    if (!scenes || scenes.length === 0) return;
    scenes.forEach((s) => {
      if (s.imageUrl) {
        const img = new Image();
        img.src = s.imageUrl;
      }
    });
  }, [scenes]);

  // Цвет субтитров общий с экспортом: меняется здесь — меняется и там.
  useEffect(() => {
    const onStyle = () => setSubtitleColorState(getSubtitleColor());
    window.addEventListener(SUBTITLE_STYLE_EVENT, onStyle);
    return () => window.removeEventListener(SUBTITLE_STYLE_EVENT, onStyle);
  }, []);

  // Кроссфейд: при смене кадра предыдущий остаётся под новым на XFADE_MS.
  useEffect(() => {
    const last = lastSceneIndexRef.current;
    if (last !== currentSceneIndex) {
      setPrevSceneIndex(last);
      lastSceneIndexRef.current = currentSceneIndex;
      if (xfadeTimerRef.current) clearTimeout(xfadeTimerRef.current);
      xfadeTimerRef.current = setTimeout(() => setPrevSceneIndex(null), XFADE_MS);
    }
    return () => {
      if (xfadeTimerRef.current) clearTimeout(xfadeTimerRef.current);
    };
  }, [currentSceneIndex]);

  const handleAdvanceScene = useCallback(
    (nextIndex: number) => {
      const currAudio = audioCacheRef.current.get(currentSceneIndexRef.current);
      if (currAudio) {
        currAudio.pause();
        currAudio.currentTime = 0;
      }

      if (nextIndex < scenes.length) {
        setCurrentSceneIndex(nextIndex);
        setSceneElapsed(0);
        setIsBuffering(false);

        if (isPlayingRef.current) {
          const nextAudio = audioCacheRef.current.get(nextIndex);
          if (nextAudio) {
            nextAudio.currentTime = 0;
            nextAudio.play().catch((err) => console.log("Audio play wait:", err));
          }
        }
      } else {
        setIsPlaying(false);
        setCurrentSceneIndex(0);
        setSceneElapsed(0);
        setIsBuffering(false);
      }
    },
    [scenes.length]
  );

  // Все аудио-элементы создаются заранее, чтобы смена сцены была мгновенной.
  useEffect(() => {
    audioCacheRef.current.forEach((audio) => {
      audio.pause();
      audio.src = "";
    });
    audioCacheRef.current.clear();

    scenes.forEach((scene, index) => {
      if (scene.audioUrl) {
        const audio = new Audio();
        audio.preload = "auto";
        audio.src = scene.audioUrl;
        audio.muted = isMutedRef.current;

        audio.onwaiting = () => {
          if (currentSceneIndexRef.current === index) setIsBuffering(true);
        };
        audio.onplaying = () => {
          if (currentSceneIndexRef.current === index) setIsBuffering(false);
        };
        audio.onended = () => {
          if (currentSceneIndexRef.current === index) handleAdvanceScene(index + 1);
        };
        audio.onloadedmetadata = () => {
          const d = audio.duration;
          if (!Number.isFinite(d) || d <= 0) return;
          setMeasuredDurations((prev) => {
            if (Math.abs((prev[index] ?? 0) - d) < 0.01) return prev;
            const next = [...prev];
            next[index] = d;
            return next;
          });
        };

        audioCacheRef.current.set(index, audio);
      }
    });

    return () => {
      audioCacheRef.current.forEach((audio) => {
        audio.pause();
        audio.src = "";
      });
      audioCacheRef.current.clear();
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioSignature, handleAdvanceScene]);

  useEffect(() => {
    audioCacheRef.current.forEach((audio) => {
      audio.muted = isMuted;
    });
  }, [isMuted]);

  const currentScene = scenes[currentSceneIndex] || scenes[0];
  const prevScene = prevSceneIndex !== null ? scenes[prevSceneIndex] : null;
  const sceneDuration = durOf(currentSceneIndex);
  sceneDurationRef.current = sceneDuration;
  sceneElapsedRef.current = sceneElapsed;

  // Ken Burns: та же кривая и пресеты, что в экспортёре. Анимация стоит на
  // паузе, а её время выставляется из sceneElapsed — движение синхронно
  // с аудио, паузой и перемоткой, и не зависит от таймеров вкладки.
  useEffect(() => {
    const img = imgRef.current;
    kenBurnsRef.current?.cancel();
    kenBurnsRef.current = null;
    if (!img || typeof img.animate !== "function") return;
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const anim = img.animate(kenBurnsKeyframes(kenBurnsPreset(currentSceneIndex)), {
      duration: Math.max(1000, sceneDurationRef.current * 1000),
      fill: "forwards",
      easing: "linear",
    });
    anim.pause();
    anim.currentTime = Math.min(sceneElapsedRef.current * 1000, Math.max(0, sceneDurationRef.current * 1000 - 1));
    kenBurnsRef.current = anim;
    return () => {
      anim.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSceneIndex, currentScene?.imageUrl, measuredDurations[currentSceneIndex]]);

  useEffect(() => {
    const anim = kenBurnsRef.current;
    if (!anim) return;
    const total = Math.max(1000, sceneDuration * 1000);
    anim.currentTime = Math.min(sceneElapsed * 1000, total - 1);
  }, [sceneElapsed, sceneDuration]);


  const totalDuration = scenes.reduce((acc, _s, i) => acc + durOf(i), 0);
  const elapsedPriorScenes = scenes.slice(0, currentSceneIndex).reduce((acc, _s, i) => acc + durOf(i), 0);
  const overallElapsed = elapsedPriorScenes + sceneElapsed;

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const togglePlay = () => {
    const activeAudio = audioCacheRef.current.get(currentSceneIndex);
    if (isPlaying) {
      setIsPlaying(false);
      if (activeAudio) activeAudio.pause();
    } else {
      setIsPlaying(true);
      if (activeAudio) activeAudio.play().catch((err) => console.warn("Audio play rejected:", err));
    }
  };

  useEffect(() => {
    let lastTime = performance.now();

    const tick = () => {
      const activeAudio = audioCacheRef.current.get(currentSceneIndex);

      if (activeAudio && !activeAudio.paused) {
        setSceneElapsed(activeAudio.currentTime);
      } else if (!activeAudio && isPlaying) {
        const now = performance.now();
        const delta = (now - lastTime) / 1000;
        setSceneElapsed((prev) => {
          const next = prev + delta;
          if (next >= sceneDuration) {
            handleAdvanceScene(currentSceneIndex + 1);
            return 0;
          }
          return next;
        });
      }
      lastTime = performance.now();

      if (isPlaying) animFrameRef.current = requestAnimationFrame(tick);
    };

    if (isPlaying) {
      animFrameRef.current = requestAnimationFrame(tick);
    } else if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
    }

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isPlaying, currentSceneIndex, sceneDuration, handleAdvanceScene]);

  const jumpToScene = (targetIndex: number, offsetSec: number = 0) => {
    const prevAudio = audioCacheRef.current.get(currentSceneIndex);
    if (prevAudio) {
      prevAudio.pause();
      prevAudio.currentTime = 0;
    }

    setCurrentSceneIndex(targetIndex);
    setSceneElapsed(offsetSec);
    setIsBuffering(false);

    const targetAudio = audioCacheRef.current.get(targetIndex);
    if (targetAudio) {
      targetAudio.currentTime = offsetSec;
      if (isPlaying) targetAudio.play().catch(console.warn);
    }

    if (carouselRef.current) {
      const targetCard = carouselRef.current.children[targetIndex] as HTMLElement;
      if (targetCard) targetCard.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    }
  };

  const seekFromPointer = (e: React.PointerEvent<HTMLDivElement>, shouldResume: boolean = false) => {
    if (!timelineRef.current) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const targetSec = percent * totalDuration;

    let accumulated = 0;
    for (let i = 0; i < scenes.length; i++) {
      const dur = durOf(i);
      if (targetSec <= accumulated + dur || i === scenes.length - 1) {
        const offsetInScene = Math.max(0, targetSec - accumulated);

        if (currentSceneIndexRef.current !== i) {
          const prevAudio = audioCacheRef.current.get(currentSceneIndexRef.current);
          if (prevAudio) {
            prevAudio.pause();
            prevAudio.currentTime = 0;
          }
          setCurrentSceneIndex(i);
        }

        setSceneElapsed(offsetInScene);

        const targetAudio = audioCacheRef.current.get(i);
        if (targetAudio) {
          targetAudio.currentTime = offsetInScene;
          if (shouldResume) targetAudio.play().catch((err) => console.log("Audio seek resume:", err));
        }
        break;
      }
      accumulated += dur;
    }
  };

  const handleTimelinePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    wasPlayingBeforeScrubRef.current = isPlayingRef.current;
    if (isPlayingRef.current) {
      const activeAudio = audioCacheRef.current.get(currentSceneIndexRef.current);
      if (activeAudio) activeAudio.pause();
    }
    setIsScrubbing(true);
    seekFromPointer(e, false);
  };

  const handleTimelinePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!timelineRef.current) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const targetSec = percent * totalDuration;

    let accumulated = 0;
    let sceneName = scenes[0]?.title || "";
    for (let i = 0; i < scenes.length; i++) {
      const dur = durOf(i);
      if (targetSec <= accumulated + dur || i === scenes.length - 1) {
        sceneName = `Кадр ${i + 1}: ${scenes[i]?.title}`;
        break;
      }
      accumulated += dur;
    }

    setHoverTooltip({ sec: targetSec, x: e.clientX - rect.left, sceneTitle: sceneName });
    if (isScrubbing) seekFromPointer(e, false);
  };

  const handleTimelinePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    setIsScrubbing(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}

    seekFromPointer(e, wasPlayingBeforeScrubRef.current);

    if (carouselRef.current) {
      const targetCard = carouselRef.current.children[currentSceneIndexRef.current] as HTMLElement;
      if (targetCard) targetCard.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    }
  };

  // Полноэкранный режим. Разворачиваем ОБЁРТКУ, а не сам кадр: UA-стили
  // навязывают :fullscreen width/height:100% !important, и пропорции кадра
  // сломались бы. Внутри обёртки кадр letterbox-ится.
  const exitFullscreen = useCallback(() => {
    if (pseudoFsRef.current) {
      pseudoFsRef.current = false;
      document.body.style.overflow = "";
      setIsFullscreen(false);
      return;
    }
    const exit = document.exitFullscreen || (document as any).webkitExitFullscreen;
    if (exit) exit.call(document);
  }, []);

  const toggleFullscreen = useCallback(() => {
    const el = fsWrapperRef.current;
    if (!el) return;

    const active =
      document.fullscreenElement || (document as any).webkitFullscreenElement || pseudoFsRef.current;
    if (active) {
      exitFullscreen();
      return;
    }

    const request = el.requestFullscreen || (el as any).webkitRequestFullscreen;
    if (request) {
      Promise.resolve(request.call(el)).catch(() => {
        // iOS Safari не даёт Fullscreen API произвольным элементам — CSS-псевдофуллскрин.
        pseudoFsRef.current = true;
        document.body.style.overflow = "hidden";
        setIsFullscreen(true);
      });
    } else {
      pseudoFsRef.current = true;
      document.body.style.overflow = "hidden";
      setIsFullscreen(true);
    }
  }, [exitFullscreen]);

  useEffect(() => {
    const sync = () => {
      const native = document.fullscreenElement || (document as any).webkitFullscreenElement;
      setIsFullscreen(!!native || pseudoFsRef.current);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && pseudoFsRef.current) exitFullscreen();
    };
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("webkitfullscreenchange", sync);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      document.removeEventListener("webkitfullscreenchange", sync);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [exitFullscreen]);

  // Измеряем кадр — от него считается кегль субтитров и компактный режим.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const apply = (width: number, height: number) => {
      if (width <= 0 || height <= 0) return;
      setFrameBox((prev) =>
        Math.abs(prev.w - width) < 1 && Math.abs(prev.h - height) < 1 ? prev : { w: width, h: height }
      );
      setCompact(width < 480 || height < 260);
    };
    // Первый замер сразу: ResizeObserver отдаёт размер только с очередным
    // кадром отрисовки, а до него субтитры считались бы от 960×540.
    const first = el.getBoundingClientRect();
    apply(first.width, first.height);
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      apply(r.width, r.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // В оверлей-режиме дека прячется при простое, чтобы не закрывать субтитры.
  // В компактном режиме она под кадром и не прячется вовсе.
  const revealControls = useCallback(() => {
    setControlsVisible(true);
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    if (compactRef.current) return;
    if (isPlayingRef.current) {
      idleTimerRef.current = setTimeout(() => setControlsVisible(false), 2500);
    }
  }, []);

  useEffect(() => {
    revealControls();
    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [isPlaying, compact, revealControls]);

  const scrollCarousel = (direction: "left" | "right") => {
    if (!carouselRef.current) return;
    carouselRef.current.scrollBy({ left: direction === "left" ? -280 : 280, behavior: "smooth" });
  };

  useEffect(() => {
    const el = carouselRef.current;
    if (!el) return;
    const handleWheel = (e: WheelEvent) => {
      if (e.deltaY !== 0) {
        e.preventDefault();
        el.scrollLeft += e.deltaY;
      }
    };
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, []);

  const sceneBoundaries: number[] = [];
  let accumSec = 0;
  for (let i = 0; i < scenes.length - 1; i++) {
    accumSec += durOf(i);
    sceneBoundaries.push(accumSec);
  }

  // Разметка субтитров: те же пропорции, что и на холсте экспортёра.
  // minFontPx — сознательное отступление от WYSIWYG: в крохотном кадре
  // честные 8px нечитаемы; compact компенсирует это двумя строками максимум.
  const subtitleLayout = computeSubtitleLayout(frameBox.w || 960, frameBox.h || 540, {
    minFontPx: 12,
    compact,
  });

  const measureSubtitle = useCallback(
    (str: string) => {
      if (!measureCanvasRef.current) {
        measureCanvasRef.current = document.createElement("canvas").getContext("2d");
      }
      const c = measureCanvasRef.current;
      if (!c) return str.length * subtitleLayout.font * 0.5;
      c.font = subtitleLayout.fontCss;
      return c.measureText(str).width;
    },
    [subtitleLayout.fontCss, subtitleLayout.font]
  );

  const cues = useMemo(() => {
    const base = currentScene?.narration ? buildCues(currentScene.narration, sceneDuration) : [];
    return compact ? fitCuesToLines(base, 2, subtitleLayout.maxTextW, measureSubtitle) : base;
  }, [currentScene?.narration, sceneDuration, compact, subtitleLayout.maxTextW, measureSubtitle]);
  const activeCueIndex = cueIndexAt(cues, sceneElapsed);
  const activeSentence = activeCueIndex >= 0 ? cues[activeCueIndex].text : "";

  const subtitleLines = useMemo(
    () => (activeSentence ? wrapLines(activeSentence, subtitleLayout.maxTextW, measureSubtitle) : []),
    [activeSentence, subtitleLayout.maxTextW, measureSubtitle]
  );

  const progressPercent = Math.min(100, (overallElapsed / (totalDuration || 1)) * 100);

  // Ширина всегда ведущая, высоту выводит aspect-ratio: при width:100% кадр
  // 9:16 расплющивался в квадрат, а при явной высоте ширину подрезали отступы.
  // В фуллскрине компактного режима под кадром живёт дека — вычитаем её высоту.
  const frameWidthCss = (() => {
    if (frameOrientation === "portrait") {
      if (!isFullscreen) return "min(100%, calc(min(70vh, 620px) * 9 / 16))";
      return compact
        ? `min(100%, calc((100dvh - ${COMPACT_DECK_PX}px) * 9 / 16))`
        : "min(100%, calc(100dvh * 9 / 16))";
    }
    if (!isFullscreen) return "100%";
    return compact
      ? `min(100%, calc((100dvh - ${COMPACT_DECK_PX}px) * 16 / 9))`
      : "min(100%, calc(100dvh * 16 / 9))";
  })();

  const deckBtn = "rounded-xl bg-white/5 hover:bg-white/15 text-zinc-200 disabled:opacity-30 transition-all cursor-pointer";

  const renderDeck = () => (
    <div
      className={
        compact
          ? "relative w-full bg-stage px-3 pt-1 pb-2 flex flex-col gap-1.5"
          : `absolute bottom-0 inset-x-0 bg-gradient-to-t from-black via-black/90 to-transparent pt-8 pb-3 px-4 sm:px-5 z-30 flex flex-col gap-2.5 transition-opacity duration-300 ${
              controlsVisible ? "opacity-100" : "opacity-0 pointer-events-none"
            }`
      }
      style={compact && isFullscreen ? { maxWidth: frameWidthCss } : undefined}
      onPointerEnter={revealControls}
    >
      <div
        ref={timelineRef}
        onPointerDown={handleTimelinePointerDown}
        onPointerMove={handleTimelinePointerMove}
        onPointerUp={handleTimelinePointerUp}
        onPointerLeave={() => setHoverTooltip(null)}
        className="w-full py-2 cursor-pointer relative group/timeline select-none touch-none"
        title="Перемотка видео (нажмите или перетащите)"
      >
        <div className="w-full h-2 group-hover/timeline:h-3 bg-white/20 rounded-full relative overflow-hidden transition-all duration-150">
          <div className="h-full bg-accent rounded-full transition-all" style={{ width: `${progressPercent}%` }} />
          {totalDuration > 0 &&
            sceneBoundaries.map((b, i) => (
              <div
                key={i}
                className="absolute top-0 bottom-0 w-[1.5px] bg-black/40 pointer-events-none"
                style={{ left: `${(b / totalDuration) * 100}%` }}
              />
            ))}
        </div>
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-accent border-2 border-black shadow-md pointer-events-none transition-transform group-hover/timeline:scale-125"
          style={{ left: `${progressPercent}%` }}
        />
        {hoverTooltip && !compact && (
          <div
            className="absolute bottom-full mb-2 -translate-x-1/2 px-2.5 py-1 rounded-lg bg-black/80 border border-white/20 text-xs font-mono text-white shadow-2xl pointer-events-none whitespace-nowrap z-40 flex items-center gap-1.5"
            style={{ left: `${Math.max(40, Math.min((timelineRef.current?.clientWidth || 300) - 40, hoverTooltip.x))}px` }}
          >
            <span className="text-accent font-bold">{formatTime(hoverTooltip.sec)}</span>
            <span className="text-zinc-400 font-sans">• {hoverTooltip.sceneTitle}</span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
          <button
            type="button"
            onClick={() => jumpToScene(Math.max(0, currentSceneIndex - 1), 0)}
            disabled={currentSceneIndex === 0}
            className={`p-2 ${deckBtn}`}
            title="Предыдущий кадр"
          >
            <SkipBack size={18} weight="bold" />
          </button>

          <button
            type="button"
            onClick={togglePlay}
            className="w-10 h-10 rounded-xl bg-accent hover:bg-accent-hover text-accent-ink flex items-center justify-center shadow-lg active:scale-95 transition-all cursor-pointer shrink-0"
            title={isPlaying ? "Пауза" : "Воспроизведение"}
          >
            {isPlaying ? <Pause size={18} weight="fill" /> : <Play size={18} weight="fill" className="ml-0.5" />}
          </button>

          <button
            type="button"
            onClick={() => jumpToScene(Math.min(scenes.length - 1, currentSceneIndex + 1), 0)}
            disabled={currentSceneIndex === scenes.length - 1}
            className={`p-2 ${deckBtn}`}
            title="Следующий кадр"
          >
            <SkipForward size={18} weight="bold" />
          </button>

          <button
            type="button"
            onClick={() => setIsMuted(!isMuted)}
            className={`p-2 ${deckBtn} ml-0.5 sm:ml-1`}
            title={isMuted ? "Включить звук" : "Выключить звук"}
          >
            {isMuted ? <SpeakerSimpleX size={18} weight="bold" className="text-rose-400" /> : <SpeakerHigh size={18} weight="bold" />}
          </button>

          <button
            type="button"
            onClick={() => setShowSubtitles(!showSubtitles)}
            className={`p-2 rounded-xl transition-all cursor-pointer ${
              showSubtitles ? "bg-accent text-accent-ink font-black shadow-md" : "bg-white/5 hover:bg-white/15 text-zinc-400"
            }`}
            title="Субтитры"
          >
            <ClosedCaptioning size={18} weight="bold" />
          </button>

          <div className="relative">
            <button
              type="button"
              onClick={() => setShowColorPicker((v) => !v)}
              className="p-2 rounded-xl bg-white/5 hover:bg-white/15 transition-all cursor-pointer flex items-center justify-center"
              title="Цвет субтитров"
              aria-label="Цвет субтитров"
            >
              <span
                className="block w-[18px] h-[18px] rounded-full border-2 border-black/70"
                style={{ backgroundColor: subtitleHex(subtitleColor) }}
              />
            </button>
            {showColorPicker && (
              <div
                className={`absolute z-40 p-2.5 rounded-xl bg-black/90 border border-white/15 shadow-2xl left-1/2 -translate-x-1/2 ${
                  compact ? "top-full mt-2" : "bottom-full mb-2"
                }`}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <SubtitleColorPicker
                  size="sm"
                  value={subtitleColor}
                  onChange={(id) => {
                    setSubtitleColorState(id);
                    setSubtitleColor(id);
                    setShowColorPicker(false);
                    if (!showSubtitles) setShowSubtitles(true);
                  }}
                />
              </div>
            )}
          </div>

          {!compact && (
            <span className="text-xs font-mono font-bold text-zinc-300 ml-2 hidden sm:inline">
              {formatTime(overallElapsed)} / {formatTime(totalDuration)}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {onExportClick && (
            <button
              type="button"
              onClick={onExportClick}
              className="flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-xl bg-accent hover:bg-accent-hover active:scale-95 text-accent-ink text-xs font-black shadow-lg transition-all cursor-pointer"
              title="Скачать видео"
            >
              <DownloadSimple size={16} weight="bold" />
              <span className={compact ? "hidden sm:inline" : ""}>Скачать</span>
            </button>
          )}

          <button
            type="button"
            onClick={toggleFullscreen}
            className={`p-2 ${deckBtn}`}
            title={isFullscreen ? "Свернуть" : "Во весь экран"}
          >
            {isFullscreen ? <ArrowsIn size={18} weight="bold" /> : <ArrowsOut size={18} weight="bold" />}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="w-full max-w-5xl mx-auto space-y-2 sm:space-y-3 select-none">
      {/* Обёртка полноэкранного режима: разворачивается ОНА, кадр внутри letterbox-ится. */}
      <div
        ref={fsWrapperRef}
        className={
          isFullscreen
            ? "fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center"
            : "w-full flex flex-col"
        }
        style={isFullscreen ? { height: "100dvh", paddingBottom: "env(safe-area-inset-bottom, 0px)" } : undefined}
        onPointerMove={revealControls}
        onPointerDown={revealControls}
      >
        <div
          ref={containerRef}
          className="relative rounded-none sm:rounded-2xl overflow-hidden bg-stage border-y sm:border border-white/10 shadow-2xl group"
          style={{
            aspectRatio: frameAspect,
            width: frameWidthCss,
            height: "auto",
            maxWidth: "100%",
            marginInline: "auto",
          }}
        >
          {currentScene?.imageUrl ? (
            <div className="absolute inset-0 overflow-hidden">
              {prevScene?.imageUrl && prevSceneIndex !== currentSceneIndex && (
                <img
                  key={`prev-${prevSceneIndex}`}
                  src={prevScene.imageUrl}
                  alt=""
                  aria-hidden
                  className="absolute inset-0 w-full h-full object-cover"
                />
              )}
              <img
                key={currentSceneIndex}
                ref={imgRef}
                src={currentScene.imageUrl}
                alt={currentScene.title}
                className="absolute inset-0 w-full h-full object-cover animate-xfade will-change-transform"
              />
              <div
                className="absolute inset-x-0 bottom-0 pointer-events-none"
                style={{
                  height: subtitleLayout.scrimH,
                  background: "linear-gradient(to top, rgba(0,0,0,0.72), rgba(0,0,0,0))",
                }}
              />
            </div>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center bg-stage text-center p-6">
              <div className="w-14 h-14 rounded-2xl bg-zinc-900 border border-white/10 flex items-center justify-center text-accent mb-2 shadow-lg">
                <Play size={24} weight="fill" className="ml-1" />
              </div>
              <p className="text-sm font-bold text-white">Кадр {currentSceneIndex + 1}: {currentScene?.title}</p>
              <p className="text-xs text-zinc-400 mt-1">Ожидание медиаданных...</p>
            </div>
          )}

          {isBuffering && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/50 backdrop-blur-sm pointer-events-none">
              <div className="flex items-center gap-2.5 px-4 py-2 rounded-xl bg-black/85 border border-accent/30 text-white shadow-2xl">
                <CircleNotch size={20} weight="bold" className="animate-spin text-accent" />
                <span className="text-xs font-bold">Буферизация сцены...</span>
              </div>
            </div>
          )}

          {/* Верхние пилюли: номер кадра и тайм-код. На телефоне они ужаты,
              название кадра скрыто — раньше оно выталкивало таймер за кадр. */}
          <div className="absolute top-2 sm:top-3.5 left-2 sm:left-3.5 right-2 sm:right-3.5 flex items-center justify-between gap-2 pointer-events-none z-20">
            <div className="min-w-0 shrink px-2 py-1 sm:px-3.5 sm:py-1.5 rounded-lg sm:rounded-xl bg-black/80 backdrop-blur-md border border-white/15 text-[10px] sm:text-xs text-white flex items-center gap-1.5 sm:gap-2.5 shadow-xl">
              <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-accent shrink-0 animate-pulse" />
              <span className="font-extrabold text-accent whitespace-nowrap">
                {compact ? (
                  <>
                    {currentSceneIndex + 1}
                    <span className="text-white/60 font-normal">/{scenes.length}</span>
                  </>
                ) : (
                  <>
                    Кадр {currentSceneIndex + 1} <span className="text-white/60 font-normal">из {scenes.length}</span>
                  </>
                )}
              </span>
              {!compact && (
                <>
                  <span className="text-zinc-600">•</span>
                  <span className="text-zinc-200 font-medium min-w-0 max-w-[28vw] md:max-w-md truncate">
                    {currentScene?.title}
                  </span>
                </>
              )}
            </div>

            <div className="shrink-0 px-2 py-1 sm:px-3.5 sm:py-1.5 rounded-lg sm:rounded-xl bg-black/80 backdrop-blur-md border border-white/15 text-[10px] sm:text-xs font-mono font-bold text-white shadow-xl flex items-center gap-1 sm:gap-1.5 tabular">
              <span className="text-accent">{formatTime(overallElapsed)}</span>
              <span className="text-zinc-500">/</span>
              <span>{formatTime(totalDuration)}</span>
            </div>
          </div>

          {/* Субтитры: кегль и отступ пропорциональны кадру — те же формулы,
              что при выжигании в MP4. В оверлей-режиме карточка приподнимается,
              пока видна дека. */}
          {showSubtitles && subtitleLines.length > 0 && (
            <div
              className="absolute left-0 right-0 flex justify-center z-20 pointer-events-none transition-all duration-200"
              style={{
                bottom: subtitleLayout.bottom + (!compact && controlsVisible ? subtitleLayout.font * 2.4 : 0),
              }}
            >
              <div
                className="text-center"
                style={{
                  maxWidth: subtitleLayout.maxCardW,
                  paddingInline: subtitleLayout.padX,
                  paddingBlock: subtitleLayout.padY,
                }}
              >
                {subtitleLines.map((line, i) => (
                  <span
                    key={i}
                    className="block whitespace-pre"
                    style={{
                      fontFamily: SUBTITLE_FONT_STACK,
                      fontWeight: SUBTITLE_FONT_WEIGHT,
                      fontSize: subtitleLayout.font,
                      lineHeight: `${subtitleLayout.lineHeight}px`,
                      color: subtitleHex(subtitleColor),
                      // Чёрная обводка вместо подложки; paint-order рисует её ПОД заливкой.
                      WebkitTextStroke: `${subtitleLayout.strokeW * 2}px ${SUBTITLE_OUTLINE}`,
                      paintOrder: "stroke fill",
                      textShadow: `0 ${subtitleLayout.shadowOffsetY}px ${subtitleLayout.shadowBlur}px ${SUBTITLE_SHADOW}`,
                    }}
                  >
                    {line}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div onClick={togglePlay} className="absolute inset-0 z-10 flex items-center justify-center cursor-pointer">
            {!isPlaying && !isBuffering && (
              <button
                type="button"
                className="w-14 h-14 sm:w-20 sm:h-20 rounded-2xl bg-accent hover:bg-accent-hover text-accent-ink shadow-2xl flex items-center justify-center hover:scale-105 active:scale-95 transition-all cursor-pointer"
                title="Воспроизвести"
              >
                <Play size={28} weight="fill" className="ml-1" />
              </button>
            )}
          </div>

          {!compact && renderDeck()}
        </div>

        {compact && renderDeck()}
      </div>

      {/* Карусель кадров: на телефоне узкие карточки с прилипанием, без шевронов. */}
      <div className="relative p-2 sm:p-3.5 bg-stage rounded-none sm:rounded-2xl border-y sm:border border-white/10 shadow-xl group/carousel -mx-0">
        <button
          type="button"
          onClick={() => scrollCarousel("left")}
          className="hidden [@media(hover:hover)]:flex absolute left-1.5 top-1/2 -translate-y-1/2 z-20 w-8 h-8 rounded-full bg-black/85 hover:bg-black text-white hover:text-accent border border-white/20 items-center justify-center shadow-xl transition-all cursor-pointer"
          title="Прокрутить назад"
        >
          <CaretLeft size={18} weight="bold" />
        </button>
        <button
          type="button"
          onClick={() => scrollCarousel("right")}
          className="hidden [@media(hover:hover)]:flex absolute right-1.5 top-1/2 -translate-y-1/2 z-20 w-8 h-8 rounded-full bg-black/85 hover:bg-black text-white hover:text-accent border border-white/20 items-center justify-center shadow-xl transition-all cursor-pointer"
          title="Прокрутить вперед"
        >
          <CaretRight size={18} weight="bold" />
        </button>

        <div
          ref={carouselRef}
          className="flex gap-2 sm:gap-3 overflow-x-auto px-2 [@media(hover:hover)]:px-6 pb-1 scroll-smooth snap-x snap-proximity no-scrollbar"
        >
          {scenes.map((scene, idx) => {
            const isSelected = idx === currentSceneIndex;
            return (
              <button
                key={scene.id || idx}
                onClick={() => jumpToScene(idx, 0)}
                className={`snap-center shrink-0 ${
                  frameOrientation === "portrait" ? "w-20 sm:w-24 md:w-28" : "w-24 sm:w-36 md:w-44"
                } text-left rounded-xl p-1.5 sm:p-2 transition-all duration-150 border cursor-pointer ${
                  isSelected
                    ? "border-accent bg-white/[0.06] shadow-lg ring-1 ring-accent/40 scale-[1.02]"
                    : "border-white/10 hover:border-white/25 bg-black/40"
                }`}
              >
                <div className="w-full rounded-lg overflow-hidden bg-black mb-1.5 sm:mb-2 relative" style={{ aspectRatio: frameAspect }}>
                  {scene.imageUrl ? (
                    <img src={scene.imageUrl} alt={scene.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-xs font-medium text-zinc-500">
                      Кадр {idx + 1}
                    </div>
                  )}
                  <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded-md bg-black/85 text-[10px] font-mono font-bold text-white border border-white/10">
                    {Math.round(durOf(idx))}с
                  </span>
                  {isSelected && <span className="absolute top-1 left-1 w-2.5 h-2.5 rounded-full bg-accent" />}
                </div>
                <p className="text-[11px] sm:text-xs font-bold text-white truncate">
                  {idx + 1}. {scene.title}
                </p>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
