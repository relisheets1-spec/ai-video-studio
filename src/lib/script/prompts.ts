import { GENRES, type GenreId } from "../content/genres";
import type { ContentLanguage } from "../content/languages";
import type { GenerationPlan } from "../plan";
import { promptAspectHint, type Orientation } from "../orientation";

/**
 * Архитектура: ЧЕТЫРЕ вызова модели вместо одного.
 *
 * Прежняя схема просила у модели сразу массив сцен, и каждый элемент JSON
 * генерировался как самостоятельная замкнутая единица — отсюда «1 кадр =
 * 1 сухое предложение». Вдобавок промпт прямо требовал «6-12 слов на
 * предложение», то есть рубленый телеграф был техническим заданием.
 *
 * Теперь: 1) план истории с миром и локациями битов, 2) ОДИН непрерывный
 * монолог, 3) редакторский проход, снимающий повторные представления героев
 * и служебные связки, 4) визуальные промпты к уже нарезанным фрагментам с
 * непрерывностью места, света и палитры внутри бита. Нарезка на кадры —
 * детерминированная функция на сервере, а не решение модели.
 */

const LANG_NAME: Record<ContentLanguage, string> = {
  ru: "РУССКОМ",
  kz: "ҚАЗАҚ",
  en: "ENGLISH",
};

function languageRule(language: ContentLanguage): string {
  if (language === "kz") {
    return (
      "ТІЛ: Барлық мәтін 100% таза, көркем ҚАЗАҚ ТІЛІНДЕ жазылады. " +
      "Орысша сөздер қосуға немесе тілдерді араластыруға ҚАТАҢ ТЫЙЫМ САЛЫНАДЫ."
    );
  }
  if (language === "en") {
    return "LANGUAGE: Write everything in natural, idiomatic ENGLISH. Do not mix in other languages.";
  }
  return "ЯЗЫК: Весь текст пишется на чистом, богатом РУССКОМ ЯЗЫКЕ. Не смешивай языки.";
}

export interface BlueprintBeat {
  act?: number;
  share?: number;
  beat?: string;
  turn?: string;
  location?: string;
  timeOfDay?: string;
}

export interface BlueprintWorld {
  setting?: string;
  era?: string;
  palette?: string;
  motifs?: string[];
}

export interface Blueprint {
  title?: string;
  logline?: string;
  throughline?: string;
  world?: BlueprintWorld;
  characters?: Array<{ name?: string; role?: string; appearance?: string }>;
  beats?: BlueprintBeat[];
  ending?: string;
}

function beatsSummary(beats: BlueprintBeat[] | undefined): string {
  if (!beats || beats.length === 0) return "";
  return beats
    .map((b, i) => {
      const where = [b.location, b.timeOfDay].filter(Boolean).join(", ");
      return `${i + 1}. [Акт ${b.act ?? "?"}, ${Math.round((b.share ?? 0) * 100)}%] ${b.beat ?? ""}${where ? ` — место: ${where}` : ""}`;
    })
    .join("\n");
}

// ---------------------------------------------------------------------------
// Проход 1 — план истории
// ---------------------------------------------------------------------------

