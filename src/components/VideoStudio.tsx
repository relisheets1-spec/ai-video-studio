"use client";

import React, { useState, useEffect } from "react";
import { Sparkles, Film, Palette, Clock, Play, History, Loader2, AlertCircle, Layers } from "lucide-react";
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
  "В 2045 году на дне Марианской впадины исследовательская станция обнаруживает светящийся монолит древней цивилизации. Ученые начинают спуск и сталкиваются с аномалиями, понимая, что это космический маяк.",
  "История Римской Империи глазами легионера: путь от северных границ Британии до триумфального марша и драматического падения Вечного города.",
  "Первая марсианская колония: постройка первого купола, добыча кислорода из атмосферы и рождение первого поколения людей на Красной планете.",
  "Загадки черных дыр и гравитации: что происходит за горизонтом событий и как искривляется пространство-время вблизи сингулярности.",
];

const STYLE_OPTIONS = [
  { id: "cinematic photorealistic 8k", label: "Кинематографичный 8K", desc: "Реалистичные фотокадры с киноосвещением" },
  { id: "cyberpunk sci-fi dark synthwave", label: "Киберпанк / Sci-Fi", desc: "Неоновые огни, технологии будущего" },
  { id: "vintage documentary photography", label: "Винтажная хроника", desc: "Атмосфера исторических архивов" },
  { id: "epic dark fantasy digital art", label: "Эпическое фэнтези", desc: "Художественные иллюстрации и атмосфера" },
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
      setProgressStep("Шаг 4 из 4: Сохранение и синхронизация субтитров...");

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
      setProgressStep("Готово! Видеоистория создана!");

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
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Material 3 Top Card */}
      <div className="p-6 sm:p-7 bg-[#1D1B20] rounded-3xl border border-[#49454F]/30 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold text-[#E6E0E9] tracking-tight">
              Студия видеоисторий
            </h1>
            <span className="text-xs px-3 py-1 rounded-full bg-[#2B2930] text-[#D0BCFF] border border-[#49454F]/40 flex items-center gap-1 font-medium">
              <Layers className="w-3.5 h-3.5" />
              30–35 кадров • 8–10 мин
            </span>
          </div>
          <p className="text-xs text-[#938F99]">
            Пользователь: <strong className="text-[#E6E0E9]">{user.userName}</strong>. Введите сюжет от 2 до 10 предложений, выберите голос и стиль.
          </p>
        </div>

        <div className="px-4 py-2 rounded-2xl bg-[#2B2930] border border-[#49454F]/40 self-start md:self-auto text-center">
          <span className="text-[11px] text-[#938F99] block">Осталось генераций</span>
          <span className="text-lg font-bold text-[#E6E0E9]">
            <span className="text-[#D0BCFF]">{user.remaining}</span> / {user.generationsLimit}
          </span>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-2xl bg-[#8C1D18]/30 border border-[#F2B8B5]/30 text-[#F2B8B5] text-xs flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Main Form */}
      {!currentVideo && (
        <form onSubmit={handleStartGeneration} className="space-y-6">
          <div className="bg-[#1D1B20] rounded-3xl p-6 sm:p-8 border border-[#49454F]/30 space-y-6">
            {/* Prompt Input */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="block text-sm font-medium text-[#E6E0E9]">
                  Промпт для видеоистории (2–10 предложений)
                </label>
                <span className="text-xs text-[#D0BCFF]">
                  Ролик из {targetMinutes >= 10 ? "34" : "30"} кадров с озвучкой
                </span>
              </div>

              <textarea
                rows={4}
                required
                placeholder="Опишите сюжет истории в 2–10 предложениях... Например: В 2045 году на дне океана находят древний артефакт. Ученые начинают спуск и сталкиваются с аномалиями. По мере расшифровки сигналов становится ясно, что это космический маяк древней цивилизации."
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                disabled={isGenerating}
                className="w-full px-4 py-3.5 rounded-2xl bg-[#2B2930] border border-[#49454F]/40 text-[#E6E0E9] placeholder-[#938F99] text-xs leading-relaxed focus:outline-none focus:border-[#D0BCFF] focus:ring-1 focus:ring-[#D0BCFF] transition-all resize-none"
              />

              {/* Preset prompt pills */}
              <div className="space-y-1.5 pt-1">
                <span className="text-xs text-[#938F99]">Примеры сюжетов:</span>
                <div className="flex flex-col gap-1.5">
                  {PRESET_PROMPTS.map((p, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setTopic(p)}
                      disabled={isGenerating}
                      className="text-left text-xs p-2.5 rounded-xl bg-[#2B2930]/60 hover:bg-[#2B2930] text-[#CAC4D0] hover:text-[#E6E0E9] border border-[#49454F]/30 transition-colors line-clamp-1"
                    >
                      • {p}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Voice Selector Component with Russian and Kazakh Audio Samples */}
            <div className="pt-2 border-t border-[#49454F]/30">
              <VoiceSelector
                selectedVoice={selectedVoice}
                onSelectVoice={(v) => setSelectedVoice(v)}
              />
            </div>

            {/* Styles & Duration Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2 border-t border-[#49454F]/30">
              {/* Visual Style Selection */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-[#E6E0E9] flex items-center gap-1.5">
                  <Palette className="w-4 h-4 text-[#D0BCFF]" />
                  Стиль визуализации кадров
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {STYLE_OPTIONS.map((st) => (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => setSelectedStyle(st.id)}
                      className={`text-left p-3 rounded-2xl border text-xs transition-all ${
                        selectedStyle === st.id
                          ? "bg-[#2B2930] border-[#D0BCFF] text-[#E6E0E9] ring-1 ring-[#D0BCFF]"
                          : "bg-[#141218] border-[#49454F]/40 text-[#CAC4D0] hover:bg-[#25232A]"
                      }`}
                    >
                      <div className="font-medium text-[#E6E0E9]">{st.label}</div>
                      <div className="text-[11px] text-[#938F99] mt-0.5">{st.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Duration selection */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-[#E6E0E9] flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-[#D0BCFF]" />
                  Хронометраж истории
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[8, 10].map((min) => (
                    <button
                      key={min}
                      type="button"
                      onClick={() => setTargetMinutes(min)}
                      className={`p-3 rounded-2xl border text-center transition-all ${
                        targetMinutes === min
                          ? "bg-[#2B2930] border-[#D0BCFF] text-[#D0BCFF] ring-1 ring-[#D0BCFF]"
                          : "bg-[#141218] border-[#49454F]/40 text-[#CAC4D0] hover:bg-[#25232A]"
                      }`}
                    >
                      <div className="font-bold text-sm text-[#E6E0E9]">{min} Минут</div>
                      <div className="text-[11px] text-[#938F99] mt-0.5">
                        {min >= 10 ? "34 кадра" : "30 кадров"}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* M3 Linear Progress Bar */}
            {isGenerating && (
              <div className="space-y-3 p-5 rounded-2xl bg-[#2B2930] border border-[#D0BCFF]/30">
                <div className="flex items-center justify-between text-xs text-[#E6E0E9]">
                  <span className="flex items-center gap-2 font-medium">
                    <Loader2 className="w-4 h-4 animate-spin text-[#D0BCFF]" />
                    <span>{progressStep}</span>
                  </span>
                  <span className="font-mono font-bold text-[#D0BCFF]">{progressPercent}%</span>
                </div>
                <div className="w-full h-2 rounded-full bg-[#36343B] overflow-hidden">
                  <div
                    className="h-full bg-[#D0BCFF] transition-all duration-500 rounded-full"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <p className="text-[11px] text-[#938F99]">
                  Идет сборка аудио и визуальных сцен. Пожалуйста, не закрывайте страницу.
                </p>
              </div>
            )}

            {/* Submit Button */}
            {!isGenerating && (
              <button
                type="submit"
                disabled={user.remaining <= 0 || !topic.trim()}
                className="w-full py-3.5 px-6 rounded-full bg-[#D0BCFF] text-[#381E72] font-semibold text-sm shadow-md hover:opacity-90 transition-all flex items-center justify-center gap-2.5 disabled:opacity-40"
              >
                <Sparkles className="w-4 h-4" />
                <span>Сгенерировать видеоисторию ({targetMinutes} мин, {targetMinutes >= 10 ? "34" : "30"} кадров)</span>
              </button>
            )}
          </div>
        </form>
      )}

      {/* Active Video Player Screen */}
      {currentVideo && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-[#E6E0E9]">{currentVideo.title}</h2>
              <p className="text-xs text-[#938F99]">
                {currentVideo.scenes.length} кадров • Синхронный звук и субтитры
              </p>
            </div>
            <button
              onClick={() => setCurrentVideo(null)}
              className="text-xs px-4 py-2 rounded-full bg-[#2B2930] hover:bg-[#36343B] text-[#CAC4D0] font-medium transition-colors"
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

      {/* Previous History (Material 3 Cards) */}
      <div className="space-y-4 pt-4 border-t border-[#49454F]/30">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-[#E6E0E9] flex items-center gap-2">
            <History className="w-4 h-4 text-[#D0BCFF]" />
            История ваших историй
          </h3>
          <span className="text-xs text-[#938F99]">{pastVideos.length} видео</span>
        </div>

        {loadingHistory ? (
          <div className="p-8 text-center text-xs text-[#938F99] flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-[#D0BCFF]" />
            <span>Загрузка истории...</span>
          </div>
        ) : pastVideos.length === 0 ? (
          <div className="p-8 rounded-3xl bg-[#1D1B20] text-center text-xs text-[#938F99] border border-[#49454F]/30">
            У вас пока нет созданных видеоисторий. Заполните форму выше для первой генерации!
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {pastVideos.map((vid) => (
              <div
                key={vid.id}
                className="p-4 rounded-3xl bg-[#1D1B20] border border-[#49454F]/30 hover:border-[#938F99] transition-all flex flex-col justify-between space-y-3"
              >
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px] text-[#938F99]">
                    <span>{new Date(vid.created_at).toLocaleDateString("ru-RU")}</span>
                    <span className="px-2 py-0.5 rounded-full bg-[#2B2930] text-[#D0BCFF]">
                      {vid.target_duration_minutes} мин
                    </span>
                  </div>
                  <h4 className="font-semibold text-xs text-[#E6E0E9] line-clamp-2">{vid.topic}</h4>
                  <p className="text-[11px] text-[#938F99]">Кадров: {vid.scenes?.length || 0}</p>
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
                  className="w-full py-2 px-3 rounded-full bg-[#2B2930] hover:bg-[#36343B] text-[#D0BCFF] text-xs font-medium flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Открыть плеер</span>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
