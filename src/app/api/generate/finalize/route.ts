import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { requireUser, toPublicUser } from "@/lib/session";

export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;
  const { user } = auth;

  try {
    const { videoId, scenes, totalDuration } = await req.json();

    if (!videoId || typeof videoId !== "string") {
      return NextResponse.json({ error: "videoId обязателен" }, { status: 400 });
    }

    const { data: video } = await supabaseAdmin
      .from("video_generations")
      .select("id, user_id, status")
      .eq("id", videoId)
      .maybeSingle();

    if (!video || video.user_id !== user.id) {
      return NextResponse.json({ error: "Доступ запрещен: чужое или неизвестное видео" }, { status: 403 });
    }

    const durationSeconds = Math.max(
      0,
      Math.round(
        Number(totalDuration) ||
          (Array.isArray(scenes)
            ? scenes.reduce(
                (acc: number, sc: any) =>
                  acc + (Number(sc?.actualDuration) || Number(sc?.durationEstimate) || 0),
                0
              )
            : 0)
      )
    );

    const { error: videoError } = await supabaseAdmin
      .from("video_generations")
      .update({
        scenes: scenes || [],
        actual_duration_seconds: durationSeconds,
        status: "completed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", videoId);

    if (videoError) {
      return NextResponse.json({ error: videoError.message }, { status: 500 });
    }

    // Списываем генерацию один раз: повторный finalize того же видео баланс не трогает.
    let newUsed = user.generations_used || 0;
    if (video.status !== "completed") {
      newUsed += 1;
      const { error: userUpdateError } = await supabaseAdmin
        .from("access_codes")
        .update({ generations_used: newUsed })
        .eq("id", user.id);
      if (userUpdateError) {
        return NextResponse.json({ error: userUpdateError.message }, { status: 500 });
      }
    }

    const publicUser = toPublicUser({ ...user, generations_used: newUsed });

    return NextResponse.json({
      success: true,
      generationsUsed: newUsed,
      remaining: publicUser.remaining,
      user: publicUser,
    });
  } catch (err: any) {
    console.error("Finalize Error:", err);
    return NextResponse.json({ error: err.message || "Ошибка при финализации" }, { status: 500 });
  }
}
