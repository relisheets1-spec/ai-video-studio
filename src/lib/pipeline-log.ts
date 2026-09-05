import { supabaseAdmin } from "./supabase";

export type PipelineStage = "llm" | "tts" | "image" | "render" | "auth";

export const STAGE_LABELS: Record<PipelineStage, string> = {
  llm: "Сценарий (LLM)",
  tts: "Озвучка",
  image: "Изображения",
  render: "Рендер",
  auth: "Доступ",
};

/**
 * Логирование отказов пайплайна.
 *
 * До этого все пути отказа делали только console.error: поля status="failed"
 * и error_message в video_generations не писались НИ РАЗУ, поэтому упавшая
 * генерация навсегда оставалась в статусе generating_script, и в админке
 * такую запись было не отличить от идущей прямо сейчас.
 *
 * Пишем в video_generations, а не в отдельную таблицу: DDL к этой базе из
 * репозитория недоступен (см. supabase/migrations/0001 — файл готов, но
 * применять его нужно вручную в консоли Supabase). Этап кодируем префиксом
 * [stage] в error_message, по нему админка фильтрует.
 */
export async function logPipelineError(opts: {
  stage: PipelineStage;
  videoId?: string | null;
  message: string;
  httpStatus?: number;
}): Promise<void> {
  const line = `[${opts.stage}]${opts.httpStatus ? ` [${opts.httpStatus}]` : ""} ${opts.message}`;
  console.error("PipelineError", line, opts.videoId ? `video=${opts.videoId}` : "");

  if (!opts.videoId) return;

  try {
    await supabaseAdmin
      .from("video_generations")
      .update({
        status: "failed",
        error_message: line.slice(0, 1000),
        updated_at: new Date().toISOString(),
      })
      .eq("id", opts.videoId);
  } catch (err) {
    // Логирование не должно ронять запрос поверх уже случившейся ошибки.
    console.error("logPipelineError failed to persist:", err);
  }
}

/** Разбирает префикс обратно в этап для отображения в админке. */
export function parseStage(errorMessage?: string | null): PipelineStage | null {
  const m = /^\[(llm|tts|image|render|auth)\]/.exec(errorMessage || "");
  return m ? (m[1] as PipelineStage) : null;
}
