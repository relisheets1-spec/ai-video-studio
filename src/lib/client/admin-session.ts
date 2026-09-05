"use client";

export const ADMIN_SESSION_LOST_EVENT = "admin:session-lost";

/** fetch с cookie администратора. При 401 страница узнаёт через событие. */
export async function adminFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers || {});
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");

  const res = await fetch(input, { ...init, headers, credentials: "same-origin" });

  if (res.status === 401) {
    let error = "";
    try {
      error = (await res.clone().json())?.error || "";
    } catch {}
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(ADMIN_SESSION_LOST_EVENT, { detail: { error } }));
    }
  }

  return res;
}

export async function adminLogout(everywhere = false): Promise<void> {
  try {
    await fetch(`/api/admin/session${everywhere ? "?all=1" : ""}`, {
      method: "DELETE",
      credentials: "same-origin",
    });
  } catch {
    // Выход всё равно очистит страницу.
  }
}
