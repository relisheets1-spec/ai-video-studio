"use client";

import React, { useState, useEffect } from "react";
import { Play, History, Loader2, AlertCircle, Wand2, SlidersHorizontal } from "lucide-react";
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
  { id: "cinematic photorealistic 8k", label: "Кинематографичный", desc: "Реалистичное киноосвещение и детализация" },
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
      setError("Лимит генераций исчерпан. Обратитесь к администратору для пополнения.");
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
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      {/* Studio Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-white/[0.08]">
        <div>
          <h1 className="text-lg font-semibold text-white tracking-tight">
            Генерация видеоистории
          </h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Создание 8–10 минутного видео из 30–35 кадров с синтезом озвучки OpenAI и синхронными субтитрами.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[11px] font-mono px-2.5 py-1 rounded bg-zinc-900 border border-white/10 text-zinc-300">
            Full HD 1080p @ 45 FPS
          </span>
        </div>
      </div>

      {error && (
        <div className="p-3.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 text-xs flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Main Studio Workspace Form */}
      {!currentVideo && (
        <form onSubmit={handleStartGeneration} className="space-y-6">
          <div className="bg-[#121316] rounded-xl p-6 border border-white/[0.08] space-y-6 shadow-xl">
            {/* Prompt Input */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-zinc-200 flex items-center gap-1.5">
                  <Wand2 className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Сюжет истории (от 2 до 10 предложений)</span>
                </label>
                <span className="text-[11px] text-zinc-500">
                  {topic.length > 0 ? `${topic.split(" ").filter(Boolean).length} слов` : "Опишите сценарий"}
                </span>
              </div>

              <textarea
                rows={4}
                required
                placeholder="Опишите сюжет истории... Например: История Римской Империи: путь легионеров от северных рубежей Британии до величия Рима, гладиаторских битв в Колизее и падения Вечного города."
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                disabled={isGenerating}
                className="w-full px-4 py-3 rounded-lg bg-zinc-900 border border-white/10 text-white placeholder-zinc-500 text-xs leading-relaxed focus:outline-none focus:border-zinc-400 transition-colors resize-none"
              />

              {/* Inspiration theme pills */}
              <div className="space-y-1.5 pt-1">
                <span className="text-[11px] text-zinc-400">Быстрые примеры сюжетов:</span>
                <div className="flex flex-wrap gap-1.5">
                  {INSPIRATION_THEMES.map((t, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setTopic(t.prompt)}
                      disabled={isGenerating}
                      className="px-2.5 py-1 rounded-md bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-white/5 hover:border-white/20 text-xs transition-colors"
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Voice Selector with RU & KZ samples */}
            <div className="pt-4 border-t border-white/[0.08]">
              <VoiceSelector
                selectedVoice={selectedVoice}
                onSelectVoice={(v) => setSelectedVoice(v)}
              />
            </div>

            {/* Parameters Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 pt-4 border-t border-white/[0.08]">
              {/* Visual Style */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-zinc-200 flex items-center gap-1.5">
                  <SlidersHorizontal className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Визуальный стиль</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {STYLE_OPTIONS.map((st) => (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => setSelectedStyle(st.id)}
                      className={`text-left p-2.5 rounded-lg border text-xs transition-all ${
                        selectedStyle === st.id
                          ? "bg-zinc-800 border-zinc-400 text-white"
                          : "bg-zinc-900/60 border-white/5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900"
                      }`}
                    >
                      <div className="font-medium text-zinc-200">{st.label}</div>
                      <div className="text-[10px] text-zinc-500 mt-0.5 line-clamp-1">{st.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Duration selection */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-zinc-200 flex items-center gap-1.5">
                  <span>Хронометраж и кадры</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[8, 10].map((min) => (
                    <button
                      key={min}
                      type="button"
                      onClick={() => setTargetMinutes(min)}
                      className={`p-2.5 rounded-lg border text-center transition-all ${
                        targetMinutes === min
                          ? "bg-zinc-800 border-zinc-400 text-white"
                          : "bg-zinc-900/60 border-white/5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900"
                      }`}
                    >
                      <div className="text-xs font-medium">{min} минут</div>
                      <div className="text-[10px] text-zinc-400 mt-0.5">
                        {min >= 10 ? "34 кадра (~18 сек/кадр)" : "30 кадров (~16 сек/кадр)"}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Live Progress Bar */}
            {isGenerating && (
              <div className="space-y-3 p-4 rounded-lg bg-zinc-900 border border-white/10">
                <div className="flex items-center justify-between text-xs text-zinc-200">
                  <span className="flex items-center gap-2 font-medium">
                    <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />
                    <span>{progressStep}</span>
                  </span>
                  <span className="font-mono font-medium text-white">{progressPercent}%</span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                  <div
                    className="h-full bg-white transition-all duration-300 rounded-full"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <p className="text-[11px] text-zinc-500">
                  Сборка видео (30–35 кадров, озвучка и тайминги) занимает около 1.5–2 минут. Не закрывайте вкладку.
                </p>
              </div>
            )}

            {/* Submit button */}
            {!isGenerating && (
              <button
                type="submit"
                disabled={user.remaining <= 0 || !topic.trim()}
                className="w-full py-3 px-6 rounded-lg bg-white text-black font-medium text-xs hover:bg-zinc-200 transition-all flex items-center justify-center gap-2 disabled:opacity-40"
              >
                <span>Создать видеоисторию ({targetMinutes} мин • {targetMinutes >= 10 ? "34" : "30"} кадров)</span>
              </button>
            )}
          </div>
        </form>
      )}

      {/* Video Player Display */}
      {currentVideo && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-medium text-white">{currentVideo.title}</h2>
              <p className="text-xs text-zinc-400">
                {currentVideo.scenes.length} кадров • Озвучка OpenAI TTS • Full HD 1080p @ 45 FPS
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
        <div className="space-y-3 pt-4 border-t border-white/[0.08]">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-zinc-300 flex items-center gap-1.5">
              <History className="w-3.5 h-3.5 text-zinc-400" />
              <span>Созданные видеоистории</span>
            </span>
            <span className="text-zinc-500">{pastVideos.length} видео</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {pastVideos.map((vid) => (
              <div
                key={vid.id}
                className="p-3.5 rounded-xl bg-[#121316] border border-white/[0.08] hover:border-zinc-500/40 transition-all flex items-center justify-between text-xs"
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
                  className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white font-medium text-xs flex items-center gap-1.5 transition-colors shrink-0"
                >
                  <Play className="w-3 h-3 fill-current" />
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