export function buildBlueprintPrompt(opts: {
  genre: GenreId;
  language: ContentLanguage;
  plan: GenerationPlan;
  topic: string;
}): { system: string; user: string } {
  const genre = GENRES[opts.genre];
  const twistLine = genre.wantsTwist
    ? "- turn: что переворачивает понимание. Для этого жанра поворот обязателен."
    : "- turn: смена ВЗГЛЯДА на уже известное, а не внешний трюк. Искусственные твисты этому жанру запрещены.";

  const system =
    "Ты — сценарист-документалист. Твоя задача — спроектировать историю, а не написать её.\n\n" +
    genre.rules[opts.language] +
    "\n\n" +
    languageRule(opts.language) +
    "\n\n" +
    "ПРОПОРЦИИ ТЕКСТА (доли ОБЪЁМА, а не номера кадров):\n" +
    "- Акт 1, завязка — 20%: хук в первых двух предложениях; мир, герой и вопрос, ради которого зритель останется.\n" +
    "- Акт 2, развитие — 55%: наращивание и препятствия; поворот примерно в середине акта; точка невозврата к его концу.\n" +
    "- Акт 3, развязка — 25%: столкновение, ответ на вопрос из Акта 1, и последние 8% объёма — тихое послевкусие.\n\n" +
    "ТРЕБОВАНИЯ К ПОЛЯМ:\n" +
    "- throughline: сквозной образ или вопрос, к которому рассказ вернётся 3-4 раза. Именно он делает историю цельной.\n" +
    "- world: мир истории. ВСЕ поля world — СТРОГО НА АНГЛИЙСКОМ ЯЗЫКЕ, даже если история на русском или казахском: " +
    "они дословно уйдут в генератор изображений и должны быть одинаковыми во всех кадрах. " +
    "setting — место и социальная среда одним предложением; era — эпоха и уровень техники; " +
    "palette — 3-5 цветов и характер света (например: cold steel blue, sodium orange, wet asphalt; overcast diffuse light); " +
    "motifs — 3-4 повторяющихся ПРЕДМЕТА или образа, которые можно нарисовать.\n" +
    "- characters[].appearance: внешность НА АНГЛИЙСКОМ, детально (возраст, телосложение, лицо, одежда, эпоха). " +
    "Это описание дословно уйдёт в генератор изображений, чтобы человек выглядел одинаково во всех кадрах.\n" +
    "- beats: 5-8 битов по порядку. У каждого location — ОДНО конкретное место НА АНГЛИЙСКОМ (соседние биты могут делить место), " +
    "timeOfDay — dawn / day / dusk / night. Внутри бита место и время суток не меняются.\n" +
    twistLine +
    "\n- ending: чем именно заканчивается история. Без морали в лоб.\n\n" +
    'Ответь строго JSON: {"title":"...","logline":"...","throughline":"...",' +
    '"world":{"setting":"...","era":"...","palette":"...","motifs":["..."]},' +
    '"characters":[{"name":"...","role":"...","appearance":"..."}],' +
    '"beats":[{"act":1,"share":0.2,"beat":"...","turn":"...","location":"...","timeOfDay":"..."}],"ending":"..."}';

  const user =
    'Тема истории:\n"' +
    opts.topic +
    '"\n\nЖанр: ' +
    genre.label +
    ". Язык повествования: " +
    LANG_NAME[opts.language] +
    ". Общий объём будущего текста: " +
    opts.plan.totalWords +
    " слов (" +
    opts.plan.minutes +
    " минут чтения вслух).";

  return { system, user };
}

// ---------------------------------------------------------------------------
// Проход 2 — непрерывный монолог. Здесь решается главная задача ТЗ.
// ---------------------------------------------------------------------------

