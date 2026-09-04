import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(req: NextRequest) {

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
