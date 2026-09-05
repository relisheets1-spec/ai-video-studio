import { splitNarrationIntoSentences } from "../subtitles";

/** Жёсткий потолок: sceneId валидируется в диапазоне 0..40 в audio- и image-роутах. */
export const HARD_MAX_SCENES = 36;

export const SCENE_MARKER = "|||";

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
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
 * число фрагментов задаём мы, а не она (раньше модель регулярно возвращала
 * 23 сцены вместо 25).
 *
 * Границы всегда проходят между предложениями: каждый фрагмент озвучивается
 * отдельным запросом к TTS, и разрез посреди фразы дал бы рваное аудио.
 */
export function segmentNarration(
  raw: string,
  opts: { targetScenes: number; maxCharsPerScene: number }
): string[] {
  const normalized = normalizeNarration(raw);
  if (!normalized) return [];

  const targetScenes = Math.max(1, Math.min(HARD_MAX_SCENES, opts.targetScenes));

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
  if (sentences.length <= targetScenes) {
    return sentences.map((s) => s.trim()).filter(Boolean);
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
