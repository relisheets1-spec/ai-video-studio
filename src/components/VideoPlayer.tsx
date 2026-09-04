"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  Download,
  Subtitles,
  Loader2,
} from "lucide-react";
import { Scene } from "@/lib/types";

interface VideoPlayerProps {
  title: string;
  scenes: Scene[];
  onExportClick?: () => void;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({ title, scenes, onExportClick }) => {
  const [currentSceneIndex, setCurrentSceneIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [showSubtitles, setShowSubtitles] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [sceneElapsed, setSceneElapsed] = useState(0);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const audioCacheRef = useRef<Map<number, HTMLAudioElement>>(new Map());
  const animFrameRef = useRef<number | null>(null);
  const isPlayingRef = useRef(false);
  isPlayingRef.current = isPlaying;

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
      // Pause current audio
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
    // Cleanup previous audio elements
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

  // High precision playback loop using requestAnimationFrame (60 FPS smooth, zero desync)
  useEffect(() => {
    let lastTime = performance.now();

    const tick = () => {
      const activeAudio = audioCacheRef.current.get(currentSceneIndex);

      if (activeAudio && !activeAudio.paused) {
        setSceneElapsed(activeAudio.currentTime);
      } else if (!activeAudio && isPlaying) {
        // Fallback timer for scenes without audio track
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
  };

  const handleSeek = (targetSec: number) => {
    let accumulated = 0;
    for (let i = 0; i < scenes.length; i++) {
      const dur = scenes[i].durationEstimate || 17;
      if (targetSec <= accumulated + dur || i === scenes.length - 1) {
        const offsetInScene = Math.max(0, targetSec - accumulated);
        jumpToScene(i, offsetInScene);
        break;
      }
      accumulated += dur;
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

  return (
    <div className="w-full max-w-5xl mx-auto space-y-3">
      {/* Screen Container */}
      <div
        ref={containerRef}
        className="relative aspect-video w-full rounded-2xl overflow-hidden bg-black border border-white/10 shadow-2xl select-none group"
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
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-black/30 pointer-events-none" />
          </div>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-zinc-950 text-center p-6">
            <div className="w-14 h-14 rounded-full bg-zinc-900 flex items-center justify-center text-white mb-2">
              <Play className="w-6 h-6 ml-0.5" />
            </div>
            <p className="text-xs text-zinc-400">Кадр {currentSceneIndex + 1}: {currentScene?.title}</p>
          </div>
        )}

        {/* Buffering Indicator */}
        {isBuffering && (
          <div className="absolute inset-0 z-25 flex items-center justify-center bg-black/40 backdrop-blur-xs pointer-events-none">
            <div className="flex items-center gap-3 px-5 py-2.5 rounded-full bg-black/80 border border-white/15 text-white shadow-xl">
              <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
              <span className="text-sm font-semibold">Буферизация...</span>
            </div>
          </div>
        )}

        {/* Top status bar */}
        <div className="absolute top-4 left-4 right-4 flex items-center justify-between pointer-events-none z-20">
          <div className="px-4 py-2 rounded-full bg-black/80 backdrop-blur-md border border-white/15 text-sm text-zinc-100 flex items-center gap-2.5 shadow-lg">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse shrink-0" />
            <span className="font-semibold">Кадр {currentSceneIndex + 1} из {scenes.length}</span>
            <span className="text-zinc-500">•</span>
            <span className="text-zinc-300 max-w-sm truncate">{currentScene?.title}</span>
          </div>

          <div className="px-4 py-2 rounded-full bg-black/80 backdrop-blur-md border border-white/15 text-sm font-mono font-bold text-white shadow-lg">
            {formatTime(overallElapsed)} / {formatTime(totalDuration)}
          </div>
        </div>

        {/* Subtitles (Clean float safely above player controls) */}
        {showSubtitles && currentScene?.narration && (
          <div className="absolute bottom-28 sm:bottom-32 left-6 right-6 flex justify-center z-20 pointer-events-none transition-all">
            <div className="max-w-3xl px-6 sm:px-8 py-3.5 sm:py-4 rounded-2xl bg-black/90 backdrop-blur-md border border-white/20 text-center shadow-2xl">
              <p className="text-base sm:text-lg md:text-xl font-bold text-white leading-relaxed tracking-wide drop-shadow-md">
                {currentScene.narration}
              </p>
            </div>
          </div>
        )}

        {/* Click to play overlay */}
        <div
          onClick={togglePlay}
          className="absolute inset-0 z-10 flex items-center justify-center cursor-pointer"
        >
          {!isPlaying && !isBuffering && (
            <button
              type="button"
              className="w-20 h-20 rounded-full bg-blue-600 text-white shadow-2xl shadow-blue-600/50 flex items-center justify-center hover:scale-110 active:scale-95 transition-all"
            >
              <Play className="w-9 h-9 ml-1 fill-current" />
            </button>
          )}
        </div>

        {/* Bottom Controls */}
        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black via-black/85 to-transparent pt-8 pb-4 px-6 z-30 flex flex-col gap-3">
          {/* Timeline Bar */}
          <div
            className="w-full h-2.5 hover:h-4 bg-white/20 rounded-full cursor-pointer transition-all relative overflow-hidden group/timeline"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const clickPercent = (e.clientX - rect.left) / rect.width;
              handleSeek(clickPercent * totalDuration);
            }}
          >
            <div
              className="h-full bg-blue-500 rounded-full transition-all group-hover/timeline:bg-blue-400"
              style={{ width: `${Math.min(100, (overallElapsed / (totalDuration || 1)) * 100)}%` }}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <button
                onClick={() => {
                  const targetIdx = Math.max(0, currentSceneIndex - 1);
                  jumpToScene(targetIdx, 0);
                }}
                disabled={currentSceneIndex === 0}
                className="p-2.5 rounded-xl hover:bg-white/15 text-zinc-200 disabled:opacity-30 transition-colors cursor-pointer"
                title="Предыдущий кадр"
              >
                <SkipBack className="w-5 h-5" />
              </button>

              <button
                onClick={togglePlay}
                className="w-11 h-11 rounded-full bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center shadow-lg shadow-blue-600/30 hover:scale-105 active:scale-95 transition-all cursor-pointer"
                title={isPlaying ? "Пауза" : "Воспроизведение"}
              >
                {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 ml-0.5 fill-current" />}
              </button>

              <button
                onClick={() => {
                  const targetIdx = Math.min(scenes.length - 1, currentSceneIndex + 1);
                  jumpToScene(targetIdx, 0);
                }}
                disabled={currentSceneIndex === scenes.length - 1}
                className="p-2.5 rounded-xl hover:bg-white/15 text-zinc-200 disabled:opacity-30 transition-colors cursor-pointer"
                title="Следующий кадр"
              >
                <SkipForward className="w-5 h-5" />
              </button>

              <button
                onClick={() => setIsMuted(!isMuted)}
                className="p-2.5 rounded-xl hover:bg-white/15 text-zinc-200 transition-colors ml-1 cursor-pointer"
                title={isMuted ? "Включить звук" : "Выключить звук"}
              >
                {isMuted ? <VolumeX className="w-5 h-5 text-rose-400" /> : <Volume2 className="w-5 h-5" />}
              </button>

              <button
                onClick={() => setShowSubtitles(!showSubtitles)}
                className={`p-2.5 rounded-xl transition-all cursor-pointer ${
                  showSubtitles ? "bg-blue-600 text-white shadow-md shadow-blue-600/30" : "hover:bg-white/15 text-zinc-400"
                }`}
                title="Субтитры"
              >
                <Subtitles className="w-5 h-5" />
              </button>

              <span className="text-sm font-mono font-semibold text-zinc-300 ml-3 hidden sm:inline">
                {formatTime(overallElapsed)} / {formatTime(totalDuration)}
              </span>
            </div>

            <div className="flex items-center gap-3">
              {onExportClick && (
                <button
                  onClick={onExportClick}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold shadow-lg shadow-blue-600/30 hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Скачать MP4 (1080p)</span>
                </button>
              )}

              <button
                onClick={toggleFullscreen}
                className="p-2.5 rounded-xl hover:bg-white/15 text-zinc-200 transition-colors cursor-pointer"
                title="Во весь экран"
              >
                {isFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Frame Carousel */}
      <div className="p-4 bg-zinc-950 rounded-2xl border border-zinc-800">
        <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-thin">
          {scenes.map((scene, idx) => (
            <button
              key={scene.id || idx}
              onClick={() => jumpToScene(idx, 0)}
              className={`shrink-0 w-36 sm:w-44 text-left rounded-xl p-2 transition-all border cursor-pointer ${
                idx === currentSceneIndex
                  ? "border-blue-500 bg-blue-950/40 ring-2 ring-blue-500/40 shadow-lg shadow-blue-600/10"
                  : "border-zinc-800 hover:border-zinc-700 bg-zinc-900/70"
              }`}
            >
              <div className="aspect-video w-full rounded-lg overflow-hidden bg-black mb-2 relative">
                {scene.imageUrl ? (
                  <img src={scene.imageUrl} alt={scene.title} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-xs font-semibold text-zinc-500">
                    Кадр {idx + 1}
                  </div>
                )}
                <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded-md bg-black/85 text-[11px] font-mono font-bold text-zinc-200">
                  {scene.durationEstimate || 17}с
                </span>
              </div>
              <p className="text-xs sm:text-sm font-semibold text-zinc-200 truncate">
                {idx + 1}. {scene.title}
              </p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
