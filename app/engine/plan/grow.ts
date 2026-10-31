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
//      (raster.ts)
//   8  shared ground before buildings: squares at the important junctions, parks where plots
//      lack one within a walk, frontage types per street (shared.ts); then heights from the core
//      field as before, one height per plot
//   9  programme: what each building plot is for, from the people the homes hold and the
//      ground (programme.ts)
//  10  version 3.1: a building type per lot (a block's plots of one programme): a library
//      precedent for the programme, its coverage and storeys as Spacematrix numbers
//      (blocktypes.ts, precedents.ts); then the site's plot rules hold each plot to its FAR, coverage
//      and height
//
// Steps 2-7 are the design's frame. Grown with another design's frame (piecemeal growth: the
// streets are laid out once, by the first increment), a design only claims its uses, which
// reclassify the frame's plots, and takes its heights.
import { BUILDING, DEFAULT_RANGES, type Family, LANDSCAPE, LENGTH_V3_0, PRIMARY_W_M, SECONDARY_W_M, STREET_FRONT_RISE, STREET_SHARE_MAX, type Ranges } from "../config.js";
import { claimUses, decodeV3 } from "../genome.js";
import { roundHalfEven } from "../num.js";
import { coverageFor, farFor, plotRulesOf, roadStoreys } from "../regs.js";
import { type LotIn, typeBlocks } from "./blocktypes.js";
import { makeRng } from "../rng.js";
import { sides } from "../streets.js";
import type { Design, Ground, SettingsV3, VectorPlan } from "../types.js";
import { familyOf, infill } from "./field.js";
import { area, simplify, type Line, type Pt } from "./geom.js";
import { locator, skeletonLines } from "./ground.js";
import { applyBlockRepairs, blockRepairs, type Edge, type Face, faces, type Flag, foldOntoSkeleton, node, outlineLines, repair,
  type Repair } from "./network.js";
import { type Plot, plotUse, plots as splitPlots } from "./plots.js";
import { type Raster, rasterise } from "./raster.js";
import { route } from "./route.js";
import { placeProgramme, type ProgrammeResult } from "./programme.js";
import { accessOf, FRONTAGES, frontages, reserveShared } from "./shared.js";

/** Milliseconds per stage, summed over designs, when profiling (scripts/plan-profile.ts). */
export const planTimes: { on: boolean; t: Record<string, number> } = { on: false, t: {} };
const tick = (name: string, t0: number) => { if (planTimes.on) planTimes.t[name] = (planTimes.t[name] ?? 0) + performance.now() - t0; return performance.now(); };

/** A seed for the plan's own random choices (seed points, split jitter), from the genome, so
 *  a genome always grows the same plan. Only version 3's numbers count: the building type genes
 *  don't move streets or plots. */
