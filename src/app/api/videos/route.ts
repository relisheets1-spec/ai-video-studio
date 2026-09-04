import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const secretCode = searchParams.get("secretCode");
    const videoId = searchParams.get("videoId");

    if (videoId) {
      const { data: video, error } = await supabaseAdmin
        .from("video_generations")
        .select("*")
        .eq("id", videoId)
        .single();

      if (error) return NextResponse.json({ error: error.message }, { status: 404 });
      return NextResponse.json({ video });
    }

    if (!secretCode) {
      return NextResponse.json({ error: "secretCode обязателен" }, { status: 400 });
    }

    const { data: user, error: userError } = await supabaseAdmin
      .from("access_codes")
      .select("id")
      .eq("secret_code", secretCode.trim())
      .single();

    if (userError || !user) {
      return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
    }

    const { data: videos, error: videosError } = await supabaseAdmin
      .from("video_generations")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (videosError) {
      return NextResponse.json({ error: videosError.message }, { status: 500 });
    }

    return NextResponse.json({ videos });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
