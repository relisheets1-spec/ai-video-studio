"use client";

import React, { useEffect, useRef, useState } from "react";
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
  TextAa,
  Trash,
  CaretDown,
  CaretUp,
} from "@phosphor-icons/react";
import { Scene, StudioUser, VideoGeneration, VoiceOption } from "@/lib/types";
import { aspectRatioCss, normalizeOrientation, type Orientation } from "@/lib/orientation";
import { GENRE_IDS, GENRES } from "@/lib/content/genres";
import { STYLE_IDS, STYLES } from "@/lib/content/styles";
import { INSPIRATION } from "@/lib/content/inspiration";
import { type ContentLanguage } from "@/lib/content/languages";
import { defaultVoiceFor } from "@/lib/content/voices";
import { formatPlanLength, planFromMinutes, pluralFrames, MAX_MINUTES, MIN_MINUTES } from "@/lib/plan";
import { authFetch } from "@/lib/client/session";
import { iconFor } from "./content-icons";
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
  Input,
  cn,
} from "@/components/ui";

interface VideoStudioProps {
  user: StudioUser;
  onUserUpdate: (updated: StudioUser) => void;
}

const GENRE_OPTIONS = GENRE_IDS.map((id) => ({
  id,
  label: GENRES[id].label,
  icon: iconFor(GENRES[id].icon),
}));

const STYLE_OPTIONS = STYLE_IDS.map((id) => ({
  id,
  label: STYLES[id].label,
  icon: iconFor(STYLES[id].icon),
}));

/** Сколько стилей показывать до кнопки «Ещё». */
const STYLES_COLLAPSED = 6;
/** Картинки не зависят друг от друга — генерируем пачками; озвучка остаётся последовательной. */
const IMAGE_CONCURRENCY = 3;

const TOPIC_PLACEHOLDER: Record<ContentLanguage, string> = {
  ru: "Опишите сюжет или тему... Например: Смотритель маяка на Каспии зажигает свет каждую ночь, хотя корабли давно ходят по GPS. История одной осени, когда к нему впервые за много лет приехал гость.",
  kz: "Сюжетті сипаттаңыз... Мысалы: Каспийдегі шамшырақ күзетшісі кемелер GPS-пен жүрсе де, шамды әр түн жағады. Оған көп жылдан кейін алғаш рет қонақ келген бір күздің оқиғасы.",
  en: "Describe the story... For example: A lighthouse keeper on the Caspian still lights the lamp every night although ships navigate by GPS. The story of one autumn when a visitor finally came.",
};

