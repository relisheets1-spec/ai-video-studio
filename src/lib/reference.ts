import { openaiFor } from "./openai";
import { VISION_MODEL } from "./script/model";

/**
 * Референс — картинка-образец для всего фильма. GPT-4o описывает её вид
 * (техника, палитра, свет, настроение) — этот вид получают все кадры вместо
 * стиля по умолчанию. Если на картинке явный герой или предмет, он описывается
 * отдельно и становится героем истории; если это пейзаж, кадр из фильма или
 * абстракция — берётся только стиль.
 */

export interface ReferenceAnalysis {
  /** Что на картинке и в каком стиле — коротко, по-русски, для интерфейса. */
  summary: string;
  /** Вид фильма по-английски: техника, палитра, свет, композиция, эпоха. */
  stylePrompt: string;
  /** Настроение и жанр, которые подсказывает картинка, по-английски. */
  mood: string;
  /** Выраженный герой/предмет по-английски; пусто, если его нет. */
  subjectPrompt: string;
  palette: string;
}

export interface ReferenceUsage {
  inputTokens: number;
  outputTokens: number;
}

export function isReferenceAnalysis(v: unknown): v is ReferenceAnalysis {
  const a = v as ReferenceAnalysis;
  return !!a && typeof a === "object" && typeof a.stylePrompt === "string" && a.stylePrompt.length > 5;
}

export async function analyzeReference(
  imageDataUrl: string,
  apiKey: string
): Promise<{ analysis: ReferenceAnalysis; usage: ReferenceUsage }> {
  const res = await openaiFor(apiKey).chat.completions.create({
    model: VISION_MODEL,
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You describe a reference image for an image-generation pipeline. The image sets the LOOK of a whole 30-frame film: " +
          "medium, palette, lighting, mood, era. It is not necessarily about a character.\n" +
          "Answer strictly as JSON:\n" +
          '{"summary":"1 short sentence in RUSSIAN: what is shown and in what style",' +
          '"stylePrompt":"ENGLISH, one compact fragment for the end of an image prompt: medium/technique, line and shading, color palette, lighting, composition habits, era. Example: gouache illustration, thick visible brushstrokes, muted teal and ochre palette, soft overcast light",' +
          '"mood":"ENGLISH, 3-8 words: the mood and genre the picture suggests, e.g. quiet melancholic drama",' +
          '"subjectPrompt":"ENGLISH, 1-2 sentences describing a clearly defined main character or object with every reusable detail (body, face, hair, clothing, colors, proportions) ONLY if the image is about one (portrait, mascot, product). Otherwise an empty string.",' +
          '"palette":"ENGLISH: 3-5 colors"}\n' +
          "Be literal about the style: if it is a stick figure, say stick figure; if a photo, say photorealistic photo and describe the lighting.",
      },
      {
        role: "user",
        content: [
          { type: "text", text: "Describe this reference image." },
          { type: "image_url", image_url: { url: imageDataUrl, detail: "high" } },
        ],
      },
    ],
  });

  let parsed: any = {};
  try {
    parsed = JSON.parse(res.choices[0].message.content || "{}");
  } catch {
    parsed = {};
  }
  const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const analysis: ReferenceAnalysis = {
    summary: text(parsed.summary, 200) || "Референс загружен",
    stylePrompt: text(parsed.stylePrompt, 300),
    mood: text(parsed.mood, 120),
    subjectPrompt: text(parsed.subjectPrompt, 600),
    palette: text(parsed.palette, 200),
  };
  if (!isReferenceAnalysis(analysis)) {
    throw new Error("Не удалось распознать референс — попробуйте другое изображение");
  }
  return {
    analysis,
    usage: {
      inputTokens: Number(res.usage?.prompt_tokens) || 0,
      outputTokens: Number(res.usage?.completion_tokens) || 0,
    },
  };
}
