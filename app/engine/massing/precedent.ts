// Representation 4: a precedent from the typology library (architecture-v3 section 13, steps
// B2-B3). The building is a library precedent for the programme, its settings varied within
// ranges, laid over the plot's buildable land as the urban scale lays a lot (plan/blockmass.ts:
// its tile repeated, buildings trimmed at the edge by whole units, never sliced), then set on
// the columns and scored like the rest.
//
// Candidates are chosen by the climate challenges they answer (typology/challenges.ts), not by
// how alike their climate is (user, 31 October): the best answers first, the first CANDIDATES
// whose smallest tile fits the plot.
//
// Ranges (B3; user, 30 October: typologies as parameter ranges, from case studies too): each
// setting starts from the precedent's own value and may move between RANGE[0] and RANGE[1]
// times it, held inside the spread of its family in the library (court, yard, row, tall) but
// always including its own value. Units in a row may drop to one, so a lane of houses too long
// for a plot can shrink to fit; rows by one either way. Storeys as before (maxStoreys), the
// court or street widened when raised (variant). What moved is the drift, per setting.
//
// Hybrids (decision of 30 October): only when no single precedent reaches the floor wanted
// within its ranges. searchPlot then runs again with genes 12-13 live: a precedent's
// arrangement with another candidate's units (width, depth, court, street, gap) as the centre
// of its ranges.
//
// Genes, all 0..1:
//    0 which     the candidate             7 count     units in a row, cluster or ring
//    1 storeys   1 to its cap              8 rows      rows of units
//    2 keep      share of floor kept       9 court     the court or yard
//    3 along     where the tiles sit along 10 street   the street or lane
//    4 back      how far from the street   11 gap      between free-standing units
//    5 width     a unit's width            12 hybrid   on above 0.5 (hybrid runs only)
//    6 depth     a unit's depth            13 donor    whose units
import { STOREY_M } from "../config.js";
import { layLot, type Mass } from "../plan/blockmass.js";
import type { Line, Pt } from "../plan/geom.js";
import { inside } from "../plan/geom.js";
import { familyOf, isBuilding, maxStoreys, PROGRAMME_PRECEDENTS, storeysOf, variant } from "../plan/precedents.js";
import type { ProgrammeKey } from "../plan/programme.js";
import { answer, needs, type Answer, type Challenge, type Need } from "../typology/challenges.js";
import type { Normals } from "../typology/climate.js";
import type { Params } from "../typology/grammar.js";
import { LIBRARY } from "../typology/library.js";
import type { Precedent } from "../typology/types.js";
import type { Rng } from "../types.js";
import { clamp01, jiggle, vecDistance, type MassContext, type Representation } from "./context.js";
import type { Envelope } from "./envelope.js";
import { repair, type Massing } from "./voxels.js";

export const CANDIDATES = 8;
export const KEEP_MIN = 0.4;
export const GENES = 14;
/** A setting may move from RANGE[0] to RANGE[1] times its own value (assumed). */
export const RANGE: [number, number] = [0.6, 1.6];

export const SETTINGS = ["width", "depth", "count", "rows", "court", "street", "gap"] as const;
export type Setting = (typeof SETTINGS)[number];
export const SETTING_WORDS: Record<Setting, string> = {
  width: "unit width", depth: "unit depth", count: "units in a row", rows: "rows", court: "court", street: "street or lane", gap: "gap between units",
};
/** Which settings an arrangement uses. */
const USES: Partial<Record<Params["arrangement"], Setting[]>> = {
  row: ["width", "depth", "count", "rows", "street", "gap"],
  cluster: ["width", "depth", "count", "rows", "court", "street", "gap"],
  ring: ["width", "depth", "count", "court"],
  court: ["width", "depth", "court"],
  slab: ["width", "depth", "street"],
  tower: ["width", "depth", "street"],
  shed: ["width", "depth", "count", "street"],
};
const INTEGER = new Set<Setting>(["count", "rows"]);
/** A setting's value in a seed when it doesn't say (grammar.ts defaults). */
const DEFAULT: Record<Setting, number> = { width: 8, depth: 10, count: 6, rows: 1, court: 10, street: 4, gap: 0 };
const valueOf = (s: Params, k: Setting) => (s[k] as number | undefined) ?? DEFAULT[k];

