import { all, getSetting, nowIso, run, setSetting } from "./db";
import { ADMIN_EMAILS } from "./env";
import type { AdminInfo } from "./types";

/**
 * Администраторы.
 *
 * Стартовый список — в переменной ADMIN_EMAILS: эти почты админы всегда,
 * их нельзя снять из панели. Остальных админы добавляют друг другу сами,
 * запись живёт в таблице admins. Паролей нет: вход по коду с почты.
 */

const EPOCH_KEY = "admin_session_epoch";

export function isPrimaryAdmin(email: string): boolean {
  return ADMIN_EMAILS.includes(email);
}

interface AdminRow {
  email: string;
  added_by: string | null;
  created_at: string;
}

export function getAdmin(email: string): AdminInfo | null {
  if (isPrimaryAdmin(email)) return { email, isPrimary: true, addedBy: null, createdAt: null };
  const row = all<AdminRow>("SELECT * FROM admins WHERE email = ?", email)[0];
  return row ? { email: row.email, isPrimary: false, addedBy: row.added_by, createdAt: row.created_at } : null;
}

export function listAdmins(): AdminInfo[] {
  const rows = all<AdminRow>("SELECT * FROM admins ORDER BY created_at ASC");
  const list: AdminInfo[] = ADMIN_EMAILS.map((email) => ({
    email,
    isPrimary: true,
    addedBy: null,
    createdAt: null,
  }));
  for (const row of rows) {
    if (isPrimaryAdmin(row.email)) continue;
    list.push({ email: row.email, isPrimary: false, addedBy: row.added_by, createdAt: row.created_at });
  }
  return list;
}

export type AdminOpResult = { ok: true } | { ok: false; error: string; status: number };

export function addAdmin(email: string, addedBy: string): AdminOpResult {
  if (getAdmin(email)) return { ok: false, error: "Этот адрес уже администратор", status: 409 };
  run("INSERT INTO admins (email, added_by, created_at) VALUES (?, ?, ?)", email, addedBy, nowIso());
  return { ok: true };
}

export function removeAdmin(email: string, requester: string): AdminOpResult {
  const info = getAdmin(email);
  if (!info) return { ok: false, error: "Администратор не найден", status: 404 };
  if (info.isPrimary) {
    return { ok: false, error: "Этот админ задан в настройках сервера — снять его можно только там", status: 400 };
  }
  if (email === requester) return { ok: false, error: "Себя снять нельзя", status: 400 };
  run("DELETE FROM admins WHERE email = ?", email);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Эпоха: «выйти везде» гасит все выданные админ-сессии разом
// ---------------------------------------------------------------------------

export function getAdminEpoch(): number {
  const n = Number(getSetting(EPOCH_KEY));
  return Number.isFinite(n) && n > 0 ? n : 1;
}

export function bumpAdminEpoch(): number {
  const next = getAdminEpoch() + 1;
  setSetting(EPOCH_KEY, String(next));
  return next;
}
