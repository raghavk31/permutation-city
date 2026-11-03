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
  reflect: "Reflects the sun",
  structure: "Carries load with little material",
  restore: "Calms people and restores attention",
  habitat: "Lets wildlife live and move",
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

/** Public ground (architecture-v3 section 14): the families an open space belongs to, by the
 *  shape that does its climate job. */
export const OPEN_FAMILIES = {
  stepped: "Sunk or stepped",
  basin: "Basin or wetland",
  linear: "Along a flow line",
  canopy: "Shade over open ground",
  field: "Open field",
  doorstep: "At the door",
  street: "Street",
} as const;
export type OpenFamily = keyof typeof OPEN_FAMILIES;

/** What people do there: the public job, beside the climate job its mechanisms name. */
export const PUBLIC_JOBS = {
  gather: "Gather a crowd",
  linger: "Sit and stay",
  play: "Play",
  trade: "Buy and sell",
  pass: "Walk through",
  ritual: "Rites and festivals",
  work: "Work in the open",
  water: "Fetch or use water",
  nature: "Be among plants and animals",
} as const;
export type PublicJob = keyof typeof PUBLIC_JOBS;

/** When it holds water: never; in a storm, draining within hours or days; through the wet
 *  season, falling through the dry; or all year. */
export type Holds = "never" | "storm" | "season" | "always";

/** A public space's dry day and wet day. `fillsAt` is the storm (return period in years) at
 *  which it starts to take water, for one that holds water in a storm; `wetUse` is the share
 *  of its area people can still use when it is full. Both come with their confidence. */
export interface OpenRecord {
  family: OpenFamily;
  jobs: PublicJob[];
  holds: Holds;
  fillsAt?: number;
  wetUse: number;
  /** How sure `fillsAt` and `wetUse` are. */
  conf: Confidence;
  /** One plain sentence each: what it is on a dry day, and in rain or the wet season. */
  dry: string;
  wet?: string;
  /** For the wet drawing: water standing this deep above the lowest floor (m), in a sunk
   *  space; or over the whole ground, for one that floods flat. */
  fill?: number;
}

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
  /** Public space only (library/open.ts): its family, public jobs, dry day and wet day. */
  open?: OpenRecord;
}
