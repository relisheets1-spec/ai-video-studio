import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { openai } from "@/lib/openai";

export async function POST(req: NextRequest) {
  try {
    const { videoId, sceneId, visualPrompt, style = "cinematic" } = await req.json();

    if (!videoId || sceneId === undefined || !visualPrompt) {
      return NextResponse.json({ error: "videoId, sceneId и visualPrompt обязательны" }, { status: 400 });
    }

    const enhancedPrompt = `${visualPrompt.slice(0, 800)}. Style: ${style}, widescreen 16:9 cinematic shot, 8k resolution, dramatic cinematic atmosphere, hyper-detailed.`;

    let imageUrl = "";

    try {
      const response = await openai.images.generate({
        model: "dall-e-3",
        prompt: enhancedPrompt,
        n: 1,
        size: "1792x1024",
        quality: "standard",
        response_format: "url",
      });

      const openAiImageUrl = response?.data?.[0]?.url;
      if (!openAiImageUrl) {
        throw new Error("OpenAI не вернул URL изображения");
      }

      // Download the image to save into Supabase Storage
      const imgRes = await fetch(openAiImageUrl);
      const imgBuffer = Buffer.from(await imgRes.arrayBuffer());

      const filePath = `images/${videoId}/scene_${sceneId}.png`;
      const { error: uploadError } = await supabaseAdmin.storage
        .from("video-assets")
        .upload(filePath, imgBuffer, {
          contentType: "image/png",
          upsert: true,
        });

      if (uploadError) {
        console.error("Image upload to storage error:", uploadError);
        // Fallback to direct OpenAI URL if upload failed
        imageUrl = openAiImageUrl;
      } else {
        const { data: publicUrlData } = supabaseAdmin.storage
          .from("video-assets")
          .getPublicUrl(filePath);
        imageUrl = publicUrlData.publicUrl;
      }
    } catch (dalleErr: any) {
      console.error("DALL-E generation error:", dalleErr);
      // Fallback placeholder
      imageUrl = `https://picsum.photos/seed/${videoId}_scene_${sceneId}/1792/1024`;
    }

    return NextResponse.json({
      sceneId,
      imageUrl,
    });
  } catch (err: any) {
    console.error("Image Generation Route Error:", err);
    return NextResponse.json({ error: err.message || "Ошибка при генерации изображения" }, { status: 500 });
  }
}
