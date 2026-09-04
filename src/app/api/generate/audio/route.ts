import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

const ELEVENLABS_API_KEY =
  process.env.ELEVENLABS_API_KEY || "sk_d9b27d5d621e8b5d37ff215dc8280a0f3c140dc89810d9ca";

// Fallback mappings for ElevenLabs free tier in case library voices are restricted
const FALLBACK_MAP: Record<string, string> = {
  "s0phbFBBp708ZeIy8oGx": "nPczCjzI2devNBz1zQrb", // Arcadays -> Brian (deep resonant baritone)
  "Jhqrj1kYppTq06Kj3KFa": "EXAVITQu4vr4xnSDxMaL", // Mishki -> Sarah (warm confident female)
  "alloy": "nPczCjzI2devNBz1zQrb",
  "echo": "JBFqnCBsd6RMkjVDRZzb",
  "fable": "pNInz6obpgDQGcFmaJgB",
  "onyx": "nPczCjzI2devNBz1zQrb",
  "nova": "EXAVITQu4vr4xnSDxMaL",
  "shimmer": "pFZP5JQG7iQjIQuC4Bku",
};

export async function POST(req: NextRequest) {
  try {
    const { videoId, sceneId, narration, voice = "s0phbFBBp708ZeIy8oGx" } = await req.json();

    if (!videoId || sceneId === undefined || !narration) {
      return NextResponse.json({ error: "videoId, sceneId и narration обязательны" }, { status: 400 });
    }

    if (typeof sceneId !== "number" || sceneId < 0 || sceneId > 40) {
      return NextResponse.json({ error: "Недопустимый номер сцены" }, { status: 400 });
    }

    // Verify valid active video session (protects ElevenLabs API from external abuse)
    const { data: video, error: videoErr } = await supabaseAdmin
      .from("video_generations")
      .select("id, created_at")
      .eq("id", videoId)
      .single();

    if (videoErr || !video) {
      return NextResponse.json({ error: "Доступ запрещен: неизвестный идентификатор видео" }, { status: 403 });
    }

    const sessionAge = Date.now() - new Date(video.created_at).getTime();
    if (sessionAge > 2 * 60 * 60 * 1000) {
      return NextResponse.json({ error: "Сессия генерации видео истекла (более 2 часов)" }, { status: 403 });
    }

    const cleanNarration = String(narration).slice(0, 600).trim();

    // Determine initial voice ID
    let voiceId = voice || "s0phbFBBp708ZeIy8oGx";
    if (
      FALLBACK_MAP[voiceId] &&
      !voiceId.includes("s0phbFBBp708ZeIy8oGx") &&
      !voiceId.includes("Jhqrj1kYppTq06Kj3KFa") &&
      !voiceId.includes("nPczCjzI2devNBz1zQrb") &&
      !voiceId.includes("EXAVITQu4vr4xnSDxMaL") &&
      !voiceId.includes("JBFqnCBsd6RMkjVDRZzb") &&
      !voiceId.includes("pNInz6obpgDQGcFmaJgB")
    ) {
      voiceId = FALLBACK_MAP[voiceId];
    }

    // Call ElevenLabs Text-to-Speech API
    let elevenRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: "POST",
      headers: {
        "xi-api-key": ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: cleanNarration,
        model_id: "eleven_multilingual_v2", // Multilingual model for RU and KZ
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
        },
      }),
    });

    // If Free tier restricts community library voices, automatically retry with premade ElevenLabs voice
    if (elevenRes.status === 402 && FALLBACK_MAP[voiceId]) {
      const fallbackVoiceId = FALLBACK_MAP[voiceId];
      console.warn(`ElevenLabs free tier library restriction. Falling back to premade voice: ${fallbackVoiceId}`);
      elevenRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${fallbackVoiceId}`, {
        method: "POST",
        headers: {
          "xi-api-key": ELEVENLABS_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: cleanNarration,
          model_id: "eleven_multilingual_v2",
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
          },
        }),
      });
    }

    if (!elevenRes.ok) {
      const errText = await elevenRes.text();
      console.error("ElevenLabs TTS Error:", elevenRes.status, errText);
      throw new Error(`Ошибка ElevenLabs (${elevenRes.status}): ${errText}`);
    }

    const audioArrayBuffer = await elevenRes.arrayBuffer();
    const buffer = Buffer.from(audioArrayBuffer);

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

    // Duration calculation: ~13-15 chars per sec for natural speech
    const estimatedSeconds = Math.max(5, Math.round(cleanNarration.length / 13));

    return NextResponse.json({
      sceneId,
      audioUrl: publicUrlData.publicUrl,
      estimatedDuration: estimatedSeconds,
    });
  } catch (err: any) {
    console.error("Audio Generation Error:", err);
    return NextResponse.json({ error: err.message || "Ошибка при генерации аудио ElevenLabs" }, { status: 500 });
  }
}
