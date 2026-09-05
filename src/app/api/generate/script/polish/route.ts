import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { openai } from "@/lib/openai";
import { MIN_SCENES, planFromMinutes } from "@/lib/plan";
import { resolveStyleFragment } from "@/lib/content/styles";
import { normalizeGenre } from "@/lib/content/genres";
import { normalizeLanguage } from "@/lib/content/languages";
import { normalizeOrientation } from "@/lib/orientation";
import {
  buildEditorPrompt,
  buildRhythmRepairPrompt,
  buildTrimPrompt,
  buildVisualsPrompt,
  type Blueprint,
} from "@/lib/script/prompts";
import {
  assignBeats,
  countMarkers,
  countWords,
  joinChunks,
  rhythmFailures,
  rhythmPenalty,
  rhythmStats,
  segmentNarration,
  splitIntoChunks,
} from "@/lib/script/segment";
import { logPipelineError } from "@/lib/pipeline-log";
import { requireUser } from "@/lib/session";
import { LlmUsage } from "@/lib/llm-usage";
import { SCRIPT_MODEL as MODEL } from "@/lib/script/model";
import { isReferenceAnalysis } from "@/lib/reference";

export const maxDuration = 300;

const trimPunct = (v: unknown) => (typeof v === "string" ? v.trim().replace(/[.\s]+$/g, "") : "");

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

/** Латиница есть, кириллицы нет — модель действительно ответила по-английски. */
function looksEnglish(v: unknown): boolean {
  return typeof v === "string" && /[A-Za-z]/.test(v) && !/[Ѐ-ӿ]/.test(v);
}

/**
 * Этап 2 из 2: редактор → ритм (если нужно) → нарезка на кадры → визуальные промпты.
 */
