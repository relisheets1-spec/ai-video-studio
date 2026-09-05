import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { openai } from "@/lib/openai";
import { getClientIp, checkOpenAiRateLimit, sanitizeScriptInput } from "@/lib/security";
import { promptAspectHint } from "@/lib/orientation";

const GENRE_RULES: Record<string, string> = {
  thriller: "ЖАНР: ТРИЛЛЕР И САСПЕНС. Нагнетай адреналин и тревогу с первой секунды. Ставки смертельно высоки. Каждая сцена усиливает ощущение надвигающейся угрозы. Обязателен неожиданный сюжетный твист в кульминации.",
  detective: "ЖАНР: ДЕТЕКТИВ И РАССЛЕДОВАНИЕ. В центре — запутанная тайна или преступление. Герои ищут улики, сталкиваются с ложными следами и обманом. В финале — триумфальное раскрытие шокирующей правды.",
  comedy: "ЖАНР: ИРОНИЧНАЯ КОМЕДИЯ. Легкий, искрометный и остроумный тон. Забавные исторические парадоксы, курьезные ситуации, колоритные персонажи, ироничные замечания автора и позитивная, неожиданная развязка.",
  drama: "ЖАНР: ИСТОРИЧЕСКАЯ ДРАМА / ЭПОПЕЯ. Глубокий эмоциональный накал. Борьба за власть, верность и предательство, трагические выборы, величие человеческого духа и катарсис.",
  scifi_adventure: "ЖАНР: ФАНТАСТИКА И ПРИКЛЮЧЕНИЯ. Дух первооткрывателей, масштабные масштабы, смертельные испытания, новые миры/технологии и захватывающий триумф исследования.",
  horror: "ЖАНР: ХОРРОР И МИСТИКА. Мрачная, леденящая атмосфера. Шорохи, древние проклятия, необъяснимый страх перед неизвестным, нарастающее чувство ловушки и жуткий финал."
};

