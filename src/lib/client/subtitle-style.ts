"use client";

import { DEFAULT_SUBTITLE_COLOR, normalizeSubtitleColor, type SubtitleColorId } from "@/lib/subtitles";

/** Цвет субтитров — настройка браузера пользователя, общая для плеера и экспорта. */

const KEY = "subtitle_color_v1";
export const SUBTITLE_STYLE_EVENT = "studio:subtitle-style";

export function getSubtitleColor(): SubtitleColorId {
  try {
    return normalizeSubtitleColor(typeof window !== "undefined" ? window.localStorage.getItem(KEY) : null);
  } catch {
    return DEFAULT_SUBTITLE_COLOR;
  }
}

export function setSubtitleColor(id: SubtitleColorId): void {
  try {
    window.localStorage.setItem(KEY, id);
  } catch {}
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(SUBTITLE_STYLE_EVENT, { detail: { color: id } }));
  }
}
