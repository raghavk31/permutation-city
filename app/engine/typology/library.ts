// The typology library (docs/typologies.md): precedents built for a climate, a material or a
// need, each written down as figures with their sources and as a seed in the grammar
// (grammar.ts). The page /typologies draws every seed; the building-scale search will start
// from them.
//
// Confidence per figure (types.ts): high = a primary or scholarly source; medium = a reliable
// secondary source, or several that agree; low = one popular source, or sources that disagree;
// assumed = no source yet. Seed numbers not taken from a figure are placeholders, said so in
// `seedNote`. Researched 28 October 2026.
import type { Precedent } from "./types.js";
import { SOUTH_ASIA } from "./library/south-asia.js";
import { EAST_ASIA } from "./library/east-asia.js";
import { SOUTHEAST_ASIA } from "./library/southeast-asia.js";
import { WEST_ASIA_NORTH_AFRICA } from "./library/west-asia-north-africa.js";
import { AFRICA } from "./library/africa.js";
import { EUROPE } from "./library/europe.js";
import { AMERICAS } from "./library/americas.js";
import { OCEANIA } from "./library/oceania.js";

export const LIBRARY: Precedent[] = [...SOUTH_ASIA, ...EAST_ASIA, ...SOUTHEAST_ASIA, ...WEST_ASIA_NORTH_AFRICA, ...AFRICA, ...EUROPE, ...AMERICAS, ...OCEANIA];
