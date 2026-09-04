"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
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

interface VideoPlayerProps {
  title: string;
  scenes: Scene[];
  onExportClick?: () => void;
}

// Robust NLP sentence splitter for RU & KZ narration:
// - Preserves decimal numbers (e.g. 1.5 млн)
// - Preserves abbreviations (г., н.э., т.е., млрд., руб.)
// - Preserves closing quotation marks and brackets
// - Gracefully chunks sentences without punctuation to prevent massive blocks
export function splitNarrationIntoSentences(text: string): string[] {
  if (!text) return [];
  const clean = text.trim();
  if (!clean) return [];

  // 1. Protect decimal numbers (e.g. 1.5 -> 1\uFFF05)
  let protectedText = clean.replace(/(\d+)\.(\d+)/g, "$1\uFFF0$2");

  // 2. Protect known abbreviation patterns
  protectedText = protectedText.replace(
    /\b(г|гг|в|вв|н\.э|до н\.э|т\.е|т\.д|т\.п|млн|млрд|тыс|руб|долл|ж|жж|ғ|ғғ)\./gi,
    (m) => m.replace(/\./g, "\uFFF0")
  );

  // Also protect dots followed by lowercase letters/digits (continuation of clause/abbreviation)
  protectedText = protectedText.replace(/\.(?=\s*[а-яёәғқңөұүһa-z0-9])/g, "\uFFF0");

  // 3. Match sentences ending in [.!?…] followed by optional quotes/brackets or end of string
  const regex = /[^.!?…\n]+(?:[.!?…]+["'»”’\)\]]*(?=\s|$)|$)/g;
  const rawSentences: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(protectedText)) !== null) {
    const s = match[0].replace(/\uFFF0/g, ".").trim();
    if (s) rawSentences.push(s);
  }

  // 4. If a piece has no punctuation and is long (> 16 words), chunk it gracefully
  const finalSentences: string[] = [];
  for (const sent of rawSentences) {
    const words = sent.split(/\s+/).filter(Boolean);
    if (words.length > 16 && !/[.!?…]/.test(sent)) {
      for (let i = 0; i < words.length; i += 8) {
        finalSentences.push(words.slice(i, i + 8).join(" "));
      }
    } else {
      finalSentences.push(sent);
    }
  }

  return finalSentences.length > 0 ? finalSentences : [clean];
}

