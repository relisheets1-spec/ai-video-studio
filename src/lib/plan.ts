import {
  CHARS_PER_WORD,
  WORDS_PER_SECOND,
  type ContentLanguage,
} from "./content/languages";

export const MIN_MINUTES = 1;
export const MAX_MINUTES = 10;

/**
 * Верхняя граница кадров. Аудио- и image-роуты валидируют sceneId в диапазоне
 * 0..40, поэтому запас есть даже с учётом принудительных доразбиений.
 */
export const MAX_SCENES = 30;
export const MIN_SCENES = 4;

/** Ориентировочная стоимость одного кадра, USD (gpt-image-1-mini, medium). */
const IMAGE_COST_USD = 0.012;
/** Ориентировочная стоимость озвучки, USD за 1000 символов ElevenLabs. */
const TTS_USD_PER_1K_CHARS = 0.18;

export interface GenerationPlan {
  minutes: number;
  scenesCount: number;
  secondsPerScene: number;
  totalWords: number;
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

/**
 * Хронометраж -> объём текста -> число кадров.
 *
 * Короткие ролики получают более короткие кадры (визуальное разнообразие),
 * длинные — более длинные (меньше картинок, дешевле и спокойнее по ритму).
 */
export function planFromMinutes(
  rawMinutes: unknown,
  language: ContentLanguage = "ru"
): GenerationPlan {
  const minutes = clampMinutes(rawMinutes);
  const wps = WORDS_PER_SECOND[language];

  // 11–17 с на кадр: при 14–21 с статичная картинка держалась слишком долго,
  // и фильм читался как слайд-шоу, а не как смена планов.
  const secondsPerScene = Math.min(17, Math.max(11, Math.round(11 + (minutes - 1) * 0.65)));
  const scenesCount = Math.min(
    MAX_SCENES,
    Math.max(MIN_SCENES, Math.round((minutes * 60) / secondsPerScene))
  );

  const totalWords = Math.round(minutes * 60 * wps);
  const wordsPerScene = Math.round(totalWords / scenesCount);
  const estimatedChars = Math.round(totalWords * CHARS_PER_WORD[language]);

  return {
    minutes,
    scenesCount,
    secondsPerScene,
    totalWords,
    wordsPerScene,
    maxCharsPerScene: Math.round(wordsPerScene * CHARS_PER_WORD[language] * 1.6),
    tailWords: Math.max(20, Math.round(totalWords * 0.08)),
    estimatedChars,
    estimatedCostUsd:
      scenesCount * IMAGE_COST_USD + (estimatedChars / 1000) * TTS_USD_PER_1K_CHARS,
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
