// Library precedents as building types (docs/built-form.md, "Precedents as types";
// docs/typologies.md, "The pipeline" steps 2-6). A lot (a block's building plots of one
// programme) is built as one precedent from the typology library: its seed tiled over the lot
// and clipped to the plots, at the storeys that bring it nearest the density the genes asked
// for. A precedent raised past its own height widens its court, or the street between its
// rows, to the new height (light at 45° to the ground floor, as the rows of the fixed types
// had); that and the change of storeys are its drift, reported per lot.
//
// Candidates for a programme are the library's building precedents for it, nearest the site's
// climate first (typology/climate.ts). The four type genes of genome 3.1 are now preferences
// for four families of arrangement.
import { LIBRARY } from "../typology/library.js";
import { build, DEFAULT_FLOOR_H, type Arrangement, type Built, type Params } from "../typology/grammar.js";
import { CLIMATE, distance, profile } from "../typology/climate.js";
import type { Precedent, Programme } from "../typology/types.js";
import type { ProgrammeKey } from "./programme.js";

/** Families of arrangement, one per type gene (config.ts t_courtyard, t_perimeter, t_row,
 *  t_towers, in that order). */
export const FAMILIES = [
  { key: "court", name: "round a court", arrangements: ["court", "ring"] },
  { key: "yard", name: "round a shared yard", arrangements: ["cluster"] },
  { key: "row", name: "rows", arrangements: ["row", "shed"] },
  { key: "tall", name: "slabs and towers", arrangements: ["slab", "tower"] },
] as const satisfies readonly { key: string; name: string; arrangements: readonly Arrangement[] }[];
export type FamilyKey = (typeof FAMILIES)[number]["key"];
export const familyOf = (a: Arrangement) => FAMILIES.findIndex((f) => (f.arrangements as readonly Arrangement[]).includes(a));

/** The library programmes a plot programme draws its precedents from, nearest first. The
 *  library has no clinics or treatment plants with buildings: health takes education's and
 *  culture's courts and halls, sewage and waste take waste's and industry's sheds (assumed). */
export const PROGRAMME_PRECEDENTS: Record<ProgrammeKey, Programme[]> = {
  homes: ["housing"], shops: ["commercial"], education: ["education"], health: ["education", "cultural"],
  culture: ["cultural"], industry: ["industrial"], water: ["waste", "industrial"], waste: ["waste", "industrial"],
};

/** Precedents tried on each lot: the nearest this many by climate whose tile fits the lot. */
export const CANDIDATES = 8;

/** How a precedent's own street or lane is taken when its seed doesn't say (grammar.ts build). */
const STREET: Partial<Record<Arrangement, number>> = { row: 4, ring: 6, court: 0, cluster: 4, slab: 12, tower: 10, shed: 8 };

export interface Candidate {
  p: Precedent;
  family: number;
  /** Climate distance to the site, in noticeable steps (0 where the site has no climate data). */
  climate: number;
  /** The precedent's own storeys (a tower's podium and tower together). */
  own: number;
}

/** A precedent's own height in storeys. */
export const storeysOf = (s: Params) => s.arrangement === "tower" ? s.storeys + (s.tower?.storeys ?? 20) : s.storeys;

/** How far a precedent may be raised (assumed, until each type has its own ranges): to at most
 *  STRETCH times its own height, and no taller than SLENDER times the depth of its wings, rows
 *  or units, so a one-storey court house isn't drawn as a nine-storey wall. Never below its own
 *  height; a tower keeps its own rule (the tower takes the rest). */
export const STRETCH = 2, SLENDER = 2.5;
export function maxStoreys(s: Params): number {
  const own = storeysOf(s);
  if (s.arrangement === "tower") return Infinity;
  // a house standing free (a cluster's, a row's with gaps or of one) by its narrower side; a
  // terrace, a court's wings, a slab by their depth
  const free = s.arrangement === "cluster" || (s.arrangement === "row" && ((s.gap ?? 0) > 0 || (s.count ?? 6) === 1));
  const narrow = free ? Math.min(s.width, s.depth) : s.depth;
  const slender = Math.floor((SLENDER * narrow) / (s.floorH ?? DEFAULT_FLOOR_H));
  return Math.max(own, Math.min(Math.max(own + 1, Math.floor(STRETCH * own)), slender));
}

const isBuilding = (p: Precedent) => familyOf(p.seed.arrangement) >= 0 && p.seed.ground !== "water" && built(p, storeysOf(p.seed)).floorArea > 0;

const BY_SITE = new Map<string, Map<ProgrammeKey, Candidate[]>>();

/** The building precedents for a programme, nearest the site's climate first. */
export function candidatesFor(prog: ProgrammeKey, siteId: string): Candidate[] {
  let site = BY_SITE.get(siteId);
  if (!site) BY_SITE.set(siteId, (site = new Map()));
  let out = site.get(prog);
  if (out) return out;
  const n = CLIMATE.places[`site:${siteId}`], here = n ? profile(n) : null;
  const seen = new Set<string>();
  out = [];
  // the first library programme's precedents first, then the next one's
  for (const lib of PROGRAMME_PRECEDENTS[prog]) {
    const these: Candidate[] = [];
    for (const p of LIBRARY) {
      if (seen.has(p.id) || !p.programmes.includes(lib) || !isBuilding(p)) continue;
      const c = CLIMATE.places[p.id];
      these.push({ p, family: familyOf(p.seed.arrangement), climate: here && c ? distance(profile(c), here) : 0, own: storeysOf(p.seed) });
      seen.add(p.id);
    }
    out.push(...these.sort((a, b) => a.climate - b.climate || (a.p.id < b.p.id ? -1 : 1)));
  }
  site.set(prog, out);
  return out;
}

export interface Drift { what: "storeys" | "court" | "street"; from: number; to: number }

/** The seed at n storeys, and what changed from the precedent. Raised past its own height, its
 *  court (court, ring) or its street (the rest) widens to at least the new height. */
export function variant(seed: Params, n: number): { params: Params; drift: Drift[] } {
  const own = storeysOf(seed);
  if (n === own) return { params: seed, drift: [] };
  const q: Params = { ...seed }, drift: Drift[] = [{ what: "storeys", from: own, to: n }];
  if (seed.arrangement === "tower") {
    // the podium kept, the tower taking the rest (a tower of at least one storey)
    q.storeys = Math.min(seed.storeys, n - 1);
    q.tower = { ...(seed.tower ?? { width: 20, depth: 20, storeys: 20 }), storeys: n - q.storeys };
  } else q.storeys = n;
  if (n > own) {
    const H = n * (seed.floorH ?? DEFAULT_FLOOR_H);
    if (seed.arrangement === "court" || seed.arrangement === "ring") {
      const c = seed.court ?? (seed.arrangement === "court" ? 10 : 0);
      if (H > c) {
        q.court = H;
        if (seed.arrangement === "ring") q.diameter = (seed.diameter ?? 40) + (H - c);
        drift.push({ what: "court", from: c, to: H });
      }
    } else {
      const s = seed.street ?? STREET[seed.arrangement] ?? 0;
      if (H > s) { q.street = H; drift.push({ what: "street", from: s, to: H }); }
    }
  }
  return { params: q, drift };
}

const BUILT = new Map<string, Built>();

/** A precedent built at n storeys (cached). */
export function built(p: Precedent, n: number): Built {
  const k = `${p.id}:${n}`;
  let b = BUILT.get(k);
  if (!b) BUILT.set(k, (b = build(variant(p.seed, n).params)));
  return b;
}

/** The precedents by id. */
export const PRECEDENT = new Map(LIBRARY.map((p) => [p.id, p]));
