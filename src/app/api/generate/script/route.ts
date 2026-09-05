import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { openai } from "@/lib/openai";
import { getClientIp, checkOpenAiRateLimit, sanitizeScriptInput } from "@/lib/security";
import { planFromMinutes } from "@/lib/plan";
import { buildBlueprintPrompt, buildNarrationPrompt, buildRepairPrompt, type Blueprint } from "@/lib/script/prompts";
import { countWords, rhythmFailures, rhythmStats } from "@/lib/script/segment";
import { logPipelineError } from "@/lib/pipeline-log";
import { requireUser } from "@/lib/session";
import { decryptSecret } from "@/lib/crypto";
import { fetchSubscription } from "@/lib/elevenlabs";
import { LlmUsage } from "@/lib/llm-usage";
import { SCRIPT_MODEL as MODEL } from "@/lib/script/model";

/** Vercel fluid compute: до 300 с. Сценарий на 15 минут идёт двумя этапами. */
export const maxDuration = 300;

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

    // Остаток кредитов ElevenLabs до генерации — для точного «сколько ушло».
    const userKey = decryptSecret(user.elevenlabs_key_enc);
    const subscription = userKey ? await fetchSubscription(userKey) : null;

    const { data: videoRecord, error: insertError } = await supabaseAdmin
      .from("video_generations")
      .insert({
        user_id: user.id,
        topic,
        style,
        voice,
        status: "generating_script",
        target_duration_minutes: Math.round(plan.minutes),
        scenes: [],
        cost: null,
        draft: null,
      })
      .select("id")
      .single();

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }
    createdVideoId = videoRecord.id;

    // --- Проход 1: план ---
    const blueprintPrompt = buildBlueprintPrompt({ genre, language, plan, topic });
    const blueprintRes = await openai.chat.completions.create({
      model: MODEL,
      response_format: { type: "json_object" },
      temperature: 0.9,
      messages: [
        { role: "system", content: blueprintPrompt.system },
        { role: "user", content: blueprintPrompt.user },
      ],
    });
    usage.add("blueprint", blueprintRes.usage);

    let blueprint: Blueprint = {};
    try {
      blueprint = JSON.parse(blueprintRes.choices[0].message.content || "{}");
    } catch {
      blueprint = { title: topic, logline: topic, throughline: "", characters: [], beats: [], ending: "" };
    }
    if (!Array.isArray(blueprint.beats)) blueprint.beats = [];
    if (!Array.isArray(blueprint.characters)) blueprint.characters = [];

    // --- Проход 2: монолог ---
    const narrationPrompt = buildNarrationPrompt({ genre, language, plan, blueprint });
    const narrationMessages: any[] = [
      { role: "system", content: narrationPrompt.system },
      { role: "user", content: narrationPrompt.user },
    ];
    const narrationRes = await openai.chat.completions.create({
      model: MODEL,
      temperature: 0.85,
      messages: narrationMessages,
    });
    usage.add("narration", narrationRes.usage);
    let narration = narrationRes.choices[0].message.content || "";

    // Недобор — единственная причина ремонта; перебор режет редактор.
    const written = countWords(narration);
    if (written < plan.totalWords * 0.85) {
      narrationMessages.push({ role: "assistant", content: narration });
      narrationMessages.push({ role: "user", content: buildRepairPrompt(plan.askWords - written, plan.totalWords) });
      const repaired = await openai.chat.completions.create({
        model: MODEL,
        temperature: 0.85,
        messages: narrationMessages,
      });
      usage.add("repair", repaired.usage);
      const repairedText = repaired.choices[0].message.content || "";
      if (countWords(repairedText) > written) narration = repairedText;
    }

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

    await supabaseAdmin
      .from("video_generations")
      .update({ draft, cost })
      .eq("id", videoRecord.id);

    return NextResponse.json({
      videoId: videoRecord.id,
      title: blueprint.title || topic,
      stage: "draft",
      words: countWords(narration),
      plannedScenes: plan.scenesCount,
    });
  } catch (err: any) {
    await logPipelineError({ stage: "llm", videoId: createdVideoId, message: err?.message || String(err) });
    if (createdVideoId) {
      // Потраченные токены сохраняем и для упавшей генерации.
      try {
        await supabaseAdmin
          .from("video_generations")
          .update({ cost: { version: 1, startedAt: null, llm: usage.toJSON() } })
          .eq("id", createdVideoId);
      } catch {}
    }
    return NextResponse.json({ error: err.message || "Ошибка при генерации сценария" }, { status: 500 });
  }
}
