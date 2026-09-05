import { NextRequest, NextResponse } from "next/server";
import { verifyLoginCode } from "@/lib/access";
import { setAdminCookie, signAdminToken } from "@/lib/admin-auth";
import { getAdmin, getAdminEpoch } from "@/lib/admins";
import { normalizeEmail } from "@/lib/env";
import { checkAttempts, getClientIp, recordAttempt } from "@/lib/security";

/** Проверка кода администратора и выдача сессии на 12 часов. */
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
  const check = verifyLoginCode(email, "admin", body?.code);

  if (!admin || !check.ok) {
    recordAttempt(ip, "admin", false, email);
    const error = !admin ? "Неверная почта или код" : (check as { error: string }).error;
    return NextResponse.json({ error }, { status: 401 });
  }

  recordAttempt(ip, "admin", true, email);
  const res = NextResponse.json({ success: true, admin });
  return setAdminCookie(res, signAdminToken(admin.email, getAdminEpoch()));
}
