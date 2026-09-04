import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  try {
    const { videoId, secretCode, scenes, totalDuration } = await req.json();

    if (!videoId || !secretCode) {
      return NextResponse.json({ error: "videoId и secretCode обязательны" }, { status: 400 });
    }

    // 1. Update video record
    const { error: videoError } = await supabaseAdmin
      .from("video_generations")
      .update({
        scenes: scenes || [],
        actual_duration_seconds: totalDuration || 480,
        status: "completed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", videoId);

    if (videoError) {
      return NextResponse.json({ error: videoError.message }, { status: 500 });
    }

    // 2. Fetch and decrement user generations
    const { data: user, error: userFetchError } = await supabaseAdmin
      .from("access_codes")
      .select("*")
      .eq("secret_code", secretCode.trim())
      .single();

    if (userFetchError || !user) {
      return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
    }

    const newUsed = user.generations_used + 1;
    const { error: userUpdateError } = await supabaseAdmin
      .from("access_codes")
      .update({
        generations_used: newUsed,
      })
      .eq("id", user.id);

    if (userUpdateError) {
      return NextResponse.json({ error: userUpdateError.message }, { status: 500 });
    }

    const remaining = Math.max(0, user.generations_limit - newUsed);

    return NextResponse.json({
      success: true,
      generationsUsed: newUsed,
      remaining,
    });
  } catch (err: any) {
    console.error("Finalize Error:", err);
    return NextResponse.json({ error: err.message || "Ошибка при финализации" }, { status: 500 });
  }
}
