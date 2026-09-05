import { NextRequest, NextResponse } from "next/server";
import { hmacHex, safeEqualHex, safeEqualString } from "./crypto";
import { IS_PROD, SITE_PASSWORD } from "./env";

/**
 * Общая заглушка сайта (переменная SITE_PASSWORD).
 *
 * Это не замок, а занавес: закрывает формы заявки и входа от случайных
 * посетителей и ботов, пока идёт тест. Пустая переменная — заглушки нет.
 */

export const SITE_COOKIE = "site_gate";

export function siteLockEnabled(): boolean {
  return SITE_PASSWORD.length > 0;
}

function siteToken(): string {
  return hmacHex("site-gate", SITE_PASSWORD);
}

export function checkSitePassword(input: unknown): boolean {
  return typeof input === "string" && safeEqualString(input.trim(), SITE_PASSWORD);
}

export function siteUnlocked(req: NextRequest): boolean {
  if (!siteLockEnabled()) return true;
  const raw = req.cookies.get(SITE_COOKIE)?.value || "";
  try {
    return safeEqualHex(raw, siteToken());
  } catch {
    return false;
  }
}

export function setSiteCookie(res: NextResponse): NextResponse {
  res.cookies.set(SITE_COOKIE, siteToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: IS_PROD,
    path: "/",
    maxAge: 30 * 24 * 60 * 60,
  });
  return res;
}

/** Готовый отказ для роутов, закрытых заглушкой. */
export function siteLockedResponse(): NextResponse {
  return NextResponse.json({ error: "Сайт закрыт паролем", code: "site_locked" }, { status: 403 });
}
