/**
 * Официальные цены провайдеров и расчёт стоимости фильма.
 *
 * Модуль без серверных зависимостей: его читают и роуты, и клиент (архив,
 * подсказка под слайдером). Все цены — с датой проверки и источником; при
 * изменении тарифов правится только этот файл, а в старых записях `cost`
 * остаются цены на момент генерации.
 */

export const PRICING_AS_OF = "2026-09-05";

export const PRICING_SOURCES = {
  openai: "https://developers.openai.com/api/docs/pricing",
  openaiImages: "https://platform.openai.com/docs/models/gpt-image-1-mini",
  elevenlabs: "https://elevenlabs.io/pricing/api",
  elevenlabsPayg: "https://elevenlabs.io/docs/overview/administration/pay-as-you-go",
} as const;

// ---------------------------------------------------------------------------
// OpenAI
// ---------------------------------------------------------------------------

/** USD за 1M токенов. */
export const CHAT_PRICES: Record<string, { inputPerM: number; outputPerM: number }> = {
  "gpt-4o": { inputPerM: 2.5, outputPerM: 10 },
  "gpt-4o-2024-11-20": { inputPerM: 2.5, outputPerM: 10 },
};

export const IMAGE_PRICES = {
  "gpt-image-1-mini": {
    /** USD за одну картинку — официальная таблица по качеству и размеру. */
    perImage: {
      low: { "1024x1024": 0.005, "1024x1536": 0.006, "1536x1024": 0.006 },
      medium: { "1024x1024": 0.011, "1024x1536": 0.015, "1536x1024": 0.015 },
      high: { "1024x1024": 0.036, "1024x1536": 0.052, "1536x1024": 0.052 },
    } as Record<string, Record<string, number>>,
    /** USD за 1M токенов — для сверки с полем usage в ответе. */
    tokens: { textInPerM: 2, imageInPerM: 2.5, imageOutPerM: 8 },
  },
} as const;

/** Запасная озвучка OpenAI: ответ бинарный, usage не приходит — оценка. */
export const OPENAI_TTS = {
  "gpt-4o-mini-tts": { textInPerM: 0.6, audioOutPerM: 12, approxUsdPerMinute: 0.015 },
} as const;

// ---------------------------------------------------------------------------
// ElevenLabs
// ---------------------------------------------------------------------------

/** Кредитов за символ по моделям (token_cost_factor из /v1/models). */
export const ELEVEN_CREDITS_PER_CHAR: Record<string, number> = {
  eleven_v3: 1,
  eleven_multilingual_v2: 1,
  eleven_flash_v2_5: 0.5,
  eleven_turbo_v2_5: 0.5,
};

/** Pay As You Go для API: v3 и Multilingual v2, USD за 1 000 символов. Кредиты живут 12 месяцев. */
export const ELEVEN_PAYG_USD_PER_1K = 0.1;

export const ELEVEN_SCENARIOS = {
  creator: {
    id: "creator",
    label: "Creator, $22/мес",
    monthlyUsd: 22,
    monthlyCredits: 130_372,
  },
  starterPayg: {
    id: "starterPayg",
    label: "Starter $6/мес + Pay As You Go",
    monthlyUsd: 6,
    includedCredits: 0,
    paygUsdPer1k: ELEVEN_PAYG_USD_PER_1K,
  },
  payg: {
    id: "payg",
    label: "Только Pay As You Go",
    paygUsdPer1k: ELEVEN_PAYG_USD_PER_1K,
  },
} as const;

export type ScenarioId = keyof typeof ELEVEN_SCENARIOS;

// ---------------------------------------------------------------------------
// Функции
// ---------------------------------------------------------------------------

const round4 = (n: number) => Math.round(n * 10000) / 10000;

export function usdForChat(model: string, promptTokens: number, completionTokens: number): number {
  const price = CHAT_PRICES[model] || CHAT_PRICES["gpt-4o"];
  return round4((promptTokens / 1e6) * price.inputPerM + (completionTokens / 1e6) * price.outputPerM);
}

/** Цена одной картинки по таблице; незнакомые сочетания считаем как medium 1024×1536. */
export function usdForImage(model: string, quality: string, size: string): number {
  const table = IMAGE_PRICES[model as keyof typeof IMAGE_PRICES]?.perImage || IMAGE_PRICES["gpt-image-1-mini"].perImage;
  return table[quality]?.[size] ?? table.medium["1024x1536"];
}

