import { NextRequest, NextResponse } from "next/server";
import { decryptSecret } from "@/lib/crypto";
import { fetchSubscription } from "@/lib/elevenlabs";
import { probeOpenAiKey } from "@/lib/openai";
import { normalizeCost } from "@/lib/pricing";
import { requireUser } from "@/lib/session";
import { listUserVideos } from "@/lib/videos";

/**
 * Что у пользователя на счетах — для плиток в студии.
 * ElevenLabs отдаёт остаток кредитов; у OpenAI баланса в API нет, поэтому
 * показываем, жив ли ключ, и сколько через студию уже потрачено.
 */
export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;

  const elevenKey = decryptSecret(auth.user.elevenlabs_key_enc);
  const openaiKey = decryptSecret(auth.user.openai_key_enc);

  const [sub, openaiOk] = await Promise.all([
    elevenKey ? fetchSubscription(elevenKey) : Promise.resolve(null),
    openaiKey ? probeOpenAiKey(openaiKey) : Promise.resolve(false),
  ]);

  // Сумма по своим фильмам: фактическая стоимость записана у каждого.
  let spentOpenAiUsd = 0;
  let spentCredits = 0;
  for (const video of listUserVideos(auth.user.id, 500)) {
    const cost = normalizeCost(video.cost);
    if (!cost) continue;
    spentOpenAiUsd += (cost.llm?.usd || 0) + (cost.images?.usd || 0);
    spentCredits += cost.tts?.credits || 0;
  }

  return NextResponse.json({
    elevenlabs: sub
      ? {
          available: true,
          used: sub.characterCount,
          limit: sub.characterLimit,
          remaining: Math.max(0, sub.characterLimit - sub.characterCount),
          tier: sub.tier,
          resetAt: sub.nextResetUnix ? new Date(sub.nextResetUnix * 1000).toISOString() : null,
        }
      : { available: false },
    openai: { hasKey: !!openaiKey, valid: openaiOk },
    spent: { openaiUsd: Math.round(spentOpenAiUsd * 100) / 100, credits: spentCredits },
  });
}
