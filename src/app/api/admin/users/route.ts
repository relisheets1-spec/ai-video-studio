import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

function isAuthorizedAdmin(req: NextRequest): boolean {
  const token = req.headers.get("x-admin-token") || req.headers.get("authorization")?.replace("Bearer ", "");
  if (token && token.startsWith("ai_video_admin_session_")) return true;
  return false;
}

export async function GET(req: NextRequest) {
  if (!isAuthorizedAdmin(req)) {
    return NextResponse.json({ error: "Доступ запрещен: требуется авторизация администратора" }, { status: 401 });
  }

  try {
    const { data: users, error } = await supabaseAdmin
      .from("access_codes")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ users: users || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!isAuthorizedAdmin(req)) {
    return NextResponse.json({ error: "Доступ запрещен: требуется авторизация администратора" }, { status: 401 });
  }

  try {
    const { action, userId, amount } = await req.json();

    if (!userId) {
      return NextResponse.json({ error: "userId обязателен" }, { status: 400 });
    }

    if (action === "set_balance") {
      const exactBalance = Math.max(0, Math.floor(Number(amount) || 0));

      const { data: user, error: fetchErr } = await supabaseAdmin
        .from("access_codes")
        .select("generations_used, generations_limit")
        .eq("id", userId)
        .single();

      if (fetchErr || !user) {
        return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
      }

      // Remaining = newLimit - generations_used
      // Therefore: newLimit = generations_used + exactBalance
      const newLimit = (user.generations_used || 0) + exactBalance;

      const { data, error } = await supabaseAdmin
        .from("access_codes")
        .update({ generations_limit: newLimit })
        .eq("id", userId)
        .select()
        .single();

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true, user: data });
    }

    if (action === "add_generations") {
      const addCount = Number(amount) || 10;
      const { data: user, error: fetchErr } = await supabaseAdmin
        .from("access_codes")
        .select("generations_limit")
        .eq("id", userId)
        .single();

      if (fetchErr || !user) {
        return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
      }

      const newLimit = (user?.generations_limit || 10) + addCount;

      const { data, error } = await supabaseAdmin
        .from("access_codes")
        .update({ generations_limit: newLimit })
        .eq("id", userId)
        .select()
        .single();

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true, user: data });
    }

    if (action === "approve") {
      const { data, error } = await supabaseAdmin
        .from("access_codes")
        .update({
          status: "approved",
          approved_at: new Date().toISOString(),
        })
        .eq("id", userId)
        .select()
        .single();

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true, user: data });
    }

    if (action === "reject") {
      const { data, error } = await supabaseAdmin
        .from("access_codes")
        .update({ status: "rejected" })
        .eq("id", userId)
        .select()
        .single();

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true, user: data });
    }

    if (action === "delete") {
      const { error } = await supabaseAdmin
        .from("access_codes")
        .delete()
        .eq("id", userId);

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Неизвестное действие" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
