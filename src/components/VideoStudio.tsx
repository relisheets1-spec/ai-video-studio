"use client";

import React, { useState, useEffect } from "react";
import { Sparkles, Film, Clock, Play, History, Loader2, AlertCircle } from "lucide-react";
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

const PRESET_PROMPTS = [
  "История Римской Империи: путь от легионеров на границах до величия Рима, Колизея и падения Вечного города.",
  "В 2045 году глубоководная станция находит древний артефакт в Марианской впадине. Ученые сталкиваются с аномалиями и сигналами в космос.",
  "Колонизация Марса: постройка первых куполов, выживание в пылевых бурях и создание независимого города на красной планете.",
  "Тайны черных дыр: что происходит за горизонтом событий и как искажается пространство-время вблизи гравитационной сингулярности.",
];

const STYLE_OPTIONS = [
  { id: "cinematic photorealistic 8k", label: "Кинематографичный", desc: "Реалистичные кадры с киноосвещением" },
  { id: "cyberpunk sci-fi", label: "Киберпанк / Sci-Fi", desc: "Футуристичные технологии и огни" },
  { id: "historical documentary archive", label: "Историческая хроника", desc: "Атмосфера архивов и эпохи" },
  { id: "epic dark fantasy", label: "Эпический арт", desc: "Художественные иллюстрации" },
];

