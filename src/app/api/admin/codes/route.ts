import { NextRequest, NextResponse } from "next/server";
import { createCode, deleteCode, findCode, listCodes, normalizeCode } from "@/lib/access";
import { requireAdmin } from "@/lib/admin-auth";
import { kickUser } from "@/lib/kick";
import { findUserByEmail, revokeSessions } from "@/lib/users";

/** Коды доступа: список. */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("response" in auth) return auth.response;
  return NextResponse.json({ codes: listCodes() });
}

/** Новый код: свой (поле code) или случайный; note — для кого. */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("response" in auth) return auth.response;

  const body = await req.json().catch(() => ({}));
  const custom = typeof body?.code === "string" && body.code.trim() ? body.code : null;
  const note = typeof body?.note === "string" && body.note.trim() ? body.note.trim() : null;

  const result = createCode(custom, note);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ success: true, code: result.row, codes: listCodes() });
}

/** Удалить код: свободный просто исчезает, привязанный закрывает вход почте до нового кода. */
export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("response" in auth) return auth.response;

  const code = normalizeCode(new URL(req.url).searchParams.get("code"));
  const row = code ? findCode(code) : null;
  if (!row) return NextResponse.json({ error: "Код не найден" }, { status: 404 });

  deleteCode(code);
  // Привязанный код — это доступ человека: гасим его сессии и выкидываем из открытых вкладок.
  const user = row.email ? findUserByEmail(row.email) : null;
  if (user) {
    revokeSessions(user.id);
    kickUser(user.id);
  }
  return NextResponse.json({ success: true, codes: listCodes() });
}
