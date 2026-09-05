import { NextRequest, NextResponse } from "next/server";
import { issueLoginCode, LOGIN_CODE_TTL_MS, redeemInvite } from "@/lib/access";
import { loginCodeMail, sendMail } from "@/lib/mail";
import { normalizeEmail } from "@/lib/env";
import { checkAttempts, getClientIp, recordAttempt } from "@/lib/security";
import { siteLockedResponse, siteUnlocked } from "@/lib/site-gate";
import { findUserByEmail, markApproved, statusMessage } from "@/lib/users";

/**
 * Второй шаг для новичка: код приглашения от администратора.
 * Код одноразовый и работает только со своей почтой; после него сразу
 * уходит обычный код входа на ту же почту.
 */
export async function POST(req: NextRequest) {
  if (!siteUnlocked(req)) return siteLockedResponse();

  const ip = getClientIp(req);
  const attempts = checkAttempts(ip, "register");
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
    recordAttempt(ip, "register", false, email);
    return NextResponse.json({ error: "Сначала отправьте заявку на доступ" }, { status: 404 });
  }
  if (user.status !== "invited") {
    return NextResponse.json(
      { state: user.status, error: statusMessage(user.status) || "Регистрация уже завершена — запросите код входа" },
      { status: 409 }
    );
  }

  const redeemed = redeemInvite(email, body?.invite);
  if (!redeemed.ok) {
    recordAttempt(ip, "register", false, email);
    return NextResponse.json({ error: redeemed.error }, { status: 400 });
  }

  markApproved(user.id);
  recordAttempt(ip, "register", true, email);

  const issued = issueLoginCode(email, "user", ip);
  if (!issued.ok) {
    return NextResponse.json({
      state: "code",
      message: "Код входа уже отправлен на почту.",
    });
  }

  const mail = await sendMail(loginCodeMail(email, issued.code, Math.round(LOGIN_CODE_TTL_MS / 60000)));
  if (!mail.ok) {
    return NextResponse.json({ error: "Не удалось отправить письмо с кодом. Попробуйте позже." }, { status: 502 });
  }

  return NextResponse.json({
    state: "code",
    message: "Регистрация завершена. Код входа отправлен на почту.",
    expiresAt: issued.expiresAt,
  });
}
