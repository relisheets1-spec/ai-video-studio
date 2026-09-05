import crypto from "node:crypto";
import { all, get, nowIso, run } from "./db";
import { hmacHex, safeEqualHex } from "./crypto";

/**
 * Коды приглашения и коды входа.
 *
 * Коды входа хранятся только хэшем (HMAC на SESSION_SECRET): даже с базой в
 * руках чужой код не подобрать. Живут 10 минут, 5 попыток, не чаще одного
 * в минуту на почту.
 */

export type CodeScope = "user" | "admin";

export const LOGIN_CODE_TTL_MS = 10 * 60 * 1000;
export const LOGIN_CODE_MAX_ATTEMPTS = 5;
export const LOGIN_CODE_COOLDOWN_MS = 60 * 1000;
export const INVITE_TTL_DAYS = 7;

// ---------------------------------------------------------------------------
// Коды приглашения: KZ-XXXX-XXXX, привязаны к почте, одноразовые, 7 дней
// ---------------------------------------------------------------------------

/** Без похожих друг на друга символов: 0/O, 1/I, 5/S. */
const INVITE_ALPHABET = "ABCDEFGHJKLMNPQRTUVWXYZ2346789";

function inviteBlock(size: number): string {
  let out = "";
  const bytes = crypto.randomBytes(size);
  for (let i = 0; i < size; i++) out += INVITE_ALPHABET[bytes[i] % INVITE_ALPHABET.length];
  return out;
}

export function normalizeInvite(raw: unknown): string {
  return typeof raw === "string" ? raw.trim().toUpperCase().replace(/\s+/g, "") : "";
}

export interface InviteRow {
  code: string;
  email: string;
  created_by: string | null;
  created_at: string;
  expires_at: string;
  used_at: string | null;
}

/** Выдаёт новый код и гасит прежние неиспользованные коды этой почты. */
export function issueInvite(email: string, createdBy: string): InviteRow {
  run("DELETE FROM invite_codes WHERE email = ? AND used_at IS NULL", email);

  const expires = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = `KZ-${inviteBlock(4)}-${inviteBlock(4)}`;
    try {
      run(
        "INSERT INTO invite_codes (code, email, created_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?)",
        code,
        email,
        createdBy,
        nowIso(),
        expires
      );
      return get<InviteRow>("SELECT * FROM invite_codes WHERE code = ?", code)!;
    } catch {
      // Совпадение кода — пробуем ещё раз.
    }
  }
  throw new Error("Не удалось создать код приглашения");
}

export function findInvite(email: string): InviteRow | null {
  return get<InviteRow>(
    "SELECT * FROM invite_codes WHERE email = ? ORDER BY created_at DESC LIMIT 1",
    email
  );
}

export type InviteCheck = { ok: true } | { ok: false; error: string };

