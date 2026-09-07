import type { ContentLanguage } from "./languages";

/** Первый жанр — жанр по умолчанию: обычное повествование, а не триллер. */
export const GENRE_IDS = [
  "narrative",
  "drama",
  "comedy",
  "adventure",
  "historical",
  "scifi_adventure",
  "thriller",
  "detective",
] as const;
export type GenreId = (typeof GENRE_IDS)[number];

export interface GenreDef {
  /** Подпись в интерфейсе (всегда по-русски). */
  label: string;
  /** Имя иконки Phosphor — строкой, чтобы модуль могли импортировать серверные роуты. */
  icon: string;
  /** Нужен ли жанру сюжетный твист. */
  wantsTwist: boolean;
  rules: Record<ContentLanguage, string>;
}

export const GENRES: Record<GenreId, GenreDef> = {
  narrative: {
    label: "Обычный рассказ",
    icon: "BookOpen",
    wantsTwist: false,
    rules: {
      ru:
        "ЖАНР: ОБЫЧНОЕ ПОВЕСТВОВАНИЕ / ЖИТЕЙСКАЯ ИСТОРИЯ. Спокойный человечный рассказ без нагнетания. " +
        "КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНЫ: искусственные твисты, угрозы, «ставки смертельно высоки», нагнетание тревоги, " +
        "обрывы на полуслове ради интриги, слова «шокирующий», «роковой», «зловещий», «леденящий». " +
        "Держи ровный доброжелательный тон, бытовые детали, живые наблюдения, лёгкую иронию. " +
        "Развитие идёт через узнавание героя и накопление деталей, а не через опасность. Финал тихий и тёплый, без морали.",
      kz:
        "ЖАНР: ҚАРАПАЙЫМ ӘҢГІМЕ / ӨМІРДЕН АЛЫНҒАН ОҚИҒА. Шиеленіссіз, жайбарақат, адами баяндау. " +
        "ҚАТАҢ ТЫЙЫМ: жасанды бетбұрыстар, қауіп-қатер, үрей үстеу, қызықтыру үшін сөзді жартылай үзу. " +
        "Біркелкі жылы леппен, тұрмыстық бөлшектермен, тірі бақылаулармен жаз. Оқиға қауіп арқылы емес, " +
        "кейіпкерді тану арқылы дамиды. Финал тыныш әрі жылы, ақыл айтусыз.",
      en:
        "GENRE: PLAIN NARRATIVE / A STORY FROM LIFE. A calm, human account with no manufactured tension. " +
        "STRICTLY FORBIDDEN: artificial twists, threats, life-or-death stakes, mounting dread, cliffhangers for their own sake, " +
        "and the words shocking, fateful, sinister. Keep an even, warm tone with ordinary detail, close observation and light irony. " +
        "It develops by getting to know the person and accumulating detail, not through danger. The ending is quiet and warm, with no moral.",
    },
  },
  drama: {
    label: "Драма",
    icon: "Heart",
    wantsTwist: false,
    rules: {
      ru: "ЖАНР: ДРАМА. Глубокий эмоциональный накал. Трудные выборы, верность и предательство, цена решения. Развитие идёт через характеры, а не через внешние трюки.",
      kz: "ЖАНР: ДРАМА. Терең эмоциялық тебіреніс. Қиын таңдау, адалдық пен опасыздық, шешімнің бағасы. Оқиға сыртқы айла-шарғы емес, мінез арқылы дамиды.",
      en: "GENRE: DRAMA. Deep emotional pressure. Hard choices, loyalty and betrayal, the cost of a decision. It develops through character, not through external tricks.",
    },
  },
  comedy: {
    label: "Комедия",
    icon: "Smiley",
    wantsTwist: false,
    rules: {
      ru: "ЖАНР: ИРОНИЧНАЯ КОМЕДИЯ. Лёгкий, остроумный тон. Курьёзные положения, колоритные персонажи, ирония рассказчика и добрая, неожиданная развязка.",
      kz: "ЖАНР: ИРОНИЯЛЫҚ КОМЕДИЯ. Жеңіл, тапқыр стиль. Қызық жағдайлар, өміршең кейіпкерлер, баяндаушының иронисы және жылы, күтпеген аяқталу.",
      en: "GENRE: WRY COMEDY. Light, witty tone. Absurd situations, vivid characters, an ironic narrator and a warm, unexpected payoff.",
    },
  },
  adventure: {
    label: "Приключения",
    icon: "Compass",
    wantsTwist: false,
    rules: {
      ru:
        "ЖАНР: ПРИКЛЮЧЕНИЯ. Дорога, ясная цель и препятствия на пути. Мир познаётся через путь: пейзажи, попутчики, находки. " +
        "Опасность реальна, но тон — азарт и открытие, а не страх. Герой меняется благодаря дороге, и финал — прибытие, которое стоило пути.",
      kz:
        "ЖАНР: САЯХАТ ПЕН ШЫТЫРМАН ОҚИҒА. Жол, айқын мақсат және жолдағы кедергілер. Әлем жол арқылы ашылады: көріністер, жолсеріктер, олжалар. " +
        "Қауіп шынайы, бірақ леп — қорқыныш емес, құштарлық пен ашылу. Кейіпкер жолдың арқасында өзгереді, финал — жолға тұрарлық жету.",
      en:
        "GENRE: ADVENTURE. A road, a clear goal and obstacles along the way. The world is discovered en route: landscapes, companions, finds. " +
        "Danger is real, but the tone is excitement and discovery, not fear. The road changes the hero, and the ending is an arrival that was worth the journey.",
    },
  },
  historical: {
    label: "Историческая хроника",
    icon: "Scroll",
    wantsTwist: false,
    rules: {
      ru:
        "ЖАНР: ИСТОРИЧЕСКАЯ ХРОНИКА. Конкретная эпоха с датами, вещами, ремёслами, едой, одеждой и бытом. " +
        "Сдержанный документальный голос: рассказчик знает больше героев, но не судит их. Вымысел не противоречит известным фактам. " +
        "Большие события показываются через одного человека и его день, а не через перечисление.",
      kz:
        "ЖАНР: ТАРИХИ ШЕЖІРЕ. Нақты дәуір: даталар, заттар, кәсіп, тамақ, киім, тұрмыс. " +
        "Ұстамды деректі баяндау: баяндаушы кейіпкерлерден көп біледі, бірақ оларды соттамайды. Ойдан шығарылғаны белгілі деректерге қайшы келмейді. " +
        "Үлкен оқиғалар тізбек емес, бір адам мен оның күні арқылы көрсетіледі.",
      en:
        "GENRE: HISTORICAL CHRONICLE. A specific era with dates, objects, crafts, food, clothing and daily life. " +
        "A restrained documentary voice: the narrator knows more than the characters but does not judge them. Invention never contradicts known facts. " +
        "Big events are shown through one person and their day, not through a list.",
    },
  },
  scifi_adventure: {
    label: "Фантастика",
    icon: "Rocket",
    wantsTwist: true,
    rules: {
      ru: "ЖАНР: ФАНТАСТИКА И ПРИКЛЮЧЕНИЯ. Дух первооткрывателей, большой масштаб, опасные испытания, новые миры и технологии, захватывающий триумф исследования.",
      kz: "ЖАНР: ҒЫЛЫМИ ФАНТАСТИКА ЖӘНЕ САЯХАТ. Ашушылар рухы, ауқымдылық, қатерлі сынақтар, жаңа әлемдер мен технологиялар, зерттеудің салтанаты.",
      en: "GENRE: SCIENCE FICTION AND ADVENTURE. The spirit of discovery, real scale, dangerous trials, new worlds and technologies, the thrill of exploration.",
    },
  },
  thriller: {
    label: "Триллер",
    icon: "Lightning",
    wantsTwist: true,
    rules: {
      ru: "ЖАНР: ТРИЛЛЕР И САСПЕНС. Нагнетай тревогу с первой секунды. Ставки высоки, угроза приближается. Обязателен неожиданный поворот в кульминации.",
      kz: "ЖАНР: ТРИЛЛЕР ЖӘНЕ САСПЕНС. Алғашқы секундтан бастап шиеленісті күшейт. Қауіп жақындап келеді. Шарықтау шегінде күтпеген бетбұрыс болсын.",
      en: "GENRE: THRILLER AND SUSPENSE. Build dread from the first second. The stakes are high and the threat is closing in. A sharp reversal at the climax is mandatory.",
    },
  },
  detective: {
    label: "Детектив",
    icon: "MagnifyingGlass",
    wantsTwist: true,
    rules: {
      ru: "ЖАНР: ДЕТЕКТИВ И РАССЛЕДОВАНИЕ. В центре — запутанная тайна. Улики, ложные следы, обман. В финале — раскрытие правды, которое переосмысливает всё сказанное раньше.",
      kz: "ЖАНР: ДЕТЕКТИВ ЖӘНЕ ЗЕРТТЕУ. Оқиға ортасында — күрделі жұмбақ. Дәйектер, жалған іздер, алдау. Ақырында бүкіл әңгімені қайта қарауға мәжбүрлейтін ақиқат ашылады.",
      en: "GENRE: DETECTIVE AND INVESTIGATION. A tangled mystery at the centre. Clues, false trails, deception. The ending reveals a truth that recasts everything said before.",
    },
  },
};

export function normalizeGenre(value: unknown): GenreId {
  return GENRE_IDS.includes(value as GenreId) ? (value as GenreId) : "narrative";
}
