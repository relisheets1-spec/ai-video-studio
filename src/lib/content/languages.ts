/** Языки КОНТЕНТА (сценарий, озвучка, субтитры). Интерфейс всегда русский. */
export const CONTENT_LANGUAGES = ["ru", "kz", "en"] as const;
export type ContentLanguage = (typeof CONTENT_LANGUAGES)[number];

export function normalizeLanguage(value: unknown): ContentLanguage {
  return CONTENT_LANGUAGES.includes(value as ContentLanguage)
    ? (value as ContentLanguage)
    : "ru";
}

/** Подписи вкладок языка — по-русски, потому что интерфейс русский. */
export const LANGUAGE_LABELS: Record<ContentLanguage, string> = {
  ru: "Русский",
  kz: "Қазақша",
  en: "English",
};

/**
 * Темп дикторской речи, слов в секунду, при speed 0.95.
 * Из него считается объём текста под заданный хронометраж.
 */
export const WORDS_PER_SECOND: Record<ContentLanguage, number> = {
  ru: 2.35,
  kz: 2.25,
  en: 2.55,
};

/** Средняя длина слова с пробелом — нужна для оценки расхода символов ElevenLabs. */
export const CHARS_PER_WORD: Record<ContentLanguage, number> = {
  ru: 6.4,
  kz: 6.6,
  en: 5.9,
};
