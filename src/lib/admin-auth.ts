import { NextRequest, NextResponse } from "next/server";
import { get, getSetting, setSetting } from "./db";
import { signToken, verifySecret, verifyToken } from "./crypto";
import { ADMIN_CODE_HASH, ADMIN_EMAIL, COOKIE_SECURE } from "./env";

/**
 * Администраторы: ADMIN_EMAIL из настроек сервера плюс почты из таблицы
 * admins. Код входа общий, в настройках лежит только его scrypt-хэш
 * (ADMIN_CODE_HASH).
 * Сессия: подписанный токен в HttpOnly-cookie на 12 часов с эпохой
 * («выйти везде» сдвигает эпоху и гасит все выданные cookie).
 */

const ADMIN_COOKIE = "admin_session";
const PREFIX = "a1.";
const TTL_MS = 12 * 60 * 60 * 1000;
const EPOCH_KEY = "admin_session_epoch";

interface AdminSessionPayload {
  email: string;
  epoch: number;
  iat: number;
  exp: number;
}

/** Главный админ — из настроек сервера; остальных он добавляет в панели. Код у всех один. */
export function isAdminEmail(email: string | null): boolean {
  if (!email) return false;
  if (ADMIN_EMAIL && email === ADMIN_EMAIL) return true;
  return !!get("SELECT 1 AS x FROM admins WHERE email = ?", email);
}

/**
 * Код сверяется с хэшем за постоянное время. Нет хэша — вход закрыт.
 * scrypt здесь намеренно медленный (~50 мс): перебор дорог даже офлайн.
 */
export function checkAdminCode(code: unknown): boolean {
  if (!ADMIN_CODE_HASH || typeof code !== "string" || code.length > 200) return false;
  return verifySecret(code.trim(), ADMIN_CODE_HASH);
}

function getAdminEpoch(): number {
  const n = Number(getSetting(EPOCH_KEY));
  return Number.isFinite(n) && n > 0 ? n : 1;
}

export function bumpAdminEpoch(): number {
  const next = getAdminEpoch() + 1;
  setSetting(EPOCH_KEY, String(next));
  return next;
}

export function signAdminToken(email: string): string {
  const now = Date.now();
  return signToken(PREFIX, "admin-session", { email, epoch: getAdminEpoch(), iat: now, exp: now + TTL_MS });
}

// Strict: cookie администратора не уходит ни по какой ссылке с чужого сайта.
const cookieOptions = {
  httpOnly: true,
  sameSite: "strict" as const,
  secure: COOKIE_SECURE,
  path: "/",
};

export function setAdminCookie(res: NextResponse, token: string): NextResponse {
  res.cookies.set(ADMIN_COOKIE, token, { ...cookieOptions, maxAge: Math.floor(TTL_MS / 1000) });
  return res;
}

export function clearAdminCookie(res: NextResponse): NextResponse {
  res.cookies.set(ADMIN_COOKIE, "", { ...cookieOptions, maxAge: 0 });
  return res;
}

const UNAUTHORIZED = { error: "Требуется вход администратора" } as const;

function readAdminSession(req: NextRequest): { email: string; exp: number } | null {
  const raw = req.cookies.get(ADMIN_COOKIE)?.value;
  const payload = verifyToken<AdminSessionPayload>(raw, PREFIX, "admin-session");
  if (!payload?.email || !isAdminEmail(payload.email) || payload.epoch !== getAdminEpoch()) return null;
  return { email: payload.email, exp: payload.exp };
}

export async function requireAdmin(
  req: NextRequest
): Promise<{ admin: { email: string }; expiresAt: number } | { response: NextResponse }> {
  const session = readAdminSession(req);
  if (!session) return { response: clearAdminCookie(NextResponse.json(UNAUTHORIZED, { status: 401 })) };
  return { admin: { email: session.email }, expiresAt: session.exp };
}
