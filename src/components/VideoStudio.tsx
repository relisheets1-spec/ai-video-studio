"use client";

import React, { useState, useEffect } from "react";
import { Sparkles, Film, Mic, Palette, Clock, Play, History, Loader2, AlertCircle, Layers, CheckCircle, Wand2 } from "lucide-react";
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

const INSPIRATION_THEMES = [
  {
    icon: "🏛️",
    label: "Римская Империя",
    prompt: "История Римской Империи: путь легионеров от северных границ Британии до величия Рима, гладиаторских боев в Колизее и драматического падения Вечного города.",
  },
  {
    icon: "🌊",
    label: "Марианская впадина",
    prompt: "В 2045 году глубоководная исследовательская станция находит древний светящийся артефакт в Марианской впадине. Ученые сталкиваются с аномалиями и сигналами в открытый космос.",
  },
  {
    icon: "🚀",
    label: "Колония на Марсе",
    prompt: "История первой постоянной колонии на Марсе: постройка куполов, добыча воды из полярных льдов, выживание в пылевых бурях и рождение первого марсианского поколения.",
  },
  {
    icon: "🌌",
    label: "Черные дыры",
    prompt: "Тайны черных дыр и горизонта событий: что происходит с веществом при падении в гравитационную сингулярность и как искривляется ткань пространства-времени.",
  },
  {
    icon: "🏜️",
    label: "Древний Египет",
    prompt: "Эпоха фараонов и строительство Великих Пирамид в Гизе: тайны жрецов, инженерные решения древности и путешествие в загробный мир по Книге Мертвых.",
  },
];

