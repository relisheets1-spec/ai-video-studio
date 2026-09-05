import { NextRequest, NextResponse } from "next/server";
import { clearSessionCookie, requireUser } from "@/lib/session";
import { toPublicUser } from "@/lib/users";

/** Свежий профиль по cookie: статус, остаток генераций, наличие ключа. */
export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;
  return NextResponse.json({ user: toPublicUser(auth.user) });
}

/** Выход: cookie гасится на сервере. */
export async function DELETE() {
  return clearSessionCookie(NextResponse.json({ success: true }));
}
