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
 * Темп дикторской речи, слов в секунду. Из него считается объём текста под
 * заданный хронометраж. Русский измерен на двух реальных роликах: 1192 слова =
 * 582 с (2,05) и 2010 слов = 1001 с (2,01). Значение занижено намеренно:
 * ролик может быть короче заказа на минуту-две, но не длиннее — при 2,1
 * пятнадцать минут превращались в 16,7.
 */
export const WORDS_PER_SECOND: Record<ContentLanguage, number> = {
  ru: 1.9,
  kz: 1.9,
  en: 2.3,
};

/** Средняя длина слова с пробелом — нужна для оценки расхода символов ElevenLabs. */
export const CHARS_PER_WORD: Record<ContentLanguage, number> = {
  ru: 6.4,
  kz: 6.6,
  en: 5.9,
};
