import crypto from "node:crypto";
import type { NextRequest } from "next/server";

/**
 * Раньше проверка администратора выглядела так:
 *
 *   if (token && token.startsWith("ai_video_admin_session_")) return true;
 *
 * Токен не подписывался, не хранился и не сверялся, поэтому любой запрос с
 * этим заголовком получал полный доступ на чтение и запись ко всем записям
 * пользователей, включая удаление. Теперь токен подписан HMAC на
 * ADMIN_SECRET_KEY и имеет срок жизни.
 */

const PREFIX = "ai_video_admin_session_";
const TTL_MS = 12 * 60 * 60 * 1000;

function secret(): string {
  const key = process.env.ADMIN_SECRET_KEY;
  if (!key) {
    // Пустой секрет означал бы, что подпись подделывается тривиально.
    throw new Error("ADMIN_SECRET_KEY не задан — вход в админ-панель отключён");
  }
  return key;
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", secret()).update(payload).digest("hex");
}

export function signAdminToken(): string {
  const payload = String(Date.now() + TTL_MS);
  return `${PREFIX}${payload}.${sign(payload)}`;
}

export function verifyAdminToken(req: NextRequest): boolean {
  const header =
    req.headers.get("x-admin-token") ||
    req.headers.get("authorization")?.replace("Bearer ", "") ||
    "";

  if (!header.startsWith(PREFIX)) return false;

  const [payload, signature] = header.slice(PREFIX.length).split(".");
  if (!payload || !signature) return false;

  let expected: string;
  try {
    expected = sign(payload);
  } catch {
    return false;
  }

  const a = Buffer.from(signature, "hex");
  const b = Buffer.from(expected, "hex");
  // Сравнение с постоянным временем: обычное === утекает длину совпадения.
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;

  const expiresAt = Number(payload);
  return Number.isFinite(expiresAt) && Date.now() < expiresAt;
}

/** Единый ответ на неавторизованный запрос. */
export const UNAUTHORIZED = {
  error: "Доступ запрещен: требуется авторизация администратора",
} as const;
