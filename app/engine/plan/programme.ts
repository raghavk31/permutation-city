// Programme before buildings (docs/typologies.md "Programme"; the user's direction of 28
// October: delineate programmes on the site first, then choose building types for them).
//
// After shared ground and before building types, every building plot gets a programme: homes,
// shops, schools, health, culture, industry, or the public systems that take land (the sewage
// plant, the waste yard). How much of each comes from the people the homes hold, through the
// Indian planning norms; where each goes comes from the ground and the plan:
//
//   1  people: the floor area the genes grew on homes over PERSON_FLOOR_M2 (assumed). Homes
//      are what is left once the rest is placed, so the count is taken twice: first on all the
//      floor, then on the homes' floor
//   2  how much: each facility in FACILITIES is needed once per its population served (URDPFI
//      2014, Vol I, Tables 8.48-8.61, read), at its land area; water at 150 litres a person a
//      day (Table 8.26, CPHEEO 1999) and its sewage plant by Table 8.35; waste at Table 8.44's
//      middle; industry as a share of the land (Table 5.2, metropolitan cities)
//   3  where: each programme reads a few plain layers (below, SUIT): shops near centres and
//      squares on the wide roads, schools on quiet streets near a park and away from industry,
//      industry and the waste yard downwind on wide roads away from water, the sewage plant on
//      the lowest building land near water. Facilities of one kind spread out, each over its
//      own catchment
//   4  a facility takes a corner of one block: its best plot, then the block's plots nearest
//      it until it has its land; a block too small for it gives what it has, and the shortfall
//      is reported
//   5  bus stops at the junctions of the wide streets, so most homes are within 400 m of one
//      (Table 6.1)
//
// Everything else is homes. Building types (blocktypes.ts) read it: each lot, a block's plots of
// one programme, is built as a library precedent for that programme (precedents.ts).
import { BUILDING, LANDSCAPE, PRIMARY_W_M, SECONDARY_W_M } from "../config.js";
import type { Ground } from "../types.js";
import { area, centroid, dist, type Pt } from "./geom.js";
import type { Plot } from "./plots.js";
import { DETOUR } from "./shared.js";

/** What a plot is for. "homes" is the rest; the others are placed. */
export const PROGRAMMES = ["homes", "shops", "education", "health", "culture", "industry", "water", "waste"] as const;
export type ProgrammeKey = (typeof PROGRAMMES)[number];
export const PROGRAMME_LABELS: Record<ProgrammeKey, string> = {
  homes: "homes", shops: "shops and offices", education: "schools and colleges", health: "health",
  culture: "community and culture", industry: "industry", water: "sewage treatment", waste: "waste yard",
};

/** Floor area per person in homes (m², gross). Assumed: about 4.5 people (Census 2011's urban
 *  household, not yet read) in a 90 m² gross flat (URDPFI Table 9.8 gives 60-80 m² for one
 *  bedroom). */
export const PERSON_FLOOR_M2 = 20;

/** A facility one population needs: the people one serves and the land it takes (m²).
 *  URDPFI 2014 (published January 2015), Vol I, Chapter 8, read in corpus/_sources. */
