// Evolution, NSGA-II style with the Sem 06 breeding rules (pc/evolve.py).
import { ATTRACTOR_GENES, DEFAULT_RANGES, DUPLICATE, LENGTH, N_ATTRACTORS, TARGET_TOLERANCE, type Ranges } from "./config.js";
import { evaluate, SCORES, SCORE_KEYS } from "./fitness.js";
import { grow, randomGenome } from "./genome.js";
import { makeRng } from "./rng.js";
import { crowding, difference, families, paretoRanks } from "./rank.js";
import type { Design, Ground, Rng, ScoreKey } from "./types.js";

export interface Individual {
  name: string;
  design: Design;
  parents: string[];
  rank: number;
  crowd: number;
}

export type HistoryRow = {
  generation: number; on_brief: number; front_size: number; storm_factor: number;
} & Record<ScoreKey, number | null>;

export interface Run {
  pop: Individual[];
  history: HistoryRow[];
  everyone: number;
}

export interface EvolveOptions {
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

function crossover(a: number[], b: number[], rng: Rng, pA = 0.6): number[] {
  const child = b.slice();
  const nAtt = N_ATTRACTORS * ATTRACTOR_GENES;
  for (let k = 0; k < N_ATTRACTORS; k++) {
    if (rng.random() < pA) for (let g = k * ATTRACTOR_GENES; g < (k + 1) * ATTRACTOR_GENES; g++) child[g] = a[g];
  }
  for (let g = nAtt; g < LENGTH; g++) if (rng.random() < pA) child[g] = a[g];
  return child;
}

function mutate(g: number[], rng: Rng, rate = 2 / LENGTH, sigma = 0.12): number[] {
  return g.map((v) => (rng.random() < rate ? Math.min(Math.max(v + rng.normal(0, sigma), 0), 1) : v));
}

/** Children of two genomes, for breeding by hand. */
export function breed(a: number[], b: number[], rng: Rng, n = 6): number[][] {
  return Array.from({ length: n }, () => mutate(crossover(a, b, rng), rng));
}

function rank(inds: Individual[]) {
  const scores = inds.map((i) => i.design.scores!);
  const r = paretoRanks(scores);
  for (const level of new Set(r)) {
    const idx = [...r.keys()].filter((i) => r[i] === level);
    const c = crowding(scores, idx);
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

function record(run: Run, gen: number, storm: number) {
  const on = run.pop.filter((i) => i.design.scores!.gap <= TARGET_TOLERANCE);
  const h = { generation: gen, on_brief: on.length, front_size: run.pop.filter((i) => i.rank === 1).length,
    storm_factor: storm } as HistoryRow;
  for (const k of SCORE_KEYS) {
    const vals = on.map((i) => i.design.scores![k]);
    h[k] = vals.length ? (SCORES[k][2] ? Math.max(...vals) : Math.min(...vals)) : null;
  }
  run.history.push(h);
}

/** Breed `generations` of `pop` designs (pc.evolve.evolve). */
export function evolve(G: Ground, { generations = 30, pop = 60, seed = 1, immigrants = 0.1, locked = null,
  shock = null, start = null, progress = null, ranges = DEFAULT_RANGES }: EvolveOptions = {}): Run {
  const rng = makeRng(seed);
  let storm = 1.0;
  const make = (g: number[], name: string, parents: string[]): Individual => {
    const design = grow(g, G, locked, ranges);
    evaluate(design, G, storm);
    return { name, design, parents, rank: 0, crowd: 0 };
  };
  const genomes = Array.from({ length: pop }, () => randomGenome(rng));
  (start || []).forEach((g, k) => { genomes[k % pop] = g.slice(); });
  const run: Run = { pop: genomes.map((g, k) => make(g, `G0.${String(k + 1).padStart(2, "0")}`, [])), history: [], everyone: 0 };
  run.everyone = run.pop.length;
  rank(run.pop);
  record(run, 0, storm);
  progress?.(0, run);

  for (let gen = 1; gen <= generations; gen++) {
    if (shock && gen === shock[0]) {
      storm = shock[1];
      for (const i of run.pop) evaluate(i.design, G, storm);
      rank(run.pop);
    }
    const children: Individual[] = [];
    for (let k = 0; k < pop; k++) {
      const name = `G${gen}.${String(k + 1).padStart(2, "0")}`;
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
    rank(both);
    both.sort((a, b) => a.rank - b.rank || b.crowd - a.crowd);
    run.pop = both.slice(0, pop);
    rank(run.pop);
    record(run, gen, storm);
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