export function buildNarrationPrompt(opts: {
  genre: GenreId;
  language: ContentLanguage;
  plan: GenerationPlan;
  blueprint: Blueprint;
}): { system: string; user: string } {
  const genre = GENRES[opts.genre];
  const { plan } = opts;
  const markerCount = Math.max(0, plan.scenesCount - 1);
  const wpm = Math.round(plan.totalWords / Math.max(1, plan.minutes));

  const system =
    "Ты — автор дикторского текста для кинодокументалистики.\n" +
    "Ты пишешь ОДИН непрерывный монолог. Не сценарий, не список сцен, не подписи к картинкам.\n\n" +
    genre.rules[opts.language] +
    "\n\n" +
    languageRule(opts.language) +
    "\n\n" +
    "ОБЪЁМ — ЖЁСТКОЕ ТРЕБОВАНИЕ. Целевое значение: " +
    plan.totalWords +
    " слов. Допустимый коридор — от " +
    Math.round(plan.totalWords * 0.95) +
    " до " +
    Math.round(plan.totalWords * 1.1) +
    " слов. Это " +
    plan.minutes +
    " минут чтения вслух в темпе " +
    wpm +
    " слов в минуту. Ролик длиннее заказанного так же плох, как и короче: и недобор, и перебор объёма — брак работы. Перед ответом посчитай слова.\n\n" +
    "ЗАКОН НЕПРЕРЫВНОСТИ (нарушение любого пункта — брак):\n" +
    "1. Текст читается вслух без единой остановки от первого слова до последнего.\n" +
    "2. Мысль ИМЕЕТ ПРАВО начаться в одном фрагменте и закончиться в следующем. Это не ошибка, а требование. " +
    "Фрагмент может начинаться с союза или продолжения: «И тогда…», «Но…», «Потому что…», «А он всё ещё…».\n" +
    "3. ЗАПРЕЩЕНЫ служебные связки, заново вводящие зрителя в курс дела: «Итак», «Как мы уже знаем», «Напомним», " +
    "«В этом кадре», «Тем временем», «Давайте разберёмся», «Стоит отметить», «А теперь представьте».\n" +
    "4. Каждый факт, имя, дата и место вводятся РОВНО ОДИН РАЗ. Дальше — только местоимения и отсылки: " +
    "«он», «та самая ночь», «этот человек», «то письмо». Повторное объяснение уже сказанного — грубая ошибка.\n" +
    "5. Сцепление: образ или слово в конце фрагмента подхватывается началом следующего.\n" +
    "6. Сквозной мотив «" +
    (opts.blueprint?.throughline || "") +
    "» возвращается 3-4 раза за историю — каждый раз в новом смысле, не дословно.\n" +
    "7. Никаких заголовков, номеров кадров, ремарок, скобок, звуковых пометок, markdown, списков и эмодзи. Только сплошная проза.\n" +
    "8. РИТМ: чередуй короткие фразы (4-8 слов) и средние (12-18). Более трёх подряд одинаковых по длине предложений — брак. " +
    "Каждое предложение заканчивается точкой, вопросительным или восклицательным знаком: по ним делятся субтитры.\n" +
    "9. Действие идёт по битам плана по порядку; внутри бита история остаётся в одном месте, переход в новое место — только на границе бита.\n\n" +
    "ПОСЛЕВКУСИЕ: последние примерно " +
    plan.tailWords +
    " слов — тихий выдох после кульминации. Темп падает, событий больше нет. " +
    "Остаётся один образ и одна короткая мысль. Без морали в лоб, без «таким образом», без обращений к аудитории. Финал: " +
    (opts.blueprint?.ending || "") +
    "\n\nРАЗМЕТКА КАДРОВ: расставь внутри текста ровно " +
    markerCount +
    " маркеров |||\n" +
    "Маркер — отдельная строка, содержащая только |||\n" +
    "Ставь маркер ТАМ, ГДЕ ДОЛЖНА СМЕНИТЬСЯ КАРТИНКА, а не там, где заканчивается смысловая глава. " +
    "Между соседними маркерами — примерно " +
    plan.wordsPerScene +
    " слов. Маркер ставится ТОЛЬКО между предложениями, после точки, " +
    "но ставить его между двумя предложениями одной мысли — правильно и желательно.\n\n" +
    "Ответ — только текст монолога с маркерами. Никаких пояснений до и после.";

  const beats = beatsSummary(opts.blueprint?.beats);
  const user =
    "ЗАЯВКА НА ИСТОРИЮ:\n" +
    JSON.stringify(opts.blueprint, null, 1) +
    (beats ? "\n\nБИТЫ ПО ПОРЯДКУ (место и доля объёма):\n" + beats : "") +
    "\n\nИди по битам по порядку и соблюдай доли объёма. Пиши монолог ровно на " +
    plan.totalWords +
    " слов и расставь ровно " +
    markerCount +
    " маркеров |||";

  return { system, user };
}

