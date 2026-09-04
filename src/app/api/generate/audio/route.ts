import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { openai } from "@/lib/openai";

export async function POST(req: NextRequest) {
  try {
    const { videoId, sceneId, narration, voice = "onyx" } = await req.json();

    if (!videoId || sceneId === undefined || !narration) {
      return NextResponse.json({ error: "videoId, sceneId и narration обязательны" }, { status: 400 });
    }

    // Call OpenAI TTS
    const validVoices = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"];
    const chosenVoice = validVoices.includes(voice) ? voice : "onyx";

    const mp3Response = await openai.audio.speech.create({
      model: "tts-1",
      voice: chosenVoice as any,
      input: narration,
    });

    const buffer = Buffer.from(await mp3Response.arrayBuffer());

    // Upload to Supabase Storage
    const filePath = `audio/${videoId}/scene_${sceneId}.mp3`;
    const { error: uploadError } = await supabaseAdmin.storage
      .from("video-assets")
      .upload(filePath, buffer, {
        contentType: "audio/mpeg",
        upsert: true,
      });

    if (uploadError) {
      console.error("Storage upload error:", uploadError);
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const { data: publicUrlData } = supabaseAdmin.storage
      .from("video-assets")
      .getPublicUrl(filePath);

    // Rough speech duration estimate: ~150 words per min = ~2.5 words/sec or ~15 chars/sec
    const estimatedSeconds = Math.max(5, Math.round(narration.length / 15));

    return NextResponse.json({
      sceneId,
      audioUrl: publicUrlData.publicUrl,
      estimatedDuration: estimatedSeconds,
    });
  } catch (err: any) {
    console.error("Audio Generation Error:", err);
    return NextResponse.json({ error: err.message || "Ошибка при генерации аудио" }, { status: 500 });
  }
}
