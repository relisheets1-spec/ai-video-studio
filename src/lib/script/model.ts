import { openai } from "@/lib/openai";

/**
 * Модели для проходов сценария. Вынесены из route-файлов: Next разрешает им
 * экспортировать только обработчики.
 *
 * Замер 2026-09-05 на реальных промптах (15 минут, русский, askWords 1625):
 * gpt-5.1 пишет монолог на 2 500–3 250 слов при любом reasoning_effort и
 * verbosity — это 21–27 минут речи вместо 15, а обрезка снимает лишь 10–20 %.
 * gpt-4o держит коридор (+12 %). Поэтому сюжет (план истории) придумывает
 * gpt-5.1 — там его сила, — а текст по этому плану пишет gpt-4o. Редактор,
 * обрезка, ритм и визуальные промпты на gpt-5.1 проверены: маркеры и объём
 * сохраняют, JSON на 30 кадров отдают за ~60 с.
 */
export const SCRIPT_MODEL = "gpt-5.1";
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
