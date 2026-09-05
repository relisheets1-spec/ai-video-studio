"use client";

import React, { useState, useEffect } from "react";
import {
  Play,
  Clock,
  Sliders,
  FrameCorners,
  DeviceMobile,
  FilmStrip,
  Key,
  ArrowCounterClockwise,
  Lightning,
  MagnifyingGlass,
  Heart,
  Smiley,
  Planet,
  Ghost,
  Camera,
  Archive,
  Palette,
  BookOpen,
  Sparkle,
  PaintBrush,
  TextAa,
  Trash,
} from "@phosphor-icons/react";
import { Scene, VideoGeneration, VoiceOption } from "@/lib/types";
import { aspectRatioCss, normalizeOrientation, type Orientation } from "@/lib/orientation";
import { GENRE_IDS, GENRES, type GenreId } from "@/lib/content/genres";
import { STYLE_IDS, STYLES, type StyleId } from "@/lib/content/styles";
import { INSPIRATION } from "@/lib/content/inspiration";
import { type ContentLanguage } from "@/lib/content/languages";
import { defaultVoiceFor } from "@/lib/content/voices";
import { formatPlanLength, planFromMinutes, pluralFrames, MAX_MINUTES, MIN_MINUTES } from "@/lib/plan";
import { VideoPlayer } from "./VideoPlayer";
import { VideoExporter } from "./VideoExporter";
import { VoiceSelector } from "./VoiceSelector";
import {
  Alert,
  Badge,
  StatTile,
  Button,
  IconTile,
  Modal,
  Progress,
  Slider,
  SelectCard,
  Textarea,
  Tile,
  cn,
} from "@/components/ui";

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

/**
 * Каталоги жанров, стилей и тем переехали в src/lib/content — их же читают
 * серверные роуты. Здесь остаётся только сопоставление ключа иконке: тянуть
 * React-компоненты в модуль, который импортирует route handler, не нужно.
 */
const GENRE_ICONS: Record<GenreId, React.ElementType> = {
  thriller: Lightning,
  detective: MagnifyingGlass,
  drama: Heart,
  comedy: Smiley,
  scifi_adventure: Planet,
  horror: Ghost,
  narrative: BookOpen,
};

const STYLE_ICONS: Record<StyleId, React.ElementType> = {
  cinematic: Camera,
  documentary: Archive,
  cyberpunk: Lightning,
  concept_art: Palette,
  noir: MagnifyingGlass,
  anime: Sparkle,
  watercolor: PaintBrush,
  retro_film: FilmStrip,
};

const GENRE_OPTIONS = GENRE_IDS.map((id) => ({
  id,
  label: GENRES[id].label,
  icon: GENRE_ICONS[id],
}));

const STYLE_OPTIONS = STYLE_IDS.map((id) => ({
  id,
  label: STYLES[id].label,
  icon: STYLE_ICONS[id],
}));

