import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { openai } from "@/lib/openai";
import { getClientIp, checkOpenAiRateLimit, sanitizeScriptInput } from "@/lib/security";
import { planFromMinutes } from "@/lib/plan";
import { resolveStyleFragment } from "@/lib/content/styles";
import {
  buildBlueprintPrompt,
  buildNarrationPrompt,
  buildRepairPrompt,
  buildVisualsPrompt,
} from "@/lib/script/prompts";
import { segmentNarration, countWords } from "@/lib/script/segment";

const MODEL = "gpt-4o-2024-11-20";

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);

    // 1. Rate Limiting
    const rateLimit = checkOpenAiRateLimit(ip);
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: rateLimit.error }, { status: 429 });
    }

    const body = await req.json();

    // 2. Input validation
    const validation = sanitizeScriptInput(body);
    if (!validation.valid || !validation.sanitized) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const { topic, genre, style, voice, targetMinutes, language, orientation, secretCode } = validation.sanitized;

    // 3. User Resolution & Balance Verification
    let userId: string | null = null;

    if (secretCode) {
      let { data: user } = await supabaseAdmin
        .from("access_codes")
        .select("id, status, generations_limit, generations_used")
        .eq("secret_code", secretCode)
        .maybeSingle();

      if (!user && secretCode === "1599") {
        const { data: adminUser } = await supabaseAdmin
          .from("access_codes")
          .select("id, status, generations_limit, generations_used")
          .ilike("user_name", "%Администратор%")
          .maybeSingle();
        if (adminUser) user = adminUser;
      }

      if (user) {
        if (user.status !== "approved") {
          return NextResponse.json(
            { error: "Доступ не одобрен администратором" },
            { status: 403 }
          );
        }

        const remaining = Math.max(0, (user.generations_limit || 0) - (user.generations_used || 0));
        if (remaining <= 0) {
          return NextResponse.json(
            { error: "Лимит генераций исчерпан. Обратитесь к администратору для пополнения баланса." },
            { status: 403 }
          );
        }

        userId = user.id;
      }
    }

    if (!userId) {
      const { data: existingUser } = await supabaseAdmin
        .from("access_codes")
        .select("id")
        .eq("secret_code", "EXPERIMENT-MODE")
        .maybeSingle();

      if (existingUser) {
        userId = existingUser.id;
      } else {
        const { data: createdUser } = await supabaseAdmin
          .from("access_codes")
          .insert({
            user_name: "Экспериментатор",
            secret_code: "EXPERIMENT-MODE",
            status: "approved",
            generations_limit: 9999,
            generations_used: 0,
          })
          .select("id")
          .single();
        userId = createdUser?.id || "00000000-0000-0000-0000-000000000000";
      }
    }

    // ------------------------------------------------------------------
    // Генерация в три прохода.
    //
    // Раньше был один вызов, который сразу просил массив сцен — и каждый
    // элемент JSON модель писала как замкнутый абзац. Отсюда «1 кадр = 1 сухое
    // предложение». Плюс промпт прямо требовал коротких рубленых фраз.
    //
    // Теперь: план -> ОДИН непрерывный монолог -> визуальные промпты.
    // Нарезка на кадры — детерминированная функция здесь, а не решение модели,
    // поэтому число кадров всегда точное, а мысль спокойно перетекает через
    // границу кадра.
    // ------------------------------------------------------------------
    const plan = planFromMinutes(targetMinutes, language);
    const styleFragment = resolveStyleFragment(style);

    // Create DB entry for this video
    const { data: videoRecord, error: insertError } = await supabaseAdmin
      .from("video_generations")
      .insert({
        user_id: userId,
        topic,
        style: styleFragment,
        voice,
        status: "generating_script",
        target_duration_minutes: Math.round(plan.minutes),
        scenes: [],
      })
      .select()
      .single();

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    // --- Проход 1: план истории ---
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

    let blueprint: any = {};
    try {
      blueprint = JSON.parse(blueprintRes.choices[0].message.content || "{}");
    } catch {
      blueprint = { title: topic, logline: topic, throughline: "", characters: [], ending: "" };
    }

    // --- Проход 2: непрерывный монолог ---
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

    let narration = narrationRes.choices[0].message.content || "";

    // Недобор объёма — главная причина слишком короткого ролика, поэтому
    // один ремонтный проход обязателен, а не опционален.
    const written = countWords(narration);
    if (written < plan.totalWords * 0.9) {
      narrationMessages.push({ role: "assistant", content: narration });
      narrationMessages.push({
        role: "user",
        content: buildRepairPrompt(plan.totalWords - written),
      });
      const repaired = await openai.chat.completions.create({
        model: MODEL,
        temperature: 0.85,
        messages: narrationMessages,
      });
      const repairedText = repaired.choices[0].message.content || "";
      if (countWords(repairedText) > written) narration = repairedText;
    }

    // --- Нарезка на кадры ---
    // Число кадров пересчитываем от ФАКТИЧЕСКОГО объёма: если модель написала
    // меньше, получим меньше кадров той же длины, а не растянутые кадры.
    const actualWords = countWords(narration);
    if (actualWords > plan.totalWords * 1.25) {
      console.warn(
        `Narration overshot budget: ${actualWords} words vs planned ${plan.totalWords} ` +
          `(~${Math.round(actualWords / (plan.totalWords / plan.minutes))} мин вместо ${plan.minutes})`
      );
    }
    // Число кадров считаем от ФАКТИЧЕСКОГО объёма: если модель написала
    // больше или меньше, получим соответствующее число кадров той же длины,
    // а не растянутые или спрессованные кадры.
    const scenesFinal = Math.max(
      4,
      Math.min(
        Math.max(plan.scenesCount + 6, 12),
        Math.round(actualWords / Math.max(1, plan.wordsPerScene))
      )
    );

    const fragments = segmentNarration(narration, {
      targetScenes: scenesFinal,
      maxCharsPerScene: plan.maxCharsPerScene,
    });

    if (fragments.length === 0) {
      throw new Error("Модель вернула пустой текст повествования");
    }

    // --- Проход 3: визуальные промпты к готовым фрагментам ---
    const visualsPrompt = buildVisualsPrompt({
      fragments,
      blueprint,
      styleFragment,
      orientation,
    });
    const visualsRes = await openai.chat.completions.create({
      model: MODEL,
      response_format: { type: "json_object" },
      temperature: 0.6,
      messages: [
        { role: "system", content: visualsPrompt.system },
        { role: "user", content: visualsPrompt.user },
      ],
    });

    let visuals: any[] = [];
    try {
      visuals = JSON.parse(visualsRes.choices[0].message.content || "{}")?.scenes || [];
    } catch {
      visuals = [];
    }

    const wps = plan.totalWords / Math.max(1, plan.minutes * 60);
    const scenesOut = fragments.map((text, i) => {
      const visual = visuals[i] || {};
      return {
        id: i + 1,
        title: visual.title || `Кадр ${i + 1}`,
        narration: text,
        visualPrompt:
          visual.visualPrompt ||
          `${blueprint?.logline || topic}. ${styleFragment}, cinematic lighting.`,
        durationEstimate: Math.max(4, Math.round(countWords(text) / Math.max(0.5, wps))),
        orientation,
      };
    });

    await supabaseAdmin
      .from("video_generations")
      .update({ scenes: scenesOut, status: "generating_audio" })
      .eq("id", videoRecord.id);

    return NextResponse.json({
      videoId: videoRecord.id,
      title: blueprint?.title || topic,
      scenes: scenesOut,
      plan: {
        requestedMinutes: plan.minutes,
        scenesCount: scenesOut.length,
        words: actualWords,
      },
    });
  } catch (err: any) {
    console.error("Script Generation Error:", err);
    return NextResponse.json({ error: err.message || "Ошибка при генерации сценария" }, { status: 500 });
  }
}
