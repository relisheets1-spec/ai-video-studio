import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { analyzeReference } from "@/lib/reference";
import { logPipelineError } from "@/lib/pipeline-log";
import { saveReference } from "@/lib/storage";

const MAX_BYTES = 8 * 1024 * 1024;
const TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

/**
 * Загрузка референса: файл → диск сервера → GPT-4o описывает субъект и стиль.
 * В модель картинка уходит как data-URL, поэтому распознавание работает и на
 * локальной машине, где /media снаружи не виден.
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
    const url = await saveReference(user.id, ext, bytes);
    const dataUrl = `data:${file.type};base64,${bytes.toString("base64")}`;

    const { analysis, usage } = await analyzeReference(dataUrl);

    return NextResponse.json({ url, analysis, usage });
  } catch (err: any) {
    logPipelineError({ stage: "llm", videoId: null, message: "reference: " + (err?.message || String(err)) });
    return NextResponse.json({ error: err.message || "Не удалось обработать референс" }, { status: 500 });
  }
}
