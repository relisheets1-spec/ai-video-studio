import { NextRequest, NextResponse } from "next/server";
import { bumpAdminEpoch, clearAdminCookie, requireAdmin } from "@/lib/admin-auth";
import { mediaDiskUsage } from "@/lib/storage";
import { studioStats } from "@/lib/videos";

/** Состояние админ-сессии плюс сводка по студии для шапки панели. */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("response" in auth) return auth.response;
  return NextResponse.json({
    admin: auth.admin,
    expiresAt: auth.expiresAt,
    stats: studioStats(),
    disk: mediaDiskUsage(),
  });
}

/** Выход. ?all=1 гасит все сессии администратора разом. */
export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("response" in auth) return auth.response;
  const all = new URL(req.url).searchParams.get("all") === "1";
  if (all) bumpAdminEpoch();
  return clearAdminCookie(NextResponse.json({ success: true, all }));
}
