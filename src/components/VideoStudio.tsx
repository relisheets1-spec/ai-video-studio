"use client";

import React, { useState, useEffect } from "react";
import { Sparkles, Film, Mic, Palette, Clock, Play, History, Loader2, AlertCircle, Layers } from "lucide-react";
import { Scene, VideoGeneration, VoiceOption } from "@/lib/types";
import { VideoPlayer } from "./VideoPlayer";
import { VideoExporter } from "./VideoExporter";

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
  "В 2045 году на дне Марианской впадины исследовательская станция обнаруживает светящийся артефакт. Ученые расшифровывают сигналы, которые ведут к затерянной подводной цивилизации.",
  "История падения Римской Империи от лица простого легионера, защищавшего границы от варваров. Путь от триумфа до разрушения вечного города.",
  "Как человечество сделает первый шаг к колонизации Марса: от постройки первого купола и добычи кислорода до независимого города на красной планете.",
  "Тайна перевала Дятлова: реконструкция хронологии событий, архивные документы и анализ главных научных версий произошедшего в горах Урала.",
];

const STYLE_OPTIONS = [
  { id: "cinematic photorealistic 8k", label: "Кинематографичный 8K", desc: "Реалистичные фотокадры с киноосвещением" },
  { id: "cyberpunk sci-fi dark synthwave", label: "Киберпанк / Sci-Fi", desc: "Неоновые огни, технологии будущего" },
  { id: "vintage documentary photography", label: "Винтажная хроника", desc: "Атмосфера исторических архивов" },
  { id: "epic dark fantasy digital art", label: "Эпическое фэнтези", desc: "Художественные иллюстрации и атмосфера" },
];

const VOICE_OPTIONS: { id: VoiceOption; name: string; desc: string }[] = [
  { id: "onyx", name: "Onyx", desc: "Глубокий уверенный мужской голос (рекомендуется)" },
  { id: "nova", name: "Nova", desc: "Энергичный, теплый женский голос" },
  { id: "alloy", name: "Alloy", desc: "Универсальный сбалансированный тон" },
  { id: "echo", name: "Echo", desc: "Мягкий повествовательный тембр" },
  { id: "fable", name: "Fable", desc: "Британский акцент, выразительный" },
  { id: "shimmer", name: "Shimmer", desc: "Четкий эмоциональный голос" },
];

