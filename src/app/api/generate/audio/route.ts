import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { openai } from "@/lib/openai";
import { normalizeLanguage } from "@/lib/content/languages";
import {
  findVoice,
  modelForLanguage,
  resolveVoice,
  settingsForModel,
} from "@/lib/content/voices";

/** Запас с большим гандикапом: 45-55 слов кириллицей это ~350-420 символов. */
const MAX_NARRATION_CHARS = 1500;

export async function POST(req: NextRequest) {
  try {
    const {
      videoId,
      sceneId,
      narration,
      voice,
      language,
      previousText,
      nextText,
      previousRequestIds,
      elevenLabsApiKey,
    } = await req.json();

    const effectiveApiKey =
      typeof elevenLabsApiKey === "string" && elevenLabsApiKey.trim().length > 10
        ? elevenLabsApiKey.trim()
        : process.env.ELEVENLABS_API_KEY
        ? process.env.ELEVENLABS_API_KEY.trim()
        : "";

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

    const rawNarration = String(narration).trim();
    if (rawNarration.length > MAX_NARRATION_CHARS) {
      // Раньше обрезка на 600 символов происходила молча, и конец фразы просто
      // пропадал из озвучки. Теперь сегментатор держит фрагменты короткими,
      // а если лимит всё же достигнут — это видно в логах.
      console.warn(
        `Narration for scene ${sceneId} truncated: ${rawNarration.length} > ${MAX_NARRATION_CHARS} chars`
      );
    }
    const cleanNarration = rawNarration.slice(0, MAX_NARRATION_CHARS);

    const lang = normalizeLanguage(language);
    const voiceId = resolveVoice(voice, lang);
    // Модель выбирается по языку детерминированно. Прежняя схема всегда
    // пробовала v3 и молча ретраила на multilingual_v2 при любой ошибке —
    // из-за чего один кадр посреди ролика мог прийти от другой модели и
    // тембр слышно менялся.
    const model = modelForLanguage(lang);

    let buffer: Buffer | null = null;
    let requestId: string | null = null;
    let usedFallback = false;

    if (effectiveApiKey) {
      try {
        const body: Record<string, unknown> = {
          text: cleanNarration,
          model_id: model,
          voice_settings: settingsForModel(model),
        };

        // Кондиционирование соседними фрагментами: без него 30 независимо
        // синтезированных файлов имеют независимую просодию, и на стыках
        // слышны швы. Это штатная возможность API ровно для нарезанного
        // повествования.
        if (typeof previousText === "string" && previousText.trim()) {
          body.previous_text = previousText.slice(-250);
        }
        if (typeof nextText === "string" && nextText.trim()) {
          body.next_text = nextText.slice(0, 250);
        }
        if (Array.isArray(previousRequestIds) && previousRequestIds.length > 0) {
          body.previous_request_ids = previousRequestIds.filter(Boolean).slice(-3);
        }

        const call = async (payload: Record<string, unknown>) =>
          fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
            method: "POST",
            headers: {
              "xi-api-key": effectiveApiKey,
              "Content-Type": "application/json",
              Accept: "audio/mpeg",
            },
            body: JSON.stringify(payload),
          });

        let elevenRes = await call(body);

        // Кондиционирование хрупкое: id истекают и требуют совпадения голоса,
        // модели и настроек. Один повтор без него — и дальше как обычно.
        if (!elevenRes.ok && elevenRes.status >= 400 && elevenRes.status < 500 && body.previous_request_ids) {
          console.warn("ElevenLabs rejected conditioning, retrying without it:", elevenRes.status);
          const { previous_request_ids, ...withoutIds } = body;
          elevenRes = await call(withoutIds);
        }

        if (elevenRes.ok) {
          buffer = Buffer.from(await elevenRes.arrayBuffer());
          requestId = elevenRes.headers.get("request-id");
        } else {
          console.warn("ElevenLabs TTS error:", elevenRes.status, await elevenRes.text());
        }
      } catch (elevenErr) {
        console.warn("ElevenLabs TTS network error, falling back to OpenAI TTS:", elevenErr);
      }
    }

    // Запасной путь. Пол берём из каталога, а не угадываем по строке имени.
    if (!buffer) {
      usedFallback = true;
      try {
        const catalogVoice = findVoice(voiceId);
        const openaiVoice = catalogVoice?.gender === "female" ? "nova" : "onyx";

        const openAiRes = await openai.audio.speech.create({
          model: "gpt-4o-mini-tts",
          voice: openaiVoice,
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

    // Upload audio to Supabase Storage
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

    // Заглушка до загрузки метаданных: и плеер, и экспортёр всё равно
    // пересчитают длительность по реальному MP3.
    const estimatedSeconds = Math.max(4, Math.round(cleanNarration.length / 13));

    return NextResponse.json({
      sceneId,
      audioUrl: publicUrlData.publicUrl,
      estimatedDuration: estimatedSeconds,
      requestId,
      usedFallback,
    });
  } catch (err: any) {
    console.error("Audio Generation Error:", err);
    return NextResponse.json({ error: err.message || "Ошибка при генерации аудио" }, { status: 500 });
  }
}
