import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { requireAdmin } from "@/lib/admin-auth";

const CODE_RE = /^[A-Za-z0-9_-]{4,64}$/;

/**
 * Создать инвайт-код. Код рождается свободным (status = invited, без почты):
 * админ передаёт его человеку, тот регистрируется с почтой и ключом, после
 * чего заявка ждёт одобрения.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("response" in auth) return auth.response;

  try {
    const body = await req.json().catch(() => ({}));
    const label = typeof body?.label === "string" ? body.label.trim().slice(0, 80) : "";
    const custom = typeof body?.customCode === "string" ? body.customCode.trim() : "";
    const limit = Math.min(500, Math.max(1, Math.floor(Number(body?.limit) || 10)));

    const randomSuffix = Math.random().toString(36).substring(2, 7).toUpperCase();
    const code = custom || `VIP-${randomSuffix}`;
    if (!CODE_RE.test(code)) {
      return NextResponse.json(
        { error: "Код: 4–64 символа, латиница, цифры, дефис и подчёркивание" },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("access_codes")
      .insert({
        user_name: label || `Инвайт ${code}`,
        secret_code: code,
        status: "invited",
        generations_limit: limit,
        generations_used: 0,
      })
      .select("id, user_name, secret_code, email, status, generations_limit, generations_used, created_at")
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({ error: "Такой код уже существует" }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, code: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
