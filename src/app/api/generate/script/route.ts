import { NextRequest, NextResponse } from "next/server";
import { getClientIp, checkOpenAiRateLimit, sanitizeScriptInput } from "@/lib/security";
import { planFromMinutes } from "@/lib/plan";
import { buildBlueprintPrompt, buildNarrationPrompt, buildRepairPrompt, type Blueprint } from "@/lib/script/prompts";
import { countMarkers, countWords, joinChunks, narrationParts, rhythmFailures, rhythmStats } from "@/lib/script/segment";
import { logPipelineError } from "@/lib/pipeline-log";
import { requireUser } from "@/lib/session";
import { decryptSecret } from "@/lib/crypto";
import { fetchSubscription } from "@/lib/elevenlabs";
import { LlmUsage } from "@/lib/llm-usage";
import { NARRATION_MODEL, SCRIPT_MODEL as MODEL, VISION_MODEL, scriptChat } from "@/lib/script/model";
import { isReferenceAnalysis, type ReferenceAnalysis } from "@/lib/reference";
import { isOwnReference } from "@/lib/storage";
import { createVideo, updateVideo } from "@/lib/videos";

/** Референс принимаем только из нашего хранилища и только из папки этого пользователя. */
function parseReference(
  raw: any,
  userId: string
): { url: string; analysis: ReferenceAnalysis; usage: { prompt_tokens: number; completion_tokens: number } } | null {
  if (!raw || typeof raw !== "object") return null;
  const url = typeof raw.url === "string" ? raw.url : "";
  if (!url || url.length > 400 || !isOwnReference(url, userId)) return null;
  if (!isReferenceAnalysis(raw.analysis)) return null;
  const a = raw.analysis as ReferenceAnalysis;
  return {
    url,
    analysis: {
      summary: String(a.summary || "").slice(0, 200),
      kind: a.kind,
      subjectPrompt: a.subjectPrompt.slice(0, 600),
      stylePrompt: a.stylePrompt.slice(0, 300),
      palette: String(a.palette || "").slice(0, 200),
    },
    usage: {
      prompt_tokens: Math.max(0, Math.round(Number(raw?.usage?.inputTokens) || 0)),
      completion_tokens: Math.max(0, Math.round(Number(raw?.usage?.outputTokens) || 0)),
    },
  };
}

/**
 * Этап 1 из 2: план истории → один непрерывный монолог → ремонт объёма.
 * Результат ждёт в draft; этап 2 (/api/generate/script/polish) делает
 * редактуру, ритм, визуальные промпты и нарезку на кадры.
 */
