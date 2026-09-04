import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

function isAuthorizedAdmin(req: NextRequest): boolean {
  // Раньше здесь требовался префикс "ai_video_admin_session_1599_", а /api/admin/login
  // выдаёт токен вида ai_video_admin_session_${Date.now()}_… — Date.now() никогда не
  // начинается с 1599, поэтому создание инвайт-кода падало с 401 при любом пароле.
  // Условие приведено к тому же виду, что и в /api/admin/users.
  const token = req.headers.get("x-admin-token") || req.headers.get("authorization")?.replace("Bearer ", "");
  if (token && token.startsWith("ai_video_admin_session_")) return true;
  return false;
}

export async function POST(req: NextRequest) {
  if (!isAuthorizedAdmin(req)) {
    return NextResponse.json({ error: "Доступ запрещен: требуется авторизация администратора" }, { status: 401 });
  }

  try {
    const { userName, customCode, limit = 10 } = await req.json();

    const randomSuffix = Math.random().toString(36).substring(2, 7).toUpperCase();
    const code = customCode?.trim() || `VIP-${randomSuffix}`;
    const name = userName?.trim() || `User-${randomSuffix}`;

    const { data, error } = await supabaseAdmin
      .from("access_codes")
      .insert({
        user_name: name,
        secret_code: code,
        status: "approved",
        generations_limit: Number(limit) || 10,
        generations_used: 0,
        approved_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, code: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
