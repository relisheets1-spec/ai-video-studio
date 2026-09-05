/**
 * Субтитры: нарезка на реплики, тайминг и ПРОПОРЦИОНАЛЬНАЯ разметка.
 *
 * Этот модуль — единственный источник правды и для DOM-оверлея плеера,
 * и для выжигания субтитров на холст в экспортёре. Раньше логика была
 * продублирована байт-в-байт в VideoPlayer.tsx и VideoExporter.tsx, из-за
 * чего превью и MP4 расходились.
 *
 * ВНИМАНИЕ: цвета здесь — литералы, а НЕ токены темы (rgb(var(--...))).
 * Они запекаются в MP4, который не знает ни про светлую, ни про тёмную тему.
 */

/**
 * Системный стек — намеренно НЕ Inter.
 * layout.tsx грузит Inter с Google Fonts (веса 400;500;600;700). Canvas
 * measureText молча меряет запасным шрифтом, пока веб-шрифт не загрузился,
 * и тогда перенос строк в MP4 не совпадёт с превью. Системный стек доступен
 * мгновенно в обоих рендерерах.
 */
export const SUBTITLE_FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

/** Вес 700 в обоих рендерерах: DOM просил 800, а Inter грузится только до 700 — был синтетический жирный. */
export const SUBTITLE_FONT_WEIGHT = 700;

/** Полупрозрачная подложка по ТЗ. */
export const SUBTITLE_BG = "rgba(0, 0, 0, 0.5)";
export const SUBTITLE_FG = "#FFFFFF";
export const SUBTITLE_SHADOW = "rgba(0, 0, 0, 0.75)";

export interface Cue {
  text: string;
  startSec: number;
  endSec: number;
}

// ---------------------------------------------------------------------------
// Нарезка на предложения (перенесена как есть — поведение менять нельзя)
// ---------------------------------------------------------------------------

/**
 * Разбиение дикторского текста на предложения для RU / KZ / EN:
 * - бережёт десятичные числа (1.5 млн)
 * - бережёт сокращения (г., н.э., т.е., млрд.)
 * - бережёт закрывающие кавычки и скобки
 * - режет на куски текст без пунктуации, чтобы не было простыней
 */
export function splitNarrationIntoSentences(text: string): string[] {
  if (!text) return [];
  const clean = text.trim();
  if (!clean) return [];

  // 1. Защищаем десятичные числа (1.5 -> 1\uFFF05)
  let protectedText = clean.replace(/(\d+)\.(\d+)/g, "$1\uFFF0$2");

  // 2. Защищаем известные сокращения
  protectedText = protectedText.replace(
    /\b(г|гг|в|вв|н\.э|до н\.э|т\.е|т\.д|т\.п|млн|млрд|тыс|руб|долл|ж|жж|ғ|ғғ)\./gi,
    (m) => m.replace(/\./g, "\uFFF0")
  );

  // Точки перед строчной буквой — продолжение фразы, а не конец предложения
  protectedText = protectedText.replace(/\.(?=\s*[а-яёәғқңөұүһa-z0-9])/g, "\uFFF0");

  // 3. Предложения, заканчивающиеся на [.!?…] с опциональными кавычками
  const regex = /[^.!?…\n]+(?:[.!?…]+["'»”’\)\]]*(?=\s|$)|$)/g;
  const rawSentences: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(protectedText)) !== null) {
    const s = match[0].replace(/\uFFF0/g, ".").trim();
    if (s) rawSentences.push(s);
  }

  // 4. Кусок без пунктуации длиннее 16 слов режем по 8 слов
  const finalSentences: string[] = [];
  for (const sent of rawSentences) {
    const words = sent.split(/\s+/).filter(Boolean);
    if (words.length > 16 && !/[.!?…]/.test(sent)) {
      for (let i = 0; i < words.length; i += 8) {
        finalSentences.push(words.slice(i, i + 8).join(" "));
      }
    } else {
      finalSentences.push(sent);
    }
  }

  return finalSentences.length > 0 ? finalSentences : [clean];
}

// ---------------------------------------------------------------------------
// Тайминг
// ---------------------------------------------------------------------------

/**
 * Строит список реплик с таймкодами. Вес предложения — его длина в символах
 * (минимум 12), ровно как в прежней реализации getActiveSentence, поэтому
 * поведение не меняется — просто материализуется в массив один раз на сцену,
 * а не пересчитывается на каждом кадре кодирования.
 */
export function buildCues(narration: string, durationSec: number): Cue[] {
  const sentences = splitNarrationIntoSentences(narration);
  if (sentences.length === 0) return [];

  const dur = Math.max(durationSec, 0.1);
  const weights = sentences.map((s) => Math.max(s.length, 12));
  const total = weights.reduce((sum, w) => sum + w, 0) || 1;

  const cues: Cue[] = [];
  let accumulated = 0;
  for (let i = 0; i < sentences.length; i++) {
    const start = (accumulated / total) * dur;
    accumulated += weights[i];
    const end = (accumulated / total) * dur;
    cues.push({ text: sentences[i], startSec: start, endSec: end });
  }
  // Последняя реплика держится до конца сцены, чтобы не мигала на хвосте.
  cues[cues.length - 1].endSec = dur;
  return cues;
}

/** Индекс активной реплики в момент t, или -1. */
export function cueIndexAt(cues: Cue[], t: number): number {
  if (cues.length === 0) return -1;
  if (t < cues[0].startSec) return 0;
  for (let i = 0; i < cues.length; i++) {
    if (t < cues[i].endSec) return i;
  }
  return cues.length - 1;
}

