import { getVideo, updateVideo } from "./videos";

export type PipelineStage = "llm" | "tts" | "image" | "render" | "auth";

/**
 * Отказ пайплайна: пишется в журнал сервера, а фильм помечается failed с
 * причиной в error_message — иначе упавшая генерация навсегда оставалась бы
 * «идущей».
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
