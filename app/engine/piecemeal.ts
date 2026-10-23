// Piecemeal growth (A New Theory of Urban Design; The Oregon Experiment): a site built in
// increments, 2025, 2035 and 2050, each evolving only what it adds (docs/piecemeal.md).
//
//   fabric      what has been built: per cell its use, storeys, coverage and floor area, fixed
//               from the increment that built it. The street network is laid out by the first
//               increment and later increments build along it: in version 2 by its four street
//               genes, in version 3 by its frame (streets, blocks and plots; plan/grow.ts), whose
//               plots each later increment fills with its own uses and heights.
//   increment   designs grow as usual around the fabric (its cells locked to their use, their
//               buildings kept as built). Each then builds new cells where its attractors pull
//               hardest, until the fabric reaches the year's share of the floor-area brief
//               (SHARES). Ground not built yet counts as open ground. The last increment builds
//               everything.
//   conditions  each increment is scored under its year: sea level (AR6 at the gauge), storm
//               depth and hot-season heat rising with AR6 warming (conditionsFor).
//   wholeness   a composite of Alexander's properties with legibility and intelligibility
//               (WHOLENESS). An increment that lowers the fabric's wholeness is penalised by
//               how much it lowers it: a sixth objective, 0 when wholeness holds or rises.
//
// The engine grows, scores and ranks as in a plain run (evolve.ts, with hooks); TS only.
import { ATTRACTOR_GENES, BUILDING, DEFAULT_RANGES, LANDSCAPE, LENGTH, LENGTH_V3, N_ATTRACTORS, STREET_GENES, TARGET_TOLERANCE,
  type Ranges } from "./config.js";
import { quality } from "./elites.js";
import { evolve, frontFamilies, type HistoryRow, type Individual, type LineageNode } from "./evolve.js";
import { evaluate, floorAreaTarget, storageDepth } from "./fitness.js";
import { decode, field, grow } from "./genome.js";
import { measure, METRICS, type Metric, type MetricKey } from "./metrics/index.js";
import { type Frame, frameOf } from "./plan/grow.js";
import { roundTo } from "./num.js";
import { difference } from "./rank.js";
import { seaRise, type SeaScenario } from "./scenarios.js";
import { floorUnder, publicHeat, seaDepth, type ShockSite } from "./shocks.js";
import type { Design, Ground, SiteMeta } from "./types.js";

export const YEARS = [2025, 2035, 2050];
export const SHARES = [0.4, 0.7, 1.0];   // cumulative share of the floor-area brief built by each year

/** Wholeness: Alexander's properties the engine measures with a better end (docs/metrics.md,
 *  the two Alexander groups), with legibility and intelligibility. Each is scaled 0..1 over
 *  its usual range (better end high), and the fourteen are averaged with equal weight. */
export const WHOLENESS: MetricKey[] = [
  "levels_of_scale", "strong_centres", "boundaries", "positive_space", "the_void", "gradients",
  "rhythm_built", "rhythm_skyline", "local_symmetry", "balance", "contrast", "landmarks",
  "legibility", "intelligibility",
];

export function wholenessOf(m: Partial<Record<MetricKey, number>>): number {
  let sum = 0, n = 0;
  for (const k of WHOLENESS) {
    const v = m[k], def = METRICS[k] as Metric;
    if (v === undefined || !Number.isFinite(v)) continue;
    const [lo, hi] = def.range ?? [0, 1];
    let t = (v - lo) / (hi - lo);
    if (def.up === false) t = 1 - t;
    sum += Math.min(Math.max(t, 0), 1); n++;
  }
  return n ? sum / n : 0;
}

/** A design's wholeness (estimate: legibility's integration estimated, as in a run). */
export const wholeness = (d: Design, G: Ground, estimate = true) => wholenessOf(measure(d, G, WHOLENESS, estimate));

// --- conditions -----------------------------------------------------------------------

export type Scenario = "ssp245" | "ssp585";
/** Global surface warming over 1850-1900 (°C), IPCC AR6 WG1 SPM Table SPM.1 best estimates:
 *  2011-2020 observed (1.1), near term 2021-2040 and mid term 2041-2060, at their mid years. */
const WARMING: Record<Scenario, [number, number][]> = {
  ssp245: [[2015, 1.1], [2030, 1.5], [2050, 2.0]],
  ssp585: [[2015, 1.1], [2030, 1.6], [2050, 2.4]],
};
const warmingAt = (s: Scenario, year: number) => {
  const t = WARMING[s];
  for (let k = 1; k < t.length; k++) if (year <= t[k][0]) return t[k - 1][1] + ((t[k][1] - t[k - 1][1]) * (year - t[k - 1][0])) / (t[k][0] - t[k - 1][0]);
  return t[t.length - 1][1];
};
/** Heavy one-day rain grows about 7% per °C of global warming (AR6 WG1 SPM B.2.4). */
export const RAIN_PER_DEGREE = 0.07;

