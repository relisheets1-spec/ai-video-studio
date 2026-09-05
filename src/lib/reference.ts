import { openai } from "./openai";
import { SCRIPT_MODEL } from "./script/model";

/**
 * Референс персонажа/объекта. GPT-4o смотрит на картинку и описывает для
 * генератора изображений, ЧТО на ней и В КАКОМ СТИЛЕ, — дальше все кадры
 * рисуются с этим описанием, а сама картинка уходит в images/edits как образец.
 */

export interface ReferenceAnalysis {
  /** Кто/что на картинке — короткая формулировка для интерфейса (по-русски). */
  summary: string;
  kind: "person" | "animal" | "robot" | "object" | "character" | "other";
  /** Описание субъекта по-английски, вставляется в каждый промпт дословно. */
  subjectPrompt: string;
  /** Стиль по-английски: техника, линия, палитра, фон — заменяет выбранный стиль. */
  stylePrompt: string;
  palette: string;
}

export interface ReferenceUsage {
  inputTokens: number;
  outputTokens: number;
}

export function isReferenceAnalysis(v: unknown): v is ReferenceAnalysis {
  const a = v as ReferenceAnalysis;
  return (
    !!a &&
    typeof a === "object" &&
    typeof a.subjectPrompt === "string" &&
    a.subjectPrompt.length > 5 &&
    typeof a.stylePrompt === "string" &&
    a.stylePrompt.length > 5
  );
}

export async function analyzeReference(imageUrl: string): Promise<{ analysis: ReferenceAnalysis; usage: ReferenceUsage }> {
  const res = await openai.chat.completions.create({
    model: SCRIPT_MODEL,
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You describe a reference image for an image-generation pipeline that must reproduce the SAME subject in the SAME visual style across 30 frames.\n" +
          "Answer strictly as JSON:\n" +
          '{"summary":"1 short sentence in RUSSIAN: what is depicted and in what style",' +
          '"kind":"person|animal|robot|object|character|other",' +
          '"subjectPrompt":"ENGLISH, 1-2 sentences: the subject with every distinctive, reusable detail (body, face, hair, clothing, colors, proportions, accessories). No background, no action.",' +
          '"stylePrompt":"ENGLISH, one compact fragment for the end of an image prompt: medium, line quality, shading, color palette, background treatment, era. Example: xkcd-style stick figure, thin black ink lines on plain white, no shading, minimal detail",' +
          '"palette":"ENGLISH: 3-5 colors"}\n' +
          "Be literal about the style: if it is a stick figure, say stick figure; if a photo, say photorealistic photo and describe lighting.",
      },
      {
        role: "user",
        content: [
          { type: "text", text: "Describe this reference image." },
          { type: "image_url", image_url: { url: imageUrl, detail: "high" } },
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
  const analysis: ReferenceAnalysis = {
    summary: typeof parsed.summary === "string" ? parsed.summary.slice(0, 200) : "Референс загружен",
    kind: ["person", "animal", "robot", "object", "character", "other"].includes(parsed.kind) ? parsed.kind : "other",
    subjectPrompt: typeof parsed.subjectPrompt === "string" ? parsed.subjectPrompt.slice(0, 600) : "",
    stylePrompt: typeof parsed.stylePrompt === "string" ? parsed.stylePrompt.slice(0, 300) : "",
    palette: typeof parsed.palette === "string" ? parsed.palette.slice(0, 200) : "",
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
