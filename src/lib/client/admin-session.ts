"use client";

export const ADMIN_TOKEN_KEY = "admin_session_v2";
export const ADMIN_SESSION_LOST_EVENT = "admin:session-lost";

function storage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function getAdminToken(): string | null {
  return storage()?.getItem(ADMIN_TOKEN_KEY) ?? null;
}

export function setAdminToken(token: string): void {
  storage()?.setItem(ADMIN_TOKEN_KEY, token);
}

export function clearAdminToken(): void {
  storage()?.removeItem(ADMIN_TOKEN_KEY);
}

/** fetch с админ-токеном. При 401 сессия сбрасывается, страница узнаёт через событие. */
export async function adminFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const token = getAdminToken();
  const headers = new Headers(init.headers || {});
  if (token) headers.set("x-admin-token", token);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");

  const res = await fetch(input, { ...init, headers });

  if (res.status === 401) {
    let error = "";
    try {
      error = (await res.clone().json())?.error || "";
    } catch {}
    clearAdminToken();
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(ADMIN_SESSION_LOST_EVENT, { detail: { error } }));
    }
  }

  return res;
}
