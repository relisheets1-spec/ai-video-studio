import { NextRequest, NextResponse } from "next/server";
import { requireUser, toPublicUser } from "@/lib/session";

/** Свежий профиль по токену: баланс, статус, наличие ключа. */
export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;
  return NextResponse.json({ user: toPublicUser(auth.user) });
}
