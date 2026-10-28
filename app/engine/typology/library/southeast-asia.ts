// The typology library: Southeast Asia (docs/typologies.md). Figures carry their source and
// confidence; seed numbers not taken from a figure are placeholders, said so in `seedNote`.
import type { Precedent } from "../types.js";
import { src } from "./src.js";

export const SOUTHEAST_ASIA: Precedent[] = [
  {
    id: "shophouse", name: "Shophouse", place: "Singapore, Penang and the Straits towns", region: "Southeast Asia", at: [100.33, 5.41],
    era: "1820s-1950s", climate: "tropical-wet", programmes: ["housing", "commercial", "mobility"],
    mechanisms: ["eaves", "court", "stack", "mutual-shade", "shared"],
    materials: ["brick", "timber", "clay tile"],
    summary: "Narrow, deep two- or three-storey houses with a shop below, an air well inside and a covered five-foot way along the street.",
    how: "The five-foot way under the upper floors is a continuous shaded, rain-proof walk in front of every shop. Air wells half-way back pull air through the long plan.",
    lesson: "A continuous covered walk under the upper floors makes a whole street usable in sun and rain; an air well cools the long plan.",
    figures: [
      { what: "Five-foot way", value: "required by Raffles' 1822 plan; at least five feet, often more", conf: "medium", src: 1 },
      { what: "Storeys", value: "two to three", conf: "medium", src: 0 },
      { what: "Air well", value: "midway between front and back", conf: "medium", src: 0 },
    ],
    seed: { arrangement: "row", width: 5, depth: 30, storeys: 3, count: 10, rows: 1, street: 10, well: 0.08, eave: 1.8, roof: "gable", porosity: 0.3, features: [{ kind: "arcade", depth: 1.8 }] },
    seedNote: "Storeys and five-foot way from the figures; frontage and depth assumed (narrow and deep).",
    gaps: "Frontage and depth from URA or George Town conservation guidelines.",
    sources: [
      src("Shophouse, Wikipedia", "https://en.wikipedia.org/wiki/Shophouse"),
      src("Five-foot way, Wikipedia", "https://en.wikipedia.org/wiki/Five-foot_way"),
    ],
  },
  {
    id: "rumah-melayu", name: "Malay house", local: "rumah Melayu", place: "Peninsular Malaysia", region: "Southeast Asia", at: [102.25, 2.2],
    era: "traditional", climate: "tropical-wet", programmes: ["housing"],
    mechanisms: ["raised", "cross-vent", "porous", "eaves", "flood-room"],
    materials: ["cengal hardwood", "bamboo", "attap thatch"],
    summary: "A timber house on stilts with large openings and a tall, ventilated roof.",
    how: "Stilts lift the floor above floods and into the breeze; large windows on every side and a tall roof let air and heat out. Stilts are higher inland than on the coast.",
    lesson: "In a hot humid climate, lift the house into the breeze, open every wall, and give the roof a tall vented space.",
    figures: [
      { what: "Air movement", value: "more effective than in modern social housing, through large wall openings and roofs", conf: "medium", src: 0 },
      { what: "Stilts", value: "height varies with location, inland or coastal", conf: "low", src: 1 },
    ],
    seed: { arrangement: "row", width: 8, depth: 10, storeys: 1, floorH: 3.4, count: 3, rows: 1, street: 8, gap: 8, raised: 1.8, eave: 1.2, roof: "gable", porosity: 0.5 },
    seedNote: "All sizes assumed.",
    gaps: "Measured stilt heights and opening ratios (Lim Jee Yuan, 1987).",
    sources: [
      src("Sahabuddin and Gonzalez-Longo (2015). Traditional values and their adaptation in social housing design. IJAR", "https://strathprints.strath.ac.uk/53996/1/Sahabuddin_Gonzalez_Longo_IJAR2015_adaptation_in_social_housing_design.pdf"),
      src("Museum Volunteers JMM, Malay architecture and traditional houses", "https://museumvolunteersjmm.com/2022/02/14/malay-architecture-traditional-houses/"),
    ],
  },
  {
    id: "kampung-admiralty", name: "Kampung Admiralty", place: "Singapore", region: "Southeast Asia", at: [103.8, 1.44],
    era: "2017", climate: "tropical-wet", programmes: ["housing", "cultural", "commercial", "mobility", "food"], modern: true,
    mechanisms: ["shared", "eaves", "cross-vent", "rain-harvest"],
    materials: ["concrete", "planting"],
    summary: "WOHA's stacked village: a public plaza below, a medical centre above it, and a park with flats for older people on the roof.",
    how: "Programmes a neighbourhood needs are stacked on one site by a train station. The roof park, with community farming, gives back more green than the footprint took.",
    lesson: "Stack a neighbourhood's public programmes on one site at the station and give the roof back as a park.",
    figures: [
      { what: "Site", value: "8,981 m²", conf: "medium", src: 0 },
      { what: "Plot ratio", value: "3.6", conf: "medium", src: 0 },
      { what: "Green plot ratio", value: "1.25", conf: "medium", src: 0 },
      { what: "Flats", value: "104, in two 11-storey blocks", conf: "medium", src: 0 },
      { what: "Height limit", value: "45 m", conf: "medium", src: 0 },
    ],
    seed: { arrangement: "tower", width: 90, depth: 80, storeys: 4, tower: { width: 60, depth: 14, storeys: 7 }, street: 10, roof: "flat", porosity: 0.3 },
    seedNote: "Podium and blocks sized to the site and plot ratio (approximate).",
    sources: [src("WOHA, Kampung Admiralty project data (via Gooood)", "https://www.gooood.cn/en/kampung-admiralty-by-woha.htm")],
  },
  {
    id: "rice-terraces", name: "Rice terraces", place: "Ifugao, Philippine Cordilleras", region: "Southeast Asia", at: [121.06, 16.93],
    era: "under 1,000 to 2,000 years", climate: "tropical-wet", programmes: ["food", "water"],
    mechanisms: ["storage", "recharge", "loop", "shared"],
    materials: ["stone and earth walls"],
    summary: "Paddies cut into steep mountain sides, each held by a wall, watered from the forest above.",
    how: "A communal forest (muyong) at the top keeps the springs running; water passes from terrace to terrace, filtering and storing rain all year.",
    lesson: "Keep the forest above the fields: it keeps the springs running for terraces that store and filter water.",
    figures: [
      { what: "Walls", value: "can exceed 7 m high", conf: "low", src: 1 },
      { what: "Forest above", value: "about 264 native plant species", conf: "medium", src: 0 },
    ],
    seed: { arrangement: "terraces", width: 60, depth: 6, storeys: 0, steps: 8, sunken: 2, water: 0.2 },
    seedNote: "Terrace width and rise assumed.",
    sources: [
      src("Rice Terraces of the Philippine Cordilleras, Wikipedia", "https://en.wikipedia.org/wiki/Rice_Terraces_of_the_Philippine_Cordilleras"),
      src("Insights Philippines, The brittle steps to the sky", "https://insights-philippines.de/riceterraces.htm"),
    ],
  },
];
