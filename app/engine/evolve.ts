// Evolution, NSGA-II style with the Sem 06 breeding rules (pc/evolve.py). With
// search: "nsga3", survival uses reference directions instead of crowding (niche.ts).
// `objectives` promotes up to two form metrics to objectives beside the five scores.
import { ATTRACTOR_GENES, DEFAULT_RANGES, DUPLICATE, LENGTH, N_ATTRACTORS, TARGET_TOLERANCE, type Ranges } from "./config.js";
import { evaluate } from "./fitness.js";
import { grow, randomGenome } from "./genome.js";
import { roundTo } from "./num.js";
import { makeRng } from "./rng.js";
import { divisionsFor, nicheSelect, referencePoints } from "./niche.js";
import { measure, METRICS, type Metric, type MetricKey } from "./metrics/index.js";
import { crowding, difference, families, paretoRanks, SCORE_OBJECTIVES, type Objective } from "./rank.js";
import type { Design, Ground, Rng, ScoreKey } from "./types.js";

export interface Individual {
  name: string;
  design: Design;
  parents: string[];
  rank: number;
  crowd: number;
  cell?: number;      // MAP-Elites: the archive cell it holds
  quality?: number;   // MAP-Elites: what it holds the cell by
}

export type HistoryRow = {
  generation: number; on_brief: number; front_size: number; storm_factor: number;
  filled?: number; qd?: number;   // MAP-Elites: archive cells filled, and their summed quality
} & Record<ScoreKey, number | null>;

export interface Run {
  pop: Individual[];
  history: HistoryRow[];
  everyone: number;
}

export type Search = "nsga2" | "nsga3";

export interface EvolveOptions {
  search?: Search;
  objectives?: MetricKey[];  // form metrics promoted to objectives, beside the five scores (up to two)
  generations?: number;
  pop?: number;
  seed?: number;
  immigrants?: number;
  locked?: ArrayLike<number> | null;
  shock?: [number, number] | null;   // [generation, storm factor]
  start?: number[][] | null;         // genomes for Generation 0
  ranges?: Ranges;                   // how genes are read (a brief may narrow them)
  progress?: ((gen: number, run: Run) => void) | null;
}

export function crossover(a: number[], b: number[], rng: Rng, pA = 0.6): number[] {
  const child = b.slice();
  const nAtt = N_ATTRACTORS * ATTRACTOR_GENES;
  for (let k = 0; k < N_ATTRACTORS; k++) {
    if (rng.random() < pA) for (let g = k * ATTRACTOR_GENES; g < (k + 1) * ATTRACTOR_GENES; g++) child[g] = a[g];
  }
  for (let g = nAtt; g < LENGTH; g++) if (rng.random() < pA) child[g] = a[g];
  return child;
}

export function mutate(g: number[], rng: Rng, rate = 2 / LENGTH, sigma = 0.12): number[] {
  return g.map((v) => (rng.random() < rate ? Math.min(Math.max(v + rng.normal(0, sigma), 0), 1) : v));
}

/** Children of two genomes, for breeding by hand. */
export function breed(a: number[], b: number[], rng: Rng, n = 6): number[][] {
  return Array.from({ length: n }, () => mutate(crossover(a, b, rng), rng));
}

export function rank(inds: Individual[], obj: Objective[] = SCORE_OBJECTIVES) {
  const scores = inds.map((i) => i.design.scores!);
  const r = paretoRanks(scores, TARGET_TOLERANCE, obj);
  for (const level of new Set(r)) {
    const idx = [...r.keys()].filter((i) => r[i] === level);
    const c = crowding(scores, idx, obj);
    idx.forEach((i, k) => { inds[i].rank = level; inds[i].crowd = c[k]; });
  }
  // Copies: within 5% of a better design → pushed to the back, so families keep their places.
  const order = [...inds.keys()].sort((a, b) => inds[a].rank - inds[b].rank || inds[b].crowd - inds[a].crowd);
  const kept: number[] = [];
  for (const i of order) {
    if (kept.some((j) => difference(inds[i].design.use, inds[j].design.use, DUPLICATE) < DUPLICATE)) inds[i].rank += 1000;
    else kept.push(i);
  }
}

const better = (a: Individual, b: Individual) => (a.rank < b.rank || (a.rank === b.rank && a.crowd > b.crowd) ? a : b);

export function record(run: Run, gen: number, storm: number, obj: Objective[] = SCORE_OBJECTIVES) {
  const on = run.pop.filter((i) => i.design.scores!.gap <= TARGET_TOLERANCE);
  const h = { generation: gen, on_brief: on.length, front_size: run.pop.filter((i) => i.rank === 1).length,
    storm_factor: storm } as HistoryRow;
  for (const [k, up] of obj) {
    const vals = on.map((i) => (i.design.scores as unknown as Record<string, number>)[k]);
    (h as Record<string, number | null>)[k] = vals.length ? (up ? Math.max(...vals) : Math.min(...vals)) : null;
  }
  run.history.push(h);
}

/** Score a design: the five scores, and any promoted metrics under their own keys (rounded
 *  to 6 places, as the scores are rounded, so both engines rank them alike). */
