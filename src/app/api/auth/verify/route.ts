import { NextRequest, NextResponse } from "next/server";
import { verifyLoginCode } from "@/lib/access";
import { normalizeEmail } from "@/lib/env";
import { checkAttempts, getClientIp, recordAttempt } from "@/lib/security";
import { setSessionCookie, signUserToken } from "@/lib/session";
import { siteLockedResponse, siteUnlocked } from "@/lib/site-gate";
import { findUserByEmail, statusMessage, toPublicUser, touchLogin } from "@/lib/users";

/** Последний шаг: шестизначный код с почты — и сессия на 30 дней. */
export async function POST(req: NextRequest) {
  if (!siteUnlocked(req)) return siteLockedResponse();

  const ip = getClientIp(req);
  const attempts = checkAttempts(ip, "login");
  if (attempts.blocked) {
    return NextResponse.json(
      { error: `Превышен лимит (${attempts.label}). Попробуйте позже.` },
      { status: 429 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const email = normalizeEmail(body?.email);
  if (!email) return NextResponse.json({ error: "Укажите корректную почту" }, { status: 400 });

  const user = findUserByEmail(email);
  if (!user || user.status !== "approved") {
    recordAttempt(ip, "login", false, email);
    return NextResponse.json(
      { error: user ? statusMessage(user.status) : "Аккаунт не найден", status: user?.status },
      { status: 403 }
    );
  }

  const check = verifyLoginCode(email, "user", body?.code);
  if (!check.ok) {
    recordAttempt(ip, "login", false, email);
    return NextResponse.json({ error: check.error, attemptsLeft: check.attemptsLeft }, { status: 401 });
  }

  recordAttempt(ip, "login", true, email);
  touchLogin(user.id);

  const res = NextResponse.json({ success: true, user: toPublicUser(user) });
  return setSessionCookie(res, signUserToken(user.id, user.session_epoch));
}
