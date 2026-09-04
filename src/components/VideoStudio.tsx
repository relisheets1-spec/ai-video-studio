"use client";

import React, { useState, useEffect } from "react";
import { Play, Loader2, AlertCircle } from "lucide-react";
import { Scene, VideoGeneration, VoiceOption } from "@/lib/types";
import { VideoPlayer } from "./VideoPlayer";
import { VideoExporter } from "./VideoExporter";
import { VoiceSelector } from "./VoiceSelector";

interface VideoStudioProps {
  user: {
    id: string;
    userName: string;
    secretCode: string;
    remaining: number;
    generationsLimit: number;
    generationsUsed: number;
  };
  onUserUpdate: (updated: any) => void;
}

export const VideoStudio: React.FC<VideoStudioProps> = ({ user, onUserUpdate }) => {
  const [topic, setTopic] = useState("");
  const [selectedVoice, setSelectedVoice] = useState<VoiceOption>("onyx");
  const [targetMinutes, setTargetMinutes] = useState(10);

  const [isGenerating, setIsGenerating] = useState(false);
  const [progressStep, setProgressStep] = useState("");
  const [progressPercent, setProgressPercent] = useState(0);
  const [currentVideo, setCurrentVideo] = useState<{ id: string; title: string; scenes: Scene[] } | null>(null);
  const [showExporter, setShowExporter] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [pastVideos, setPastVideos] = useState<VideoGeneration[]>([]);

  useEffect(() => {
    fetchHistory();
  }, [user.secretCode]);

  const fetchHistory = async () => {
    try {
      const res = await fetch(`/api/videos?secretCode=${encodeURIComponent(user.secretCode)}`);
      const data = await res.json();
      if (res.ok && data.videos) {
        setPastVideos(data.videos);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleStartGeneration = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic.trim()) return;

    if (user.remaining <= 0) {
      setError("Лимит генераций исчерпан. Обратитесь к администратору.");
      return;
    }

    setIsGenerating(true);
    setError(null);
    setCurrentVideo(null);
    setProgressPercent(5);
    setProgressStep("Создание сценария...");

    try {
      // 1. Generate Script
      const scriptRes = await fetch("/api/generate/script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: topic.trim(),
          style: "cinematic photorealistic 8k",
          voice: selectedVoice,
          targetMinutes,
          secretCode: user.secretCode,
        }),
      });

      const scriptData = await scriptRes.json();
      if (!scriptRes.ok) throw new Error(scriptData.error || "Ошибка генерации сценария");

      const videoId = scriptData.videoId;
      const scenes: Scene[] = scriptData.scenes || [];
      const totalScenes = scenes.length;

      setProgressPercent(20);
      setProgressStep(`Озвучка сцен (1/${totalScenes})...`);

      // 2. Generate Audio
      for (let i = 0; i < totalScenes; i++) {
        const scene = scenes[i];
        setProgressStep(`Озвучка сцен (${i + 1}/${totalScenes})...`);
        setProgressPercent(20 + Math.round(((i + 1) / totalScenes) * 35));

        const audioRes = await fetch("/api/generate/audio", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            videoId,
            sceneId: scene.id,
            narration: scene.narration,
            voice: selectedVoice,
          }),
        });

        const audioData = await audioRes.json();
        if (audioRes.ok) {
          scene.audioUrl = audioData.audioUrl;
          scene.durationEstimate = audioData.estimatedDuration || 17;
        }
      }

      // 3. Generate Images via gpt-image-1-mini
      setProgressPercent(55);
      setProgressStep(`Генерация кадров (1/${totalScenes})...`);

      for (let i = 0; i < totalScenes; i++) {
        const scene = scenes[i];
        setProgressStep(`Генерация кадров (${i + 1}/${totalScenes})...`);
        setProgressPercent(55 + Math.round(((i + 1) / totalScenes) * 35));

        const imgRes = await fetch("/api/generate/image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            videoId,
            sceneId: scene.id,
            visualPrompt: scene.visualPrompt,
            style: "cinematic photorealistic",
          }),
        });

        const imgData = await imgRes.json();
        if (imgRes.ok) {
          scene.imageUrl = imgData.imageUrl;
        }
      }

      // 4. Finalize
      setProgressPercent(95);
      setProgressStep("Синхронизация...");

      const totalDuration = scenes.reduce((acc, s) => acc + (s.durationEstimate || 17), 0);

      const finRes = await fetch("/api/generate/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoId,
          secretCode: user.secretCode,
          scenes,
          totalDuration,
        }),
      });

      const finData = await finRes.json();
      if (!finRes.ok) throw new Error(finData.error || "Ошибка финализации");

      onUserUpdate({
        ...user,
        remaining: finData.remaining,
        generationsUsed: finData.generationsUsed,
      });

      setProgressPercent(100);
      setProgressStep("Готово");

      setCurrentVideo({
        id: videoId,
        title: scriptData.title || topic,
        scenes,
      });

      fetchHistory();
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Ошибка генерации");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="max-w-4xl w-full mx-auto space-y-6">
      {error && (
        <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {!currentVideo && (
        <form onSubmit={handleStartGeneration} className="space-y-4">
          <div className="bg-[#111113] rounded-2xl p-5 border border-white/10 space-y-4">
            <textarea
              rows={4}
              required
              placeholder="Опишите сюжет истории (2–10 предложений)... Например: История Римской Империи: от легионеров на границах до величия Рима, Колизея и падения Вечного города."
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              disabled={isGenerating}
              className="w-full px-3.5 py-3 rounded-xl bg-zinc-900 border border-white/10 text-white placeholder-zinc-500 text-xs leading-relaxed focus:outline-none focus:border-white transition-colors resize-none"
            />

            <VoiceSelector
              selectedVoice={selectedVoice}
              onSelectVoice={(v) => setSelectedVoice(v)}
            />

            <div className="flex items-center justify-between pt-2 border-t border-white/5">
              <div className="flex items-center gap-1.5 bg-zinc-900 p-1 rounded-xl border border-white/10">
                <button
                  type="button"
                  onClick={() => setTargetMinutes(8)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    targetMinutes === 8 ? "bg-white text-black font-semibold" : "text-zinc-400 hover:text-white"
                  }`}
                >
                  8 минут (30 кадров)
                </button>
                <button
                  type="button"
                  onClick={() => setTargetMinutes(10)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    targetMinutes === 10 ? "bg-white text-black font-semibold" : "text-zinc-400 hover:text-white"
                  }`}
                >
                  10 минут (34 кадра)
                </button>
              </div>

              <span className="text-[11px] text-zinc-500 font-mono">Full HD • 45 FPS</span>
            </div>

            {isGenerating && (
              <div className="space-y-2 p-3.5 rounded-xl bg-zinc-900 border border-white/10">
                <div className="flex items-center justify-between text-xs text-white">
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-400" />
                    <span>{progressStep}</span>
                  </span>
                  <span className="font-mono text-zinc-400">{progressPercent}%</span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                  <div
                    className="h-full bg-white transition-all duration-300 rounded-full"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>
            )}

            {!isGenerating && (
              <button
                type="submit"
                disabled={user.remaining <= 0 || !topic.trim()}
                className="w-full py-2.5 rounded-xl bg-white text-black hover:bg-zinc-200 font-medium text-xs transition-colors disabled:opacity-40"
              >
                Создать видео
              </button>
            )}
          </div>
        </form>
      )}

      {currentVideo && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">{currentVideo.title}</h2>
            <button
              onClick={() => setCurrentVideo(null)}
              className="text-xs text-zinc-400 hover:text-white transition-colors"
            >
              ← Назад к созданию
            </button>
          </div>

          <VideoPlayer
            title={currentVideo.title}
            scenes={currentVideo.scenes}
            onExportClick={() => setShowExporter(true)}
          />

          {showExporter && (
            <VideoExporter
              title={currentVideo.title}
              scenes={currentVideo.scenes}
              onClose={() => setShowExporter(false)}
            />
          )}
        </div>
      )}

      {pastVideos.length > 0 && !currentVideo && (
        <div className="space-y-2 pt-2">
          <span className="text-xs text-zinc-500 block">Предыдущие генерации:</span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {pastVideos.map((vid) => (
              <div
                key={vid.id}
                className="p-3 rounded-xl bg-[#111113] border border-white/5 flex items-center justify-between text-xs"
              >
                <div className="truncate mr-3">
                  <div className="font-medium text-zinc-200 truncate">{vid.topic}</div>
                  <div className="text-[10px] text-zinc-500">{vid.target_duration_minutes} мин • {vid.scenes?.length || 0} кадров</div>
                </div>
                <button
                  onClick={() => {
                    setCurrentVideo({
                      id: vid.id,
                      title: vid.topic,
                      scenes: vid.scenes,
                    });
                  }}
                  className="p-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 transition-colors shrink-0"
                >
                  <Play className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
