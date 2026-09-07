import crypto from "node:crypto";
import { all, get, nowIso, run } from "./db";
import { safeEqualString } from "./crypto";

/**
 * Коды доступа — единственный «пароль» пользователя.
 *
 * Администратор создаёт код в панели (случайный KZ-XXXX-XXXX или свой),
 * передаёт человеку любым способом. Тот вводит почту и код: при первом входе
 * код навсегда привязывается к этой почте и заводится аккаунт, дальше та же
 * пара «почта + код» открывает студию. Писем в схеме нет.
 */

/** Без похожих друг на друга символов: 0/O, 1/I, 5/S. */
const ALPHABET = "ABCDEFGHJKLMNPQRTUVWXYZ2346789";
const CODE_RE = /^[A-Z0-9-]{6,32}$/;

function block(size: number): string {
  let out = "";
  const bytes = crypto.randomBytes(size);
  for (let i = 0; i < size; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

export function generateCode(): string {
  return `KZ-${block(4)}-${block(4)}`;
}

/** Код сравнивается без учёта регистра и пробелов. */
export function normalizeCode(raw: unknown): string {
  return typeof raw === "string" ? raw.trim().toUpperCase().replace(/\s+/g, "") : "";
}

export function isValidCodeFormat(code: string): boolean {
  return CODE_RE.test(code);
}

export interface AccessCodeRow {
  code: string;
  email: string | null;
  note: string | null;
  created_at: string;
  used_at: string | null;
  revoked_at: string | null;
}

export function listCodes(): AccessCodeRow[] {
  return all<AccessCodeRow>("SELECT * FROM access_codes ORDER BY created_at DESC");
}

export function findCode(code: string): AccessCodeRow | null {
  return get<AccessCodeRow>("SELECT * FROM access_codes WHERE code = ?", code);
}

export function findCodeByEmail(email: string): AccessCodeRow | null {
  return get<AccessCodeRow>("SELECT * FROM access_codes WHERE email = ?", email);
}

export type CreateResult = { ok: true; row: AccessCodeRow } | { ok: false; error: string };

/** Новый код: свой (если задан и свободен) или случайный. */
export function createCode(custom: string | null, note: string | null, email: string | null = null): CreateResult {
  let code = custom ? normalizeCode(custom) : "";
  if (code) {
    if (!isValidCodeFormat(code)) return { ok: false, error: "Код: 6–32 символа, латиница, цифры и дефис" };
    if (findCode(code)) return { ok: false, error: "Такой код уже есть" };
  } else {
    do code = generateCode();
    while (findCode(code));
  }
  run(
    "INSERT INTO access_codes (code, email, note, created_at) VALUES (?, ?, ?, ?)",
    code,
    email,
    note ? note.slice(0, 120) : null,
    nowIso()
  );
  return { ok: true, row: findCode(code)! };
}

/** Отзыв: код перестаёт открывать вход, привязка к почте остаётся для истории. */
export function revokeCode(code: string): boolean {
  return run("UPDATE access_codes SET revoked_at = ? WHERE code = ? AND revoked_at IS NULL", nowIso(), code).changes > 0;
}

export function deleteCode(code: string): boolean {
  return run("DELETE FROM access_codes WHERE code = ?", code).changes > 0;
}

/**
 * Заменить код пользователю: старый отзывается, новый сразу привязан к его
 * почте — прежняя пара «почта + код» больше не работает.
 */
export function rotateCodeFor(email: string): AccessCodeRow {
  run("UPDATE access_codes SET revoked_at = ? WHERE email = ? AND revoked_at IS NULL", nowIso(), email);
  // Освобождаем почту у отозванных кодов: UNIQUE(email) допускает одну живую привязку.
  run("UPDATE access_codes SET email = NULL, note = COALESCE(note, '') || ' (заменён для ' || ? || ')' WHERE email = ?", email, email);
  const created = createCode(null, null, email);
  if (!created.ok) throw new Error(created.error);
  run("UPDATE access_codes SET used_at = ? WHERE code = ?", nowIso(), created.row.code);
  return created.row;
}

export type CheckResult =
  | { ok: true; row: AccessCodeRow; firstUse: boolean }
  | { ok: false; error: string };

/**
 * Проверка пары «почта + код». Свободный код привязывается к почте, занятый
 * подходит только своей почте. Сравнение кода — за постоянное время.
 */
export function checkAccess(email: string, rawCode: unknown): CheckResult {
  const code = normalizeCode(rawCode);
  if (!code) return { ok: false, error: "Введите код доступа" };
  const row = findCode(code);
  if (!row || !safeEqualString(row.code, code) || row.revoked_at) {
    return { ok: false, error: "Неверная почта или код доступа" };
  }
  if (row.email && row.email !== email) return { ok: false, error: "Неверная почта или код доступа" };

  if (!row.email) {
    // Первый вход: код становится пропуском этой почты.
    const taken = findCodeByEmail(email);
    if (taken && taken.code !== code && !taken.revoked_at) {
      return { ok: false, error: "У этой почты уже есть свой код доступа" };
    }
    run("UPDATE access_codes SET email = ?, used_at = ? WHERE code = ?", email, nowIso(), code);
    return { ok: true, row: findCode(code)!, firstUse: true };
  }
  return { ok: true, row, firstUse: false };
}