export function score(design: Design, G: Ground, storm: number, objectives: readonly MetricKey[] = []) {
  evaluate(design, G, storm);
  const m = objectives.length ? measure(design, G, objectives, true) : {};  // estimate: see metrics/index.ts
  for (const k of objectives) (design.scores as unknown as Record<string, number>)[k] = roundTo(m[k]!, 6);
}

/** The objectives of a run: the five scores, then any promoted metrics. */
export function objectivesOf(objectives: readonly MetricKey[] = []): Objective[] {
  for (const k of objectives) {
    const up = (METRICS[k] as Metric | undefined)?.up;
    if (up === undefined) throw new Error(`unknown metric '${k}'`);
    if (up === null) throw new Error(`'${k}' has no better end, so it can't be an objective`);
  }
  if (objectives.length > 2) throw new Error("promote at most two metrics");
  return [...SCORE_OBJECTIVES, ...objectives.map((k): Objective => [k, (METRICS[k] as Metric).up!])];
}

/** Grow and score one design. */
export function individual(G: Ground, g: number[], name: string, parents: string[], locked: ArrayLike<number> | null,
  ranges: Ranges, storm: number, objectives: readonly MetricKey[] = []): Individual {
  const design = grow(g, G, locked, ranges);
  score(design, G, storm, objectives);
  return { name, design, parents, rank: 0, crowd: 0 };
}

/** Generation 0: `pop` random genomes, the first ones replaced by `start`. */
export function firstGenomes(rng: Rng, pop: number, start: number[][] | null): number[][] {
  const genomes = Array.from({ length: pop }, () => randomGenome(rng));
  (start || []).forEach((g, k) => { genomes[k % pop] = g.slice(); });
  return genomes;
}

export const childName = (gen: number, k: number) => `G${gen}.${String(k + 1).padStart(2, "0")}`;

/** NSGA-III survival: whole fronts while they fit, then niching on the front that doesn't.
 *  `sorted` is ordered by rank. */
function nicheSurvivors(sorted: Individual[], pop: number, refs: number[][], obj: Objective[]): Individual[] {
  let end = 0;
  while (end < pop) {
    let next = end;
    while (next < sorted.length && sorted[next].rank === sorted[end].rank) next++;
    if (next > pop) break;
    end = next;
  }
  if (end >= pop) return sorted.slice(0, pop);
  let next = end;
  while (next < sorted.length && sorted[next].rank === sorted[end].rank) next++;
  const chosen = sorted.slice(0, end), last = sorted.slice(end, next);
  const picks = nicheSelect(chosen.map((i) => i.design.scores!), last.map((i) => i.design.scores!), pop - end, refs, obj);
  return chosen.concat(picks.map((k) => last[k]));
}

/** Breed `generations` of `pop` designs (pc.evolve.evolve). */
export function evolve(G: Ground, { search = "nsga2", objectives = [], generations = 30, pop = 60, seed = 1,
  immigrants = 0.1, locked = null, shock = null, start = null, progress = null, ranges = DEFAULT_RANGES }: EvolveOptions = {}): Run {
  const rng = makeRng(seed);
  let storm = 1.0;
  const obj = objectivesOf(objectives), m = obj.length;
  const make = (g: number[], name: string, parents: string[]) =>
    individual(G, g, name, parents, locked, ranges, storm, objectives);
  const refs = search === "nsga3" ? referencePoints(m, divisionsFor(m, pop)) : null;
  const genomes = firstGenomes(rng, pop, start);
  const run: Run = { pop: genomes.map((g, k) => make(g, `G0.${String(k + 1).padStart(2, "0")}`, [])), history: [], everyone: 0 };
  run.everyone = run.pop.length;
  rank(run.pop, obj);
  record(run, 0, storm, obj);
  progress?.(0, run);

  for (let gen = 1; gen <= generations; gen++) {
    if (shock && gen === shock[0]) {
      storm = shock[1];
      for (const i of run.pop) score(i.design, G, storm, objectives);
      rank(run.pop, obj);
    }
    const children: Individual[] = [];
    for (let k = 0; k < pop; k++) {
      const name = childName(gen, k);
      if (rng.random() < immigrants) { children.push(make(randomGenome(rng), name, ["immigrant"])); continue; }
      const pick = () => {
        const i = Math.floor(rng.random() * run.pop.length);
        let j = Math.floor(rng.random() * (run.pop.length - 1));
        if (j >= i) j++;
        return better(run.pop[i], run.pop[j]);
      };
      const pa = pick(), pb = pick();
      children.push(make(mutate(crossover(pa.design.genome, pb.design.genome, rng), rng), name, [pa.name, pb.name]));
    }
    run.everyone += children.length;
    const both = run.pop.concat(children);
    rank(both, obj);
    both.sort((a, b) => a.rank - b.rank || b.crowd - a.crowd);
    run.pop = refs ? nicheSurvivors(both, pop, refs, obj) : both.slice(0, pop);
    rank(run.pop, obj);
    record(run, gen, storm, obj);
    progress?.(gen, run);
  }
  return run;
}

/** The final front, grouped into families, one representative each (best first). */
export function frontFamilies(run: Run, threshold = 0.15) {
  const front = run.pop.filter((i) => i.rank === 1).sort((a, b) => b.crowd - a.crowd);
  const fams = families(front.map((i) => i.design.use), [...front.keys()], threshold);
  return fams.map((f) => ({ lead: front[f[0]], members: f.map((k) => front[k]) }));
}
