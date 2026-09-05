import { NextRequest, NextResponse } from "next/server";
import { issueLoginCode, LOGIN_CODE_TTL_MS } from "@/lib/access";
import { getAdmin } from "@/lib/admins";
import { normalizeEmail } from "@/lib/env";
import { adminCodeMail, sendMail } from "@/lib/mail";
import { checkAttempts, getClientIp, recordAttempt } from "@/lib/security";

/**
 * Запрос кода для входа в панель.
 *
 * Ответ одинаковый для любого адреса: по нему нельзя узнать, кто админ.
 * Письмо уходит только тем, кто есть в ADMIN_EMAILS или в таблице admins.
 */
export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const attempts = checkAttempts(ip, "admin");
  if (attempts.blocked) {
    return NextResponse.json({ error: `Превышен лимит (${attempts.label}). Попробуйте позже.` }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const email = normalizeEmail(body?.email);
  if (!email) return NextResponse.json({ error: "Укажите корректную почту" }, { status: 400 });

  const admin = getAdmin(email);
  if (!admin) {
    recordAttempt(ip, "admin", false, email);
    return NextResponse.json({ state: "code", message: "Если адрес есть в списке администраторов, код отправлен." });
  }

  const issued = issueLoginCode(email, "admin", ip);
  if (!issued.ok) {
    return NextResponse.json(
      { error: `Код уже отправлен. Новый можно запросить через ${issued.retryAfterSec} с.` },
      { status: 429 }
    );
  }

  const mail = await sendMail(adminCodeMail(email, issued.code, Math.round(LOGIN_CODE_TTL_MS / 60000)));
  if (!mail.ok) {
    return NextResponse.json({ error: "Не удалось отправить письмо с кодом" }, { status: 502 });
  }

  return NextResponse.json({ state: "code", message: "Если адрес есть в списке администраторов, код отправлен." });
}
