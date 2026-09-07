import { openai } from "@/lib/openai";

/**
 * Модели для проходов сценария. Вынесены из route-файлов: Next разрешает им
 * экспортировать только обработчики.
 *
 * Весь текст — план, монолог, редактор, обрезка, ритм, визуальные промпты —
 * на gpt-4o по решению владельца (07.09.2026): одна модель, одна цена, один
 * столбец в стоимости. gpt-5.1 в пайплайне не используется; замер 2026-09-05
 * показал, что монолог он пишет в 1,5–2 раза длиннее заказа, а gpt-4o держит
 * коридор (+12 %). Ветка для gpt-5.x в scriptChat оставлена на случай возврата.
 */
export const SCRIPT_MODEL = "gpt-4o-2024-11-20";
export const NARRATION_MODEL = "gpt-4o-2024-11-20";

/** Распознавание референса: gpt-4o проверен на картинках, менять незачем. */
export const VISION_MODEL = "gpt-4o-2024-11-20";

const GPT5_FAMILY = /^gpt-5/;

export interface ScriptChatParams {
  /** По умолчанию SCRIPT_MODEL. */
  model?: string;
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  /** Для gpt-5.x принимается только при reasoning "none". */
  temperature?: number;
  /** response_format json_object. */
  json?: boolean;
  /** Только gpt-5.x: none — быстрый «писатель», low — посчитать и спланировать. */
  reasoning?: "none" | "low" | "medium";
}

/** Единая точка вызова: параметры подстраиваются под семейство модели. */
export function scriptChat(p: ScriptChatParams) {
  const model = p.model || SCRIPT_MODEL;
  const params: Record<string, unknown> = { model, messages: p.messages };
  if (p.json) params.response_format = { type: "json_object" };
  if (GPT5_FAMILY.test(model)) {
    const effort = p.reasoning ?? "none";
    params.reasoning_effort = effort;
    // temperature принимается только без размышлений (проверено на gpt-5.1).
    if (effort === "none" && p.temperature !== undefined) params.temperature = p.temperature;
  } else if (p.temperature !== undefined) {
    params.temperature = p.temperature;
  }
  return openai.chat.completions.create(params as any);
}
