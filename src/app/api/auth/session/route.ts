import { NextRequest, NextResponse } from "next/server";
import { clearSessionCookie, readSessionId, requireUser } from "@/lib/session";
import { deleteSession } from "@/lib/sessions";
import { toPublicUser } from "@/lib/users";

/** Свежий профиль по cookie: статус и наличие ключей. */
export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;
  return NextResponse.json({ user: toPublicUser(auth.user) });
}

/** Выход: сессия удаляется, cookie гасится. */
export async function DELETE(req: NextRequest) {
  const sid = readSessionId(req);
  if (sid) deleteSession(sid);
  return clearSessionCookie(NextResponse.json({ success: true }));
}