const STYLE_OPTIONS = [
  { id: "cinematic photorealistic 8k", label: "Кинематографичный", desc: "Реалистичные фотокадры с киноосвещением" },
  { id: "cyberpunk sci-fi dark neon", label: "Sci-Fi / Киберпанк", desc: "Футуристичные технологии и неоновые огни" },
  { id: "historical documentary photography", label: "Историческая хроника", desc: "Атмосфера архивов и эпохи" },
  { id: "epic dark fantasy digital art", label: "Эпический арт", desc: "Художественные атмосферные иллюстрации" },
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
      setError("Лимит генераций исчерпан. Обратитесь к администратору за пополнением.");
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
        setProgressStep(`Озвучка сцены ${i + 1}/${totalScenes}: "${scene.title}"`);
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
      setProgressStep("Шаг 4 из 4: Синхронизация субтитров и мастеринг...");

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
      setProgressStep("Готово! 8-10 минутная видеоистория собрана!");

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
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      {/* Top Pipeline Infobar */}
      <div className="p-4 rounded-2xl bg-[#11131a] border border-white/[0.08] flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-white">Пайплайн сборки:</span>
          <div className="flex items-center gap-1.5 text-zinc-400">
            <span className="text-indigo-300">1. Сценарий GPT-4o</span>
            <span>→</span>
            <span className="text-purple-300">2. Озвучка TTS</span>
            <span>→</span>
            <span className="text-pink-300">3. Кадры 16:9</span>
            <span>→</span>
            <span className="text-emerald-300">4. Full HD 45 FPS</span>
          </div>
        </div>

        <div className="flex items-center gap-2 text-zinc-400">
          <span>Хронометраж: <strong className="text-white">8–10 минут</strong></span>
          <span>•</span>
          <span>Кадров: <strong className="text-white">{targetMinutes >= 10 ? "34" : "30"}</strong></span>
        </div>
      </div>

      {error && (
        <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Main Studio Form */}
      {!currentVideo && (
        <form onSubmit={handleStartGeneration} className="space-y-5">
          <div className="bg-[#11131a] rounded-2xl p-6 border border-white/[0.08] space-y-5 shadow-xl">
            {/* Prompt Input */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
                  <Wand2 className="w-3.5 h-3.5 text-indigo-400" />
                  Промпт для видеоистории (2–10 предложений)
                </label>
                <span className="text-[11px] text-zinc-400">
                  {topic.length > 0 ? `${topic.split(" ").filter(Boolean).length} слов` : "Опишите желаемый сюжет"}
                </span>
              </div>

              <textarea
                rows={4}
                required
                placeholder="Опишите сюжет истории... Например: История Римской Империи: от легионеров на границах до величия Рима, гладиаторских боев в Колизее и драматического падения Вечного города."
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                disabled={isGenerating}
                className="w-full px-4 py-3 rounded-xl bg-zinc-900/90 border border-white/10 text-white placeholder-zinc-500 text-xs leading-relaxed focus:outline-none focus:border-indigo-500 transition-colors resize-none"
              />

              {/* Inspiration theme pills */}
              <div className="space-y-1.5 pt-1">
                <span className="text-[11px] text-zinc-400">Темы для вдохновения (нажмите, чтобы вставить):</span>
                <div className="flex flex-wrap gap-1.5">
                  {INSPIRATION_THEMES.map((t, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setTopic(t.prompt)}
                      disabled={isGenerating}
                      className="px-2.5 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-white/5 hover:border-white/20 text-xs transition-colors flex items-center gap-1.5"
                    >
                      <span>{t.icon}</span>
                      <span>{t.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Voice Selector with RU & KZ samples */}
            <div className="pt-3 border-t border-white/10">
              <VoiceSelector
                selectedVoice={selectedVoice}
                onSelectVoice={(v) => setSelectedVoice(v)}
              />
            </div>

            {/* Style & Duration Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-white/10">
              {/* Visual Style */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
                  <Palette className="w-3.5 h-3.5 text-purple-400" />
                  Стиль визуализации
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  {STYLE_OPTIONS.map((st) => (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => setSelectedStyle(st.id)}
                      className={`text-left p-2.5 rounded-xl border text-xs transition-all ${
                        selectedStyle === st.id
                          ? "bg-indigo-600/20 border-indigo-500 text-white font-medium"
                          : "bg-zinc-900/60 border-white/5 text-zinc-400 hover:text-white hover:bg-zinc-900"
                      }`}
                    >
                      <div className="text-zinc-200">{st.label}</div>
                      <div className="text-[10px] text-zinc-500 mt-0.5 line-clamp-1">{st.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Duration selection */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-emerald-400" />
                  Хронометраж истории
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  {[8, 10].map((min) => (
                    <button
                      key={min}
                      type="button"
                      onClick={() => setTargetMinutes(min)}
                      className={`p-2.5 rounded-xl border text-center transition-all ${
                        targetMinutes === min
                          ? "bg-emerald-600/20 border-emerald-500 text-emerald-300 font-semibold"
                          : "bg-zinc-900/60 border-white/5 text-zinc-400 hover:text-white hover:bg-zinc-900"
                      }`}
                    >
                      <div className="text-xs">{min} Минут</div>
                      <div className="text-[10px] text-zinc-400 mt-0.5 font-normal">
                        {min >= 10 ? "34 кадра (~18с/кадр)" : "30 кадров (~16с/кадр)"}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Live Progress Bar */}
            {isGenerating && (
              <div className="space-y-2.5 p-4 rounded-xl bg-indigo-950/40 border border-indigo-500/30">
                <div className="flex items-center justify-between text-xs text-indigo-200">
                  <span className="flex items-center gap-2 font-medium">
                    <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
                    <span>{progressStep}</span>
                  </span>
                  <span className="font-mono font-bold text-white">{progressPercent}%</span>
                </div>
                <div className="w-full h-2 rounded-full bg-zinc-900 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-500 rounded-full"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <p className="text-[11px] text-zinc-400">
                  Сборка длинного ролика занимает около 1-2 минут. Пожалуйста, не закрывайте вкладку.
                </p>
              </div>
            )}

            {/* Submit button */}
            {!isGenerating && (
              <button
                type="submit"
                disabled={user.remaining <= 0 || !topic.trim()}
                className="w-full py-3.5 px-6 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-semibold text-xs shadow-lg shadow-indigo-600/25 transition-all flex items-center justify-center gap-2 disabled:opacity-40"
              >
                <Sparkles className="w-4 h-4" />
                <span>Сгенерировать видеоисторию ({targetMinutes} мин • {targetMinutes >= 10 ? "34" : "30"} кадров)</span>
              </button>
            )}
          </div>
        </form>
      )}

      {/* Video Player Display */}
      {currentVideo && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-white">{currentVideo.title}</h2>
              <p className="text-xs text-zinc-400">
                {currentVideo.scenes.length} кадров • Синхронный голос и субтитры • Full HD 45 FPS
              </p>
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

      {/* Previous Stories Gallery */}
      {pastVideos.length > 0 && !currentVideo && (
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-zinc-300 flex items-center gap-1.5">
              <History className="w-3.5 h-3.5 text-indigo-400" />
              История созданных историй
            </span>
            <span className="text-zinc-500">{pastVideos.length} видео</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {pastVideos.map((vid) => (
              <div
                key={vid.id}
                className="p-3.5 rounded-xl bg-[#11131a] border border-white/[0.08] hover:border-indigo-500/30 transition-all flex items-center justify-between text-xs"
              >
                <div className="truncate mr-3 space-y-0.5">
                  <div className="font-medium text-white truncate">{vid.topic}</div>
                  <div className="text-[11px] text-zinc-400 flex items-center gap-2">
                    <span>{new Date(vid.created_at).toLocaleDateString("ru-RU")}</span>
                    <span>•</span>
                    <span>{vid.target_duration_minutes} мин</span>
                    <span>•</span>
                    <span>{vid.scenes?.length || 0} кадров</span>
                  </div>
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
                  className="px-3 py-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-200 font-medium text-xs flex items-center gap-1.5 transition-colors shrink-0"
                >
                  <Play className="w-3 h-3" />
                  <span>Открыть</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
