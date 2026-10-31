// Breeding buildings inside one block's envelopes (docs/massing.md). NSGA-II as at the urban
// scale (rank.ts): Pareto ranks on the four scores among massings within TARGET_TOLERANCE of
// the floor-area target, then the rest by gap; rejected massings last. Binary tournaments,
// the Sem 06 split (60% crossover, 40% copy), mutation on every child, about 10% immigrants.
//
// Only for the block a person picks, never for a whole population of urban designs (brief
// ground rule: 3D is evaluated only for designs the user selects).
import { makeRng } from "../rng.js";
import { crowding, paretoRanks, type Objective } from "../rank.js";
import type { Rng, Scores } from "../types.js";
import type { MassContext, Representation, RepKind } from "./context.js";
import { cppn } from "./cppn.js";
import { field } from "./field.js";
import { MASS_SCORES, MASS_SCORE_KEYS, massScores, type MassScores } from "./scores.js";
import { precedent } from "./precedent.js";
import { typology } from "./typology.js";
import { floorArea, type Massing } from "./voxels.js";

export const REPRESENTATIONS: Record<RepKind, Representation<any>> = { typology, field, cppn, precedent };
export const MASS_OBJECTIVES: Objective[] = MASS_SCORE_KEYS.map((k) => [k, MASS_SCORES[k][2]]);
export const CROSSOVER = 0.6, IMMIGRANTS = 0.1;

export interface MassIndividual {
  name: string; genome: unknown; parents: string[];
  massing: Massing; scores: MassScores; floor: number; rank: number;
}

export interface MassRun {
  kind: RepKind; pop: MassIndividual[]; front: MassIndividual[];
  history: { gen: number; front: number; best: Record<string, number>; valid: number }[];
  everyone: number; ms: number;
}

export interface MassOptions {
  kind: RepKind; population?: number; generations?: number; seed?: number;
  onGeneration?: (gen: number, run: MassRun) => void;
}

const asScores = (s: MassScores) => s as unknown as Scores;

function rankAll(pop: MassIndividual[], objectives: Objective[] = MASS_OBJECTIVES): Float64Array {
  const s = pop.map((p) => (p.massing.rejected ? { ...p.scores, gap: Infinity } : p.scores));
  const r = paretoRanks(s.map(asScores), undefined, objectives);
  pop.forEach((p, i) => { p.rank = r[i]; });
  const crowd = new Float64Array(pop.length);
  const byRank = new Map<number, number[]>();
  pop.forEach((p, i) => { if (!byRank.has(p.rank)) byRank.set(p.rank, []); byRank.get(p.rank)!.push(i); });
  for (const idx of byRank.values()) {
    const d = crowding(s.map(asScores), idx, objectives);
    idx.forEach((i, k) => { crowd[i] = d[k]; });
  }
  return crowd;
}

/** A massing's fingerprint (FNV-1a over its filled voxels). */
export function occHash(occ: Uint8Array): number {
  let h = 2166136261;
  for (let v = 0; v < occ.length; v++) if (occ[v]) { h ^= v; h = Math.imul(h, 16777619); }
  return h >>> 0;
}

const better = (a: MassIndividual, ca: number, b: MassIndividual, cb: number) => a.rank < b.rank || (a.rank === b.rank && ca > cb);

export function evolveMassing(ctx: MassContext, opts: MassOptions): MassRun {
  const t0 = performance.now();
  const rep = REPRESENTATIONS[opts.kind], rng: Rng = makeRng(opts.seed ?? 1);
  const P = opts.population ?? 24, gens = opts.generations ?? 12;
  let count = 0;
  const make = (genome: unknown, parents: string[], gen: number): MassIndividual => {
    const massing = rep.build(genome, ctx);
    const scores = { ...massScores(ctx.E, massing.occ, ctx.where), ...(ctx.extra?.(massing) ?? {}) } as MassScores;
    count++;
    return { name: `M${gen}.${count}`, genome, parents, massing, scores, floor: floorArea(ctx.E, massing.occ), rank: 0 };
  };
  const seeds = [...(ctx.start ?? []), ...(rep.seeds?.(ctx) ?? [])].slice(0, P);
  let pop = [...seeds.map((g) => make(g, [], 0)), ...Array.from({ length: P - seeds.length }, () => make(rep.random(rng, ctx), [], 0))];
  const objs = ctx.objectives ?? MASS_OBJECTIVES;
  let crowd = rankAll(pop, objs);
  const run: MassRun = { kind: opts.kind, pop, front: [], history: [], everyone: count, ms: 0 };
  const record = (gen: number) => {
    const valid = pop.filter((p) => !p.massing.rejected);
    const best: Record<string, number> = {};
    for (const k of MASS_SCORE_KEYS) {
      const vs = valid.map((p) => p.scores[k]);
      best[k] = vs.length ? (MASS_SCORES[k][2] ? Math.max(...vs) : Math.min(...vs)) : NaN;
    }
    best.gap = valid.length ? Math.min(...valid.map((p) => p.scores.gap)) : NaN;
    run.history.push({ gen, front: pop.filter((p) => p.rank === 1).length, best, valid: valid.length });
  };
  record(0);
  for (let gen = 1; gen <= gens; gen++) {
    const pickOne = () => {
      const i = Math.floor(rng.random() * pop.length), j = Math.floor(rng.random() * pop.length);
      return better(pop[i], crowd[i], pop[j], crowd[j]) ? i : j;
    };
    const kids: MassIndividual[] = [];
    const immigrants = Math.round(P * IMMIGRANTS);
    for (let k = 0; k < immigrants; k++) kids.push(make(rep.random(rng, ctx), [], gen));
    while (kids.length < P) {
      const i = pickOne(), j = pickOne();
      const [a, b] = better(pop[i], crowd[i], pop[j], crowd[j]) ? [pop[i], pop[j]] : [pop[j], pop[i]];
      const crossed = rng.random() < CROSSOVER;
      const child = crossed ? rep.cross(a.genome, b.genome, rng, ctx) : a.genome;
      kids.push(make(rep.mutate(child, rng, ctx), crossed ? [a.name, b.name] : [a.name], gen));
    }
    // Survivors: best ranks first, then the least crowded within the last rank that fits; an
    // exact copy of a massing already kept waits until every distinct one has a place, so the
    // population can't fill with one design.
    const all = [...pop, ...kids], c = rankAll(all, objs);
    const order = all.map((_, i) => i).sort((i, j) => all[i].rank - all[j].rank || c[j] - c[i] || i - j);
    const seen = new Set<number>(), first: number[] = [], copies: number[] = [];
    for (const i of order) { const h = occHash(all[i].massing.occ); (seen.has(h) ? copies : first).push(i); seen.add(h); }
    pop = [...first, ...copies].slice(0, P).map((i) => all[i]);
    crowd = rankAll(pop, objs);
    run.pop = pop;
    record(gen);
    opts.onGeneration?.(gen, run);
  }
  run.front = pop.filter((p) => p.rank === 1);
  run.everyone = count;
  run.ms = performance.now() - t0;
  return run;
}
