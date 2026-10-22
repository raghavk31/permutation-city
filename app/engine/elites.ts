// MAP-Elites (pc/elites.py): an archive over two traits of a design, keeping the best design
// per cell (Mouret and Clune 2015). Where NSGA-II looks for the best trade-offs, this looks
// for the best design of every kind: tall and open, low and dense, and so on.
//
// Same breeding and budget as evolve(): Generation 0 is the same random genomes, then each
// generation breeds `pop` children from elites picked at random from the archive.
import { DEFAULT_RANGES, TARGET_TOLERANCE, BUILDING, LANDSCAPE, WATER } from "./config.js";
import { childName, crossover, firstGenomes, individual, mutate, note as noteLineage, rank, record, type EvolveOptions, type Individual,
  type Run, type Search } from "./evolve.js";
import { evaluate, SCORES, SCORE_KEYS } from "./fitness.js";
import { randomGenome } from "./genome.js";
import { measure, METRIC_KEYS, METRICS, type Metric } from "./metrics/index.js";
import { makeRng } from "./rng.js";
import type { Design, Ground, ScoreKey, Scores } from "./types.js";

/** A trait a design can be placed by: label, the range the bins cover (values outside go
 *  in the end bins), and how to read it. Ranges checked against 1,500 random designs on
 *  three sites (`npm run ranges`; docs/experiments/search-comparison.md). */
export interface Descriptor { label: string; range: [number, number]; value: (d: Design, G: Ground) => number; v3?: true }

function count(d: Design, ...codes: number[]) {
  let c = 0;
  for (let i = 0; i < d.use.length; i++) if (codes.includes(d.use[i])) c++;
  return c;
}

function levelStats(d: Design): [number, number] {
  let n = 0, s1 = 0, s2 = 0;
  for (let i = 0; i < d.use.length; i++) {
    if (d.use[i] !== BUILDING) continue;
    n++; s1 += d.levels[i]; s2 += d.levels[i] * d.levels[i];
  }
  if (!n) return [0, 0];
  const mean = s1 / n;
  return [mean, Math.sqrt(Math.max(s2 / n - mean * mean, 0))];
}

const score = (k: ScoreKey) => (d: Design) => d.scores![k];

export const DESCRIPTORS: Record<string, Descriptor> = {
  mean_levels: { label: "average storeys", range: [1, 10], value: (d) => levelStats(d)[0] },
  height_variety: { label: "height variety (spread of storeys)", range: [0, 3.5], value: (d) => levelStats(d)[1] },
  open_share: { label: "open ground (landscape and water)", range: [0.2, 0.8],
    value: (d, G) => count(d, LANDSCAPE, WATER) / G.n },
  green_share: { label: "landscape share", range: [0.1, 0.5], value: (d, G) => count(d, LANDSCAPE) / G.n },
  water_share: { label: "water share", range: [0.05, 0.3], value: (d, G) => count(d, WATER) / G.n },
  storage: { label: "flood storage", range: [0.4, 1.8], value: score("storage") },
  heat: { label: "heat", range: [0.4, 3.0], value: score("heat") },
  daylight: { label: "daylight", range: [0.3, 1.0], value: score("daylight") },
  human: { label: "human scale", range: [0.5, 0.9], value: score("human") },
};
// Version 3 traits: read from the design's vector plan (0 for a design without one; the page
// offers them only for version 3 runs).
const planOf = (d: Design) => d.plan ?? null;
const lineLength = (l: number[][]) => { let s = 0; for (let k = 1; k < l.length; k++) s += Math.hypot(l[k][0] - l[k - 1][0], l[k][1] - l[k - 1][1]); return s; };
const median = (xs: number[]) => { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); return s[s.length >> 1]; };
/** Street orientation order (Boeing 2019, "Urban spatial order", Applied Network Science 4):
 *  the length-weighted entropy H of street bearings in 36 bins of 10°, both directions of
 *  each segment counted, as φ = 1 − ((H − H_g) / (H_max − H_g))², where H_max = ln 36 (every
 *  bearing equally) and H_g = ln 4 (a perfect grid). 1: one grid; 0: no order. */
