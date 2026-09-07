import crypto from "node:crypto";
import { all, get, nowIso, run } from "./db";
import { MAX_SESSIONS } from "./env";

/**
 * Сессии (устройства) пользователя. Cookie несёт id сессии; на каждом запросе
 * строка сессии должна существовать. У пользователя не больше MAX_SESSIONS
 * сессий: при входе с лишнего устройства самая давняя по активности
 * удаляется, а её вкладка получает kick.
 */

export interface SessionRow {
  id: string;
  user_id: string;
  created_at: string;
  last_seen_at: string;
  device: string | null;
  ip: string | null;
}

/** «телефон · Chrome · Android» — из User-Agent, для списка устройств. */
export function deviceLabel(ua: string | null | undefined): string {
  const s = ua || "";
  const kind = /iPad|Tablet/.test(s) ? "планшет" : /Mobile|iPhone|Android/.test(s) ? "телефон" : "компьютер";
  const browser = /Edg\//.test(s)
    ? "Edge"
    : /OPR\//.test(s)
      ? "Opera"
      : /Chrome\//.test(s)
        ? "Chrome"
        : /Firefox\//.test(s)
          ? "Firefox"
          : /Safari\//.test(s)
            ? "Safari"
            : "";
  const os = /iPhone|iPad/.test(s)
    ? "iOS"
    : /Android/.test(s)
      ? "Android"
      : /Windows/.test(s)
        ? "Windows"
        : /Mac OS X/.test(s)
          ? "macOS"
          : /Linux/.test(s)
            ? "Linux"
            : "";
  return [kind, browser, os].filter(Boolean).join(" · ").slice(0, 60);
}

export function createSession(userId: string, device: string, ip: string | null): string {
  const id = crypto.randomBytes(18).toString("base64url");
  const now = nowIso();
  run(
    "INSERT INTO sessions (id, user_id, created_at, last_seen_at, device, ip) VALUES (?, ?, ?, ?, ?, ?)",
    id,
    userId,
    now,
    now,
    device || null,
    ip || null
  );
  return id;
}

/** Сессии сверх лимита (самые давние по активности) удаляются; возвращает их id для kick. */
export function enforceSessionLimit(userId: string): string[] {
  const rows = all<{ id: string }>(
    "SELECT id FROM sessions WHERE user_id = ? ORDER BY last_seen_at DESC, created_at DESC",
    userId
  );
  const extra = rows.slice(Math.max(1, MAX_SESSIONS)).map((r) => r.id);
  if (extra.length) run(`DELETE FROM sessions WHERE id IN (${extra.map(() => "?").join(",")})`, ...extra);
  return extra;
}

export function findSession(id: string): SessionRow | null {
  return get<SessionRow>("SELECT * FROM sessions WHERE id = ?", id);
}

/** Отметка активности — не чаще раза в минуту, чтобы не писать в базу на каждый запрос. */
export function touchSession(id: string): void {
  const minuteAgo = new Date(Date.now() - 60_000).toISOString();
  run("UPDATE sessions SET last_seen_at = ? WHERE id = ? AND last_seen_at < ?", nowIso(), id, minuteAgo);
}

export function deleteSession(id: string): void {
  run("DELETE FROM sessions WHERE id = ?", id);
}
