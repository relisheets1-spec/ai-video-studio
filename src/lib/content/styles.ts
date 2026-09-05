export const STYLE_IDS = [
  "cinematic",
  "documentary",
  "cyberpunk",
  "concept_art",
  "noir",
  "anime",
  "watercolor",
  "retro_film",
] as const;
export type StyleId = (typeof STYLE_IDS)[number];

export interface StyleDef {
  label: string;
  icon: string;
  /** Английский фрагмент, который уходит в промпт генератора изображений. */
  promptFragment: string;
}

export const STYLES: Record<StyleId, StyleDef> = {
  cinematic: {
    label: "Кино 8K",
    icon: "FilmSlate",
    promptFragment: "cinematic photorealistic, 8k, shallow depth of field, anamorphic flare",
  },
  documentary: {
    label: "Хроника",
    icon: "Camera",
    promptFragment: "historical documentary photography, archival grain, muted palette",
  },
  cyberpunk: {
    label: "Киберпанк",
    icon: "Circuitry",
    promptFragment: "cyberpunk sci-fi, dark neon, rain-soaked streets, volumetric haze",
  },
  concept_art: {
    label: "Концепт-арт",
    icon: "PaintBrush",
    promptFragment: "epic dark fantasy digital painting, matte painting, dramatic rim light",
  },
  noir: {
    label: "Нуар",
    icon: "Detective",
    promptFragment: "film noir, high-contrast black and white, venetian blind shadows, 1940s",
  },
  anime: {
    label: "Аниме",
    icon: "Sparkle",
    promptFragment: "modern anime key visual, cel shading, expressive lighting",
  },
  watercolor: {
    label: "Акварель",
    icon: "Drop",
    promptFragment: "hand-painted watercolor illustration, soft washes, paper texture, warm palette",
  },
  retro_film: {
    label: "Плёнка 90-х",
    icon: "VinylRecord",
    promptFragment: "1990s 35mm film still, Kodak Portra grain, slight halation, natural light",
  },
};

/**
 * Раньше id стиля БЫЛ сырой английской строкой промпта, и она же писалась в
 * video_generations.style. Старые записи архива содержат именно её, поэтому
 * незнакомое значение трактуем как готовый фрагмент, а не подменяем дефолтом.
 */
export function resolveStyleFragment(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return STYLES.cinematic.promptFragment;
  const known = STYLES[value as StyleId];
  if (known) return known.promptFragment;
  return value.slice(0, 120);
}
