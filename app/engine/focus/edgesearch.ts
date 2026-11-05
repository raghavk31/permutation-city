// The search for a river's edge (docs/architecture-v3.md section 15.9, step E4). Each stretch starts from
// the library's members and searches its genes, in the manner of plan/publicform.ts. A pass along each bank
// then chooses a chain that joins well. A few directions, each lawful and as a what-if, make the options.
// The weights say what each direction values: they're choices, not findings, so they're named here.
import { clampShape, edgeShapeOf, OPEN_GENES, type Shape } from "../typology/openshape.js";
import { EDGE_SECTIONS } from "../typology/library/edgesections.js";
import type { EdgeRead } from "./edge.js";
import { fitStretch, type StretchFit, type Works } from "./edgeform.js";
import { pathJoins, type Score, scoreEdge, type StretchSums, stretchSums, WHEELCHAIR_SLOPE } from "./edgescore.js";
import type { Place } from "./place.js";
import type { Walk } from "./walk.js";

export type Direction = "path" | "river" | "room" | "green";

// Everything is valued in km of bank walkable all year: a km walkable on 1 more day in 10 is worth 0.1.
const ROOM_M3 = 2000, PLANTED_HA = 10, SEAT_M = 1000;   // what's worth 1 km of that (assumed)
const PATH_DS = [10, 30, 60, 120];                      // where a path at grade might run, metres from the bank; undefined is the middle
export const EARTH_M3 = 20_000;                         // this much earth moved costs 1 km of it (assumed): terrain's too rough to price it
const LEVEL_COST = 0.02;                                // per metre the path changes level between stretches
const STEEP_COST = 0.15;                                // per length of path a wheelchair can't use

const WEIGHTS: Record<Direction, { days: number; close: number; water: number; room: number; planted: number; seats: number }> = {
  // Planting takes ground that's often farmed or used, so it's a small cost unless it's what's wanted.
  path: { days: 1, close: 0.1, water: 0, room: 0, planted: -0.01, seats: 0 },
  river: { days: 0.25, close: 1, water: 1.5, room: 0, planted: -0.01, seats: 0.1 },
  room: { days: 0.25, close: 0.1, water: 0.25, room: 1, planted: -0.01, seats: 0.1 },
  green: { days: 0.25, close: 0.1, water: 0, room: 0, planted: 1, seats: 0 },
};

// COPY: what each direction is after
export const DIRECTIONS: { id: Direction; words: string; why: string }[] = [
  { id: "path", words: "A path, and little else", why: "A way along that stays dry as much of the year as it can, moving no earth and planting little." },
  { id: "river", words: "Close to the river", why: "A path beside the bank, wetter for it. It adds little bank that reaches the water, because the trees there stay." },
  { id: "room", words: "Most room for the river", why: "As much ground as can be lowered for flood water, with the earth taken away. This is a volume: nothing here shows it lowers a flood." },
  { id: "green", words: "Most planted", why: "As much new cover as the ground and the views allow, much of it on ground that's farmed or used today." },
];

const SEARCHED = OPEN_GENES.edge.filter((g) => ["tiers", "low", "lowWide", "wall", "bank", "trees"].includes(g.key));
const SOFT_COVER = 0.1;                                 // lawful earth that's been reshaped is planted at least this much, or the first flood takes it (assumed)
const ROUNDS = 40, CHILDREN = 3, CHAIN_KEEP = 8;

export interface Candidate { fit: StretchFit; sums: StretchSums; steep: number; keepGround: boolean; pathD: number | undefined }
export interface EdgeOption {
  id: string; direction: Direction; works: Works; words: string; why: string;
  /** What each stretch uses, and the precedent its genes are now closest to; none if the ground is kept. */
  stretches: { id: string; like: string | null; shape: Shape; keepGround: boolean; pathD: number | undefined }[];
  fits: StretchFit[]; scores: Score[];
  joins: { all: number; steep: number; worst: number };
}

function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };

/** What a stretch is worth to a direction, before it's joined to its neighbours. */
export function worth(c: Candidate, d: Direction, earthM3 = EARTH_M3): number {
  const w = WEIGHTS[d], s = c.sums;
  return w.days * s.days + w.close * s.close + w.water * s.water + (w.room * Math.max(0, s.room)) / ROOM_M3 + (w.planted * s.planted) / PLANTED_HA + (w.seats * s.seats) / SEAT_M
    - s.earth / earthM3 - c.steep * STEEP_COST;
}