export const VideoStudio: React.FC<VideoStudioProps> = ({ user, onUserUpdate }) => {
  const [language, setLanguage] = useState<ContentLanguage>("ru");
  const [topic, setTopic] = useState("");
  const [selectedGenre, setSelectedGenre] = useState(GENRE_OPTIONS[0].id);
  const [selectedStyle, setSelectedStyle] = useState(STYLE_OPTIONS[0].id);
  const [showAllStyles, setShowAllStyles] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState<VoiceOption>(defaultVoiceFor("ru"));
  // По ТЗ значения по умолчанию нет — пользователь обязан выбрать хронометраж сам.
  const [targetMinutes, setTargetMinutes] = useState<number | null>(null);
  const [orientation, setOrientation] = useState<Orientation>("landscape");

  // Ключ ElevenLabs живёт в аккаунте (введён при регистрации); здесь только обновление.
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [keyDraft, setKeyDraft] = useState("");
  const [keySaving, setKeySaving] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [keyWarning, setKeyWarning] = useState<string | null>(null);

  const [isGenerating, setIsGenerating] = useState(false);
  const [progressStep, setProgressStep] = useState("");
  const [progressPercent, setProgressPercent] = useState(0);
  const [currentVideo, setCurrentVideo] = useState<{ id: string; title: string; scenes: Scene[] } | null>(null);
  const [showExporter, setShowExporter] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [pastVideos, setPastVideos] = useState<VideoGeneration[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const previewRef = useRef<HTMLElement | null>(null);

  const syncBalance = async () => {
    try {
      const res = await authFetch("/api/auth/me");
      const data = await res.json();
      if (res.ok && data.user) {
        if (
          data.user.remaining !== user.remaining ||
          data.user.generationsLimit !== user.generationsLimit ||
          data.user.hasElevenLabsKey !== user.hasElevenLabsKey
        ) {
          onUserUpdate(data.user);
        }
      }
    } catch (e) {
      console.error("Balance sync error:", e);
    }
  };

  useEffect(() => {
    fetchHistory();
    syncBalance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id]);

  const fetchHistory = async () => {
    setLoadingHistory(true);
    try {
      const res = await authFetch("/api/videos");
      const data = await res.json();
      if (res.ok && data.videos) {
        setPastVideos(data.videos);
        if (!currentVideo && data.videos.length > 0) {
          const latest = data.videos[0];
          if (latest.scenes && latest.scenes.length > 0) {
            setCurrentVideo({ id: latest.id, title: latest.topic, scenes: latest.scenes });
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

  const handleSaveKey = async (e: React.FormEvent, clear = false) => {
    e.preventDefault();
    setKeySaving(true);
    setKeyError(null);
    try {
      const res = await authFetch("/api/auth/key", {
        method: "POST",
        body: JSON.stringify({ elevenLabsKey: clear ? "" : keyDraft.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Не удалось сохранить ключ");
      onUserUpdate({ ...user, hasElevenLabsKey: !!data.hasElevenLabsKey });
      setKeyDraft("");
      setKeyWarning(null);
      setShowKeyModal(false);
    } catch (err: any) {
      setKeyError(err.message);
    } finally {
      setKeySaving(false);
    }
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
    setKeyWarning(null);
    setProgressPercent(5);
    const currentGenreObj = GENRE_OPTIONS.find((g) => g.id === selectedGenre);

    setProgressStep(
      `Шаг 1 из 4: GPT-4o пишет сплошной закадровый рассказ (${currentGenreObj?.label || "Сюжет"}, ~${plan.minutes} мин)...`
    );

    try {
      // 1. Сценарий: план → монолог → редактор → визуальные промпты
      const scriptRes = await authFetch("/api/generate/script", {
        method: "POST",
        body: JSON.stringify({
          topic: topic.trim(),
          genre: selectedGenre,
          style: selectedStyle,
          voice: selectedVoice,
          language,
          targetMinutes,
          orientation,
        }),
      });
      const scriptData = await scriptRes.json();
      if (!scriptRes.ok) throw new Error(scriptData.error || "Ошибка генерации сценария");

      const videoId: string = scriptData.videoId;
      const scenes: Scene[] = scriptData.scenes;
      const totalScenes = scenes.length;
      setProgressPercent(25);

      // 2. Озвучка кадр за кадром — последовательно и намеренно: каждый
      // запрос кондиционируется соседними фрагментами, иначе на стыках швы.
      const scenesWithAudio: Scene[] = [];
      const recentRequestIds: string[] = [];
      let keyRejected = false;
      for (let i = 0; i < totalScenes; i++) {
        const scene = scenes[i];
        setProgressStep(`Шаг 2 из 4: ElevenLabs синтезирует озвучку диктора (кадр ${i + 1}/${totalScenes})...`);

        const audioRes = await authFetch("/api/generate/audio", {
          method: "POST",
          body: JSON.stringify({
            videoId,
            sceneId: scene.id,
            narration: scene.narration,
            voice: selectedVoice,
            language,
            previousText: scenes[i - 1]?.narration,
            nextText: scenes[i + 1]?.narration,
            previousRequestIds: recentRequestIds.slice(-3),
          }),
        });
        const audioData = await audioRes.json();
        if (!audioRes.ok) throw new Error(audioData.error || `Ошибка генерации аудио кадра ${i + 1}`);

        if (audioData.requestId) recentRequestIds.push(audioData.requestId);
        if (audioData.keyRejected) keyRejected = true;

        scenesWithAudio.push({
          ...scene,
          audioUrl: audioData.audioUrl,
          durationEstimate: audioData.estimatedDuration || scene.durationEstimate,
        });
        setProgressPercent(25 + Math.round(((i + 1) / totalScenes) * 30));
      }
      if (keyRejected) {
        setKeyWarning("ElevenLabs отклонил ваш ключ — озвучка сделана запасным голосом. Проверьте ключ в настройках.");
      }

      // 3. Картинки — пачками по три, они друг от друга не зависят.
      const finalScenes: Scene[] = new Array(totalScenes);
      let nextIndex = 0;
      let doneCount = 0;
      let failure: Error | null = null;
      const worker = async () => {
        while (!failure) {
          const i = nextIndex++;
          if (i >= totalScenes) return;
          const scene = scenesWithAudio[i];
          setProgressStep(`Шаг 3 из 4: AI визуализирует кадры (${doneCount + 1}/${totalScenes}): "${scene.title}"...`);
          try {
            const imgRes = await authFetch("/api/generate/image", {
              method: "POST",
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
            finalScenes[i] = { ...scene, imageUrl: imgData.imageUrl };
            doneCount++;
            setProgressPercent(55 + Math.round((doneCount / totalScenes) * 40));
          } catch (err: any) {
            failure = failure || err;
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(IMAGE_CONCURRENCY, totalScenes) }, worker));
      if (failure) throw failure;

      // 4. Финализация
      setProgressStep("Шаг 4 из 4: Сохранение фильма и обновление баланса...");
      const finalizeRes = await authFetch("/api/generate/finalize", {
        method: "POST",
        body: JSON.stringify({
          videoId,
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
      setCurrentVideo({ id: videoId, title: scriptData.title || topic, scenes: finalScenes });
      if (finData.user) onUserUpdate(finData.user);

      fetchHistory();
      setTopic("");

      // На телефоне плеер над формой — подводим к нему.
      if (typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches) {
        requestAnimationFrame(() =>
          previewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
        );
      }
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

  const visibleStyles = showAllStyles ? STYLE_OPTIONS : STYLE_OPTIONS.slice(0, STYLES_COLLAPSED);
  const selectedStyleHidden = !showAllStyles && !visibleStyles.some((st) => st.id === selectedStyle);

  return (
    <div className="w-full max-w-shell mx-auto px-5 sm:px-8 pt-6 sm:pt-8 pb-32">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6 sm:mb-7">
        <div className="min-w-0">
          <h1 className="text-[26px] sm:text-[32px] font-bold tracking-tight text-ink leading-none">
            Создание видеоистории
          </h1>
        </div>

        <button
          type="button"
          onClick={() => {
            setKeyError(null);
            setShowKeyModal(true);
          }}
          title="Ключ ElevenLabs вашего аккаунта"
          className={cn(
            "inline-flex items-center gap-2 h-10 px-4 rounded-full border shrink-0",
            "text-[13px] font-medium transition-colors cursor-pointer",
            user.hasElevenLabsKey
              ? "bg-contrast text-contrast-ink border-transparent"
              : "bg-surface-2 text-muted border-hairline hover:text-ink hover:border-hairline-strong"
          )}
        >
          <Key size={16} className={user.hasElevenLabsKey ? "text-accent" : "text-faint"} />
          <span>{user.hasElevenLabsKey ? "Ключ ElevenLabs" : "Добавить ключ"}</span>
          {user.hasElevenLabsKey && <span className="w-1.5 h-1.5 rounded-full bg-accent" />}
        </button>
      </div>

      {error && (
        <Alert tone="danger" className="mb-5">
          {error}
        </Alert>
      )}
      {keyWarning && (
        <Alert tone="warn" className="mb-5">
          {keyWarning}
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
              placeholder={TOPIC_PLACEHOLDER[language]}
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

          <Tile title="Жанр истории" icon={<FilmStrip size={20} />}>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 sm:gap-2.5">
              {GENRE_OPTIONS.map((g) => {
                const Icon = g.icon;
                return (
                  <SelectCard
                    key={g.id}
                    size="sm"
                    selected={selectedGenre === g.id}
                    onClick={() => setSelectedGenre(g.id)}
                    icon={<Icon size={18} />}
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

                {targetMinutes !== null && (
                  <div className="rounded-control bg-surface-2 border border-hairline px-3.5 py-3 text-[13px] text-muted leading-snug grid grid-cols-2 gap-x-3 gap-y-1 sm:flex sm:flex-wrap sm:items-center sm:gap-x-2">
                    <span className="whitespace-nowrap text-ink font-medium">{formatPlanLength(plan)}</span>
                    <span className="hidden sm:inline text-faint">·</span>
                    <span className="whitespace-nowrap">{pluralFrames(plan.scenesCount)}</span>
                    <span className="hidden sm:inline text-faint">·</span>
                    <span className="whitespace-nowrap tabular">
                      ~{plan.estimatedChars.toLocaleString("ru-RU")} символов
                    </span>
                    <span className="hidden sm:inline text-faint">·</span>
                    <span className="whitespace-nowrap tabular">≈ ${plan.estimatedCostUsd.toFixed(2)}</span>
                  </div>
                )}
              </div>
            </Tile>

            <Tile
              title="Визуальный стиль"
              icon={<Sliders size={20} />}
              action={
                selectedStyleHidden && activeStyle ? (
                  <Badge tone="outline">{activeStyle.label}</Badge>
                ) : null
              }
            >
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {visibleStyles.map((st) => {
                  const Icon = st.icon;
                  return (
                    <SelectCard
                      key={st.id}
                      size="sm"
                      selected={selectedStyle === st.id}
                      onClick={() => setSelectedStyle(st.id)}
                      icon={<Icon size={18} />}
                      title={st.label}
                    />
                  );
                })}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mt-2.5 w-full"
                icon={showAllStyles ? <CaretUp size={14} /> : <CaretDown size={14} />}
                onClick={() => setShowAllStyles((v) => !v)}
              >
                {showAllStyles ? "Свернуть" : `Ещё ${STYLE_OPTIONS.length - STYLES_COLLAPSED} стилей`}
              </Button>
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
                meta="Reels · Shorts · TikTok · 1080×1920"
              />
            </div>
          </Tile>
        </form>

        {/* ================= ПРАВО: монитор и архив ================= */}
        {/* На телефоне обёртка растворяется (contents): плеер встаёт первым,
            над формой, а плитки и архив — после неё. На десктопе это липкая колонка. */}
        <div className="contents lg:flex lg:col-span-5 lg:flex-col lg:gap-5 lg:min-w-0 lg:sticky lg:top-24">
          {/* Экран всегда тёмный — в обеих темах, как у любого плеера. На телефоне
              кадр во всю ширину экрана: секция выходит за отступы страницы. */}
          <section
            ref={previewRef}
            className={cn(
              "order-first lg:order-none min-w-0 scroll-mt-20",
              "bg-stage text-stage-ink border-white/[0.08] shadow-soft",
              "-mx-5 sm:mx-0 rounded-none sm:rounded-tile border-y sm:border px-0 sm:px-5 pt-3.5 sm:pt-5 pb-3 sm:pb-5"
            )}
          >
            <div className="flex items-center justify-between gap-3 mb-3 sm:mb-4 px-4 sm:px-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="grid place-items-center w-9 h-9 rounded-control bg-white/[0.06] text-accent shrink-0">
                  <FilmStrip size={20} weight="fill" />
                </span>
                <span className="text-[15px] font-semibold truncate">Предпросмотр фильма</span>
              </div>

              {currentVideo && (
                <Button size="sm" onClick={() => setShowExporter(true)}>
                  Экспорт
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
              <>
                {/* Телефон: короткая полоска вместо пустого кадра на пол-экрана */}
                <div className="sm:hidden mx-4 h-24 rounded-control bg-black/40 border border-white/[0.08] flex items-center justify-center gap-3 px-4 select-none">
                  <span className="grid place-items-center w-9 h-9 rounded-control bg-white/[0.05] text-white/40 shrink-0">
                    <FilmStrip size={20} />
                  </span>
                  <span className="text-[13px] text-white/60 leading-snug">
                    {isGenerating ? progressStep || "Генерация..." : "Здесь появится готовое видео"}
                  </span>
                </div>
                <div
                  className="hidden sm:flex rounded-control bg-black/40 border border-white/[0.08] flex-col items-center justify-center gap-3 p-6 text-center select-none mx-auto"
                  style={{
                    aspectRatio: aspectRatioCss(orientation),
                    ...(orientation === "portrait"
                      ? { width: "min(100%, calc(min(70vh, 620px) * 9 / 16))", height: "auto" }
                      : { width: "100%", height: "auto" }),
                    maxWidth: "100%",
                  }}
                >
                  <span className="grid place-items-center w-12 h-12 rounded-control bg-white/[0.05] text-white/40">
                    <FilmStrip size={24} />
                  </span>
                  <div className="text-[13.5px] text-white/60">
                    {isGenerating ? progressStep || "Генерация..." : "Здесь появится готовое видео"}
                  </div>
                </div>
              </>
            )}
          </section>

          {/* Показатели под монитором. На телефоне — три низкие плитки в ряд. */}
          <div className="grid grid-cols-3 gap-2 sm:gap-4">
            <StatTile
              label="Кадров"
              value={currentVideo ? currentVideo.scenes.length : plannedFrames}
              icon={<FilmStrip size={20} />}
            />
            <StatTile
              label={
                <>
                  <span className="sm:hidden">Время</span>
                  <span className="hidden sm:inline">Длительность</span>
                </>
              }
              value={currentVideo ? formatSeconds(currentDuration) : plannedLength}
              icon={<Clock size={20} />}
            />
            <StatTile
              label="Осталось"
              value={user.remaining}
              icon={<Lightning size={20} />}
              tone={user.remaining > 0 ? "contrast" : "surface"}
            />
          </div>

          {pastVideos.length > 0 && (
            <Tile
              title="Архив"
              icon={<ArrowCounterClockwise size={20} />}
              action={
                <span className="text-[12px] text-faint tabular">
                  {loadingHistory ? "…" : `${pastVideos.length} видео`}
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
                      onClick={() => setCurrentVideo({ id: vid.id, title: vid.topic, scenes: vid.scenes })}
                      className={cn(
                        "flex items-center justify-between gap-3 p-3 rounded-control border",
                        "text-left cursor-pointer transition-colors",
                        isCurrent
                          ? "bg-surface-2 border-accent"
                          : "bg-surface border-hairline hover:border-hairline-strong hover:bg-surface-2"
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13.5px] font-medium text-ink truncate">{vid.topic}</span>
                        <span className="block text-[12px] text-muted mt-0.5 tabular">
                          {vid.scenes?.length || 0} сцен • {Math.round(vid.actual_duration_seconds || 0)} сек
                          {normalizeOrientation(vid.scenes?.[0]?.orientation) === "portrait" ? " • 9:16" : " • 16:9"}
                        </span>
                      </span>
                      <span
                        className={cn(
                          "grid place-items-center w-8 h-8 rounded-control shrink-0",
                          isCurrent ? "bg-accent text-accent-ink" : "bg-surface-3 text-muted"
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

      {/* ============ Липкая нижняя панель: сводка + запуск ============ */}
      <div className="fixed bottom-0 inset-x-0 z-30 border-t border-hairline bg-bg/90 backdrop-blur-xl">
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
          defaultOrientation={currentOrientation}
          onClose={() => setShowExporter(false)}
        />
      )}

      <Modal
        open={showKeyModal}
        onClose={() => setShowKeyModal(false)}
        title="Мой ключ ElevenLabs"
        hint={
          user.hasElevenLabsKey
            ? "Ключ сохранён в аккаунте в зашифрованном виде. Здесь его можно заменить или удалить."
            : "Без ключа озвучка идёт запасным голосом OpenAI. Введите ключ ElevenLabs, чтобы использовать выбранные голоса."
        }
        icon={
          <IconTile size="md">
            <Key size={20} weight="fill" />
          </IconTile>
        }
      >
        <form id="key-form" onSubmit={(e) => handleSaveKey(e)} className="flex flex-col gap-4">
          {keyError && <Alert tone="danger">{keyError}</Alert>}
          <Input
            type="text"
            placeholder="sk_..."
            value={keyDraft}
            onChange={(e) => setKeyDraft(e.target.value)}
            className="font-mono text-[13px]"
            autoComplete="off"
          />

          <div className="flex flex-wrap gap-2.5 pt-1">
            <Button type="submit" loading={keySaving} disabled={!keyDraft.trim()} className="flex-1">
              Сохранить ключ
            </Button>
            {user.hasElevenLabsKey && (
              <Button
                type="button"
                variant="danger"
                icon={<Trash size={16} />}
                disabled={keySaving}
                onClick={(e) => handleSaveKey(e as unknown as React.FormEvent, true)}
              >
                Удалить
              </Button>
            )}
            <Button type="button" variant="secondary" onClick={() => setShowKeyModal(false)}>
              Отмена
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
