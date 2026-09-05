import { NextRequest, NextResponse } from "next/server";
import { issueLoginCode, LOGIN_CODE_TTL_MS } from "@/lib/access";
import { loginCodeMail, requestReceivedMail, sendMail } from "@/lib/mail";
import { normalizeEmail } from "@/lib/env";
import { checkAttempts, getClientIp, recordAttempt } from "@/lib/security";
import { siteLockedResponse, siteUnlocked } from "@/lib/site-gate";
import { createRequest, findUserByEmail, statusMessage } from "@/lib/users";

/**
 * Первый шаг входа: почта.
 *
 * Незнакомая почта — создаётся заявка. Одобренная заявка ждёт код
 * приглашения. Зарегистрированному отправляется шестизначный код входа.
 * Паролей нет нигде.
 */
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

  if (!user) {
    createRequest(email);
    await sendMail(requestReceivedMail(email));
    return NextResponse.json({
      state: "requested",
      message: "Заявка отправлена. Когда администратор её одобрит, вы получите код приглашения на почту.",
    });
  }

  if (user.status === "pending") {
    return NextResponse.json({ state: "pending", message: statusMessage("pending") });
  }

  if (user.status === "rejected" || user.status === "blocked") {
    recordAttempt(ip, "login", false, email);
    return NextResponse.json(
      { state: user.status, error: statusMessage(user.status) },
      { status: 403 }
    );
  }

  if (user.status === "invited") {
    return NextResponse.json({
      state: "invite",
      message: "Заявка одобрена. Введите код приглашения, который выдал администратор.",
    });
  }

  const issued = issueLoginCode(email, "user", ip);
  if (!issued.ok) {
    return NextResponse.json(
      { error: `Код уже отправлен. Новый можно запросить через ${issued.retryAfterSec} с.`, retryAfterSec: issued.retryAfterSec },
      { status: 429 }
    );
  }

  const mail = await sendMail(loginCodeMail(email, issued.code, Math.round(LOGIN_CODE_TTL_MS / 60000)));
  if (!mail.ok) {
    return NextResponse.json({ error: "Не удалось отправить письмо с кодом. Попробуйте позже." }, { status: 502 });
  }

  return NextResponse.json({
    state: "code",
    message: "Код отправлен на почту. Он действует 10 минут.",
    expiresAt: issued.expiresAt,
  });
}
