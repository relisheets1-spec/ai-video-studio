import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { requireUser, toPublicUser } from "@/lib/session";
import { decryptSecret } from "@/lib/crypto";
import { MAX_SCENES } from "@/lib/plan";
import { fetchHistoryCredits, fetchSubscription } from "@/lib/elevenlabs";
import { computeVideoCost, type ImageFrameUsage, type TtsFrameUsage, type VideoCost } from "@/lib/pricing";

export const maxDuration = 60;

const str = (v: unknown, max = 120) => (typeof v === "string" ? v.slice(0, max) : null);
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

function parseTtsUsage(raw: unknown): TtsFrameUsage[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, MAX_SCENES).map((f: any) => ({
    sceneId: num(f?.sceneId),
    requestId: str(f?.requestId),
    characters: Math.max(0, Math.round(num(f?.characters))),
    model: str(f?.model, 60),
    provider: f?.provider === "openai" ? "openai" : "elevenlabs",
    keyOwner: f?.keyOwner === "user" || f?.keyOwner === "env" ? f.keyOwner : null,
    audioSeconds: Math.max(0, num(f?.audioSeconds)),
  }));
}

function parseImageUsage(raw: unknown): ImageFrameUsage[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, MAX_SCENES).map((f: any) => ({
    sceneId: num(f?.sceneId),
    model: str(f?.model, 60) || "gpt-image-1-mini",
    quality: str(f?.quality, 20) || "medium",
    size: str(f?.size, 20) || "1536x1024",
    usage: f?.usage
      ? {
          inputTokens: Math.max(0, num(f.usage.inputTokens)),
          outputTokens: Math.max(0, num(f.usage.outputTokens)),
          totalTokens: Math.max(0, num(f.usage.totalTokens)),
        }
      : null,
  }));
}

export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;
  const { user } = auth;

  try {
    const body = await req.json();
    const { videoId, scenes, totalDuration } = body;
    if (!videoId || typeof videoId !== "string") {
      return NextResponse.json({ error: "videoId обязателен" }, { status: 400 });
    }

    const { data: video } = await supabaseAdmin
      .from("video_generations")
      .select("id, user_id, status, cost")
      .eq("id", videoId)
      .maybeSingle();
    if (!video || video.user_id !== user.id) {
      return NextResponse.json({ error: "Доступ запрещен: чужое или неизвестное видео" }, { status: 403 });
    }

    const durationSeconds = Math.max(
      0,
      Math.round(
        Number(totalDuration) ||
          (Array.isArray(scenes)
            ? scenes.reduce(
                (acc: number, sc: any) => acc + (Number(sc?.actualDuration) || Number(sc?.durationEstimate) || 0),
                0
              )
            : 0)
      )
    );

    // --- Стоимость: usage по кадрам от клиента + точные кредиты из истории ElevenLabs ---
    let cost: VideoCost | null = null;
    try {
      const ttsFrames = parseTtsUsage(body?.usage?.tts);
      const imageFrames = parseImageUsage(body?.usage?.images);
      const prior: any = video.cost || {};
      const startedAt: string | null = typeof prior.startedAt === "string" ? prior.startedAt : null;
      const creditsBefore: number | null = Number.isFinite(Number(prior?.tts?.creditsBefore)) && prior?.tts?.creditsBefore !== null
        ? Number(prior.tts.creditsBefore)
        : null;
      let characterLimit: number | null = Number.isFinite(Number(prior?.tts?.characterLimit)) && prior?.tts?.characterLimit !== null
        ? Number(prior.tts.characterLimit)
        : null;

      const historyCredits = new Map<string, number>();
      let creditsAfter: number | null = null;

      const userKey = decryptSecret(user.elevenlabs_key_enc);
      const envKey = process.env.ELEVENLABS_API_KEY?.trim() || "";
      const sinceUnix = startedAt ? Math.floor(Date.parse(startedAt) / 1000) : Math.floor(Date.now() / 1000) - 3 * 3600;

      const byOwner: Record<"user" | "env", string[]> = { user: [], env: [] };
      for (const f of ttsFrames) {
        if (f.provider === "elevenlabs" && f.requestId && f.keyOwner) byOwner[f.keyOwner].push(f.requestId);
      }
      if (userKey && byOwner.user.length) {
        const found = await fetchHistoryCredits(userKey, { sinceUnix, requestIds: byOwner.user });
        found.forEach((v, k) => historyCredits.set(k, v));
      }
      if (envKey && byOwner.env.length) {
        const found = await fetchHistoryCredits(envKey, { sinceUnix, requestIds: byOwner.env });
        found.forEach((v, k) => historyCredits.set(k, v));
      }
      if (userKey) {
        const sub = await fetchSubscription(userKey);
        if (sub) {
          creditsAfter = sub.characterCount;
          if (characterLimit === null) characterLimit = sub.characterLimit;
        }
      }

      cost = computeVideoCost({
        startedAt,
        llm: prior.llm || null,
        images: imageFrames,
        tts: ttsFrames,
        historyCredits,
        creditsBefore,
        creditsAfter,
        characterLimit,
      });
    } catch (costErr) {
      // Учёт не должен ронять сохранение фильма.
      console.error("Cost computation failed:", costErr);
    }

    const { error: videoError } = await supabaseAdmin
      .from("video_generations")
      .update({
        scenes: scenes || [],
        actual_duration_seconds: durationSeconds,
        status: "completed",
        updated_at: new Date().toISOString(),
        ...(cost ? { cost } : {}),
      })
      .eq("id", videoId);
    if (videoError) {
      return NextResponse.json({ error: videoError.message }, { status: 500 });
    }

    // Списываем генерацию один раз: повторный finalize баланс не трогает.
    let newUsed = user.generations_used || 0;
    if (video.status !== "completed") {
      newUsed += 1;
      const { error: userUpdateError } = await supabaseAdmin
        .from("access_codes")
        .update({ generations_used: newUsed })
        .eq("id", user.id);
      if (userUpdateError) {
        return NextResponse.json({ error: userUpdateError.message }, { status: 500 });
      }
    }

    const publicUser = toPublicUser({ ...user, generations_used: newUsed });
    return NextResponse.json({
      success: true,
      generationsUsed: newUsed,
      remaining: publicUser.remaining,
      user: publicUser,
      cost,
    });
  } catch (err: any) {
    console.error("Finalize Error:", err);
    return NextResponse.json({ error: err.message || "Ошибка при финализации" }, { status: 500 });
  }
}
