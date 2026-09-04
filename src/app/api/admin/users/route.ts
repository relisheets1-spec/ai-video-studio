import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const { data: users, error } = await supabaseAdmin
    .from("access_codes")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ users });
}

export async function POST(req: NextRequest) {

  try {
    const { action, userId, amount } = await req.json();

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

    if (action === "add_generations") {
      const addCount = Number(amount) || 10;
      const { data: user } = await supabaseAdmin
        .from("access_codes")
        .select("generations_limit")
        .eq("id", userId)
        .single();

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