export const VideoStudio: React.FC<VideoStudioProps> = ({ user, onUserUpdate }) => {
  const [topic, setTopic] = useState("");
  const [selectedStyle, setSelectedStyle] = useState(STYLE_OPTIONS[0].id);
  const [selectedVoice, setSelectedVoice] = useState<VoiceOption>("onyx");
  const [targetMinutes, setTargetMinutes] = useState(10);

  const [isGenerating, setIsGenerating] = useState(false);
  const [progressStep, setProgressStep] = useState("");
  const [progressPercent, setProgressPercent] = useState(0);
  const [currentVideo, setCurrentVideo] = useState<{ id: string; title: string; scenes: Scene[] } | null>(null);
  const [showExporter, setShowExporter] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [pastVideos, setPastVideos] = useState<VideoGeneration[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    fetchHistory();
  }, [user.secretCode]);

  const fetchHistory = async () => {
    setLoadingHistory(true);
    try {
      const res = await fetch(`/api/videos?secretCode=${encodeURIComponent(user.secretCode)}`);
      const data = await res.json();
      if (res.ok && data.videos) {
        setPastVideos(data.videos);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleStartGeneration = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic.trim()) return;

    if (user.remaining <= 0) {
      setError("Лимит генераций исчерпан (0 осталось). Обратитесь к администратору.");
      return;
    }

    setIsGenerating(true);
    setError(null);
    setCurrentVideo(null);
    setProgressPercent(5);
    const frameTarget = targetMinutes >= 10 ? "34" : "30";
    setProgressStep(`Шаг 1 из 4: GPT-4o создает сценарий на ${frameTarget} кадров...`);

    try {
      // 1. Generate Script
      const scriptRes = await fetch("/api/generate/script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: topic.trim(),
          style: selectedStyle,
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
      setProgressStep(`Шаг 2 из 4: Синтез озвучки OpenAI TTS для ${totalScenes} кадров...`);

      // 2. Generate Audio
      for (let i = 0; i < totalScenes; i++) {
        const scene = scenes[i];
        setProgressStep(`Озвучка кадра ${i + 1}/${totalScenes}: "${scene.title}"`);
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
      setProgressStep(`Шаг 3 из 4: Генерация кадров 16:9 под сюжет...`);

      for (let i = 0; i < totalScenes; i++) {
        const scene = scenes[i];
        setProgressStep(`Генерация кадра ${i + 1}/${totalScenes}: "${scene.title}"`);
        setProgressPercent(55 + Math.round(((i + 1) / totalScenes) * 35));

        const imgRes = await fetch("/api/generate/image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            videoId,
            sceneId: scene.id,
            visualPrompt: scene.visualPrompt,
            style: selectedStyle,
          }),
        });

        const imgData = await imgRes.json();
        if (imgRes.ok) {
          scene.imageUrl = imgData.imageUrl;
        }
      }

      // 4. Finalize
      setProgressPercent(95);
      setProgressStep("Шаг 4 из 4: Синхронизация субтитров и сохранение...");

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
      setProgressStep("Готово! Видеоистория собрана!");

      setCurrentVideo({
        id: videoId,
        title: scriptData.title || topic,
        scenes,
      });

      fetchHistory();
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Произошла ошибка при генерации");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Top Header Card */}
      <div className="p-5 bg-zinc-950 rounded-2xl border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">
            Студия видеоисторий
          </h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Пользователь: <span className="text-zinc-200">{user.userName}</span> • 30–35 кадров • Full HD @ 45 FPS
          </p>
        </div>

        <div className="px-3.5 py-1.5 rounded-xl bg-zinc-900 border border-white/10 self-start sm:self-auto text-xs text-zinc-300">
          Осталось: <strong className="text-white font-semibold">{user.remaining}</strong> из {user.generationsLimit} генераций
        </div>
      </div>

      {error && (
        <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Main Studio Form */}
      {!currentVideo && (
        <form onSubmit={handleStartGeneration} className="space-y-5">
          <div className="bg-zinc-950 rounded-2xl p-5 sm:p-6 border border-white/10 space-y-5">
            {/* Prompt Input */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-zinc-200">
                  Промпт для видеоистории (от 2 до 10 предложений)
                </label>
                <span className="text-[11px] text-zinc-400 font-mono">
                  {targetMinutes >= 10 ? "34 кадра" : "30 кадров"}
                </span>
              </div>

              <textarea
                rows={4}
                required
                placeholder="Опишите сюжет истории в 2-10 предложениях... Например: История Римской Империи: путь от легионеров на границах до величия Рима, Колизея и падения Вечного города."
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                disabled={isGenerating}
                className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-white/10 text-white placeholder-zinc-500 text-xs focus:outline-none focus:border-white transition-colors resize-none"
              />

              {/* Fast Presets */}
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {PRESET_PROMPTS.map((p, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setTopic(p)}
                    disabled={isGenerating}
                    className="text-[11px] px-2.5 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-white/5 transition-colors line-clamp-1 text-left"
                  >
                    • {p.slice(0, 55)}...
                  </button>
                ))}
              </div>
            </div>

            {/* Minimal Voice Selector with 15-second audio previews */}
            <div className="pt-3 border-t border-white/10">
              <VoiceSelector
                selectedVoice={selectedVoice}
                onSelectVoice={(v) => setSelectedVoice(v)}
              />
            </div>

            {/* Style & Duration in one minimal grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-white/10">
              {/* Visual Style */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-200">Стиль кадров</label>
                <div className="grid grid-cols-2 gap-1.5">
                  {STYLE_OPTIONS.map((st) => (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => setSelectedStyle(st.id)}
                      className={`text-left p-2.5 rounded-xl border text-xs transition-all ${
                        selectedStyle === st.id
                          ? "bg-zinc-800 border-white text-white font-medium"
                          : "bg-zinc-900/60 border-white/5 text-zinc-400 hover:text-white"
                      }`}
                    >
                      <div>{st.label}</div>
                      <div className="text-[10px] text-zinc-500 mt-0.5">{st.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Duration */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-200">Длительность истории</label>
                <div className="grid grid-cols-2 gap-1.5">
                  {[8, 10].map((min) => (
                    <button
                      key={min}
                      type="button"
                      onClick={() => setTargetMinutes(min)}
                      className={`p-2.5 rounded-xl border text-center transition-all ${
                        targetMinutes === min
                          ? "bg-zinc-800 border-white text-white font-semibold"
                          : "bg-zinc-900/60 border-white/5 text-zinc-400 hover:text-white"
                      }`}
                    >
                      <div className="text-xs">{min} Минут</div>
                      <div className="text-[10px] text-zinc-500 mt-0.5">
                        {min >= 10 ? "34 кадра" : "30 кадров"}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Progress Bar */}
            {isGenerating && (
              <div className="space-y-2.5 p-4 rounded-xl bg-zinc-900 border border-white/10">
                <div className="flex items-center justify-between text-xs text-white">
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />
                    <span>{progressStep}</span>
                  </span>
                  <span className="font-mono font-bold">{progressPercent}%</span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                  <div
                    className="h-full bg-white transition-all duration-300 rounded-full"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>
            )}

            {/* Submit */}
            {!isGenerating && (
              <button
                type="submit"
                disabled={user.remaining <= 0 || !topic.trim()}
                className="w-full py-3 px-6 rounded-xl bg-white text-black hover:bg-zinc-200 font-semibold text-xs transition-colors flex items-center justify-center gap-2 disabled:opacity-40"
              >
                <Sparkles className="w-4 h-4" />
                <span>Сгенерировать видеоисторию ({targetMinutes} мин, {targetMinutes >= 10 ? "34" : "30"} кадров)</span>
              </button>
            )}
          </div>
        </form>
      )}

      {/* Video Player */}
      {currentVideo && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-white">{currentVideo.title}</h2>
              <p className="text-xs text-zinc-400">{currentVideo.scenes.length} кадров • Full HD 45 FPS</p>
            </div>
            <button
              onClick={() => setCurrentVideo(null)}
              className="text-xs px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors"
            >
              ← Создать новую историю
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

      {/* History */}
      <div className="space-y-3 pt-3 border-t border-white/10">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
            <History className="w-3.5 h-3.5 text-zinc-400" />
            История видеоисторий
          </h3>
          <span className="text-[11px] text-zinc-500">{pastVideos.length} видео</span>
        </div>

        {pastVideos.length === 0 ? (
          <div className="p-6 rounded-xl bg-zinc-950 text-center text-xs text-zinc-500 border border-white/5">
            Пока нет созданных историй. Заполните форму выше для первой генерации.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {pastVideos.map((vid) => (
              <div
                key={vid.id}
                className="p-3 rounded-xl bg-zinc-950 border border-white/10 hover:border-white/20 transition-colors flex flex-col justify-between space-y-2"
              >
                <div>
                  <div className="flex items-center justify-between text-[10px] text-zinc-400 mb-1">
                    <span>{new Date(vid.created_at).toLocaleDateString("ru-RU")}</span>
                    <span>{vid.target_duration_minutes} мин</span>
                  </div>
                  <h4 className="font-medium text-xs text-zinc-200 line-clamp-2">{vid.topic}</h4>
                </div>

                <button
                  onClick={() => {
                    setCurrentVideo({
                      id: vid.id,
                      title: vid.topic,
                      scenes: vid.scenes,
                    });
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                  className="w-full py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-[11px] font-medium flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Play className="w-3 h-3" />
                  <span>Открыть</span>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
