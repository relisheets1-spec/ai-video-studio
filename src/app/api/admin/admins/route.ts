import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { addAdmin, listAdmins, removeAdmin } from "@/lib/admins";
import { normalizeEmail } from "@/lib/env";

/** Список администраторов. */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("response" in auth) return auth.response;
  return NextResponse.json({ admins: listAdmins(), me: auth.admin.email });
}

/** Добавить администратора по почте — входить он будет общим кодом администратора. */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("response" in auth) return auth.response;

  const body = await req.json().catch(() => ({}));
  const email = normalizeEmail(body?.email);
  if (!email) return NextResponse.json({ error: "Укажите корректную почту" }, { status: 400 });

  const result = addAdmin(email, auth.admin.email);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ success: true, admins: listAdmins() });
}

/** Снять администратора. Себя и главного (из настроек сервера) снять нельзя. */
export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("response" in auth) return auth.response;

  const email = normalizeEmail(new URL(req.url).searchParams.get("email"));
  if (!email) return NextResponse.json({ error: "Укажите почту" }, { status: 400 });

  const result = removeAdmin(email, auth.admin.email);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ success: true, admins: listAdmins() });
}
