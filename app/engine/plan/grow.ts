// Growing a version 3 design: a vector plan from the genome, rasterised onto the grid so the
// scorers read it as they read every design (docs/architecture-v3.md section 3; docs/streets.md).
//
//   1  land use: water and green claim their cells, the rest is building (as before)
//   2  primary streets: the site's cleaned skeleton (ground.ts)
//   3  secondary streets: Otto routes between gates, centres and places (route.ts)
//   4  local streets: the tensor field or, for the organic family, Voronoi edges (field.ts)
//   5  the network noded, checked against the rules and repaired; blocks are its faces;
//      long blocks split and slivers merged, then noded again (network.ts)
//   6  plots by oriented-bounding-box splits (plots.ts)
//   7  rasterised: street share per cell, streets on cell sides, the plot under each cell
//      (raster.ts); heights from the core field as before, one height per plot
//
// Steps 2-7 are the design's frame. Grown with another design's frame (piecemeal growth: the
// streets are laid out once, by the first increment), a design only claims its uses, which
// reclassify the frame's plots, and takes its heights.
import { BUILDING, DEFAULT_RANGES, type Family, PRIMARY_W_M, SECONDARY_W_M, STREET_FRONT_RISE, STREET_SHARE_MAX, type Ranges } from "../config.js";
import { claimUses, decodeV3 } from "../genome.js";
import { roundHalfEven } from "../num.js";
import { makeRng } from "../rng.js";
import { sides } from "../streets.js";
import type { Design, Ground, SettingsV3, VectorPlan } from "../types.js";
import { familyOf, infill } from "./field.js";
import { simplify, type Line, type Pt } from "./geom.js";
import { locator, skeletonLines } from "./ground.js";
import { applyBlockRepairs, blockRepairs, type Edge, type Face, faces, type Flag, foldOntoSkeleton, node, outlineLines, repair,
  type Repair } from "./network.js";
import { type Plot, plotUse, plots as splitPlots } from "./plots.js";
import { type Raster, rasterise } from "./raster.js";
import { route } from "./route.js";

/** Milliseconds per stage, summed over designs, when profiling (scripts/plan-profile.ts). */
export const planTimes: { on: boolean; t: Record<string, number> } = { on: false, t: {} };
const tick = (name: string, t0: number) => { if (planTimes.on) planTimes.t[name] = (planTimes.t[name] ?? 0) + performance.now() - t0; return performance.now(); };

/** A seed for the plan's own random choices (seed points, split jitter), from the genome, so
 *  a genome always grows the same plan. */
function seedOf(genome: number[]): number {
  let h = 2166136261;
  for (const g of genome) { h ^= Math.floor(g * 1e9) >>> 0; h = Math.imul(h, 16777619) >>> 0; }
  return h % 2147483647 || 1;
}

/** A design's streets, blocks and plots, and their raster: what a design grown in another's
 *  frame doesn't lay out again. */
export interface Frame {
  fam: Family; widthOf: (cls: number) => number;
  vx: number[]; vy: number[]; edges: Edge[]; fs: Face[]; ps: Plot[]; ras: Raster;
  repairs: Repair[]; flags: Flag[]; dests: VectorPlan["destinations"];
}
/** Frames beside their designs, not on them, so a design posted between threads stays small. */
const frames = new WeakMap<Design, Frame>();
export const frameOf = (d: Design): Frame | null => frames.get(d) ?? null;