export function usdForImageTokens(inputTokens: number, outputTokens: number): number {
  const t = IMAGE_PRICES["gpt-image-1-mini"].tokens;
  return round4((inputTokens / 1e6) * t.textInPerM + (outputTokens / 1e6) * t.imageOutPerM);
}

export function usdForCreditsCreator(credits: number): number {
  const s = ELEVEN_SCENARIOS.creator;
  return round4((credits * s.monthlyUsd) / s.monthlyCredits);
}

export function usdForCreditsPayg(credits: number): number {
  return round4((credits / 1000) * ELEVEN_PAYG_USD_PER_1K);
}

export function usdForOpenAiTts(characters: number, audioSeconds: number): number {
  const p = OPENAI_TTS["gpt-4o-mini-tts"];
  const textTokens = characters / 3;
  return round4((textTokens / 1e6) * p.textInPerM + (audioSeconds / 60) * p.approxUsdPerMinute);
}

/** Грубая оценка текста до запуска: 5 проходов gpt-4o на объём ролика. */
export function estimateLlmUsd(totalWords: number): number {
  return round4(0.03 + totalWords * 0.00012);
}

export interface FilmEstimate {
  imagesUsd: number;
  llmUsd: number;
  credits: number;
  ttsUsd: { creator: number; payg: number };
  totals: { creator: number; starterPayg: number; payg: number };
}

export function estimateFilmCost(input: { scenesCount: number; estimatedChars: number; totalWords: number }): FilmEstimate {
  const imagesUsd = round4(input.scenesCount * usdForImage("gpt-image-1-mini", "medium", "1536x1024"));
  const llmUsd = estimateLlmUsd(input.totalWords);
  const credits = input.estimatedChars;
  const ttsUsd = { creator: usdForCreditsCreator(credits), payg: usdForCreditsPayg(credits) };
  return {
    imagesUsd,
    llmUsd,
    credits,
    ttsUsd,
    totals: {
      creator: round4(imagesUsd + llmUsd + ttsUsd.creator),
      starterPayg: round4(imagesUsd + llmUsd + ttsUsd.payg),
      payg: round4(imagesUsd + llmUsd + ttsUsd.payg),
    },
  };
}

// ---------------------------------------------------------------------------
// Фактическая стоимость фильма
// ---------------------------------------------------------------------------

export interface LlmUsageJson {
  model: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  usd: number;
  breakdown: Array<{ pass: string; inputTokens: number; outputTokens: number }>;
}

export interface TtsFrameUsage {
  sceneId: number;
  requestId: string | null;
  characters: number;
  model: string | null;
  provider: "elevenlabs" | "openai";
  keyOwner: "user" | "env" | null;
  audioSeconds: number;
}

export interface ImageFrameUsage {
  sceneId: number;
  model: string;
  quality: string;
  size: string;
  usage: { inputTokens: number; outputTokens: number; totalTokens: number } | null;
}

export interface VideoCost {
  version: 1;
  pricingAsOf: string;
  startedAt: string | null;
  computedAt: string;
  llm: LlmUsageJson;
  images: {
    model: string;
    quality: string;
    size: string;
    count: number;
    unitUsd: number;
    inputTokens: number;
    outputTokens: number;
    usd: number;
    usdByTokens: number | null;
    missingUsage: number;
  };
  tts: {
    provider: "elevenlabs" | "openai" | "mixed" | "none";
    model: string | null;
    frames: number;
    characters: number;
    credits: number;
    creditsSource: "history" | "characters" | "none";
    creditsBefore: number | null;
    creditsAfter: number | null;
    creditsSpent: number | null;
    characterLimit: number | null;
    keyOwner: "user" | "env" | "mixed" | null;
    historyMatched: number;
    historyMissing: number;
    fallbackFrames: number;
    fallbackCharacters: number;
    fallbackUsd: number;
    usd: { creator: number; starterPayg: number; payg: number };
  };
  totals: { creator: number; starterPayg: number; payg: number };
  /** = totals.creator; продублировано для generated-колонки total_usd. */
  totalUsd: number;
}

export interface CostInput {
  startedAt: string | null;
  llm: LlmUsageJson | null;
  images: ImageFrameUsage[];
  tts: TtsFrameUsage[];
  /** Точные кредиты по request_id из истории ElevenLabs. */
  historyCredits: Map<string, number>;
  creditsBefore: number | null;
  creditsAfter: number | null;
  characterLimit: number | null;
}