/** Ремонтный запрос, если модель недобрала объём. */
export function buildRepairPrompt(missingWords: number): string {
  return (
    "Текст короче требуемого примерно на " +
    missingWords +
    " слов. Продолжи и расширь Акт 2 и Акт 3, НЕ переписывая уже написанное и не повторяя фактов. " +
    "Верни ПОЛНЫЙ итоговый текст целиком, с теми же маркерами ||| и с добавленными новыми там, где это нужно."
  );
}

// ---------------------------------------------------------------------------
// Проход 3 — редактор: снимает повторные представления и служебные связки
// ---------------------------------------------------------------------------

export function buildEditorPrompt(opts: { language: ContentLanguage }): { system: string; userPrefix: string } {
  if (opts.language === "kz") {
    return {
      system:
        "Сен — ||| маркерлері бар дикторлық мәтіннің әдеби редакторысың.\n" +
        "АЛЫП ТАСТА: бұрын аталған адамдарды, жерлерді және даталарды қайта таныстыруды (екінші рет — «ол», «сол түн», «сол хат»); " +
        "қайталап түсіндірілген фактілерді; «Сонымен», «Біз білетіндей», «Еске салайық», «Бұл кадрда», «Сол уақытта», «Айта кету керек» " +
        "сияқты қызметтік байланыстарды; айтылғанды сөзбе-сөз қайталайтын сөйлемдерді.\n" +
        "САҚТА: оқиғалар ретін, БАРЛЫҚ ||| маркерлерін дәл сол сөйлемдер арасындағы сол орындарда, көлемді бастапқының 95%-нан кем емес, " +
        "автордың стилі мен ырғағын, тілдің тазалығын.\n" +
        "Ештеңе қоспа, ешқандай тақырып пен түсініктеме жазба. Мәтін таза болса — сол күйінде қайтар.\n" +
        "Жауап — тек маркерлері бар мәтін.",
      userPrefix: "МӘТІН:\n",
    };
  }
  if (opts.language === "en") {
    return {
      system:
        "You are a literary editor of a voiceover text that contains ||| markers.\n" +
        "REMOVE: re-introductions of people, places and dates already introduced (the second time it is 'he', 'that night', 'the letter'); " +
        "facts explained twice; connective filler such as 'So', 'As we already know', 'Let us recall', 'In this frame', 'Meanwhile', 'It is worth noting'; " +
        "sentences that repeat what was just said.\n" +
        "KEEP: the order of events, ALL ||| markers exactly where they are between the same sentences, at least 95% of the original length, " +
        "the author's voice and rhythm.\n" +
        "Add nothing, write no headings or comments. If the text is already clean, return it unchanged.\n" +
        "Answer with the text and its markers only.",
      userPrefix: "TEXT:\n",
    };
  }
  return {
    system:
      "Ты — литературный редактор дикторского текста с маркерами |||.\n" +
      "УДАЛИ: повторные представления уже названных людей, мест и дат (второй раз — «он», «та ночь», «то письмо»); " +
      "повторно объяснённые факты; служебные связки «Итак», «Как мы уже знаем», «Напомним», «В этом кадре», «Тем временем», «Стоит отметить»; " +
      "фразы, дословно повторяющие только что сказанное.\n" +
      "СОХРАНИ: порядок событий, ВСЕ маркеры ||| ровно на тех же местах между теми же предложениями, объём не короче 95% исходного, " +
      "стиль и ритм автора.\n" +
      "Ничего не добавляй, не пиши заголовков и комментариев. Если текст чист — верни как есть.\n" +
      "Ответ — только текст с маркерами.",
    userPrefix: "ТЕКСТ:\n",
  };
}

// ---------------------------------------------------------------------------
// Проход 4 — визуальные промпты к готовым фрагментам
// ---------------------------------------------------------------------------

