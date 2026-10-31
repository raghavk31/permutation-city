// Representation 4: a precedent from the typology library (architecture-v3 section 13, step
// B2). The building is a library precedent for the programme, laid over the plot's buildable
// land as the urban scale lays a lot (plan/blockmass.ts: its tile repeated, buildings trimmed
// at the edge by whole units, never sliced), then set on the columns and scored like the rest.
//
// Candidates are chosen by the climate challenges they answer (typology/challenges.ts), not by
// how alike their climate is (user, 31 October): the best answers first, the first CANDIDATES
// whose tile fits the plot.
//
// Genes, all 0..1:
//   0 which     the candidate
//   1 storeys   from 1 to the lower of its stretch limit (maxStoreys) and the plot's cap
//   2 keep      the share of its floor kept (0.4 to 1): whole buildings left out, spread evenly
//
// The first generation is every candidate at its own height with all its tiles. Its drift
// from the precedent (storeys, and the court or street widened with them) is kept with the
// massing.
import { STOREY_M } from "../config.js";
import { layLot, type Mass } from "../plan/blockmass.js";
import type { Line } from "../plan/geom.js";
import { inside } from "../plan/geom.js";
import { isBuilding, maxStoreys, PROGRAMME_PRECEDENTS, storeysOf, variant, type Drift } from "../plan/precedents.js";
import type { ProgrammeKey } from "../plan/programme.js";
import { answer, needs, type Answer, type Challenge, type Need } from "../typology/challenges.js";
import type { Normals } from "../typology/climate.js";
import { LIBRARY } from "../typology/library.js";
import type { Precedent } from "../typology/types.js";
import type { Rng } from "../types.js";
import { clamp01, jiggle, vecDistance, type MassContext, type Representation } from "./context.js";
import { repair, type Massing } from "./voxels.js";

export const CANDIDATES = 8;
export const KEEP_MIN = 0.4;
export const GENES = 3;

export interface PlotCandidate { p: Precedent; own: number; max: number; answer: Answer }

/** The building precedents for a programme, best answer to the climate's challenges first, the
 *  first CANDIDATES that lay at least one tile on the land. */
export function plotCandidates(prog: ProgrammeKey, ns: readonly Need[], land: Line[], cap: number): PlotCandidate[] {
  const libs = PROGRAMME_PRECEDENTS[prog], seen = new Set<string>(), all: PlotCandidate[] = [];
  for (const p of LIBRARY) {
    if (seen.has(p.id) || !p.programmes.some((k) => libs.includes(k)) || !isBuilding(p)) continue;
    seen.add(p.id);
    const own = storeysOf(p.seed);
    all.push({ p, own, max: Math.max(1, Math.min(maxStoreys(p.seed), cap)), answer: answer(p.mechanisms, ns) });
  }
  // the programme's own library first (homes from housing), then the borrowed ones
  const rank = (c: PlotCandidate) => libs.findIndex((k) => c.p.programmes.includes(k));
  all.sort((a, b) => rank(a) - rank(b) || b.answer.fit - a.answer.fit || (a.p.id < b.p.id ? -1 : 1));
  const out: PlotCandidate[] = [];
  for (const c of all) {
    if (out.length >= CANDIDATES) break;
    if (layLot(c.p.id, Math.min(c.own, c.max), land, false)) out.push(c);
  }
  return out;
}

/** What one plot's search knows beyond the envelope: the climate's challenges and the candidates. */
export interface PlotBrief { programme: ProgrammeKey; normals: Normals; extra?: Partial<Record<Challenge, number>> }
export function plotChoices(brief: PlotBrief, land: Line[], cap: number): { needs: Need[]; candidates: PlotCandidate[] } {
  const ns = needs(brief.normals, brief.extra);
  return { needs: ns, candidates: plotCandidates(brief.programme, ns, land, cap) };
}

/** What a precedent massing came from: kept with the massing for the readout and the viewer. */
export interface Source { precedent: string; storeys: number; own: number; keep: number; drift: Drift[]; masses: Mass[] }

