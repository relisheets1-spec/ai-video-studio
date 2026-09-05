import { NextRequest, NextResponse } from "next/server";
import { signToken, verifyToken } from "./crypto";
import { getAdmin, getAdminEpoch } from "./admins";
import { IS_PROD } from "./env";
import type { AdminInfo } from "./types";

/**
 * Сессия администратора: подписанный токен с почтой, сроком и эпохой в
 * HttpOnly-cookie. На каждом запросе почта сверяется со списком админов
 * (снятый админ отваливается сразу), а эпоха — с текущей («выйти везде»).
 */

export const ADMIN_COOKIE = "admin_session";
const PREFIX = "a1.";
const TTL_MS = 12 * 60 * 60 * 1000;

export interface AdminSessionPayload {
  email: string;
  epoch: number;
  iat: number;
  exp: number;
}

export function signAdminToken(email: string, epoch: number): string {
  const now = Date.now();
  return signToken(PREFIX, "admin-session", { email, epoch, iat: now, exp: now + TTL_MS });
}

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: IS_PROD,
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

export const UNAUTHORIZED = { error: "Требуется вход администратора" } as const;

export async function requireAdmin(
  req: NextRequest
): Promise<{ admin: AdminInfo; payload: AdminSessionPayload } | { response: NextResponse }> {
  const raw = req.cookies.get(ADMIN_COOKIE)?.value;
  const payload = verifyToken<AdminSessionPayload>(raw, PREFIX, "admin-session");
  if (!payload?.email) {
    return { response: clearAdminCookie(NextResponse.json(UNAUTHORIZED, { status: 401 })) };
  }

  const admin = getAdmin(payload.email);
  if (!admin || payload.epoch !== getAdminEpoch()) {
    return { response: clearAdminCookie(NextResponse.json(UNAUTHORIZED, { status: 401 })) };
  }

  return { admin, payload };
}

export const ADMIN_SESSION_TTL_MS = TTL_MS;
