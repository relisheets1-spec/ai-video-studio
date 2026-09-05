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
      label: "💼 IT-стартап: триумф и крах",
      genre: "drama",
      prompt:
        "История амбициозного IT-стартапа: от первой гениальной идеи в гараже и миллиардных инвестиций до сокрушительного краха из-за гордыни основателей и корпоративного шпионажа.",
    },
    {
      label: "🕵️ Тайна горного отеля",
      genre: "detective",
      prompt:
        "В элитном закрытом отеле в горах посреди ночи бесследно исчезает влиятельный постоялец. Детектив начинает расследование и понимает, что каждый свидетель и персонал отеля лгут.",
    },
    {
      label: "🏙️ Ночное ограбление в Алматы",
      genre: "thriller",
      prompt:
        "Ночь в центре Алматы. Дерзкая группа грабителей проникает в защищенное хранилище частного банка, но неожиданный сбой системы безопасности запирает их внутри вместе с заложниками.",
    },
    {
      label: "☕ Кофейня на углу",
      genre: "narrative",
      prompt:
        "Обычная кофейня на углу, где бариста за пятнадцать лет запомнил заказ каждого постоянного посетителя. Спокойная история о людях, которые приходят сюда каждое утро, и о том, что они приносят с собой.",
    },
    {
      label: "⚖️ Судебная битва: невиновный",
      genre: "drama",
      prompt:
        "Напряженный судебный процесс по резонансному делу. Молодой адвокат вступает в схватку с коррумпированной системой, чтобы защитить человека, которого несправедливо обвинили в тяжком преступлении.",
    },
  ],
  kz: [
    {
      label: "💼 Стартаптың өрлеуі мен құлдырауы",
      genre: "drama",
      prompt:
        "Амбициялы IT-стартаптың шынайы тарихы: гараждағы алғашқы идея мен миллиардтаған инвестициялардан бастап, негізін қалаушылардың өр көкіректігі салдарынан күйреуіне дейін.",
    },
    {
      label: "🕵️ Қонақүйдегі жұмбақ жоғалу",
      genre: "detective",
      prompt:
        "Таудағы элиталық жабық қонақүйде түн ортасында беделді қонақ із-түзсіз жоғалады. Детектив зерттеу барысында куәгерлердің әрқайсысы бірдеңені жасырып тұрғанын аңғарады.",
    },
    {
      label: "🏙️ Алматыдағы түнгі тонау",
      genre: "thriller",
      prompt:
        "Түнгі Алматы орталығы. Тәжірибелі қарақшылар тобы жеке банктің күзетілетін қоймасына кіреді, бірақ дабыл жүйесінің істен шығуы оларды ғимарат ішінде қамап тастайды.",
    },
    {
      label: "☕ Бұрыштағы шағын кофехана",
      genre: "narrative",
      prompt:
        "Бұрыштағы қарапайым кофехана. Бариста он бес жыл ішінде әр тұрақты қонақтың тапсырысын жаттап алған. Күн сайын таңертең осында келетін адамдар туралы жайбарақат әңгіме.",
    },
    {
      label: "⚖️ Сот драмасы: жазықсыз сотталушы",
      genre: "drama",
      prompt:
        "Атышулы іс бойынша өткен сот процесі. Жас адвокат жазықсыз айыпталған адамның кінәсіздігін дәлелдеп, шындықты қорғау үшін жемқор жүйемен тайталасады.",
    },
  ],
  en: [
    {
      label: "💼 A startup's rise and fall",
      genre: "drama",
      prompt:
        "The story of an ambitious tech startup: from the first brilliant idea in a garage and billion-dollar funding to a total collapse driven by the founders' hubris and corporate espionage.",
    },
    {
      label: "🕵️ The mountain hotel mystery",
      genre: "detective",
      prompt:
        "In an exclusive, snowed-in mountain hotel an influential guest vanishes without a trace in the middle of the night. The detective soon realises every witness and every member of staff is lying.",
    },
    {
      label: "🏙️ The vault job",
      genre: "thriller",
      prompt:
        "Night in the city centre. A bold crew breaks into the secure vault of a private bank, but an unexpected security failure locks them inside along with the hostages.",
    },
    {
      label: "☕ The corner coffee shop",
      genre: "narrative",
      prompt:
        "An ordinary corner coffee shop where, over fifteen years, the barista has learned every regular's order by heart. A quiet story about the people who come in each morning and what they bring with them.",
    },
    {
      label: "⚖️ Defending the innocent",
      genre: "drama",
      prompt:
        "A tense trial in a case that grips the country. A young lawyer takes on a corrupt system to defend a man wrongly accused of a serious crime.",
    },
  ],
};
