import {
  CHARS_PER_WORD,
  WORDS_PER_SECOND,
  type ContentLanguage,
} from "./content/languages";
import { estimateFilmCost } from "./pricing";

export const MIN_MINUTES = 1;
export const MAX_MINUTES = 15;

/**
 * Бюджет кадров: 1 минута — 5 картинок, 15 минут — 30, между ними линейно.
 * Больше 30 картинок на фильм не бывает никогда: это потолок и по деньгам,
 * и по валидации sceneId в audio/image-роутах.
 */
export const MIN_SCENES = 5;
export const MAX_SCENES = 30;

export interface GenerationPlan {
  minutes: number;
  scenesCount: number;
  secondsPerScene: number;
  /** Потолок объёма: длиннее заказанного ролик быть не должен. */
  totalWords: number;
  /** Что просим у модели (чуть меньше потолка, чтобы не перебрать). */
  askWords: number;
  /** Нижняя граница допустимого недобора (≈ −2 минуты на 15). */
  minWords: number;
  wordsPerScene: number;
  /** Жёсткий потолок символов на кадр — по нему режется сегментация. */
  maxCharsPerScene: number;
  /** Объём «послевкусия» в словах. */
  tailWords: number;
  estimatedChars: number;
  estimatedCostUsd: number;
}

export function clampMinutes(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return MIN_MINUTES;
  return Math.min(MAX_MINUTES, Math.max(MIN_MINUTES, Math.round(n * 2) / 2));
}

export function scenesForMinutes(minutes: number): number {
  return Math.min(MAX_SCENES, Math.max(MIN_SCENES, Math.round(5 + ((minutes - 1) * 25) / 14)));
}

/** Хронометраж -> число кадров -> объём текста. */
export function planFromMinutes(
  rawMinutes: unknown,
  language: ContentLanguage = "ru"
): GenerationPlan {
  const minutes = clampMinutes(rawMinutes);
  const wps = WORDS_PER_SECOND[language];
  const cpw = CHARS_PER_WORD[language];

  const scenesCount = scenesForMinutes(minutes);
  const secondsPerScene = Math.round(((minutes * 60) / scenesCount) * 10) / 10;

  const totalWords = Math.round(minutes * 60 * wps);
  const askWords = Math.round(totalWords * 0.95);
  const minWords = Math.round(totalWords * 0.87);
  const wordsPerScene = Math.max(1, Math.round(askWords / scenesCount));
  const estimatedChars = Math.round(askWords * cpw);

  return {
    minutes,
    scenesCount,
    secondsPerScene,
    totalWords,
    askWords,
    minWords,
    wordsPerScene,
    maxCharsPerScene: Math.round(wordsPerScene * cpw * 1.6),
    tailWords: Math.max(20, Math.round(askWords * 0.08)),
    estimatedChars,
    estimatedCostUsd: estimateFilmCost({ scenesCount, estimatedChars, totalWords: askWords }).totals.creator,
  };
}

export function formatPlanLength(plan: GenerationPlan): string {
  const total = Math.round(plan.minutes * 60);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return s === 0 ? `${m} мин` : `${m} мин ${s} сек`;
}

/** Русское склонение: 1 кадр, 2 кадра, 5 кадров. */
export function pluralFrames(n: number): string {
  const mod100 = n % 100;
  const mod10 = n % 10;
  if (mod100 >= 11 && mod100 <= 14) return `${n} кадров`;
  if (mod10 === 1) return `${n} кадр`;
  if (mod10 >= 2 && mod10 <= 4) return `${n} кадра`;
  return `${n} кадров`;
}
