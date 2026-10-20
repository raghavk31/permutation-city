// Runs evolution off the main thread, so the page stays responsive. Called through Comlink.
// Space syntax (seconds per design) also runs here: the readouts of the designs a run kept,
// the opened design's segments, and exact Rn choice.
import * as Comlink from "comlink";
import type { Ranges } from "./config.js";
import { mapElites, searchOf, type ArchiveInfo, type EliteOptions, type SearchChoice } from "./elites.js";
import { evolve, frontFamilies, type EvolveOptions, type HistoryRow, type LineageNode } from "./evolve.js";
import { grow, stats } from "./genome.js";
import { prepare, withSkeleton } from "./ground.js";
import { measure, METRIC_KEYS, network, SYNTAX_KEYS, type MetricKey, type Metrics } from "./metrics/index.js";
import { landmarks } from "./metrics/network.js";
import { legibilityParts, siteMean, viewpoints } from "./metrics/syntax.js";
import { choiceRn, syntaxOf } from "./syntax.js";
import type { Design, Ground, Scores, SiteExport } from "./types.js";

let G: Ground | null = null;
let lastKept: Design[] = [];   // the designs the last run kept, in the order sent back

export interface FamilyLead { name: string; size: number; genome: number[]; parents: string[] }
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
    lastKept = [];
  },
  evolve({ search: asked, axes, bins, weights, ...options }: RunRequest,
    onProgress?: (gen: number, row: HistoryRow) => void): EvolveResult {
    if (!G) throw new Error("no site loaded");
    const g = G, search = searchOf({ search: asked, objectives: options.objectives });
    const progress = (gen: number, r: { history: HistoryRow[] }) => onProgress?.(gen, r.history[r.history.length - 1]);
    const run = search === "map-elites"
      ? mapElites(g, { ...options, axes, bins, weights, progress })
      : { ...evolve(g, { ...options, search, progress }), archive: null };
    lastKept = run.pop.map((i) => i.design);
    // Send back genomes; the page regrows the designs it draws (fast, and identical).
    return {
      history: run.history,
      everyone: run.everyone,
      frontSize: run.pop.filter((i) => i.rank === 1).length,
      families: frontFamilies(run).map((f) => ({
        name: f.lead.name, size: f.members.length, genome: f.lead.design.genome, parents: f.lead.parents,
      })),
      kept: run.pop.map((i) => {
        const st = stats(i.design, g);
        return {
          name: i.name, genome: i.design.genome, parents: i.parents, rank: i.rank, scores: i.design.scores!,
          floorArea: st.floor_area_ha, levels: st.mean_levels, cell: i.cell, quality: i.quality,
          metrics: measure(i.design, g, NON_SYNTAX) as Metrics,
        };
      }),
      archive: run.archive,
      lineage: run.lineage,
      genomes: Float64Array.from(run.genomes.flat()),
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
