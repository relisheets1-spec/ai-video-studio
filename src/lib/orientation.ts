/**
 * Ориентация кадра — единственный источник правды.
 *
 * Модуль намеренно без React и без "use client": его импортируют и клиентские
 * компоненты (плеер, экспортёр, студия), и серверные роуты (script, image).
 */

export type Orientation = "landscape" | "portrait";

/** Размеры холста экспорта. Обе стороны чётные — требование H.264. */
export const FRAME_SIZES: Record<Orientation, { w: number; h: number }> = {
  landscape: { w: 1920, h: 1080 },
  portrait: { w: 1080, h: 1920 },
};

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
