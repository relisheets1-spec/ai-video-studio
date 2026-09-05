import { emptyLlmUsage, usdForChat, type LlmUsageJson } from "./pricing";

/** Накопитель usage по вызовам chat completions одной генерации. */
export class LlmUsage {
  private data: LlmUsageJson;

  constructor(model: string, initial?: LlmUsageJson | null) {
    this.data = initial ? { ...initial, breakdown: [...(initial.breakdown || [])] } : emptyLlmUsage(model);
  }

  add(pass: string, usage?: { prompt_tokens?: number; completion_tokens?: number } | null): void {
    const inputTokens = Number(usage?.prompt_tokens) || 0;
    const outputTokens = Number(usage?.completion_tokens) || 0;
    this.data.calls += 1;
    this.data.inputTokens += inputTokens;
    this.data.outputTokens += outputTokens;
    this.data.breakdown.push({ pass, inputTokens, outputTokens });
    this.data.usd = usdForChat(this.data.model, this.data.inputTokens, this.data.outputTokens);
  }

  toJSON(): LlmUsageJson {
    return { ...this.data, breakdown: [...this.data.breakdown] };
  }
}
