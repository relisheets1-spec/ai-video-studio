import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { decryptSecret } from "@/lib/crypto";
import { fetchSubscription } from "@/lib/elevenlabs";

/** Остаток кредитов ElevenLabs по ключу пользователя. Отдельно от /me, чтобы не тормозить каждый вход. */
export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;

  const key = decryptSecret(auth.user.elevenlabs_key_enc);
  if (!key) return NextResponse.json({ available: false });

  const sub = await fetchSubscription(key);
  if (!sub) return NextResponse.json({ available: false });

  return NextResponse.json({
    available: true,
    tier: sub.tier,
    used: sub.characterCount,
    limit: sub.characterLimit,
    remaining: Math.max(0, sub.characterLimit - sub.characterCount),
    resetAt: sub.nextResetUnix ? new Date(sub.nextResetUnix * 1000).toISOString() : null,
  });
}
