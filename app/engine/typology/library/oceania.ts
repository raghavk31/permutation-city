// The typology library: Oceania (docs/typologies.md). Figures carry their source and
// confidence; seed numbers not taken from a figure are placeholders, said so in `seedNote`.
import type { Precedent } from "../types.js";
import { src } from "./src.js";

export const OCEANIA: Precedent[] = [
  {
    id: "queenslander", name: "Queenslander", place: "Brisbane and Queensland, Australia", region: "Oceania", at: [153.02, -27.47],
    era: "1840s-1940s", climate: "humid-subtropical", programmes: ["housing"],
    mechanisms: ["raised", "eaves", "cross-vent", "porous"],
    materials: ["timber", "corrugated iron", "battens and lattice"],
    summary: "A timber house on stumps with deep verandahs on several sides, high ceilings and battened screens.",
    how: "Stumps lift the house into the breeze and let air cool the floor from below; verandahs shade the walls and scoop breezes through open doors; a light iron roof allows high ceilings that hold the heat above people.",
    lesson: "In a warm humid climate, a light raised house wrapped in verandahs beats a heavy one.",
    figures: [
      { what: "Stumps", value: "very high in the 1900s-1920s, lower later", conf: "medium", src: 1 },
      { what: "Verandahs", value: "deep, on several sides, act as breeze scoops", conf: "medium", src: 2 },
      { what: "Underfloor cooling", value: "only under conditions more common in the north", conf: "medium", src: 0 },
    ],
    seed: { arrangement: "row", width: 11, depth: 12, storeys: 1, floorH: 3.4, count: 3, rows: 1, street: 8, gap: 8, raised: 2.4, eave: 2.5, roof: "gable", porosity: 0.45, trees: 6 },
    seedNote: "Stump height and plan assumed.",
    sources: [
      src("Queenslander (architecture), Wikipedia", "https://en.wikipedia.org/wiki/Queenslander_(architecture)"),
      src("State Library of Queensland, Under a transverse gable", "https://www.slq.qld.gov.au/blog/under-transverse-gable-queenslander-house-styles-mid-1930s-and-1940s"),
      src("The Conversation, Sublime design: the Queenslander", "https://theconversation.com/sublime-design-the-queenslander-27225"),
    ],
  },
  {
    id: "fale", name: "Fale", place: "Samoa", region: "Oceania", at: [-172.1, -13.8],
    era: "traditional; still built", climate: "tropical-wet", programmes: ["housing", "cultural"],
    mechanisms: ["porous", "cross-vent", "raised", "eaves"],
    materials: ["breadfruit and coconut posts", "lashed frame", "thatch", "stone platform"],
    summary: "An oval house of a domed roof on posts with no walls, on a raised stone platform, with blinds rolled down in storms.",
    how: "With no walls, the wind passes straight through, so the lashed frame flexes instead of fighting it; the platform keeps the floor dry in heavy rain.",
    lesson: "In cyclones, let the wind through: an open, lashed, flexible frame survives where a closed box fails.",
    figures: [
      { what: "Form", value: "oval; domed roof on posts; no structural walls", conf: "medium", src: 0 },
      { what: "Floor", value: "raised stone platform; pola blinds between posts", conf: "medium", src: 0 },
      { what: "Wind", value: "passes straight through; the frame flexes", conf: "medium", src: 1 },
    ],
    seed: { arrangement: "row", width: 9, depth: 7, storeys: 1, floorH: 1.8, count: 3, rows: 1, street: 10, gap: 8, raised: 0.7, roof: "dome", porosity: 0.85, features: [{ kind: "mound" }] },
    seedNote: "Sizes assumed.",
    sources: [
      src("CDC Emerging Infectious Diseases, About the cover: Samoan fale", "https://wwwnc.cdc.gov/eid/article/30/6/AC-3006_article"),
      src("Eco-Business, Samoa's architects look to the past", "https://www.eco-business.com/news/samoas-architects-look-past-boost-climate-resilience/"),
    ],
  },
  {
    id: "magney", name: "Magney House", place: "Bingie Point, New South Wales", region: "Oceania", at: [150.15, -36.0],
    era: "1982-84", climate: "temperate", programmes: ["housing"], modern: true,
    mechanisms: ["solar", "eaves", "cross-vent", "rain-harvest"],
    materials: ["corrugated steel", "reverse brick veneer", "glass", "external louvres"],
    summary: "Glenn Murcutt's long, thin house under a curved butterfly roof: shade from the high summer sun, low winter sun deep inside.",
    how: "The roof's curve shades the north glazing in summer and admits the winter sun; operable external blinds and louvres tune it; the house is one room deep for cross-ventilation; the inverted roof collects rain.",
    lesson: "Shape the roof to the sun's two seasons and make the house thin enough for the breeze.",
    figures: [
      { what: "Roof", value: "curved butterfly roof; inverted, collects rain", conf: "medium", src: 0 },
      { what: "Walls", value: "reverse brick veneer: masonry inside, steel outside", conf: "medium", src: 1 },
    ],
    seed: { arrangement: "row", width: 40, depth: 7, storeys: 1, floorH: 3.4, count: 1, rows: 1, street: 16, roof: "flat", eave: 1.5, porosity: 0.45 },
    seedNote: "Plan approximate; the butterfly roof is drawn flat.",
    sources: [
      src("Architecture AU, Magney House, Bingie Bingie", "https://architectureau.com/articles/magney-house-bingie-bingie-198284/"),
      src("Architecture and Design, Magney House: reverse brick veneer", "https://architectureanddesign.com.au/project/Magney-House-by-Glen-Murcutt-an-enduring-testament"),
    ],
  },
  {
    id: "wharenui", name: "Meeting house", local: "wharenui, on a marae", place: "Aotearoa New Zealand", region: "Oceania", at: [176.25, -38.14],
    era: "19th century form; still built", climate: "temperate", programmes: ["cultural", "housing"],
    mechanisms: ["shared", "eaves"],
    materials: ["carved timber", "tukutuku panels", "thatch or iron"],
    summary: "A single long room under a pitched roof extended into a deep front porch, facing the open marae and, often, the sunrise.",
    how: "The house is an ancestor's body; the porch is the threshold between the open ground and the hall where people speak and sleep together during gatherings.",
    lesson: "A deep porch between an open ground and a shared hall gives a community a place to meet in any weather.",
    figures: [
      { what: "Length", value: "about 12-13 m up to nearly 30 m", conf: "medium", src: 0 },
      { what: "Porch", value: "up to about 4 m deep", conf: "medium", src: 0 },
      { what: "Orientation", value: "front often faces east, toward Hawaiki and the sunrise", conf: "medium", src: 1 },
    ],
    seed: { arrangement: "shed", width: 9, depth: 20, storeys: 1, floorH: 3, count: 1, street: 20, roof: "gable", porosity: 0.1 },
    seedNote: "Length from the figures; the porch is not drawn separately.",
    sources: [
      src("ANU Press, chapter on Māori meeting houses", "https://press-files.anu.edu.au/downloads/press/p129191/pdf/ch0825.pdf"),
      src("Te Ara, Māori architecture: whare Māori", "https://teara.govt.nz/en/maori-architecture-whare-maori"),
    ],
  },
  {
    id: "haus-tambaran", name: "Spirit house", local: "haus tambaran", place: "Sepik River, Papua New Guinea", region: "Oceania", at: [143.6, -4.1],
    era: "traditional", climate: "tropical-wet", programmes: ["cultural"],
    mechanisms: ["raised", "flood-room", "eaves", "porous"],
    materials: ["timber posts", "sago palm thatch", "carved gables"],
    summary: "Men's ceremonial houses on piles up to about 120 feet long, with towering gables, in villages that flood every year.",
    how: "Piles lift the floor above the Sepik's floods; the steep thatch sheds rain and the open underfloor is used in the dry season.",
    lesson: "In a flooding river plain, lift the most important building highest.",
    figures: [
      { what: "Length (Iatmul)", value: "as much as 120 feet", conf: "medium", src: 0 },
      { what: "Gable section", value: "about 5 m high", conf: "low", src: 1 },
      { what: "Piles", value: "both men's and family houses, because of regular floods", conf: "medium", src: 0 },
    ],
    seed: { arrangement: "row", width: 12, depth: 35, storeys: 1, floorH: 4, count: 1, rows: 1, street: 16, raised: 2.5, roof: "gable", pitch: 55, porosity: 0.3, trees: 4 },
    seedNote: "Length about 35 m from the figures; height of piles assumed.",
    sources: [
      src("Traditional architecture of Papua New Guinea, Wikipedia", "https://en.wikipedia.org/wiki/Traditional_architecture_of_Papua_New_Guinea"),
      src("Art Pacific, Story board and haus tambaran", "https://art-pacific.com/artifacts/nuguinea/storybdp.htm"),
    ],
  },
];
