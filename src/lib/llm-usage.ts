import { emptyLlmUsage, usdForChat, type LlmUsageJson } from "./pricing";

/**
 * Накопитель usage по вызовам chat completions одной генерации.
 * Проходы идут на разных моделях (план — gpt-5.1, монолог — gpt-4o), поэтому
 * каждый вызов оценивается по своей модели, а итог — сумма по проходам.
 */
export class LlmUsage {
  private data: LlmUsageJson;

  constructor(model: string, initial?: LlmUsageJson | null) {
    this.data = initial ? { ...initial, breakdown: [...(initial.breakdown || [])] } : emptyLlmUsage(model);
  }

  add(pass: string, usage?: { prompt_tokens?: number; completion_tokens?: number } | null, model?: string): void {
    const inputTokens = Number(usage?.prompt_tokens) || 0;
    const outputTokens = Number(usage?.completion_tokens) || 0;
    const used = model || this.data.model;
    this.data.calls += 1;
    this.data.inputTokens += inputTokens;
    this.data.outputTokens += outputTokens;
    this.data.breakdown.push({ pass, model: used, inputTokens, outputTokens, usd: usdForChat(used, inputTokens, outputTokens) });
    this.data.usd = Math.round(this.data.breakdown.reduce((a, b) => a + (b.usd ?? usdForChat(b.model || this.data.model, b.inputTokens, b.outputTokens)), 0) * 10000) / 10000;
    // Подпись модели: все использованные, без дублей и дат.
    const names = Array.from(new Set(this.data.breakdown.map((b) => shortModel(b.model || this.data.model))));
    this.data.model = names.join(" + ");
  }

  toJSON(): LlmUsageJson {
    return { ...this.data, breakdown: [...this.data.breakdown] };
  }
}

/** gpt-5.1-2025-11-13 → gpt-5.1, gpt-4o-2024-11-20 → gpt-4o. */
export function shortModel(model: string): string {
  return model.replace(/-\d{4}-\d{2}-\d{2}$/, "");
}
