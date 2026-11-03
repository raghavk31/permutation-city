// Streets as a system (architecture-v3 section 14.5, step P4): each street's role is read from
// how much it carries (link) and how much it is a place (place), its type is one of the Global
// Street Design Guide's (GDCI/NACTO 2016), and its cross-section is laid out for that role and
// the site's climate within the street's width. A few streets per catchment are chosen to carry
// the big storm to open ground (overflow streets, Copenhagen's cloudburst roads).
//
//   link   from the street's class: the router lays secondary streets on the routes between
//          destinations and primaries on the skeleton, so class stands for through-movement
//          (space syntax's choice is measured only when a design is scored, too late here); a
//          dead end carries nothing through
//   place  one point each: an active frontage (shared.ts frontages); a public space on it (the
//          rules' spaces, or open plots); shops, culture or health on a third of its plots; a
//          school or a bus stop on it
//
// The section: the carriageway first, at the lanes the role keeps (3.0 m each, GSDG's urban lane;
// IRC:SP:118's carriageways are 6-7 m for two), then footpaths at the role's least clear path
// (GSDG: 1.8 m on residential streets, 2.4 m on commercial ones), then planting, more of it where
// the climate is wet or hot; what is left widens the footpaths. A planted strip of 1.5 m or more
// holds trees; in a wet climate it is a swale (GSDG: streets combine stormwater features; Portland's
// planters 0.9 m and swales 2.4 m at least). Shared streets have no kerb: one surface at walking
// pace (GSDG: 10-15 km/h where people walk in the motorists' space), planted at its edges.
import { BUILDING, LANDSCAPE, type SectionPart } from "../config.js";
import { needs } from "../typology/challenges.js";
import { CLIMATE } from "../typology/climate.js";
import type { Ground } from "../types.js";
import { dist, type Line, type Pt } from "./geom.js";
import { climateWeights } from "./lotnature.js";
import type { Plot } from "./plots.js";
import { gathered, type Frontage, type PublicSpace } from "./shared.js";

/** The street types, after the Global Street Design Guide's chapter 10 (GDCI 2016): its name for
 *  each, the target speed (km/h) and the least clear footpath (m). */
export const ROLES = {
  laneway: { label: "Laneway", gsdg: "Laneways and alleys", speed: 10, foot: 0, shared: true },
  "shared-home": { label: "Shared home street", gsdg: "Residential shared street", speed: 15, foot: 0, shared: true },
  "shared-shops": { label: "Shared shopping street", gsdg: "Commercial shared street", speed: 15, foot: 0, shared: true },
  residential: { label: "Home street", gsdg: "Residential street", speed: 20, foot: 1.8, shared: false },
  parkside: { label: "Park and water edge", gsdg: "Waterfront and parkside street", speed: 30, foot: 2.4, shared: false },
  "main-street": { label: "Main street", gsdg: "Neighbourhood main street", speed: 30, foot: 2.4, shared: false },
  avenue: { label: "Avenue", gsdg: "Central two-way street", speed: 40, foot: 2.4, shared: false },
  boulevard: { label: "Boulevard", gsdg: "Large street with transit", speed: 40, foot: 3.0, shared: false },
} as const;
export type RoleKey = keyof typeof ROLES;
export const ROLE_KEYS = Object.keys(ROLES) as RoleKey[];

export const LANE_M = 3.0;               // GSDG: 3.0 m lanes in cities (3.0-3.3); assumed at the low end
export const PLANT_MIN_M = 0.9;          // a planter's least width (Portland: 3 ft inside the kerbs)
export const TREE_STRIP_M = 1.5;         // a strip this wide holds street trees (SP:118's planted strips are 1-2 m)
export const OVERFLOW_M2 = 80000;        // a street on a flow line carrying this much ground's rain becomes an overflow street (assumed)
const NEAR_M = 25;                       // a plot fronts a street if its centre is this far past the street's edge (assumed)
const STEP_M = 15;                       // samples along a street

/** The lanes a role keeps, by the width it has: the most that leave its footpaths their least. */
const LANES: Record<RoleKey, number[]> = {
  laneway: [], "shared-home": [], "shared-shops": [], residential: [2, 1], parkside: [2, 1], "main-street": [2], avenue: [4, 2], boulevard: [4, 2],
};
/** Tree strips a role keeps before it keeps another lane: both sides of a main street, avenue or
 *  boulevard, one side of a home street or a park edge (GSDG puts trees on every street type;
 *  the count per side is our reading of its sections, assumed). */