export const VideoStudio: React.FC<VideoStudioProps> = ({ user, onUserUpdate }) => {
  const [language, setLanguage] = useState<ContentLanguage>("ru");
  const [topic, setTopic] = useState("");
  const [selectedGenre, setSelectedGenre] = useState(GENRE_OPTIONS[0].id);
  const [selectedStyle, setSelectedStyle] = useState(STYLE_OPTIONS[0].id);
  const [selectedVoice, setSelectedVoice] = useState<VoiceOption>(defaultVoiceFor("ru"));
  // ТЗ: значения по умолчанию нет — пользователь обязан выбрать хронометраж
  // сам, до этого кнопка запуска заблокирована.
  const [targetMinutes, setTargetMinutes] = useState<number | null>(null);
  // Ориентация кадра. По умолчанию 16:9 — так были сгенерированы все прошлые видео.
  const [orientation, setOrientation] = useState<Orientation>("landscape");

  // Personal ElevenLabs key
  const [userKey, setUserKey] = useState("");
  const [showKeyModal, setShowKeyModal] = useState(false);

  const [isGenerating, setIsGenerating] = useState(false);
  const [progressStep, setProgressStep] = useState("");
  const [progressPercent, setProgressPercent] = useState(0);
  const [currentVideo, setCurrentVideo] = useState<{ id: string; title: string; scenes: Scene[] } | null>(null);
  const [showExporter, setShowExporter] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [pastVideos, setPastVideos] = useState<VideoGeneration[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const syncBalance = async () => {
    if (!user?.secretCode && !user?.id) return;
    try {
      const params = new URLSearchParams();
      if (user.id) params.set("userId", user.id);
      if (user.secretCode) params.set("secretCode", user.secretCode);
      const res = await fetch(`/api/auth?${params.toString()}`);
      const data = await res.json();
      if (res.ok && data.user) {
        if (data.user.remaining !== user.remaining || data.user.generationsLimit !== user.generationsLimit) {
          onUserUpdate(data.user);
          localStorage.setItem("ai_video_user", JSON.stringify(data.user));
        }
      }
    } catch (e) {
      console.error("Balance sync error:", e);
    }
  };

  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedKey = localStorage.getItem("elevenlabs_user_key");
      if (savedKey) setUserKey(savedKey);
    }
    fetchHistory();
    syncBalance();

    if (typeof window !== "undefined") {
      window.addEventListener("focus", syncBalance);
      return () => window.removeEventListener("focus", syncBalance);
    }
  }, [user.secretCode, user.id]);

  const fetchHistory = async () => {
    setLoadingHistory(true);
    try {
      const params = new URLSearchParams();
      if (user.id) params.set("userId", user.id);
      if (user.secretCode) params.set("secretCode", user.secretCode);
      const res = await fetch(`/api/videos?${params.toString()}`);
      const data = await res.json();
      if (res.ok && data.videos) {
        setPastVideos(data.videos);
        if (!currentVideo && data.videos.length > 0) {
          const latest = data.videos[0];
          if (latest.scenes && latest.scenes.length > 0) {
            setCurrentVideo({
              id: latest.id,
              title: latest.topic,
              scenes: latest.scenes,
            });
          }
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingHistory(false);
    }
  };

  const inspirationThemes = INSPIRATION[language];

  const handleSaveKey = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = userKey.trim();
    if (clean) {
      localStorage.setItem("elevenlabs_user_key", clean);
    } else {
      localStorage.removeItem("elevenlabs_user_key");
    }
    setShowKeyModal(false);
  };

  const handleLanguageChange = (newLang: ContentLanguage) => {
    setLanguage(newLang);
    setSelectedVoice(defaultVoiceFor(newLang));
  };

  const handleStartGeneration = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic.trim()) return;
    if (targetMinutes === null) {
      setError("Выберите хронометраж перед запуском генерации");
      return;
    }

    if (user.remaining <= 0) {
      setError("Лимит генераций исчерпан. Обратитесь к администратору.");
      return;
    }

    setIsGenerating(true);
    setError(null);
    setProgressPercent(5);
    const currentGenreObj = GENRE_OPTIONS.find((g) => g.id === selectedGenre);

    setProgressStep(
      `Шаг 1 из 4: GPT-4o пишет сплошной закадровый рассказ (${currentGenreObj?.label || "Сюжет"}, ~${plan.minutes} мин)...`
    );

    try {
      // 1. Script generation
      const scriptRes = await fetch("/api/generate/script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: topic.trim(),
          genre: selectedGenre,
          style: selectedStyle,
          voice: selectedVoice,
          language,
          targetMinutes,
          orientation,
          userId: user.id,
          secretCode: user.secretCode,
        }),
      });

      const scriptData = await scriptRes.json();
      if (!scriptRes.ok) throw new Error(scriptData.error || "Ошибка генерации сценария");

      const videoId = scriptData.videoId;
      let scenes: Scene[] = scriptData.scenes;
      const totalScenes = scenes.length;

      setProgressPercent(25);

      // 2. Озвучка кадр за кадром.
      // Последовательно и намеренно: каждый запрос кондиционируется соседними
      // фрагментами и id предыдущих запросов, иначе 30 независимо
      // синтезированных файлов звучат как 30 разных дублей и на стыках слышны швы.
      const scenesWithAudio: Scene[] = [];
      const recentRequestIds: string[] = [];
      for (let i = 0; i < totalScenes; i++) {
        const scene = scenes[i];
        setProgressStep(
          `Шаг 2 из 4: ElevenLabs синтезирует озвучку диктора (кадр ${i + 1}/${totalScenes})...`
        );

        const audioRes = await fetch("/api/generate/audio", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            videoId,
            sceneId: scene.id,
            narration: scene.narration,
            voice: selectedVoice,
            language,
            previousText: scenes[i - 1]?.narration,
            nextText: scenes[i + 1]?.narration,
            previousRequestIds: recentRequestIds.slice(-3),
            elevenLabsApiKey: userKey || undefined,
          }),
        });

        const audioData = await audioRes.json();
        if (!audioRes.ok) throw new Error(audioData.error || `Ошибка генерации аудио кадра ${i + 1}`);

        if (audioData.requestId) recentRequestIds.push(audioData.requestId);

        scenesWithAudio.push({
          ...scene,
          audioUrl: audioData.audioUrl,
          durationEstimate: audioData.estimatedDuration || scene.durationEstimate,
        });

        const audioProgress = 25 + Math.round(((i + 1) / totalScenes) * 30);
        setProgressPercent(audioProgress);
      }

      // 3. Image generation
      const finalScenes: Scene[] = [];
      for (let i = 0; i < totalScenes; i++) {
        const scene = scenesWithAudio[i];
        setProgressStep(
          `Шаг 3 из 4: AI визуализирует кадр ${i + 1}/${totalScenes}: "${scene.title}"...`
        );

        const imgRes = await fetch("/api/generate/image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            videoId,
            sceneId: scene.id,
            visualPrompt: scene.visualPrompt,
            style: selectedStyle,
            orientation,
          }),
        });

        const imgData = await imgRes.json();
        if (!imgRes.ok) throw new Error(imgData.error || `Ошибка генерации изображения кадра ${i + 1}`);

        finalScenes.push({
          ...scene,
          imageUrl: imgData.imageUrl,
        });

        const imgProgress = 55 + Math.round(((i + 1) / totalScenes) * 40);
        setProgressPercent(imgProgress);
      }

      // 4. Finalize
      setProgressStep("Шаг 4 из 4: Сохранение фильма и обновление баланса...");
      const finalizeRes = await fetch("/api/generate/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoId,
          userId: user.id,
          secretCode: user.secretCode,
          scenes: finalScenes,
          totalDuration: finalScenes.reduce(
            (acc, sc) => acc + (sc.actualDuration || sc.durationEstimate || 0),
            0
          ),
        }),
      });

      const finData = await finalizeRes.json();
      if (!finalizeRes.ok) throw new Error(finData.error || "Ошибка сохранения видео");

      setProgressPercent(100);

      setCurrentVideo({
        id: videoId,
        title: scriptData.title || topic,
        scenes: finalScenes,
      });

      if (finData.user) {
        onUserUpdate(finData.user);
        localStorage.setItem("ai_video_user", JSON.stringify(finData.user));
      }

      fetchHistory();
      setTopic("");
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Произошла ошибка при генерации видео");
    } finally {
      setIsGenerating(false);
      setProgressStep("");
    }
  };


  const currentOrientation = currentVideo
    ? normalizeOrientation(currentVideo.scenes[0]?.orientation)
    : orientation;

  const activeGenre = GENRE_OPTIONS.find((g) => g.id === selectedGenre);
  const activeStyle = STYLE_OPTIONS.find((st) => st.id === selectedStyle);
  const wordCount = topic.split(" ").filter(Boolean).length;
  // Единый расчёт «что именно будет сгенерировано»: кадры, длина и стоимость
  // считаются одной функцией и на клиенте, и на сервере.
  const plan = planFromMinutes(targetMinutes ?? MIN_MINUTES, language);
  const plannedFrames = targetMinutes === null ? "—" : plan.scenesCount;
  const plannedLength = targetMinutes === null ? "—" : formatPlanLength(plan);
  const currentDuration = currentVideo
    ? currentVideo.scenes.reduce((acc, sc) => acc + (sc.actualDuration || sc.durationEstimate || 0), 0)
    : 0;
  const formatSeconds = (sec: number) =>
    sec >= 60
      ? Math.floor(sec / 60) + ":" + String(Math.round(sec % 60)).padStart(2, "0")
      : Math.round(sec) + " сек";

  return (
    <div className="w-full max-w-shell mx-auto px-5 sm:px-8 pt-8 pb-32">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-7">
        <div className="min-w-0">
          <h1 className="text-[28px] sm:text-[32px] font-bold tracking-tight text-ink leading-none">
            Создание видеоистории
          </h1>
        </div>

        <button
          type="button"
          onClick={() => setShowKeyModal(true)}
          title="Ввести персональный API-ключ ElevenLabs"
          className={cn(
            "inline-flex items-center gap-2 h-10 px-4 rounded-full border shrink-0",
            "text-[13px] font-medium transition-colors cursor-pointer",
            userKey
              ? "bg-contrast text-contrast-ink border-transparent"
              : "bg-surface-2 text-muted border-hairline hover:text-ink hover:border-hairline-strong"
          )}
        >
          <Key size={16} className={userKey ? "text-accent" : "text-faint"} />
          <span>{userKey ? "Ключ ElevenLabs" : "Добавить ключ"}</span>
          {userKey && <span className="w-1.5 h-1.5 rounded-full bg-accent" />}
        </button>
      </div>

      {error && (
        <Alert tone="danger" className="mb-5">
          {error}
        </Alert>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* ================= ЛЕВО: настройки ================= */}
        <form
          id="studio-form"
          onSubmit={handleStartGeneration}
          className="lg:col-span-7 flex flex-col gap-5 min-w-0"
        >
          <Tile
            title="Сюжет"
            icon={<TextAa size={20} />}
            action={
              wordCount > 0 ? (
                <span className="text-[12px] text-faint tabular">{wordCount} слов</span>
              ) : null
            }
          >
            <Textarea
              rows={4}
              required
              placeholder={
                language === "kz"
                  ? "Сюжетті сипаттаңыз... Мысалы: Алматыдағы түнгі тонау оқиғасы немесе IT-стартаптың өрлеуі мен күйреуі туралы драма."
                  : "Введите сюжет или тему для видео... Например: Ночное ограбление в Алматы. Дерзкая группа взломщиков проникает в банк, но непредвиденный сбой меняет все планы."
              }
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              disabled={isGenerating}
            />

            <div className="flex flex-wrap gap-2 mt-3.5">
              {inspirationThemes.map((t, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setTopic(t.prompt);
                    if (t.genre) setSelectedGenre(t.genre);
                  }}
                  disabled={isGenerating}
                  className="h-8 px-3.5 rounded-full bg-surface-2 border border-hairline text-[12.5px] text-muted hover:text-ink hover:border-hairline-strong transition-colors cursor-pointer disabled:opacity-45"
                >
                  {t.label}
                </button>
              ))}
            </div>
          </Tile>

          <Tile
            title="Жанр истории"
            icon={<FilmStrip size={20} />}
          >
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {GENRE_OPTIONS.map((g) => {
                const Icon = g.icon;
                return (
                  <SelectCard
                    key={g.id}
                    selected={selectedGenre === g.id}
                    onClick={() => setSelectedGenre(g.id)}
                    icon={<Icon size={20} />}
                    title={g.label}
                  />
                );
              })}
            </div>
          </Tile>

          <Tile>
            <VoiceSelector
              selectedVoice={selectedVoice}
              onSelectVoice={(v) => setSelectedVoice(v)}
              language={language}
              onLanguageChange={handleLanguageChange}
            />
          </Tile>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <Tile title="Хронометраж" icon={<Clock size={20} />}>
              <div className="flex flex-col gap-4">
                <Slider
                  value={targetMinutes}
                  min={MIN_MINUTES}
                  max={MAX_MINUTES}
                  step={1}
                  onChange={setTargetMinutes}
                  placeholder="Выберите длительность"
                  valueLabel={`${plan.minutes} мин · ${pluralFrames(plan.scenesCount)}`}
                  ticks={[MIN_MINUTES, 4, 7, MAX_MINUTES]}
                />

                {/* Стоимость показываем честно: прежние подписи ($0.05 / $0.37)
                    учитывали только картинки и занижали цену примерно вчетверо,
                    потому что озвучка в них не входила вовсе. */}
                {targetMinutes !== null && (
                  <div className="rounded-control bg-surface-2 border border-hairline px-3.5 py-3 text-[13px] text-muted leading-snug">
                    <span className="text-ink font-medium">{formatPlanLength(plan)}</span>
                    {" · "}
                    {pluralFrames(plan.scenesCount)}
                    {" · "}
                    <span className="tabular">~{plan.estimatedChars.toLocaleString("ru-RU")}</span> символов ElevenLabs
                    {" · "}
                    <span className="tabular">≈ ${plan.estimatedCostUsd.toFixed(2)}</span>
                  </div>
                )}
              </div>
            </Tile>

            <Tile title="Визуальный стиль" icon={<Sliders size={20} />}>
              <div className="grid grid-cols-1 gap-2.5">
                {STYLE_OPTIONS.map((st) => {
                  const Icon = st.icon;
                  return (
                    <SelectCard
                      key={st.id}
                      layout="horizontal"
                      selected={selectedStyle === st.id}
                      onClick={() => setSelectedStyle(st.id)}
                      icon={<Icon size={20} />}
                      title={st.label}
                    />
                  );
                })}
              </div>
            </Tile>
          </div>

          <Tile title="Формат кадра" icon={<FrameCorners size={20} />}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <SelectCard
                layout="horizontal"
                selected={orientation === "landscape"}
                onClick={() => setOrientation("landscape")}
                icon={<FrameCorners size={20} />}
                title="Горизонтальный 16:9"
                meta="YouTube · 1920×1080"
              />
              <SelectCard
                layout="horizontal"
                selected={orientation === "portrait"}
                onClick={() => setOrientation("portrait")}
                icon={<DeviceMobile size={20} />}
                title="Вертикальный 9:16"
                meta="Reels и Shorts · 1080×1920"
              />
            </div>
          </Tile>
        </form>

        {/* ================= ПРАВО: монитор и архив ================= */}
        <div className="lg:col-span-5 flex flex-col gap-5 min-w-0 lg:sticky lg:top-24">
          {/* Экран всегда тёмный — в обеих темах, как у любого плеера. */}
          <section className="rounded-tile bg-stage text-stage-ink border border-white/[0.08] shadow-soft p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="grid place-items-center w-9 h-9 rounded-control bg-white/[0.06] text-accent shrink-0">
                  <FilmStrip size={20} weight="fill" />
                </span>
                <span className="text-[15px] font-semibold truncate">
                  Предпросмотр фильма
                </span>
              </div>

              {currentVideo && (
                <Button size="sm" onClick={() => setShowExporter(true)}>
                  Экспорт MP4
                </Button>
              )}
            </div>

            {currentVideo ? (
              <VideoPlayer
                title={currentVideo.title}
                scenes={currentVideo.scenes}
                orientation={currentOrientation}
                onExportClick={() => setShowExporter(true)}
              />
            ) : (
              <div
                className="rounded-control bg-black/40 border border-white/[0.08] flex flex-col items-center justify-center gap-3 p-6 text-center select-none mx-auto"
                style={{
                  aspectRatio: aspectRatioCss(orientation),
                  ...(orientation === "portrait"
                    ? { height: "min(70vh, 620px)", width: "auto" }
                    : { width: "100%", height: "auto" }),
                  maxWidth: "100%",
                }}
              >
                <span className="grid place-items-center w-12 h-12 rounded-control bg-white/[0.05] text-white/40">
                  <FilmStrip size={24} />
                </span>
                <div>
                  <div className="text-[13.5px] text-white/60">
                    Здесь появится готовое видео
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* Показатели под монитором: заполняют правую колонку и дают
              быстрый ответ на «что именно сейчас будет сгенерировано». */}
          {/* На телефоне три колонки давали ~61px под контент — цифры обрезались.
              «Осталось» самая важная плитка, поэтому в мобильном ряду она идёт
              первой во всю ширину. */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-4">
            <StatTile
              label="Кадров"
              value={currentVideo ? currentVideo.scenes.length : plannedFrames}
              icon={<FilmStrip size={20} />}
            />
            <StatTile
              label="Длительность"
              value={currentVideo ? formatSeconds(currentDuration) : plannedLength}
              icon={<Clock size={20} />}
            />
            <StatTile
              label="Осталось"
              value={user.remaining}
              icon={<Lightning size={20} />}
              tone={user.remaining > 0 ? "contrast" : "surface"}
              className="col-span-2 sm:col-span-1"
            />
          </div>

          {pastVideos.length > 0 && (
            <Tile
              title="Архив"
              icon={<ArrowCounterClockwise size={20} />}
              action={
                <span className="text-[12px] text-faint tabular">
                  {pastVideos.length} видео
                </span>
              }
            >
              <div className="flex flex-col gap-2 max-h-[320px] overflow-y-auto pr-1">
                {pastVideos.map((vid) => {
                  const isCurrent = currentVideo?.id === vid.id;
                  return (
                    <button
                      key={vid.id}
                      type="button"
                      onClick={() => {
                        setCurrentVideo({
                          id: vid.id,
                          title: vid.topic,
                          scenes: vid.scenes,
                        });
                      }}
                      className={cn(
                        "flex items-center justify-between gap-3 p-3 rounded-control border",
                        "text-left cursor-pointer transition-colors",
                        isCurrent
                          ? "bg-surface-2 border-accent"
                          : "bg-surface border-hairline hover:border-hairline-strong hover:bg-surface-2"
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13.5px] font-medium text-ink truncate">
                          {vid.topic}
                        </span>
                        <span className="block text-[12px] text-muted mt-0.5 tabular">
                          {vid.scenes?.length || 0} сцен • {Math.round(vid.actual_duration_seconds || 0)} сек
                        </span>
                      </span>
                      <span
                        className={cn(
                          "grid place-items-center w-8 h-8 rounded-control shrink-0",
                          isCurrent
                            ? "bg-accent text-accent-ink"
                            : "bg-surface-3 text-muted"
                        )}
                      >
                        <Play size={14} weight="fill" />
                      </span>
                    </button>
                  );
                })}
              </div>
            </Tile>
          )}
        </div>
      </div>

      {/* ============ Липкая нижняя панель: сводка + запуск ============
          Кнопка вынесена из формы, поэтому привязана к ней через form="studio-form".
          Так CTA и прогресс всегда на экране и не выталкивают вёрстку. */}
      <div className="fixed bottom-0 inset-x-0 z-30 border-t border-hairline bg-bg/90 backdrop-blur-xl">
        {/* Высота деки одинакова в обоих состояниях: иначе при переходе
            «форма → генерация → результат» контент сползал относительно
            фиксированного отступа снизу. */}
        <div className="max-w-shell mx-auto px-5 sm:px-8 py-3.5 min-h-[76px] sm:min-h-[72px] flex flex-col justify-center">
          {isGenerating ? (
            <Progress value={progressPercent} label={progressStep} />
          ) : (
            <div className="flex items-center justify-between gap-4">
              <div className="hidden md:flex items-center gap-2 min-w-0 text-[12.5px] text-muted">
                {activeGenre && <Badge tone="outline">{activeGenre.label}</Badge>}
                {activeStyle && <Badge tone="outline">{activeStyle.label}</Badge>}
                {targetMinutes !== null && <Badge tone="outline">{pluralFrames(plan.scenesCount)}</Badge>}
                <Badge tone="outline">{orientation === "portrait" ? "9:16" : "16:9"}</Badge>
              </div>

              <Button
                type="submit"
                form="studio-form"
                size="lg"
                icon={<Play size={20} weight="fill" />}
                disabled={user.remaining <= 0 || !topic.trim() || targetMinutes === null}
                className="w-full md:w-auto"
              >
                {targetMinutes === null ? "Выберите хронометраж" : "Запустить генерацию"}
              </Button>
            </div>
          )}
        </div>
      </div>

      {showExporter && currentVideo && (
        <VideoExporter
          title={currentVideo.title}
          scenes={currentVideo.scenes}
          orientation={currentOrientation}
          onClose={() => setShowExporter(false)}
        />
      )}

      <Modal
        open={showKeyModal}
        onClose={() => setShowKeyModal(false)}
        title="Персональный ключ ElevenLabs"

        icon={
          <IconTile size="md">
            <Key size={20} weight="fill" />
          </IconTile>
        }
      >
        <form id="key-form" onSubmit={handleSaveKey} className="flex flex-col gap-4">
          <label className="flex flex-col gap-2">
            <span className="text-[13px] font-medium text-ink">
              Ключ сохранится только в вашем браузере
            </span>
            <input
              type="text"
              placeholder="sk_..."
              value={userKey}
              onChange={(e) => setUserKey(e.target.value)}
              className="w-full h-11 px-3.5 rounded-control bg-surface-2 border border-hairline text-ink placeholder:text-faint text-[13px] font-mono transition-colors hover:border-hairline-strong focus:outline-none focus:border-accent focus:bg-surface"
            />
          </label>

          <div className="flex gap-2.5 pt-1">
            <Button type="submit" block>
              Сохранить ключ
            </Button>
            {userKey && (
              <Button
                type="button"
                variant="danger"
                icon={<Trash size={16} />}
                onClick={() => {
                  setUserKey("");
                  localStorage.removeItem("elevenlabs_user_key");
                  setShowKeyModal(false);
                }}
              >
                Удалить
              </Button>
            )}
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowKeyModal(false)}
            >
              Отмена
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
