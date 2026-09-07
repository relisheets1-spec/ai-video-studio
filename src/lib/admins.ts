import { all, nowIso, run } from "./db";
import { ADMIN_EMAIL } from "./env";
import type { AdminInfo } from "./types";

export type { AdminInfo };

/**
 * Дополнительные администраторы. Главный — ADMIN_EMAIL из настроек сервера,
 * его из панели не снять. Все входят одним кодом администратора.
 */

interface AdminRow {
  email: string;
  added_by: string | null;
  created_at: string;
}

export function listAdmins(): AdminInfo[] {
  const list: AdminInfo[] = ADMIN_EMAIL ? [{ email: ADMIN_EMAIL, isPrimary: true, addedBy: null, createdAt: null }] : [];
  for (const row of all<AdminRow>("SELECT * FROM admins ORDER BY created_at ASC")) {
    if (row.email === ADMIN_EMAIL) continue;
    list.push({ email: row.email, isPrimary: false, addedBy: row.added_by, createdAt: row.created_at });
  }
  return list;
}

export type AdminOpResult = { ok: true } | { ok: false; error: string; status: number };

export function addAdmin(email: string, addedBy: string): AdminOpResult {
  if (listAdmins().some((a) => a.email === email)) return { ok: false, error: "Этот адрес уже администратор", status: 409 };
  run("INSERT INTO admins (email, added_by, created_at) VALUES (?, ?, ?)", email, addedBy, nowIso());
  return { ok: true };
}

export function removeAdmin(email: string, requester: string): AdminOpResult {
  if (email === ADMIN_EMAIL) return { ok: false, error: "Главного администратора можно сменить только в настройках сервера", status: 400 };
  if (email === requester) return { ok: false, error: "Себя снять нельзя", status: 400 };
  if (run("DELETE FROM admins WHERE email = ?", email).changes === 0) {
    return { ok: false, error: "Администратор не найден", status: 404 };
  }
  return { ok: true };
}
