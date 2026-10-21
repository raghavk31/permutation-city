// Runs evolution off the main thread, so the page stays responsive. Called through Comlink.
// Space syntax (seconds per design) also runs here: the readouts of the designs a run kept,
// the opened design's segments, and exact Rn choice.
import * as Comlink from "comlink";
import type { Ranges } from "./config.js";
import { mapElites, searchOf, type ArchiveInfo, type EliteOptions, type SearchChoice } from "./elites.js";
import { evolve, evolveAsync, frontFamilies, type EvolveOptions, type HistoryRow, type LineageNode, type Run } from "./evolve.js";
import { Pool, poolSize } from "./pool.js";
import { grow, stats } from "./genome.js";
import { prepare, withSkeleton } from "./ground.js";
import { measure, METRIC_KEYS, network, SYNTAX_KEYS, type MetricKey, type Metrics } from "./metrics/index.js";
import { landmarks } from "./metrics/network.js";
import { legibilityParts, siteMean, viewpoints } from "./metrics/syntax.js";
import { piecemeal, type Conditions, type Scenario } from "./piecemeal.js";
import { shockSite } from "./shocks.js";
import { choiceRn, syntaxOf } from "./syntax.js";
import type { Design, Ground, Scores, SiteExport } from "./types.js";

let G: Ground | null = null;
let siteNow: SiteExport | null = null;
let lastKept: Design[] = [];   // the designs the last run kept, in the order sent back
let pool: Pool | null = null;  // workers for version 3 runs, made on the first one
let siteOff: number[] = [];

export interface FamilyLead { name: string; size: number; genome: number[]; parents: string[]; design?: Design }  // design: grown whole, for version 3 (so the page needn't regrow it)
/** A design the run kept (the final population, or MAP-Elites' archive), for the Explore plots. */
export interface Kept {
  name: string; genome: number[]; parents: string[]; rank: number; scores: Scores;
  floorArea: number; levels: number; cell?: number; quality?: number;
  metrics: Metrics;  // every form metric, for the readouts (space syntax arrives later: syntaxReadouts)
}
export interface EvolveResult {
  history: HistoryRow[]; everyone: number; frontSize: number; families: FamilyLead[]; kept: Kept[];
  archive: ArchiveInfo | null;
  lineage: LineageNode[];
  genomes: Float64Array;   // every design's genome, LENGTH numbers each, in lineage order
}
export type RunRequest = Omit<EvolveOptions, "progress" | "search"> & Omit<EliteOptions, "progress"> & {
  search?: SearchChoice;
};
/** Piecemeal growth as the page asks for it: the size of each increment, a seed, a scenario. */
export interface PiecemealRequest { generations: number; pop: number; seed: number; scenario: Scenario; ranges: Ranges }
/** One increment, for the page: its year and conditions, and the design it built. */
export interface IncrementSummary {
  year: number; conditions: Conditions; target: number; share: number; everyone: number; seconds: number;
  chosen: { name: string; genome: number[]; scores: Scores; built: number };
  wholeness: { before: number; after: number }; penalty: number;
}
export interface PiecemealResult extends EvolveResult { increments: IncrementSummary[] }
/** A design as the page grew it: its genome, and the locks and gene ranges it was grown under. */
export interface Grown { genome: number[]; locked: number[] | null; ranges: Ranges }

/** One design's space syntax for the page: the site's segments with every measure, the buffer
 *  near the site, the integration core, landmarks and viewpoints, and the means. */
export interface SyntaxDetail {
  site: Float64Array;        // per site segment: x0, y0, x1, y1
  buffer: Float64Array;      // buffer segments within DRAW_M of the site, likewise
  links: number; segments: number;
  values: Record<"nain_r400" | "nain_r800" | "nain_rn" | "nach_r400" | "nach_r800", Float64Array>;
  core: number[]; landmarks: number[]; viewpoints: [number, number][];
  parts: { intelligibility: number; centres: number; landmarks: number; legibility: number };
  means: Record<string, number>;   // NAIN and NACH by radius, and the raw means (depth, choice)
  metrics: Partial<Metrics>;       // the space syntax metrics, exact
}

const DRAW_M = 400;  // how much of the buffer the page draws round the site

const grownOf = (g: Ground, x: Grown) => grow(x.genome, g, x.locked ? Int8Array.from(x.locked) : null, x.ranges);
const NON_SYNTAX = METRIC_KEYS.filter((k) => !SYNTAX_KEYS.includes(k));