/** Everything worth keeping on one stretch: the members, the ground left alone, and what grew from them. */
export function searchStretch(place: Place, read: EdgeRead, base: Walk, bankId: number, stretchId: string, works: Works, seed: number, earthM3 = EARTH_M3): Candidate[] {
  const make = (shape0: Shape, keepGround = false, pathD?: number): Candidate | null => {
    const shape = works === "soft" && !keepGround ? { ...shape0, trees: Math.max(SOFT_COVER, shape0.trees) } : shape0;
    const fit = fitStretch(place, read, bankId, stretchId, shape, works, { keepGround, pathD });
    if (!fit.checks.every((c) => c.holds)) return null;
    return { fit, sums: stretchSums(place, read, fit, base), steep: pathJoins(read, [fit]).filter((j) => j.slope > WHEELCHAIR_SLOPE).length, keepGround, pathD };
  };
  const all: Candidate[] = [];
  const add = (c: Candidate | null) => { if (c) all.push(c); };
  const members = Object.keys(EDGE_SECTIONS);
  for (const id of members) add(make(edgeShapeOf(id)!));
  // The ground left alone, with a path somewhere along it and more or less planted.
  for (const trees of [0, 0.2, 0.4, 0.6]) for (const d of [undefined, ...PATH_DS]) add(make(clampShape("edge", { ...edgeShapeOf(members[0])!, trees }), true, d));
  const r = rng(seed ^ hash(stretchId));
  for (let round = 0; round < ROUNDS; round++) for (const d of DIRECTIONS) {
    const parent = all.reduce((p, q) => (worth(q, d.id, earthM3) > worth(p, d.id, earthM3) ? q : p));
    for (let k = 0; k < CHILDREN; k++) {
      const child: Shape = { ...parent.fit.shape };
      for (let t = 0, n = r() < 0.5 ? 1 : 2; t < n; t++) {
        const g = SEARCHED[Math.floor(r() * SEARCHED.length)];
        child[g.key] = child[g.key] + (r() * 2 - 1) * 0.25 * (g.hi - g.lo);
      }
      const d = r() < 0.3 ? [undefined, ...PATH_DS][Math.floor(r() * (PATH_DS.length + 1))] : parent.pathD;
      add(make(clampShape("edge", child), parent.keepGround, d));
    }
  }
  return all;
}

/** The member a shape's genes are closest to, each gene measured against its own range. */
export function closestMember(shape: Shape): string {
  let best = "", bestD = Infinity;
  for (const id of Object.keys(EDGE_SECTIONS)) {
    const m = edgeShapeOf(id)!;
    let d = 0;
    for (const g of SEARCHED) d += ((shape[g.key] - m[g.key]) / (g.hi - g.lo)) ** 2;
    if (d < bestD) { bestD = d; best = id; }
  }
  return best;
}

const endOf = (f: StretchFit, last: boolean) => { const s = last ? f.sections[f.sections.length - 1] : f.sections[0]; return s?.path ?? null; };

/** Along one bank, the chain of candidates worth most once they've been joined. */
function chain(read: EdgeRead, bankId: number, pools: Map<string, Candidate[]>, d: Direction, earthM3: number): Candidate[] {
  const b = read.banks.find((x) => x.id === bankId)!;
  const short = b.stretches.map((s) => {
    const pool = [...pools.get(s.id)!].sort((p, q) => worth(q, d, earthM3) - worth(p, d, earthM3));
    const out: Candidate[] = [], levels = new Set<string>();
    // The best few, but at different path levels, so a join has something to choose between.
    for (const c of pool) {
      const key = `${endOf(c.fit, false)?.z.toFixed(1)}|${endOf(c.fit, true)?.z.toFixed(1)}`;
      if (levels.has(key)) continue;
      levels.add(key); out.push(c);
      if (out.length >= CHAIN_KEEP) break;
    }
    return out;
  });
  const joinCost = (a: Candidate, c: Candidate) => {
    const p = endOf(a.fit, true), q = endOf(c.fit, false);
    if (!p || !q) return 0;
    const rise = Math.abs(p.z - q.z);
    return rise * LEVEL_COST + (rise / 50 > WHEELCHAIR_SLOPE ? STEEP_COST : 0);
  };
  let best = short[0].map((c) => ({ v: worth(c, d, earthM3), back: [c] }));
  for (let i = 1; i < short.length; i++) {
    best = short[i].map((c) => {
      let top = best[0], topV = -Infinity;
      for (const p of best) { const v = p.v - joinCost(p.back[p.back.length - 1], c); if (v > topV) { topV = v; top = p; } }
      return { v: topV + worth(c, d, earthM3), back: [...top.back, c] };
    });
  }
  return best.reduce((p, q) => (q.v > p.v ? q : p)).back;
}

/** The options: each direction, lawful and as a what-if. Directions that land on the same design are one option. */
export function searchEdge(place: Place, read: EdgeRead, base: Walk, seed = 1, earthM3 = EARTH_M3): EdgeOption[] {
  const out: EdgeOption[] = [];
  for (const works of ["soft", "hard"] as Works[]) {
    const pools = new Map<string, Candidate[]>();
    for (const b of read.banks) for (const s of b.stretches) pools.set(s.id, searchStretch(place, read, base, b.id, s.id, works, seed, earthM3));
    const seen = new Set<string>();
    for (const d of DIRECTIONS) {
      const picked = read.banks.flatMap((b) => chain(read, b.id, pools, d.id, earthM3));
      const key = picked.map((c) => JSON.stringify([c.fit.levels, c.fit.shape.trees, c.keepGround, c.pathD])).join();
      if (seen.has(key)) continue;
      seen.add(key);
      const fits = picked.map((c) => c.fit);
      const joins = pathJoins(read, fits);
      out.push({
        id: `${works}-${d.id}`, direction: d.id, works, words: d.words, why: d.why,
        stretches: picked.map((c) => ({ id: c.fit.stretch.id, like: c.fit.mode === "reshape" ? closestMember(c.fit.shape) : null, shape: c.fit.shape, keepGround: c.keepGround, pathD: c.pathD })),
        fits, scores: scoreEdge(place, read, fits, base),
        joins: { all: joins.length, steep: joins.filter((j) => j.slope > WHEELCHAIR_SLOPE).length, worst: joins.reduce((m, j) => Math.max(m, j.slope), 0) },
      });
    }
  }
  return out;
}
