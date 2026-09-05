import { NextRequest, NextResponse } from "next/server";
import { signToken, verifyToken } from "./crypto";
import { IS_PROD } from "./env";
import { findUserById, statusMessage, type UserRow } from "./users";

/**
 * Сессия пользователя студии — подписанный токен в HttpOnly-cookie.
 *
 * Токен живёт 30 дней, но сам по себе доступа не даёт: на каждом запросе
 * requireUser перечитывает строку пользователя и сверяет статус и эпоху.
 * Блокировка вступает в силу на следующем же запросе.
 */

export const SESSION_COOKIE = "studio_session";
const PREFIX = "u1.";
const TTL_MS = 30 * 24 * 60 * 60 * 1000;

interface UserSessionPayload {
  sub: string;
  epoch: number;
  iat: number;
  exp: number;
}

export function signUserToken(userId: string, epoch: number): string {
  const now = Date.now();
  return signToken(PREFIX, "user-session", { sub: userId, epoch, iat: now, exp: now + TTL_MS });
}

function readToken(req: NextRequest): UserSessionPayload | null {
  const raw = req.cookies.get(SESSION_COOKIE)?.value;
  const payload = verifyToken<UserSessionPayload>(raw, PREFIX, "user-session");
  return payload && typeof payload.sub === "string" && payload.sub ? payload : null;
}

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: IS_PROD,
  path: "/",
};

export function setSessionCookie(res: NextResponse, token: string): NextResponse {
  res.cookies.set(SESSION_COOKIE, token, { ...cookieOptions, maxAge: Math.floor(TTL_MS / 1000) });
  return res;
}

export function clearSessionCookie(res: NextResponse): NextResponse {
  res.cookies.set(SESSION_COOKIE, "", { ...cookieOptions, maxAge: 0 });
  return res;
}

export const UNAUTHENTICATED = { error: "Требуется вход в студию", code: "unauthenticated" } as const;

/** Ответ 401 со сброшенной cookie: битую сессию незачем таскать дальше. */
function unauthenticated(): NextResponse {
  return clearSessionCookie(NextResponse.json(UNAUTHENTICATED, { status: 401 }));
}

/**
 * Проверка сессии и актуального состояния аккаунта. Возвращает либо свежую
 * строку пользователя, либо готовый ответ 401/403.
 */
export async function requireUser(
  req: NextRequest
): Promise<{ user: UserRow } | { response: NextResponse }> {
  const payload = readToken(req);
  if (!payload) return { response: unauthenticated() };

  const user = findUserById(payload.sub);
  if (!user) return { response: unauthenticated() };

  // Статус проверяется раньше эпохи: заблокированному честнее сказать, что
  // доступ закрыт, чем «сессия истекла».
  if (user.status !== "approved") {
    return {
      response: NextResponse.json({ error: statusMessage(user.status), status: user.status }, { status: 403 }),
    };
  }

  if (user.session_epoch !== payload.epoch) return { response: unauthenticated() };

  return { user };
}

export { toPublicUser } from "./users";
