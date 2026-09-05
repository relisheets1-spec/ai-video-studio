import { NextRequest, NextResponse } from "next/server";
import { normalizeLanguage } from "@/lib/content/languages";
import { logPipelineError } from "@/lib/pipeline-log";
import { requireUser } from "@/lib/session";
import { decryptSecret } from "@/lib/crypto";
import { MAX_SCENES } from "@/lib/plan";
import { synthesize, type SynthResult } from "@/lib/elevenlabs";
import { modelForLanguage, resolveVoice, settingsForModel } from "@/lib/content/voices";
import { saveSceneAudio } from "@/lib/storage";
import { getOwnedVideo } from "@/lib/videos";
import { ELEVENLABS_API_KEY } from "@/lib/env";

/** Сегментация держит кадр в пределах ~700 символов; это страховочный потолок. */
const MAX_NARRATION_CHARS = 1500;

/** Человеческое описание ошибки ElevenLabs из тела ответа. */
function describeElevenError(body: string): string {
  try {
    const parsed = JSON.parse(body);
    const detail = parsed?.detail;
    if (typeof detail === "string") return detail;
    if (detail?.message) return String(detail.message);
    if (detail?.status) return String(detail.status);
  } catch {}
  return body.slice(0, 160) || "без описания";
}

/**
 * Озвучка кадра. Только ElevenLabs, только модель из каталога (Eleven v3):
 * запасной озвучки OpenAI больше нет — если ElevenLabs не ответил, кадр не
 * делается, и генерация останавливается с понятной ошибкой.
 */
export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;
  const { user } = auth;

  let loggedVideoId: string | null = null;
  try {
    const { videoId, sceneId, narration, voice, language } = await req.json();

    if (!videoId || sceneId === undefined || !narration) {
      return NextResponse.json({ error: "videoId, sceneId и narration обязательны" }, { status: 400 });
    }
    if (!Number.isInteger(sceneId) || sceneId < 1 || sceneId > MAX_SCENES) {
      return NextResponse.json({ error: "Недопустимый номер сцены" }, { status: 400 });
    }
    loggedVideoId = typeof videoId === "string" ? videoId : null;

    const video = getOwnedVideo(videoId, user.id);
    if (!video) {
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
    const envKey = ELEVENLABS_API_KEY;

    let buffer: Buffer | null = null;
    let requestId: string | null = null;
    let keyRejected = false;
    let keyOwner: "user" | "env" | null = null;
    let lastError: { status: number; body: string } | null = null;

    // Eleven v3 не принимает previous_text / next_text / previous_request_ids
    // («not yet supported with the 'eleven_v3' model», HTTP 400) — кадр
    // озвучивается сам по себе, без кондиционирования соседями.
    const body: Record<string, unknown> = {
      text: cleanNarration,
      model_id: model,
      voice_settings: settingsForModel(model),
    };

    const tryKey = (apiKey: string): Promise<SynthResult> => synthesize(apiKey, voiceId, body);

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
        lastError = { status: result.status, body: result.body };
        console.warn("ElevenLabs TTS error:", result.status, result.body);
        if (candidate.owner === "user" && (result.status === 401 || result.status === 403)) keyRejected = true;
      } catch (elevenErr: any) {
        lastError = { status: 0, body: String(elevenErr?.message || elevenErr) };
        console.warn("ElevenLabs TTS network error:", elevenErr);
      }
    }

    if (!buffer) {
      const reason = !candidates.length
        ? "Нет ключа ElevenLabs — добавьте свой ключ в настройках."
        : keyRejected && candidates.length === 1
          ? "ElevenLabs отклонил ваш ключ — проверьте его в настройках."
          : lastError
            ? `ElevenLabs вернул ошибку${lastError.status ? ` ${lastError.status}` : ""}: ${describeElevenError(lastError.body)}`
            : "ElevenLabs не ответил.";
      logPipelineError({ stage: "tts", videoId: loggedVideoId, message: `scene ${sceneId}: ${reason}` });
      return NextResponse.json({ error: `Озвучка кадра ${sceneId} не удалась. ${reason}`, keyRejected }, { status: 502 });
    }

    const audioUrl = await saveSceneAudio(videoId, sceneId, buffer);

    const estimatedSeconds = Math.max(4, Math.round(cleanNarration.length / 13));

    return NextResponse.json({
      sceneId,
      audioUrl,
      estimatedDuration: estimatedSeconds,
      requestId,
      keyRejected,
      // Для учёта стоимости
      model,
      keyOwner,
      characters: cleanNarration.length,
    });
  } catch (err: any) {
    logPipelineError({ stage: "tts", videoId: loggedVideoId, message: err?.message || String(err) });
    return NextResponse.json({ error: err.message || "Ошибка при генерации аудио" }, { status: 500 });
  }
}
