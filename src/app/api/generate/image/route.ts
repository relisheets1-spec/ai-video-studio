import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { imageApiSize, normalizeOrientation, promptAspectHint } from "@/lib/orientation";
import { resolveStyleFragment } from "@/lib/content/styles";
import { logPipelineError } from "@/lib/pipeline-log";
import { requireUser } from "@/lib/session";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;
  const { user } = auth;

  let loggedVideoId: string | null = null;
  try {
    const { videoId, sceneId, visualPrompt, style, orientation } = await req.json();
    const frameOrientation = normalizeOrientation(orientation);
    loggedVideoId = typeof videoId === "string" ? videoId : null;

    if (!videoId || sceneId === undefined || !visualPrompt) {
      return NextResponse.json({ error: "videoId, sceneId и visualPrompt обязательны" }, { status: 400 });
    }

    if (typeof sceneId !== "number" || sceneId < 0 || sceneId > 40) {
      return NextResponse.json({ error: "Недопустимый номер сцены" }, { status: 400 });
    }

    const { data: video, error: videoErr } = await supabaseAdmin
      .from("video_generations")
      .select("id, user_id, created_at")
      .eq("id", videoId)
      .single();

    if (videoErr || !video || video.user_id !== user.id) {
      return NextResponse.json({ error: "Доступ запрещен: чужое или неизвестное видео" }, { status: 403 });
    }

    const sessionAge = Date.now() - new Date(video.created_at).getTime();
    if (sessionAge > 2 * 60 * 60 * 1000) {
      return NextResponse.json({ error: "Сессия генерации видео истекла (более 2 часов)" }, { status: 403 });
    }

    // Стиль приходит id-шником (или готовым фрагментом из архива) — раньше в
    // промпт попадало буквально «Style: retro_film». Хвост «cinematic lighting,
    // masterpiece» убран: он спорил с акварелью, тушью и плакатом.
    const cleanPrompt = `${String(visualPrompt).slice(0, 900)}. Style: ${resolveStyleFragment(style)}, ${promptAspectHint(frameOrientation)}.`;

    // gpt-image-1-mini: 1536x1024 (гориз.) или 1024x1536 (верт.) — это 3:2 / 2:3,
    // а не 16:9 / 9:16, поэтому на холсте экспорта обязателен cover-fit.
    const openAiRes = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-image-1-mini",
        prompt: cleanPrompt,
        quality: "medium",
        size: imageApiSize(frameOrientation),
        n: 1,
      }),
    });

    const openAiData = await openAiRes.json();

    if (!openAiRes.ok || !openAiData?.data?.[0]) {
      console.error("OpenAI Image error:", openAiData);
      throw new Error(openAiData?.error?.message || "Не удалось сгенерировать изображение");
    }

    const b64Json = openAiData.data[0].b64_json;
    if (!b64Json) {
      throw new Error("Отсутствуют base64 данные изображения");
    }

    const imgBuffer = Buffer.from(b64Json, "base64");
    const filePath = `images/${videoId}/scene_${sceneId}.png`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from("video-assets")
      .upload(filePath, imgBuffer, {
        contentType: "image/png",
        upsert: true,
      });

    if (uploadError) {
      console.error("Storage upload error:", uploadError);
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const { data: publicUrlData } = supabaseAdmin.storage
      .from("video-assets")
      .getPublicUrl(filePath);

    return NextResponse.json({
      sceneId,
      imageUrl: publicUrlData.publicUrl,
    });
  } catch (err: any) {
    await logPipelineError({ stage: "image", videoId: loggedVideoId, message: err?.message || String(err) });
    return NextResponse.json({ error: err.message || "Ошибка при генерации изображения" }, { status: 500 });
  }
}