/** The spread of each setting over the building precedents of each family (from the library). */
const SPREAD = (() => {
  const out = new Map<number, Record<Setting, [number, number]>>();
  for (const p of LIBRARY) {
    const f = familyOf(p.seed.arrangement);
    if (f < 0) continue;
    const r = out.get(f) ?? (Object.fromEntries(SETTINGS.map((k) => [k, [Infinity, -Infinity]])) as Record<Setting, [number, number]>);
    for (const k of SETTINGS) if (p.seed[k] != null) { const v = valueOf(p.seed, k); r[k] = [Math.min(r[k][0], v), Math.max(r[k][1], v)]; }
    out.set(f, r);
  }
  return out;
})();

/** A setting's range for a seed (its own value, or a donor's, as the centre). */
export function rangeOf(seed: Params, k: Setting, centre = valueOf(seed, k)): [number, number] {
  const v = centre, fam = SPREAD.get(familyOf(seed.arrangement))?.[k] ?? [v, v];
  if (k === "count") return [1, Math.max(v, Math.round(v * RANGE[1]))];
  if (k === "rows") return [1, v + 1];
  if (k === "gap") return [0, Math.max(3, v * 2)];
  const lo = Math.max(Number.isFinite(fam[0]) ? Math.min(fam[0], v) : 0, v * RANGE[0], k === "street" ? 2 : k === "court" ? 3 : 2.5);
  const hi = Math.min(Number.isFinite(fam[1]) ? Math.max(fam[1], v) : Infinity, v * RANGE[1]);
  return [Math.min(lo, v), Math.max(hi, v)];
}

export interface PlotCandidate { p: Precedent; own: number; max: number; answer: Answer; uses: Setting[] }

/** The seed at its smallest: every setting at the bottom of its range (whether it can fit at all). */
const smallest = (s: Params): Params => {
  const q: Params = { ...s };
  for (const k of USES[s.arrangement] ?? []) if (k !== "court" && k !== "gap") (q as unknown as Record<string, number>)[k] = rangeOf(s, k)[0];
  if (q.count !== s.count || q.rows !== s.rows) delete q.omit;
  return q;
};

/** The building precedents for a programme, best answer to the climate's challenges first, the
 *  first CANDIDATES whose smallest tile lays on the land. */
export function plotCandidates(prog: ProgrammeKey, ns: readonly Need[], land: Line[], cap: number): PlotCandidate[] {
  const libs = PROGRAMME_PRECEDENTS[prog], seen = new Set<string>(), all: PlotCandidate[] = [];
  for (const p of LIBRARY) {
    if (seen.has(p.id) || !p.programmes.some((k) => libs.includes(k)) || !isBuilding(p)) continue;
    seen.add(p.id);
    const own = storeysOf(p.seed);
    all.push({ p, own, max: Math.max(1, Math.min(maxStoreys(p.seed), cap)), answer: answer(p.mechanisms, ns), uses: USES[p.seed.arrangement] ?? [] });
  }
  // the programme's own library first (homes from housing), then the borrowed ones
  const rank = (c: PlotCandidate) => libs.findIndex((k) => c.p.programmes.includes(k));
  all.sort((a, b) => rank(a) - rank(b) || b.answer.fit - a.answer.fit || (a.p.id < b.p.id ? -1 : 1));
  const out: PlotCandidate[] = [];
  for (const c of all) {
    if (out.length >= CANDIDATES) break;
    const s = smallest(c.p.seed);
    if (layLot(c.p.id, 1, land, false, { params: { ...s, storeys: 1 }, key: `${c.p.id}:min` })) out.push(c);
  }
  return out;
}