export function buildVisualsPrompt(opts: {
  fragments: string[];
  blueprint: Blueprint;
  styleFragment: string;
  orientation: Orientation;
  /** Индекс бита для каждого фрагмента (см. assignBeats). */
  fragmentBeats: number[];
}): { system: string; user: string } {
  const cast = (opts.blueprint?.characters || [])
    .map((c) => "- " + (c?.name || "") + ": " + (c?.appearance || ""))
    .filter((line) => line.length > 4)
    .join("\n");

  const world = opts.blueprint?.world || {};
  const worldBlock =
    "WORLD (identical in every frame):\n" +
    `- setting: ${world.setting || "(not specified)"}\n` +
    `- era: ${world.era || "(not specified)"}\n` +
    `- palette & light: ${world.palette || "(not specified)"}\n` +
    `- recurring motifs: ${(world.motifs || []).join(", ") || "(none)"}`;

  const system =
    "You are a cinematographer writing image-generation prompts for ONE continuous film.\n" +
    "You receive the fragments of a finished voiceover, in order, each with the story beat it belongs to. " +
    "For each fragment you write ONE prompt describing the single frame the viewer sees while that fragment is spoken.\n" +
    "LANGUAGE: every visualPrompt and the world block you return are written in ENGLISH ONLY, whatever language the fragments, " +
    "the WORLD or the CAST lines are in — the image model reads English. Translate them yourself if needed and transliterate names " +
    "(Aleksandr, Aigerim). Only the title stays in the fragment's language.\n\n" +
    worldBlock +
    "\n\nCAST (reuse these descriptions verbatim so the same person looks identical in every frame):\n" +
    (cast || "(no recurring characters)") +
    "\n\nRULES:\n" +
    "1. Each prompt MUST depict what its own fragment is about. No stray wolves, forests or crowds the text never mentions.\n" +
    "2. Always state: the subject and their action, period-accurate clothing and setting, the camera angle, and the lighting.\n" +
    "3. Composition: " +
    promptAspectHint(opts.orientation) +
    ".\n4. Style: " +
    opts.styleFragment +
    ".\n5. No text, captions, watermarks or letters anywhere in the image.\n" +
    "6. Frames inside the same beat happen in the same place, at the same time of day, with the same light and palette. " +
    "Between them change ONLY the camera angle, the distance (wide -> medium -> close-up) or the character's action, like an editor cutting one continuous scene.\n" +
    "7. A new location or time of day appears ONLY when the beat header changes it. Never invent a place the header does not name.\n" +
    "8. Every prompt must be self-contained: the image model sees one prompt at a time. Never write 'same room as before' — repeat the place words instead.\n" +
    "9. Consecutive frames must not share the same composition: vary angle and distance.\n" +
    "10. Do not restate the palette or the style words; they are appended automatically.\n" +
    "11. title: a short cinematic caption in the SAME LANGUAGE as the fragment; visualPrompt: English only.\n\n" +
    "Answer strictly as JSON: " +
    '{"world":{"setting":"English, one sentence","era":"English","palette":"English: colors and light"},' +
    '"scenes":[{"id":1,"title":"...","visualPrompt":"English prompt"}]} ' +
    "with exactly one scene per fragment, in order, ids matching the fragment numbers. The world block is the WORLD above rendered in English, without trailing periods.";

  const beats = opts.blueprint?.beats || [];
  const user =
    "Story: " +
    (opts.blueprint?.logline || "") +
    "\n\nFragments (" +
    opts.fragments.length +
    " total):\n" +
    opts.fragments
      .map((f, i) => {
        const beatIdx = opts.fragmentBeats[i] ?? 0;
        const beat = beats[beatIdx];
        const header = beat
          ? `(Act ${beat.act ?? "?"} · beat ${beatIdx + 1} "${(beat.beat || "").slice(0, 80)}" · location: ${beat.location || world.setting || "unspecified"} · ${beat.timeOfDay || "day"})`
          : "";
        return "[" + (i + 1) + "] " + header + "\n" + f;
      })
      .join("\n\n");

  return { system, user };
}