export interface Conditions {
  year: number; scenario: Scenario;
  sea: number | null;   // monsoon surge level that year (m above mean sea level); null inland
  storm: number;        // design storm that year (mm)
  heat: number;         // hot-season rise over today (°C)
  warming: number;      // global warming since 2025 (°C)
}

export function conditionsFor(meta: SiteMeta, year: number, scenario: Scenario = "ssp245"): Conditions {
  const warming = Math.max(0, warmingAt(scenario, year) - warmingAt(scenario, YEARS[0]));
  const surge = meta.sea_levels?.surge_today;
  return {
    year, scenario, warming: roundTo(warming, 2),
    sea: surge === undefined ? null : roundTo(surge + seaRise(scenario as SeaScenario, year), 2),
    storm: roundTo(meta.design_storm_mm * (1 + RAIN_PER_DEGREE * warming), 1),
    heat: roundTo(warming, 2),   // hot extremes over land warm at least as fast as the globe
  };
}

/** Score a design under a year's conditions, in place. Starting from the plain scores:
 *  - storage: the year's storm, with storage the sea floods lost
 *  - heat: the design's warming plus how far public ground runs above today's hottest tenth
 *    in that year's hot season (°C, over all public ground)
 *  - gap: against `target` (m²), with floors under the year's sea lost
 *  Carbon, daylight and human scale don't change. */
export function scoreUnder(d: Design, G: Ground, S: ShockSite, c: Conditions, target: number, depth: Float64Array | null) {
  const s = d.scores ?? evaluate(d, G), a = G.cellArea;
  let held = 0, fa = 0, lost = 0;
  for (let i = 0; i < G.n; i++) {
    const wet = depth ? depth[i] : 0;
    if (!(wet > 0)) held += storageDepth(d, G, i) * a;
    fa += d.floorArea[i];
    if (wet > 0) lost += floorUnder(d, i, wet);
  }
  s.storage = roundTo(held / ((c.storm / 1000) * a * G.n), 3);
  s.heat = roundTo(s.heat + publicHeat(d, G, S, c.heat).excess, 2);
  s.gap = roundTo(Math.abs(fa - lost - target) / target, 3);
  d.scores = s;
}

// --- growing an increment ----------------------------------------------------------------

/** What has been built: per cell. `built` 1 where an increment has built the cell. */
export interface Fabric {
  built: Uint8Array; use: Int8Array; levels: Int32Array; coverage: Float64Array; floorArea: Float64Array;
  streets: number[] | null;   // the first increment's four street genes (version 2)
  network: Int8Array | null;  // and the network they laid out (a class per side)
  frame: Frame | null;        // version 3: the first increment's streets, blocks and plots
}

export const emptyFabric = (G: Ground): Fabric => ({
  built: new Uint8Array(G.n), use: new Int8Array(G.n), levels: new Int32Array(G.n),
  coverage: new Float64Array(G.n), floorArea: new Float64Array(G.n), streets: null, network: null, frame: null,
});

const STREET_AT = N_ATTRACTORS * ATTRACTOR_GENES + 7;   // the four street genes, after the seven site-wide ones

/** A version 2 genome with the fabric's street genes (the network is laid out once). */
export function withStreets(genome: number[], f: Fabric): number[] {
  if (!f.streets || genome.length !== LENGTH) return genome;
  const g = genome.slice();
  for (let k = 0; k < STREET_GENES; k++) g[STREET_AT + k] = f.streets[k];
  return g;
}

/** Grow one increment's design: the genome around the fabric, then new cells built in order of
 *  the genome's attractor pull until the fabric holds `target` m² or covers `land` of the
 *  cells, whichever comes first (all of them when `last`). The land cap keeps an increment
 *  from taking the whole site at low density. Cells left unbuilt are open ground for now
 *  (landscape, flagged fallow). */
