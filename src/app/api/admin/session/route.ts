import { NextRequest, NextResponse } from "next/server";
import { clearAdminCookie, requireAdmin } from "@/lib/admin-auth";
import { bumpAdminEpoch } from "@/lib/admins";
import { mailProvider } from "@/lib/mail";
import { mediaDiskUsage } from "@/lib/storage";
import { studioStats } from "@/lib/videos";

/** Состояние админ-сессии плюс сводка по студии для шапки панели. */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("response" in auth) return auth.response;

  const disk = mediaDiskUsage();
  return NextResponse.json({
    admin: auth.admin,
    expiresAt: auth.payload.exp,
    stats: studioStats(),
    disk,
    mail: mailProvider(),
  });
}

/** Выход. ?all=1 гасит сессии всех администраторов сразу. */
export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("response" in auth) return auth.response;

  const all = new URL(req.url).searchParams.get("all") === "1";
  if (all) bumpAdminEpoch();
  return clearAdminCookie(NextResponse.json({ success: true, all }));
}
