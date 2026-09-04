import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

function checkAdminAuth(req: NextRequest) {
  const adminKey = req.headers.get("x-admin-key");
  const expectedKey = process.env.ADMIN_SECRET_KEY || "admin_master_secret_2026";
  return adminKey === expectedKey;
}

export async function POST(req: NextRequest) {
  if (!checkAdminAuth(req)) {
    return NextResponse.json({ error: "Доступ запрещен" }, { status: 401 });
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
