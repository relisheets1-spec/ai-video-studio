import data from "./voices.data.json";
import type { ContentLanguage } from "./languages";

export interface VoiceDef {
  id: string;
  name: string;
  gender: "male" | "female";
  lang: ContentLanguage;
  roleTitle: string;
  tag: string;
  previewFile: string;
  sampleText: string;
}

export const VOICE_CATALOG = data.voices as VoiceDef[];

/**
 * Модель TTS выбирается по языку ДЕТЕРМИНИРОВАННО.
 *
 * Раньше код всегда пробовал eleven_v3 и молча ретраил на multilingual_v2 при
 * любой ошибке — если запрос седьмого кадра падал, седьмой кадр приходил от
 * другой модели, и посреди ролика слышно менялся тембр.
 */
export const MODEL_BY_LANGUAGE = data.models as Record<ContentLanguage, string>;

export const SETTINGS_BY_MODEL = data.settings as Record<
  string,
  Record<string, number | boolean>
>;

export function voicesFor(language: ContentLanguage): VoiceDef[] {
  return VOICE_CATALOG.filter((v) => v.lang === language);
}

export function defaultVoiceFor(language: ContentLanguage): string {
  return voicesFor(language)[0]?.id || VOICE_CATALOG[0].id;
}

export function findVoice(id: string): VoiceDef | undefined {
  return VOICE_CATALOG.find((v) => v.id === id);
}

/** Голос должен существовать И принадлежать выбранному языку. */
export function resolveVoice(id: unknown, language: ContentLanguage): string {
  if (typeof id === "string") {
    const found = findVoice(id);
    if (found && found.lang === language) return found.id;
  }
  return defaultVoiceFor(language);
}

/** Единственная модель — Eleven v3: только она читает казахский; v2 и запасная озвучка убраны. */
export function modelForLanguage(language: ContentLanguage): string {
  return MODEL_BY_LANGUAGE[language] || "eleven_v3";
}

export function settingsForModel(model: string): Record<string, number | boolean> {
  return SETTINGS_BY_MODEL[model] || SETTINGS_BY_MODEL["eleven_v3"];
}
