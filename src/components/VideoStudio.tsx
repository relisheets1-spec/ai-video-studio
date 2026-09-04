"use client";

import React, { useState, useEffect } from "react";
import { Play, History, Loader2, AlertCircle, Wand2, SlidersHorizontal, Clock, Film, Sparkles } from "lucide-react";
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
    label: "Римская империя",
    prompt: "История Римской Империи: путь легионеров от северных рубежей Британии до величия Рима, гладиаторских битв в Колизее и падения Вечного города.",
  },
  {
    label: "Глубины океана",
    prompt: "В 2045 году глубоководная исследовательская станция обнаруживает древний артефакт на дне Марианской впадины. Экспедиция сталкивается с неизвестными сигналами из бездны.",
  },
  {
    label: "Марсианская колония",
    prompt: "Хроника первых поселенцев на Марсе: возведение куполов, добыча воды из полярных льдов, выживание в пылевых бурях и рождение первого поколения людей вне Земли.",
  },
  {
    label: "Черные дыры",
    prompt: "Тайны горизонта событий и гравитационных сингулярностей: как вещество преодолевает предел невозврата и что происходит с тканью пространства и времени.",
  },
  {
    label: "Древний Египет",
    prompt: "Эпоха фараонов и архитекторов Великих Пирамид: ритуалы жрецов, инженерные подвиги древности и вера в загробное путешествие по Книге Мертвых.",
  },
];

