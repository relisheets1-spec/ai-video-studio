"use client";

import type { StudioUser } from "@/lib/types";

/**
 * Сессия студии в браузере: подписанный токен + кэш профиля.
 * Ключи с суффиксом v2 — чтобы старые неподписанные сессии не подхватились.
 */

export const STUDIO_TOKEN_KEY = "studio_session_v2";
export const STUDIO_USER_KEY = "studio_user_v2";

const LEGACY_KEYS = ["ai_video_auth_token", "ai_video_user", "elevenlabs_user_key", "ai_video_admin_token"];

export const SESSION_LOST_EVENT = "studio:session-lost";

export interface SessionLostDetail {
  status?: string;
  error?: string;
}

function storage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

/** Убирает сессии и ключи прежней схемы доступа. */
export function purgeLegacyStorage(): void {
  const s = storage();
  if (!s) return;
  for (const key of LEGACY_KEYS) s.removeItem(key);
}

export function getStudioToken(): string | null {
  return storage()?.getItem(STUDIO_TOKEN_KEY) ?? null;
}

export function getStoredUser(): StudioUser | null {
  try {
    const raw = storage()?.getItem(STUDIO_USER_KEY);
    return raw ? (JSON.parse(raw) as StudioUser) : null;
  } catch {
    return null;
  }
}

export function setStudioSession(token: string, user: StudioUser): void {
  const s = storage();
  if (!s) return;
  s.setItem(STUDIO_TOKEN_KEY, token);
  s.setItem(STUDIO_USER_KEY, JSON.stringify(user));
}

export function setStoredUser(user: StudioUser): void {
  storage()?.setItem(STUDIO_USER_KEY, JSON.stringify(user));
}

export function clearStudioSession(): void {
  const s = storage();
  if (!s) return;
  s.removeItem(STUDIO_TOKEN_KEY);
  s.removeItem(STUDIO_USER_KEY);
}

function dispatchSessionLost(detail: SessionLostDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<SessionLostDetail>(SESSION_LOST_EVENT, { detail }));
}

/** Статусы, при которых сессия студии теряет смысл. */
const LOST_STATUSES = new Set(["pending", "rejected", "frozen", "blocked", "invited"]);

/**
 * fetch с Bearer-токеном. При 401 или 403 со статусом аккаунта сессия
 * сбрасывается, а страница узнаёт об этом через событие.
 */
export async function authFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const token = getStudioToken();
  const headers = new Headers(init.headers || {});
  if (token) headers.set("Authorization", `Bearer ${token}`);
  // FormData (загрузка референса) должна уйти как multipart — браузер сам ставит boundary.
  const isForm = typeof FormData !== "undefined" && init.body instanceof FormData;
  if (init.body && !isForm && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");

  const res = await fetch(input, { ...init, headers });

  if (res.status === 401 || res.status === 403) {
    let data: any = null;
    try {
      data = await res.clone().json();
    } catch {}
    if (res.status === 401 || (data && LOST_STATUSES.has(String(data.status)))) {
      clearStudioSession();
      dispatchSessionLost({ status: data?.status, error: data?.error });
    }
  }

  return res;
}