function orientationOrder(d: Design): number {
  const p = planOf(d);
  if (!p) return 0;
  const bins = new Float64Array(36);
  for (const st of p.streets) for (let k = 1; k < st.pts.length; k++) {
    const [a, b] = [st.pts[k - 1], st.pts[k]], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (l < 1e-6) continue;
    const brg = ((Math.atan2(b[0] - a[0], b[1] - a[1]) * 180) / Math.PI + 360) % 360;
    bins[Math.floor(brg / 10) % 36] += l; bins[Math.floor(((brg + 180) % 360) / 10) % 36] += l;
  }
  const tot = bins.reduce((s, v) => s + v, 0);
  if (!tot) return 0;
  let h = 0;
  for (const v of bins) if (v > 0) h -= (v / tot) * Math.log(v / tot);
  const hMax = Math.log(36), hG = Math.log(4);
  return 1 - ((h - hG) / (hMax - hG)) ** 2;
}
const V3_TRAITS: Record<string, Descriptor> = {
  street_density: { label: "street density (km per km²)", range: [16, 34], v3: true,
    value: (d, G) => { const p = planOf(d); return p ? p.streets.reduce((s, st) => s + lineLength(st.pts), 0) / (G.n * G.cellArea / 1000) : 0; } },
  block_perimeter: { label: "block size (median perimeter, m)", range: [230, 420], v3: true,
    value: (d) => median((planOf(d)?.blocks ?? []).map((b) => lineLength([...b, b[0]]))) },
  plot_frontage: { label: "plot frontage (median, m)", range: [10, 30], v3: true,
    value: (d) => median((planOf(d)?.plots ?? []).filter((p) => p.use === BUILDING).map((p) => p.frontage)) },
  pattern: { label: "street pattern family", range: [0, 1], v3: true,
    value: (d) => (planOf(d) ? (d.settings as { pattern?: number }).pattern ?? 0 : 0) },
  orientation_order: { label: "orientation order (Boeing 2019)", range: [0, 0.45], v3: true, value: orientationOrder },
};
Object.assign(DESCRIPTORS, V3_TRAITS);
// Any form metric can be a trait too (metrics/index.ts), binned over where most designs fall.
for (const k of METRIC_KEYS) {
  const m = METRICS[k] as Metric;
  DESCRIPTORS[k] = { label: m.label, range: m.range ?? [0, 1], value: (d, G) => measure(d, G, [k], true)[k]! };
}
export const DESCRIPTOR_KEYS = Object.keys(DESCRIPTORS);

/** What an elite holds its cell by: designs off the floor-area brief score below zero (the
 *  closer the better); on brief, the mean of the five scores, each scaled 0..1 over this
 *  range with 1 the good end. Weights (a brief's) make it a weighted mean. */
export const QUALITY_RANGE: Record<ScoreKey, [number, number]> = {
  storage: [0.4, 1.8], heat: [0.4, 3.0], carbon: [400, 440], daylight: [0.3, 1.0], human: [0.5, 0.9],
};

export function quality(s: Scores, weights: Partial<Record<ScoreKey, number>> | null = null): number {
  if (s.gap > TARGET_TOLERANCE) return -s.gap;
  const weighted = !!weights && SCORE_KEYS.some((k) => (weights[k] ?? 0) > 0);
  let sum = 0, total = 0;
  for (const k of SCORE_KEYS) {
    const w = weighted ? weights![k] ?? 0 : 1;
    if (!(w > 0)) continue;
    const [lo, hi] = QUALITY_RANGE[k];
    let t = (s[k] - lo) / (hi - lo);
    if (!SCORES[k][2]) t = 1 - t;
    sum += w * Math.min(Math.max(t, 0), 1);
    total += w;
  }
  return sum / total;
}

/** The bin a value falls in, 0..bins-1. */
export function binOf(v: number, [lo, hi]: [number, number], bins: number): number {
  return Math.min(Math.max(Math.floor(((v - lo) / (hi - lo)) * bins), 0), bins - 1);
}

export interface ArchiveInfo { axes: [string, string]; bins: number }

