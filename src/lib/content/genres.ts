import type { ContentLanguage } from "./languages";

export const GENRE_IDS = [
  "thriller",
  "detective",
  "drama",
  "comedy",
  "scifi_adventure",
  "horror",
  "narrative",
] as const;
export type GenreId = (typeof GENRE_IDS)[number];

export interface GenreDef {
  /** Подпись в интерфейсе (всегда по-русски). */
  label: string;
  /** Ключ иконки Phosphor. Строкой, а не компонентом: этот модуль
   *  импортируют серверные роуты, им React в бандле не нужен. */
  icon: string;
  /** Нужен ли жанру сюжетный твист. Раньше «обязательный твист» был зашит
   *  в правила всех жанров и лез даже в драму и бытовой рассказ. */
  wantsTwist: boolean;
  rules: Record<ContentLanguage, string>;
}

export const GENRES: Record<GenreId, GenreDef> = {
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
  horror: {
    label: "Хоррор",
    icon: "Ghost",
    wantsTwist: true,
    rules: {
      ru: "ЖАНР: ХОРРОР И МИСТИКА. Мрачная, леденящая атмосфера. Древние проклятия, необъяснимый страх, нарастающее чувство ловушки и жуткий финал.",
      kz: "ЖАНР: ҚОРҚЫНЫШ ЖӘНЕ МИСТИКА. Қара түнек, үрейлі атмосфера. Ежелгі қарғыс, түсініксіз қорқыныш, қақпанға түсу сезімі және қалтыратар финал.",
      en: "GENRE: HORROR AND THE UNCANNY. A cold, oppressive atmosphere. Old curses, inexplicable fear, a tightening sense of a trap, and a chilling final image.",
    },
  },
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
};

export function normalizeGenre(value: unknown): GenreId {
  return GENRE_IDS.includes(value as GenreId) ? (value as GenreId) : "thriller";
}
