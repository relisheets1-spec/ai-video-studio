import { NextRequest, NextResponse } from "next/server";
import { signToken, verifyToken } from "./crypto";
import { COOKIE_SECURE } from "./env";
import { findSession, touchSession } from "./sessions";
import { findUserById, statusMessage, type UserRow } from "./users";

/**
 * Сессия пользователя студии — подписанный токен в HttpOnly-cookie.
 *
 * Токен живёт 30 дней, но сам по себе доступа не даёт: на каждом запросе
 * requireUser перечитывает строку пользователя, сверяет статус и эпоху и
 * проверяет, что сессия (устройство) ещё в списке. Блокировка, отзыв кода и
 * вытеснение лишнего устройства вступают в силу на следующем же запросе.
 */

const SESSION_COOKIE = "studio_session";
const PREFIX = "u1.";
const TTL_MS = 30 * 24 * 60 * 60 * 1000;

interface UserSessionPayload {
  sub: string;
  /** id строки в sessions — устройство. */
  sid: string;
  epoch: number;
  iat: number;
  exp: number;
}

export function signUserToken(userId: string, epoch: number, sid: string): string {
  const now = Date.now();
  return signToken(PREFIX, "user-session", { sub: userId, sid, epoch, iat: now, exp: now + TTL_MS });
}

function readToken(req: NextRequest): UserSessionPayload | null {
  const raw = req.cookies.get(SESSION_COOKIE)?.value;
  const payload = verifyToken<UserSessionPayload>(raw, PREFIX, "user-session");
  return payload && typeof payload.sub === "string" && payload.sub && typeof payload.sid === "string" && payload.sid
    ? payload
    : null;
}

/** id сессии из cookie (для выхода), без проверки пользователя. */
export function readSessionId(req: NextRequest): string | null {
  return readToken(req)?.sid ?? null;
}

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: COOKIE_SECURE,
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

const UNAUTHENTICATED = { error: "Требуется вход в студию", code: "unauthenticated" } as const;

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
): Promise<{ user: UserRow; sid: string } | { response: NextResponse }> {
  const payload = readToken(req);
  if (!payload) return { response: unauthenticated() };

  const user = findUserById(payload.sub);
  if (!user) return { response: unauthenticated() };

  // Устройство вытеснили, отозвали код или вышли — сессии в списке уже нет.
  const session = findSession(payload.sid);
  if (!session || session.user_id !== user.id) return { response: unauthenticated() };

  // Статус проверяется раньше эпохи: заблокированному честнее сказать, что
  // доступ закрыт, чем «сессия истекла».
  if (user.status !== "active") {
    return {
      response: NextResponse.json({ error: statusMessage(user.status), status: user.status }, { status: 403 }),
    };
  }

  if (user.session_epoch !== payload.epoch) return { response: unauthenticated() };

  touchSession(session.id);
  return { user, sid: session.id };
}