function seedOf(genome: number[]): number {
  let h = 2166136261;
  for (const g of genome.slice(0, LENGTH_V3_0)) { h ^= Math.floor(g * 1e9) >>> 0; h = Math.imul(h, 16777619) >>> 0; }
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
  t = tick("layout", t);
  const { fam, widthOf, edges, fs, ps, ras } = frame;
  // 8. Shared ground first: it claims plots and their cells before any building fills them.
  const loc = locator(G), cellOf = (p: Pt) => loc.cell(p);
  const centres: Pt[] = attractors.filter((a) => a.kind === "core").map((a) => [a.x, a.y]);
  const shared = reserveShared(G, use, frame.vx, frame.vy, edges, fs, ps, ras.plotOf, centres, cellOf, locked);
  t = tick("shared", t);
  // The plot decides a cell's use: building cells in a plot voted landscape or water hold no
  // building (none is drawn there), so they're open ground; never water, which no claim drew.
  // Cells earlier increments built stay.
  for (let i = 0; i < n; i++) {
    const k = ras.plotOf[i];
    if (use[i] === BUILDING && k >= 0 && ps[k].use !== BUILDING && G.canGreen[i] && !(locked && locked[i] > 0)) use[i] = LANDSCAPE;
  }

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
  // 9. Programme before buildings: what each building plot is for (programme.ts).
  const plotFloor = new Float64Array(ps.length);
  for (let i = 0; i < n; i++) if (use[i] === BUILDING && ras.plotOf[i] >= 0) plotFloor[ras.plotOf[i]] += floorArea[i];
  const programme = placeProgramme(G, ps, plotFloor, [...centres, ...shared.squares.map((q) => q.at)], use,
    edges.filter((e) => e.cls > 0));
  t = tick("programme", t);
  // 10. A building type per block (version 3.1): the block's coverage and storeys become its
  // type's, as Spacematrix numbers (blocktypes.ts).
  const types = s.t_courtyard === undefined ? null
    : typeCells(G, use, ps, ras.plotOf, share, coverage, levels, floorArea, s,
      [...centres, ...shared.squares.map((q) => q.at)], programme);
  t = tick("types", t);
  const rules = plotRules(G, use, ps, ras.plotOf, share, plotLevels, levels, coverage, floorArea);
  if (types) {
    // A plot's height: its tallest building cell (towers stand on one).
    plotLevels.fill(0);
    for (let i = 0; i < n; i++) if (use[i] === BUILDING && ras.plotOf[i] >= 0) plotLevels[ras.plotOf[i]] = Math.max(plotLevels[ras.plotOf[i]], levels[i]);
  }
  t = tick("heights", t);

  const streets = edges.filter((e) => e.cls > 0).map((e) => ({ pts: e.pts, cls: e.cls, w: widthOf(e.cls) }));
  const front = frontages(G, use, streets, centres, shared.squares.map((q) => q.at), cellOf);
  shared.access = accessOf(G, { use, floorArea });
  t = tick("frontage and access", t);
  const plan: VectorPlan = {
    family: fam.name,
    streets: streets.map((st, k) => ({ ...st, frontage: FRONTAGES.indexOf(front[k]) })),
    vx: frame.vx, vy: frame.vy, edges: edges.map((e) => ({ u: e.u, v: e.v, cls: e.cls })),
    blocks: fs.map((f) => f.ring),
    plots: ps.map((p, k) => ({ ring: p.ring, block: p.block, use: p.use, levels: plotLevels[k], frontage: p.frontage })),
    repairs: frame.repairs, flags: frame.flags,
    destinations: frame.dests,
    shared,
    ...(rules ? { rules } : {}),
    ...(types ? { types } : {}),
    programme,
  };
  plan.plots.forEach((p, k) => { p.road = ps[k].road; });
  const widths: [number, number, number, number] = [0, widthOf(1), widthOf(2), widthOf(3)];
  const d: Design = { genome: Array.from(genome), use, levels, coverage, floorArea, attractors, settings: s, scores: null,
    grossFloorArea: gross, street: ras.sides, streetWidths: widths, plan };
  frames.set(d, frame);
  return d;
}

/** The site's plot rules (regs.ts), where it has them, applied to a grown design in place:
 *  each building plot keeps to the height its road allows, the coverage its size allows and
 *  the FAR its road allows (storeys come off first, then coverage). Building cells outside
 *  any plot are held to the narrowest road's band. Returns the plan's rule summary. */
function plotRules(G: Ground, use: Int8Array, ps: Plot[], plotOf: Int32Array, share: Float64Array, plotLevels: number[],
  levels: Int32Array, coverage: Float64Array, floorArea: Float64Array): VectorPlan["rules"] | null {
  const R = plotRulesOf(G.meta.id);
  if (!R) return null;
  const n = G.n, cellsOf: number[][] = ps.map(() => []), free: number[] = [];
  for (let i = 0; i < n; i++) if (use[i] === BUILDING) (plotOf[i] >= 0 ? cellsOf[plotOf[i]] : free).push(i);
  let before = 0, after = 0, capacity = 0, plotLand = 0, land = 0, park = 0;
  for (let i = 0; i < n; i++) {
    before += floorArea[i];
    if (!G.canWater[i] || G.canBuild[i] || G.canGreen[i]) land += G.cellArea;
    if (use[i] === LANDSCAPE) park += G.cellArea * (1 - share[i]);
  }
  const hold = (cells: number[], roadM: number, areaM2: number) => {
    if (!cells.length) return;
    const storeys = roadStoreys(R, roadM), cov = coverageFor(R, areaM2), most = farFor(R, roadM) * areaM2;
    let fa = 0;
    for (const i of cells) {
      if (levels[i] > storeys) levels[i] = storeys;
      if (coverage[i] > cov) coverage[i] = cov;
      fa += G.cellArea * coverage[i] * levels[i];
    }
    // Over its FAR: fewer storeys, evenly, then less cover.
    if (fa > most) {
      const f = most / fa;
      fa = 0;
      for (const i of cells) { levels[i] = Math.max(1, Math.floor(levels[i] * f + 1e-9)); fa += G.cellArea * coverage[i] * levels[i]; }
      if (fa > most) for (const i of cells) coverage[i] *= most / fa;
    }
    for (const i of cells) floorArea[i] = G.cellArea * coverage[i] * levels[i];
  };
  ps.forEach((p, k) => {
    // A plot mostly open ground can still hold a few building cells: they keep its rules too.
    if (p.use === BUILDING) {
      const a = Math.abs(area(p.ring));
      plotLand += a; capacity += farFor(R, p.road) * a;
    }
    // The plot's land as its cells see it, so FAR compares like with like.
    let cellLand = 0;
    for (const i of cellsOf[k]) cellLand += G.cellArea * (1 - share[i]);
    hold(cellsOf[k], p.road, cellLand);
    if (cellsOf[k].length) plotLevels[k] = Math.max(...cellsOf[k].map((i) => levels[i]));
  });
  for (const i of free) hold([i], 0, G.cellArea * (1 - share[i]));
  for (let i = 0; i < n; i++) after += floorArea[i];
  return { capacity, plotShare: land ? plotLand / land : 0, parkShare: land ? park / land : 0, trimmed: before - after };
}