export function growV3(genome: number[], G: Ground, locked: ArrayLike<number> | null = null, ranges: Ranges = DEFAULT_RANGES,
  given: Frame | null = null): Design {
  const { attractors, settings: s } = decodeV3(genome, G.bounds, ranges);
  const n = G.n;
  let t = performance.now();
  const { use, core } = claimUses(G, attractors, s, locked);
  t = tick("claims", t);
  let frame: Frame;
  if (given) {
    // The frame's plots take this design's uses.
    const loc = locator(G);
    frame = { ...given, ps: given.ps.map((p) => ({ ...p, use: plotUse(loc, use, p.ring) })) };
  } else frame = layout(genome, G, use, attractors, s);
  const { fam, widthOf, edges, fs, ps, ras } = frame;

  const share = Float64Array.from(ras.share, (v) => Math.min(v, STREET_SHARE_MAX));
  const sd = sides(G), fronts = new Uint8Array(n);
  for (let sid = 0; sid < ras.sides.length; sid++) {
    if (!ras.sides[sid]) continue;
    fronts[sd.cell[sid]] = 1;
    if (sd.other[sid] >= 0) fronts[sd.other[sid]] = 1;
  }
  const levels = new Int32Array(n), coverage = new Float64Array(n), floorArea = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    if (use[i] !== BUILDING) continue;
    let rise = s.base + (1 - s.base) * Math.pow(core[i], s.peak);
    if (fronts[i]) rise = Math.min(rise * STREET_FRONT_RISE, 1);
    levels[i] = Math.min(Math.max(roundHalfEven(1 + (G.cap[i] - 1) * s.intensity * rise), 1), G.cap[i]);
  }
  // One height per plot: the mean of its building cells (within each cell's cap).
  const sum = new Float64Array(ps.length), cnt = new Int32Array(ps.length);
  for (let i = 0; i < n; i++) if (use[i] === BUILDING && ras.plotOf[i] >= 0) { sum[ras.plotOf[i]] += levels[i]; cnt[ras.plotOf[i]]++; }
  const plotLevels = Array.from(sum, (v, k) => (cnt[k] ? roundHalfEven(v / cnt[k]) : 0));
  let gross = 0;
  for (let i = 0; i < n; i++) {
    if (use[i] !== BUILDING) continue;
    const k = ras.plotOf[i];
    if (k >= 0 && plotLevels[k] > 0) levels[i] = Math.min(Math.max(plotLevels[k], 1), G.cap[i]);
    const open = Math.min(s.coverage, 1 - G.minPerm[i]);
    coverage[i] = Math.max(Math.min(s.coverage * (1 - share[i]), 1 - G.minPerm[i] - share[i]), 0);
    floorArea[i] = G.cellArea * coverage[i] * levels[i];
    gross += G.cellArea * open * levels[i];
  }
  t = tick("heights", t);

  const plan: VectorPlan = {
    family: fam.name,
    streets: edges.filter((e) => e.cls > 0).map((e) => ({ pts: e.pts, cls: e.cls, w: widthOf(e.cls) })),
    vx: frame.vx, vy: frame.vy, edges: edges.map((e) => ({ u: e.u, v: e.v, cls: e.cls })),
    blocks: fs.map((f) => f.ring),
    plots: ps.map((p, k) => ({ ring: p.ring, block: p.block, use: p.use, levels: plotLevels[k], frontage: p.frontage })),
    repairs: frame.repairs, flags: frame.flags,
    destinations: frame.dests,
  };
  const widths: [number, number, number, number] = [0, widthOf(1), widthOf(2), widthOf(3)];
  const d: Design = { genome: Array.from(genome), use, levels, coverage, floorArea, attractors, settings: s, scores: null,
    grossFloorArea: gross, street: ras.sides, streetWidths: widths, plan };
  frames.set(d, frame);
  return d;
}

/** Steps 2-7: the streets, blocks and plots a genome lays out, and their raster. */
function layout(genome: number[], G: Ground, use: Int8Array, attractors: Design["attractors"], s: SettingsV3): Frame {
  const n = G.n, seed = seedOf(genome), rng = makeRng(seed);
  let t = performance.now();
  const fam = familyOf(s.pattern);
  const widthOf = (cls: number) => (cls >= 3 ? PRIMARY_W_M : cls === 2 ? SECONDARY_W_M : cls === 1 ? fam.local_w : 0);
  const centres: Pt[] = attractors.filter((a) => a.kind === "core").map((a) => [a.x, a.y]);
  const repairs: Repair[] = [], flags: Flag[] = [];
  const draft = { genome, use, levels: new Int32Array(n), coverage: new Float64Array(n), floorArea: new Float64Array(n),
    attractors, settings: s, scores: null } as Design;

  // 2-4. Primary, secondary and local streets.
  const sk = skeletonLines(G);
  t = tick("skeleton", t);
  const r = route(G, draft, s, centres);
  t = tick("routes", t);
  const routes = foldOntoSkeleton(r.lines, sk.map((l) => l.points), repairs);
  t = tick("fold", t);
  const laid: Line[] = [...sk.map((l) => l.points), ...routes];
  const local = infill(G, draft, s, laid, routes, centres, seed).lines;
  t = tick("infill", t);

  // 5. The network, repaired; blocks; long blocks split and slivers merged; again.
  // Simplified to half a metre before noding: the splines' dense points cost time, not shape.
  const lean = (pts: Line) => simplify(pts, 0.5);
  const lines = [
    ...sk.map((l) => ({ pts: lean(l.points), cls: 3 })),
    ...routes.map((pts) => ({ pts: lean(pts), cls: 2 })),
    ...local.map((pts) => ({ pts: lean(pts), cls: 1 })),
    ...outlineLines(G),
  ];
  const net = node(lines);
  t = tick("node", t);
  repair(G, draft, net, repairs, flags);
  t = tick("repair", t);
  let fs = faces(G, net.vx, net.vy, net.edges);
  t = tick("faces", t);
  const br = blockRepairs(fs, net.edges, fam.perimeter, repairs, flags);
  if (br.add.length || br.remove.size) {
    applyBlockRepairs(net, br.add, br.remove);
    fs = faces(G, net.vx, net.vy, net.edges);
  }
  const edges: Edge[] = net.edges;
  t = tick("blocks", t);

  // 6. Plots.
  const ps = splitPlots(G, draft, fs, edges, widthOf, fam, s.plot_depth, rng);
  t = tick("plots", t);

  // 7. Onto the grid.
  const ras = rasterise(G, edges, widthOf, ps);
  tick("raster", t);
  return { fam, widthOf, vx: net.vx, vy: net.vy, edges, fs, ps, ras, repairs, flags,
    dests: r.dests.map((x) => ({ kind: x.kind, at: x.at })) };
}