export function growIncrement(genome: number[], G: Ground, f: Fabric, target: number, last: boolean,
  ranges: Ranges = DEFAULT_RANGES, land = 1): Design {
  const g = withStreets(genome, f);
  const locked = Int8Array.from(f.use, (u, i) => (f.built[i] ? u : 0));
  const d = grow(g, G, locked, ranges, f.frame);
  d.genome = genome.slice();
  if (f.network) d.street = f.network.slice();
  const fresh = new Uint8Array(G.n), fallow = new Uint8Array(G.n);
  let have = 0, cells = 0;
  const cap = Math.ceil(land * G.n);
  for (let i = 0; i < G.n; i++) if (f.built[i]) {
    cells++;
    d.levels[i] = f.levels[i]; d.coverage[i] = f.coverage[i]; d.floorArea[i] = f.floorArea[i];
    have += f.floorArea[i];
  }
  if (last) {
    for (let i = 0; i < G.n; i++) if (!f.built[i]) fresh[i] = 1;
  } else {
    const pull = field(G, decode(g, G.bounds, ranges).attractors, null);
    const order = [];
    for (let i = 0; i < G.n; i++) if (!f.built[i]) order.push(i);
    order.sort((p, q) => pull[q] - pull[p] || p - q);
    for (const i of order) {
      if (have >= target || cells >= cap) break;
      fresh[i] = 1; cells++;
      if (d.use[i] === BUILDING) have += d.floorArea[i];
    }
    for (const i of order) if (!fresh[i]) {
      fallow[i] = 1; d.use[i] = LANDSCAPE; d.levels[i] = 0; d.coverage[i] = 0; d.floorArea[i] = 0;
    }
  }
  d.fresh = fresh; d.fallow = fallow;
  return d;
}

/** The fabric after building a design. */
export function buildFabric(f: Fabric, d: Design): Fabric {
  const next: Fabric = {
    built: f.built.slice(), use: f.use.slice(), levels: f.levels.slice(), coverage: f.coverage.slice(),
    floorArea: f.floorArea.slice(),
    streets: f.streets ?? (d.genome.length === LENGTH ? d.genome.slice(STREET_AT, STREET_AT + STREET_GENES) : null),
    network: f.network ?? (d.street ? d.street.slice() : null),
    frame: f.frame ?? frameOf(d),
  };
  for (let i = 0; i < d.use.length; i++) if (d.fresh?.[i]) {
    next.built[i] = 1; next.use[i] = d.use[i]; next.levels[i] = d.levels[i]; next.coverage[i] = d.coverage[i]; next.floorArea[i] = d.floorArea[i];
  }
  return next;
}

/** The fabric as a design (unbuilt cells open ground), for its wholeness and scores. */
export function fabricDesign(f: Fabric, G: Ground, genome: number[], ranges: Ranges = DEFAULT_RANGES): Design {
  const d = growIncrement(genome, G, f, 0, false, ranges);
  return d;
}

/** The fabric before each increment, from the genomes built at each (deterministic: the same
 *  genomes on the same ground give the same fabric). fabrics[k] is what increment k grew around;
 *  fabrics[length] is the finished site. */
export function replayFabric(G: Ground, built: number[][], shares: number[] = SHARES, ranges: Ranges = DEFAULT_RANGES): Fabric[] {
  const total = floorAreaTarget(G), out = [emptyFabric(G)];
  built.forEach((genome, k) => {
    const d = growIncrement(genome, G, out[k], total * shares[k], k === shares.length - 1, ranges, shares[k]);
    out.push(buildFabric(out[k], d));
  });
  return out;
}

/** A design of the last increment, grown as it was: around the fabric before it, building
 *  everything left. */
export const growLast = (genome: number[], G: Ground, before: Fabric, ranges: Ranges = DEFAULT_RANGES) =>
  growIncrement(genome, G, before, Infinity, true, ranges);

// --- the run -----------------------------------------------------------------------------

export interface PiecemealOptions {
  generations?: number; pop?: number; seed?: number; scenario?: Scenario; ranges?: Ranges;
  years?: number[]; shares?: number[];
  version?: 2 | 3;                   // genome version bred (2 unless asked)
  foresight?: boolean;               // each increment also scored under the last year's conditions (scoreAhead)
  wholenessObjective?: boolean;      // the wholeness penalty as an objective (default); false for the ablation
  progress?: ((step: number, gen: number, row: HistoryRow) => void) | null;
}

export interface Increment {
  year: number; conditions: Conditions; target: number; share: number;
  history: HistoryRow[]; everyone: number; lineage: LineageNode[]; genomes: number[][];
  pop: Individual[];                 // the increment's final population
  chosen: Individual;                // the design built
  wholeness: { before: number; after: number }; penalty: number;
  seconds: number;
}

/** Foresight: score an increment's design under its own year and under the last year, and keep
 *  the worse of each (storage, heat, gap), so a step is chosen for the site it will stand in by
 *  the end as well as for its own year. Starts from the plain scores, as scoreUnder does. */
export function scoreAhead(d: Design, G: Ground, S: ShockSite, now: Conditions, end: Conditions, target: number,
  depthNow: Float64Array | null, depthEnd: Depth) {
  const plain = { ...(d.scores ?? evaluate(d, G)) };
  d.scores = { ...plain };
  scoreUnder(d, G, S, end, target, depthEnd);
  const later = d.scores;
  d.scores = { ...plain };
  scoreUnder(d, G, S, now, target, depthNow);
  const s = d.scores;
  s.storage = Math.min(s.storage, later.storage);
  s.heat = Math.max(s.heat, later.heat);
  s.gap = Math.max(s.gap, later.gap);
}
type Depth = Float64Array | null;