export interface Facility { key: string; label: string; programme: ProgrammeKey; serves: number; land: number; source: string }
export const FACILITIES: readonly Facility[] = [
  { key: "community-centre", label: "community centre", programme: "shops", serves: 100000, land: 50000, source: "URDPFI Table 8.61: community centre with service centre, 1 lakh, 5 ha" },
  { key: "local-shops", label: "local shopping", programme: "shops", serves: 15000, land: 4600, source: "URDPFI Table 8.61: local shopping including service centre, 15,000, 4,600 m²" },
  { key: "convenience", label: "convenience shops", programme: "shops", serves: 5000, land: 1500, source: "URDPFI Table 8.61: convenience shopping, 5,000, 1,500 m²" },
  { key: "college", label: "college", programme: "education", serves: 125000, land: 50000, source: "URDPFI Table 8.49: college, 1.25 lakh, 5 ha" },
  { key: "secondary", label: "senior secondary school", programme: "education", serves: 7500, land: 18000, source: "URDPFI Table 8.48: senior secondary (VI-XII), 7,500, 1.8 ha" },
  { key: "primary", label: "primary school", programme: "education", serves: 5000, land: 4000, source: "URDPFI Table 8.48: primary (I-V), 5,000, 0.4 ha" },
  { key: "nursery", label: "nursery school", programme: "education", serves: 2500, land: 800, source: "URDPFI Table 8.48: pre-primary, 2,500, 0.08 ha" },
  { key: "anganwadi", label: "anganwadi", programme: "education", serves: 5000, land: 250, source: "URDPFI Table 8.51: anganwadi, 5,000, 200-300 m²" },
  { key: "hospital", label: "hospital (80 beds)", programme: "health", serves: 100000, land: 10000, source: "URDPFI Table 8.50: intermediate hospital (category B), 1 lakh, 1 ha" },
  { key: "polyclinic", label: "polyclinic", programme: "health", serves: 100000, land: 2500, source: "URDPFI Table 8.50: polyclinic, 1 lakh, 0.2-0.3 ha" },
  { key: "maternity", label: "nursing home and maternity centre", programme: "health", serves: 45000, land: 2500, source: "URDPFI Table 8.50: 45,000 to 1 lakh, 0.2-0.3 ha (the smaller population taken)" },
  { key: "dispensary", label: "dispensary", programme: "health", serves: 15000, land: 1000, source: "URDPFI Table 8.50: dispensary, 15,000, 0.08-0.12 ha" },
  { key: "culture-centre", label: "music, dance and drama centre", programme: "culture", serves: 100000, land: 1000, source: "URDPFI Table 8.51: 1 lakh, 1,000 m²" },
  { key: "community-hall", label: "community hall and library", programme: "culture", serves: 15000, land: 2000, source: "URDPFI Table 8.51: 15,000, 2,000 m²" },
  { key: "community-room", label: "community room", programme: "culture", serves: 5000, land: 750, source: "URDPFI Table 8.51: 5,000, 750 m² (NBC)" },
  { key: "worship", label: "place of worship", programme: "culture", serves: 5000, land: 400, source: "URDPFI Table 8.51: religious, neighbourhood level, 5,000, 400 m²" },
];

/** A facility is placed once per its population served, rounded; one where the site holds at
 *  least this share of a population served (design: below it the site leans on its district's). */
export const FACILITY_MIN_SHARE = 0.5;

/** Water a person a day (litres): metropolitan cities with sewers (URDPFI Table 8.26, CPHEEO
 *  1999, read). */
export const WATER_LPCD = 150;
/** Share of the water supplied that reaches the sewer (assumed: CPHEEO's 80%, not yet read). */
export const SEWAGE_SHARE = 0.8;
/** Sewage plant land (ha) by capacity (MLD): URDPFI Table 8.35, CPHEEO, read. */
export const STP_LAND: readonly [number, number][] = [[0, 0], [5, 0.10], [10, 0.19], [50, 0.93], [100, 1.87], [200, 3.73], [500, 9.34]];
/** Waste a person a day (kg): the middle of residential refuse, 0.3-0.6 (URDPFI Table 8.44,
 *  CPHEEO 2000, read). */
export const WASTE_KG = 0.45;
/** Land for decentralised processing (composting, biogas) per tonne a day (m²). Assumed. */
export const WASTE_M2_PER_TPD = 200;
/** Industry's share of the land: metropolitan cities, 7-8% of the developed area (URDPFI Table
 *  5.2, read), the lower end; a city-level share applied to the site (assumed). */
export const INDUSTRY_SHARE = 0.07;
/** Bus stops within this walk of homes (URDPFI Table 6.1, from IGBC/LEED India 2011, read). */
export const STOP_WALK_M = 400;
/** Bus stops at least this far apart (design). */
export const STOP_SPACING_M = 300;
/** Stops are added until this share of the homes' floor area is within a walk of one. */
export const STOP_COVER = 0.95;

/** A placed facility: its kind (an index into FACILITIES, or -1 water, -2 waste, -3 industry),
 *  where it is, its plots, the land it needed and was given (m²). */
export interface Placed { kind: number; at: Pt; plots: number[]; need: number; land: number }

export interface ProgrammeResult {
  /** People the homes hold. */
  people: number;
  /** Per plot, an index into PROGRAMMES (-1: not a building plot). */
  plot: number[];
  placed: Placed[];
  /** Per FACILITIES entry: how many the homes' people need, and how many were placed (for the
   *  people estimated before placing). */
  needed: number[]; got: number[];
  water: { mld: number; sewage_mld: number }; waste_tpd: number;
  stops: Pt[];
  /** Share of the homes' floor area within STOP_WALK_M of a stop. */
  stopAccess: number;
  /** Building land per programme (m², PROGRAMMES order). */
  land: number[];
}

