import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { openai } from "@/lib/openai";

// Fallback mappings for ElevenLabs: strictly avoid English voice fallbacks (Brian/Sarah)
const FALLBACK_MAP: Record<string, string> = {};

export async function POST(req: NextRequest) {
  try {
    const { videoId, sceneId, narration, voice = "s0phbFBBp708ZeIy8oGx", elevenLabsApiKey } = await req.json();

    const effectiveApiKey =
      typeof elevenLabsApiKey === "string" && elevenLabsApiKey.trim().length > 10
        ? elevenLabsApiKey.trim()
        : process.env.ELEVENLABS_API_KEY ? process.env.ELEVENLABS_API_KEY.trim() : "";

    if (!videoId || sceneId === undefined || !narration) {
      return NextResponse.json({ error: "videoId, sceneId и narration обязательны" }, { status: 400 });
    }

    if (typeof sceneId !== "number" || sceneId < 0 || sceneId > 40) {
      return NextResponse.json({ error: "Недопустимый номер сцены" }, { status: 400 });
    }

    // Verify valid active video session (protects TTS from abuse)
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
    let buffer: Buffer | null = null;

    // 1. If ElevenLabs key is available, attempt ElevenLabs synthesis first
    if (effectiveApiKey) {
      let voiceId = voice || "s0phbFBBp708ZeIy8oGx";
      if (
        FALLBACK_MAP[voiceId] &&
        !voiceId.includes("s0phbFBBp708ZeIy8oGx") &&
        !voiceId.includes("Jhqrj1kYppTq06Kj3KFa") &&
        !voiceId.includes("nPczCjzI2devNBz1zQrb") &&
        !voiceId.includes("EXAVITQu4vr4xnSDxMaL") &&
        !voiceId.includes("JBFqnCBsd6RMkjVDRZzb") &&
        !voiceId.includes("pNInz6obpgDQGcFmaJgB") &&
        !voiceId.includes("FGY2WhTYpPnrIDTdsKH5")
      ) {
        voiceId = FALLBACK_MAP[voiceId];
      }

      try {
        let elevenRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
          method: "POST",
          headers: {
            "xi-api-key": effectiveApiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            text: cleanNarration,
            model_id: "eleven_v3",
            voice_settings: {
              stability: 0.5,
              similarity_boost: 0.75,
            },
          }),
        });

        // If eleven_v3 is restricted or errors, retry with multilingual_v2
        if (!elevenRes.ok && elevenRes.status !== 401) {
          elevenRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
            method: "POST",
            headers: {
              "xi-api-key": effectiveApiKey,
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

        // Retry with premade fallback voice if library voice is restricted
        if (elevenRes.status === 402 && FALLBACK_MAP[voiceId]) {
          const fallbackVoiceId = FALLBACK_MAP[voiceId];
          elevenRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${fallbackVoiceId}`, {
            method: "POST",
            headers: {
              "xi-api-key": effectiveApiKey,
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

        if (elevenRes.ok) {
          const audioArrayBuffer = await elevenRes.arrayBuffer();
          buffer = Buffer.from(audioArrayBuffer);
        } else {
          console.warn("ElevenLabs TTS returned error status:", elevenRes.status, await elevenRes.text());
        }
      } catch (elevenErr) {
        console.warn("ElevenLabs TTS network error, falling back to OpenAI TTS:", elevenErr);
      }
    }

    // 2. Fallback to OpenAI TTS if ElevenLabs was unavailable or failed
    if (!buffer) {
      try {
        const isFemale =
          voice.toLowerCase().includes("sarah") ||
          voice.toLowerCase().includes("mishki") ||
          voice.toLowerCase().includes("айгерім") ||
          voice.toLowerCase().includes("female") ||
          voice === "Jhqrj1kYppTq06Kj3KFa" ||
          voice === "EXAVITQu4vr4xnSDxMaL";
        const openaiVoice = isFemale ? "nova" : "onyx";

        const openAiRes = await openai.audio.speech.create({
          model: "tts-1",
          voice: openaiVoice,
          input: cleanNarration,
        });

        const openAiBuffer = await openAiRes.arrayBuffer();
        buffer = Buffer.from(openAiBuffer);
      } catch (openAiErr: any) {
        console.error("OpenAI TTS Fallback Error:", openAiErr);
        throw new Error("Не удалось сгенерировать аудио озвучки");
      }
    }

    // 3. Upload audio to Supabase Storage
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
    return NextResponse.json({ error: err.message || "Ошибка при генерации аудио" }, { status: 500 });
  }
}
