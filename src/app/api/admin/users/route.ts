import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { verifyAdminToken, UNAUTHORIZED } from "@/lib/admin-auth";
import { clearFreeze, listFreezes, setFreeze } from "@/lib/freeze";


export async function GET(req: NextRequest) {
  if (!verifyAdminToken(req)) {
    return NextResponse.json(UNAUTHORIZED, { status: 401 });
  }

  try {
    const { data: users, error } = await supabaseAdmin
      .from("access_codes")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Активные заморозки отдаём вместе со списком — одним запросом.
    const freezes = await listFreezes();
    return NextResponse.json({ users: users || [], freezes });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!verifyAdminToken(req)) {
    return NextResponse.json(UNAUTHORIZED, { status: 401 });
  }

  try {
    const { action, userId, amount, hours } = await req.json();

    if (!userId && action !== "set_default_limit") {
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

    if (action === "freeze") {
      // hours === "forever" -> бессрочно; иначе число часов.
      const span = hours === "forever" ? "forever" : Math.max(1, Number(hours) || 24);
      await setFreeze(userId, span as number | "forever");
      return NextResponse.json({ success: true, frozen: true });
    }

    if (action === "unfreeze") {
      await clearFreeze(userId);
      return NextResponse.json({ success: true, frozen: false });
    }

    if (action === "set_default_limit") {
      // Лимит по умолчанию для новых инвайт-кодов.
      const value = String(Math.max(0, Math.floor(Number(amount) || 10)));
      await supabaseAdmin
        .from("system_settings")
        .upsert({ key: "default_generations_limit", value }, { onConflict: "key" });
      return NextResponse.json({ success: true, value });
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