export function emptyLlmUsage(model: string): LlmUsageJson {
  return { model, calls: 0, inputTokens: 0, outputTokens: 0, usd: 0, breakdown: [] };
}

export function computeVideoCost(input: CostInput): VideoCost {
  const llm = input.llm || emptyLlmUsage("gpt-4o-2024-11-20");

  // Картинки: таблица за штуку — основная цена, токены — для сверки.
  const first = input.images[0];
  const imgModel = first?.model || "gpt-image-1-mini";
  const imgQuality = first?.quality || "medium";
  const imgSize = first?.size || "1536x1024";
  const unitUsd = usdForImage(imgModel, imgQuality, imgSize);
  let imgIn = 0;
  let imgOut = 0;
  let missingUsage = 0;
  for (const im of input.images) {
    if (im.usage) {
      imgIn += im.usage.inputTokens || 0;
      imgOut += im.usage.outputTokens || 0;
    } else {
      missingUsage++;
    }
  }
  const images: VideoCost["images"] = {
    model: imgModel,
    quality: imgQuality,
    size: imgSize,
    count: input.images.length,
    unitUsd,
    inputTokens: imgIn,
    outputTokens: imgOut,
    usd: round4(input.images.length * unitUsd),
    usdByTokens: missingUsage === input.images.length ? null : usdForImageTokens(imgIn, imgOut),
    missingUsage,
  };

  // Озвучка
  const eleven = input.tts.filter((f) => f.provider === "elevenlabs");
  const fallback = input.tts.filter((f) => f.provider === "openai");
  let credits = 0;
  let characters = 0;
  let matched = 0;
  let missing = 0;
  for (const f of eleven) {
    characters += f.characters;
    const exact = f.requestId ? input.historyCredits.get(f.requestId) : undefined;
    if (typeof exact === "number") {
      credits += exact;
      matched++;
    } else {
      credits += Math.round(f.characters * (ELEVEN_CREDITS_PER_CHAR[f.model || ""] ?? 1));
      missing++;
    }
  }
  const fallbackCharacters = fallback.reduce((a, f) => a + f.characters, 0);
  const fallbackSeconds = fallback.reduce((a, f) => a + (f.audioSeconds || 0), 0);
  const fallbackUsd = fallback.length ? usdForOpenAiTts(fallbackCharacters, fallbackSeconds) : 0;

  const owners = new Set(eleven.map((f) => f.keyOwner).filter(Boolean));
  const keyOwner: VideoCost["tts"]["keyOwner"] =
    owners.size === 0 ? null : owners.size > 1 ? "mixed" : (Array.from(owners)[0] as "user" | "env");

  const creditsSpent =
    input.creditsBefore !== null && input.creditsAfter !== null && input.creditsAfter >= input.creditsBefore
      ? input.creditsAfter - input.creditsBefore
      : null;

  const ttsUsd = {
    creator: usdForCreditsCreator(credits),
    starterPayg: usdForCreditsPayg(credits),
    payg: usdForCreditsPayg(credits),
  };

  const tts: VideoCost["tts"] = {
    provider:
      eleven.length && fallback.length ? "mixed" : eleven.length ? "elevenlabs" : fallback.length ? "openai" : "none",
    model: eleven[0]?.model || fallback[0]?.model || null,
    frames: input.tts.length,
    characters,
    credits,
    creditsSource: eleven.length === 0 ? "none" : missing === 0 ? "history" : "characters",
    creditsBefore: input.creditsBefore,
    creditsAfter: input.creditsAfter,
    creditsSpent,
    characterLimit: input.characterLimit,
    keyOwner,
    historyMatched: matched,
    historyMissing: missing,
    fallbackFrames: fallback.length,
    fallbackCharacters,
    fallbackUsd,
    usd: ttsUsd,
  };

  const base = llm.usd + images.usd + fallbackUsd;
  const totals = {
    creator: round4(base + ttsUsd.creator),
    starterPayg: round4(base + ttsUsd.starterPayg),
    payg: round4(base + ttsUsd.payg),
  };

  return {
    version: 1,
    pricingAsOf: PRICING_AS_OF,
    startedAt: input.startedAt,
    computedAt: new Date().toISOString(),
    llm,
    images,
    tts,
    totals,
    totalUsd: totals.creator,
  };
}