const WATER_KIND = -1, WASTE_KIND = -2, INDUSTRY_KIND = -3;

/** STP land (m²) for a sewage flow (MLD), linear between the table's rows. */
export function stpLand(mld: number): number {
  for (let k = 1; k < STP_LAND.length; k++) {
    const [m0, a0] = STP_LAND[k - 1], [m1, a1] = STP_LAND[k];
    if (mld <= m1 || k === STP_LAND.length - 1) return 1e4 * (a0 + ((a1 - a0) * (mld - m0)) / (m1 - m0));
  }
  return 0;
}

/** How many of each facility a population needs. */
export function facilityCounts(people: number): number[] {
  return FACILITIES.map((f) => {
    const n = people / f.serves;
    return n < FACILITY_MIN_SHARE ? 0 : Math.max(1, Math.round(n));
  });
}

/** What a plot reads when programmes are placed. */
interface Site { c: Pt; land: number; block: number; road: number; z: number; wet: number; centre: number; water: number; park: number; wind: number; mid: number }

/** The plain layers each programme prefers (higher is better, about 0-1 each). */
const SUIT: Record<Exclude<ProgrammeKey, "homes">, (s: Site) => number> = {
  // near centres and squares, on the wide roads
  shops: (s) => Math.exp(-s.centre / 250) + Math.min(s.road / PRIMARY_W_M, 1),
  // quiet streets (URDPFI Table 8.48: "preferably face service roads"), near a park
  education: (s) => (s.road <= SECONDARY_W_M - 1 ? 1 : 0.4) + Math.exp(-s.park / 200),
  // on a street an ambulance can use, toward the middle of the site
  health: (s) => (s.road >= SECONDARY_W_M ? 1 : 0.3) + (1 - s.mid),
  // junctions and the water's edge
  culture: (s) => Math.exp(-s.centre / 200) + Math.exp(-s.water / 150),
  // downwind, on wide roads, away from water and wet ground
  industry: (s) => s.wind + Math.min(s.road / PRIMARY_W_M, 1) + Math.min(s.water / 300, 1) - s.wet,
  // the lowest building land, near water, downwind
  water: (s) => (1 - s.z) + Math.exp(-s.water / 200) + 0.5 * s.wind,
  // downwind, on a road a truck can use, away from water
  waste: (s) => s.wind + (s.road >= SECONDARY_W_M ? 1 : 0) + Math.min(s.water / 300, 1),
};

/** Programmes for a design's building plots. floorOf: floor area per plot (m², as the genes
 *  grew it); centres: the core attractors and squares; use: the design's cell uses (its
 *  landscape is the shared ground). */
