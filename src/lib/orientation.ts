/**
 * Ориентация кадра — единственный источник правды.
 *
 * Модуль намеренно без React и без "use client": его импортируют и клиентские
 * компоненты (плеер, экспортёр, студия), и серверные роуты (script, image).
 */

export type Orientation = "landscape" | "portrait";

export type ExportResolution = "1080p" | "720p";

/** Размеры холста экспорта. Обе стороны чётные — требование H.264. */
export const EXPORT_SIZES: Record<ExportResolution, Record<Orientation, { w: number; h: number }>> = {
  "1080p": { landscape: { w: 1920, h: 1080 }, portrait: { w: 1080, h: 1920 } },
  "720p": { landscape: { w: 1280, h: 720 }, portrait: { w: 720, h: 1280 } },
};

/** Совместимость: прежний экспорт знал только 1080p. */
export const FRAME_SIZES = EXPORT_SIZES["1080p"];

export const EXPORT_BITRATE: Record<ExportResolution, number> = {
  "1080p": 5_500_000,
  "720p": 3_200_000,
};

export const EXPORT_RESOLUTIONS: ExportResolution[] = ["1080p", "720p"];

export function normalizeResolution(value: unknown): ExportResolution {
  return value === "720p" ? "720p" : "1080p";
}

/** Любое непонятное значение трактуем как 16:9 — это и дефолт, и поведение старых видео. */
export function normalizeOrientation(value: unknown): Orientation {
  return value === "portrait" ? "portrait" : "landscape";
}

/** Значение для CSS-свойства aspect-ratio. */
export function aspectRatioCss(orientation: Orientation): string {
  return orientation === "portrait" ? "9 / 16" : "16 / 9";
}

/**
 * Размер для OpenAI Images API.
 * Внимание: gpt-image-1-mini умеет 3:2 и 2:3, а не 16:9 / 9:16 — поэтому
 * при отрисовке на холст обязателен cover-fit, иначе кадр исказится.
 */
export function imageApiSize(orientation: Orientation): string {
  return orientation === "portrait" ? "1024x1536" : "1536x1024";
}

/** Подсказка о композиции для текстовых промптов (сценарий и картинка). */
export function promptAspectHint(orientation: Orientation): string {
  return orientation === "portrait"
    ? "9:16 vertical portrait composition, 35mm lens"
    : "16:9 widescreen composition, 35mm lens";
}

/** Человекочитаемая подпись для UI и имени файла. */
export function orientationLabel(orientation: Orientation): string {
  return orientation === "portrait" ? "9:16" : "16:9";
}