/** What one plot's search knows beyond the envelope: the climate's challenges and the candidates. */
export interface PlotBrief { programme: ProgrammeKey; normals: Normals; extra?: Partial<Record<Challenge, number>> }
export function plotChoices(brief: PlotBrief, land: Line[], cap: number): { needs: Need[]; candidates: PlotCandidate[] } {
  const ns = needs(brief.normals, brief.extra);
  return { needs: ns, candidates: plotCandidates(brief.programme, ns, land, cap) };
}

/** What moved from the precedent, one setting at a time. */
export interface Change { what: Setting | "storeys" | "units"; from: number | string; to: number | string }

/** What a precedent massing came from: kept with the massing for the readout and the viewer. */
export interface Source { precedent: string; storeys: number; own: number; keep: number; drift: Change[]; donor?: string; params: Params; masses: Mass[] }

const lerp = ([lo, hi]: [number, number], x: number, int: boolean) => { const v = lo + clamp01(x) * (hi - lo); return int ? Math.round(v) : Math.round(v * 2) / 2; };
const unlerp = ([lo, hi]: [number, number], v: number) => (hi > lo ? clamp01((v - lo) / (hi - lo)) : 0.5);

/** A genome's precedent, settings and placement. */
export function decode(ctx: MassContext, g: number[]) {
  const cs = ctx.candidates ?? [];
  const k = Math.min(cs.length - 1, Math.floor(clamp01(g[0]) * cs.length)), c = cs[k];
  const n = Math.max(1, Math.min(c.max, Math.round(1 + clamp01(g[1]) * (c.max - 1))));
  const donor = ctx.hybrids && g[12] > 0.5 ? cs[Math.min(cs.length - 1, Math.floor(clamp01(g[13]) * cs.length))] : undefined;
  const hybrid = donor && donor !== c ? donor : undefined;
  const seed = c.p.seed, q: Params = { ...seed }, drift: Change[] = [];
  c.uses.forEach((s) => {
    const centre = hybrid && hybrid.p.seed[s] != null && s !== "count" && s !== "rows" ? valueOf(hybrid.p.seed, s) : valueOf(seed, s);
    const v = lerp(rangeOf(seed, s, centre), g[5 + SETTINGS.indexOf(s)], INTEGER.has(s));
    (q as unknown as Record<string, number>)[s] = v;
  });
  if (q.count !== seed.count || q.rows !== seed.rows) delete q.omit;
  // raised past its own height: court or street widened to the height (variant)
  const v = variant(q, n), params = v.params;
  if (hybrid) drift.push({ what: "units", from: c.p.name, to: hybrid.p.name });
  for (const s of c.uses) {
    const a = valueOf(seed, s), b = valueOf(params, s);
    if (Math.abs(a - b) > 0.25) drift.push({ what: s, from: a, to: Math.round(b * 10) / 10 });
  }
  if (n !== c.own) drift.unshift({ what: "storeys", from: c.own, to: n });
  return { c, k, n, keep: KEEP_MIN + (1 - KEEP_MIN) * clamp01(g[2]), place: [clamp01(g[3]), clamp01(g[4])] as [number, number], params, drift, hybrid };
}

/** The genes that give a candidate as it is: own settings, own height (or its cap), all its
 *  buildings, centred along the street and against it. */
export function ownGenes(ctx: MassContext, k: number): number[] {
  const cs = ctx.candidates ?? [], c = cs[k], n = Math.min(c.own, c.max), g = new Array(GENES).fill(0.5);
  g[0] = (k + 0.5) / cs.length; g[1] = c.max > 1 ? (n - 1) / (c.max - 1) : 0; g[2] = 1; g[4] = 0; g[12] = 0;
  for (const s of c.uses) g[5 + SETTINGS.indexOf(s)] = unlerp(rangeOf(c.p.seed, s), valueOf(c.p.seed, s));
  return g;
}

/** Masses on the columns: a column whose centre is inside a mass's outline (and not in a hole)
 *  is filled from its base storey for its storeys. */
