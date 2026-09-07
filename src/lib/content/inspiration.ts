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
      label: "Последний маяк",
      genre: "narrative",
      prompt:
        "Смотритель маяка на Каспии продолжает зажигать свет, хотя корабли давно ходят по GPS. История одной осени, когда к нему впервые за много лет приехал гость.",
    },
    {
      label: "IT-стартап: триумф и крах",
      genre: "drama",
      prompt:
        "История амбициозного IT-стартапа: от первой гениальной идеи в гараже и миллиардных инвестиций до сокрушительного краха из-за гордыни основателей и корпоративного шпионажа.",
    },
    {
      label: "Караван по Шёлковому пути",
      genre: "historical",
      prompt:
        "Купец четырнадцатого века ведёт караван из Отрара в Самарканд. Торговля, пустыня, доверие и предательство на одном переходе.",
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
  ],
  kz: [
    {
      label: "Соңғы шамшырақ",
      genre: "narrative",
      prompt:
        "Каспийдегі шамшырақ күзетшісі кемелер әлдеқашан GPS-пен жүрсе де, шамды жағуды тоқтатпайды. Көп жылдан кейін оған алғаш рет қонақ келген бір күздің оқиғасы.",
    },
    {
      label: "Стартаптың өрлеуі мен құлдырауы",
      genre: "drama",
      prompt:
        "Амбициялы IT-стартаптың шынайы тарихы: гараждағы алғашқы идея мен миллиардтаған инвестициялардан бастап, негізін қалаушылардың өр көкіректігі салдарынан күйреуіне дейін.",
    },
    {
      label: "Жібек жолындағы керуен",
      genre: "historical",
      prompt:
        "Он төртінші ғасырдағы саудагер Отырардан Самарқандқа керуен бастап барады. Сауда, шөл, сенім мен опасыздық — бір өткелде.",
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
  ],
  en: [
    {
      label: "The last lighthouse",
      genre: "narrative",
      prompt:
        "A lighthouse keeper on the Caspian still lights the lamp every night although ships have navigated by GPS for years. The story of one autumn when, for the first time in a long while, a visitor came.",
    },
    {
      label: "A startup's rise and fall",
      genre: "drama",
      prompt:
        "The story of an ambitious tech startup: from the first brilliant idea in a garage and billion-dollar funding to a total collapse driven by the founders' hubris and corporate espionage.",
    },
    {
      label: "Caravan on the Silk Road",
      genre: "historical",
      prompt:
        "A fourteenth-century merchant leads a caravan from Otrar to Samarkand. Trade, desert, trust and betrayal on a single crossing.",
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
  ],
};
