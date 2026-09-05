import { splitNarrationIntoSentences } from "../subtitles";
import { MAX_SCENES } from "../plan";
import type { ContentLanguage } from "../content/languages";

/** Жёсткий потолок кадров — он же бюджет картинок. */
export const HARD_MAX_SCENES = MAX_SCENES;

export const SCENE_MARKER = "|||";

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function countMarkers(text: string): number {
  return (text.match(/\|\|\|/g) || []).length;
}

/** Убирает markdown, эмодзи и служебный мусор, который модель иногда добавляет. */
export function normalizeNarration(raw: string): string {
  return raw
    .replace(/\r\n/g, "\n")
    .replace(/^\s*#{1,6}\s+/gm, "")
    .replace(/\*\*|__|\*|`/g, "")
    .replace(/^\s*[-*•]\s+/gm, "")
    .replace(/^\s*(?:Кадр|Сцена|Scene|Frame|Фрагмент)\s*\d+\s*[:.)-]\s*/gim, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Режет непрерывный монолог на фрагменты по кадрам.
 *
 * Ключевое отличие от прежней схемы: текст УЖЕ написан как одно целое, поэтому
 * мысль, перетекающая через границу кадра, — структурное свойство, а не то,
 * на что мы надеемся. Маркеры модели используются как подсказка, но итоговое
 * число фрагментов задаём мы, а не она.
 *
 * Границы всегда проходят между предложениями: каждый фрагмент озвучивается
 * отдельным запросом к TTS, и разрез посреди фразы дал бы рваное аудио.
 * В кадре по возможности минимум два предложения — одно предложение на кадр
 * и было тем самым «телеграфом», от которого уходим.
 */
export function segmentNarration(
  raw: string,
  opts: { targetScenes: number; maxCharsPerScene: number }
): string[] {
  const normalized = normalizeNarration(raw);
  if (!normalized) return [];

  const requested = Math.max(1, Math.min(HARD_MAX_SCENES, opts.targetScenes));

  // 1. Позиции маркеров модели в терминах номеров предложений.
  const blocks = normalized.split(new RegExp("\\s*\\" + SCENE_MARKER.split("").join("\\") + "\\s*", "g"));
  const sentences: string[] = [];
  const markerAfterSentence = new Set<number>();
  for (const block of blocks) {
    const part = splitNarrationIntoSentences(block);
    for (const s of part) sentences.push(s);
    if (sentences.length > 0) markerAfterSentence.add(sentences.length - 1);
  }
  markerAfterSentence.delete(sentences.length - 1);

  if (sentences.length === 0) return [];

  // Кадров не больше, чем пар предложений: лучше меньше кадров, чем
  // кадр из одной сухой фразы.
  const targetScenes = Math.max(1, Math.min(requested, Math.floor(sentences.length / 2)));
  if (targetScenes <= 1) {
    return [sentences.join(" ").trim()];
  }

  // 2. Жадная сбалансированная упаковка с оглядкой на маркеры модели.
  const wordCounts = sentences.map(countWords);
  const totalWords = wordCounts.reduce((a, b) => a + b, 0);

  const groups: string[][] = [];
  let current: string[] = [];
  let currentWords = 0;
  let wordsLeft = totalWords;
  let groupsLeft = targetScenes;

  for (let i = 0; i < sentences.length; i++) {
    current.push(sentences[i]);
    currentWords += wordCounts[i];
    wordsLeft -= wordCounts[i];

    const sentencesLeft = sentences.length - i - 1;
    if (groupsLeft <= 1) continue;

    const quota = wordsLeft > 0 ? (currentWords + wordsLeft) / groupsLeft : currentWords;
    const reachedQuota = currentWords >= quota;
    // Маркер модели рядом с расчётной границей — предпочитаем его.
    const modelWantsBreak = markerAfterSentence.has(i) && currentWords >= quota * 0.6;
    // Нельзя оставить меньше предложений, чем осталось групп.
    const mustBreak = sentencesLeft <= groupsLeft - 1;

    if (reachedQuota || modelWantsBreak || mustBreak) {
      groups.push(current);
      current = [];
      currentWords = 0;
      groupsLeft--;
    }
  }
  if (current.length > 0) groups.push(current);

  // 3. Дробим слишком длинные фрагменты — иначе TTS обрежет хвост.
  const capped: string[][] = [];
  for (const group of groups) {
    let chunk: string[] = [];
    let chars = 0;
    for (const sentence of group) {
      if (chunk.length > 0 && chars + sentence.length > opts.maxCharsPerScene) {
        capped.push(chunk);
        chunk = [];
        chars = 0;
      }
      chunk.push(sentence);
      chars += sentence.length + 1;
    }
    if (chunk.length > 0) capped.push(chunk);
  }

  // 4. Приклеиваем огрызки короче 8 слов к соседу.
  const merged: string[][] = [];
  for (const group of capped) {
    const words = group.reduce((a, s) => a + countWords(s), 0);
    if (words < 8 && merged.length > 0) {
      merged[merged.length - 1].push(...group);
    } else {
      merged.push(group);
    }
  }

  // 5. Жёсткий потолок по числу кадров.
  while (merged.length > HARD_MAX_SCENES) {
    let smallestIdx = 0;
    let smallest = Infinity;
    for (let i = 0; i < merged.length - 1; i++) {
      const pair = merged[i].join(" ").length + merged[i + 1].join(" ").length;
      if (pair < smallest) {
        smallest = pair;
        smallestIdx = i;
      }
    }
    merged[smallestIdx].push(...merged[smallestIdx + 1]);
    merged.splice(smallestIdx + 1, 1);
  }

  return merged.map((g) => g.join(" ").trim()).filter(Boolean);
}

/**
 * Какому биту плана принадлежит каждый фрагмент. Доли битов нормализуются
 * к единице (если их нет — делим поровну), фрагмент относится к биту,
 * в чей диапазон попадает середина фрагмента по словам. Детерминированно —
 * по этому индексу визуальные промпты держат одну локацию внутри бита.
 */
export function assignBeats(fragments: string[], beats: Array<{ share?: number }> | undefined): number[] {
  const n = beats?.length || 0;
  if (n === 0) return fragments.map(() => 0);

  let shares = (beats || []).map((b) => (Number.isFinite(Number(b?.share)) && Number(b?.share) > 0 ? Number(b.share) : 0));
  const total = shares.reduce((a, b) => a + b, 0);
  shares = total > 0 ? shares.map((s) => s / total) : shares.map(() => 1 / n);

  const bounds: number[] = [];
  let acc = 0;
  for (const s of shares) {
    acc += s;
    bounds.push(acc);
  }
  bounds[bounds.length - 1] = 1;

  const wordCounts = fragments.map(countWords);
  const totalWords = wordCounts.reduce((a, b) => a + b, 0) || 1;

  let seen = 0;
  return fragments.map((_, i) => {
    const mid = (seen + wordCounts[i] / 2) / totalWords;
    seen += wordCounts[i];
    const idx = bounds.findIndex((b) => mid < b);
    return idx === -1 ? n - 1 : idx;
  });
}

// ---------------------------------------------------------------------------
// Части текста для длинных фильмов: модель обрывает вывод около 1200 слов,
// поэтому монолог, редактура и ритм идут кусками по границам маркеров |||.
// ---------------------------------------------------------------------------

/** Режет текст по маркерам на куски не длиннее maxWords слов (границы куска = маркеры). */
export function splitIntoChunks(text: string, maxWords: number): string[] {
  const blocks = text
    .split(/\s*\|\|\|\s*/g)
    .map((b) => b.trim())
    .filter(Boolean);
  if (blocks.length <= 1) return blocks;
  const chunks: string[][] = [];
  let current: string[] = [];
  let words = 0;
  for (const block of blocks) {
    const w = countWords(block);
    if (current.length > 0 && words + w > maxWords) {
      chunks.push(current);
      current = [];
      words = 0;
    }
    current.push(block);
    words += w;
  }
  if (current.length) chunks.push(current);
  return chunks.map((c) => c.join("\n|||\n"));
}

/** Обратная операция: куски были разрезаны по маркерам, значит стык — тоже маркер. */
export function joinChunks(chunks: string[]): string {
  return chunks.join("\n|||\n");
}

/** Сколько частей писать: по ~650 слов на вызов. */
export function narrationParts(askWords: number): number {
  return Math.max(1, Math.ceil(askWords / 650));
}

// ---------------------------------------------------------------------------
// Ритм предложений: измерение для промпта и для прохода «ритм»
// ---------------------------------------------------------------------------

export interface RhythmStats {
  sentences: number;
  mean: number;
  /** Доля предложений ≤ 6 слов. */
  shortShare: number;
  /** Доля предложений ≥ 18 слов. */
  longShare: number;
  /** Самая длинная серия подряд идущих предложений ≥ 15 слов. */
  longestLongRun: number;
  maxWords: number;
  over22: number;
  /** Оценка деепричастных оборотов (только ru, только для лога). */
  gerundEstimate: number;
}

export const RHYTHM = {
  shortMaxWords: 6,
  longMinWords: 18,
  runMinWords: 15,
  minShortShare: 0.25,
  maxLongShare: 0.35,
  maxLongRun: 2,
  maxSentenceWords: 28,
  maxMean: { ru: 13, kz: 13, en: 15 } as Record<ContentLanguage, number>,
};

const GERUND_RE = /[а-яё]{3,}(?:вшись|вши|ясь|учи|ючи)/gi;

export function rhythmStats(text: string): RhythmStats {
  const clean = normalizeNarration(text).replace(/\|\|\|/g, " ");
  const sentences = splitNarrationIntoSentences(clean).map(countWords).filter((n) => n > 0);
  const n = sentences.length;
  if (n === 0) {
    return { sentences: 0, mean: 0, shortShare: 0, longShare: 0, longestLongRun: 0, maxWords: 0, over22: 0, gerundEstimate: 0 };
  }
  let run = 0;
  let longestLongRun = 0;
  for (const w of sentences) {
    run = w >= RHYTHM.runMinWords ? run + 1 : 0;
    longestLongRun = Math.max(longestLongRun, run);
  }
  return {
    sentences: n,
    mean: Math.round((sentences.reduce((a, b) => a + b, 0) / n) * 10) / 10,
    shortShare: Math.round((sentences.filter((w) => w <= RHYTHM.shortMaxWords).length / n) * 100) / 100,
    longShare: Math.round((sentences.filter((w) => w >= RHYTHM.longMinWords).length / n) * 100) / 100,
    longestLongRun,
    maxWords: Math.max(...sentences),
    over22: sentences.filter((w) => w > 22).length,
    gerundEstimate: (clean.match(GERUND_RE) || []).length,
  };
}

/** Пустой список — ритм в норме. */
export function rhythmFailures(s: RhythmStats, language: ContentLanguage): string[] {
  const out: string[] = [];
  if (s.sentences < 4) return out;
  if (s.shortShare < RHYTHM.minShortShare) out.push(`коротких ${Math.round(s.shortShare * 100)}% < ${RHYTHM.minShortShare * 100}%`);
  if (s.longShare > RHYTHM.maxLongShare) out.push(`длинных ${Math.round(s.longShare * 100)}% > ${RHYTHM.maxLongShare * 100}%`);
  if (s.longestLongRun > RHYTHM.maxLongRun) out.push(`длинных подряд ${s.longestLongRun} > ${RHYTHM.maxLongRun}`);
  if (s.maxWords > RHYTHM.maxSentenceWords) out.push(`самое длинное ${s.maxWords} слов > ${RHYTHM.maxSentenceWords}`);
  if (s.mean > RHYTHM.maxMean[language]) out.push(`средняя ${s.mean} > ${RHYTHM.maxMean[language]}`);
  return out;
}

/** Чем больше, тем хуже; сравниваем до и после прохода «ритм». */
export function rhythmPenalty(s: RhythmStats, language: ContentLanguage): number {
  return (
    Math.max(0, 0.3 - s.shortShare) * 10 +
    Math.max(0, s.longShare - 0.3) * 10 +
    Math.max(0, s.longestLongRun - RHYTHM.maxLongRun) +
    Math.max(0, s.mean - RHYTHM.maxMean[language]) * 0.5 +
    Math.max(0, s.maxWords - RHYTHM.maxSentenceWords) * 0.1
  );
}
