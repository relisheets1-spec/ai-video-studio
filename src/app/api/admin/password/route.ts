import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { setAdminPassword, verifyAdminPassword } from "@/lib/admins";

/** Смена пароля администратора — только основной. Все админ-сессии гаснут. */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, { primaryOnly: true });
  if ("response" in auth) return auth.response;

  const body = await req.json().catch(() => ({}));
  const current = typeof body?.currentPassword === "string" ? body.currentPassword : "";
  const next = typeof body?.newPassword === "string" ? body.newPassword : "";

  if (!current || !next) {
    return NextResponse.json({ error: "Укажите текущий и новый пароль" }, { status: 400 });
  }
  if (next.length < 8 || next.length > 128) {
    return NextResponse.json({ error: "Новый пароль: от 8 до 128 символов" }, { status: 400 });
  }
  if (!(await verifyAdminPassword(current))) {
    return NextResponse.json({ error: "Текущий пароль неверен" }, { status: 401 });
  }

  await setAdminPassword(next);
  return NextResponse.json({ success: true, message: "Пароль изменён. Войдите заново." });
}
