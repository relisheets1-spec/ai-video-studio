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
// Ритм речи: текст читает синтез, и длинные периоды он произносит с ложными
// паузами. Правило общее для монолога, редактора и прохода «ритм».
// ---------------------------------------------------------------------------

const RHYTHM_EXAMPLES: Record<ContentLanguage, { good: string; bad: string }> = {
  ru: {
    good:
      "«Утром он снова пришёл к причалу. Лодки не было. Старик из соседнего дома сказал, что её увели ещё ночью, и никто не видел кто. " +
      "Он сел на камень. Ждал долго. Вода была тихой, и в ней отражалось всё небо целиком.»",
    bad:
      "«Придя утром к причалу и не обнаружив лодки, которую, по словам старика из соседнего дома, увели ещё ночью, он, не зная, что делать, " +
      "сел на камень и долго ждал, глядя на тихую воду, в которой отражалось небо.»",
  },
  kz: {
    good:
      "«Таңертең ол айлаққа қайта келді. Қайық жоқ. Көрші үйдегі қария оны түнде әкеткенін, бірақ кім екенін ешкім көрмегенін айтты. " +
      "Ол тасқа отырды. Ұзақ күтті. Су тыныш еді, бетінде бүкіл аспан көрініп тұрды.»",
    bad:
      "«Таңертең айлаққа келіп, көрші үйдегі қарияның айтуынша түнде әкетілген қайықтың жоқ екенін көрген ол, не істерін білмей, " +
      "тасқа отырып, аспан көрініп тұрған тыныш суға қарап ұзақ күтті.»",
  },
  en: {
    good:
      "\"In the morning he came back to the pier. The boat was gone. An old man from the next house said it had been taken in the night, and nobody saw who did it. " +
      "He sat down on a stone. He waited a long time. The water was still, and the whole sky lay in it.\"",
    bad:
      "\"Having come to the pier in the morning and having found no boat, which, according to the old man from the next house, had been taken in the night, " +
      "he, not knowing what to do, sat down on a stone and waited for a long time, looking at the still water in which the sky was reflected.\"",
  },
};

export function rhythmRule(language: ContentLanguage): string {
  const ex = RHYTHM_EXAMPLES[language];
  return (
    "8. РИТМ РЕЧИ — ДЛЯ ДИКТОРА, А НЕ ДЛЯ ЧТЕНИЯ ГЛАЗАМИ. Текст озвучит синтез речи, и длинные периоды с причастными и деепричастными оборотами он читает с ложными паузами. Поэтому:\n" +
    "   а) не меньше ТРЕТИ предложений — короткие, 3–6 слов. Они стоят между длинными, а не сбиваются в кучу и не чередуются механически «длинное — короткое — длинное».\n" +
    "   б) не больше двух предложений длиннее 15 слов подряд. После двух длинных — обязательно короткое.\n" +
    "   в) ни одного предложения длиннее 22 слов. Не помещается мысль — раздели её точкой.\n" +
    "   г) деепричастные обороты («вернувшись домой, он…», «глядя на воду, она…») — не чаще одного на пять предложений; причастные («человек, стоявший у окна») — так же редко. Вместо них — отдельное предложение с глаголом.\n" +
    "   д) не нанизывай придаточные: «который… потому что… когда…» в одном предложении — брак. Одно придаточное на предложение.\n" +
    "   е) короткое предложение — не обрубок и не телеграф: оно несёт действие, реакцию или образ. «Он промолчал.» «Дверь не открыли.» «Снег шёл третий день.»\n" +
    "   ПРАВИЛЬНЫЙ РИТМ: " +
    ex.good +
    "\n   ТАК НЕЛЬЗЯ: " +
    ex.bad +
    "\n"
  );
}

// ---------------------------------------------------------------------------
// Проход 1 — план истории
// ---------------------------------------------------------------------------

/** Референс пользователя: кто/что на картинке и в каком стиле (по-английски). */
export interface ReferenceForPrompt {
  subjectPrompt: string;
  stylePrompt: string;
  palette?: string;
  kind?: string;
}

