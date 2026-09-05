import crypto from "node:crypto";
import { all, get, nowIso, run } from "./db";
import type { AccessStatus, AdminUserView, StudioUser } from "./types";

/** Строка таблицы users как она лежит в базе. */
export interface UserRow {
  id: string;
  email: string;
  status: AccessStatus;
  generations_limit: number;
  generations_used: number;
  elevenlabs_key_enc: string | null;
  session_epoch: number;
  note: string | null;
  created_at: string;
  approved_at: string | null;
  registered_at: string | null;
  last_login_at: string | null;
}

export function findUserByEmail(email: string): UserRow | null {
  return get<UserRow>("SELECT * FROM users WHERE email = ?", email);
}

export function findUserById(id: string): UserRow | null {
  return get<UserRow>("SELECT * FROM users WHERE id = ?", id);
}

/** Заявка на доступ. Повторная заявка с той же почты ничего не ломает. */
export function createRequest(email: string): UserRow {
  const existing = findUserByEmail(email);
  if (existing) return existing;
  const id = crypto.randomUUID();
  run(
    "INSERT INTO users (id, email, status, generations_limit, generations_used, session_epoch, created_at) " +
      "VALUES (?, ?, 'pending', 0, 0, 1, ?)",
    id,
    email,
    nowIso()
  );
  return findUserById(id)!;
}

export function toPublicUser(row: UserRow): StudioUser {
  const limit = row.generations_limit || 0;
  const used = row.generations_used || 0;
  return {
    id: row.id,
    email: row.email,
    status: row.status,
    remaining: Math.max(0, limit - used),
    generationsLimit: limit,
    generationsUsed: used,
    hasElevenLabsKey: !!row.elevenlabs_key_enc,
  };
}

export function statusMessage(status: AccessStatus): string {
  switch (status) {
    case "pending":
      return "Заявка ожидает одобрения администратора.";
    case "invited":
      return "Заявка одобрена — завершите регистрацию по коду приглашения.";
    case "rejected":
      return "Заявка отклонена администратором.";
    case "blocked":
      return "Доступ заблокирован администратором.";
    default:
      return "";
  }
}

// ---------------------------------------------------------------------------
// Изменения (все — из админки, кроме ключа и счётчика генераций)
// ---------------------------------------------------------------------------

export function setStatus(id: string, status: AccessStatus): void {
  run("UPDATE users SET status = ? WHERE id = ?", status, id);
}

/** Одобрение заявки: статус invited + стартовый лимит. Код приглашения выдаётся отдельно. */
export function markInvited(id: string, limit: number): void {
  run(
    "UPDATE users SET status = 'invited', generations_limit = MAX(generations_limit, ?), approved_at = ? WHERE id = ?",
    limit,
    nowIso(),
    id
  );
}

/** Регистрация завершена: код приглашения принят. */
export function markApproved(id: string): void {
  run(
    "UPDATE users SET status = 'approved', registered_at = COALESCE(registered_at, ?) WHERE id = ?",
    nowIso(),
    id
  );
}

/** Блокировка гасит выданные сессии: эпоха в токене перестаёт совпадать. */
export function blockUser(id: string): void {
  run("UPDATE users SET status = 'blocked', session_epoch = session_epoch + 1 WHERE id = ?", id);
}

export function unblockUser(id: string): void {
  const row = findUserById(id);
  if (!row) return;
  run("UPDATE users SET status = ? WHERE id = ?", row.registered_at ? "approved" : "invited", id);
}

export function setElevenLabsKey(id: string, encrypted: string | null): void {
  run("UPDATE users SET elevenlabs_key_enc = ? WHERE id = ?", encrypted, id);
}

export function addGenerations(id: string, amount: number): void {
  run("UPDATE users SET generations_limit = MAX(0, generations_limit + ?) WHERE id = ?", Math.round(amount), id);
}

/** Остаток = лимит − использовано, поэтому лимит = использовано + остаток. */
export function setBalance(id: string, remaining: number): void {
  run(
    "UPDATE users SET generations_limit = generations_used + ? WHERE id = ?",
    Math.max(0, Math.round(remaining)),
    id
  );
}

export function incrementUsed(id: string): number {
  run("UPDATE users SET generations_used = generations_used + 1 WHERE id = ?", id);
  return findUserById(id)?.generations_used ?? 0;
}

export function touchLogin(id: string): void {
  run("UPDATE users SET last_login_at = ? WHERE id = ?", nowIso(), id);
}

export function deleteUser(id: string): void {
  const row = findUserById(id);
  run("DELETE FROM video_generations WHERE user_id = ?", id);
  if (row) run("DELETE FROM invite_codes WHERE email = ?", row.email);
  run("DELETE FROM users WHERE id = ?", id);
}

// ---------------------------------------------------------------------------
// Таблица для админки
// ---------------------------------------------------------------------------

interface UserListRow extends UserRow {
  videos_count: number;
  invite_code: string | null;
  invite_expires_at: string | null;
  invite_used_at: string | null;
}

export function listUsers(): AdminUserView[] {
  const rows = all<UserListRow>(`
    SELECT u.*,
           (SELECT COUNT(*) FROM video_generations v WHERE v.user_id = u.id AND v.status = 'completed') AS videos_count,
           i.code       AS invite_code,
           i.expires_at AS invite_expires_at,
           i.used_at    AS invite_used_at
      FROM users u
      LEFT JOIN invite_codes i
             ON i.email = u.email
            AND i.created_at = (SELECT MAX(created_at) FROM invite_codes x WHERE x.email = u.email)
     ORDER BY u.created_at DESC
  `);

  return rows.map((row) => ({
    ...toPublicUser(row),
    createdAt: row.created_at,
    approvedAt: row.approved_at,
    registeredAt: row.registered_at,
    lastLoginAt: row.last_login_at,
    videosCount: Number(row.videos_count) || 0,
    invite: row.invite_code
      ? { code: row.invite_code, expiresAt: row.invite_expires_at!, usedAt: row.invite_used_at }
      : null,
  }));
}
