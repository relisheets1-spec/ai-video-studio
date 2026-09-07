import { NextRequest, NextResponse } from "next/server";
import { encryptSecret } from "@/lib/crypto";
import { validateElevenLabsKey } from "@/lib/elevenlabs-key";
import { validateOpenAiKey } from "@/lib/openai";
import { requireUser } from "@/lib/session";
import { findUserById, setElevenLabsKey, setOpenAiKey, toPublicUser } from "@/lib/users";

/**
 * Ключи пользователя: ElevenLabs и OpenAI. Передано поле — обновляем,
 * пустая строка — удаляем, поле отсутствует — не трогаем. Хранятся
 * зашифрованными, наружу не отдаются.
 */
export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;

  const body = await req.json().catch(() => ({}));

  if (typeof body?.elevenLabsKey === "string") {
    const raw = body.elevenLabsKey.trim();
    if (raw) {
      const key = validateElevenLabsKey(raw);
      if (!key) return NextResponse.json({ error: "Ключ ElevenLabs выглядит некорректно" }, { status: 400 });
      setElevenLabsKey(auth.user.id, encryptSecret(key));
    } else {
      setElevenLabsKey(auth.user.id, null);
    }
  }

  if (typeof body?.openAiKey === "string") {
    const raw = body.openAiKey.trim();
    if (raw) {
      const key = validateOpenAiKey(raw);
      if (!key) return NextResponse.json({ error: "Ключ OpenAI выглядит некорректно (обычно начинается с sk-)" }, { status: 400 });
      setOpenAiKey(auth.user.id, encryptSecret(key));
    } else {
      setOpenAiKey(auth.user.id, null);
    }
  }

  const fresh = findUserById(auth.user.id) || auth.user;
  return NextResponse.json({ success: true, user: toPublicUser(fresh) });
}
