// The typology library: East Asia (docs/typologies.md). Figures carry their source and
// confidence; seed numbers not taken from a figure are placeholders, said so in `seedNote`.
import type { Precedent } from "../types.js";
import { src } from "./src.js";

export const EAST_ASIA: Precedent[] = [
  {
    id: "tulou", name: "Fujian tulou", place: "Yongding and Nanjing counties, Fujian", region: "East Asia", at: [117.0, 24.6],
    era: "14th-20th century", climate: "humid-subtropical", programmes: ["housing"],
    mechanisms: ["court", "thermal-mass", "eaves", "shared", "compact"],
    materials: ["rammed earth", "timber", "clay tile"],
    summary: "A ring of identical rooms, three to five storeys high, round a shared court; a whole clan in one building.",
    how: "The closed ring shades its own court and its thick earth wall damps the day's heat. About 2 m eaves keep rain off the earth. Each family owns a vertical stack of rooms, from kitchen to granary to bedroom.",
    lesson: "One ring can house a whole community: a closed perimeter shades its own court and thick walls even out the day.",
    figures: [
      { what: "Cuilin Lou", value: "14 m across, 3 storeys", conf: "medium", src: 0 },
      { what: "Yuchang Lou", value: "36 m across, 5 storeys, 50 rooms per floor", conf: "medium", src: 0 },
      { what: "Chengqi Lou", value: "62.6 m across, 4 storeys, 72 rooms per level; second ring 2 storeys", conf: "medium", src: 0 },
      { what: "Shunyu Lou", value: "74.1 m across; outer wall 15 m high, 1.6 m thick", conf: "medium", src: 0 },
      { what: "Outer wall", value: "about 2 m at the base, about 1 m at the top", conf: "medium", src: 0 },
      { what: "Eaves", value: "about 2 m", conf: "medium", src: 0 },
      { what: "Chengqi Lou's people", value: "57 families, about 300 people", conf: "medium", src: 0 },
      { what: "Room width at the outer wall, Chengqi Lou", value: "about 2.7 m (π × 62.6 / 72)", conf: "medium" },
    ],
    seed: { arrangement: "ring", width: 2.7, depth: 9, storeys: 4, floorH: 3.2, diameter: 62.6, count: 72, rows: 2, court: 20, eave: 2, roof: "gable", porosity: 0.1, wall: 1.6 },
    seedNote: "Chengqi Lou: diameter, storeys and rooms from the figures; ring depth 9 m assumed.",
    sources: [src("Fujian tulou, Wikipedia", "https://en.wikipedia.org/wiki/Fujian_tulou")],
  },
  {
    id: "siheyuan", name: "Siheyuan", place: "Beijing", region: "East Asia", at: [116.4, 39.93],
    era: "Yuan to Qing dynasties", climate: "continental", programmes: ["housing"],
    mechanisms: ["court", "compact", "thermal-mass", "insulation"],
    materials: ["grey brick", "timber", "clay tile"],
    summary: "Four single-storey halls round a court, set in rows between hutongs.",
    how: "The court opens the main hall to the low winter sun from the south and shelters it from the north wind. Rooms face in; the hutong outside is a quiet lane.",
    lesson: "Orient the court to the winter sun and the main hall to face it; turn blank walls to the cold wind.",
    figures: [
      { what: "Standard Yuan site width", value: "43 chi, about 13.5 m", conf: "medium", src: 1 },
      { what: "Hutong width", value: "up to about 9 m; many far narrower", conf: "medium", src: 0 },
    ],
    seed: { arrangement: "court", width: 5, depth: 5, storeys: 1, floorH: 3.6, court: 9, rows: 4, street: 6, eave: 0.8, roof: "gable", porosity: 0.15, wall: 0.5 },
    seedNote: "Site width close to the figure (two wings and a court ≈ 19 m, a larger siheyuan); depths assumed.",
    sources: [
      src("Beijing siheyuan, Wikipedia", "https://en.wikipedia.org/wiki/Beijing_siheyuan"),
      src("Kyoto University, Center for Integrated Area Studies paper 116", "https://repository.kulib.kyoto-u.ac.jp/dspace/bitstream/2433/276496/1/ciasdp116_43.pdf"),
    ],
  },
  {
    id: "dikengyuan", name: "Sunken courtyard cave house", local: "dikengyuan, yaodong", place: "Loess Plateau, Henan and Shanxi", region: "East Asia", at: [111.2, 34.77],
    era: "over 2,000 years; some still lived in", climate: "continental", programmes: ["housing"],
    mechanisms: ["earth", "court", "thermal-mass", "insulation"],
    materials: ["loess (dug, not built)"],
    summary: "A square pit dug into the loess, with vaulted rooms cut into its four walls.",
    how: "At least two metres of earth over every room holds the temperature through the year: little heating in winter, cool in summer. The pit is the court and the only open ground.",
    lesson: "Where the ground is soft and the climate extreme, dig: earth cover holds an even temperature with little energy.",
    figures: [
      { what: "Pit depth", value: "about 5-10 m", conf: "low", src: 0 },
      { what: "Rooms", value: "7-8 m long, 3 m wide, 3-4 m high; 3-5 per dwelling", conf: "low", src: 1 },
      { what: "Earth over a room", value: "at least 2 m", conf: "low", src: 1 },
    ],
    seed: { arrangement: "sunken", width: 14, depth: 14, storeys: 0, sunken: 7, steps: 1 },
    seedNote: "Pit depth from the figures; pit size assumed. The rooms are under ground and not drawn.",
    sources: [
      src("Yaodong, Wikipedia", "https://en.wikipedia.org/wiki/Yaodong"),
      src("Architecture on the Road, Dikengyuan", "https://architectureontheroad.com/dikengyuan-courtyard-cave-houses-china/"),
    ],
  },
  {
    id: "machiya", name: "Machiya", place: "Kyoto", region: "East Asia", at: [135.76, 35.0],
    era: "Edo period to early 20th century", climate: "humid-subtropical", programmes: ["housing", "commercial"],
    mechanisms: ["cross-vent", "court", "mutual-shade", "porous"],
    materials: ["timber", "clay", "paper screens"],
    summary: "A narrow timber town house, shop at the front and home behind, with a pocket garden in the middle.",
    how: "The tsuboniwa brings light and air into the middle of a 20 m deep house, and sliding screens let a breeze run from the street to the back garden in the humid summer.",
    lesson: "A pocket garden in a deep narrow plan lets a breeze run from street to back through sliding screens.",
    figures: [
      { what: "Frontage", value: "about 5.4-6 m", conf: "medium", src: 0 },
      { what: "Depth", value: "about 20 m", conf: "medium", src: 0 },
      { what: "Nickname", value: "unagi no nedoko, an eel's bed", conf: "medium", src: 0 },
    ],
    seed: { arrangement: "row", width: 5.6, depth: 20, storeys: 2, count: 8, rows: 2, street: 5, well: 0.08, roof: "gable", eave: 0.9, porosity: 0.45 },
    seedNote: "Frontage and depth from the figures; garden share assumed.",
    sources: [src("Machiya, Wikipedia", "https://en.wikipedia.org/wiki/Machiya")],
  },
];