export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;
  const { user } = auth;

  let createdVideoId: string | null = null;
  const usage = new LlmUsage(MODEL);

  try {
    const ip = getClientIp(req);
    const rateLimit = checkOpenAiRateLimit(ip);
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: rateLimit.error }, { status: 429 });
    }

    const body = await req.json();
    const validation = sanitizeScriptInput(body);
    if (!validation.valid || !validation.sanitized) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    const { topic, genre, style, voice, targetMinutes, language, orientation } = validation.sanitized;

    const remaining = Math.max(0, (user.generations_limit || 0) - (user.generations_used || 0));
    if (remaining <= 0) {
      return NextResponse.json(
        { error: "Лимит генераций исчерпан. Обратитесь к администратору для пополнения баланса." },
        { status: 403 }
      );
    }

    const plan = planFromMinutes(targetMinutes, language);
    const startedAt = new Date().toISOString();
    // Референс (необязательно): распознавание уже оплачено при загрузке — учитываем его токены здесь.
    const reference = parseReference(body?.reference, user.id);
    if (reference) usage.add("reference", reference.usage, VISION_MODEL);

    // Остаток кредитов ElevenLabs до генерации — для точного «сколько ушло».
    const userKey = decryptSecret(user.elevenlabs_key_enc);
    const subscription = userKey ? await fetchSubscription(userKey) : null;

    createdVideoId = createVideo({
      userId: user.id,
      topic,
      genre,
      style,
      voice,
      targetMinutes: plan.minutes,
      referenceUrl: reference?.url ?? null,
      referenceAnalysis: reference?.analysis ?? null,
    });

    // --- Проход 1: план ---
    const blueprintPrompt = buildBlueprintPrompt({ genre, language, plan, topic, reference: reference?.analysis ?? null });
    const blueprintRes = await scriptChat({
      json: true,
      temperature: 0.9,
      reasoning: "low",
      messages: [
        { role: "system", content: blueprintPrompt.system },
        { role: "user", content: blueprintPrompt.user },
      ],
    });
    usage.add("blueprint", blueprintRes.usage, blueprintRes.model);

    let blueprint: Blueprint = {};
    try {
      blueprint = JSON.parse(blueprintRes.choices[0].message.content || "{}");
    } catch {
      blueprint = { title: topic, logline: topic, throughline: "", characters: [], beats: [], ending: "" };
    }
    if (!Array.isArray(blueprint.beats)) blueprint.beats = [];
    if (!Array.isArray(blueprint.characters)) blueprint.characters = [];

    // --- Проход 2: монолог. Длинные фильмы пишутся частями: модель обрывает
    // вывод около 1200 слов, и 15-минутный ролик выходил на 10 минут. ---
    const totalParts = narrationParts(plan.askWords);
    const totalMarkers = Math.max(0, plan.scenesCount - 1);
    const pieces: string[] = [];
    let narrationMessages: any[] = [];

    for (let k = 1; k <= totalParts; k++) {
      const partWords = Math.round(plan.askWords / totalParts);
      // Маркеры делим между частями; стыки частей тоже станут маркерами.
      const innerMarkers = Math.max(0, Math.round((totalMarkers - (totalParts - 1)) / totalParts));
      const previousTail = pieces.length ? pieces[pieces.length - 1].split(/\s+/).slice(-120).join(" ") : "";
      const narrationPrompt = buildNarrationPrompt({
        genre,
        language,
        plan,
        blueprint,
        part: totalParts > 1 ? { index: k, total: totalParts, words: partWords, markers: innerMarkers, previousTail } : null,
      });
      narrationMessages = [
        { role: "system", content: narrationPrompt.system },
        { role: "user", content: narrationPrompt.user },
      ];
      // Монолог пишет gpt-4o: он держит коридор объёма, gpt-5.1 пишет в 1,5–2 раза длиннее.
      const res = await scriptChat({ model: NARRATION_MODEL, temperature: 0.85, messages: narrationMessages });
      usage.add(totalParts > 1 ? `narration-${k}` : "narration", res.usage, res.model);
      pieces.push((res.choices[0].message.content || "").trim());
    }
    let narration = joinChunks(pieces);

    // Недобор — единственная причина ремонта; перебор режет редактор.
    const written = countWords(narration);
    if (totalParts === 1 && written < plan.totalWords * 0.85) {
      narrationMessages.push({ role: "assistant", content: narration });
      narrationMessages.push({ role: "user", content: buildRepairPrompt(plan.askWords - written, plan.totalWords) });
      const repaired = await scriptChat({ model: NARRATION_MODEL, temperature: 0.85, messages: narrationMessages });
      usage.add("repair", repaired.usage, repaired.model);
      const repairedText = repaired.choices[0].message.content || "";
      if (countWords(repairedText) > written) narration = repairedText;
    }
    console.info(`[narration] parts=${totalParts} words=${countWords(narration)} target=${plan.askWords} markers=${countMarkers(narration)}`);

    const stats = rhythmStats(narration);
    console.info(
      `[rhythm] after narration: ${JSON.stringify(stats)} failures=${JSON.stringify(rhythmFailures(stats, language))}`
    );

    const draft = {
      blueprint,
      narration,
      params: { topic, genre, style, voice, language, orientation, targetMinutes: plan.minutes },
      llm: usage.toJSON(),
    };
    const cost = {
      version: 1,
      startedAt,
      llm: usage.toJSON(),
      tts: {
        creditsBefore: subscription?.characterCount ?? null,
        characterLimit: subscription?.characterLimit ?? null,
      },
    };

    updateVideo(createdVideoId, { draft, cost });

    return NextResponse.json({
      videoId: createdVideoId,
      title: blueprint.title || topic,
      stage: "draft",
      words: countWords(narration),
      plannedScenes: plan.scenesCount,
    });
  } catch (err: any) {
    logPipelineError({ stage: "llm", videoId: createdVideoId, message: err?.message || String(err) });
    if (createdVideoId) {
      // Потраченные токены сохраняем и для упавшей генерации.
      try {
        updateVideo(createdVideoId, { cost: { version: 1, startedAt: null, llm: usage.toJSON() } });
      } catch {}
    }
    return NextResponse.json({ error: err.message || "Ошибка при генерации сценария" }, { status: 500 });
  }
}