const STYLE_OPTIONS = [
  { id: "cinematic photorealistic 8k", label: "Кинематографичный", desc: "Реалистичное киноосвещение и 8K детализация" },
  { id: "historical documentary photography", label: "Документальный", desc: "Атмосфера архивных хроник и истории" },
  { id: "cyberpunk sci-fi dark neon", label: "Sci-Fi / Киберпанк", desc: "Футуристичные технологии и контрастный свет" },
  { id: "epic dark fantasy digital art", label: "Концепт-арт", desc: "Художественные атмосферные иллюстрации" },
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
      setError("Лимит генераций исчерпан. Обратитесь к администратору для пополнения баланса.");
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
      setProgressStep(`Шаг 2 из 4: Синтез озвучки OpenAI TTS для ${totalScenes} сцен...`);

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
      setProgressStep(`Шаг 3 из 4: Генерация кадров 16:9 под сюжет сцен...`);

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
      setProgressStep("Шаг 4 из 4: Синхронизация таймлайна и мастеринг...");

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
      setProgressStep("Видео готово к просмотру и экспорту!");

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
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-8 space-y-8">
      {/* Studio Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-white/[0.1]">
        <div className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight flex items-center gap-3">
            <span>Генерация видеоистории</span>
            <span className="px-3 py-1 rounded-full bg-blue-500/15 border border-blue-500/30 text-blue-400 text-xs font-bold font-mono uppercase">
              1080p @ 45 FPS
            </span>
          </h1>
          <p className="text-sm sm:text-base text-zinc-300">
            Создание полноценного 8–10 минутного фильма из 30–35 кадров с синтезом озвучки OpenAI TTS и субтитрами.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="px-4 py-2 rounded-xl bg-zinc-900 border border-white/10 text-sm font-semibold text-zinc-200 shadow-sm flex items-center gap-2">
            <span className="text-zinc-400">Доступно:</span>
            <span className="text-blue-400 font-mono font-bold text-base">{user.remaining}</span>
            <span className="text-zinc-400">из {user.generationsLimit} ген.</span>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-500/15 border border-red-500/30 text-red-200 text-sm sm:text-base flex items-start gap-3">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-red-400" />
          <span>{error}</span>
        </div>
      )}

      {/* Main Studio Workspace Form */}
      {!currentVideo && (
        <form onSubmit={handleStartGeneration} className="space-y-8">
          <div className="bg-[#13151c] rounded-2xl p-6 sm:p-8 border border-white/[0.12] space-y-8 shadow-2xl relative overflow-hidden">
            {/* Ambient accent background glow */}
            <div className="absolute top-0 right-0 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />

            {/* Prompt Input Area */}
            <div className="space-y-3 relative z-10">
              <div className="flex items-center justify-between">
                <label className="text-sm sm:text-base font-bold text-zinc-100 flex items-center gap-2">
                  <Wand2 className="w-4 h-4 text-blue-400" />
                  <span>Сюжет видеоистории (от 2 до 10 предложений)</span>
                </label>
                <span className="text-xs sm:text-sm font-medium text-zinc-400">
                  {topic.length > 0 ? `${topic.split(" ").filter(Boolean).length} слов` : "Подробно опишите желаемый сюжет"}
                </span>
              </div>

              <textarea
                rows={4}
                required
                placeholder="Опишите сюжет истории... Например: История Римской Империи: путь легионеров от северных рубежей Британии до величия Рима, гладиаторских битв в Колизее и драматического падения Вечного города."
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                disabled={isGenerating}
                className="w-full p-4 sm:p-5 rounded-xl bg-zinc-900 border border-white/15 text-white placeholder-zinc-500 text-base sm:text-lg leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all resize-none shadow-inner"
              />

              {/* Inspiration theme pills */}
              <div className="space-y-2 pt-1">
                <span className="text-xs sm:text-sm font-semibold text-zinc-400">
                  Быстрые шаблоны историй (нажмите для вставки):
                </span>
                <div className="flex flex-wrap gap-2">
                  {INSPIRATION_THEMES.map((t, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setTopic(t.prompt)}
                      disabled={isGenerating}
                      className="px-3.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-200 hover:text-white border border-white/10 hover:border-blue-500/50 text-xs sm:text-sm font-medium transition-all cursor-pointer"
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Voice Selector Component with RU & KZ samples */}
            <div className="pt-6 border-t border-white/[0.1] relative z-10">
              <VoiceSelector
                selectedVoice={selectedVoice}
                onSelectVoice={(v) => setSelectedVoice(v)}
              />
            </div>

            {/* Parameters Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6 border-t border-white/[0.1] relative z-10">
              {/* Visual Style */}
              <div className="space-y-3">
                <label className="text-sm sm:text-base font-bold text-zinc-100 flex items-center gap-2">
                  <SlidersHorizontal className="w-4 h-4 text-blue-400" />
                  <span>Визуальный стиль кадра</span>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {STYLE_OPTIONS.map((st) => (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => setSelectedStyle(st.id)}
                      className={`text-left p-3.5 sm:p-4 rounded-xl border transition-all cursor-pointer select-none ${
                        selectedStyle === st.id
                          ? "bg-blue-950/40 border-blue-500 ring-2 ring-blue-500/50 text-white shadow-lg shadow-blue-950/40"
                          : "bg-zinc-900/80 border-white/10 text-zinc-300 hover:text-white hover:bg-zinc-900 hover:border-white/20"
                      }`}
                    >
                      <div className="font-bold text-sm sm:text-base text-white">{st.label}</div>
                      <div className="text-xs text-zinc-400 mt-1 line-clamp-2">{st.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Duration selection */}
              <div className="space-y-3">
                <label className="text-sm sm:text-base font-bold text-zinc-100 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-blue-400" />
                  <span>Хронометраж и количество кадров</span>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {[8, 10].map((min) => (
                    <button
                      key={min}
                      type="button"
                      onClick={() => setTargetMinutes(min)}
                      className={`p-3.5 sm:p-4 rounded-xl border text-center transition-all cursor-pointer select-none ${
                        targetMinutes === min
                          ? "bg-blue-950/40 border-blue-500 ring-2 ring-blue-500/50 text-white shadow-lg shadow-blue-950/40"
                          : "bg-zinc-900/80 border-white/10 text-zinc-300 hover:text-white hover:bg-zinc-900 hover:border-white/20"
                      }`}
                    >
                      <div className="text-base sm:text-lg font-bold text-white">{min} Минут</div>
                      <div className="text-xs sm:text-sm text-zinc-400 mt-1">
                        {min >= 10 ? "34 кадра (~18 сек/кадр)" : "30 кадров (~16 сек/кадр)"}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Live Progress Bar */}
            {isGenerating && (
              <div className="space-y-4 p-6 rounded-2xl bg-zinc-900/90 border border-blue-500/40 shadow-xl relative z-10">
                <div className="flex items-center justify-between text-sm sm:text-base text-zinc-100">
                  <span className="flex items-center gap-3 font-semibold">
                    <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
                    <span>{progressStep}</span>
                  </span>
                  <span className="font-mono font-bold text-lg sm:text-xl text-blue-400">{progressPercent}%</span>
                </div>
                <div className="w-full h-3 rounded-full bg-zinc-800 overflow-hidden shadow-inner">
                  <div
                    className="h-full bg-blue-500 transition-all duration-300 rounded-full shadow-lg shadow-blue-500/50"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <p className="text-xs sm:text-sm text-zinc-400">
                  Сборка видео (генерация 30–35 сцен, озвучка и Full HD кадры) занимает 1–2 минуты. Не закрывайте вкладку.
                </p>
              </div>
            )}

            {/* Main Action Button */}
            {!isGenerating && (
              <button
                type="submit"
                disabled={user.remaining <= 0 || !topic.trim()}
                className="w-full py-4 sm:py-5 px-8 rounded-xl bg-blue-600 hover:bg-blue-500 active:scale-[0.99] text-white font-extrabold text-base sm:text-lg shadow-xl shadow-blue-600/30 transition-all flex items-center justify-center gap-3 disabled:opacity-40 cursor-pointer"
              >
                <Sparkles className="w-5 h-5" />
                <span>Сгенерировать видеоисторию ({targetMinutes} мин • {targetMinutes >= 10 ? "34" : "30"} кадров)</span>
              </button>
            )}
          </div>
        </form>
      )}

      {/* Video Player Display */}
      {currentVideo && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">{currentVideo.title}</h2>
              <p className="text-sm text-zinc-300 mt-1">
                {currentVideo.scenes.length} сцен • Синтез OpenAI TTS • Full HD 1080p @ 45 FPS
              </p>
            </div>
            <button
              onClick={() => setCurrentVideo(null)}
              className="text-sm font-semibold px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white transition-colors cursor-pointer"
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
        <div className="space-y-4 pt-6 border-t border-white/[0.1]">
          <div className="flex items-center justify-between">
            <span className="font-bold text-base sm:text-lg text-white flex items-center gap-2">
              <History className="w-5 h-5 text-blue-400" />
              <span>Созданные видеоистории</span>
            </span>
            <span className="text-sm font-medium text-zinc-400">{pastVideos.length} видео</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {pastVideos.map((vid) => (
              <div
                key={vid.id}
                className="p-5 rounded-2xl bg-[#13151c] border border-white/[0.1] hover:border-blue-500/40 transition-all flex items-center justify-between text-sm shadow-md"
              >
                <div className="truncate mr-4 space-y-1">
                  <div className="font-bold text-base text-white truncate">{vid.topic}</div>
                  <div className="text-xs sm:text-sm text-zinc-400 flex items-center gap-2">
                    <span>{new Date(vid.created_at).toLocaleDateString("ru-RU")}</span>
                    <span>•</span>
                    <span className="text-blue-400 font-semibold">{vid.target_duration_minutes} мин</span>
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
                  className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm flex items-center gap-2 transition-all shrink-0 shadow-md shadow-blue-600/25 cursor-pointer"
                >
                  <Play className="w-4 h-4 fill-current" />
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
