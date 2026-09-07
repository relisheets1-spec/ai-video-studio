import { NextRequest, NextResponse } from "next/server";
import { createCode, deleteCode, findCode, listCodes, normalizeCode, revokeCode } from "@/lib/access";
import { requireAdmin } from "@/lib/admin-auth";

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

/** Свободный код удаляется, использованный — отзывается (пользователь теряет вход). */
export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("response" in auth) return auth.response;

  const code = normalizeCode(new URL(req.url).searchParams.get("code"));
  const row = code ? findCode(code) : null;
  if (!row) return NextResponse.json({ error: "Код не найден" }, { status: 404 });

  if (row.email) revokeCode(code);
  else deleteCode(code);
  return NextResponse.json({ success: true, codes: listCodes() });
}
