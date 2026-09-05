import { GENRES, type GenreId } from "../content/genres";
import type { ContentLanguage } from "../content/languages";
import type { GenerationPlan } from "../plan";
import { promptAspectHint, type Orientation } from "../orientation";

/**
 * Архитектура: ТРИ вызова модели вместо одного.
 *
 * Прежняя схема просила у модели сразу массив сцен, и каждый элемент JSON
 * генерировался как самостоятельная замкнутая единица — отсюда «1 кадр =
 * 1 сухое предложение». Вдобавок промпт прямо требовал «6-12 слов на
 * предложение» и запрещал периоды длиннее 20 слов, то есть рубленый телеграф
 * был техническим заданием, а не свойством модели.
 *
 * Теперь: 1) план истории, 2) ОДИН непрерывный монолог, 3) визуальные промпты
 * к уже нарезанным фрагментам. Нарезка на кадры — детерминированная функция
 * на сервере, а не решение модели.
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
    "- characters[].appearance: внешность НА АНГЛИЙСКОМ, детально (возраст, телосложение, лицо, одежда, эпоха). " +
    "Это описание дословно уйдёт в генератор изображений, чтобы человек выглядел одинаково во всех кадрах.\n" +
    twistLine +
    "\n- ending: чем именно заканчивается история. Без морали в лоб.\n\n" +
    'Ответь строго JSON: {"title":"...","logline":"...","throughline":"...",' +
    '"characters":[{"name":"...","role":"...","appearance":"..."}],' +
    '"beats":[{"act":1,"share":0.2,"beat":"...","turn":"..."}],"ending":"..."}';

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
  blueprint: any;
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
    "Каждое предложение заканчивается точкой, вопросительным или восклицательным знаком: по ним делятся субтитры.\n\n" +
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

  const user =
    "ЗАЯВКА НА ИСТОРИЮ:\n" +
    JSON.stringify(opts.blueprint, null, 1) +
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
// Проход 3 — визуальные промпты к готовым фрагментам
// ---------------------------------------------------------------------------

export function buildVisualsPrompt(opts: {
  fragments: string[];
  blueprint: any;
  styleFragment: string;
  orientation: Orientation;
}): { system: string; user: string } {
  const cast = (opts.blueprint?.characters || [])
    .map((c: any) => "- " + c?.name + ": " + c?.appearance)
    .join("\n");

  const system =
    "You are a cinematographer writing image-generation prompts.\n" +
    "You receive the fragments of a finished voiceover, in order. For each fragment you write ONE English prompt " +
    "describing the single frame the viewer sees while that fragment is spoken.\n\n" +
    "CAST (reuse these descriptions verbatim so the same person looks identical in every frame):\n" +
    (cast || "(no recurring characters)") +
    "\n\nRULES:\n" +
    "1. Each prompt MUST depict what its own fragment is about. No stray wolves, forests or crowds the text never mentions.\n" +
    "2. Always state: the subject and their action, period-accurate clothing and setting, the camera angle, and the lighting.\n" +
    "3. Composition: " +
    promptAspectHint(opts.orientation) +
    ".\n4. Style: " +
    opts.styleFragment +
    ".\n5. No text, captions, watermarks or letters anywhere in the image.\n" +
    "6. Consecutive frames must differ — change the angle, the distance or the moment. Never repeat a composition.\n" +
    "7. title: a short cinematic caption in the SAME LANGUAGE as the fragment.\n\n" +
    'Answer strictly as JSON: {"scenes":[{"id":1,"title":"...","visualPrompt":"..."}]} with exactly one entry per fragment, in order.';

  const user =
    "Story: " +
    (opts.blueprint?.logline || "") +
    "\n\nFragments (" +
    opts.fragments.length +
    " total):\n" +
    opts.fragments.map((f, i) => "[" + (i + 1) + "] " + f).join("\n\n");

  return { system, user };
}
