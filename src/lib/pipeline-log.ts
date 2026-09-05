import { getVideo, updateVideo } from "./videos";

export type PipelineStage = "llm" | "tts" | "image" | "render" | "auth";

export const STAGE_LABELS: Record<PipelineStage, string> = {
  llm: "Сценарий (LLM)",
  tts: "Озвучка",
  image: "Изображения",
  render: "Рендер",
  auth: "Доступ",
};

/**
 * Логирование отказов пайплайна: этап кодируется префиксом [stage] в
 * error_message, по нему админка фильтрует журнал. Без этого упавшая
 * генерация навсегда оставалась бы в статусе generating_script и в панели
 * её было бы не отличить от идущей прямо сейчас.
 */
export function logPipelineError(opts: {
  stage: PipelineStage;
  videoId?: string | null;
  message: string;
  httpStatus?: number;
}): void {
  const line = `[${opts.stage}]${opts.httpStatus ? ` [${opts.httpStatus}]` : ""} ${opts.message}`;
  console.error("PipelineError", line, opts.videoId ? `video=${opts.videoId}` : "");

  if (!opts.videoId) return;
  try {
    if (!getVideo(opts.videoId)) return;
    updateVideo(opts.videoId, { status: "failed", error_message: line.slice(0, 1000) });
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