export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;
  const { user } = auth;

  let videoId: string | null = null;
  let usage: LlmUsage | null = null;

  try {
    const body = await req.json().catch(() => ({}));
    videoId = typeof body?.videoId === "string" ? body.videoId : null;
    if (!videoId) return NextResponse.json({ error: "videoId обязателен" }, { status: 400 });

    const { data: row } = await supabaseAdmin
      .from("video_generations")
      .select("id, user_id, status, topic, draft, cost, reference_analysis")
      .eq("id", videoId)
      .maybeSingle();

    if (!row || row.user_id !== user.id) {
      return NextResponse.json({ error: "Доступ запрещен: чужое или неизвестное видео" }, { status: 403 });
    }
    const draft: any = row.draft;
    if (!draft?.narration || !draft?.params) {
      return NextResponse.json({ error: "Черновик сценария не найден — запустите генерацию заново" }, { status: 409 });
    }

    const params = draft.params;
    const topic: string = params.topic || row.topic;
    const genre = normalizeGenre(params.genre);
    const language = normalizeLanguage(params.language);
    const orientation = normalizeOrientation(params.orientation);
    const plan = planFromMinutes(params.targetMinutes, language);
    const reference = isReferenceAnalysis(row.reference_analysis) ? row.reference_analysis : null;
    // С референсом стиль задаёт картинка пользователя, а не выбранный пресет.
    const styleFragment = reference ? reference.stylePrompt : resolveStyleFragment(params.style);
    const blueprint: Blueprint = draft.blueprint || {};
    if (!Array.isArray(blueprint.beats)) blueprint.beats = [];
    if (!Array.isArray(blueprint.characters)) blueprint.characters = [];

    usage = new LlmUsage(MODEL, draft.llm || row.cost?.llm || null);
    let narration: string = draft.narration;

    // --- Редактор: повторы, служебные связки, длинные предложения, перебор объёма.
    // Кусками по ~700 слов: на длинном тексте модель обрывала ответ. ---
    const beforeEdit = countWords(narration);
    if (beforeEdit >= plan.totalWords * 0.5) {
      const chunks = splitIntoChunks(narration, 700);
      const perChunkMax = Math.ceil(plan.totalWords / Math.max(1, chunks.length));
      const editor = buildEditorPrompt({ language, maxWords: perChunkMax });
      const edited: string[] = [];
      let accepted = 0;
      for (const chunk of chunks) {
        const chunkWords = countWords(chunk);
        try {
          const editedRes = await openai.chat.completions.create({
            model: MODEL,
            temperature: 0.3,
            messages: [
              { role: "system", content: editor.system },
              { role: "user", content: editor.userPrefix + chunk },
            ],
          });
          usage.add("editor", editedRes.usage);
          const candidate = (editedRes.choices[0].message.content || "").trim();
          const candidateWords = countWords(candidate);
          const markersKept = countMarkers(candidate) === countMarkers(chunk);
          const upper = Math.max(chunkWords * 1.05, perChunkMax);
          if (candidateWords >= chunkWords * 0.9 && candidateWords <= upper && markersKept) {
            edited.push(candidate);
            accepted++;
          } else {
            edited.push(chunk);
          }
        } catch (editErr) {
          console.warn("[editor] chunk failed, keeping original:", editErr);
          edited.push(chunk);
        }
      }
      narration = joinChunks(edited);
      console.info(`[editor] chunks=${chunks.length} accepted=${accepted} words ${beforeEdit} -> ${countWords(narration)}`);
    }

    // --- Объём: ролик не должен быть длиннее заказа. Если после редактора
    // текст длиннее потолка больше чем на 4%, режем кусками до askWords
    // (95% потолка): при пороге 12% пятнадцатиминутный ролик выходил на 16,7. ---
    const afterEditor = countWords(narration);
    if (afterEditor > plan.totalWords * 1.04) {
      const chunks = splitIntoChunks(narration, 700);
      const ratio = plan.askWords / afterEditor;
      const trimmed: string[] = [];
      let accepted = 0;
      for (const chunk of chunks) {
        const chunkWords = countWords(chunk);
        const target = Math.max(20, Math.round(chunkWords * ratio));
        const prompt = buildTrimPrompt({ language, targetWords: target, currentWords: chunkWords });
        try {
          const res = await openai.chat.completions.create({
            model: MODEL,
            temperature: 0.3,
            messages: [
              { role: "system", content: prompt.system },
              { role: "user", content: prompt.userPrefix + chunk },
            ],
          });
          usage.add("trim", res.usage);
          const candidate = (res.choices[0].message.content || "").trim();
          const candidateWords = countWords(candidate);
          const markersKept = countMarkers(candidate) === countMarkers(chunk);
          if (markersKept && candidateWords < chunkWords && candidateWords >= target * 0.85) {
            trimmed.push(candidate);
            accepted++;
          } else {
            trimmed.push(chunk);
          }
        } catch (trimErr) {
          console.warn("[trim] chunk failed, keeping original:", trimErr);
          trimmed.push(chunk);
        }
      }
      narration = joinChunks(trimmed);
      console.info(`[trim] target=${plan.totalWords} chunks=${chunks.length} accepted=${accepted} words ${afterEditor} -> ${countWords(narration)}`);
    }

    // --- Ритм: только для кусков, где статистика не прошла пороги ---
    const statsA = rhythmStats(narration);
    console.info(`[rhythm] after editor: ${JSON.stringify(statsA)} failures=${JSON.stringify(rhythmFailures(statsA, language))}`);
    if (rhythmFailures(statsA, language).length > 0) {
      const chunks = splitIntoChunks(narration, 700);
      const fixed: string[] = [];
      let accepted = 0;
      for (const chunk of chunks) {
        const chunkStats = rhythmStats(chunk);
        if (rhythmFailures(chunkStats, language).length === 0) {
          fixed.push(chunk);
          continue;
        }
        const wordsA = countWords(chunk);
        const prompt = buildRhythmRepairPrompt({ language, words: wordsA, markers: countMarkers(chunk), stats: chunkStats });
        try {
          const res = await openai.chat.completions.create({
            model: MODEL,
            temperature: 0.4,
            messages: [
              { role: "system", content: prompt.system },
              { role: "user", content: prompt.user + chunk },
            ],
          });
          usage.add("rhythm", res.usage);
          const candidate = (res.choices[0].message.content || "").trim();
          const wordsB = countWords(candidate);
          const statsB = rhythmStats(candidate);
          const markersKept = countMarkers(candidate) === countMarkers(chunk);
          const withinVolume = Math.abs(wordsB - wordsA) <= wordsA * 0.08;
          const better = rhythmPenalty(statsB, language) < rhythmPenalty(chunkStats, language);
          if (markersKept && withinVolume && better) {
            fixed.push(candidate);
            accepted++;
          } else {
            console.warn(`[rhythm] chunk rejected: markers=${markersKept} volume=${withinVolume} better=${better}`);
            fixed.push(chunk);
          }
        } catch (rhythmErr) {
          console.warn("[rhythm] chunk failed, keeping original:", rhythmErr);
          fixed.push(chunk);
        }
      }
      narration = joinChunks(fixed);
      console.info(`[rhythm] chunks=${chunks.length} accepted=${accepted} after: ${JSON.stringify(rhythmStats(narration))}`);
    }

    // --- Нарезка на кадры: не больше плана, не меньше минимума ---
    const actualWords = countWords(narration);
    const scenesFinal = Math.max(
      MIN_SCENES,
      Math.min(plan.scenesCount, Math.round(actualWords / Math.max(1, plan.wordsPerScene)))
    );
    const fragments = segmentNarration(narration, {
      targetScenes: scenesFinal,
      maxCharsPerScene: plan.maxCharsPerScene,
    });
    if (fragments.length === 0) throw new Error("Модель вернула пустой текст повествования");
    const fragmentBeats = assignBeats(fragments, blueprint.beats);

    // --- Визуальные промпты ---
    const visualsPrompt = buildVisualsPrompt({ fragments, blueprint, styleFragment, orientation, fragmentBeats, reference });
    const visualsRes = await openai.chat.completions.create({
      model: MODEL,
      response_format: { type: "json_object" },
      temperature: 0.6,
      messages: [
        { role: "system", content: visualsPrompt.system },
        { role: "user", content: visualsPrompt.user },
      ],
    });
    usage.add("visuals", visualsRes.usage);

    let visuals: any[] = [];
    let visualsWorld: Blueprint["world"] | undefined;
    try {
      const parsed = JSON.parse(visualsRes.choices[0].message.content || "{}");
      visuals = parsed?.scenes || [];
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
    const wps = plan.askWords / Math.max(1, plan.minutes * 60);
    let prevPrompt = "";

    const scenesOut = fragments.map((text, i) => {
      const visual = visualFor(i) || {};
      const beat = blueprint.beats?.[fragmentBeats[i]];
      let prompt = typeof visual.visualPrompt === "string" ? visual.visualPrompt.trim() : "";
      if (prompt.length < 20) {
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

    const finalStats = rhythmStats(narration);
    console.info(`[rhythm] final: ${JSON.stringify(finalStats)} scenes=${scenesOut.length} words=${actualWords}`);

    const cost = { ...(row.cost || { version: 1, startedAt: null, tts: {} }), llm: usage.toJSON() };
    await supabaseAdmin
      .from("video_generations")
      .update({ scenes: scenesOut, status: "generating_audio", cost, draft: null })
      .eq("id", videoId);

    return NextResponse.json({
      videoId,
      title: blueprint.title || topic,
      scenes: scenesOut,
      plan: { requestedMinutes: plan.minutes, scenesCount: scenesOut.length, words: actualWords, rhythm: finalStats },
    });
  } catch (err: any) {
    await logPipelineError({ stage: "llm", videoId, message: err?.message || String(err) });
    if (videoId && usage) {
      try {
        const { data: row } = await supabaseAdmin.from("video_generations").select("cost").eq("id", videoId).maybeSingle();
        await supabaseAdmin
          .from("video_generations")
          .update({ cost: { ...(row?.cost || { version: 1, startedAt: null, tts: {} }), llm: usage.toJSON() } })
          .eq("id", videoId);
      } catch {}
    }
    return NextResponse.json({ error: err.message || "Ошибка при доработке сценария" }, { status: 500 });
  }
}