/** A building type for each lot (a block's building plots of one programme; blocktypes.ts),
 *  applied to its cells in place: every building cell takes the lot's coverage, and storeys
 *  that keep its floor area (within the cell's cap). Lots no precedent fits keep what the genes
 *  grew. Returns the plan's typing, one entry per lot. */
function typeCells(G: Ground, use: Int8Array, ps: Plot[], plotOf: Int32Array, share: Float64Array,
  coverage: Float64Array, levels: Int32Array, floorArea: Float64Array, s: SettingsV3, nodes: Pt[], programme: ProgrammeResult): NonNullable<VectorPlan["types"]> {
  const R = plotRulesOf(G.meta.id), n = G.n;
  // one lot per block and programme, in plot order
  const lotOf = new Map<string, number>(), lots: LotIn[] = [], cellsOf: number[][] = [], caps: number[][] = [], fa: number[] = [];
  const lotFor = (k: number) => {
    const p = ps[k], prog = Math.max(programme.plot[k] ?? 0, 0), key = `${p.block}:${prog}`;
    let l = lotOf.get(key);
    if (l === undefined) {
      lotOf.set(key, (l = lots.length));
      lots.push({ block: p.block, plots: [], rings: [], programme: prog, land: 0, floor: 0, road: 0, cap: 0, farCap: Infinity });
      cellsOf.push([]); caps.push([]); fa.push(0);
    }
    return l;
  };
  ps.forEach((p, k) => { if (p.use === BUILDING) { const l = lots[lotFor(k)]; l.plots.push(k); l.rings.push(p.ring); } });
  for (let i = 0; i < n; i++) {
    if (use[i] !== BUILDING || plotOf[i] < 0) continue;
    const k = plotOf[i], l = lotFor(k), lot = lots[l], land = G.cellArea * (1 - share[i]);
    cellsOf[l].push(i);
    lot.land += land; lot.floor += floorArea[i]; lot.road = Math.max(lot.road, ps[k].road); caps[l].push(G.cap[i]);
    if (R) fa[l] += farFor(R, ps[k].road) * land;
  }
  lots.forEach((lot, l) => {
    if (!caps[l].length) return;
    const c = caps[l].sort((x, y) => x - y);
    lot.cap = c[c.length >> 1];
    if (R && lot.land > 0) lot.farCap = fa[l] / lot.land;
  });
  const prefs = [s.t_courtyard ?? 0, s.t_perimeter ?? 0, s.t_row ?? 0, s.t_towers ?? 0];
  const typed = typeBlocks(lots, prefs, nodes, R, G.meta.id);
  const out: NonNullable<VectorPlan["types"]> = [];
  typed.forEach((t, l) => {
    if (!t) return;
    out.push(t);
    if (t.type < 0 || t.gsi <= 0) return;
    // the lot's floor area kept: storeys from its FSI over its coverage (no more than its
    // precedent's, whose upper floors can overhang the ground: an arcade), coverage to match
    const st = Math.min(t.storeys, Math.max(1, Math.round(t.fsi / t.gsi)));
    for (const i of cellsOf[l]) {
      levels[i] = Math.max(1, Math.min(st, G.cap[i]));
      coverage[i] = Math.max(Math.min((t.fsi / levels[i]) * (1 - share[i]), 1 - G.minPerm[i] - share[i]), 0);
      floorArea[i] = G.cellArea * coverage[i] * levels[i];
    }
  });
  return out;
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
    ...sk.map((l) => ({ pts: lean(l.points), cls: l.drawn ? l.cls : 3 })),
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