/**
 * Запасная оценка длительности сцены, когда нет ни измеренного аудио,
 * ни серверной оценки. Одна формула вместо разбросанных 17 / 19 / 13.
 */
export function estimateSceneSeconds(narration?: string): number {
  if (!narration) return 8;
  return Math.max(5, Math.round(narration.trim().length / 13));
}

// ---------------------------------------------------------------------------
// Разметка
// ---------------------------------------------------------------------------

export interface SubtitleLayout {
  font: number;
  lineHeight: number;
  padX: number;
  padY: number;
  radius: number;
  /** Отступ низа карточки от низа кадра. */
  bottom: number;
  maxCardW: number;
  /** Доступная ширина под текст = maxCardW - 2*padX. */
  maxTextW: number;
  shadowBlur: number;
  shadowOffsetY: number;
  /** Высота нижней затемняющей шторки. */
  scrimH: number;
  /** Готовая строка для ctx.font и CSS font. */
  fontCss: string;
}

/**
 * Опорная величина — КОРОТКАЯ сторона кадра, не высота.
 * На 1080x1920 4.5% от высоты дало бы шрифт 86px при ширине кадра 1080 —
 * каждая реплика ушла бы в четыре строки. От короткой стороны получается
 * одинаковый кегль в обеих ориентациях, как принято в вертикальном видео.
 */
export function computeSubtitleLayout(
  frameW: number,
  frameH: number,
  opts?: { minFontPx?: number; compact?: boolean }
): SubtitleLayout {
  const W = Math.max(1, frameW);
  const H = Math.max(1, frameH);
  const S = Math.min(W, H);
  // compact — маленький кадр в превью на телефоне: карточка шире, ниже и
  // короче шторка. Экспортёр этот флаг не передаёт, поэтому MP4 не меняется.
  const compact = !!opts?.compact;

  const font = Math.max(opts?.minFontPx ?? 1, Math.round(S * 0.045));
  const padX = Math.round(font * 0.7);
  const maxCardW = Math.round(W * (compact ? 0.94 : W >= H ? 0.72 : 0.88));

  return {
    font,
    lineHeight: Math.round(font * 1.3),
    padX,
    padY: Math.round(font * 0.34),
    radius: Math.round(font * 0.3),
    bottom: Math.round(H * (compact ? 0.05 : 0.085)),
    maxCardW,
    maxTextW: Math.max(1, maxCardW - padX * 2),
    shadowBlur: font * 0.16,
    shadowOffsetY: font * 0.03,
    scrimH: Math.round(H * (compact ? 0.22 : 0.34)),
    fontCss: `${SUBTITLE_FONT_WEIGHT} ${font}px ${SUBTITLE_FONT_STACK}`,
  };
}

/**
 * Жадный перенос по словам. Одну и ту же функцию использует и холст,
 * и DOM (через скрытый canvas для measureText) — иначе карточки разъедутся.
 */
export function wrapLines(
  text: string,
  maxTextWidth: number,
  measure: (s: string) => number
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const lines: string[] = [];
  let line = words[0];

  for (let i = 1; i < words.length; i++) {
    const candidate = `${line} ${words[i]}`;
    if (measure(candidate) <= maxTextWidth) {
      line = candidate;
    } else {
      lines.push(line);
      line = words[i];
    }
  }
  lines.push(line);
  return lines;
}

// ---------------------------------------------------------------------------
// Подгонка реплик под ограниченное число строк (только превью на телефоне)
// ---------------------------------------------------------------------------

const CLAUSE_BONUS = /[,;:—–-]$/;

/** Лучшее место разреза по словам: ближе к середине, предпочтительно после запятой/тире. */
function bestSplit(words: string[]): number {
  const total = words.join(" ").length;
  let best = -1;
  let bestScore = Infinity;
  let acc = 0;
  for (let i = 0; i < words.length - 1; i++) {
    acc += words[i].length + 1;
    const distance = Math.abs(acc - total / 2) / total;
    const score = distance - (CLAUSE_BONUS.test(words[i]) ? 0.12 : 0);
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}

/**
 * Делит реплики, которые не влезают в maxLines строк, на под-реплики с
 * пропорциональным по длине временем. Объединение интервалов равно
 * исходному, поэтому cueIndexAt работает без изменений.
 */
export function fitCuesToLines(
  cues: Cue[],
  maxLines: number,
  maxTextW: number,
  measure: (s: string) => number
): Cue[] {
  const out: Cue[] = [];

  const push = (cue: Cue, depth: number) => {
    const words = cue.text.split(/\s+/).filter(Boolean);
    if (words.length < 2 || depth >= 3 || wrapLines(cue.text, maxTextW, measure).length <= maxLines) {
      out.push(cue);
      return;
    }
    const cut = bestSplit(words);
    if (cut < 0) {
      out.push(cue);
      return;
    }
    const a = words.slice(0, cut + 1).join(" ");
    const b = words.slice(cut + 1).join(" ");
    const span = cue.endSec - cue.startSec;
    const mid = cue.startSec + span * (a.length / Math.max(1, a.length + b.length));
    push({ text: a, startSec: cue.startSec, endSec: mid }, depth + 1);
    push({ text: b, startSec: mid, endSec: cue.endSec }, depth + 1);
  };

  for (const cue of cues) push(cue, 0);
  return out;
}
