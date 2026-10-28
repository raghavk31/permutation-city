// The typology library: Africa (docs/typologies.md). Figures carry their source and
// confidence; seed numbers not taken from a figure are placeholders, said so in `seedNote`.
import type { Precedent } from "../types.js";
import { src } from "./src.js";

export const AFRICA: Precedent[] = [
  {
    id: "musgum", name: "Musgum shell house", place: "Far North Region, Cameroon", region: "Africa", at: [15.0, 10.9],
    era: "traditional", climate: "semi-arid", programmes: ["housing"],
    mechanisms: ["stack", "thermal-mass", "compact"],
    materials: ["sun-dried earth"],
    summary: "A tall catenary dome of earth, its outside ribbed to climb and to shed the rain, with an opening at the top.",
    how: "The catenary shape needs no formwork and carries its own weight in compression. Hot air rises out of the top opening; thick walls at the base damp the heat.",
    lesson: "A catenary dome of earth needs no formwork, carries itself in compression and vents at the top.",
    figures: [
      { what: "Height", value: "3-9 m", conf: "medium", src: 0 },
      { what: "Lifts", value: "up to 0.5 m, each dried before the next", conf: "low", src: 1 },
    ],
    seed: { arrangement: "cluster", footprint: "round", width: 5, depth: 5, diameter: 5, storeys: 1, floorH: 4, count: 6, court: 10, gap: 2, rows: 1, roof: "dome", porosity: 0.05, wall: 0.4 },
    seedNote: "Height from the figures; diameter and cluster assumed.",
    sources: [
      src("Musgum mud hut, Wikipedia", "https://en.wikipedia.org/wiki/Musgum_mud_hut"),
      src("Designboom, Musgum earth architecture", "https://www.designboom.com/architecture/musgum-earth-architecture"),
    ],
  },
  {
    id: "eastgate", name: "Eastgate Centre", place: "Harare, Zimbabwe", region: "Africa", at: [31.05, -17.83],
    era: "1996", climate: "tropical-dry", programmes: ["commercial"], modern: true,
    mechanisms: ["stack", "thermal-mass", "mutual-shade"],
    materials: ["concrete", "brick"],
    summary: "Mick Pearce and Arup's offices and shops cooled like a termite mound: heavy floors flushed with night air, warm air leaving by chimneys.",
    how: "Fans push cool night air through the hollow floors; by day the cooled mass absorbs heat, and warm air rises out through rooftop chimneys. No air conditioning.",
    lesson: "Cool the building's mass with night air and let the day's heat rise out through chimneys.",
    figures: [
      { what: "Plan", value: "140 m long, up to 70 m wide; two nine-storey blocks either side of a 16 m covered street", conf: "high", src: 0 },
      { what: "Floor area", value: "about 55,000 m²", conf: "medium", src: 1 },
      { what: "Energy against comparable buildings", value: "about 35% less (claims range to 90%)", conf: "low", src: 2 },
      { what: "Air changes", value: "10 an hour at night, 2 by day", conf: "medium", src: 0 },
    ],
    seed: { arrangement: "slab", width: 7, depth: 27, storeys: 9, count: 20, rows: 2, street: 16, roof: "flat", porosity: 0.2, features: [{ kind: "stack", height: 6, size: 3, count: 16 }] },
    seedNote: "Plan and storeys from the figures; chimney count and size assumed.",
    sources: [
      src("Arup / AIVC paper on Eastgate", "https://www.aivc.org/sites/default/files/airbase_10474.pdf"),
      src("Eastgate Centre, Wikipedia", "https://en.wikipedia.org/wiki/Eastgate_Centre,_Harare"),
      src("Engineering News, Harare green building", "https://www.engineeringnews.co.za/article/harare-green-building-showcased-at-sa-convention-2014-10-03"),
    ],
  },
  {
    id: "gando", name: "Gando Primary School", place: "Gando, Burkina Faso", region: "Africa", at: [-0.19, 11.84],
    era: "2001", climate: "semi-arid", programmes: ["education"], modern: true,
    mechanisms: ["stack", "eaves", "thermal-mass", "porous"],
    materials: ["compressed earth block", "steel", "corrugated metal"],
    summary: "Diébédo Francis Kéré's school of earth-block classrooms under a separate, raised metal roof, built by the village.",
    how: "The big roof shades the classrooms and throws off the rain; air flows between it and a perforated earth ceiling, carrying the heat away. Up to 6 °C cooler than under tin alone.",
    lesson: "A separate, raised roof shades the rooms and the air between carries the heat away.",
    figures: [
      { what: "Plan", value: "three classrooms in a row under one roof, covered outdoor spaces between", conf: "high", src: 0 },
      { what: "Area", value: "about 520-526 m²", conf: "medium", src: 1 },
      { what: "Cooler than a tin roof alone", value: "up to 6 °C", conf: "medium", src: 0 },
    ],
    seed: { arrangement: "row", width: 9, depth: 8, storeys: 1, floorH: 3.6, count: 3, rows: 1, street: 10, gap: 4, eave: 2.5, roof: "flat", porosity: 0.3, wall: 0.3 },
    seedNote: "Three classrooms with gaps, sized to about 520 m² with the covered spaces (approximate).",
    sources: [
      src("Aga Khan Award, Primary School, Gando", "https://the.akdn/en/architecture/project/primary-school"),
      src("Metalocus, Primary school in Gando and extension", "https://www.metalocus.es/en/news/building-primary-school-gando-and-extension-kere-architecture"),
    ],
  },
];
