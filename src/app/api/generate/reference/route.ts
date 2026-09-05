import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase";
import { requireUser } from "@/lib/session";
import { analyzeReference } from "@/lib/reference";
import { logPipelineError } from "@/lib/pipeline-log";

export const maxDuration = 60;

const MAX_BYTES = 8 * 1024 * 1024;
const TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

/**
 * Загрузка референса: файл → хранилище → GPT-4o описывает субъект и стиль.
 * Описание и usage возвращаются клиенту и уходят вместе с запросом сценария.
 */
export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;
  const { user } = auth;

  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Файл не получен" }, { status: 400 });
    }
    const ext = TYPES[file.type];
    if (!ext) {
      return NextResponse.json({ error: "Поддерживаются PNG, JPG и WebP" }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "Файл больше 8 МБ" }, { status: 400 });
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const path = `refs/${user.id}/${crypto.randomUUID()}.${ext}`;
    const { error: uploadError } = await supabaseAdmin.storage
      .from("video-assets")
      .upload(path, bytes, { contentType: file.type, upsert: false });
    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }
    const { data: pub } = supabaseAdmin.storage.from("video-assets").getPublicUrl(path);

    const { analysis, usage } = await analyzeReference(pub.publicUrl);

    return NextResponse.json({ url: pub.publicUrl, path, analysis, usage });
  } catch (err: any) {
    await logPipelineError({ stage: "llm", videoId: null, message: "reference: " + (err?.message || String(err)) });
    return NextResponse.json({ error: err.message || "Не удалось обработать референс" }, { status: 500 });
  }
}
