// The typology library's vocabulary (docs/typologies.md): programmes, climates, mechanisms and
// the shape of one entry. Labels are the plain words shown on the page.
import type { Params } from "./grammar.js";

export const PROGRAMMES = {
  housing: "Housing", water: "Water", food: "Food", waste: "Waste", energy: "Energy",
  mobility: "Mobility", commercial: "Commerce", education: "Education", industrial: "Industry", cultural: "Culture",
  public: "Public space",
} as const;
export type Programme = keyof typeof PROGRAMMES;

/** Climates by Köppen group, in plain words. */
export const CLIMATES = {
  "tropical-wet": { label: "Hot and wet all year", koppen: "Af, Am" },
  "tropical-dry": { label: "Hot, with a wet and a dry season", koppen: "Aw" },
  "hot-arid": { label: "Hot desert", koppen: "BWh" },
  "semi-arid": { label: "Dry, with a short rainy season", koppen: "BSh, BSk" },
  "humid-subtropical": { label: "Hot wet summers, cool winters", koppen: "Cfa, Cwa" },
  mediterranean: { label: "Hot dry summers, mild wet winters", koppen: "Csa, Csb" },
  temperate: { label: "Mild and damp", koppen: "Cfb" },
  continental: { label: "Hot summers, cold winters", koppen: "Dfa, Dfb, Dwa" },
  cold: { label: "Cold, or high mountains", koppen: "Dfc, ET, H" },
} as const;
export type Climate = keyof typeof CLIMATES;

export const MECHANISMS = {
  "mutual-shade": "Buildings shade each other",
  court: "An open court at the centre",
  stack: "Warm air rises and leaves at the top",
  "cross-vent": "Air passes straight through",
  "thermal-mass": "Heavy walls slow the day's heat",
  evaporative: "Water cools the air",
  "wind-catch": "Catches the wind",
  raised: "Floor raised above water",
  earth: "Built into the earth",
  eaves: "Deep eaves and verandahs",
  porous: "An open, porous skin",
  compact: "Compact, little outer surface",
  "rain-harvest": "Collects rain",
  storage: "Stores water",
  recharge: "Returns water to the ground",
  "flood-room": "Makes room for floods",
  loop: "Closes a resource loop",
  incremental: "Grows over time",
  shared: "Ground shared by neighbours",
  solar: "Takes energy from the sun",
  insulation: "Keeps the cold out",
  shade: "A roof of shade over open ground",
  filter: "Plants and soil clean the water",
  sound: "Carries sound to a crowd",
} as const;
export type Mechanism = keyof typeof MECHANISMS;

export const REGIONS = ["South Asia", "East Asia", "Southeast Asia", "West Asia and North Africa", "Africa", "Europe", "Americas", "Oceania"] as const;
export type Region = (typeof REGIONS)[number];

/** How far a figure can be trusted: a primary or scholarly source; a reliable secondary one or
 *  several that agree; one popular source or sources that disagree; or no source (a
 *  placeholder until one is found). */
export type Confidence = "high" | "medium" | "low" | "assumed";

/** A figure: what, how much, how sure, and which of the entry's sources (index). */
export interface Figure { what: string; value: string; conf: Confidence; src?: number }

export interface Source { title: string; url: string }

export interface Precedent {
  id: string;
  name: string;
  /** The name in its own language, when the common name is a translation. */
  local?: string;
  place: string;
  region: Region;
  /** For the map: where it is (approximate for a type, exact for one building). */
  at: [number, number];
  era: string;
  climate: Climate;
  programmes: Programme[];
  mechanisms: Mechanism[];
  materials: string[];
  /** One plain sentence: what it is. */
  summary: string;
  /** How it answers its climate or its need, in two or three plain sentences. */
  how: string;
  /** What a future city can take from it: the principle, in one plain sentence. */
  lesson: string;
  figures: Figure[];
  /** The grammar parameters the drawing and the search start from. */
  seed: Params;
  /** Which seed numbers came from the figures and which are placeholders. */
  seedNote: string;
  /** Modern work by a named architect or engineer, not a vernacular type. */
  modern?: boolean;
  /** What we couldn't find. */
  gaps?: string;
  sources: Source[];
}
