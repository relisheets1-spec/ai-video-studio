import { NextRequest, NextResponse } from "next/server";
import { checkAdminCode, isAdminEmail, setAdminCookie, signAdminToken } from "@/lib/admin-auth";
import { normalizeEmail } from "@/lib/env";
import { checkAttempts, failureDelay, getClientIp, recordAttempt } from "@/lib/security";

/**
 * Вход со страницы /admin: только администратор, ответ на любую чужую почту
 * такой же, как на неверный код — по нему нельзя узнать, чья это панель.
 */
export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const attempts = checkAttempts(ip, "admin");
  if (attempts.blocked) {
    return NextResponse.json({ error: "Слишком много попыток. Вход администратора закрыт на час." }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const email = normalizeEmail(body?.email);
  const code = typeof body?.code === "string" ? body.code : "";

  if (!email || !isAdminEmail(email) || !checkAdminCode(code)) {
    recordAttempt(ip, "admin", false, email);
    console.warn(`[admin] неверный вход с ${ip}`);
    await failureDelay();
    return NextResponse.json({ error: "Неверная почта или код" }, { status: 401 });
  }

  recordAttempt(ip, "admin", true, email);
  return setAdminCookie(NextResponse.json({ success: true, admin: { email } }), signAdminToken(email));
}