export function placeProgramme(G: Ground, ps: Plot[], floorOf: ArrayLike<number>, centres: Pt[], use: ArrayLike<number>,
  streets: { pts: Pt[]; cls: number }[]): ProgrammeResult {
  const sites = siteLayers(G, ps, centres, use);
  const building = ps.map((p) => p.use === BUILDING);
  let landAll = 0, floorAll = 0;
  ps.forEach((p, k) => { if (building[k]) { landAll += sites[k]!.land; floorAll += floorOf[k]; } });
  // People, solved once: the homes are the floor left after industry and the facilities the
  // people need, and that floor is taken at the design's mean density (floor over land).
  const rho = landAll ? floorAll / landAll : 0;
  const perPerson = FACILITIES.reduce((a, f) => a + f.land / f.serves, 0);
  const people0 = Math.max((floorAll - rho * INDUSTRY_SHARE * landAll) / (PERSON_FLOOR_M2 + rho * perPerson), 0);
  const res = place(people0);
  // What the homes placed actually hold, and what those people need.
  let homes = 0;
  ps.forEach((_, k) => { if (res.plot[k] === 0) homes += floorOf[k]; });
  const people = homes / PERSON_FLOOR_M2;
  const stops = busStops(ps, res.plot, floorOf, sites, streets);
  return { ...res, people, needed: facilityCounts(people), ...stops };

  function place(pop: number) {
    const plot: number[] = ps.map((_, k) => (building[k] ? 0 : -1));
    const free = building.slice(), placed: Placed[] = [];
    const blockOf = Int32Array.from(ps, (p) => p.block), landOf = Float64Array.from(ps, (_, k) => sites[k]?.land ?? 0);
    const freeLand = new Float64Array(ps.reduce((a, p) => Math.max(a, p.block), 0) + 1);
    ps.forEach((p, k) => { if (building[k]) freeLand[p.block] += landOf[k]; });
    const byBlock = new Map<number, number[]>();
    ps.forEach((p, k) => { if (building[k]) { const l = byBlock.get(p.block); if (l) l.push(k); else byBlock.set(p.block, [k]); } });
    const live = Int32Array.from(ps.map((_, k) => k).filter((k) => building[k]));
    const cx = Float64Array.from(ps, (_, k) => sites[k]?.c[0] ?? 0), cy = Float64Array.from(ps, (_, k) => sites[k]?.c[1] ?? 0);
    // Each programme's suitability per plot, worked out once.
    const suits = new Map<ProgrammeKey, Float64Array>();
    const suitOf = (prog: ProgrammeKey) => {
      let a = suits.get(prog);
      if (!a) {
        const f = SUIT[prog as Exclude<ProgrammeKey, "homes">];
        a = Float64Array.from(ps, (_, k) => (sites[k] ? f(sites[k]!) : 0));
        suits.set(prog, a);
      }
      return a;
    };
    // Per plot, the distance to the nearest industry, kept as industry is placed.
    const toIndustry = new Float64Array(ps.length).fill(Infinity);
    const nearer = (d: Float64Array, at: Pt) => { for (const k of live) { const v = Math.hypot(cx[k] - at[0], cy[k] - at[1]); if (v < d[k]) d[k] = v; } };

    /** One facility: the best free plot, scored for its programme, its spread from its own
     *  kind (mine: distance per plot to the nearest of them) and how much of its land the
     *  block can give; then the block's plots nearest it. */
    const put = (kind: number, prog: ProgrammeKey, need: number, spreadM: number, mine: Float64Array | null) => {
      const suit = suitOf(prog), school = prog === "education", spread = mine && spreadM > 0 ? mine : null;
      let best = -1, bs = -Infinity;
      for (const k of live) {
        if (!free[k]) continue;
        let sc = suit[k] + Math.min(freeLand[blockOf[k]] / need, 1);
        if (spread) sc *= Math.min(spread[k] / spreadM, 1);
        if (school) sc *= Math.min(toIndustry[k] / 300, 1);
        if (sc > bs + 1e-12) { bs = sc; best = k; }
      }
      if (best < 0) return false;
      const at = sites[best]!.c, got: number[] = [];
      let land = 0;
      const near = byBlock.get(ps[best].block)!.filter((k) => free[k]).sort((a, b) => dist(sites[a]!.c, at) - dist(sites[b]!.c, at) || a - b);
      for (const k of near) {
        if (land >= need * 0.9) break;
        free[k] = false; plot[k] = PROGRAMMES.indexOf(prog); got.push(k); land += landOf[k];
      }
      freeLand[blockOf[best]] -= land;
      placed.push({ kind, at, plots: got, need, land });
      if (mine) nearer(mine, at);
      if (prog === "industry") nearer(toIndustry, at);
      return true;
    };

    // Industry first (it decides where schools may not go), in pieces of a block or less.
    const indNeed = INDUSTRY_SHARE * landAll;
    let ind = 0;
    while (ind < indNeed - 1) {
      const before = placed.length;
      put(INDUSTRY_KIND, "industry", Math.min(indNeed - ind, 20000), 0, null);
      if (placed.length === before || !placed[placed.length - 1].land) break;
      ind += placed[placed.length - 1].land;
    }
    // The public systems that take land.
    const water = (pop * WATER_LPCD) / 1e6, sewage = water * SEWAGE_SHARE, wasteT = (pop * WASTE_KG) / 1000;
    if (pop > 0) put(WATER_KIND, "water", stpLand(sewage), 0, null);
    if (pop > 0) put(WASTE_KIND, "waste", wasteT * WASTE_M2_PER_TPD, 0, null);
    // Facilities, the largest of each programme first, spread over their catchments.
    const needed = facilityCounts(pop), got = FACILITIES.map(() => 0);
    const people = pop / Math.max(landAll, 1);
    FACILITIES.forEach((f, i) => {
      const spread = Math.sqrt(f.serves / Math.max(people, 1e-9) / Math.PI) * 0.8;
      const mine = new Float64Array(ps.length).fill(Infinity);
      for (let n = 0; n < needed[i]; n++) if (put(i, f.programme, f.land, spread, mine)) got[i]++;
    });
    const land = PROGRAMMES.map(() => 0);
    ps.forEach((_, k) => { if (plot[k] >= 0) land[plot[k]] += sites[k]!.land; });
    return { plot, placed, got, water: { mld: water, sewage_mld: sewage }, waste_tpd: wasteT, land };
  }
}

