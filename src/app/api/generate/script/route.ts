import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { openai } from "@/lib/openai";

export async function POST(req: NextRequest) {
  try {
    const { topic, style = "cinematic photorealistic 8k", voice = "onyx", targetMinutes = 10, secretCode } = await req.json();

    if (!topic || !secretCode) {
      return NextResponse.json({ error: "Промпт (тема) и секретный код обязательны" }, { status: 400 });
    }

    // Verify user & check quota
    const { data: user, error: userError } = await supabaseAdmin
      .from("access_codes")
      .select("*")
      .eq("secret_code", secretCode.trim())
      .single();

    if (userError || !user) {
      return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
    }

    if (user.status !== "approved") {
      return NextResponse.json({ error: "Доступ не одобрен администратором" }, { status: 403 });
    }

    const remaining = user.generations_limit - user.generations_used;
    if (remaining <= 0) {
      return NextResponse.json({ error: "Лимит генераций исчерпан (0 осталось). Обратитесь к администратору." }, { status: 403 });
    }

    // Exact user requirement: 8-10 minute video-story with 30-35 frames (scenes)
    // 30-35 scenes, each scene is ~15-18 seconds of narration (~35-45 words)
    const scenesCount = targetMinutes >= 10 ? 34 : 30;

    // Create DB entry for this video
    const { data: videoRecord, error: insertError } = await supabaseAdmin
      .from("video_generations")
      .insert({
        user_id: user.id,
        topic: topic.trim(),
        style,
        voice,
        status: "generating_script",
        target_duration_minutes: Number(targetMinutes) || 10,
        scenes: [],
      })
      .select()
      .single();

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    const systemPrompt = `Ты — профессиональный сценарист и создатель захватывающих видеоисторий для YouTube и документальных платформ.
Пользователь передает исходный промпт (от 2-3 до 10 предложений) с идеей или сюжетом.
Твоя задача — развернуть эту идею в полноценную, увлекательную видеоисторию хронометражем 8–10 минут, состоящую ровно из ${scenesCount} последовательных сцен (кадров).

ТРЕБОВАНИЯ:
1. Ровно ${scenesCount} сцен (кадров). Каждая сцена длится около 15–18 секунд дикторской речи.
2. В каждой сцене:
   - "title": краткое название кадра (например: "Кадр 1: Взгляд в глубины космоса")
   - "narration": художественный, живой дикторский текст на русском языке (примерно 35–45 слов), который будет звучать вслух и отображаться как субтитры.
   - "visualPrompt": детальный промпт на английском языке для генерации кадра в DALL-E 3 (16:9 widescreen, cinematic lighting, atmospheric, high detail, стиль: ${style}).
   - "durationEstimate": расчетное время в секундах (обычно 16-18 секунд).

Отвечай строго в формате JSON без разметки markdown:
{
  "title": "Название видеоистории",
  "overview": "Краткое описание сюжета",
  "scenes": [
    {
      "id": 1,
      "title": "Кадр 1: Название",
      "narration": "Текст диктора на русском языке...",
      "visualPrompt": "Cinematic 16:9 widescreen shot...",
      "durationEstimate": 17
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
          content: `Промпт пользователя:\n"${topic.trim()}"\n\nРазверни этот сюжет в видеоисторию на 8-10 минут из ровно ${scenesCount} сцен.`,
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
