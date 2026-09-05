export const STYLE_IDS = [
  "cinematic",
  "documentary",
  "retro_film",
  "golden_hour",
  "noir",
  "cyberpunk",
  "synthwave",
  "steampunk",
  "concept_art",
  "oil_painting",
  "watercolor",
  "ink_wash",
  "pencil_sketch",
  "comic",
  "anime",
  "pixar_3d",
  "storybook",
  "soviet_poster",
] as const;
export type StyleId = (typeof STYLE_IDS)[number];

export interface StyleDef {
  label: string;
  /** Имя иконки Phosphor — строкой, чтобы модуль могли импортировать серверные роуты. */
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
    icon: "Archive",
    promptFragment: "historical documentary photography, archival grain, muted palette",
  },
  retro_film: {
    label: "Плёнка 90-х",
    icon: "VinylRecord",
    promptFragment: "1990s 35mm film still, Kodak Portra grain, slight halation, natural light",
  },
  golden_hour: {
    label: "Золотой час",
    icon: "Sun",
    promptFragment: "photorealistic golden hour photography, warm low sun, long shadows, 85mm lens, gentle haze",
  },
  noir: {
    label: "Нуар",
    icon: "Detective",
    promptFragment: "film noir, high-contrast black and white, venetian blind shadows, 1940s",
  },
  cyberpunk: {
    label: "Киберпанк",
    icon: "Circuitry",
    promptFragment: "cyberpunk sci-fi, dark neon, rain-soaked streets, volumetric haze",
  },
  synthwave: {
    label: "Синтвейв 80-х",
    icon: "Radio",
    promptFragment: "1980s synthwave retrofuturism, neon magenta and cyan, chrome reflections, grid horizon, VHS glow",
  },
  steampunk: {
    label: "Стимпанк",
    icon: "Gear",
    promptFragment: "steampunk, brass and copper machinery, victorian streets, drifting steam, warm gaslight",
  },
  concept_art: {
    label: "Концепт-арт",
    icon: "Palette",
    promptFragment: "epic dark fantasy digital painting, matte painting, dramatic rim light",
  },
  oil_painting: {
    label: "Масляная живопись",
    icon: "PaintBrush",
    promptFragment: "classical oil painting, visible brushstrokes, chiaroscuro, varnished canvas texture",
  },
  watercolor: {
    label: "Акварель",
    icon: "Drop",
    promptFragment: "hand-painted watercolor illustration, soft washes, paper texture, warm palette",
  },
  ink_wash: {
    label: "Тушь",
    icon: "Feather",
    promptFragment: "east asian ink wash painting, sumi-e, sparse brush strokes, rice paper, generous negative space",
  },
  pencil_sketch: {
    label: "Карандаш",
    icon: "Pencil",
    promptFragment: "detailed graphite pencil sketch, cross-hatching, paper grain, monochrome",
  },
  comic: {
    label: "Комикс",
    icon: "ChatCircleDots",
    promptFragment: "graphic novel panel, bold ink outlines, halftone shading, dramatic flat colors",
  },
  anime: {
    label: "Аниме",
    icon: "Sparkle",
    promptFragment: "modern anime key visual, cel shading, expressive lighting",
  },
  pixar_3d: {
    label: "3D-мультфильм",
    icon: "Cube",
    promptFragment: "stylized 3D animated film still, soft global illumination, expressive characters, subsurface skin",
  },
  storybook: {
    label: "Сказочная книга",
    icon: "MoonStars",
    promptFragment: "children's storybook illustration, soft gouache, whimsical shapes, warm cozy light",
  },
  soviet_poster: {
    label: "Советский плакат",
    icon: "Stamp",
    promptFragment: "1960s soviet poster art, flat bold shapes, limited red-ochre-cream palette, screen-print texture",
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
