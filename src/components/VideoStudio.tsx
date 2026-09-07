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
  Hourglass,
  YoutubeLogo,
  TiktokLogo,
  InstagramLogo,
  TextAa,
  ImageSquare,
  X,
} from "@phosphor-icons/react";
import { Scene, StudioUser, VideoGeneration, VoiceOption } from "@/lib/types";
import { aspectRatioCss, normalizeOrientation, type Orientation } from "@/lib/orientation";
import { GENRE_IDS, GENRES } from "@/lib/content/genres";
import { INSPIRATION } from "@/lib/content/inspiration";
import { type ContentLanguage } from "@/lib/content/languages";
import { defaultVoiceFor } from "@/lib/content/voices";
import { formatPlanLength, planFromMinutes, pluralFrames, MAX_MINUTES, MIN_MINUTES } from "@/lib/plan";
import { authFetch } from "@/lib/client/session";
import type { ImageFrameUsage, TtsFrameUsage } from "@/lib/pricing";
import { formatInt, formatUsd } from "@/lib/cost-format";
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
  Field,
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
  const [selectedVoice, setSelectedVoice] = useState<VoiceOption>(defaultVoiceFor("ru"));
  // По умолчанию максимум: кадры, символы и стоимость видны сразу, без клика по слайдеру.
  const [targetMinutes, setTargetMinutes] = useState<number | null>(MAX_MINUTES);
  const [orientation, setOrientation] = useState<Orientation>("landscape");

  // Ключи ElevenLabs и OpenAI живут в аккаунте зашифрованными; все расходы — с них.
  const [showKeyModal, setShowKeyModal] = useState(false);
  const hasKeys = user.hasElevenLabsKey && user.hasOpenAiKey;
  // Без ключей генерации нет, поэтому окно открывается сразу при входе в студию.
  useEffect(() => {
    if (!user.hasElevenLabsKey || !user.hasOpenAiKey) setShowKeyModal(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id]);
  const [elevenDraft, setElevenDraft] = useState("");
  const [openaiDraft, setOpenaiDraft] = useState("");
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
  // Сколько дней сервер держит кадры и озвучку (MEDIA_TTL_DAYS) — для подписи в архиве.
  const [mediaTtlDays, setMediaTtlDays] = useState(30);
  const [loadingHistory, setLoadingHistory] = useState(false);
  // Референс (необязательно): картинка-образец задаёт вид всего фильма.
  const [reference, setReference] = useState<{
    url: string;
    preview: string;
    analysis: { summary: string; stylePrompt: string; mood: string; subjectPrompt: string; palette: string };
    usage: { inputTokens: number; outputTokens: number };
  } | null>(null);
  const [referenceUploading, setReferenceUploading] = useState(false);
  const [referenceError, setReferenceError] = useState<string | null>(null);
  const referenceInputRef = useRef<HTMLInputElement | null>(null);

  const handleReferenceFile = async (file: File | null) => {
    if (!file) return;
    setReferenceError(null);
    setReferenceUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await authFetch("/api/generate/reference", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Не удалось загрузить референс");
      setReference({ url: data.url, preview: URL.createObjectURL(file), analysis: data.analysis, usage: data.usage });
    } catch (err: any) {
      setReferenceError(err.message);
    } finally {
      setReferenceUploading(false);
      if (referenceInputRef.current) referenceInputRef.current.value = "";
    }
  };
  const [balance, setBalance] = useState<{
    elevenlabs: { available: boolean; remaining?: number; limit?: number; resetAt?: string | null };
    openai: { hasKey: boolean; valid: boolean };
    spent: { openaiUsd: number; credits: number };
  } | null>(null);

  const previewRef = useRef<HTMLElement | null>(null);

  const fetchBalance = async () => {
    try {
      const res = await authFetch("/api/auth/balance");
      const data = await res.json();
      setBalance(res.ok ? data : null);
    } catch {
      setBalance(null);
    }
  };

  const syncBalance = async () => {
    try {
      const res = await authFetch("/api/auth/session");
      const data = await res.json();
      if (res.ok && data.user) {
        if (data.user.hasElevenLabsKey !== user.hasElevenLabsKey || data.user.hasOpenAiKey !== user.hasOpenAiKey) {
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
    fetchBalance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id, user.hasElevenLabsKey, user.hasOpenAiKey]);

  const fetchHistory = async () => {
    setLoadingHistory(true);
    try {
      const res = await authFetch("/api/videos");
      const data = await res.json();
      if (res.ok && data.videos) {
        setPastVideos(data.videos);
        if (typeof data.mediaTtlDays === "number") setMediaTtlDays(data.mediaTtlDays);
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

  // Восемь подсказок: на телефоне лента вбок, на десктопе в две строки.
  const inspirationThemes = INSPIRATION[language];

  const handleSaveKeys = async (e: React.FormEvent) => {
    e.preventDefault();
    setKeySaving(true);
    setKeyError(null);
    try {
      const body: Record<string, string> = {};
      if (elevenDraft.trim()) body.elevenLabsKey = elevenDraft.trim();
      if (openaiDraft.trim()) body.openAiKey = openaiDraft.trim();
      if (!Object.keys(body).length) throw new Error("Вставьте хотя бы один ключ");
      const res = await authFetch("/api/auth/keys", { method: "POST", body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Не удалось сохранить ключи");
      onUserUpdate(data.user);
      setElevenDraft("");
      setOpenaiDraft("");
      setKeyWarning(null);
      if (data.user.hasElevenLabsKey && data.user.hasOpenAiKey) setShowKeyModal(false);
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
    if (!hasKeys) {
      setKeyError(null);
      setShowKeyModal(true);
      return;
    }

    setIsGenerating(true);
    setError(null);
    setKeyWarning(null);
    setProgressPercent(5);
    const currentGenreObj = GENRE_OPTIONS.find((g) => g.id === selectedGenre);

    setProgressStep(
      `Шаг 1 из 4: пишем рассказ (${currentGenreObj?.label || "Сюжет"}, ~${plan.minutes} мин)...`
    );

    try {
      // 1а. План + монолог (первый этап сценария)
      const scriptRes = await authFetch("/api/generate/script", {
        method: "POST",
        body: JSON.stringify({
          topic: topic.trim(),
          genre: selectedGenre,
          voice: selectedVoice,
          language,
          targetMinutes,
          orientation,
          reference: reference ? { url: reference.url, analysis: reference.analysis, usage: reference.usage } : null,
        }),
      });
      const scriptData = await scriptRes.json();
      if (!scriptRes.ok) throw new Error(scriptData.error || "Ошибка генерации сценария");
      const videoId: string = scriptData.videoId;
      setProgressPercent(14);

      // 1б. Редактура, ритм, визуальные промпты, нарезка на кадры
      setProgressStep(`Шаг 1 из 4: редактура и раскадровка (${scriptData.words} слов)...`);
      const polishRes = await authFetch("/api/generate/script/polish", {
        method: "POST",
        body: JSON.stringify({ videoId }),
      });
      const polishData = await polishRes.json();
      if (!polishRes.ok) throw new Error(polishData.error || "Ошибка доработки сценария");

      const scenes: Scene[] = polishData.scenes;
      const totalScenes = scenes.length;
      const ttsUsage: TtsFrameUsage[] = [];
      const imageUsage: ImageFrameUsage[] = [];
      setProgressPercent(25);

      // 2. Озвучка кадр за кадром, последовательно: так прогресс честный, а
      // ElevenLabs не получает пачку параллельных запросов с одного ключа.
      // Кондиционирования соседними фрагментами нет — Eleven v3 его не принимает.
      const scenesWithAudio: Scene[] = [];
      let keyRejected = false;
      for (let i = 0; i < totalScenes; i++) {
        const scene = scenes[i];
        setProgressStep(`Шаг 2 из 4: озвучка (кадр ${i + 1}/${totalScenes})...`);

        const audioRes = await authFetch("/api/generate/audio", {
          method: "POST",
          body: JSON.stringify({
            videoId,
            sceneId: scene.id,
            narration: scene.narration,
            voice: selectedVoice,
            language,
          }),
        });
        const audioData = await audioRes.json();
        if (!audioRes.ok) throw new Error(audioData.error || `Ошибка генерации аудио кадра ${i + 1}`);

        if (audioData.keyRejected) keyRejected = true;
        ttsUsage.push({
          sceneId: scene.id,
          requestId: audioData.requestId || null,
          characters: Number(audioData.characters) || scene.narration.length,
          model: audioData.model || null,
          keyOwner: audioData.keyOwner || null,
          audioSeconds: Number(audioData.estimatedDuration) || 0,
        });

        scenesWithAudio.push({
          ...scene,
          audioUrl: audioData.audioUrl,
          durationEstimate: audioData.estimatedDuration || scene.durationEstimate,
        });
        setProgressPercent(25 + Math.round(((i + 1) / totalScenes) * 30));
      }
      if (keyRejected) {
        setKeyWarning("ElevenLabs отклонил ваш ключ — озвучка сделана ключом владельца сайта. Проверьте ключ в настройках.");
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
          setProgressStep(`Шаг 3 из 4: картинки (${doneCount + 1}/${totalScenes}): "${scene.title}"...`);
          try {
            const imgRes = await authFetch("/api/generate/image", {
              method: "POST",
              body: JSON.stringify({
                videoId,
                sceneId: scene.id,
                visualPrompt: scene.visualPrompt,
                orientation,
              }),
            });
            const imgData = await imgRes.json();
            if (!imgRes.ok) throw new Error(imgData.error || `Ошибка генерации изображения кадра ${i + 1}`);
            finalScenes[i] = { ...scene, imageUrl: imgData.imageUrl };
            imageUsage.push({
              sceneId: scene.id,
              model: imgData.model || "gpt-image-1-mini",
              quality: imgData.quality || "medium",
              size: imgData.size || (orientation === "portrait" ? "1024x1536" : "1536x1024"),
              withReference: !!imgData.withReference,
              usage: imgData.usage || null,
            });
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
      setProgressStep("Шаг 4 из 4: сохранение фильма...");
      const finalizeRes = await authFetch("/api/generate/finalize", {
        method: "POST",
        body: JSON.stringify({
          videoId,
          scenes: finalScenes,
          totalDuration: finalScenes.reduce(
            (acc, sc) => acc + (sc.actualDuration || sc.durationEstimate || 0),
            0
          ),
          usage: { tts: ttsUsage, images: imageUsage },
        }),
      });
      const finData = await finalizeRes.json();
      if (!finalizeRes.ok) throw new Error(finData.error || "Ошибка сохранения видео");

      setProgressPercent(100);
      setCurrentVideo({ id: videoId, title: polishData.title || scriptData.title || topic, scenes: finalScenes });
      if (finData.user) onUserUpdate(finData.user);

      fetchHistory();
      fetchBalance();
      setTopic("");
      setReference(null);

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
  const wordCount = topic.split(" ").filter(Boolean).length;
  const plan = planFromMinutes(targetMinutes ?? MIN_MINUTES, language);

  /** Сколько дней кадры и озвучка фильма ещё лежат на сервере (0 — уже стёрты). */
  const daysLeft = (vid: VideoGeneration) => {
    if (vid.media_purged_at) return 0;
    const end = new Date(vid.created_at).getTime() + mediaTtlDays * 86400000;
    return Math.max(0, Math.ceil((end - Date.now()) / 86400000));
  };

  return (
    <div className="w-full max-w-shell mx-auto px-5 sm:px-8 pt-6 sm:pt-8 pb-32">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6 sm:mb-7">
        <div className="min-w-0">
          <h1 className="text-[26px] sm:text-[32px] font-bold tracking-tight text-ink leading-none">
            Создание видеоистории
          </h1>
        </div>

        <div className="flex flex-col items-end gap-1 shrink-0">
          <button
            type="button"
            onClick={() => {
              setKeyError(null);
              setShowKeyModal(true);
            }}
            title="Ключи"
            className={cn(
              "inline-flex items-center gap-2 h-10 px-4 rounded-full border shrink-0",
              "text-[13px] font-medium transition-colors cursor-pointer",
              hasKeys
                ? "bg-contrast text-contrast-ink border-transparent"
                : "bg-surface-2 text-muted border-hairline hover:text-ink hover:border-hairline-strong"
            )}
          >
            <Key size={16} className={hasKeys ? "text-accent" : "text-faint"} />
            <span>{hasKeys ? "Ключи" : "Добавить ключи"}</span>
          </button>
        </div>
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
          <Tile title="Формат кадра" icon={<FrameCorners size={20} />}>
            <div className="grid grid-cols-2 gap-2.5">
              <SelectCard
                size="sm"
                layout="horizontal"
                selected={orientation === "landscape"}
                onClick={() => setOrientation("landscape")}
                icon={<FrameCorners size={18} />}
                title="16:9"
                hint={
                  <span className="inline-flex items-center gap-1">
                    <YoutubeLogo size={14} weight="fill" /> YouTube
                  </span>
                }
              />
              <SelectCard
                size="sm"
                layout="horizontal"
                selected={orientation === "portrait"}
                onClick={() => setOrientation("portrait")}
                icon={<DeviceMobile size={18} />}
                title="9:16"
                hint={
                  <span className="inline-flex items-center gap-1">
                    <TiktokLogo size={14} weight="fill" /> TikTok · <InstagramLogo size={14} weight="fill" /> Reels
                  </span>
                }
              />
            </div>
          </Tile>
          <Tile
            title="Сюжет"
            icon={<TextAa size={20} />}
            action={
              wordCount > 0 ? (
                <span className="text-[12px] text-faint tabular">{wordCount} слов</span>
              ) : (
                <span className="text-[12px] text-faint sm:hidden">темы: листайте →</span>
              )
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

            {/* Телефон: лента вбок, крайняя тема обрезана краем экрана — видно, что есть ещё.
                Десктоп: обычный перенос. */}
            <div className="flex gap-2 mt-3.5 overflow-x-auto -mx-5 px-5 pb-1.5 sm:flex-wrap sm:overflow-visible sm:mx-0 sm:px-0 sm:pb-0">
              {inspirationThemes.map((t, idx) => {
                const Icon = iconFor(GENRES[t.genre].icon);
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setTopic(t.prompt);
                      if (t.genre) setSelectedGenre(t.genre);
                    }}
                    disabled={isGenerating}
                    className="shrink-0 inline-flex items-center gap-1.5 h-8 px-3.5 rounded-full bg-surface-2 border border-hairline text-[12.5px] text-muted hover:text-ink hover:border-hairline-strong transition-colors cursor-pointer disabled:opacity-45 whitespace-nowrap"
                  >
                    <Icon size={14} />
                    {t.label}
                  </button>
                );
              })}
            </div>

            {/* Референс: картинка героя/объекта, по которой рисуются все кадры */}
            <div className="mt-4 pt-4 border-t border-hairline">
              <input
                ref={referenceInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => handleReferenceFile(e.target.files?.[0] || null)}
              />
              {reference ? (
                <div className="flex items-center gap-3">
                  <img
                    src={reference.preview}
                    alt="Референс"
                    className="w-16 h-16 rounded-control object-cover border border-accent shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <Badge tone="accent">Референс видео</Badge>
                    <p className="text-[13px] text-ink mt-1 leading-snug line-clamp-2">{reference.analysis.summary}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setReference(null)}
                    disabled={isGenerating}
                    title="Убрать референс"
                    className="grid place-items-center w-8 h-8 rounded-full border border-hairline text-muted hover:text-danger-text shrink-0 cursor-pointer"
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="secondary"
                  size="md"
                  block
                  icon={<ImageSquare size={20} />}
                  loading={referenceUploading}
                  disabled={isGenerating}
                  onClick={() => referenceInputRef.current?.click()}
                  className="border-accent border-2 h-12 text-[14px]"
                >
                  {referenceUploading ? "Распознаю..." : "Референс видео — картинка-образец"}
                </Button>
              )}
              {referenceError && <p className="text-[12.5px] text-danger-text mt-2">{referenceError}</p>}
            </div>
          </Tile>

          <Tile title="Жанр истории" icon={<FilmStrip size={20} />}>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {GENRE_OPTIONS.map((g) => {
                const Icon = g.icon;
                return (
                  <SelectCard
                    key={g.id}
                    size="sm"
                    layout="horizontal"
                    selected={selectedGenre === g.id}
                    onClick={() => setSelectedGenre(g.id)}
                    icon={<Icon size={16} />}
                    title={g.label}
                    className="!p-2"
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

          <Tile title="Хронометраж" icon={<Clock size={20} />}>
            <div className="flex flex-col gap-4">
              <Slider
                value={targetMinutes}
                min={MIN_MINUTES}
                max={MAX_MINUTES}
                step={1}
                onChange={setTargetMinutes}
                placeholder="Выберите длительность"
                valueLabel={
                  <span className="inline-flex items-center gap-1.5">
                    <Clock size={15} /> {plan.minutes} мин · <FilmStrip size={15} /> {pluralFrames(plan.scenesCount)}
                  </span>
                }
                ticks={[MIN_MINUTES, 5, 10, MAX_MINUTES]}
              />

              {targetMinutes !== null && (
                <div className="rounded-control border border-hairline overflow-hidden text-[13px] leading-snug">
                  <div className="px-3.5 py-2 bg-surface-2 border-b border-hairline text-[12px] text-faint">
                    {formatPlanLength(plan)} · {pluralFrames(plan.scenesCount)} · спишется примерно
                  </div>
                  {/* Таблица: сумма никогда не переносится, описание — как влезет. */}
                  <table className="w-full tabular border-collapse">
                    <tbody>
                      <tr className="border-b border-hairline">
                        <td className="px-3.5 py-2 font-medium text-ink whitespace-nowrap align-top">OpenAI</td>
                        <td className="px-3 py-2 text-muted w-full">текст ~{formatInt(plan.estimatedChars)} символов + {pluralFrames(plan.scenesCount)}</td>
                        <td className="px-3.5 py-2 text-right font-semibold text-ink whitespace-nowrap align-top">≈ {formatUsd(plan.estimate.openaiUsd)}</td>
                      </tr>
                      <tr className="border-b border-hairline">
                        <td className="px-3.5 py-2 font-medium text-ink whitespace-nowrap align-top">ElevenLabs</td>
                        <td className="px-3 py-2 text-muted w-full">озвучка ~{formatInt(plan.estimatedChars)} символов ≈ {formatInt(plan.estimate.elevenCredits)} кр.</td>
                        <td className="px-3.5 py-2 text-right font-semibold text-ink whitespace-nowrap align-top">≈ {formatUsd(plan.estimate.elevenUsd)}</td>
                      </tr>
                      <tr className="bg-surface-2">
                        <td className="px-3.5 py-2 font-semibold text-ink whitespace-nowrap">Итого</td>
                        <td className="px-3 py-2 text-muted w-full">с двух счетов</td>
                        <td className="px-3.5 py-2 text-right font-bold text-ink whitespace-nowrap">≈ {formatUsd(plan.estimate.totalUsd)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
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

          {/* Счета пользователя: остаток ElevenLabs живой, у OpenAI баланса в API нет —
              показываем, жив ли ключ, и сколько ушло через студию. */}
          <div className="grid grid-cols-2 gap-2 sm:gap-4">
            <StatTile
              label="ElevenLabs"
              value={
                balance?.elevenlabs?.available && typeof balance.elevenlabs.remaining === "number"
                  ? `${formatInt(balance.elevenlabs.remaining)} кр.`
                  : user.hasElevenLabsKey
                    ? "…"
                    : "нет ключа"
              }
              caption={
                balance?.elevenlabs?.available && balance.elevenlabs.limit
                  ? `остаток из ${formatInt(balance.elevenlabs.limit)} в этом месяце`
                  : "остаток кредитов"
              }
              icon={<Lightning size={20} />}
              tone={user.hasElevenLabsKey ? "contrast" : "surface"}
              valueClassName="text-[22px]"
            />
            <StatTile
              label="OpenAI"
              value={
                !user.hasOpenAiKey
                  ? "нет ключа"
                  : balance
                    ? balance.openai.valid
                      ? `${formatUsd(balance.spent.openaiUsd)} потрачено здесь`
                      : "ключ отклонён"
                    : "…"
              }
              caption={
                // Баланс OpenAI по API не отдаётся — только в кабинете.
                <a
                  href="https://platform.openai.com/settings/organization/billing/overview"
                  target="_blank"
                  rel="noreferrer"
                  className="underline decoration-dotted underline-offset-2 hover:opacity-80"
                >
                  баланс — в кабинете OpenAI ↗
                </a>
              }
              icon={<Sliders size={20} />}
              tone={user.hasOpenAiKey ? "contrast" : "surface"}
              valueClassName="text-[18px]"
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
                        title={
                          daysLeft(vid) === 0
                            ? "Кадры и озвучка уже удалены с сервера"
                            : `Видео удалится с сервера через ${daysLeft(vid)} дн. — скачайте его до этого`
                        }
                        className={cn(
                          "inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[12px] font-medium tabular shrink-0 cursor-help",
                          daysLeft(vid) === 0
                            ? "bg-danger-soft text-danger-text"
                            : daysLeft(vid) <= 5
                              ? "bg-warn-soft text-warn-text"
                              : "bg-surface-3 text-muted"
                        )}
                      >
                        <Hourglass size={14} weight="fill" />
                        {daysLeft(vid) === 0 ? "удалено" : `${daysLeft(vid)} дн.`}
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
                {targetMinutes !== null && <Badge tone="outline">{pluralFrames(plan.scenesCount)}</Badge>}
                <Badge tone="outline">{orientation === "portrait" ? "9:16" : "16:9"}</Badge>
              </div>

              <Button
                type="submit"
                form="studio-form"
                size="lg"
                icon={<Play size={20} weight="fill" />}
                disabled={!topic.trim() || targetMinutes === null || !hasKeys}
                className="w-full md:w-auto"
              >
                {!hasKeys ? "Добавьте ключи" : targetMinutes === null ? "Выберите хронометраж" : "Запустить генерацию"}
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
        title="Мои ключи"
        hint="Расходы идут с ваших счетов."
        icon={
          <IconTile size="md">
            <Key size={20} weight="fill" />
          </IconTile>
        }
      >
        <form id="key-form" onSubmit={handleSaveKeys} className="flex flex-col gap-4">
          {keyError && <Alert tone="danger">{keyError}</Alert>}
          <Field
            label="Ключ ElevenLabs"
            aside={user.hasElevenLabsKey ? <span className="text-accent">сохранён</span> : <span>нет</span>}
            hint="elevenlabs.io → Profile → API Keys"
          >
            <Input
              type="text"
              placeholder={user.hasElevenLabsKey ? "не менять" : "sk_..."}
              value={elevenDraft}
              onChange={(e) => setElevenDraft(e.target.value)}
              className="font-mono text-[13px]"
              autoComplete="off"
            />
          </Field>
          <Field
            label="Ключ OpenAI"
            aside={user.hasOpenAiKey ? <span className="text-accent">сохранён</span> : <span>нет</span>}
            hint="platform.openai.com → API keys"
          >
            <Input
              type="text"
              placeholder={user.hasOpenAiKey ? "не менять" : "sk-..."}
              value={openaiDraft}
              onChange={(e) => setOpenaiDraft(e.target.value)}
              className="font-mono text-[13px]"
              autoComplete="off"
            />
          </Field>
          <div className="flex flex-wrap gap-2.5 pt-1">
            <Button type="submit" loading={keySaving} disabled={!elevenDraft.trim() && !openaiDraft.trim()} className="flex-1">
              Сохранить
            </Button>
            <Button type="button" variant="secondary" onClick={() => setShowKeyModal(false)}>
              {hasKeys ? "Закрыть" : "Позже"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