/** Проверяет код и сразу его гасит: код одноразовый и только для своей почты. */
export function redeemInvite(email: string, rawCode: string): InviteCheck {
  const code = normalizeInvite(rawCode);
  if (!code) return { ok: false, error: "Введите код приглашения" };

  const row = get<InviteRow>("SELECT * FROM invite_codes WHERE code = ?", code);
  if (!row || row.email !== email) return { ok: false, error: "Код приглашения не подходит к этой почте" };
  if (row.used_at) return { ok: false, error: "Код приглашения уже использован" };
  if (Date.parse(row.expires_at) < Date.now()) return { ok: false, error: "Срок действия кода истёк — попросите новый" };

  const res = run("UPDATE invite_codes SET used_at = ? WHERE code = ? AND used_at IS NULL", nowIso(), code);
  if (res.changes !== 1) return { ok: false, error: "Код приглашения уже использован" };
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Коды входа на почту: 6 цифр
// ---------------------------------------------------------------------------

interface LoginCodeRow {
  id: number;
  email: string;
  scope: CodeScope;
  code_hash: string;
  attempts: number;
  created_at: string;
  expires_at: string;
  consumed_at: string | null;
  ip: string | null;
}

function hashCode(email: string, scope: CodeScope, code: string): string {
  return hmacHex("login-code", `${scope}\0${email}\0${code}`);
}

export type IssueResult =
  | { ok: true; code: string; expiresAt: string }
  | { ok: false; retryAfterSec: number };

/** Новый код входа. Прежние коды этой почты гасятся, чтобы работал только последний. */
export function issueLoginCode(email: string, scope: CodeScope, ip: string | null): IssueResult {
  const last = get<LoginCodeRow>(
    "SELECT * FROM login_codes WHERE email = ? AND scope = ? ORDER BY id DESC LIMIT 1",
    email,
    scope
  );
  if (last && !last.consumed_at) {
    const age = Date.now() - Date.parse(last.created_at);
    if (age < LOGIN_CODE_COOLDOWN_MS) {
      return { ok: false, retryAfterSec: Math.ceil((LOGIN_CODE_COOLDOWN_MS - age) / 1000) };
    }
  }

  run("UPDATE login_codes SET consumed_at = ? WHERE email = ? AND scope = ? AND consumed_at IS NULL", nowIso(), email, scope);

  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  const expiresAt = new Date(Date.now() + LOGIN_CODE_TTL_MS).toISOString();
  run(
    "INSERT INTO login_codes (email, scope, code_hash, attempts, created_at, expires_at, ip) VALUES (?, ?, ?, 0, ?, ?, ?)",
    email,
    scope,
    hashCode(email, scope, code),
    nowIso(),
    expiresAt,
    ip
  );
  return { ok: true, code, expiresAt };
}

export type VerifyResult = { ok: true } | { ok: false; error: string; attemptsLeft?: number };

export function verifyLoginCode(email: string, scope: CodeScope, rawCode: unknown): VerifyResult {
  const code = typeof rawCode === "string" ? rawCode.replace(/\D/g, "") : "";
  if (code.length !== 6) return { ok: false, error: "Код состоит из 6 цифр" };

  const row = get<LoginCodeRow>(
    "SELECT * FROM login_codes WHERE email = ? AND scope = ? AND consumed_at IS NULL ORDER BY id DESC LIMIT 1",
    email,
    scope
  );
  if (!row) return { ok: false, error: "Код не запрашивался или уже использован — запросите новый" };
  if (Date.parse(row.expires_at) < Date.now()) {
    run("UPDATE login_codes SET consumed_at = ? WHERE id = ?", nowIso(), row.id);
    return { ok: false, error: "Срок действия кода истёк — запросите новый" };
  }
  if (row.attempts >= LOGIN_CODE_MAX_ATTEMPTS) {
    run("UPDATE login_codes SET consumed_at = ? WHERE id = ?", nowIso(), row.id);
    return { ok: false, error: "Слишком много попыток — запросите новый код" };
  }

  if (!safeEqualHex(row.code_hash, hashCode(email, scope, code))) {
    run("UPDATE login_codes SET attempts = attempts + 1 WHERE id = ?", row.id);
    const left = LOGIN_CODE_MAX_ATTEMPTS - (row.attempts + 1);
    return {
      ok: false,
      error: left > 0 ? `Неверный код. Осталось попыток: ${left}.` : "Слишком много попыток — запросите новый код",
      attemptsLeft: Math.max(0, left),
    };
  }

  run("UPDATE login_codes SET consumed_at = ? WHERE id = ?", nowIso(), row.id);
  return { ok: true };
}

/** Уборка просроченных кодов — вызывается уборщиком раз в сутки. */
export function purgeExpiredCodes(): number {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const codes = run("DELETE FROM login_codes WHERE expires_at < ?", cutoff);
  const invites = run("DELETE FROM invite_codes WHERE used_at IS NOT NULL AND used_at < ?", cutoff);
  return codes.changes + invites.changes;
}

/** Активные приглашения — для таблицы в админке. */
export function listInvites(): InviteRow[] {
  return all<InviteRow>("SELECT * FROM invite_codes ORDER BY created_at DESC LIMIT 200");
}
