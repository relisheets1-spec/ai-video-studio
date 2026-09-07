import { chatPriceFor, ELEVEN_PAYG_USD_PER_1K, ELEVEN_PLAN, normalizeCost, type VideoCost } from "./pricing";

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

export interface CostRow {
  item: string;
  model: string;
  quantity: string;
  price: string;
  /** Как получилась сумма: «30 × $0,015». */
  math: string;
  total: string;
  note?: string;
}

/** Строки таблицы: статья · модель · количество · цена · расчёт · сумма. */
export function costRows(cost: VideoCost): CostRow[] {
  const rows: CostRow[] = [];

  // Текст. Проходы могут идти на разных моделях (старые записи: gpt-5.1 + gpt-4o) — цена по каждой.
  const models = Array.from(
    new Set((cost.llm.breakdown || []).map((b) => (b.model || cost.llm.model).replace(/-\d{4}-\d{2}-\d{2}$/, "")))
  );
  const priceLine = (models.length ? models : [cost.llm.model])
    .map((m) => {
      const p = chatPriceFor(m);
      return `${models.length > 1 ? m + ": " : ""}${formatUsd(p.inputPerM)} вх. / ${formatUsd(p.outputPerM)} исх. за 1M`;
    })
    .join("; ");
  rows.push({
    item: "Текст (сценарий)",
    model: cost.llm.model,
    quantity: `${formatInt(cost.llm.inputTokens)} вх. + ${formatInt(cost.llm.outputTokens)} исх. токенов, ${cost.llm.calls} вызов.`,
    price: priceLine,
    // Старые записи шли на двух моделях — там формула одной ценой была бы враньём.
    math:
      models.length > 1
        ? `по ${cost.llm.calls} вызовам, каждый по цене своей модели`
        : `${formatInt(cost.llm.inputTokens)} × ${formatUsd(chatPriceFor(models[0] || cost.llm.model).inputPerM)}/1M + ${formatInt(cost.llm.outputTokens)} × ${formatUsd(chatPriceFor(models[0] || cost.llm.model).outputPerM)}/1M`,
    total: formatUsd(cost.llm.usd, 2),
  });

  // Картинки: цена за штуку по официальной таблице, умноженная на число кадров.
  const imagesBase = cost.images.count * cost.images.unitUsd;
  rows.push({
    item: "Картинки",
    model: `${cost.images.model} · ${cost.images.quality} · ${cost.images.size.replace("x", "×")}`,
    quantity: pluralImages(cost.images.count),
    price: `${formatUsd(cost.images.unitUsd, 3)} за картинку`,
    math:
      `${cost.images.count} × ${formatUsd(cost.images.unitUsd, 3)}` +
      (cost.images.referenceUsd > 0 ? ` + референс ${formatUsd(cost.images.referenceUsd, 3)}` : ""),
    total: formatUsd(imagesBase + (cost.images.referenceUsd || 0), 2),
    note:
      cost.images.withReference > 0
        ? `с референсом: ${cost.images.withReference} шт., входная картинка ${formatInt(cost.images.referenceInputTokens)} токенов`
        : undefined,
  });

  // Озвучка: только Pay As You Go.
  if (cost.tts.credits > 0) {
    rows.push({
      item: "Озвучка ElevenLabs",
      model: cost.tts.model || "eleven_v3",
      quantity: `${formatInt(cost.tts.characters)} символов = ${formatInt(cost.tts.credits)} кредитов${cost.tts.creditsSource === "history" ? "" : " (по символам)"}`,
      price: `${formatUsd(ELEVEN_PAYG_USD_PER_1K)} за 1 000 кредитов`,
      math: `${formatInt(cost.tts.credits)} / 1 000 × ${formatUsd(ELEVEN_PAYG_USD_PER_1K)}`,
      total: formatUsd(cost.tts.usd, 2),
      note: cost.tts.keyOwner === "env" ? "ключ владельца сайта" : undefined,
    });
  }

  return rows;
}

/** Компактно для таблицы фильмов в админке: «$1,36 · текст $0,29 · картинки $0,45 · озвучка $0,62 (6 154 кр.)». */
export function formatCostCompact(raw: unknown): string {
  const cost = normalizeCost(raw);
  if (!cost) return "—";
  const parts = [`текст ${formatUsd(cost.llm.usd)}`, `картинки ${formatUsd(cost.images.usd)}`];
  if (cost.tts.credits > 0) parts.push(`озвучка ${formatUsd(cost.tts.usd)} (${formatInt(cost.tts.credits)} кр.)`);
  return `${formatUsd(cost.totalUsd)} · ${parts.join(" · ")}`;
}

/** Подпись про тариф под таблицей. */
export function planNote(): string {
  return (
    `Тариф ElevenLabs: ${ELEVEN_PLAN.label} — подписка ${formatUsd(ELEVEN_PLAN.monthlyUsd)} в месяц, ` +
    `её кредиты в расчёт не входят (считаем, что их ${ELEVEN_PLAN.includedCredits}); каждый потраченный кредит ` +
    `докупается по ${formatUsd(ELEVEN_PLAN.paygUsdPer1k)} за 1 000, купленные кредиты живут 12 месяцев.`
  );
}