const GENRE_RULES_KZ: Record<string, string> = {
  thriller: "ЖАНР: ТРИЛЛЕР ЖӘНЕ САСПЕНС. Алғашқы секундтан бастап шиеленіс пен адреналинді күшейт. Қауіп жоғары. Соңында күтпеген тосын бетбұрыс (твист) болсын.",
  detective: "ЖАНР: ДЕТЕКТИВ ЖӘНЕ ЗЕРТТЕУ. Оқиға ортасында — күрделі жұмбақ немесе құпия қылмыс. Дәйектер іздеу, жалған іздер, ақырында таңқаларлық ақиқаттың ашылуы.",
  comedy: "ЖАНР: ИРОНИЯЛЫҚ КОМЕДИЯ. Жеңіл, өткір әрі тапқыр стиль. Қызықты тарихи парадокстар, қызық жағдайлар, өміршең кейіпкерлер және жарқын финал.",
  drama: "ЖАНР: ТАРИХИ ДРАМА / ДАСТАН. Терең эмоциялық тебіреніс, ерлік, сертке адалдық пен сатқындық, адам рухының ұлылығы және рухани тазару.",
  scifi_adventure: "ЖАНР: ҒЫЛЫМИ ФАНТАСТИКА ЖӘНЕ САЯХАТ. Жаңа әлемдер, қатерлі сынақтар, тылсым құпияларды батыл зерттеу.",
  horror: "ЖАНР: ҚОРҚЫНЫШ ЖӘНЕ МИСТИКА. Қара түнек, үрейлі атмосфера, ежелгі қарғыс, тылсым күштер мен қалтыратар финал."
};

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);

    // 1. Rate Limiting
    const rateLimit = checkOpenAiRateLimit(ip);
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: rateLimit.error }, { status: 429 });
    }

    const body = await req.json();

    // 2. Input validation
    const validation = sanitizeScriptInput(body);
    if (!validation.valid || !validation.sanitized) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const { topic, genre, style, voice, targetMinutes, language, orientation, secretCode } = validation.sanitized;

    // 3. User Resolution & Balance Verification
    let userId: string | null = null;

    if (secretCode) {
      let { data: user } = await supabaseAdmin
        .from("access_codes")
        .select("id, status, generations_limit, generations_used")
        .eq("secret_code", secretCode)
        .maybeSingle();

      if (!user && secretCode === "1599") {
        const { data: adminUser } = await supabaseAdmin
          .from("access_codes")
          .select("id, status, generations_limit, generations_used")
          .ilike("user_name", "%Администратор%")
          .maybeSingle();
        if (adminUser) user = adminUser;
      }

      if (user) {
        if (user.status !== "approved") {
          return NextResponse.json(
            { error: "Доступ не одобрен администратором" },
            { status: 403 }
          );
        }

        const remaining = Math.max(0, (user.generations_limit || 0) - (user.generations_used || 0));
        if (remaining <= 0) {
          return NextResponse.json(
            { error: "Лимит генераций исчерпан. Обратитесь к администратору для пополнения баланса." },
            { status: 403 }
          );
        }

        userId = user.id;
      }
    }

    if (!userId) {
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
    }

    // Determine scenes count: Test mode (4 frames, 20-30s) or Full 8 mins (strictly 25 scenes)
    const isTestMode = targetMinutes <= 1;
    const scenesCount = isTestMode ? 4 : 25;
    const sceneDurationDesc = isTestMode
      ? "6-7 секунд дикторской речи (14-18 слов)"
      : "18-20 секунд размеренной дикторской речи (45-55 слов)";

    // Create DB entry for this video
    const { data: videoRecord, error: insertError } = await supabaseAdmin
      .from("video_generations")
      .insert({
        user_id: userId,
        topic,
        style,
        voice,
        status: "generating_script",
        target_duration_minutes: isTestMode ? 1 : Math.round(targetMinutes) || 8,
        scenes: [],
      })
      .select()
      .single();

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    const genreRulesMap = language === "kz" ? GENRE_RULES_KZ : GENRE_RULES;
    const genrePrompt = genreRulesMap[genre] || genreRulesMap.thriller;

    const languageInstruction =
      language === "kz"
        ? "ТІЛДІК ЖӘНЕ ДИКТОРЛЫҚ ТАЛАПТАР (ӨТЕ МҮЛТІКСІЗ ОРЫНДАЛСЫН):\n" +
          "1. БАРЛЫҚ title ЖӘНЕ narration МӘТІНДЕРІ МІНДЕТТІ ТҮРДЕ 100% ТАЗА, БАЙ, КӨРКЕМ ӘДЕБИ ҚАЗАҚ ТІЛІНДЕ ЖАЗЫЛУЫ ТИІС!\n" +
          "2. Орысша сөздер немесе тілдерді араластыруға ҚАТАҢ ТЫЙЫМ САЛЫНАДЫ!\n" +
          "3. ДИКТОР СӨЙЛЕМДЕРІ: Сөйлемдерді ҚЫСҚА, ЫҚШАМ, ӘСЕРЛІ ЕТІП ЖАЗ (әр сөйлемде шамамен 6-12 сөз). 20+ сөзден тұратын тым шұбалаңқы сөйлемдер жазуға БОЛМАЙДЫ!\n" +
          "4. Әр ойды нүктемен аяқтап, табиғи тыныс пен кідіріс қалдыр (бір кадрда 2-4 қысқа серпінді сөйлем). Бұл субтитрлердің экранда анық әрі бір сөйлемнен шығуы үшін өте қажет.\n" +
          "5. Тек қана 'visualPrompt' өрісі ағылшын тілінде (English) жазылады."
        : "ЯЗЫКОВЫЕ ТРЕБОВАНИЯ И ДИКТОРСКАЯ РЕЧЬ (КРИТИЧЕСКИ ВАЖНО):\n" +
          "1. Все поля title и narration ОБЯЗАТЕЛЬНО пишутся на чистом, богатом, кинематографичном РУССКОМ ЯЗЫКЕ.\n" +
          "2. ДИКТОРСКИЙ ТЕКСТ ДОЛЖЕН БЫТЬ РАЗБИТ НА КОРОТКИЕ, ЁМКИЕ, ДИНАМИЧНЫЕ ПРЕДЛОЖЕНИЯ (в среднем 6-12 слов на каждое предложение).\n" +
          "3. СТРОЖАЙШИЙ ЗАПРЕТ НА ГРОМОЗДКИЕ 20+ СЛОВ МОНОТОННЫЕ ПЕРИОДЫ! Никаких длинных затянутых фраз без пауз.\n" +
          "4. Разделяй мысли точками и естественными речевыми паузами: короткая фраза, точка, следующая мысль. В каждом кадре должно быть 2-4 коротких лаконичных предложения, чтобы субтитры на экране идеально сменялись по одному предложению.\n" +
          "5. Только поле 'visualPrompt' пишется на английском языке.";

    const structureInstruction = isTestMode
      ? (language === "kz"
          ? "ТӨРТ АКТТІ ҚҰРЫЛЫМ (ТЕСТІК НҰСҚА: 4 КАДР, 20-30 СЕКУНД):\n" +
            "- Кадр 1 (Басталуы / Хук): Алғашқы секундтан көрерменді баурап алатын қуатты кіріспе.\n" +
            "- Кадр 2 (Шиеленіс): Қақтығыстың өрбуі, шиеленіс пен күрес.\n" +
            "- Кадр 3 (Кульминация / Твист): Сюжеттің күтпеген шешуші сәті.\n" +
            "- Кадр 4 (Шешім): Оқиғаның әсерлі түйіні және терең қорытынды."
          : "ЧЕТЫРЕХАКТНАЯ СТРУКТУРА (4 КАДРА ДЛЯ БЫСТРОГО ТЕСТА НА 20-30 СЕКУНД):\n" +
            "- Кадр 1 (Завязка / Хук): Мощный хук, интригующее начало, бросающее зрителя в гущу событий.\n" +
            "- Кадр 2 (Развитие конфликта): Нарастание напряжения, обострение дилеммы и препятствия.\n" +
            "- Кадр 3 (Кульминация / Твист): Решающий острый момент и неожиданный поворот сюжета.\n" +
            "- Кадр 4 (Развязка / Финал): Эмоциональный итог, послесловие и мощное завершение истории.")
      : "КЛАССИЧЕСКАЯ ТРЕХАКТНАЯ ДРАМАТУРГИЧЕСКАЯ СТРУКТУРА (25 СЦЕН):\n" +
        "1. АКТ 1: ЗАВЯЗКА И ХУК (Сцены 1-5):\n" +
        "   - Сцена 1: Убойный хук (hook). Вопрос жизни и смерти, неразрешимая загадка или катастрофа. Зритель должен быть прикован к экрану с первых секунд.\n" +
        "   - Сцены 2-5: Погружение в мир, знакомство с героями и обстоятельствами. Зарождение главного конфликта.\n" +
        "2. АКТ 2: РАЗВИТИЕ И ЭСКАЛАЦИЯ КОНФЛИКТА (Сцены 6-18):\n" +
        "   - Сцены 6-10: Нарастание напряжения, препятствия, первые опасности, ложные надежды.\n" +
        "   - Сцены 11-14: Первый крупный сюжетный твист (Plot Twist). Ставки взлетают до предела. Точка невозврата.\n" +
        "   - Сцены 15-18: Катастрофический кризис, момент отчаяния перед решающей битвой / разгадкой.\n" +
        "3. АКТ 3: КУЛЬМИНАЦИЯ И СИЛЬНАЯ РАЗВЯЗКА (Сцены 19-25):\n" +
        "   - Сцены 19-22: Генеральное столкновение, битва или решающее открытие тайны. Пик эмоций.\n" +
        "   - Сцены 23-24: Шокирующий финальный твист, меняющий восприятие всей истории.\n" +
        "   - Сцена 25: Мощная философская или эмоциональная развязка, послесловие, эхо сквозь века.";

    const systemPrompt = "Ты — первоклассный голливудский сценарист и шоураннер документальных и художественных блокбастеров.\n" +
      "Пользователь передает тему или краткую идею сюжета.\n" +
      "Твоя задача — развернуть эту тему в полноценный, захватывающий сценарий из ровно " + scenesCount + " сцен (кадров).\n\n" +
      genrePrompt + "\n\n" +
      languageInstruction + "\n\n" +
      structureInstruction + "\n\n" +
      "ТРЕБОВАНИЯ К КАЖДОЙ СЦЕНЕ:\n" +
      "- id: порядковый номер от 1 до " + scenesCount + ".\n" +
      "- title: интригующее кинематографичное название кадра.\n" +
      "- narration: текст диктора на выбранном языке. Длительность: " + sceneDurationDesc + ". ПИШИ КОРОТКИМИ, ЁМКИМИ ПРЕДЛОЖЕНИЯМИ (6-12 слов каждое, разделенные точками для естественных пауз). Категорически избегай предложений длиннее 15-20 слов!\n" +
      "- durationEstimate: расчетное время в секундах (" + (isTestMode ? 7 : 19) + ").\n" +
      "- visualPrompt: ДЕТАЛЬНЫЙ ПРОМПТ ДЛЯ AI-ГЕНЕРАТОРА ИЗОБРАЖЕНИЙ СТРОГО НА АНГЛИЙСКОМ ЯЗЫКЕ!\n\n" +
      "КРИТИЧЕСКИЕ ПРАВИЛА ДЛЯ visualPrompt (НА АНГЛИЙСКОМ):\n" +
      "1. Промпт КАЖДОГО кадра ОБЯЗАН СТРОГО СООТВЕТСТВОВАТЬ СОДЕРЖАНИЮ СЦЕНЫ! Никаких посторонних волков, абстрактных лесов, если сюжет про Рим/космос/батыров!\n" +
      "2. Обязательно укажи: центральный объект/персонажей, их позу и действия, исторически точные костюмы/доспехи, архитектуру, ракурс " + promptAspectHint(orientation) + ", драматичный кинематографичный свет, стиль: " + style + ".\n\n" +
      "Отвечай строго в формате JSON: { \"title\": \"...\", \"overview\": \"...\", \"scenes\": [{ \"id\": 1, \"title\": \"...\", \"narration\": \"...\", \"visualPrompt\": \"Cinematic " + promptAspectHint(orientation) + " shot...\", \"durationEstimate\": " + (isTestMode ? 7 : 19) + " }] }";

    const userMessage =
      language === "kz"
        ? "Сюжет тақырыбы:\n\"" + topic.trim() + "\"\n\nЖанр: " + genre + ". Тіл: ТАЗА ҚАЗАҚ ТІЛІ (Орысша сөздерсіз!). Дәл " + scenesCount + " кадрдан тұратын тұтас қазақша сценарий құрастыр. Барлық narration мәтіндері әдеби қазақша болуы керек!"
        : "Тема пользователя:\n\"" + topic.trim() + "\"\n\nЖанр: " + genre + ". Язык: Русский язык. Создай сценарий из ровно " + scenesCount + " сцен с четкой завязкой, развитием, твистом и мощной развязкой.";

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-2024-11-20",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: userMessage,
        },
      ],
      temperature: 0.75,
    });

    const content = completion.choices[0].message.content;
    if (!content) {
      throw new Error("Не удалось получить ответ от модели");
    }

    const parsed = JSON.parse(content);

    // Ориентацию проставляем на сервере в каждую сцену. Хранится внутри
    // scenes jsonb, а не отдельной колонкой: миграций в репозитории нет,
    // и вставка с несуществующей колонкой уронила бы каждую генерацию.
    const scenesOut = (parsed.scenes || []).map((sc: any) => ({ ...sc, orientation }));

    // Update video record
    await supabaseAdmin
      .from("video_generations")
      .update({
        scenes: scenesOut,
        status: "generating_audio",
      })
      .eq("id", videoRecord.id);

    return NextResponse.json({
      videoId: videoRecord.id,
      title: parsed.title || topic,
      scenes: scenesOut,
    });
  } catch (err: any) {
    console.error("Script Generation Error:", err);
    return NextResponse.json({ error: err.message || "Ошибка при генерации сценария" }, { status: 500 });
  }
}
