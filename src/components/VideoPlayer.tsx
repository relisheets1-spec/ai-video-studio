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

        {/* Top minimal status */}
        <div className="absolute top-4 left-4 right-4 flex items-center justify-between pointer-events-none z-20">
          <div className="px-3 py-1 rounded-full bg-black/70 backdrop-blur-md border border-white/10 text-xs text-zinc-200 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
            <span>Кадр {currentSceneIndex + 1} / {scenes.length}</span>
            <span className="text-zinc-500">•</span>
            <span className="text-zinc-300 max-w-xs truncate">{currentScene?.title}</span>
          </div>

          <div className="px-3 py-1 rounded-full bg-black/70 backdrop-blur-md border border-white/10 text-xs font-mono text-white">
            {formatTime(overallElapsed)} / {formatTime(totalDuration)}
          </div>
        </div>

        {/* Subtitles (+10% size increase for bold, crystal-clear readability) */}
        {showSubtitles && currentScene?.narration && (
          <div className="absolute bottom-20 left-6 right-6 flex justify-center z-20 pointer-events-none">
            <div className="max-w-3xl px-6 py-3 rounded-xl bg-black/80 backdrop-blur-md border border-white/15 text-center shadow-xl">
              <p className="text-base sm:text-lg md:text-xl font-semibold text-white leading-relaxed tracking-wide drop-shadow-md">
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
              className="w-14 h-14 rounded-full bg-white text-black shadow-2xl flex items-center justify-center hover:scale-105 transition-all"
            >
              <Play className="w-7 h-7 ml-0.5 fill-current" />
            </button>
          )}
        </div>

        {/* Bottom Minimalist Controls */}
        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black via-black/80 to-transparent pt-6 pb-3 px-4 z-30 flex flex-col gap-2">
          {/* Timeline Bar */}
          <div
            className="w-full h-1.5 hover:h-2.5 bg-white/20 rounded-full cursor-pointer transition-all relative overflow-hidden"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const clickPercent = (e.clientX - rect.left) / rect.width;
              handleSeek(clickPercent * totalDuration);
            }}
          >
            <div
              className="h-full bg-white rounded-full transition-all"
              style={{ width: `${Math.min(100, (overallElapsed / (totalDuration || 1)) * 100)}%` }}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setCurrentSceneIndex((prev) => Math.max(0, prev - 1));
                  setSceneElapsed(0);
                }}
                disabled={currentSceneIndex === 0}
                className="p-1.5 rounded-lg hover:bg-white/10 text-zinc-300 disabled:opacity-30 transition-colors"
                title="Предыдущий кадр"
              >
                <SkipBack className="w-4 h-4" />
              </button>

              <button
                onClick={togglePlay}
                className="p-2 rounded-full bg-white text-black flex items-center justify-center hover:bg-zinc-200 transition-colors"
                title={isPlaying ? "Пауза" : "Воспроизведение"}
              >
                {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 ml-0.5 fill-current" />}
              </button>

              <button
                onClick={() => {
                  setCurrentSceneIndex((prev) => Math.min(scenes.length - 1, prev + 1));
                  setSceneElapsed(0);
                }}
                disabled={currentSceneIndex === scenes.length - 1}
                className="p-1.5 rounded-lg hover:bg-white/10 text-zinc-300 disabled:opacity-30 transition-colors"
                title="Следующий кадр"
              >
                <SkipForward className="w-4 h-4" />
              </button>

              <button
                onClick={() => {
                  if (audioRef.current) audioRef.current.muted = !isMuted;
                  setIsMuted(!isMuted);
                }}
                className="p-1.5 rounded-lg hover:bg-white/10 text-zinc-300 transition-colors ml-1"
                title={isMuted ? "Включить звук" : "Выключить звук"}
              >
                {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4" />}
              </button>

              <button
                onClick={() => setShowSubtitles(!showSubtitles)}
                className={`p-1.5 rounded-lg transition-colors ${
                  showSubtitles ? "bg-white/20 text-white" : "hover:bg-white/10 text-zinc-400"
                }`}
                title="Субтитры"
              >
                <Subtitles className="w-4 h-4" />
              </button>

              <span className="text-xs font-mono text-zinc-400 ml-2 hidden sm:inline">
                {formatTime(overallElapsed)} / {formatTime(totalDuration)}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {onExportClick && (
                <button
                  onClick={onExportClick}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white text-black text-xs font-semibold hover:bg-zinc-200 transition-all"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Скачать 1080p (45 FPS)</span>
                </button>
              )}

              <button
                onClick={toggleFullscreen}
                className="p-1.5 rounded-lg hover:bg-white/10 text-zinc-300 transition-colors"
                title="Во весь экран"
              >
                {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Frame Carousel */}
      <div className="p-3 bg-zinc-950 rounded-xl border border-white/10">
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
          {scenes.map((scene, idx) => (
            <button
              key={scene.id || idx}
              onClick={() => {
                setCurrentSceneIndex(idx);
                setSceneElapsed(0);
              }}
              className={`shrink-0 w-24 sm:w-28 text-left rounded-lg p-1 transition-all border ${
                idx === currentSceneIndex
                  ? "border-white bg-zinc-800"
                  : "border-transparent hover:border-white/20 bg-zinc-900/60"
              }`}
            >
              <div className="aspect-video w-full rounded overflow-hidden bg-black mb-1 relative">
                {scene.imageUrl ? (
                  <img src={scene.imageUrl} alt={scene.title} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[9px] text-zinc-500">
                    Кадр {idx + 1}
                  </div>
                )}
                <span className="absolute bottom-0.5 right-0.5 px-1 rounded bg-black/80 text-[8px] font-mono text-zinc-300">
                  {scene.durationEstimate || 17}с
                </span>
              </div>
              <p className="text-[10px] font-medium text-zinc-300 truncate">
                {idx + 1}. {scene.title}
              </p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
