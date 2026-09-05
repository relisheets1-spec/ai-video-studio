/**
 * Ken Burns: медленный наезд, отъезд и панорамирование картинки на протяжении
 * всей сцены. Один и тот же набор пресетов и та же кривая используются в
 * плеере (Web Animations API) и в экспортёре (холст), поэтому превью и MP4
 * движутся одинаково.
 *
 * Координаты x/y — доля размера кадра. Чтобы у картинки не показывался край,
 * всегда |x| ≤ (scale − 1) / 2 (и то же по y): картинка cover-fit, запас
 * появляется только за счёт масштаба.
 */

export interface KenBurnsPreset {
  s0: number;
  s1: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export const KEN_BURNS_PRESETS: KenBurnsPreset[] = [
  { s0: 1.0, s1: 1.12, x0: 0, y0: 0, x1: 0, y1: 0 }, // наезд в центр
  { s0: 1.1, s1: 1.1, x0: 0.045, y0: 0, x1: -0.045, y1: 0 }, // панорама справа налево
  { s0: 1.12, s1: 1.0, x0: 0, y0: 0, x1: 0, y1: 0 }, // отъезд
  { s0: 1.1, s1: 1.1, x0: -0.045, y0: 0.01, x1: 0.045, y1: -0.01 }, // панорама слева направо
  { s0: 1.0, s1: 1.12, x0: 0, y0: 0, x1: 0.04, y1: -0.03 }, // наезд к верхнему левому краю
  { s0: 1.12, s1: 1.02, x0: -0.04, y0: 0.03, x1: 0, y1: 0 }, // отъезд от нижнего правого края
];

export function kenBurnsPreset(sceneIndex: number): KenBurnsPreset {
  return KEN_BURNS_PRESETS[Math.abs(sceneIndex) % KEN_BURNS_PRESETS.length];
}

/** Плавный старт и финиш — резкое начало движения выглядит как рывок. */
export function easeInOut(t: number): number {
  const p = Math.max(0, Math.min(1, t));
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

export interface KenBurnsState {
  scale: number;
  x: number;
  y: number;
}

export function kenBurnsAt(preset: KenBurnsPreset, progress: number): KenBurnsState {
  const p = easeInOut(progress);
  return {
    scale: preset.s0 + (preset.s1 - preset.s0) * p,
    x: preset.x0 + (preset.x1 - preset.x0) * p,
    y: preset.y0 + (preset.y1 - preset.y0) * p,
  };
}

/** CSS transform для картинки размером с кадр: сдвиг в процентах кадра, затем масштаб от центра. */
export function kenBurnsTransform(state: KenBurnsState): string {
  return `translate(${(state.x * 100).toFixed(3)}%, ${(state.y * 100).toFixed(3)}%) scale(${state.scale.toFixed(4)})`;
}

/** Ключевые кадры для Web Animations API — семплируем ту же кривую, что и экспортёр. */
export function kenBurnsKeyframes(preset: KenBurnsPreset, steps = 24): Keyframe[] {
  const frames: Keyframe[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    frames.push({ offset: t, transform: kenBurnsTransform(kenBurnsAt(preset, t)), easing: "linear" });
  }
  return frames;
}