/** Per building plot, the layers placement reads: its middle, land, block and road; its ground
 *  height and wetness (0-1 over the site's building land); distance to the nearest centre or
 *  square, to water, and to shared ground (m); how far downwind it lies (0-1); how far from the
 *  site's middle (0-1). */
function siteLayers(G: Ground, ps: Plot[], centres: Pt[], use: ArrayLike<number>): (Site | null)[] {
  const cellAt = nearestCell(G), toWater = waterDistance(G), toPark = hops(G, (i) => use[i] === LANDSCAPE);
  const from = G.meta.wind?.seasons?.year?.prevailing_from_deg;
  // the wind blows from `from` (degrees from north, x east, y north), so downwind is the far side
  const wv: Pt | null = from == null ? null : [Math.sin((from * Math.PI) / 180), Math.cos((from * Math.PI) / 180)];
  const raw = ps.map((p) => {
    if (p.use !== BUILDING) return null;
    const c = centroid(p.ring), i = cellAt(c);
    let centre = Infinity;
    for (const q of centres) centre = Math.min(centre, dist(q, c));
    return { c, land: Math.abs(area(p.ring)), block: p.block, road: p.road, z: i >= 0 && G.z ? G.z[i] : 0,
      wet: i >= 0 ? G.siteWater[i] : 0, centre, water: i >= 0 ? toWater[i] : Infinity, park: i >= 0 ? toPark[i] : Infinity,
      wind: wv ? -(c[0] * wv[0] + c[1] * wv[1]) : 0, mid: 0 };
  });
  const live = raw.filter((s): s is Site => !!s);
  if (!live.length) return raw;
  const range = (f: (s: Site) => number) => { let a = Infinity, b = -Infinity; for (const s of live) { a = Math.min(a, f(s)); b = Math.max(b, f(s)); } return [a, b - a || 1]; };
  const [z0, zr] = range((s) => s.z), [w0, wr] = range((s) => s.wind);
  const mx = live.reduce((a, s) => a + s.c[0], 0) / live.length, my = live.reduce((a, s) => a + s.c[1], 0) / live.length;
  const far = Math.max(...live.map((s) => Math.hypot(s.c[0] - mx, s.c[1] - my)), 1);
  for (const s of live) {
    s.z = (s.z - z0) / zr; s.wind = wv ? (s.wind - w0) / wr : 0.5; s.mid = Math.hypot(s.c[0] - mx, s.c[1] - my) / far;
  }
  return raw;
}

/** Per design cell, the distance to the nearest water or open land beyond the design ground
 *  (m), once per ground. */
const WATER_DIST = new WeakMap<Ground, Float64Array>();
function waterDistance(G: Ground): Float64Array {
  let d = WATER_DIST.get(G);
  if (!d) {
    const near = pointIndex([...(G.water ?? []), ...(G.openLand ?? [])]);
    d = Float64Array.from({ length: G.n }, (_, i) => near([G.x[i], G.y[i]]));
    WATER_DIST.set(G, d);
  }
  return d;
}

/** Per design cell, the walk over the cell grid to the nearest cell that passes (m; Infinity
 *  where none is reached): breadth first, a cell spacing a step. */
function hops(G: Ground, src: (i: number) => boolean): Float64Array {
  const d = new Float64Array(G.n).fill(Infinity), q = new Int32Array(G.n);
  let head = 0, tail = 0;
  for (let i = 0; i < G.n; i++) if (src(i)) { d[i] = 0; q[tail++] = i; }
  while (head < tail) {
    const i = q[head++];
    for (let j = 0; j < G.deg; j++) {
      const o = G.nbr[i * G.deg + j];
      if (o >= 0 && d[o] === Infinity) { d[o] = d[i] + G.grid.spacing; q[tail++] = o; }
    }
  }
  return d;
}

