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

  // Time tracking
  const [sceneElapsed, setSceneElapsed] = useState(0);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const currentScene = scenes[currentSceneIndex] || scenes[0];
  const sceneDuration = currentScene?.durationEstimate || 17;

  // Total duration of all scenes
  const totalDuration = scenes.reduce((acc, s) => acc + (s.durationEstimate || 17), 0);

  // Overall current timestamp
  const elapsedPriorScenes = scenes
    .slice(0, currentSceneIndex)
    .reduce((acc, s) => acc + (s.durationEstimate || 17), 0);
  const overallElapsed = elapsedPriorScenes + sceneElapsed;

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  // Audio loading and playback for current scene
  useEffect(() => {
    if (!audioRef.current) return;

    if (currentScene?.audioUrl) {
      audioRef.current.src = currentScene.audioUrl;
      audioRef.current.load();
      if (isPlaying) {
        audioRef.current.play().catch((err) => {
          console.log("Audio play blocked or loading:", err);
        });
      }
    } else {
      audioRef.current.pause();
    }
  }, [currentSceneIndex, currentScene?.audioUrl]);

  // Master playback timer: advances every 200ms
  useEffect(() => {
    if (isPlaying) {
      timerRef.current = setInterval(() => {
        setSceneElapsed((prev) => {
          // If audio is actively playing, sync with audio.currentTime
          if (audioRef.current && !audioRef.current.paused && audioRef.current.currentTime > 0) {
            return audioRef.current.currentTime;
          }

          const next = prev + 0.2;
          // If scene time exceeded, advance to next scene
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
    <div className="w-full max-w-5xl mx-auto space-y-4">
      {/* Hidden audio element */}
      <audio
        ref={audioRef}
        onEnded={handleAudioEnded}
        muted={isMuted}
        preload="auto"
      />

      {/* Main Video Screen (Material 3 Surface Container) */}
      <div
        ref={containerRef}
        className="relative aspect-video w-full rounded-3xl overflow-hidden bg-[#0F0D13] border border-[#49454F]/30 shadow-2xl select-none group"
      >
        {/* Background Visual Image with smooth Ken Burns motion */}
        {currentScene?.imageUrl ? (
          <div className="absolute inset-0 overflow-hidden">
            <img
              key={currentSceneIndex}
              src={currentScene.imageUrl}
              alt={currentScene.title}
              className="w-full h-full object-cover animate-ken-burns"
            />
            {/* Cinematic subtle dark gradient */}
            <div className="absolute inset-0 bg-gradient-to-t from-[#141218] via-transparent to-black/30 pointer-events-none" />
          </div>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-[#1D1B20] text-center p-6">
            <div className="w-16 h-16 rounded-full bg-[#2B2930] flex items-center justify-center text-[#D0BCFF] mb-3">
              <Play className="w-7 h-7 ml-1" />
            </div>
            <p className="text-sm text-[#CAC4D0]">Кадр {currentSceneIndex + 1}: {currentScene?.title}</p>
          </div>
        )}

        {/* Top Information Bar */}
        <div className="absolute top-4 left-4 right-4 flex items-center justify-between pointer-events-none z-20">
          <div className="px-3.5 py-1.5 rounded-full bg-[#1D1B20]/90 backdrop-blur-md border border-[#49454F]/40 text-xs text-[#E6E0E9] flex items-center gap-2 shadow-sm">
            <span className="w-2 h-2 rounded-full bg-[#D0BCFF] animate-pulse" />
            <span className="font-medium">Кадр {currentSceneIndex + 1} из {scenes.length}</span>
            <span className="text-[#938F99]">|</span>
            <span className="text-[#CCC2DC] max-w-xs truncate">{currentScene?.title}</span>
          </div>

          <div className="px-3 py-1.5 rounded-full bg-[#1D1B20]/90 backdrop-blur-md border border-[#49454F]/40 text-xs font-mono text-[#D0BCFF] shadow-sm">
            {formatTime(overallElapsed)} / {formatTime(totalDuration)}
          </div>
        </div>

        {/* Subtitles Overlay (Google Material 3 Chip-Style Subtitle Card) */}
        {showSubtitles && currentScene?.narration && (
          <div className="absolute bottom-24 left-6 right-6 flex justify-center z-20 pointer-events-none">
            <div className="max-w-3xl px-6 py-3 rounded-2xl bg-[#1D1B20]/90 backdrop-blur-md border border-[#49454F]/40 text-center shadow-lg">
              <p className="text-sm sm:text-base md:text-lg font-medium text-[#E6E0E9] leading-relaxed tracking-wide">
                {currentScene.narration}
              </p>
            </div>
          </div>
        )}

        {/* Click-to-play overlay */}
        <div
          onClick={togglePlay}
          className="absolute inset-0 z-10 flex items-center justify-center cursor-pointer"
        >
          {!isPlaying && (
            <button
              type="button"
              className="w-16 h-16 rounded-full bg-[#D0BCFF] text-[#381E72] shadow-xl flex items-center justify-center hover:scale-105 transition-all"
            >
              <Play className="w-8 h-8 ml-1 fill-current" />
            </button>
          )}
        </div>

        {/* Bottom Controls Bar (Material 3 Navigation Bar Style) */}
        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-[#141218] via-[#1D1B20]/95 to-transparent pt-6 pb-4 px-5 z-30 flex flex-col gap-2">
          {/* M3 Slider / Scrubber */}
          <div
            className="w-full h-3 bg-[#36343B] hover:h-4 rounded-full cursor-pointer transition-all relative overflow-hidden"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const clickPercent = (e.clientX - rect.left) / rect.width;
              handleSeek(clickPercent * totalDuration);
            }}
          >
            <div
              className="h-full bg-[#D0BCFF] rounded-full transition-all"
              style={{ width: `${Math.min(100, (overallElapsed / (totalDuration || 1)) * 100)}%` }}
            />
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-2 sm:gap-3">
              <button
                onClick={() => {
                  setCurrentSceneIndex((prev) => Math.max(0, prev - 1));
                  setSceneElapsed(0);
                }}
                disabled={currentSceneIndex === 0}
                className="p-2 rounded-full hover:bg-[#36343B] text-[#CAC4D0] disabled:opacity-30 transition-colors"
                title="Предыдущий кадр"
              >
                <SkipBack className="w-4 h-4" />
              </button>

              <button
                onClick={togglePlay}
                className="w-10 h-10 rounded-full bg-[#D0BCFF] text-[#381E72] flex items-center justify-center shadow-md hover:opacity-90 transition-all"
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
                className="p-2 rounded-full hover:bg-[#36343B] text-[#CAC4D0] disabled:opacity-30 transition-colors"
                title="Следующий кадр"
              >
                <SkipForward className="w-4 h-4" />
              </button>

              <button
                onClick={() => {
                  if (audioRef.current) audioRef.current.muted = !isMuted;
                  setIsMuted(!isMuted);
                }}
                className="p-2 rounded-full hover:bg-[#36343B] text-[#CAC4D0] transition-colors ml-1"
                title={isMuted ? "Включить звук" : "Выключить звук"}
              >
                {isMuted ? <VolumeX className="w-4 h-4 text-[#F2B8B5]" /> : <Volume2 className="w-4 h-4" />}
              </button>

              <button
                onClick={() => setShowSubtitles(!showSubtitles)}
                className={`p-2 rounded-full transition-colors ${
                  showSubtitles ? "bg-[#4F378B] text-[#EADDFF]" : "hover:bg-[#36343B] text-[#938F99]"
                }`}
                title="Вкл/выкл субтитры"
              >
                <Subtitles className="w-4 h-4" />
              </button>

              <span className="text-xs font-mono text-[#CAC4D0] ml-2 hidden sm:inline">
                {formatTime(overallElapsed)} / {formatTime(totalDuration)}
              </span>
            </div>

            {/* Right actions */}
            <div className="flex items-center gap-2">
              {onExportClick && (
                <button
                  onClick={onExportClick}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#D0BCFF] text-[#381E72] text-xs font-semibold hover:opacity-90 shadow-sm transition-all"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Экспорт в 1080p</span>
                </button>
              )}

              <button
                onClick={toggleFullscreen}
                className="p-2 rounded-full hover:bg-[#36343B] text-[#CAC4D0] transition-colors"
                title="Во весь экран"
              >
                {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Frame Carousel (Material 3 Surface Container) */}
      <div className="p-4 bg-[#1D1B20] rounded-3xl border border-[#49454F]/30 space-y-2">
        <div className="flex items-center justify-between text-xs text-[#938F99] px-1">
          <span>Все кадры истории ({scenes.length} кадров, ~{formatTime(totalDuration)})</span>
          <span>Нажмите на кадр для перехода</span>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
          {scenes.map((scene, idx) => (
            <button
              key={scene.id || idx}
              onClick={() => {
                setCurrentSceneIndex(idx);
                setSceneElapsed(0);
              }}
              className={`shrink-0 w-28 sm:w-32 text-left rounded-2xl p-1.5 transition-all border ${
                idx === currentSceneIndex
                  ? "bg-[#2B2930] border-[#D0BCFF] ring-2 ring-[#D0BCFF]"
                  : "bg-[#141218] border-[#49454F]/30 hover:border-[#938F99] hover:bg-[#25232A]"
              }`}
            >
              <div className="aspect-video w-full rounded-xl overflow-hidden bg-[#0F0D13] mb-1.5 relative">
                {scene.imageUrl ? (
                  <img src={scene.imageUrl} alt={scene.title} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[10px] text-[#938F99]">
                    Кадр {idx + 1}
                  </div>
                )}
                <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded-full bg-black/80 text-[9px] font-mono text-[#E6E0E9]">
                  {scene.durationEstimate || 17}с
                </span>
              </div>
              <p className="text-[11px] font-medium text-[#E6E0E9] truncate px-0.5">
                {idx + 1}. {scene.title}
              </p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
