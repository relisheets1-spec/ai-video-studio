import {
  CHAT_PRICES,
  ELEVEN_PAYG_USD_PER_1K,
  ELEVEN_SCENARIOS,
  OPENAI_TTS,
  type VideoCost,
} from "./pricing";

/** Форматирование стоимости для архива и модалки. Без React и без сервера. */

export function formatUsd(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return "—";
  return "$" + n.toFixed(digits).replace(".", ",");
}

export function formatInt(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return Math.round(n).toLocaleString("ru-RU");
}

function pluralImages(n: number): string {
  const m100 = n % 100;
  const m10 = n % 10;
  if (m100 >= 11 && m100 <= 14) return `${n} картинок`;
  if (m10 === 1) return `${n} картинка`;
  if (m10 >= 2 && m10 <= 4) return `${n} картинки`;
  return `${n} картинок`;
}

/** Одна строка под видео в архиве. */
export function formatCostLine(cost: VideoCost): string {
  const parts = [
    `${pluralImages(cost.images.count)} ${formatUsd(cost.images.usd)}`,
    `текст ${formatUsd(cost.llm.usd)}`,
  ];
  if (cost.tts.credits > 0) {
    parts.push(`озвучка ${formatInt(cost.tts.credits)} кр. ${formatUsd(cost.tts.usd.creator)}`);
  } else if (cost.tts.fallbackFrames > 0) {
    parts.push(`озвучка OpenAI ${formatUsd(cost.tts.fallbackUsd)}`);
  }
  parts.push(`итого ${formatUsd(cost.totals.creator)}`);
  return parts.join(" · ");
}

export interface CostRow {
  item: string;
  model: string;
  quantity: string;
  price: string;
  total: string;
  note?: string;
}

/** Строки таблицы: статья · модель · количество · официальная цена · сумма. */
export function costRows(cost: VideoCost): CostRow[] {
  const rows: CostRow[] = [];
  const chat = CHAT_PRICES[cost.llm.model] || CHAT_PRICES["gpt-4o"];

  rows.push({
    item: "Текст (сценарий)",
    model: cost.llm.model,
    quantity: `${formatInt(cost.llm.inputTokens)} вх. + ${formatInt(cost.llm.outputTokens)} исх. токенов, ${cost.llm.calls} вызов.`,
    price: `${formatUsd(chat.inputPerM)} / ${formatUsd(chat.outputPerM)} за 1M`,
    total: formatUsd(cost.llm.usd, 4),
  });

  rows.push({
    item: "Картинки",
    model: `${cost.images.model} · ${cost.images.quality} · ${cost.images.size.replace("x", "×")}`,
    quantity: `${formatInt(cost.images.count)} шт.${cost.images.outputTokens ? ` (${formatInt(cost.images.outputTokens)} токенов)` : ""}`,
    price: `${formatUsd(cost.images.unitUsd, 3)} за шт.`,
    total: formatUsd(cost.images.usd, 3),
    note:
      [
        cost.images.withReference > 0
          ? `с референсом: ${cost.images.withReference} шт., входная картинка ${formatInt(cost.images.referenceInputTokens)} токенов = ${formatUsd(cost.images.referenceUsd, 4)}`
          : null,
        cost.images.usdByTokens !== null ? `по токенам ${formatUsd(cost.images.usdByTokens, 4)}` : null,
      ]
        .filter(Boolean)
        .join(" · ") || undefined,
  });

  if (cost.tts.credits > 0) {
    const s = ELEVEN_SCENARIOS.creator;
    rows.push({
      item: "Озвучка ElevenLabs",
      model: cost.tts.model || "elevenlabs",
      quantity: `${formatInt(cost.tts.characters)} символов = ${formatInt(cost.tts.credits)} кредитов${cost.tts.creditsSource === "history" ? "" : " (по символам)"}`,
      price: `$${s.monthlyUsd} / ${formatInt(s.monthlyCredits)} кр. в мес.`,
      total: formatUsd(cost.tts.usd.creator, 4),
      note: cost.tts.keyOwner === "env" ? "ключ владельца сайта" : undefined,
    });
  }

  if (cost.tts.fallbackFrames > 0) {
    const p = OPENAI_TTS["gpt-4o-mini-tts"];
    rows.push({
      item: "Запасная озвучка OpenAI",
      model: "gpt-4o-mini-tts",
      quantity: `${cost.tts.fallbackFrames} кадр., ${formatInt(cost.tts.fallbackCharacters)} символов`,
      price: `≈ ${formatUsd(p.approxUsdPerMinute, 3)} / мин (оценка)`,
      total: formatUsd(cost.tts.fallbackUsd, 4),
    });
  }

  return rows;
}

export interface ScenarioTotal {
  id: keyof typeof ELEVEN_SCENARIOS;
  label: string;
  ttsUsd: number;
  totalUsd: number;
  hint: string;
}

/** Три итога по сценариям ElevenLabs. */
export function scenarioTotals(cost: VideoCost): ScenarioTotal[] {
  const c = ELEVEN_SCENARIOS.creator;
  const perCredit = c.monthlyUsd / c.monthlyCredits;
  return [
    {
      id: "creator",
      label: ELEVEN_SCENARIOS.creator.label,
      ttsUsd: cost.tts.usd.creator,
      totalUsd: cost.totals.creator,
      hint: `${formatUsd(c.monthlyUsd)} за ${formatInt(c.monthlyCredits)} кредитов = ${formatUsd(perCredit * 1000, 4)} за 1 000`,
    },
    {
      id: "starterPayg",
      label: ELEVEN_SCENARIOS.starterPayg.label,
      ttsUsd: cost.tts.usd.starterPayg,
      totalUsd: cost.totals.starterPayg,
      hint: `подписка $6 (0 кредитов) + докупка Pay As You Go ${formatUsd(ELEVEN_PAYG_USD_PER_1K)} за 1 000, кредиты живут 12 мес.`,
    },
    {
      id: "payg",
      label: ELEVEN_SCENARIOS.payg.label,
      ttsUsd: cost.tts.usd.payg,
      totalUsd: cost.totals.payg,
      hint: `без подписки, ${formatUsd(ELEVEN_PAYG_USD_PER_1K)} за 1 000 символов (v3 / Multilingual v2)`,
    },
  ];
}
