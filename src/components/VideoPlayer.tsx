"use client";

import React, { useState, useEffect, useRef } from "react";
import { Play, Pause, SkipForward, SkipBack, Volume2, VolumeX, Maximize2, Minimize2, Download, Film, Sparkles } from "lucide-react";
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
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [sceneDuration, setSceneDuration] = useState(0);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const currentScene = scenes[currentSceneIndex] || scenes[0];

  // Calculate cumulative times for the progress bar
  const totalEstimatedSeconds = scenes.reduce((acc, s) => acc + (s.durationEstimate || 25), 0);
  const elapsedBeforeCurrent = scenes
    .slice(0, currentSceneIndex)
    .reduce((acc, s) => acc + (s.durationEstimate || 25), 0);
  const overallCurrentSeconds = elapsedBeforeCurrent + currentTime;

  // Format seconds to mm:ss
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  // Handle scene change and audio playback
  useEffect(() => {
    if (!audioRef.current || !currentScene?.audioUrl) return;

    audioRef.current.src = currentScene.audioUrl;
    audioRef.current.load();
    setCurrentTime(0);

    if (isPlaying) {
      audioRef.current.play().catch((e) => console.log("Auto-play prevented:", e));
    }
  }, [currentSceneIndex, currentScene?.audioUrl]);

  // Audio events
  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
      setSceneDuration(audioRef.current.duration || currentScene?.durationEstimate || 25);
    }
  };

  const handleAudioEnded = () => {
    if (currentSceneIndex < scenes.length - 1) {
      setCurrentSceneIndex((prev) => prev + 1);
    } else {
      setIsPlaying(false);
      setCurrentSceneIndex(0);
    }
  };

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().then(() => setIsPlaying(true)).catch(console.error);
    }
  };

  const toggleMute = () => {
    if (!audioRef.current) return;
    audioRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
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
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleAudioEnded}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        preload="auto"
      />

      {/* Main Video Container */}
      <div
        ref={containerRef}
        className="relative aspect-video w-full rounded-2xl overflow-hidden bg-black shadow-2xl border border-white/10 group select-none"
      >
        {/* Visual Scene Image with Ken Burns motion */}
        {currentScene?.imageUrl ? (
          <div className="absolute inset-0 overflow-hidden">
            <img
              key={currentSceneIndex}
              src={currentScene.imageUrl}
              alt={currentScene.title}
              className={`w-full h-full object-cover transform transition-transform duration-1000 ${
                currentSceneIndex % 2 === 0 ? "animate-ken-burns-in" : "animate-ken-burns-out"
              }`}
            />
            {/* Cinematic vignette & gradient overlays */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30 pointer-events-none" />
            <div className="absolute inset-0 shadow-[inset_0_0_100px_rgba(0,0,0,0.8)] pointer-events-none" />
          </div>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-slate-900 to-indigo-950 p-6 text-center">
            <Film className="w-16 h-16 text-indigo-400/40 mb-3 animate-pulse" />
            <p className="text-slate-400 text-sm">Изображение формируется...</p>
          </div>
        )}

        {/* Top bar (Scene title & badge) */}
        <div className="absolute top-4 left-4 right-4 flex items-center justify-between pointer-events-none z-20">
          <div className="px-3.5 py-1.5 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-xs font-medium text-white flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span>
              Сцена {currentSceneIndex + 1} из {scenes.length}
            </span>
            <span className="text-slate-400">|</span>
            <span className="text-slate-300 truncate max-w-xs">{currentScene?.title}</span>
          </div>

          <div className="px-3 py-1 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-xs font-mono text-indigo-300">
            {formatTime(overallCurrentSeconds)} / {formatTime(totalEstimatedSeconds)}
          </div>
        </div>

        {/* Subtitles Overlay */}
        <div className="absolute bottom-20 left-6 right-6 flex justify-center z-20 pointer-events-none">
          <div className="max-w-3xl px-6 py-3 rounded-xl bg-black/75 backdrop-blur-md border border-white/15 text-center shadow-2xl">
            <p className="text-sm sm:text-base md:text-lg font-medium text-white leading-relaxed tracking-wide drop-shadow-md">
              {currentScene?.narration}
            </p>
          </div>
        </div>

        {/* Bottom Controls Bar */}
        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/95 via-black/70 to-transparent p-4 z-30 transition-opacity duration-300 flex flex-col gap-2">
          {/* Progress timeline bar */}
          <div
            className="w-full h-2 bg-white/20 hover:h-3 rounded-full cursor-pointer transition-all relative overflow-hidden group/bar"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const clickPercent = (e.clientX - rect.left) / rect.width;
              const targetSec = clickPercent * totalEstimatedSeconds;

              // Find scene index corresponding to targetSec
              let accum = 0;
              for (let i = 0; i < scenes.length; i++) {
                const sDur = scenes[i].durationEstimate || 25;
                if (targetSec <= accum + sDur || i === scenes.length - 1) {
                  setCurrentSceneIndex(i);
                  if (audioRef.current) {
                    audioRef.current.currentTime = Math.max(0, targetSec - accum);
                  }
                  break;
                }
                accum += sDur;
              }
            }}
          >
            <div
              className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 rounded-full relative"
              style={{ width: `${Math.min(100, (overallCurrentSeconds / (totalEstimatedSeconds || 1)) * 100)}%` }}
            />
          </div>

          {/* Controls buttons */}
          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-2 sm:gap-3">
              {/* Prev scene */}
              <button
                onClick={() => setCurrentSceneIndex((prev) => Math.max(0, prev - 1))}
                disabled={currentSceneIndex === 0}
                className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white disabled:opacity-30 transition-colors"
                title="Предыдущая сцена"
              >
                <SkipBack className="w-4 h-4" />
              </button>

              {/* Play/Pause */}
              <button
                onClick={togglePlay}
                className="p-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/30 transition-all hover:scale-105"
                title={isPlaying ? "Пауза" : "Воспроизведение"}
              >
                {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
              </button>

              {/* Next scene */}
              <button
                onClick={() => setCurrentSceneIndex((prev) => Math.min(scenes.length - 1, prev + 1))}
                disabled={currentSceneIndex === scenes.length - 1}
                className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white disabled:opacity-30 transition-colors"
                title="Следующая сцена"
              >
                <SkipForward className="w-4 h-4" />
              </button>

              {/* Mute toggle */}
              <button
                onClick={toggleMute}
                className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors ml-2"
                title={isMuted ? "Включить звук" : "Выключить звук"}
              >
                {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>

              {/* Timestamp */}
              <span className="text-xs font-mono text-slate-300 ml-2 hidden sm:inline">
                {formatTime(overallCurrentSeconds)} / {formatTime(totalEstimatedSeconds)}
              </span>
            </div>

            {/* Right controls: Export / Fullscreen */}
            <div className="flex items-center gap-2">
              {onExportClick && (
                <button
                  onClick={onExportClick}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-all shadow-md shadow-emerald-600/20"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Скачать видео</span>
                </button>
              )}

              <button
                onClick={toggleFullscreen}
                className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
                title="Во весь экран"
              >
                {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Scenes thumbnails ribbon */}
      <div className="p-4 glass-panel rounded-2xl border border-white/10 space-y-2">
        <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
          <span>Сцены видеоролика ({scenes.length} сцен, ~{formatTime(totalEstimatedSeconds)})</span>
          <span>Нажмите на сцену для перехода</span>
        </div>
        <div className="flex gap-2.5 overflow-x-auto pb-2 scrollbar-thin">
          {scenes.map((scene, idx) => (
            <button
              key={scene.id || idx}
              onClick={() => setCurrentSceneIndex(idx)}
              className={`shrink-0 w-28 sm:w-32 text-left rounded-xl p-1.5 transition-all border ${
                idx === currentSceneIndex
                  ? "bg-indigo-600/30 border-indigo-500 ring-2 ring-indigo-500/50"
                  : "bg-white/5 border-white/5 hover:border-white/20 hover:bg-white/10"
              }`}
            >
              <div className="aspect-video w-full rounded-lg overflow-hidden bg-slate-900 mb-1 relative">
                {scene.imageUrl ? (
                  <img src={scene.imageUrl} alt={scene.title} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[10px] text-slate-500">
                    Сцена {idx + 1}
                  </div>
                )}
                <span className="absolute bottom-1 right-1 px-1 rounded bg-black/70 text-[9px] font-mono text-slate-300">
                  {scene.durationEstimate || 25}s
                </span>
              </div>
              <p className="text-[11px] font-medium text-slate-200 truncate">{scene.title}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
