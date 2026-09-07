import crypto from "node:crypto";
import { ADMIN_EMAIL } from "./env";
import { all, get, nowIso, run } from "./db";
import type { AccessStatus, AdminUserView, StudioUser } from "./types";

/** Строка таблицы users как она лежит в базе. */
export interface UserRow {
  id: string;
  email: string;
  status: AccessStatus;
  elevenlabs_key_enc: string | null;
  openai_key_enc: string | null;
  session_epoch: number;
  created_at: string;
  last_login_at: string | null;
}

export function findUserByEmail(email: string): UserRow | null {
  return get<UserRow>("SELECT * FROM users WHERE email = ?", email);
}

export function findUserById(id: string): UserRow | null {
  return get<UserRow>("SELECT * FROM users WHERE id = ?", id);
}

/** Аккаунт заводится в момент первого входа по коду доступа. */
export function ensureUser(email: string): UserRow {
  const existing = findUserByEmail(email);
  if (existing) return existing;
  const id = crypto.randomUUID();
  run("INSERT INTO users (id, email, status, session_epoch, created_at) VALUES (?, ?, 'active', 1, ?)", id, email, nowIso());
  return findUserById(id)!;
}

export function toPublicUser(row: UserRow): StudioUser {
  return {
    id: row.id,
    email: row.email,
    status: row.status,
    hasElevenLabsKey: !!row.elevenlabs_key_enc,
    hasOpenAiKey: !!row.openai_key_enc,
  };
}

export function statusMessage(status: AccessStatus): string {
  return status === "blocked" ? "Доступ закрыт администратором." : "";
}

// ---------------------------------------------------------------------------
// Изменения
// ---------------------------------------------------------------------------

/** Блокировка гасит выданные сессии: эпоха в токене перестаёт совпадать. */
/** Погасить все сессии пользователя: старые cookie перестают подходить. */
export function revokeSessions(id: string): void {
  run("UPDATE users SET session_epoch = session_epoch + 1 WHERE id = ?", id);
  run("DELETE FROM sessions WHERE user_id = ?", id);
}

export function blockUser(id: string): void {
  run("UPDATE users SET status = 'blocked', session_epoch = session_epoch + 1 WHERE id = ?", id);
  run("DELETE FROM sessions WHERE user_id = ?", id);
}

export function unblockUser(id: string): void {
  run("UPDATE users SET status = 'active' WHERE id = ?", id);
}

export function setElevenLabsKey(id: string, encrypted: string | null): void {
  run("UPDATE users SET elevenlabs_key_enc = ? WHERE id = ?", encrypted, id);
}

export function setOpenAiKey(id: string, encrypted: string | null): void {
  run("UPDATE users SET openai_key_enc = ? WHERE id = ?", encrypted, id);
}

export function touchLogin(id: string): void {
  run("UPDATE users SET last_login_at = ? WHERE id = ?", nowIso(), id);
}

export function deleteUser(id: string): void {
  const row = findUserById(id);
  run("DELETE FROM video_generations WHERE user_id = ?", id);
  run("DELETE FROM sessions WHERE user_id = ?", id);
  if (row) run("DELETE FROM access_codes WHERE email = ?", row.email);
  run("DELETE FROM users WHERE id = ?", id);
}

// ---------------------------------------------------------------------------
// Таблица для админки
// ---------------------------------------------------------------------------

interface UserListRow extends UserRow {
  devices: number;
  videos_count: number;
  code: string | null;
}

export function listUsers(): AdminUserView[] {
  const rows = all<UserListRow>(`
    SELECT u.*,
           (SELECT COUNT(*) FROM video_generations v WHERE v.user_id = u.id AND v.status = 'completed') AS videos_count,
           (SELECT COUNT(*) FROM sessions s WHERE s.user_id = u.id) AS devices,
           c.code       AS code
      FROM users u
      LEFT JOIN access_codes c ON c.email = u.email
     WHERE u.email <> ? AND u.email NOT IN (SELECT email FROM admins)
     ORDER BY u.created_at DESC
  `, ADMIN_EMAIL || "");

  return rows.map((row) => ({
    ...toPublicUser(row),
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
    videosCount: Number(row.videos_count) || 0,
    devices: Number(row.devices) || 0,
    code: row.code || null,
  }));
}
