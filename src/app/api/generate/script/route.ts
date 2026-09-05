import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { openai } from "@/lib/openai";
import { getClientIp, checkOpenAiRateLimit, sanitizeScriptInput } from "@/lib/security";
import { planFromMinutes } from "@/lib/plan";
import { resolveStyleFragment } from "@/lib/content/styles";
import {
  buildBlueprintPrompt,
  buildEditorPrompt,
  buildNarrationPrompt,
  buildRepairPrompt,
  buildVisualsPrompt,
  type Blueprint,
} from "@/lib/script/prompts";
import { assignBeats, countMarkers, countWords, segmentNarration } from "@/lib/script/segment";
import { logPipelineError } from "@/lib/pipeline-log";
import { requireUser } from "@/lib/session";

const MODEL = "gpt-4o-2024-11-20";

const trimPunct = (v: unknown) =>
  typeof v === "string" ? v.trim().replace(/[.\s]+$/g, "") : "";

/** Суффикс мира запекается в каждый промпт кадра: картинки делают одну и ту же эпоху и палитру. */
function worldSuffix(world: Blueprint["world"] | undefined): string {
  const w = world || {};
  const setting = [trimPunct(w.setting), trimPunct(w.era)].filter(Boolean).join(", ");
  const palette = trimPunct(w.palette);
  const parts: string[] = [];
  if (setting) parts.push(`Setting: ${setting}`);
  if (palette) parts.push(`Palette: ${palette}`);
  return parts.length ? ". " + parts.join(". ") + "." : "";
}

/** Латиница присутствует, кириллицы нет — значит, модель действительно ответила по-английски. */
function looksEnglish(v: unknown): boolean {
  return typeof v === "string" && /[A-Za-z]/.test(v) && !/[Ѐ-ӿ]/.test(v);
}

