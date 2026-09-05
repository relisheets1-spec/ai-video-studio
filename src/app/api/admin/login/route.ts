import { NextRequest, NextResponse } from "next/server";
import { checkAttempts, getClientIp, recordAttempt } from "@/lib/security";
import {
  ensurePrimarySeeded,
  getAdmin,
  getAdminEpoch,
  normalizeEmail,
  passwordIsDefault,
  verifyAdminPassword,
} from "@/lib/admins";
import { signAdminToken } from "@/lib/admin-auth";

/** Вход администратора: почта из списка админов + пароль администратора. */
export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const attempts = await checkAttempts(ip, "admin");
    if (attempts.blocked) {
      return NextResponse.json(
        { error: `Превышен лимит (${attempts.label}). Доступ с этого IP временно закрыт.` },
        { status: 429 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const email = normalizeEmail(body?.email);
    const password = typeof body?.password === "string" ? body.password : "";

    if (!email || !password) {
      return NextResponse.json({ error: "Введите почту и пароль администратора" }, { status: 400 });
    }

    await ensurePrimarySeeded();
    const admin = await getAdmin(email);
    const ok = admin ? await verifyAdminPassword(password) : false;

    if (!admin || !ok) {
      await recordAttempt(ip, "admin", false, email);
      return NextResponse.json(
        { error: `Неверная почта или пароль. Осталось попыток: ${Math.max(0, attempts.attemptsLeft - 1)}.` },
        { status: 401 }
      );
    }

    await recordAttempt(ip, "admin", true, email);
    const epoch = await getAdminEpoch();

    return NextResponse.json({
      success: true,
      adminToken: signAdminToken(admin.email, epoch),
      admin,
      passwordIsDefault: await passwordIsDefault(),
    });
  } catch (err: any) {
    console.error("Admin Login Error:", err);
    return NextResponse.json({ error: err.message || "Ошибка сервера" }, { status: 500 });
  }
}
