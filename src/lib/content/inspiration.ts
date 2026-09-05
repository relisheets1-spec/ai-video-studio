import type { GenreId } from "./genres";
import type { ContentLanguage } from "./languages";

export interface InspirationTheme {
  label: string;
  genre: GenreId;
  prompt: string;
}

/** Подсказки-темы под текстовым полем, по одному набору на язык контента. */
export const INSPIRATION: Record<ContentLanguage, InspirationTheme[]> = {
  ru: [
    {
      label: "Кофейня на углу",
      genre: "narrative",
      prompt:
        "Обычная кофейня на углу, где бариста за пятнадцать лет запомнил заказ каждого постоянного посетителя. Спокойная история о людях, которые приходят сюда каждое утро, и о том, что они приносят с собой.",
    },
    {
      label: "Последний маяк",
      genre: "narrative",
      prompt:
        "Смотритель маяка на Каспии продолжает зажигать свет, хотя корабли давно ходят по GPS. История одной осени, когда к нему впервые за много лет приехал гость.",
    },
    {
      label: "Учительница из аула",
      genre: "drama",
      prompt:
        "Молодая учительница приезжает по распределению в далёкий аул, где школу собираются закрыть, и за один учебный год меняет решение целого района.",
    },
    {
      label: "IT-стартап: триумф и крах",
      genre: "drama",
      prompt:
        "История амбициозного IT-стартапа: от первой гениальной идеи в гараже и миллиардных инвестиций до сокрушительного краха из-за гордыни основателей и корпоративного шпионажа.",
    },
    {
      label: "Свадьба, которую чуть не отменили",
      genre: "comedy",
      prompt:
        "Две большие семьи готовят свадьбу в Шымкенте, и каждая уверена, что главная здесь она. Курьёзы, тосты, три версии меню и неожиданный примиритель.",
    },
    {
      label: "Письмо через сорок лет",
      genre: "romance",
      prompt:
        "Женщина находит письмо, которое ей так и не отправили в 1984 году, и отправляется искать его автора по адресам, которых больше нет.",
    },
    {
      label: "Караван по Шёлковому пути",
      genre: "historical",
      prompt:
        "Купец четырнадцатого века ведёт караван из Отрара в Самарканд. Торговля, пустыня, доверие и предательство на одном переходе.",
    },
    {
      label: "Первый казах в космосе",
      genre: "biography",
      prompt:
        "Путь Токтара Аубакирова от аула до орбиты: лётные испытания, отбор в отряд, около восьми дней на станции «Мир» и возвращение домой.",
    },
    {
      label: "Тайна горного отеля",
      genre: "detective",
      prompt:
        "В элитном закрытом отеле в горах посреди ночи бесследно исчезает влиятельный постоялец. Детектив начинает расследование и понимает, что каждый свидетель и персонал отеля лгут.",
    },
    {
      label: "Ночное ограбление в Алматы",
      genre: "thriller",
      prompt:
        "Ночь в центре Алматы. Дерзкая группа грабителей проникает в защищённое хранилище частного банка, но неожиданный сбой системы безопасности запирает их внутри вместе с заложниками.",
    },
    {
      label: "Сигнал с Марса",
      genre: "scifi_adventure",
      prompt:
        "Экспедиция на Марс принимает повторяющийся сигнал из-под льда полярной шапки, и каждая новая расшифровка меняет план миссии.",
    },
    {
      label: "Марафон после травмы",
      genre: "inspirational",
      prompt:
        "Бывший бегун после аварии учится ходить заново и через два года выходит на старт алматинского марафона. Без чудес: врачи, срывы, соседка с собакой и первые сто метров.",
    },
  ],
  kz: [
    {
      label: "Бұрыштағы кофехана",
      genre: "narrative",
      prompt:
        "Бұрыштағы қарапайым кофехана. Бариста он бес жыл ішінде әр тұрақты қонақтың тапсырысын жаттап алған. Күн сайын таңертең осында келетін адамдар және олардың өзімен бірге әкелетіні туралы жайбарақат әңгіме.",
    },
    {
      label: "Соңғы шамшырақ",
      genre: "narrative",
      prompt:
        "Каспийдегі шамшырақ күзетшісі кемелер әлдеқашан GPS-пен жүрсе де, шамды жағуды тоқтатпайды. Көп жылдан кейін оған алғаш рет қонақ келген бір күздің оқиғасы.",
    },
    {
      label: "Ауылдағы мұғалім",
      genre: "drama",
      prompt:
        "Жас мұғалім жолдамамен мектебі жабылғалы тұрған алыс ауылға келеді де, бір оқу жылында бүкіл ауданның шешімін өзгертеді.",
    },
    {
      label: "Стартаптың өрлеуі мен құлдырауы",
      genre: "drama",
      prompt:
        "Амбициялы IT-стартаптың шынайы тарихы: гараждағы алғашқы идея мен миллиардтаған инвестициялардан бастап, негізін қалаушылардың өр көкіректігі салдарынан күйреуіне дейін.",
    },
    {
      label: "Болмай қала жаздаған той",
      genre: "comedy",
      prompt:
        "Екі үлкен әулет Шымкентте той дайындап жатыр, әрқайсысы бастысы өзі деп сенеді. Күлкілі жағдайлар, тосттар, ас мәзірінің үш нұсқасы және күтпеген татуластырушы.",
    },
    {
      label: "Қырық жылдан кейінгі хат",
      genre: "romance",
      prompt:
        "Әйел 1984 жылы өзіне жіберілмей қалған хатты тауып алады да, енді жоқ мекенжайлар бойынша оның авторын іздеуге аттанады.",
    },
    {
      label: "Жібек жолындағы керуен",
      genre: "historical",
      prompt:
        "Он төртінші ғасырдағы саудагер Отырардан Самарқандқа керуен бастап барады. Сауда, шөл, сенім мен опасыздық — бір өткелде.",
    },
    {
      label: "Ғарыштағы алғашқы қазақ",
      genre: "biography",
      prompt:
        "Тоқтар Әубәкіровтің ауылдан орбитаға дейінгі жолы: ұшу сынақтары, іріктеу, «Мир» станциясындағы сегіз күндей уақыт және үйге оралу.",
    },
    {
      label: "Қонақүйдегі жұмбақ жоғалу",
      genre: "detective",
      prompt:
        "Таудағы элиталық жабық қонақүйде түн ортасында беделді қонақ із-түзсіз жоғалады. Детектив зерттеу барысында куәгерлердің әрқайсысы бірдеңені жасырып тұрғанын аңғарады.",
    },
    {
      label: "Алматыдағы түнгі тонау",
      genre: "thriller",
      prompt:
        "Түнгі Алматы орталығы. Тәжірибелі қарақшылар тобы жеке банктің күзетілетін қоймасына кіреді, бірақ дабыл жүйесінің істен шығуы оларды кепілге алынғандармен бірге ғимарат ішінде қамап тастайды.",
    },
    {
      label: "Марстан келген сигнал",
      genre: "scifi_adventure",
      prompt:
        "Марс экспедициясы полюс мұзының астынан қайталанатын сигнал қабылдайды, әрбір жаңа шешім миссия жоспарын өзгертеді.",
    },
    {
      label: "Жарақаттан кейінгі марафон",
      genre: "inspirational",
      prompt:
        "Бұрынғы жүгіруші апаттан кейін қайта жүруді үйреніп, екі жылдан соң Алматы марафонының сөресіне шығады. Кереметсіз: дәрігерлер, сәтсіздіктер, иті бар көрші және алғашқы жүз метр.",
    },
  ],
  en: [
    {
      label: "The corner coffee shop",
      genre: "narrative",
      prompt:
        "An ordinary corner coffee shop where, over fifteen years, the barista has learned every regular's order by heart. A quiet story about the people who come in each morning and what they bring with them.",
    },
    {
      label: "The last lighthouse",
      genre: "narrative",
      prompt:
        "A lighthouse keeper on the Caspian still lights the lamp every night although ships have navigated by GPS for years. The story of one autumn when, for the first time in a long while, a visitor came.",
    },
    {
      label: "The village teacher",
      genre: "drama",
      prompt:
        "A young teacher is posted to a remote village whose school is about to be closed, and over one school year changes the mind of a whole district.",
    },
    {
      label: "A startup's rise and fall",
      genre: "drama",
      prompt:
        "The story of an ambitious tech startup: from the first brilliant idea in a garage and billion-dollar funding to a total collapse driven by the founders' hubris and corporate espionage.",
    },
    {
      label: "The wedding that almost wasn't",
      genre: "comedy",
      prompt:
        "Two large families prepare a wedding in Shymkent, each certain it is the one in charge. Mishaps, toasts, three versions of the menu and an unexpected peacemaker.",
    },
    {
      label: "A letter forty years late",
      genre: "romance",
      prompt:
        "A woman finds a letter that was never sent to her in 1984 and sets out to find its author at addresses that no longer exist.",
    },
    {
      label: "Caravan on the Silk Road",
      genre: "historical",
      prompt:
        "A fourteenth-century merchant leads a caravan from Otrar to Samarkand. Trade, desert, trust and betrayal on a single crossing.",
    },
    {
      label: "The first Kazakh in space",
      genre: "biography",
      prompt:
        "Toktar Aubakirov's path from a village to orbit: test flights, selection, about eight days aboard the Mir station and the return home.",
    },
    {
      label: "The mountain hotel mystery",
      genre: "detective",
      prompt:
        "In an exclusive, snowed-in mountain hotel an influential guest vanishes without a trace in the middle of the night. The detective soon realises every witness and every member of staff is lying.",
    },
    {
      label: "The vault job",
      genre: "thriller",
      prompt:
        "Night in the city centre. A bold crew breaks into the secure vault of a private bank, but an unexpected security failure locks them inside along with the hostages.",
    },
    {
      label: "A signal from Mars",
      genre: "scifi_adventure",
      prompt:
        "A Mars expedition picks up a repeating signal from beneath the polar ice, and every new decoding changes the mission plan.",
    },
    {
      label: "Marathon after the crash",
      genre: "inspirational",
      prompt:
        "A former runner learns to walk again after an accident and two years later stands at the start of the Almaty marathon. No miracles: doctors, relapses, a neighbour with a dog and the first hundred metres.",
    },
  ],
};
