import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { passwordIsDefault } from "@/lib/admins";

/** Проверка админ-сессии при открытии панели. */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("response" in auth) return auth.response;
  return NextResponse.json({
    admin: auth.admin,
    expiresAt: auth.payload.exp,
    passwordIsDefault: await passwordIsDefault(),
  });
}
