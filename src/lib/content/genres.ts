import type { ContentLanguage } from "./languages";

/** Первый жанр — жанр по умолчанию: обычное повествование, а не триллер. */
export const GENRE_IDS = [
  "narrative",
  "drama",
  "comedy",
  "romance",
  "adventure",
  "historical",
  "biography",
  "fairy_tale",
  "fantasy",
  "scifi_adventure",
  "thriller",
  "detective",
  "crime",
  "horror",
  "mystic",
  "inspirational",
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
  romance: {
    label: "Романтическая история",
    icon: "HandHeart",
    wantsTwist: false,
    rules: {
      ru:
        "ЖАНР: РОМАНТИЧЕСКАЯ ИСТОРИЯ. Сближение двух людей через мелочи: взгляды, недосказанность, случайные встречи, сомнения и уязвимость. " +
        "Без клише «любовь с первого взгляда», без слащавости и пафоса. Чувство показывается поступками и деталями, а не объявляется. " +
        "Финал тёплый, но не обязательно счастливый; главное — что герои изменились друг от друга.",
      kz:
        "ЖАНР: РОМАНТИКАЛЫҚ ОҚИҒА. Екі адамның ұсақ-түйек арқылы жақындасуы: көзқарас, айтылмаған сөз, кездейсоқ кездесу, күмән мен осалдық. " +
        "«Бір көргеннен ғашық болу» сияқты клишесіз, тәттілік пен пафоссыз. Сезім жарияланбайды, іс-әрекет пен бөлшек арқылы көрсетіледі. " +
        "Финал жылы, бірақ міндетті түрде бақытты емес; бастысы — кейіпкерлер бір-бірінен өзгерді.",
      en:
        "GENRE: ROMANCE. Two people drawing closer through small things: glances, what stays unsaid, chance meetings, doubt and vulnerability. " +
        "No love-at-first-sight cliches, no syrup, no pathos. Feeling is shown through actions and detail, never announced. " +
        "A warm ending, not necessarily a happy one; what matters is that they changed each other.",
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
  biography: {
    label: "Биография",
    icon: "IdentificationCard",
    wantsTwist: false,
    rules: {
      ru:
        "ЖАНР: БИОГРАФИЯ. Жизнь одного человека от формирующего момента до итога. Выборы, их цена, что осталось после. " +
        "Без агиографии и мрамора: слабости и ошибки показываются так же честно, как достижения. " +
        "Факты и даты — только те, что двигают историю; эпоха видна через вещи и людей рядом.",
      kz:
        "ЖАНР: ӨМІРБАЯН. Бір адамның өмірі: қалыптастырған сәттен қорытындыға дейін. Таңдаулар, олардың бағасы, кейін не қалды. " +
        "Мадақтаусыз және мәрмәрсіз: әлсіздік пен қателік жетістік сияқты шыншыл көрсетіледі. " +
        "Деректер мен даталар — тек оқиғаны қозғайтындары; дәуір заттар мен қасындағы адамдар арқылы көрінеді.",
      en:
        "GENRE: BIOGRAPHY. One life from a formative moment to its sum. Choices, their cost, what remained afterwards. " +
        "No hagiography, no marble: weaknesses and mistakes are shown as honestly as achievements. " +
        "Only the facts and dates that move the story; the era is visible through objects and the people nearby.",
    },
  },
  fairy_tale: {
    label: "Сказка",
    icon: "MoonStars",
    wantsTwist: false,
    rules: {
      ru:
        "ЖАНР: СКАЗКА. Сказовая интонация: «жил-был», троекратные повторы, говорящие звери и вещи, простые ясные образы. " +
        "Добро и смекалка побеждают, но не даром: герой платит трудом или хитростью. Без жестокости и страха, годится детям. " +
        "Мораль — одной тихой фразой в самом конце, не назиданием.",
      kz:
        "ЖАНР: ЕРТЕГІ. Ертегі сарыны: «ерте, ерте, ертеде», үш мәрте қайталау, сөйлейтін аңдар мен заттар, қарапайым айқын бейнелер. " +
        "Жақсылық пен тапқырлық жеңеді, бірақ тегін емес: кейіпкер еңбекпен немесе айламен төлейді. Қатыгездік пен қорқынышсыз, балаларға жарайды. " +
        "Тағылым — ең соңында бір тыныш сөйлеммен, ақыл айтусыз.",
      en:
        "GENRE: FAIRY TALE. Folk-tale cadence: once upon a time, the rule of three, talking animals and objects, simple clear images. " +
        "Kindness and wit win, but not for free: the hero pays with work or cunning. No cruelty or fear; suitable for children. " +
        "The moral is a single quiet line at the very end, never a lecture.",
    },
  },
  fantasy: {
    label: "Фэнтези",
    icon: "Sword",
    wantsTwist: false,
    rules: {
      ru:
        "ЖАНР: ФЭНТЕЗИ. Свой мир с правилами магии, которые НИКОГДА не нарушаются ради удобства сюжета. Квест с ясной целью и цена силы. " +
        "Масштаб — через детали: обычаи, монеты, запахи, названия мест, а не через перечисление народов. Герой платит за каждое чудо.",
      kz:
        "ЖАНР: ФЭНТЕЗИ. Сиқыр ережелері сюжет ыңғайы үшін ЕШҚАШАН бұзылмайтын өз әлемі. Айқын мақсаты бар квест және күштің бағасы. " +
        "Ауқым — халықтарды тізу арқылы емес, бөлшектер арқылы: дәстүрлер, теңгелер, иістер, жер атаулары. Кейіпкер әр кереметке төлейді.",
      en:
        "GENRE: FANTASY. A world of its own whose magic rules are NEVER broken for the plot's convenience. A quest with a clear goal and a price for power. " +
        "Scale through detail: customs, coins, smells, place names, not lists of peoples. The hero pays for every wonder.",
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
  crime: {
    label: "Криминальная драма",
    icon: "Gavel",
    wantsTwist: true,
    rules: {
      ru:
        "ЖАНР: КРИМИНАЛЬНАЯ ДРАМА. Преступление и его цена глазами тех, кто внутри. Мотивы важнее погонь: почему человек переступил черту. " +
        "Моральная серость — нет чистых героев и злодеев. Финал — расплата или её отсутствие, и оба варианта должны быть заработаны историей.",
      kz:
        "ЖАНР: ҚЫЛМЫСТЫҚ ДРАМА. Қылмыс пен оның бағасы — ішіндегілердің көзімен. Қуғыннан гөрі себептер маңызды: адам неге шектен шықты. " +
        "Моральдық сұр реңк — таза кейіпкер де, таза зұлым да жоқ. Финал — жаза немесе оның болмауы, екеуі де оқиғамен ақталуы керек.",
      en:
        "GENRE: CRIME DRAMA. Crime and its cost seen from inside. Motives over chases: why a person crossed the line. " +
        "Moral grey: no clean heroes or villains. The ending is a reckoning or the lack of one, and either must be earned by the story.",
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
  mystic: {
    label: "Мистика",
    icon: "Eye",
    wantsTwist: true,
    rules: {
      ru:
        "ЖАНР: МИСТИКА. Необъяснимое рядом с обычным: знаки, совпадения, вещи не на своих местах, тихая жуть без крови и монстров. " +
        "Рассказчик не объясняет, а замечает. Финал двусмыслен: у случившегося есть и обычное, и потустороннее объяснение, и оба неудобны.",
      kz:
        "ЖАНР: МИСТИКА. Қарапайымның жанындағы түсініксіздік: белгілер, кездейсоқтықтар, орнында емес заттар, қансыз, құбыжықсыз тыныш үрей. " +
        "Баяндаушы түсіндірмейді, байқайды. Финал екіұшты: болған оқиғаның қарапайым да, о дүниелік те түсіндірмесі бар, екеуі де қолайсыз.",
      en:
        "GENRE: MYSTIC. The inexplicable next to the ordinary: signs, coincidences, things out of place, quiet unease without gore or monsters. " +
        "The narrator notices rather than explains. The ending stays ambiguous: what happened has both an ordinary and an uncanny explanation, and both are uncomfortable.",
    },
  },
  inspirational: {
    label: "Мотивирующая история",
    icon: "Mountains",
    wantsTwist: false,
    rules: {
      ru:
        "ЖАНР: МОТИВИРУЮЩАЯ ИСТОРИЯ. Преодоление реального препятствия: работа, ошибки, откаты назад, помощь других людей. " +
        "Без пафоса, без мотивационных цитат, без обращений к зрителю «и ты сможешь». Результат показан, а не провозглашён, " +
        "и цена результата видна так же ясно, как сам результат.",
      kz:
        "ЖАНР: ШАБЫТТАНДЫРАТЫН ОҚИҒА. Нақты кедергіні жеңу: еңбек, қателіктер, кері шегіну, өзге адамдардың көмегі. " +
        "Пафоссыз, ұрандаған дәйексөзсіз, көрерменге «сен де істей аласың» деп үндеусіз. Нәтиже жарияланбайды, көрсетіледі, " +
        "және нәтиженің бағасы нәтиженің өзі сияқты айқын көрінеді.",
      en:
        "GENRE: INSPIRATIONAL. Overcoming a real obstacle: work, mistakes, setbacks, other people's help. " +
        "No pathos, no poster quotes, no 'you can do it too' addressed to the viewer. The result is shown, not declared, " +
        "and its price is as visible as the result itself.",
    },
  },
};

export function normalizeGenre(value: unknown): GenreId {
  return GENRE_IDS.includes(value as GenreId) ? (value as GenreId) : "narrative";
}