/** A search as people choose it. auto: NSGA-II, or NSGA-III once promoted metrics take the
 *  objectives past five (the brief's rule; docs/experiments/search-comparison.md). */
export type SearchChoice = Search | "map-elites" | "auto";
export const searchOf = (r: { search?: SearchChoice; objectives?: readonly string[] }): Search | "map-elites" =>
  !r.search || r.search === "auto" ? (r.objectives?.length ? "nsga3" : "nsga2") : r.search;

export interface EliteOptions extends Omit<EvolveOptions, "search"> {
  axes?: [string, string];
  bins?: number;
  weights?: Partial<Record<ScoreKey, number>> | null;
}

/** Run MAP-Elites (pc.elites.map_elites). The run's `pop` is the archive's elites, in cell
 *  order (cell = row × bins + column; columns are the first axis), ranked like a population. */
export function mapElites(G: Ground, { generations = 30, pop = 60, seed = 1, immigrants = 0.1, locked = null,
  shock = null, start = null, progress = null, ranges = DEFAULT_RANGES, axes = ["mean_levels", "open_share"], bins = 10,
  weights = null, version = 2 }: EliteOptions = {}): Run & { archive: ArchiveInfo } {
  const [ax, ay] = axes.map((k) => {
    const d = DESCRIPTORS[k];
    if (!d) throw new Error(`unknown trait '${k}'`);
    return d;
  });
  const rng = makeRng(seed);
  let storm = 1.0;
  const archive = new Map<number, Individual>();
  const place = (ind: Individual) => {
    const d = ind.design;
    ind.cell = binOf(ay.value(d, G), ay.range, bins) * bins + binOf(ax.value(d, G), ax.range, bins);
    ind.quality = quality(d.scores!, weights);
  };
  const insert = (ind: Individual) => {
    place(ind);
    const cur = archive.get(ind.cell!);
    if (!cur || ind.quality! > cur.quality!) archive.set(ind.cell!, ind);
  };
  const elites = () => [...archive.keys()].sort((a, b) => a - b).map((c) => archive.get(c)!);
  const make = (g: number[], name: string, parents: string[]) => individual(G, g, name, parents, locked, ranges, storm);
  const run: Run & { archive: ArchiveInfo } = { pop: [], history: [], everyone: 0, lineage: [], genomes: [], archive: { axes, bins } };
  const note = (gen: number) => {
    run.pop = elites();
    rank(run.pop);
    record(run, gen, storm);
    let qd = 0;
    for (const i of run.pop) qd += Math.max(i.quality!, 0);
    Object.assign(run.history[run.history.length - 1], { filled: run.pop.length, qd });
    progress?.(gen, run);
  };

  const nStart = Math.min(start?.length ?? 0, pop);
  firstGenomes(rng, pop, start, version).forEach((g, k) => {
    const i = make(g, childName(0, k), []);
    insert(i); noteLineage(run, i, 0, k < nStart ? "start" : "first");
  });
  run.everyone = pop;
  note(0);

  for (let gen = 1; gen <= generations; gen++) {
    if (shock && gen === shock[0]) {
      storm = shock[1];
      const all = elites();
      archive.clear();
      for (const i of all) { evaluate(i.design, G, storm); insert(i); }
    }
    const parents = elites(), n = parents.length;
    const children: Individual[] = [];
    for (let k = 0; k < pop; k++) {
      const name = childName(gen, k);
      if (rng.random() < immigrants) {
        const c = make(randomGenome(rng, version), name, ["immigrant"]);
        children.push(c); noteLineage(run, c, gen, "immigrant");
        continue;
      }
      const i = Math.floor(rng.random() * n);
      let j = Math.floor(rng.random() * (n - 1));
      if (n < 2) j = i; else if (j >= i) j++;
      const pa = parents[i], pb = parents[j];
      const x = crossover(pa.design.genome, pb.design.genome, rng);
      const c = make(mutate(x, rng), name, [pa.name, pb.name]);
      children.push(c); noteLineage(run, c, gen, "bred", { a: pa.design.genome, b: pb.design.genome, x });
    }
    run.everyone += children.length;
    for (const c of children) insert(c);
    note(gen);
  }
  return run;
}
