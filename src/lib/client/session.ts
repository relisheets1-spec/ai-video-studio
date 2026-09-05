"use client";

import type { StudioUser } from "@/lib/types";

/**
 * Сессия студии в браузере.
 *
 * Токена в localStorage больше нет: сессия живёт в HttpOnly-cookie, которую
 * ставит сервер, а страница просто спрашивает /api/auth/session. Из хранилища
 * браузера её не украсть скриптом, и «выйти» тоже решает сервер.
 */

export const SESSION_LOST_EVENT = "studio:session-lost";

export interface SessionLostDetail {
  status?: string;
  error?: string;
}

function dispatchSessionLost(detail: SessionLostDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<SessionLostDetail>(SESSION_LOST_EVENT, { detail }));
}

/** Статусы, при которых сессия студии теряет смысл. */
const LOST_STATUSES = new Set(["pending", "invited", "rejected", "blocked"]);

/**
 * fetch с cookie сессии. При 401 или 403 со статусом аккаунта страница
 * узнаёт об этом через событие и возвращается к форме входа.
 */
export async function authFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers || {});
  // FormData (загрузка референса) должна уйти как multipart — браузер сам ставит boundary.
  const isForm = typeof FormData !== "undefined" && init.body instanceof FormData;
  if (init.body && !isForm && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");

  const res = await fetch(input, { ...init, headers, credentials: "same-origin" });

  if (res.status === 401 || res.status === 403) {
    let data: any = null;
    try {
      data = await res.clone().json();
    } catch {}
    if (res.status === 401 || (data && LOST_STATUSES.has(String(data.status)))) {
      dispatchSessionLost({ status: data?.status, error: data?.error });
    }
  }

  return res;
}

/** Профиль по cookie. null — сессии нет. */
export async function fetchSession(): Promise<StudioUser | null> {
  try {
    const res = await fetch("/api/auth/session", { credentials: "same-origin" });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.user ?? null;
  } catch {
    return null;
  }
}

export async function logout(): Promise<void> {
  try {
    await fetch("/api/auth/session", { method: "DELETE", credentials: "same-origin" });
  } catch {
    // Даже если запрос не дошёл, страница всё равно вернётся к форме входа.
  }
}
