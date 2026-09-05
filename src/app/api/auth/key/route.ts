import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { requireUser } from "@/lib/session";
import { encryptSecret } from "@/lib/crypto";
import { validateElevenLabsKey } from "@/lib/elevenlabs-key";

/** Обновить или удалить свой ключ ElevenLabs. Пустая строка — удалить. */
export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;

  try {
    const body = await req.json().catch(() => ({}));
    const raw = typeof body?.elevenLabsKey === "string" ? body.elevenLabsKey.trim() : "";

    let encrypted: string | null = null;
    if (raw) {
      const key = validateElevenLabsKey(raw);
      if (!key) {
        return NextResponse.json({ error: "Ключ выглядит некорректно" }, { status: 400 });
      }
      encrypted = encryptSecret(key);
    }

    const { error } = await supabaseAdmin
      .from("access_codes")
      .update({ elevenlabs_key_enc: encrypted })
      .eq("id", auth.user.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true, hasElevenLabsKey: !!encrypted });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Ошибка сервера" }, { status: 500 });
  }
}