const TREE_SIDES: Record<RoleKey, number> = {
  laneway: 0, "shared-home": 0, "shared-shops": 0, residential: 1, parkside: 1, "main-street": 2, avenue: 2, boulevard: 2,
};
/** How much of what is left after lanes and least footpaths goes to planting, before climate. */
const PLANT_SHARE: Record<RoleKey, number> = {
  laneway: 0.15, "shared-home": 0.3, "shared-shops": 0.2, residential: 0.4, parkside: 0.5, "main-street": 0.35, avenue: 0.45, boulevard: 0.5,
};

export interface StreetRole {
  role: RoleKey;
  link: number;
  place: number;
  /** Why it has its place points, in words. */
  why: string[];
  overflow: boolean;
  speed: number;
  section: SectionPart[];
}

/** The ground (m²) whose rain reaches each cell along the flow directions, open ground or not. */
const drainCache = new WeakMap<Ground, Float64Array>();
function drainage(G: Ground): Float64Array {
  let d = drainCache.get(G);
  if (!d) { d = gathered(G, new Int8Array(G.n)); drainCache.set(G, d); }
  return d;
}

/** Points every STEP_M along a line. */
function samples(l: Line): Pt[] {
  const out: Pt[] = [l[0]];
  let carry = 0;
  for (let k = 1; k < l.length; k++) {
    const seg = dist(l[k - 1], l[k]);
    let t = STEP_M - carry;
    while (t <= seg) { const f = t / seg; out.push([l[k - 1][0] + (l[k][0] - l[k - 1][0]) * f, l[k - 1][1] + (l[k][1] - l[k - 1][1]) * f]); t += STEP_M; }
    carry = (carry + seg) % STEP_M;
  }
  out.push(l[l.length - 1]);
  return out;
}

/** The section of a street `w` m wide for its role, in a climate wet (0..1) and hot (0..1). */
export function sectionOf(role: RoleKey, w: number, wet: number, hot: number, overflow = false): SectionPart[] {
  const R = ROLES[role], green = PLANT_SHARE[role] * (1 + 0.5 * Math.max(wet, hot));
  const plantLabel = (pw: number) => pw >= TREE_STRIP_M ? (wet >= 0.5 ? "trees and swale" : "trees") : wet >= 0.5 ? "planter (rain garden)" : "planting";
  if (R.shared) {
    // one surface at walking pace, planted at its edges; an overflow lane falls to a centre channel
    let plant = Math.min(w * green, w - 3);
    if (plant < PLANT_MIN_M) plant = 0;
    const side = plant / 2, rest = w - plant;
    const surface: SectionPart = { kind: "shared", w: rest, label: overflow ? "shared surface, falls to a centre channel" : "shared surface, no kerb" };
    return side ? [{ kind: "planted", w: side, label: plantLabel(side) }, surface, { kind: "planted", w: side, label: plantLabel(side) }] : [surface];
  }
  // lanes: the most that leave the least footpaths and the role's tree strips; else the most
  // that leave the footpaths; else one
  const lanes = LANES[role].find((n) => n * LANE_M + 2 * R.foot + TREE_SIDES[role] * TREE_STRIP_M <= w)
    ?? LANES[role].find((n) => n * LANE_M + 2 * R.foot <= w) ?? 1;
  const carriage = Math.min(w, lanes * LANE_M), left = Math.max(0, w - carriage);
  let foot = Math.min(R.foot, left / 2), rest = left - 2 * foot;
  let plant = Math.min(rest, rest * green + (overflow ? 1 : 0));
  if (plant < PLANT_MIN_M) plant = 0;
  foot += (rest - plant) / 2;
  const parts: SectionPart[] = [{ kind: "footpath", w: foot, label: role === "main-street" || role === "boulevard" ? "footpath and shopfronts" : "footpath" }];
  const cw: SectionPart = { kind: "carriageway", w: carriage, label: `${lanes} lane${lanes > 1 ? "s" : ""}${overflow ? ", falls to the swale in a cloudburst" : ""}` };
  if (!plant) parts.push(cw);
  else if (plant >= 2 * TREE_STRIP_M && lanes >= 4) {
    // a planted median and a strip each side on a wide street
    const p = plant / 3;
    parts.push({ kind: "planted", w: p, label: plantLabel(p) }, { ...cw, w: carriage / 2 }, { kind: "planted", w: p, label: `median: ${plantLabel(p)}` }, { ...cw, w: carriage / 2 }, { kind: "planted", w: p, label: plantLabel(p) });
  } else if (plant >= 2 * TREE_STRIP_M) {
    parts.push({ kind: "planted", w: plant / 2, label: plantLabel(plant / 2) }, cw, { kind: "planted", w: plant / 2, label: plantLabel(plant / 2) });
  } else parts.push(cw, { kind: "planted", w: plant, label: plantLabel(plant) });
  parts.push({ kind: "footpath", w: foot, label: parts[0].label });
  return parts;
}