function referenceBlockRu(ref: ReferenceForPrompt | null | undefined): string {
  if (!ref) return "";
  return (
    "\n\nРЕФЕРЕНС ПОЛЬЗОВАТЕЛЯ (обязателен): главный герой или объект истории задан картинкой. " +
    "Вот что на ней, по-английски: «" +
    ref.subjectPrompt +
    "». Стиль картинки: «" +
    ref.stylePrompt +
    "». Сделай этого героя/объект центром истории; characters[0].appearance — дословно это описание " +
    "(можно добавить одежду и возраст, если они не противоречат); world.palette — палитра референса" +
    (ref.palette ? " («" + ref.palette + "»)" : "") +
    ".\n"
  );
}

export function buildBlueprintPrompt(opts: {
  genre: GenreId;
  language: ContentLanguage;
  plan: GenerationPlan;
  topic: string;
  reference?: ReferenceForPrompt | null;
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
    "\n- ending: чем именно заканчивается история. Без морали в лоб." +
    referenceBlockRu(opts.reference) +
    "\n\n" +
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

/** Часть монолога для длинных фильмов: модель обрывает вывод около 1200 слов. */
export interface NarrationPart {
  index: number;
  total: number;
  /** Слов в этой части. */
  words: number;
  /** Маркеров ||| внутри этой части. */
  markers: number;
  /** Хвост предыдущей части — продолжать ровно отсюда. */
  previousTail: string;
}

export function buildNarrationPrompt(opts: {
  genre: GenreId;
  language: ContentLanguage;
  plan: GenerationPlan;
  blueprint: Blueprint;
  part?: NarrationPart | null;
}): { system: string; user: string } {
  const genre = GENRES[opts.genre];
  const { plan } = opts;
  const part = opts.part && opts.part.total > 1 ? opts.part : null;
  const markerCount = part ? part.markers : Math.max(0, plan.scenesCount - 1);
  const wpm = Math.round(plan.totalWords / Math.max(1, plan.minutes));

  const system =
    "Ты — автор дикторского текста для кинодокументалистики.\n" +
    "Ты пишешь ОДИН непрерывный монолог. Не сценарий, не список сцен, не подписи к картинкам.\n\n" +
    genre.rules[opts.language] +
    "\n\n" +
    languageRule(opts.language) +
    "\n\n" +
    "ОБЪЁМ — ЖЁСТКОЕ ТРЕБОВАНИЕ. Целевое значение: " +
    plan.askWords +
    " слов. Допустимый коридор — от " +
    plan.minWords +
    " до " +
    plan.totalWords +
    " слов. Это " +
    plan.minutes +
    " минут чтения вслух в темпе " +
    wpm +
    " слов в минуту. НЕ ДЛИННЕЕ " +
    plan.totalWords +
    " слов: перебор объёма — брак работы, небольшой недобор допустим. Перед ответом посчитай слова.\n\n" +
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
    rhythmRule(opts.language) +
    "9. Каждое предложение заканчивается точкой, вопросительным или восклицательным знаком: по ним делятся субтитры.\n" +
    "10. Действие идёт по битам плана по порядку; внутри бита история остаётся в одном месте, переход в новое место — только на границе бита.\n\n" +
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
  let user =
    "ЗАЯВКА НА ИСТОРИЮ:\n" +
    JSON.stringify(opts.blueprint, null, 1) +
    (beats ? "\n\nБИТЫ ПО ПОРЯДКУ (место и доля объёма):\n" + beats : "");

  if (part) {
    const from = Math.round(((part.index - 1) / part.total) * 100);
    const to = Math.round((part.index / part.total) * 100);
    user +=
      "\n\nМОНОЛОГ ПИШЕТСЯ ЧАСТЯМИ. Сейчас — ЧАСТЬ " +
      part.index +
      " ИЗ " +
      part.total +
      ": она покрывает примерно " +
      from +
      "–" +
      to +
      "% истории по битам. Объём ИМЕННО ЭТОЙ ЧАСТИ — " +
      part.words +
      " слов (не всего монолога), внутри неё ровно " +
      part.markers +
      " маркеров |||." +
      (part.index > 1
        ? "\nПредыдущая часть закончилась так: «…" +
          part.previousTail +
          "». Продолжай ровно с этого места, без повторов, без вступлений и без пересказа сказанного."
        : "\nЭто начало истории: хук в первых двух предложениях.") +
      (part.index < part.total
        ? "\nЭто НЕ конец: не завершай историю, не пиши послевкусие, остановись на живом месте, откуда легко продолжить."
        : "\nЭто последняя часть: доведи историю до финала и послевкусия.") +
      "\nОтвет — только текст этой части с маркерами.";
  } else {
    user +=
      "\n\nИди по битам по порядку и соблюдай доли объёма. Пиши монолог ровно на " +
      plan.askWords +
      " слов и расставь ровно " +
      markerCount +
      " маркеров |||";
  }

  return { system, user };
}

/** Ремонтный запрос, если модель недобрала объём. */
export function buildRepairPrompt(missingWords: number, maxWords: number): string {
  return (
    "Текст короче требуемого примерно на " +
    missingWords +
    " слов. Продолжи и расширь Акт 2 и Акт 3, НЕ переписывая уже написанное и не повторяя фактов, но НЕ ДЛИННЕЕ " +
    maxWords +
    " слов итого. Сохраняй ритм: короткие предложения между длинными. " +
    "Верни ПОЛНЫЙ итоговый текст целиком, с теми же маркерами ||| и с добавленными новыми там, где это нужно."
  );
}

// ---------------------------------------------------------------------------
// Проход «ритм» — только если статистика не прошла пороги
// ---------------------------------------------------------------------------

export function buildRhythmRepairPrompt(opts: {
  language: ContentLanguage;
  words: number;
  markers: number;
  stats: { shortShare: number; maxWords: number; longestLongRun: number; mean: number };
}): { system: string; user: string } {
  const ex = RHYTHM_EXAMPLES[opts.language];
  const system =
    "Ты — редактор дикторского текста для синтеза речи.\n" +
    languageRule(opts.language) +
    "\nВ тексте есть маркеры ||| — они неприкосновенны: то же количество, на тех же местах, между теми же по смыслу предложениями.\n" +
    "ЗАДАЧА — ТОЛЬКО РИТМ. Перепиши так, чтобы:\n" +
    "1. не меньше 30% предложений были короткими, 3–6 слов, и стояли между длинными — не подряд и не строго через одно;\n" +
    "2. ни одно предложение не было длиннее 22 слов;\n" +
    "3. не было трёх предложений длиннее 15 слов подряд;\n" +
    "4. деепричастных и причастных оборотов осталось не больше одного на пять предложений — заменяй их отдельным предложением с глаголом;\n" +
    "5. в одном предложении было не больше одного придаточного.\n" +
    "СОХРАНИ: все факты, имена, даты, порядок событий, тон автора, объём в пределах ±5% от исходных " +
    opts.words +
    " слов. Ничего не добавляй по смыслу, не выкидывай события, не пиши заголовков и комментариев.\n" +
    "ОБРАЗЕЦ РИТМА: " +
    ex.good +
    "\nТАК НЕЛЬЗЯ: " +
    ex.bad +
    "\nОтвет — только текст с маркерами.";

  const user =
    "СЕЙЧАС: коротких предложений " +
    Math.round(opts.stats.shortShare * 100) +
    "%, самое длинное — " +
    opts.stats.maxWords +
    " слов, длинных подряд — " +
    opts.stats.longestLongRun +
    ", средняя длина — " +
    opts.stats.mean +
    " слов.\nТЕКСТ (" +
    opts.words +
    " слов, " +
    opts.markers +
    " маркеров):\n";

  return { system, user };
}

// ---------------------------------------------------------------------------
// Проход 3 — редактор: снимает повторные представления и служебные связки
// ---------------------------------------------------------------------------

export function buildEditorPrompt(opts: { language: ContentLanguage; maxWords: number }): { system: string; userPrefix: string } {
  if (opts.language === "kz") {
    return {
      system:
        "Сен — ||| маркерлері бар дикторлық мәтіннің әдеби редакторысың. Мәтінді сөйлеу синтезі оқиды.\n" +
        "АЛЫП ТАСТА: бұрын аталған адамдарды, жерлерді және даталарды қайта таныстыруды (екінші рет — «ол», «сол түн», «сол хат»); " +
        "қайталап түсіндірілген фактілерді; «Сонымен», «Біз білетіндей», «Еске салайық», «Бұл кадрда», «Сол уақытта», «Айта кету керек» " +
        "сияқты қызметтік байланыстарды; айтылғанды сөзбе-сөз қайталайтын сөйлемдерді.\n" +
        "БӨЛ: 22 сөзден ұзын әрбір сөйлемді фактілерін жоғалтпай нүктемен екі-үш қысқа сөйлемге бөл; көсемше орамдарын етістігі бар жеке сөйлемге айналдыр.\n" +
        "КӨЛЕМ: мәтін " +
        opts.maxWords +
        " сөзден ұзын болса — ең әлсіз қайталаулар мен әшекейлерді осы шекке дейін қысқарт; әйтпесе көлем бастапқының 95%-нан кем болмасын.\n" +
        "САҚТА: оқиғалар ретін, БАРЛЫҚ ||| маркерлерін дәл сол сөйлемдер арасындағы сол орындарда, автордың стилін, тілдің тазалығын.\n" +
        "Ештеңе қоспа, ешқандай тақырып пен түсініктеме жазба.\n" +
        "Жауап — тек маркерлері бар мәтін.",
      userPrefix: "МӘТІН:\n",
    };
  }
  if (opts.language === "en") {
    return {
      system:
        "You are a literary editor of a voiceover text that contains ||| markers. The text will be read by speech synthesis.\n" +
        "REMOVE: re-introductions of people, places and dates already introduced (the second time it is 'he', 'that night', 'the letter'); " +
        "facts explained twice; connective filler such as 'So', 'As we already know', 'Let us recall', 'In this frame', 'Meanwhile', 'It is worth noting'; " +
        "sentences that repeat what was just said.\n" +
        "SPLIT: every sentence longer than 22 words into two or three short ones with full stops, losing no facts; turn participial phrases into a separate sentence with a verb ('Having come home, he…' → 'He came home. …').\n" +
        "LENGTH: if the text is longer than " +
        opts.maxWords +
        " words, cut the weakest repetitions and ornaments down to that limit; otherwise keep at least 95% of the original length.\n" +
        "KEEP: the order of events, ALL ||| markers exactly where they are between the same sentences, the author's voice.\n" +
        "Add nothing, write no headings or comments.\n" +
        "Answer with the text and its markers only.",
      userPrefix: "TEXT:\n",
    };
  }
  return {
    system:
      "Ты — литературный редактор дикторского текста с маркерами |||. Текст будет читать синтез речи.\n" +
      "УДАЛИ: повторные представления уже названных людей, мест и дат (второй раз — «он», «та ночь», «то письмо»); " +
      "повторно объяснённые факты; служебные связки «Итак», «Как мы уже знаем», «Напомним», «В этом кадре», «Тем временем», «Стоит отметить»; " +
      "фразы, дословно повторяющие только что сказанное.\n" +
      "РАЗБЕЙ: каждое предложение длиннее 22 слов — на два-три коротких, точкой, без потери фактов; деепричастный оборот превращай в отдельное предложение с глаголом " +
      "(«Вернувшись домой, он…» → «Он вернулся домой. …»).\n" +
      "ОБЪЁМ: если текст длиннее " +
      opts.maxWords +
      " слов — убери самые слабые повторы и украшения до этого предела; иначе объём не короче 95% исходного.\n" +
      "СОХРАНИ: порядок событий, ВСЕ маркеры ||| ровно на тех же местах между теми же предложениями, стиль автора.\n" +
      "Ничего не добавляй, не пиши заголовков и комментариев.\n" +
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
  reference?: ReferenceForPrompt | null;
}): { system: string; user: string } {
  const cast = (opts.blueprint?.characters || [])
    .map((c) => "- " + (c?.name || "") + ": " + (c?.appearance || ""))
    .filter((line) => line.length > 4)
    .join("\n");

  const referenceBlock = opts.reference
    ? "\n\nREFERENCE IMAGE (mandatory — every frame is generated FROM this image):\n" +
      "- subject: " +
      opts.reference.subjectPrompt +
      "\n- visual style: " +
      opts.reference.stylePrompt +
      "\nEvery prompt must feature this subject, described each time as 'the reference character' plus the subject line above verbatim, " +
      "and must be drawn in the reference's visual style — this overrides the Style line and the WORLD palette. Never redesign the subject."
    : "";

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
    referenceBlock +
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