const pick = (ctx: MassContext, g: number[]) => {
  const cs = ctx.candidates ?? [];
  const c = cs[Math.min(cs.length - 1, Math.floor(clamp01(g[0]) * cs.length))];
  const n = Math.max(1, Math.min(c.max, Math.round(1 + clamp01(g[1]) * (c.max - 1))));
  return { c, n, keep: KEEP_MIN + (1 - KEEP_MIN) * clamp01(g[2]) };
};

/** The genes that give a candidate at its own height (or its cap) with all its tiles. */
export function ownGenes(ctx: MassContext, k: number): number[] {
  const cs = ctx.candidates ?? [], c = cs[k], n = Math.min(c.own, c.max);
  return [(k + 0.5) / cs.length, c.max > 1 ? (n - 1) / (c.max - 1) : 0, 1];
}

/** Masses on the columns: a column whose centre is inside a mass's outline (and not in a hole)
 *  is filled from its base storey for its storeys. */
export function rasterize(ctx: MassContext, masses: Mass[]): Uint8Array {
  const E = ctx.E, N = E.nx * E.ny, occ = new Uint8Array(N * E.nz);
  for (const m of masses) {
    const z0 = Math.max(0, Math.round(m.z / STOREY_M)), z1 = Math.min(E.nz, z0 + m.storeys);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of m.ring) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    const c0 = Math.max(0, Math.floor((x0 - E.ox) / E.res)), c1 = Math.min(E.nx - 1, Math.floor((x1 - E.ox) / E.res));
    const r0 = Math.max(0, Math.floor((y0 - E.oy) / E.res)), r1 = Math.min(E.ny - 1, Math.floor((y1 - E.oy) / E.res));
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      const p: [number, number] = [E.ox + (c + 0.5) * E.res, E.oy + (r + 0.5) * E.res];
      if (!inside(m.ring, p) || m.holes?.some((h) => inside(h, p))) continue;
      for (let z = z0; z < z1; z++) occ[z * N + r * E.nx + c] = 1;
    }
  }
  return occ;
}

export const precedent: Representation<number[]> = {
  kind: "precedent",
  label: "a precedent from the library",
  random: (rng: Rng) => Array.from({ length: GENES }, () => rng.random()),
  mutate: (g, rng) => {
    const out = jiggle(g, rng, 0.5);
    // now and then another candidate outright
    if (rng.random() < 0.15) out[0] = rng.random();
    return out;
  },
  cross: (a, b, rng) => a.map((v, k) => (rng.random() < 0.5 ? v : b[k])),
  seeds: (ctx) => (ctx.candidates ?? []).map((_, k) => ownGenes(ctx, k)),
  build(g, ctx): Massing {
    const E = ctx.E, land = E.land ?? [];
    if (!ctx.candidates?.length || !land.length) return { occ: new Uint8Array(E.nx * E.ny * E.nz), repairs: [], rejected: "no precedent fits the plot" };
    const { c, n, keep } = pick(ctx, g);
    const lay = layLot(c.p.id, n, land, true), masses: Mass[] = [];
    if (lay) {
      // whole buildings kept in their order while the floor kept stays under the share of the
      // floor passed (error diffusion), so the ones left out are spread evenly
      let passed = 0, held = 0;
      for (const p of lay.pieces) {
        const a = p.a * p.storeys;
        passed += a;
        if (held + a > keep * passed + a / 2) continue;
        held += a;
        masses.push({ ring: p.ring, ...(p.holes.length ? { holes: p.holes } : {}), z: p.z, storeys: p.storeys, block: 0, ...(p.roof ? { roof: p.roof, roofs: p.roofs } : {}) });
      }
    }
    const lot = { masses };
    const occ = rasterize(ctx, lot.masses);
    const repairs = repair(E, occ);
    const source: Source = { precedent: c.p.id, storeys: n, own: c.own, keep, drift: variant(c.p.seed, n).drift, masses: lot.masses };
    return { occ, repairs, rejected: lot.masses.length ? null : `${c.p.name} does not fit at ${n} storeys`, source };
  },
  distance: (a, b) => vecDistance(a, b),
};