export interface StreetIn { pts: Line; cls: number; w: number; u: number; v: number }

/** Every street's role, overflow and section. `programmeOf(k)`: the plot's programme key; `stops`:
 *  bus stops; `spaces`: the public spaces the rules placed. */
export function streetRoles(G: Ground, streets: StreetIn[], frontage: Frontage[], ps: Plot[], plotC: Pt[], programmeOf: (k: number) => string,
  stops: Pt[], spaces: PublicSpace[], cellOf: (p: Pt) => number): StreetRole[] {
  const n0 = CLIMATE.places[`site:${G.meta.id}`], { wet, hot } = climateWeights(n0 ? needs(n0) : []);
  const deg = new Map<number, number>();
  for (const s of streets) for (const v of [s.u, s.v]) deg.set(v, (deg.get(v) ?? 0) + 1);
  const spacePlot = new Set(spaces.flatMap((s) => s.plots));
  const R = 60, hash = new Map<string, number[]>();
  plotC.forEach(([x, y], k) => { const h = `${Math.floor(x / R)},${Math.floor(y / R)}`, l = hash.get(h); if (l) l.push(k); else hash.set(h, [k]); });
  const near = ([x, y]: Pt, r: number) => {
    const out: number[] = [], cx = Math.floor(x / R), cy = Math.floor(y / R);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (const k of hash.get(`${cx + dx},${cy + dy}`) ?? []) if (dist(plotC[k], [x, y]) <= r) out.push(k);
    return out;
  };
  const drain = drainage(G), down = G.down;
  return streets.map((s, k) => {
    const pts = samples(s.pts), r = s.w / 2 + NEAR_M;
    const fronting = new Set<number>();
    for (const p of pts) for (const j of near(p, r)) fronting.add(j);
    const why: string[] = [];
    if (frontage[k] === "active") why.push("active frontage");
    const open = [...fronting].some((j) => spacePlot.has(j) || ps[j].use === LANDSCAPE);
    if (open) why.push("a public space on it");
    const built = [...fronting].filter((j) => ps[j].use === BUILDING), progs = built.map(programmeOf);
    if (built.length && progs.filter((p) => p === "shops" || p === "culture" || p === "health").length >= built.length / 3) why.push("shops and services");
    if (progs.includes("education") || stops.some((q) => pts.some((p) => dist(p, q) <= s.w / 2 + 10))) why.push("a school or a bus stop");
    const place = why.length;
    const deadEnd = (deg.get(s.u) ?? 0) <= 1 || (deg.get(s.v) ?? 0) <= 1;
    const link = s.cls >= 3 ? 3 : s.cls === 2 ? 2 : deadEnd ? 0 : 1;
    // on a flow line: most of its samples drain to the next one, and much ground drains along it
    let onFlow = 0, most = 0;
    const cells = pts.map(cellOf);
    for (let q = 0; q < cells.length; q++) {
      const c = cells[q];
      if (c < 0) continue;
      most = Math.max(most, drain[c]);
      if (down && (cells.includes(down[c]) || down[c] === c)) onFlow++;
    }
    const overflow = most >= OVERFLOW_M2 && onFlow >= cells.length / 2;
    const parkside = frontage[k] === "lake" || frontage[k] === "green";
    const shops = why.includes("shops and services");
    const role: RoleKey =
      link === 0 ? (place >= 1 ? "laneway" : "shared-home")
      : link === 1 ? (place >= 2 ? (shops ? "shared-shops" : "shared-home") : parkside ? "parkside" : "residential")
      : link === 2 ? (place >= 1 ? "main-street" : parkside ? "parkside" : "avenue")
      : place >= 2 ? "boulevard" : "avenue";
    return { role, link, place, why, overflow, speed: ROLES[role].speed, section: sectionOf(role, s.w, wet, hot, overflow) };
  });
}
