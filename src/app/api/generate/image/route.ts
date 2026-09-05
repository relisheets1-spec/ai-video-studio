import { NextRequest, NextResponse } from "next/server";
import { imageApiSize, normalizeOrientation, promptAspectHint } from "@/lib/orientation";
import { resolveStyleFragment } from "@/lib/content/styles";
import { logPipelineError } from "@/lib/pipeline-log";
import { requireUser } from "@/lib/session";
import { MAX_SCENES } from "@/lib/plan";
import { isReferenceAnalysis } from "@/lib/reference";
import { readMediaByUrl, saveSceneImage } from "@/lib/storage";
import { getOwnedVideo } from "@/lib/videos";
import { OPENAI_API_KEY } from "@/lib/env";

const IMAGE_MODEL = "gpt-image-1-mini";
const IMAGE_QUALITY = "medium";
/** PNG без сжатия — по требованию владельца (кадр 1536×1024 ≈ 2 МБ). */
const IMAGE_OUTPUT_FORMAT = "png";

/** Референс читаем с диска один раз на фильм — 30 кадров идут подряд. */
const referenceCache = new Map<string, { blob: Blob; at: number }>();

async function loadReference(url: string): Promise<Blob> {
  const cached = referenceCache.get(url);
  if (cached && Date.now() - cached.at < 30 * 60 * 1000) return cached.blob;
  const file = await readMediaByUrl(url);
  if (!file) throw new Error("Не удалось загрузить референс");
  const blob = new Blob([new Uint8Array(file.data)], { type: file.contentType });
  if (referenceCache.size > 20) referenceCache.clear();
  referenceCache.set(url, { blob, at: Date.now() });
  return blob;
}

export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;
  const { user } = auth;

  let loggedVideoId: string | null = null;
  try {
    const { videoId, sceneId, visualPrompt, style, orientation } = await req.json();
    const frameOrientation = normalizeOrientation(orientation);
    loggedVideoId = typeof videoId === "string" ? videoId : null;

    if (!videoId || sceneId === undefined || !visualPrompt) {
      return NextResponse.json({ error: "videoId, sceneId и visualPrompt обязательны" }, { status: 400 });
    }
    if (!Number.isInteger(sceneId) || sceneId < 1 || sceneId > MAX_SCENES) {
      return NextResponse.json({ error: "Недопустимый номер сцены" }, { status: 400 });
    }

    const video = getOwnedVideo(videoId, user.id);
    if (!video) {
      return NextResponse.json({ error: "Доступ запрещен: чужое или неизвестное видео" }, { status: 403 });
    }
    if (Date.now() - new Date(video.created_at).getTime() > 2 * 60 * 60 * 1000) {
      return NextResponse.json({ error: "Сессия генерации видео истекла (более 2 часов)" }, { status: 403 });
    }

    const reference = video.reference_url && isReferenceAnalysis(video.reference_analysis) ? video.reference_analysis : null;
    const size = imageApiSize(frameOrientation);

    // Стиль приходит id-шником (или готовым фрагментом из архива). С референсом
    // стиль диктует картинка пользователя, а сам референс уходит в images/edits.
    const styleLine = reference ? reference.stylePrompt : resolveStyleFragment(style);
    const cleanPrompt = reference
      ? `Use the attached reference image as the exact model for the main subject and for the visual style. ` +
        `Keep the same character design, proportions, line style and palette; do not redesign the subject. ` +
        `Scene: ${String(visualPrompt).slice(0, 800)}. Style: ${styleLine}, ${promptAspectHint(frameOrientation)}.`
      : `${String(visualPrompt).slice(0, 900)}. Style: ${styleLine}, ${promptAspectHint(frameOrientation)}.`;

    let openAiRes: Response;
    if (reference && video.reference_url) {
      // gpt-image-1-mini: 1536x1024 (гориз.) или 1024x1536 (верт.) — 3:2 / 2:3.
      const form = new FormData();
      form.append("model", IMAGE_MODEL);
      form.append("prompt", cleanPrompt);
      form.append("quality", IMAGE_QUALITY);
      form.append("size", size);
      form.append("n", "1");
      form.append("output_format", IMAGE_OUTPUT_FORMAT);
      form.append("image", await loadReference(video.reference_url), "reference.png");
      openAiRes = await fetch("https://api.openai.com/v1/images/edits", {
        method: "POST",
        headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
        body: form,
      });
    } else {
      openAiRes = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: IMAGE_MODEL,
          prompt: cleanPrompt,
          quality: IMAGE_QUALITY,
          size,
          n: 1,
          output_format: IMAGE_OUTPUT_FORMAT,
        }),
      });
    }

    const openAiData = await openAiRes.json();
    if (!openAiRes.ok || !openAiData?.data?.[0]) {
      console.error("OpenAI Image error:", openAiData);
      throw new Error(openAiData?.error?.message || "Не удалось сгенерировать изображение");
    }
    const b64Json = openAiData.data[0].b64_json;
    if (!b64Json) throw new Error("Отсутствуют base64 данные изображения");

    const imageUrl = await saveSceneImage(videoId, sceneId, Buffer.from(b64Json, "base64"));

    // usage приходит у gpt-image-1: токены для сверки с официальной таблицей за штуку;
    // при референсе входная картинка оплачивается отдельно (image input).
    const u = openAiData.usage;
    const usage = u
      ? {
          inputTokens: Number(u.input_tokens) || 0,
          outputTokens: Number(u.output_tokens) || 0,
          totalTokens: Number(u.total_tokens) || 0,
          imageInputTokens: Number(u.input_tokens_details?.image_tokens) || 0,
        }
      : null;

    return NextResponse.json({
      sceneId,
      imageUrl,
      model: IMAGE_MODEL,
      quality: IMAGE_QUALITY,
      size,
      withReference: !!reference,
      usage,
    });
  } catch (err: any) {
    logPipelineError({ stage: "image", videoId: loggedVideoId, message: err?.message || String(err) });
    return NextResponse.json({ error: err.message || "Ошибка при генерации изображения" }, { status: 500 });
  }
}
