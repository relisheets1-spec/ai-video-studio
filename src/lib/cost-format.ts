import { chatPriceFor, ELEVEN_PAYG_USD_PER_1K, ELEVEN_SCENARIOS, type VideoCost } from "./pricing";

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
  // Проходы могут идти на разных моделях (план — gpt-5.1, монолог — gpt-4o): цена по каждой.
  const models = Array.from(
    new Set((cost.llm.breakdown || []).map((b) => (b.model || cost.llm.model).replace(/-\d{4}-\d{2}-\d{2}$/, "")))
  );
  const priceLine = (models.length ? models : [cost.llm.model])
    .map((m) => {
      const p = chatPriceFor(m);
      return `${models.length > 1 ? m + ": " : ""}${formatUsd(p.inputPerM)} / ${formatUsd(p.outputPerM)} за 1M`;
    })
    .join("; ");

  rows.push({
    item: "Текст (сценарий)",
    model: cost.llm.model,
    quantity: `${formatInt(cost.llm.inputTokens)} вх. + ${formatInt(cost.llm.outputTokens)} исх. токенов, ${cost.llm.calls} вызов.`,
    price: priceLine,
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
      model: cost.tts.model || "eleven_v3",
      quantity: `${formatInt(cost.tts.characters)} символов = ${formatInt(cost.tts.credits)} кредитов${cost.tts.creditsSource === "history" ? "" : " (по символам)"}`,
      price: `$${s.monthlyUsd} / ${formatInt(s.monthlyCredits)} кр. в мес.`,
      total: formatUsd(cost.tts.usd.creator, 4),
      note: cost.tts.keyOwner === "env" ? "ключ владельца сайта" : undefined,
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

/** Два итога: текущий тариф Creator и Starter с докупкой Pay As You Go. */
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
      hint: `подписка $6 (0 кредитов) + докупка Pay As You Go ${formatUsd(ELEVEN_PAYG_USD_PER_1K)} за 1 000 кредитов Eleven v3, кредиты живут 12 мес.`,
    },
  ];
}
