import { NextRequest, NextResponse } from "next/server";
import { encryptSecret } from "@/lib/crypto";
import { validateElevenLabsKey } from "@/lib/elevenlabs-key";
import { requireUser } from "@/lib/session";
import { setElevenLabsKey } from "@/lib/users";

/** Обновить или удалить свой ключ ElevenLabs. Пустая строка — удалить. */
export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;

  const body = await req.json().catch(() => ({}));
  const raw = typeof body?.elevenLabsKey === "string" ? body.elevenLabsKey.trim() : "";

  let encrypted: string | null = null;
  if (raw) {
    const key = validateElevenLabsKey(raw);
    if (!key) return NextResponse.json({ error: "Ключ выглядит некорректно" }, { status: 400 });
    encrypted = encryptSecret(key);
  }

  setElevenLabsKey(auth.user.id, encrypted);
  return NextResponse.json({ success: true, hasElevenLabsKey: !!encrypted });
}
