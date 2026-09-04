import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { openai } from "@/lib/openai";
import { getClientIp, checkOpenAiRateLimit, sanitizeScriptInput } from "@/lib/security";

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);

    // 1. Strict OpenAI Key Protection & Rate Limiting
    const rateLimit = checkOpenAiRateLimit(ip);
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: rateLimit.error }, { status: 429 });
    }

    const body = await req.json();

    // 2. Input validation and token length sanitization
    const validation = sanitizeScriptInput(body);
    if (!validation.valid || !validation.sanitized) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const { topic, style, voice, targetMinutes } = validation.sanitized;

    // 3. User Resolution (No passwords needed in Experiment Mode)
    let userId: string;
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

    // Determine scenes count: Test mode (3 scenes) or Full 8-10 mins (30-34 scenes)
    const isTestMode = targetMinutes <= 1;
    const scenesCount = isTestMode ? 3 : (targetMinutes >= 10 ? 34 : 30);
    const sceneDurationDesc = isTestMode ? "7–10 секунд (~15–25 слов)" : "15–18 секунд (~35–45 слов)";

    // Create DB entry for this video
    const { data: videoRecord, error: insertError } = await supabaseAdmin
      .from("video_generations")
      .insert({
        user_id: userId,
        topic,
        style,
        voice,
        status: "generating_script",
        target_duration_minutes: targetMinutes,
        scenes: [],
      })
      .select()
      .single();

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    const systemPrompt = `Ты — профессиональный сценарист и режиссер видеоисторий для YouTube и документальных платформ.
Пользователь передает тему или сюжет.
Твоя задача — развернуть этот сюжет в захватывающую, кинематографичную видеоисторию, состоящую ровно из ${scenesCount} последовательных сцен (кадров).

ТРЕБОВАНИЯ:
1. Ровно ${scenesCount} сцен (кадров). Каждая сцена длится ${sceneDurationDesc} дикторской речи.
2. В каждой сцене:
   - "title": краткое название кадра (например: "Кадр 1: Взгляд в глубины Рима")
   - "narration": выразительный, литературный дикторский текст на русском языке (для казахского сюжета — на казахском), который будет звучать вслух и отображаться как субтитры.
   - "visualPrompt": детальный промпт на английском языке для генерации кадра (16:9 widescreen, cinematic lighting, atmospheric, high detail, стиль: ${style}).
   - "durationEstimate": расчетное время в секундах (${isTestMode ? "7-9" : "16-18"} сек).
3. КРИТИЧЕСКОЕ ПРАВИЛО ДЛЯ visualPrompt:
   Промпт КАЖДОГО кадра ОБЯЗАН СТРОГО СООТВЕТСТВОВАТЬ ТЕМАТИКЕ СЮЖЕТА ПОЛЬЗОВАТЕЛЯ!
   Если сюжет про Рим — промпты должны содержать римских легионеров, Колизей, доспехи, сенат, Вечный город, а НЕ абстрактную природу, птиц или волков!
   Всегда описывай центральный объект сцены, действия персонажей, окружение, эпоху, одежду, ракурс камеры и освещение.

Отвечай строго в формате JSON без разметки markdown:
{
  "title": "Название видеоистории",
  "overview": "Краткое описание сюжета",
  "scenes": [
    {
      "id": 1,
      "title": "Кадр 1: Название",
      "narration": "Текст диктора...",
      "visualPrompt": "Cinematic 16:9 widescreen shot...",
      "durationEstimate": ${isTestMode ? 8 : 17}
    }
  ]
}`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Тема пользователя:\n"${topic.trim()}"\n\nСоздай сценарий из ровно ${scenesCount} сцен.`,
        },
      ],
      temperature: 0.75,
    });

    const content = completion.choices[0].message.content;
    if (!content) {
      throw new Error("Не удалось получить ответ от модели");
    }

    const parsed = JSON.parse(content);

    // Update video record
    await supabaseAdmin
      .from("video_generations")
      .update({
        scenes: parsed.scenes || [],
        status: "generating_audio",
      })
      .eq("id", videoRecord.id);

    return NextResponse.json({
      videoId: videoRecord.id,
      title: parsed.title || topic,
      scenes: parsed.scenes || [],
    });
  } catch (err: any) {
    console.error("Script Generation Error:", err);
    return NextResponse.json({ error: err.message || "Ошибка при генерации сценария" }, { status: 500 });
  }
}