export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;
  const { user } = auth;

  // Нужен в catch, чтобы упавшая генерация не осталась висеть в статусе
  // generating_script навсегда.
  let createdVideoId: string | null = null;

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
    const styleFragment = resolveStyleFragment(style);

    const { data: videoRecord, error: insertError } = await supabaseAdmin
      .from("video_generations")
      .insert({
        user_id: user.id,
        topic,
        // Храним id стиля; resolveStyleFragment понимает и id, и старые сырые фрагменты.
        style,
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
    createdVideoId = videoRecord.id;

    // --- Проход 1: план истории (мир, герои, биты с локациями) ---
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

    let blueprint: Blueprint = {};
    try {
      blueprint = JSON.parse(blueprintRes.choices[0].message.content || "{}");
    } catch {
      blueprint = { title: topic, logline: topic, throughline: "", characters: [], beats: [], ending: "" };
    }
    if (!Array.isArray(blueprint.beats)) blueprint.beats = [];
    if (!Array.isArray(blueprint.characters)) blueprint.characters = [];

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

    // --- Проход 3: редактор. Снимает повторные представления героев и
    // служебные связки — то, что делает историю «рубленой» даже при
    // сплошном тексте. Результат принимается только если объём и маркеры
    // сохранены; иначе остаёмся с исходным текстом.
    const afterRepair = countWords(narration);
    if (afterRepair >= plan.totalWords * 0.9 && afterRepair <= plan.totalWords * 1.2) {
      const editor = buildEditorPrompt({ language });
      try {
        const editedRes = await openai.chat.completions.create({
          model: MODEL,
          temperature: 0.3,
          messages: [
            { role: "system", content: editor.system },
            { role: "user", content: editor.userPrefix + narration },
          ],
        });
        const edited = editedRes.choices[0].message.content || "";
        const editedWords = countWords(edited);
        const markersKept = countMarkers(edited) === countMarkers(narration);
        if (editedWords >= afterRepair * 0.93 && editedWords <= afterRepair * 1.05 && markersKept) {
          console.log(`Editor pass: ${afterRepair} -> ${editedWords} words, markers kept`);
          narration = edited;
        } else {
          console.warn(
            `Editor pass rejected: ${afterRepair} -> ${editedWords} words, markers ${countMarkers(narration)} -> ${countMarkers(edited)}`
          );
        }
      } catch (editErr) {
        console.warn("Editor pass failed, keeping original narration:", editErr);
      }
    }

    // --- Нарезка на кадры ---
    const actualWords = countWords(narration);
    if (actualWords > plan.totalWords * 1.25) {
      console.warn(
        `Narration overshot budget: ${actualWords} words vs planned ${plan.totalWords} ` +
          `(~${Math.round(actualWords / (plan.totalWords / plan.minutes))} мин вместо ${plan.minutes})`
      );
    }
    // Число кадров считаем от ФАКТИЧЕСКОГО объёма: если модель написала
    // больше или меньше, получим соответствующее число кадров той же длины.
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

    const fragmentBeats = assignBeats(fragments, blueprint.beats);

    // --- Проход 4: визуальные промпты к готовым фрагментам ---
    const visualsPrompt = buildVisualsPrompt({
      fragments,
      blueprint,
      styleFragment,
      orientation,
      fragmentBeats,
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
    let visualsWorld: Blueprint["world"] | undefined;
    try {
      const parsed = JSON.parse(visualsRes.choices[0].message.content || "{}");
      visuals = parsed?.scenes || [];
      // Английская версия мира от визуального прохода надёжнее плана: план
      // нередко пишет setting/palette на языке истории вопреки инструкции.
      const w = parsed?.world;
      if (w && (looksEnglish(w.setting) || looksEnglish(w.palette))) {
        visualsWorld = {
          setting: looksEnglish(w.setting) ? w.setting : undefined,
          era: looksEnglish(w.era) ? w.era : undefined,
          palette: looksEnglish(w.palette) ? w.palette : undefined,
        };
      }
    } catch {
      visuals = [];
    }
    if (!Array.isArray(visuals)) visuals = [];

    // Сопоставляем по id, а не по позиции: если модель пропустила один
    // элемент, позиционная привязка сдвинула бы ВСЕ последующие картинки.
    const byId = new Map<number, any>();
    for (const v of visuals) {
      const id = Number(v?.id);
      if (Number.isInteger(id) && id > 0 && !byId.has(id)) byId.set(id, v);
    }
    const visualFor = (i: number): any => {
      const exact = byId.get(i + 1);
      if (exact) return exact;
      const positional = visuals[i];
      return positional && positional.id == null ? positional : null;
    };

    const suffix = worldSuffix(visualsWorld ?? blueprint.world);
    const wps = plan.totalWords / Math.max(1, plan.minutes * 60);
    let prevPrompt = "";

    const scenesOut = fragments.map((text, i) => {
      const visual = visualFor(i) || {};
      const beat = blueprint.beats?.[fragmentBeats[i]];
      let prompt = typeof visual.visualPrompt === "string" ? visual.visualPrompt.trim() : "";
      if (prompt.length < 20) {
        // Пропущенный кадр продолжает предыдущий, а не сваливается в общий
        // логлайн: одинаковый fallback давал серию одинаковых стоковых картинок.
        prompt = prevPrompt
          ? `${prevPrompt}, a different camera angle and distance, the next moment`
          : `${blueprint.logline || topic}. ${beat?.location || blueprint.world?.setting || ""}, ${beat?.timeOfDay || "day"}`;
      }
      prevPrompt = prompt;

      return {
        id: i + 1,
        title: typeof visual.title === "string" && visual.title.trim() ? visual.title.trim() : `Кадр ${i + 1}`,
        narration: text,
        visualPrompt: (prompt + suffix).slice(0, 800),
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
      title: blueprint.title || topic,
      scenes: scenesOut,
      plan: {
        requestedMinutes: plan.minutes,
        scenesCount: scenesOut.length,
        words: actualWords,
      },
    });
  } catch (err: any) {
    await logPipelineError({
      stage: "llm",
      videoId: createdVideoId,
      message: err?.message || String(err),
    });
    return NextResponse.json({ error: err.message || "Ошибка при генерации сценария" }, { status: 500 });
  }
}
