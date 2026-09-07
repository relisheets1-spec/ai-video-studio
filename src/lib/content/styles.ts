/**
 * Стиль картинок пользователь не выбирает. По умолчанию — кино; другой стиль
 * берётся только из темы: если она прямо задаёт технику, план истории
 * возвращает visualStyle, и этот английский фрагмент хранится в
 * video_generations.style вместо id.
 */
export const DEFAULT_STYLE_ID = "cinematic";

const DEFAULT_STYLE_FRAGMENT = "cinematic photorealistic, 8k, shallow depth of field, anamorphic flare";

/** id по умолчанию или фрагмент из темы → хвост промпта для генератора картинок. */
export function resolveStyleFragment(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value === DEFAULT_STYLE_ID) return DEFAULT_STYLE_FRAGMENT;
  return value.slice(0, 120);
}