// Determine active sentence proportionally to playback progress in current scene
export function getActiveSentence(text: string, elapsedSec: number, sceneDuration: number): string {
  if (!text) return "";
  const sentences = splitNarrationIntoSentences(text);
  if (sentences.length <= 1) return sentences[0] || text.trim();

  const weights = sentences.map((s) => Math.max(s.length, 12));
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  const dur = Math.max(sceneDuration, 1);
  const progress = Math.min(0.999, Math.max(0, elapsedSec / dur));
  const currentThreshold = progress * totalWeight;

  let accumulated = 0;
  for (let i = 0; i < sentences.length; i++) {
    accumulated += weights[i];
    if (currentThreshold <= accumulated || i === sentences.length - 1) {
      return sentences[i];
    }
  }
  return sentences[0];
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({ title, scenes, onExportClick }) => {
  const [currentSceneIndex, setCurrentSceneIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [showSubtitles, setShowSubtitles] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [sceneElapsed, setSceneElapsed] = useState(0);

  // Timeline scrubber interactive states
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [hoverTooltip, setHoverTooltip] = useState<{ sec: number; x: number; sceneTitle: string } | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const carouselRef = useRef<HTMLDivElement | null>(null);
  const audioCacheRef = useRef<Map<number, HTMLAudioElement>>(new Map());
  const animFrameRef = useRef<number | null>(null);
  const isPlayingRef = useRef(false);
  isPlayingRef.current = isPlaying;
  const wasPlayingBeforeScrubRef = useRef(false);

  const currentSceneIndexRef = useRef(0);
  currentSceneIndexRef.current = currentSceneIndex;

  // Preload all scene images into memory immediately
  useEffect(() => {
    if (!scenes || scenes.length === 0) return;
    scenes.forEach((s) => {
      if (s.imageUrl) {
        const img = new Image();
        img.src = s.imageUrl;
      }
    });
  }, [scenes]);

  // Advance to next scene seamlessly
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
        // End of video reached
        setIsPlaying(false);
        setCurrentSceneIndex(0);
        setSceneElapsed(0);
        setIsBuffering(false);
      }
    },
    [scenes.length]
  );

  // Pre-instantiate and buffer all audio elements so switching scenes takes 0ms
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
        audio.muted = isMuted;

        audio.onwaiting = () => {
          if (currentSceneIndexRef.current === index) {
            setIsBuffering(true);
          }
        };

        audio.onplaying = () => {
          if (currentSceneIndexRef.current === index) {
            setIsBuffering(false);
          }
        };

        audio.onended = () => {
          if (currentSceneIndexRef.current === index) {
            handleAdvanceScene(index + 1);
          }
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
  }, [scenes, handleAdvanceScene, isMuted]);

  // Sync mute state across all cached audio elements
  useEffect(() => {
    audioCacheRef.current.forEach((audio) => {
      audio.muted = isMuted;
    });
  }, [isMuted]);

  const currentScene = scenes[currentSceneIndex] || scenes[0];
  const sceneDuration = currentScene?.durationEstimate || 17;

  const totalDuration = scenes.reduce((acc, s) => acc + (s.durationEstimate || 17), 0);

  const elapsedPriorScenes = scenes
    .slice(0, currentSceneIndex)
    .reduce((acc, s) => acc + (s.durationEstimate || 17), 0);
  const overallElapsed = elapsedPriorScenes + sceneElapsed;

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  // Play / Pause toggle
  const togglePlay = () => {
    const activeAudio = audioCacheRef.current.get(currentSceneIndex);

    if (isPlaying) {
      setIsPlaying(false);
      if (activeAudio) activeAudio.pause();
    } else {
      setIsPlaying(true);
      if (activeAudio) {
        activeAudio.play().catch((err) => console.warn("Audio play rejected:", err));
      }
    }
  };

  // High precision playback loop using requestAnimationFrame
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

      if (isPlaying) {
        animFrameRef.current = requestAnimationFrame(tick);
      }
    };

    if (isPlaying) {
      animFrameRef.current = requestAnimationFrame(tick);
    } else {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    }

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isPlaying, currentSceneIndex, sceneDuration, handleAdvanceScene]);

  // Jump to specific scene or frame
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
      if (isPlaying) {
        targetAudio.play().catch(console.warn);
      }
    }

    // Scroll scene card into view in carousel
    if (carouselRef.current) {
      const targetCard = carouselRef.current.children[targetIndex] as HTMLElement;
      if (targetCard) {
        targetCard.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
      }
    }
  };

  const handleSeek = (targetSec: number) => {
    const clamped = Math.max(0, Math.min(totalDuration, targetSec));
    let accumulated = 0;
    for (let i = 0; i < scenes.length; i++) {
      const dur = scenes[i].durationEstimate || 17;
      if (clamped <= accumulated + dur || i === scenes.length - 1) {
        const offsetInScene = Math.max(0, clamped - accumulated);
        jumpToScene(i, offsetInScene);
        break;
      }
      accumulated += dur;
    }
  };

  const seekFromPointer = (e: React.PointerEvent<HTMLDivElement>, shouldResume: boolean = false) => {
    if (!timelineRef.current) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const targetSec = percent * totalDuration;

    let accumulated = 0;
    for (let i = 0; i < scenes.length; i++) {
      const dur = scenes[i].durationEstimate || 17;
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
          if (shouldResume) {
            targetAudio.play().catch((err) => console.log("Audio seek resume:", err));
          }
        }
        break;
      }
      accumulated += dur;
    }
  };

  // Timeline scrubber mouse/pointer interactions
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

    // Determine which scene is at targetSec for tooltip
    let accumulated = 0;
    let sceneName = scenes[0]?.title || "";
    for (let i = 0; i < scenes.length; i++) {
      const dur = scenes[i].durationEstimate || 17;
      if (targetSec <= accumulated + dur || i === scenes.length - 1) {
        sceneName = `Кадр ${i + 1}: ${scenes[i]?.title}`;
        break;
      }
      accumulated += dur;
    }

    setHoverTooltip({
      sec: targetSec,
      x: e.clientX - rect.left,
      sceneTitle: sceneName,
    });

    if (isScrubbing) {
      seekFromPointer(e, false);
    }
  };

  const handleTimelinePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    setIsScrubbing(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}

    seekFromPointer(e, wasPlayingBeforeScrubRef.current);

    if (carouselRef.current) {
      const targetCard = carouselRef.current.children[currentSceneIndexRef.current] as HTMLElement;
      if (targetCard) {
        targetCard.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
      }
    }
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(console.error);
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(console.error);
      setIsFullscreen(false);
    }
  };

  // Carousel horizontal scroll buttons
  const scrollCarousel = (direction: "left" | "right") => {
    if (!carouselRef.current) return;
    const scrollAmount = direction === "left" ? -280 : 280;
    carouselRef.current.scrollBy({ left: scrollAmount, behavior: "smooth" });
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

  // Scene boundaries for tick marks on timeline
  const sceneBoundaries: number[] = [];
  let accumSec = 0;
  for (let i = 0; i < scenes.length - 1; i++) {
    accumSec += scenes[i].durationEstimate || 17;
    sceneBoundaries.push(accumSec);
  }

  // Active sentence calculation for current scene (sentence-by-sentence)
  const activeSentence = getActiveSentence(
    currentScene?.narration || "",
    sceneElapsed,
    sceneDuration
  );

  const progressPercent = Math.min(100, (overallElapsed / (totalDuration || 1)) * 100);

  return (
    <div className="w-full max-w-5xl mx-auto space-y-3 select-none">
      {/* Screen Container */}
      <div
        ref={containerRef}
        className="relative aspect-video w-full rounded-2xl overflow-hidden bg-stage border border-white/10 shadow-2xl group"
      >
        {/* Visual Frame */}
        {currentScene?.imageUrl ? (
          <div className="absolute inset-0 overflow-hidden">
            <img
              key={currentSceneIndex}
              src={currentScene.imageUrl}
              alt={currentScene.title}
              className="w-full h-full object-cover animate-ken-burns"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-black/35 pointer-events-none" />
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

        {/* Buffering Indicator */}
        {isBuffering && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/50 backdrop-blur-sm pointer-events-none">
            <div className="flex items-center gap-2.5 px-4 py-2 rounded-xl bg-black/85 border border-accent/30 text-white shadow-2xl">
              <CircleNotch size={20} weight="bold" className="animate-spin text-accent" />
              <span className="text-xs font-bold">Буферизация сцены...</span>
            </div>
          </div>
        )}

        {/* Top Header Bar */}
        <div className="absolute top-3.5 left-3.5 right-3.5 flex items-center justify-between pointer-events-none z-20">
          <div className="px-3.5 py-1.5 rounded-xl bg-black/80 backdrop-blur-md border border-white/15 text-xs text-white flex items-center gap-2.5 shadow-xl">
            <span className="w-2 h-2 rounded-full bg-accent shrink-0 animate-pulse" />
            <span className="font-extrabold text-accent">
              Кадр {currentSceneIndex + 1} <span className="text-white/60 font-normal">из {scenes.length}</span>
            </span>
            <span className="text-zinc-600">•</span>
            <span className="text-zinc-200 font-medium max-w-xs sm:max-w-md truncate">
              {currentScene?.title}
            </span>
          </div>

          <div className="px-3.5 py-1.5 rounded-xl bg-black/80 backdrop-blur-md border border-white/15 text-xs font-mono font-bold text-white shadow-xl flex items-center gap-1.5">
            <span className="text-accent">{formatTime(overallElapsed)}</span>
            <span className="text-zinc-500">/</span>
            <span>{formatTime(totalDuration)}</span>
          </div>
        </div>

        {/* Subtitles: STRICTLY ~70% screen width, +10% larger text, ONE sentence at a time */}
        {showSubtitles && activeSentence && (
          <div className="absolute bottom-16 sm:bottom-20 left-0 right-0 flex justify-center z-20 pointer-events-none px-4 transition-all duration-150">
            <div className="w-[70%] max-w-[70%] px-4 sm:px-6 py-2.5 sm:py-3.5 rounded-2xl bg-black/85 backdrop-blur-md border border-white/20 text-center shadow-2xl">
              <p className="text-[16px] sm:text-[20px] md:text-[22px] font-extrabold text-white leading-snug tracking-wide drop-shadow-lg">
                {activeSentence}
              </p>
            </div>
          </div>
        )}

        {/* Click overlay for Play / Pause toggle */}
        <div
          onClick={togglePlay}
          className="absolute inset-0 z-10 flex items-center justify-center cursor-pointer"
        >
          {!isPlaying && !isBuffering && (
            <button
              type="button"
              className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-accent hover:bg-accent-hover text-accent-ink shadow-2xl flex items-center justify-center hover:scale-105 active:scale-95 transition-all cursor-pointer"
              title="Воспроизвести"
            >
              <Play size={32} weight="fill" className="ml-1" />
            </button>
          )}
        </div>

        {/* Bottom Floating Control Deck */}
        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black via-black/90 to-transparent pt-8 pb-3 px-4 sm:px-5 z-30 flex flex-col gap-2.5">
          {/* Enhanced Responsive Timeline Scrubber with Drag, Tick marks & Tooltip */}
          <div
            ref={timelineRef}
            onPointerDown={handleTimelinePointerDown}
            onPointerMove={handleTimelinePointerMove}
            onPointerUp={handleTimelinePointerUp}
            onPointerLeave={() => setHoverTooltip(null)}
            className="w-full py-2 cursor-pointer relative group/timeline select-none touch-none"
            title="Перемотка видео (нажмите или перетащите)"
          >
            {/* Scrubber Track */}
            <div className="w-full h-2 group-hover/timeline:h-3 bg-white/20 rounded-full relative overflow-hidden transition-all duration-150">
              {/* Progress Bar */}
              <div
                className="h-full bg-accent rounded-full transition-all"
                style={{ width: `${progressPercent}%` }}
              />

              {/* Scene boundary tick marks */}
              {totalDuration > 0 &&
                sceneBoundaries.map((b, i) => (
                  <div
                    key={i}
                    className="absolute top-0 bottom-0 w-[1.5px] bg-black/40 pointer-events-none"
                    style={{ left: `${(b / totalDuration) * 100}%` }}
                  />
                ))}
            </div>

            {/* Glowing Scrubber Thumb Head */}
            <div
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-accent border-2 border-black shadow-md pointer-events-none transition-transform group-hover/timeline:scale-125"
              style={{ left: `${progressPercent}%` }}
            />

            {/* Hover Tooltip */}
            {hoverTooltip && (
              <div
                className="absolute bottom-full mb-2 -translate-x-1/2 px-2.5 py-1 rounded-lg bg-black/80 border border-white/20 text-xs font-mono text-white shadow-2xl pointer-events-none whitespace-nowrap z-40 flex items-center gap-1.5"
                style={{ left: `${Math.max(40, Math.min((timelineRef.current?.clientWidth || 300) - 40, hoverTooltip.x))}px` }}
              >
                <span className="text-accent font-bold">{formatTime(hoverTooltip.sec)}</span>
                <span className="text-zinc-400 font-sans">• {hoverTooltip.sceneTitle}</span>
              </div>
            )}
          </div>

          {/* Player Buttons Bar */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {/* Prev Scene Button */}
              <button
                type="button"
                onClick={() => {
                  const targetIdx = Math.max(0, currentSceneIndex - 1);
                  jumpToScene(targetIdx, 0);
                }}
                disabled={currentSceneIndex === 0}
                className="p-2 rounded-xl bg-white/5 hover:bg-white/15 text-zinc-200 disabled:opacity-30 transition-all cursor-pointer"
                title="Предыдущий кадр"
              >
                <SkipBack size={18} weight="bold" />
              </button>

              {/* Play / Pause Main Button */}
              <button
                type="button"
                onClick={togglePlay}
                className="w-10 h-10 rounded-xl bg-accent hover:bg-accent-hover text-accent-ink flex items-center justify-center shadow-lg active:scale-95 transition-all cursor-pointer"
                title={isPlaying ? "Пауза" : "Воспроизведение"}
              >
                {isPlaying ? <Pause size={18} weight="fill" /> : <Play size={18} weight="fill" className="ml-0.5" />}
              </button>

              {/* Next Scene Button */}
              <button
                type="button"
                onClick={() => {
                  const targetIdx = Math.min(scenes.length - 1, currentSceneIndex + 1);
                  jumpToScene(targetIdx, 0);
                }}
                disabled={currentSceneIndex === scenes.length - 1}
                className="p-2 rounded-xl bg-white/5 hover:bg-white/15 text-zinc-200 disabled:opacity-30 transition-all cursor-pointer"
                title="Следующий кадр"
              >
                <SkipForward size={18} weight="bold" />
              </button>

              {/* Volume / Mute */}
              <button
                type="button"
                onClick={() => setIsMuted(!isMuted)}
                className="p-2 rounded-xl bg-white/5 hover:bg-white/15 text-zinc-200 transition-all cursor-pointer ml-1"
                title={isMuted ? "Включить звук" : "Выключить звук"}
              >
                {isMuted ? <SpeakerSimpleX size={18} weight="bold" className="text-rose-400" /> : <SpeakerHigh size={18} weight="bold" />}
              </button>

              {/* Subtitles Toggle */}
              <button
                type="button"
                onClick={() => setShowSubtitles(!showSubtitles)}
                className={`p-2 rounded-xl transition-all cursor-pointer ${
                  showSubtitles
                    ? "bg-accent text-accent-ink font-black shadow-md"
                    : "bg-white/5 hover:bg-white/15 text-zinc-400"
                }`}
                title="Субтитры"
              >
                <ClosedCaptioning size={18} weight="bold" />
              </button>

              {/* Time display */}
              <span className="text-xs font-mono font-bold text-zinc-300 ml-2 hidden sm:inline">
                {formatTime(overallElapsed)} / {formatTime(totalDuration)}
              </span>
            </div>

            {/* Right Buttons: Export & Fullscreen */}
            <div className="flex items-center gap-2">
              {onExportClick && (
                <button
                  type="button"
                  onClick={onExportClick}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-accent hover:bg-accent-hover active:scale-95 text-accent-ink text-xs font-black shadow-lg transition-all cursor-pointer"
                >
                  <DownloadSimple size={16} weight="bold" />
                  <span>Скачать MP4</span>
                </button>
              )}

              <button
                type="button"
                onClick={toggleFullscreen}
                className="p-2 rounded-xl bg-white/5 hover:bg-white/15 text-zinc-200 transition-all cursor-pointer"
                title={isFullscreen ? "Свернуть" : "Во весь экран"}
              >
                {isFullscreen ? <ArrowsIn size={18} weight="bold" /> : <ArrowsOut size={18} weight="bold" />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Frame Carousel with Left/Right Scroll Chevrons & Smooth Wheel Navigation */}
      <div className="relative p-3.5 bg-stage rounded-2xl border border-white/10 shadow-xl group/carousel">
        {/* Left Scroll Chevron */}
        <button
          type="button"
          onClick={() => scrollCarousel("left")}
          className="absolute left-1.5 top-1/2 -translate-y-1/2 z-20 w-8 h-8 rounded-full bg-black/85 hover:bg-black text-white hover:text-accent border border-white/20 flex items-center justify-center shadow-xl transition-all cursor-pointer"
          title="Прокрутить назад"
        >
          <CaretLeft size={18} weight="bold" />
        </button>

        {/* Right Scroll Chevron */}
        <button
          type="button"
          onClick={() => scrollCarousel("right")}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 z-20 w-8 h-8 rounded-full bg-black/85 hover:bg-black text-white hover:text-accent border border-white/20 flex items-center justify-center shadow-xl transition-all cursor-pointer"
          title="Прокрутить вперед"
        >
          <CaretRight size={18} weight="bold" />
        </button>

        {/* Carousel Tracks */}
        <div
          ref={carouselRef}
          className="flex gap-3 overflow-x-auto px-6 pb-1 scroll-smooth"
        >
          {scenes.map((scene, idx) => {
            const isSelected = idx === currentSceneIndex;
            return (
              <button
                key={scene.id || idx}
                onClick={() => jumpToScene(idx, 0)}
                className={`shrink-0 w-36 sm:w-44 text-left rounded-xl p-2 transition-all duration-150 border cursor-pointer ${
                  isSelected
                    ? "border-accent bg-white/[0.06] shadow-lg ring-1 ring-accent/40 scale-[1.02]"
                    : "border-white/10 hover:border-white/25 bg-black/40"
                }`}
              >
                <div className="aspect-video w-full rounded-lg overflow-hidden bg-black mb-2 relative">
                  {scene.imageUrl ? (
                    <img src={scene.imageUrl} alt={scene.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-xs font-medium text-zinc-500">
                      Кадр {idx + 1}
                    </div>
                  )}
                  <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded-md bg-black/85 text-[10px] font-mono font-bold text-white border border-white/10">
                    {scene.durationEstimate || 17}с
                  </span>
                  {isSelected && (
                    <span className="absolute top-1 left-1 w-2.5 h-2.5 rounded-full bg-accent" />
                  )}
                </div>
                <p className="text-xs font-bold text-white truncate">
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