export function rasterize(E: Envelope, masses: Mass[]): Uint8Array {
  const N = E.nx * E.ny, occ = new Uint8Array(N * E.nz);
  for (const m of masses) {
    const z0 = Math.max(0, Math.round(m.z / STOREY_M)), z1 = Math.min(E.nz, z0 + m.storeys);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of m.ring) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    const c0 = Math.max(0, Math.floor((x0 - E.ox) / E.res)), c1 = Math.min(E.nx - 1, Math.floor((x1 - E.ox) / E.res));
    const r0 = Math.max(0, Math.floor((y0 - E.oy) / E.res)), r1 = Math.min(E.ny - 1, Math.floor((y1 - E.oy) / E.res));
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      const p: Pt = [E.ox + (c + 0.5) * E.res, E.oy + (r + 0.5) * E.res];
      if (!inside(m.ring, p) || m.holes?.some((h) => inside(h, p))) continue;
      for (let z = z0; z < z1; z++) occ[z * N + r * E.nx + c] = 1;
    }
  }
  return occ;
}

const settingsKey = (p: Params) => SETTINGS.map((k) => p[k] ?? "-").join(",");

export const precedent: Representation<number[]> = {
  kind: "precedent",
  label: "a precedent from the library",
  random: (rng: Rng) => Array.from({ length: GENES }, () => rng.random()),
  mutate: (g, rng) => {
    const out = jiggle(g, rng, 0.3);
    // now and then another candidate, or another donor, outright
    if (rng.random() < 0.12) out[0] = rng.random();
    if (rng.random() < 0.08) out[13] = rng.random();
    return out;
  },
  // the candidate and its settings travel together; placement and keep mix freely
  cross: (a, b, rng) => {
    const whole = rng.random() < 0.5 ? a : b;
    return a.map((v, k) => (k === 0 || (k >= 5 && k <= 11) ? whole[k] : rng.random() < 0.5 ? v : b[k]));
  },
  seeds: (ctx) => (ctx.candidates ?? []).map((_, k) => ownGenes(ctx, k)),
  build(g, ctx): Massing {
    const E = ctx.E, land = E.land ?? [], empty = new Uint8Array(E.nx * E.ny * E.nz);
    if (!ctx.candidates?.length || !land.length) return { occ: empty, repairs: [], rejected: "no precedent fits the plot" };
    const d = decode(ctx, g);
    const lay = layLot(d.c.p.id, d.n, land, true, { params: d.params, key: `${d.c.p.id}:${settingsKey(d.params)}:${d.n}`, place: d.place, front: ctx.front });
    const masses: Mass[] = [];
    if (lay) {
      // whole buildings kept in their order while the floor kept stays under the share of the
      // floor passed (error diffusion), so the ones left out are spread evenly
      let passed = 0, held = 0;
      for (const p of lay.pieces) {
        const a = p.a * p.storeys;
        passed += a;
        if (held + a > d.keep * passed + a / 2) continue;
        held += a;
        masses.push({ ring: p.ring, ...(p.holes.length ? { holes: p.holes } : {}), z: p.z, storeys: p.storeys, block: 0, ...(p.roof ? { roof: p.roof, roofs: p.roofs } : {}) });
      }
    }
    const occ = rasterize(E, masses);
    const repairs = repair(E, occ);
    const source: Source = { precedent: d.c.p.id, storeys: d.n, own: d.c.own, keep: d.keep, drift: d.drift, ...(d.hybrid ? { donor: d.hybrid.p.id } : {}), params: d.params, masses };
    return { occ, repairs, rejected: masses.length ? null : `${d.c.p.name} does not fit at ${d.n} storeys with these settings`, source };
  },
  distance: (a, b) => vecDistance(a, b),
};

/** Where the street is: the middle of the plot's street columns (none: undefined). */
export function frontOf(E: Envelope): Pt | undefined {
  let x = 0, y = 0, m = 0;
  for (let q = 0; q < E.nx * E.ny; q++) if (E.street[q]) { x += E.ox + ((q % E.nx) + 0.5) * E.res; y += E.oy + (Math.floor(q / E.nx) + 0.5) * E.res; m++; }
  return m ? [x / m, y / m] : undefined;
}