/** Bus stops at junctions of the wide streets: the one covering the most homes' floor area not
 *  yet within a walk, until STOP_COVER of it is, STOP_SPACING_M apart. */
function busStops(ps: Plot[], plot: number[], floorOf: ArrayLike<number>, sites: (Site | null)[], streets: { pts: Pt[]; cls: number }[]) {
  const ends = new Map<string, { at: Pt; n: number }>();
  for (const s of streets) {
    if (s.cls < 2 || s.pts.length < 2) continue;
    for (const p of [s.pts[0], s.pts[s.pts.length - 1]]) {
      const key = `${Math.round(p[0])},${Math.round(p[1])}`, e = ends.get(key);
      if (e) e.n++; else ends.set(key, { at: p, n: 1 });
    }
  }
  const cand = [...ends.values()].filter((e) => e.n >= 2).map((e) => e.at);
  const homes = ps.map((_, k) => k).filter((k) => plot[k] === 0 && floorOf[k] > 0);
  const total = homes.reduce((a, k) => a + floorOf[k], 0);
  const reach = STOP_WALK_M / DETOUR, covered = new Set<number>(), stops: Pt[] = [];
  const hash = new Map<string, number[]>();
  for (const k of homes) {
    const [x, y] = sites[k]!.c, h = `${Math.floor(x / reach)},${Math.floor(y / reach)}`, b = hash.get(h);
    if (b) b.push(k); else hash.set(h, [k]);
  }
  const near = cand.map((c) => {
    const out: number[] = [], gx = Math.floor(c[0] / reach), gy = Math.floor(c[1] / reach);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      for (const k of hash.get(`${gx + dx},${gy + dy}`) ?? []) if (dist(sites[k]!.c, c) <= reach) out.push(k);
    }
    return out;
  });
  let got = 0;
  while (total > 0 && got < STOP_COVER * total) {
    let best = -1, bg = 0;
    cand.forEach((c, j) => {
      if (stops.some((s) => dist(s, c) < STOP_SPACING_M)) return;
      let g = 0;
      for (const k of near[j]) if (!covered.has(k)) g += floorOf[k];
      if (g > bg) { bg = g; best = j; }
    });
    if (best < 0) break;
    stops.push(cand[best]);
    for (const k of near[best]) if (!covered.has(k)) { covered.add(k); got += floorOf[k]; }
  }
  return { stops, stopAccess: total ? got / total : 0 };
}

/** Distance from a point to the nearest of a set (m; Infinity for none), on a grid hash. */
function pointIndex(pts: Pt[], R = 150): (p: Pt) => number {
  if (!pts.length) return () => Infinity;
  const hash = new Map<string, Pt[]>();
  for (const p of pts) { const h = `${Math.floor(p[0] / R)},${Math.floor(p[1] / R)}`, b = hash.get(h); if (b) b.push(p); else hash.set(h, [p]); }
  return ([x, y]) => {
    const cx = Math.floor(x / R), cy = Math.floor(y / R);
    let best = Infinity;
    for (let r = 0; r < 40; r++) {
      for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        for (const [px, py] of hash.get(`${cx + dx},${cy + dy}`) ?? []) best = Math.min(best, Math.hypot(px - x, py - y));
      }
      // every point outside the squares searched so far is more than r R away
      if (best <= r * R) return best;
    }
    return best;
  };
}

/** The design cell nearest a point (-1 off the ground), on a grid hash of cell centres. */
const CELL_INDEX = new WeakMap<Ground, (p: Pt) => number>();
function nearestCell(G: Ground): (p: Pt) => number {
  let f = CELL_INDEX.get(G);
  if (f) return f;
  const R = Math.max(G.grid.spacing * 2, 10), hash = new Map<string, number[]>();
  for (let i = 0; i < G.n; i++) { const h = `${Math.floor(G.x[i] / R)},${Math.floor(G.y[i] / R)}`, b = hash.get(h); if (b) b.push(i); else hash.set(h, [i]); }
  f = ([x, y]) => {
    let best = -1, bd = Infinity;
    const cx = Math.floor(x / R), cy = Math.floor(y / R);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (const i of hash.get(`${cx + dx},${cy + dy}`) ?? []) {
      const d = (G.x[i] - x) ** 2 + (G.y[i] - y) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  };
  CELL_INDEX.set(G, f);
  return f;
}
