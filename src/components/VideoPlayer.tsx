"use client";

import React, { useState, useEffect, useRef } from "react";
import { Play, Pause, SkipForward, SkipBack, Volume2, VolumeX, Maximize2, Minimize2, Download, Subtitles } from "lucide-react";
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

  const [sceneElapsed, setSceneElapsed] = useState(0);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

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

  // Audio setup for current scene
  useEffect(() => {
    if (!audioRef.current) return;

    if (currentScene?.audioUrl) {
      audioRef.current.src = currentScene.audioUrl;
      audioRef.current.load();
      if (isPlaying) {
        audioRef.current.play().catch((err) => {
          console.log("Audio waiting:", err);
        });
      }
    } else {
      audioRef.current.pause();
    }
  }, [currentSceneIndex, currentScene?.audioUrl]);

  // Master timer to ensure video never hangs
  useEffect(() => {
    if (isPlaying) {
      timerRef.current = setInterval(() => {
        setSceneElapsed((prev) => {
          if (audioRef.current && !audioRef.current.paused && audioRef.current.currentTime > 0) {
            return audioRef.current.currentTime;
          }

          const next = prev + 0.2;
          if (next >= sceneDuration) {
            if (currentSceneIndex < scenes.length - 1) {
              setCurrentSceneIndex((idx) => idx + 1);
              return 0;
            } else {
              setIsPlaying(false);
              setCurrentSceneIndex(0);
              return 0;
            }
          }
          return next;
        });
      }, 200);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPlaying, currentSceneIndex, sceneDuration, scenes.length]);

  const handleAudioEnded = () => {
    if (currentSceneIndex < scenes.length - 1) {
      setCurrentSceneIndex((prev) => prev + 1);
      setSceneElapsed(0);
    } else {
      setIsPlaying(false);
      setCurrentSceneIndex(0);
      setSceneElapsed(0);
    }
  };

  const togglePlay = () => {
    if (isPlaying) {
      if (audioRef.current) audioRef.current.pause();
      setIsPlaying(false);
    } else {
      setIsPlaying(true);
      if (audioRef.current && currentScene?.audioUrl) {
        audioRef.current.play().catch(console.warn);
      }
    }
  };

  const handleSeek = (targetSec: number) => {
    let accumulated = 0;
    for (let i = 0; i < scenes.length; i++) {
      const dur = scenes[i].durationEstimate || 17;
      if (targetSec <= accumulated + dur || i === scenes.length - 1) {
        setCurrentSceneIndex(i);
        const offsetInScene = Math.max(0, targetSec - accumulated);
        setSceneElapsed(offsetInScene);
        if (audioRef.current) {
          audioRef.current.currentTime = offsetInScene;
        }
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
      <audio
        ref={audioRef}
        onEnded={handleAudioEnded}
        muted={isMuted}
        preload="auto"
      />

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

        {/* Subtitles (+10% size increase for bold, crystal-clear readability) */}
        {showSubtitles && currentScene?.narration && (
          <div className="absolute bottom-24 left-6 right-6 flex justify-center z-20 pointer-events-none">
            <div className="max-w-4xl px-7 py-4 rounded-2xl bg-black/85 backdrop-blur-md border border-white/20 text-center shadow-2xl">
              <p className="text-lg sm:text-xl md:text-2xl font-bold text-white leading-relaxed tracking-wide drop-shadow-md">
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
          {!isPlaying && (
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
                  setCurrentSceneIndex((prev) => Math.max(0, prev - 1));
                  setSceneElapsed(0);
                }}
                disabled={currentSceneIndex === 0}
                className="p-2.5 rounded-xl hover:bg-white/15 text-zinc-200 disabled:opacity-30 transition-colors"
                title="Предыдущий кадр"
              >
                <SkipBack className="w-5 h-5" />
              </button>

              <button
                onClick={togglePlay}
                className="w-11 h-11 rounded-full bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center shadow-lg shadow-blue-600/30 hover:scale-105 active:scale-95 transition-all"
                title={isPlaying ? "Пауза" : "Воспроизведение"}
              >
                {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 ml-0.5 fill-current" />}
              </button>

              <button
                onClick={() => {
                  setCurrentSceneIndex((prev) => Math.min(scenes.length - 1, prev + 1));
                  setSceneElapsed(0);
                }}
                disabled={currentSceneIndex === scenes.length - 1}
                className="p-2.5 rounded-xl hover:bg-white/15 text-zinc-200 disabled:opacity-30 transition-colors"
                title="Следующий кадр"
              >
                <SkipForward className="w-5 h-5" />
              </button>

              <button
                onClick={() => {
                  if (audioRef.current) audioRef.current.muted = !isMuted;
                  setIsMuted(!isMuted);
                }}
                className="p-2.5 rounded-xl hover:bg-white/15 text-zinc-200 transition-colors ml-1"
                title={isMuted ? "Включить звук" : "Выключить звук"}
              >
                {isMuted ? <VolumeX className="w-5 h-5 text-rose-400" /> : <Volume2 className="w-5 h-5" />}
              </button>

              <button
                onClick={() => setShowSubtitles(!showSubtitles)}
                className={`p-2.5 rounded-xl transition-all ${
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
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold shadow-lg shadow-blue-600/30 hover:scale-[1.02] active:scale-[0.98] transition-all"
                >
                  <Download className="w-4 h-4" />
                  <span>Скачать 1080p (45 FPS)</span>
                </button>
              )}

              <button
                onClick={toggleFullscreen}
                className="p-2.5 rounded-xl hover:bg-white/15 text-zinc-200 transition-colors"
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
              onClick={() => {
                setCurrentSceneIndex(idx);
                setSceneElapsed(0);
              }}
              className={`shrink-0 w-36 sm:w-44 text-left rounded-xl p-2 transition-all border ${
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
