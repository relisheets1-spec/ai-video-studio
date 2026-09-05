import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  try {
    const { videoId, secretCode, userId, scenes, totalDuration } = await req.json();

    if (!videoId || (!secretCode && !userId)) {
      return NextResponse.json({ error: "videoId и secretCode или userId обязательны" }, { status: 400 });
    }

    // 1. Update video record
    const { error: videoError } = await supabaseAdmin
      .from("video_generations")
      .update({
        scenes: scenes || [],
        // Раньше здесь было `totalDuration || 480`, а клиент totalDuration не
        // присылал вовсе — поэтому КАЖДОЕ видео записывалось как ровно 8 минут
        // и архив показывал 480 секунд у всех роликов, включая 25-секундные.
        actual_duration_seconds: Math.max(
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
        ),
        status: "completed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", videoId);

    if (videoError) {
      return NextResponse.json({ error: videoError.message }, { status: 500 });
    }

    // 2. Fetch and decrement user generations
    let user: any = null;

    if (userId) {
      const { data: userById } = await supabaseAdmin
        .from("access_codes")
        .select("*")
        .eq("id", userId)
        .maybeSingle();
      if (userById) user = userById;
    }

    if (!user && secretCode) {
      const cleanCode = secretCode.trim();
      const { data: userByCode } = await supabaseAdmin
        .from("access_codes")
        .select("*")
        .eq("secret_code", cleanCode)
        .maybeSingle();

      if (userByCode) {
        user = userByCode;
      } else if (cleanCode === "1599") {
        const { data: adminUser } = await supabaseAdmin
          .from("access_codes")
          .select("*")
          .ilike("user_name", "%Администратор%")
          .maybeSingle();
        if (adminUser) user = adminUser;
      }
    }

    if (!user) {
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

    // Клиент читает finData.user — раньше этого ключа здесь не было, ветка
    // была мёртвой, и баланс обновлялся только при возврате фокуса на вкладку.
    return NextResponse.json({
      success: true,
      generationsUsed: newUsed,
      remaining,
      user: {
        id: user.id,
        userName: user.user_name,
        secretCode: user.secret_code,
        status: user.status,
        remaining,
        generationsLimit: user.generations_limit,
        generationsUsed: newUsed,
      },
    });
  } catch (err: any) {
    console.error("Finalize Error:", err);
    return NextResponse.json({ error: err.message || "Ошибка при финализации" }, { status: 500 });
  }
}