const api = {
  /** The site, with any ridges of its street skeleton switched off. */
  setSite(site: SiteExport, off: number[] = []) {
    G = off.length ? withSkeleton(site, prepare(site), new Set(off)) : prepare(site);
    siteNow = site;
    siteOff = off;
    lastKept = [];
    pool?.terminate(); pool = null;
  },
  async evolve({ search: asked, axes, bins, weights, ...options }: RunRequest,
    onProgress?: (gen: number, row: HistoryRow) => void): Promise<EvolveResult> {
    if (!G) throw new Error("no site loaded");
    const g = G, search = searchOf({ search: asked, objectives: options.objectives });
    const progress = (gen: number, r: { history: HistoryRow[] }) => onProgress?.(gen, r.history[r.history.length - 1]);
    // Version 3 designs are grown by the pool, a generation at a time.
    const v3 = options.version === 3 && search !== "map-elites";
    let run: Run & { archive: ArchiveInfo | null; pop: (Run["pop"][number] & { cell?: number; quality?: number })[] };
    if (v3) {
      pool ??= new Pool(poolSize(), siteNow!, siteOff);
      const p = pool, locked = options.locked ? Array.from(options.locked) : null, ranges = options.ranges!;
      const r = await evolveAsync(g, { ...options, search, progress },
        (genomes, storm) => p.grow(genomes, { storm, ranges, locked, objectives: options.objectives ?? [] }));
      run = { ...r, archive: null };
    } else {
      run = search === "map-elites"
        ? mapElites(g, { ...options, axes, bins, weights, progress })
        : { ...evolve(g, { ...options, search, progress }), archive: null };
    }
    lastKept = run.pop.map((i) => i.design);
    const fams = frontFamilies(run);
    const leads = v3 ? await pool!.whole(fams.map((f) => f.lead.design.genome), { storm: 1, ranges: options.ranges!,
      locked: options.locked ? Array.from(options.locked) : null, objectives: options.objectives ?? [] }) : null;
    const metrics = v3
      ? await pool!.measure(run.pop.map((i) => i.design.genome), { ranges: options.ranges!, locked: options.locked ? Array.from(options.locked) : null })
      : run.pop.map((i) => measure(i.design, g, NON_SYNTAX) as Metrics);
    // Send back genomes; the page regrows the designs it draws (fast, and identical).
    return {
      history: run.history,
      everyone: run.everyone,
      frontSize: run.pop.filter((i) => i.rank === 1).length,
      families: fams.map((f, k) => ({
        name: f.lead.name, size: f.members.length, genome: f.lead.design.genome, parents: f.lead.parents,
        ...(leads ? { design: leads[k] } : {}),
      })),
      kept: run.pop.map((i, k) => {
        const st = stats(i.design, g);
        return {
          name: i.name, genome: i.design.genome, parents: i.parents, rank: i.rank, scores: i.design.scores!,
          floorArea: st.floor_area_ha, levels: st.mean_levels, cell: i.cell, quality: i.quality,
          metrics: metrics[k],
        };
      }),
      archive: run.archive,
      lineage: run.lineage,
      genomes: Float64Array.from(run.genomes.flat()),
    };
  },
  /** Grow the site in increments (piecemeal.ts). Returns each increment's summary, and the
   *  last increment as a run (its kept designs, families, history and lineage). */
  piecemeal(o: PiecemealRequest, onProgress?: (step: number, gen: number, row: HistoryRow) => void): PiecemealResult {
    if (!G) throw new Error("no site loaded");
    const g = G, S = shockSite(siteNow!, g);
    const r = piecemeal(g, S, { generations: o.generations, pop: o.pop, seed: o.seed, scenario: o.scenario, ranges: o.ranges,
      progress: onProgress ? (k, gen, row) => onProgress(k, gen, row) : null });
    const last = r.increments[r.increments.length - 1];
    lastKept = last.pop.map((i) => i.design);
    const run = { pop: last.pop, history: last.history, everyone: last.everyone, lineage: last.lineage, genomes: last.genomes };
    return {
      increments: r.increments.map((x) => ({
        year: x.year, conditions: x.conditions, target: x.target, share: x.share, everyone: x.everyone, seconds: x.seconds,
        chosen: { name: x.chosen.name, genome: x.chosen.design.genome, scores: x.chosen.design.scores!,
          built: x.chosen.design.fresh!.reduce((s, v) => s + v, 0) },
        wholeness: x.wholeness, penalty: x.penalty,
      })),
      history: last.history, everyone: r.increments.reduce((s, x) => s + x.everyone, 0),
      frontSize: last.pop.filter((i) => i.rank === 1).length,
      families: frontFamilies(run).map((f) => ({ name: f.lead.name, size: f.members.length, genome: f.lead.design.genome, parents: f.lead.parents })),
      kept: last.pop.map((i) => {
        const st = stats(i.design, g);
        return { name: i.name, genome: i.design.genome, parents: i.parents, rank: i.rank, scores: i.design.scores!,
          floorArea: st.floor_area_ha, levels: st.mean_levels, metrics: measure(i.design, g, NON_SYNTAX) as Metrics };
      }),
      archive: null, lineage: last.lineage, genomes: Float64Array.from(last.genomes.flat()),
    };
  },
  /** The kept designs of a run reloaded from a file, so syntaxKept can read them. */
  keep(items: Grown[]) {
    if (!G) throw new Error("no site loaded");
    const g = G;
    lastKept = items.map((x) => grownOf(g, x));
  },
  /** Space syntax for the k-th design the last run kept. One design per call, so a request for
   *  the opened design can slip in between (the page asks for them in turn). */
  syntaxKept(k: number): Partial<Metrics> | null {
    if (!G || !lastKept[k]) return null;
    return measure(lastKept[k], G, SYNTAX_KEYS);
  },
  /** Some metrics of some designs (estimate: as a run computes them). */
  measureMany(items: Grown[], keys: MetricKey[], estimate = false): Partial<Metrics>[] {
    if (!G) throw new Error("no site loaded");
    const g = G;
    return items.map((x) => measure(grownOf(g, x), g, keys, estimate));
  },
  syntaxDetail(x: Grown): SyntaxDetail {
    if (!G) throw new Error("no site loaded");
    const g = G, d = grownOf(g, x), S = syntaxOf(d, g), N = S.N, net = network(d, g);
    const coords = (s: number) => [N.vx[N.a[s]], N.vy[N.a[s]], N.vx[N.b[s]], N.vy[N.b[s]]];
    const site = new Float64Array(N.site * 4);
    for (let s = 0; s < N.site; s++) site.set(coords(s), 4 * s);
    const [x0, y0, x1, y1] = g.bounds, buf: number[] = [];
    for (let s = N.site; s < N.a.length; s++) {
      const [ax, ay, bx, by] = coords(s);
      const mx = (ax + bx) / 2, my = (ay + by) / 2;
      if (mx > x0 - DRAW_M && mx < x1 + DRAW_M && my > y0 - DRAW_M && my < y1 + DRAW_M) buf.push(ax, ay, bx, by);
    }
    const [r400, r800] = S.local, parts = legibilityParts(net);
    const meanOf = (v: ArrayLike<number> | null) => (v ? siteMean(S, v) : NaN);
    const depth = (m: typeof r400) => meanOf(Float64Array.from(m.td, (td, k) => (m.nc[k] > 0 ? td / m.nc[k] : NaN)));
    return {
      site, buffer: Float64Array.from(buf), links: N.links, segments: N.a.length,
      values: { nain_r400: r400.nain, nain_r800: r800.nain, nain_rn: S.rn.nain, nach_r400: r400.nach!, nach_r800: r800.nach! },
      core: parts.core, landmarks: landmarks(net), viewpoints: viewpoints(S, parts.core),
      parts: { intelligibility: parts.intelligibility, centres: parts.centres, landmarks: parts.landmarks, legibility: parts.legibility },
      means: {
        nain_r400: meanOf(r400.nain), nain_r800: meanOf(r800.nain), nain_rn: meanOf(S.rn.nain),
        nach_r400: meanOf(r400.nach), nach_r800: meanOf(r800.nach),
        depth_r400: depth(r400), depth_r800: depth(r800), depth_rn: depth(S.rn),
        choice_r400: meanOf(r400.ch), choice_r800: meanOf(r800.ch),
      },
      metrics: measure(d, g, SYNTAX_KEYS),
    };
  },
  /** Exact Rn choice for one design (paths from every segment of the network). */
  choiceRn(x: Grown, onProgress?: (done: number, of: number) => void): { nach: Float64Array; mean: number; choice: number } {
    if (!G) throw new Error("no site loaded");
    const g = G, d = grownOf(g, x), S = syntaxOf(d, g), m = choiceRn(d, g, onProgress);
    return { nach: m.nach!, mean: siteMean(S, m.nach!), choice: siteMean(S, m.ch!) };
  },
};

export type EngineWorker = typeof api;
Comlink.expose(api);
