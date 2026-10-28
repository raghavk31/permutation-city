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
];