export const VideoStudio: React.FC<VideoStudioProps> = ({ user, onUserUpdate }) => {
  const [topic, setTopic] = useState("");
  const [selectedStyle, setSelectedStyle] = useState(STYLE_OPTIONS[0].id);
  const [selectedVoice, setSelectedVoice] = useState<VoiceOption>("onyx");
  const [targetMinutes, setTargetMinutes] = useState(10);

  // Generation state
  const [isGenerating, setIsGenerating] = useState(false);
  const [progressStep, setProgressStep] = useState("");
  const [progressPercent, setProgressPercent] = useState(0);
  const [currentVideo, setCurrentVideo] = useState<{ id: string; title: string; scenes: Scene[] } | null>(null);
  const [showExporter, setShowExporter] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Past videos
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
      setError("Лимит генераций исчерпан (0 осталось). Обратитесь к администратору за пополнением.");
      return;
    }

    setIsGenerating(true);
    setError(null);
    setCurrentVideo(null);
    setProgressPercent(5);
    setProgressStep(`Шаг 1 из 4: GPT-4o собирает текст в видеоисторию из ${targetMinutes >= 10 ? "34" : "30"} кадров...`);

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

      // 3. Generate Images
      setProgressPercent(55);
      setProgressStep(`Шаг 3 из 4: Генерация кадров 16:9 под озвучку...`);

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
      setProgressStep("Шаг 4 из 4: Синхронизация субтитров и сохранение истории...");

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
      setError(err.message || "Произошла непредвиденная ошибка");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-10">
      {/* Top Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 glass-panel rounded-2xl border border-white/10 relative overflow-hidden">
        <div className="space-y-1 z-10">
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight flex items-center gap-2.5">
            Студия видеоисторий
            <span className="text-xs px-2.5 py-1 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 flex items-center gap-1">
              <Layers className="w-3.5 h-3.5" />
              30–35 кадров | 8–10 мин
            </span>
          </h1>
          <p className="text-sm text-slate-400">
            Пользователь: <strong className="text-slate-200">{user.userName}</strong>. Введите промпт от 2 до 10 предложений, и ИИ соберет цельное видео с голосом, субтитрами и кадрами.
          </p>
        </div>

        <div className="flex items-center gap-3 z-10">
          <div className="px-4 py-2.5 rounded-xl bg-indigo-950/80 border border-indigo-500/40 text-center">
            <span className="text-xs text-indigo-300 block">Осталось генераций</span>
            <span className="text-xl font-bold text-white">
              {user.remaining} <span className="text-xs text-slate-400 font-normal">/ {user.generationsLimit}</span>
            </span>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-sm flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Generation Form */}
      {!currentVideo && (
        <form onSubmit={handleStartGeneration} className="space-y-8">
          <div className="glass-panel rounded-2xl p-6 sm:p-8 border border-white/10 space-y-6">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="block text-sm font-semibold text-white">
                  Промпт для видеоистории (от 2 до 10 предложений)
                </label>
                <span className="text-xs text-indigo-300">
                  Будет сгенерировано {targetMinutes >= 10 ? "34" : "30"} кадров с озвучкой
                </span>
              </div>
              <textarea
                rows={4}
                required
                placeholder="Опишите сюжет истории в 2-10 предложениях... Например: В 2045 году на дне океана находят древний артефакт. Ученые начинают спуск и сталкиваются с аномалиями. По мере расшифровки сигналов становится ясно, что это космический маяк древней цивилизации."
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                disabled={isGenerating}
                className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all resize-none"
              />

              {/* Preset prompt pills */}
              <div className="space-y-1.5 pt-1">
                <span className="text-xs text-slate-500">Примеры готовых сюжетов:</span>
                <div className="flex flex-col gap-1.5">
                  {PRESET_PROMPTS.map((p, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setTopic(p)}
                      disabled={isGenerating}
                      className="text-left text-xs p-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 border border-white/5 hover:border-white/20 transition-colors line-clamp-1"
                    >
                      • {p}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Grid for Parameters */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
              {/* Style selection */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <Palette className="w-4 h-4 text-indigo-400" />
                  Стиль оформления кадров
                </label>
                <div className="space-y-2">
                  {STYLE_OPTIONS.map((st) => (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => setSelectedStyle(st.id)}
                      className={`w-full text-left p-2.5 rounded-xl border text-xs transition-all ${
                        selectedStyle === st.id
                          ? "bg-indigo-600/30 border-indigo-500 text-white shadow-sm"
                          : "bg-white/5 border-white/5 text-slate-400 hover:text-slate-200 hover:bg-white/10"
                      }`}
                    >
                      <div className="font-semibold text-slate-200">{st.label}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">{st.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Voice selection */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <Mic className="w-4 h-4 text-purple-400" />
                  Голос диктора (OpenAI TTS)
                </label>
                <div className="space-y-2">
                  {VOICE_OPTIONS.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => setSelectedVoice(v.id)}
                      className={`w-full text-left p-2.5 rounded-xl border text-xs transition-all ${
                        selectedVoice === v.id
                          ? "bg-purple-600/30 border-purple-500 text-white shadow-sm"
                          : "bg-white/5 border-white/5 text-slate-400 hover:text-slate-200 hover:bg-white/10"
                      }`}
                    >
                      <div className="font-semibold text-slate-200">{v.name}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">{v.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Duration & Info */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-emerald-400" />
                    Длительность видеоистории
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {[8, 10].map((min) => (
                      <button
                        key={min}
                        type="button"
                        onClick={() => setTargetMinutes(min)}
                        className={`p-3 rounded-xl border text-center font-bold text-sm transition-all ${
                          targetMinutes === min
                            ? "bg-emerald-600/30 border-emerald-500 text-emerald-300 shadow-sm"
                            : "bg-white/5 border-white/5 text-slate-400 hover:text-white hover:bg-white/10"
                        }`}
                      >
                        {min} Минут
                        <span className="block text-[10px] font-normal text-slate-400 mt-0.5">
                          {min >= 10 ? "34 кадра" : "30 кадров"}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-white/5 border border-white/10 text-xs text-slate-400 space-y-2">
                  <div className="font-semibold text-slate-300 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                    Как собирается ролик:
                  </div>
                  <ul className="list-disc list-inside space-y-1 text-[11px] leading-relaxed">
                    <li>GPT-4o разворачивает промпт в сюжет на 30–35 кадров</li>
                    <li>Диктор озвучивает каждый кадр отдельно (~17 сек)</li>
                    <li>Кадры визуализируются под каждое предложение</li>
                    <li>Синхронные субтитры на экране и плавный зум</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Live Progress Bar */}
            {isGenerating && (
              <div className="space-y-3 p-5 rounded-2xl bg-indigo-950/60 border border-indigo-500/40">
                <div className="flex items-center justify-between text-xs text-indigo-200">
                  <span className="flex items-center gap-2 font-medium">
                    <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
                    <span>{progressStep}</span>
                  </span>
                  <span className="font-mono font-bold text-white">{progressPercent}%</span>
                </div>
                <div className="w-full h-2.5 rounded-full bg-slate-900 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 transition-all duration-500"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <p className="text-[11px] text-slate-400">
                  Идет сборка аудио и визуальных сцен. Пожалуйста, не закрывайте страницу.
                </p>
              </div>
            )}

            {/* Submit Button */}
            {!isGenerating && (
              <button
                type="submit"
                disabled={user.remaining <= 0 || !topic.trim()}
                className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 hover:from-indigo-500 hover:to-pink-500 text-white font-semibold text-base transition-all shadow-xl shadow-indigo-600/30 flex items-center justify-center gap-2.5 disabled:opacity-50 group"
              >
                <Sparkles className="w-5 h-5 group-hover:rotate-12 transition-transform" />
                <span>Сгенерировать видеоисторию ({targetMinutes} мин, {targetMinutes >= 10 ? "34" : "30"} кадров)</span>
              </button>
            )}
          </div>
        </form>
      )}

      {/* Active Generated Video Player */}
      {currentVideo && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-white">{currentVideo.title}</h2>
              <p className="text-xs text-slate-400">Видеоистория собрана ({currentVideo.scenes.length} кадров со звуком и субтитрами)</p>
            </div>
            <button
              onClick={() => setCurrentVideo(null)}
              className="text-xs px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-slate-300 transition-colors"
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
      <div className="space-y-4 pt-6 border-t border-white/10">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-white flex items-center gap-2">
            <History className="w-4 h-4 text-indigo-400" />
            История ваших видеоисторий
          </h3>
          <span className="text-xs text-slate-500">{pastVideos.length} видео</span>
        </div>

        {loadingHistory ? (
          <div className="p-8 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
            <span>Загрузка истории...</span>
          </div>
        ) : pastVideos.length === 0 ? (
          <div className="p-8 rounded-2xl glass-panel text-center text-xs text-slate-500">
            У вас пока нет созданных видео. Введите ваш первый промпт выше!
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {pastVideos.map((vid) => (
              <div
                key={vid.id}
                className="p-4 rounded-xl glass-panel border border-white/10 hover:border-indigo-500/40 transition-all flex flex-col justify-between space-y-3"
              >
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span>{new Date(vid.created_at).toLocaleDateString("ru-RU")}</span>
                    <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300">
                      {vid.target_duration_minutes} мин
                    </span>
                  </div>
                  <h4 className="font-semibold text-sm text-slate-200 line-clamp-2">{vid.topic}</h4>
                  <p className="text-[11px] text-slate-400">Кадров: {vid.scenes?.length || 0}</p>
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
                  className="w-full py-2 px-3 rounded-lg bg-indigo-600/30 hover:bg-indigo-600/50 border border-indigo-500/40 text-indigo-200 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>Смотреть историю</span>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
