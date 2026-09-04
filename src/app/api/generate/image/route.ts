import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

export async function POST(req: NextRequest) {
  try {
    const { videoId, sceneId, visualPrompt, style = "cinematic photorealistic" } = await req.json();

    if (!videoId || sceneId === undefined || !visualPrompt) {
      return NextResponse.json({ error: "videoId, sceneId и visualPrompt обязательны" }, { status: 400 });
    }

    const cleanPrompt = `${visualPrompt.slice(0, 700)}. Style: ${style}, 16:9 widescreen composition, high detail, masterpiece.`;

    // Call OpenAI image generation using supported gpt-image-1-mini model
    const openAiRes = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-image-1-mini",
        prompt: cleanPrompt,
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

    // Upload to Supabase Storage
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
    console.error("Image Route Error:", err);
    return NextResponse.json({ error: err.message || "Ошибка при генерации изображения" }, { status: 500 });
  }
}