/** Which design of an increment's front gets built: the best mean of the five scores
 *  (elites.quality), less its wholeness penalty (unless `penalised` is off, the ablation).
 *  Off-brief designs only if nothing is on it. */
export function chooseBuilt(pop: Individual[], penalised = true): Individual {
  const front = pop.filter((i) => i.rank === 1);
  const on = front.filter((i) => i.design.scores!.gap <= TARGET_TOLERANCE);
  const pool = on.length ? on : front.length ? front : pop;
  const value = (i: Individual) => quality(i.design.scores!) - (penalised ? penaltyOf(i.design) : 0);
  return pool.reduce((b, i) => (value(i) > value(b) ? i : b));
}

export const penaltyOf = (d: Design) => -((d.scores as unknown as Record<string, number>).wholeness_kept ?? 0);

/** Grow a site in increments. Each increment is a run of `generations` × `pop` (seed + k). */
export function piecemeal(G: Ground, S: ShockSite, opts: PiecemealOptions = {}): { increments: Increment[]; fabric: Fabric } {
  const { generations = 15, pop = 40, seed = 1, scenario = "ssp245", ranges = DEFAULT_RANGES, years = YEARS, shares = SHARES,
    progress = null, version = 2, foresight = false, wholenessObjective = true } = opts;
  const total = floorAreaTarget(G), increments: Increment[] = [];
  const end = conditionsFor(G.meta, years[years.length - 1], scenario);
  const depthEnd = end.sea !== null && S.coastal ? seaDepth(S, end.sea) : null;
  const blank = Array(version === 3 ? LENGTH_V3 : LENGTH).fill(0.5);
  let fabric = emptyFabric(G), before = wholeness(fabricDesign(fabric, G, blank, ranges), G);
  for (let k = 0; k < years.length; k++) {
    const t0 = Date.now(), year = years[k], c = conditionsFor(G.meta, year, scenario), target = total * shares[k];
    const depth = c.sea !== null && S.coastal ? seaDepth(S, c.sea) : null, last = k === years.length - 1, f = fabric, was = before;
    const free = f.built.reduce((n, v) => n + (v ? 0 : 1), 0);
    const run = evolve(G, {
      search: "nsga3", generations, pop, seed: seed + k, ranges, version,
      progress: progress ? (gen, r) => progress(k, gen, r.history[r.history.length - 1]) : null,
      hooks: {
        grow: (g) => growIncrement(g, G, f, target, last, ranges, shares[k]),
        score: (d) => {
          if (foresight && !last) scoreAhead(d, G, S, c, end, target, depth, depthEnd);
          else scoreUnder(d, G, S, c, target, depth);
          if (d.wholeness === undefined) d.wholeness = wholeness(d, G);
          (d.scores as unknown as Record<string, number>).wholeness_kept = roundTo(-Math.max(0, was - d.wholeness), 4);
        },
        objectives: wholenessObjective ? [["wholeness_kept", true]] : [],
        banded: true,
        // Near-copies are judged on what the increment adds: the cells not built yet.
        copies: (p, q) => {
          let diff = 0;
          for (let i = 0; i < p.use.length; i++) if (!f.built[i] && p.use[i] !== q.use[i]) diff++;
          return diff / Math.max(1, free);
        },
      },
    });
    const chosen = chooseBuilt(run.pop, wholenessObjective);
    fabric = buildFabric(fabric, chosen.design);
    before = chosen.design.wholeness!;
    increments.push({
      year, conditions: c, target, share: shares[k], history: run.history, everyone: run.everyone, lineage: run.lineage,
      genomes: run.genomes, pop: run.pop, chosen, wholeness: { before: was, after: before }, penalty: penaltyOf(chosen.design),
      seconds: (Date.now() - t0) / 1000,
    });
  }
  return { increments, fabric };
}

/** Diversity of a set of designs: mean pairwise share of cells whose use differs, and the
 *  number of families (frontFamilies' threshold). */
export function diversity(designs: Design[]): { spread: number; families: number } {
  let sum = 0, n = 0;
  for (let a = 0; a < designs.length; a++) for (let b = a + 1; b < designs.length; b++) {
    sum += difference(designs[a].use, designs[b].use, 1); n++;
  }
  const fams = frontFamilies({ pop: designs.map((d, k) => ({ name: String(k), design: d, parents: [], rank: 1, crowd: designs.length - k })),
    history: [], everyone: designs.length, lineage: [], genomes: [] });
  return { spread: n ? sum / n : 0, families: fams.length };
}
