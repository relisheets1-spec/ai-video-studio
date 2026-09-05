import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { openai } from "@/lib/openai";
import { normalizeLanguage } from "@/lib/content/languages";
import { logPipelineError } from "@/lib/pipeline-log";
import { requireUser } from "@/lib/session";
import { decryptSecret } from "@/lib/crypto";
import { MAX_SCENES } from "@/lib/plan";
import { synthesize, type SynthResult } from "@/lib/elevenlabs";
import {
  findVoice,
  modelForLanguage,
  resolveVoice,
  settingsForModel,
} from "@/lib/content/voices";

/** Сегментация держит кадр в пределах ~700 символов; это страховочный потолок. */
const MAX_NARRATION_CHARS = 1500;

export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;
  const { user } = auth;

  let loggedVideoId: string | null = null;
  try {
    const { videoId, sceneId, narration, voice, language, previousText, nextText, previousRequestIds } =
      await req.json();

    if (!videoId || sceneId === undefined || !narration) {
      return NextResponse.json({ error: "videoId, sceneId и narration обязательны" }, { status: 400 });
    }
    if (!Number.isInteger(sceneId) || sceneId < 1 || sceneId > MAX_SCENES) {
      return NextResponse.json({ error: "Недопустимый номер сцены" }, { status: 400 });
    }
    loggedVideoId = typeof videoId === "string" ? videoId : null;

    const { data: video, error: videoErr } = await supabaseAdmin
      .from("video_generations")
      .select("id, user_id, created_at")
      .eq("id", videoId)
      .single();
    if (videoErr || !video || video.user_id !== user.id) {
      return NextResponse.json({ error: "Доступ запрещен: чужое или неизвестное видео" }, { status: 403 });
    }
    if (Date.now() - new Date(video.created_at).getTime() > 2 * 60 * 60 * 1000) {
      return NextResponse.json({ error: "Сессия генерации видео истекла (более 2 часов)" }, { status: 403 });
    }

    const rawNarration = String(narration).trim();
    if (rawNarration.length > MAX_NARRATION_CHARS) {
      console.warn(`Narration for scene ${sceneId} truncated: ${rawNarration.length} > ${MAX_NARRATION_CHARS} chars`);
    }
    const cleanNarration = rawNarration.slice(0, MAX_NARRATION_CHARS);

    const lang = normalizeLanguage(language);
    const voiceId = resolveVoice(voice, lang);
    const model = modelForLanguage(lang);

    // Ключ из аккаунта пользователя; общий ключ окружения — только запасной.
    const userKey = decryptSecret(user.elevenlabs_key_enc);
    const envKey = process.env.ELEVENLABS_API_KEY?.trim() || "";

    let buffer: Buffer | null = null;
    let requestId: string | null = null;
    let usedFallback = false;
    let keyRejected = false;
    let keyOwner: "user" | "env" | null = null;

    const body: Record<string, unknown> = {
      text: cleanNarration,
      model_id: model,
      voice_settings: settingsForModel(model),
    };
    if (typeof previousText === "string" && previousText.trim()) body.previous_text = previousText.slice(-250);
    if (typeof nextText === "string" && nextText.trim()) body.next_text = nextText.slice(0, 250);
    if (Array.isArray(previousRequestIds) && previousRequestIds.length > 0) {
      body.previous_request_ids = previousRequestIds.filter(Boolean).slice(-3);
    }

    const tryKey = async (apiKey: string): Promise<SynthResult> => {
      let result = await synthesize(apiKey, voiceId, body);
      // Кондиционирование хрупкое: один повтор без него — и дальше как обычно.
      if (!result.ok && result.status >= 400 && result.status < 500 && result.status !== 401 && body.previous_request_ids) {
        console.warn("ElevenLabs rejected conditioning, retrying without it:", result.status);
        const { previous_request_ids, ...withoutIds } = body;
        result = await synthesize(apiKey, voiceId, withoutIds);
      }
      return result;
    };

    const candidates: Array<{ key: string; owner: "user" | "env" }> = [];
    if (userKey) candidates.push({ key: userKey, owner: "user" });
    if (envKey) candidates.push({ key: envKey, owner: "env" });

    for (const candidate of candidates) {
      try {
        const result = await tryKey(candidate.key);
        if (result.ok) {
          buffer = result.buffer;
          requestId = result.requestId;
          keyOwner = candidate.owner;
          break;
        }
        console.warn("ElevenLabs TTS error:", result.status, result.body);
        if (candidate.owner === "user" && (result.status === 401 || result.status === 403)) keyRejected = true;
      } catch (elevenErr) {
        console.warn("ElevenLabs TTS network error:", elevenErr);
      }
    }

    if (!buffer) {
      usedFallback = true;
      try {
        const catalogVoice = findVoice(voiceId);
        const openAiRes = await openai.audio.speech.create({
          model: "gpt-4o-mini-tts",
          voice: catalogVoice?.gender === "female" ? "nova" : "onyx",
          input: cleanNarration,
          instructions:
            lang === "en"
              ? "Calm cinematic documentary narrator. Low register, measured pace."
              : "Спокойный кинематографичный диктор. Низкий регистр, размеренный темп.",
        } as any);
        buffer = Buffer.from(await openAiRes.arrayBuffer());
      } catch (openAiErr: any) {
        console.error("OpenAI TTS Fallback Error:", openAiErr);
        throw new Error("Не удалось сгенерировать аудио озвучки");
      }
    }

    const filePath = `audio/${videoId}/scene_${sceneId}.mp3`;
    const { error: uploadError } = await supabaseAdmin.storage
      .from("video-assets")
      .upload(filePath, buffer, { contentType: "audio/mpeg", upsert: true });
    if (uploadError) {
      console.error("Storage upload error:", uploadError);
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }
    const { data: publicUrlData } = supabaseAdmin.storage.from("video-assets").getPublicUrl(filePath);

    const estimatedSeconds = Math.max(4, Math.round(cleanNarration.length / 13));

    return NextResponse.json({
      sceneId,
      audioUrl: publicUrlData.publicUrl,
      estimatedDuration: estimatedSeconds,
      requestId,
      usedFallback,
      keyRejected,
      // Для учёта стоимости
      provider: usedFallback ? "openai" : "elevenlabs",
      model: usedFallback ? "gpt-4o-mini-tts" : model,
      keyOwner: usedFallback ? null : keyOwner,
      characters: cleanNarration.length,
    });
  } catch (err: any) {
    await logPipelineError({ stage: "tts", videoId: loggedVideoId, message: err?.message || String(err) });
    return NextResponse.json({ error: err.message || "Ошибка при генерации аудио" }, { status: 500 });
  }
}
