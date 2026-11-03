// Shared ground before buildings (built form brief section 4; docs/built-form.md step 3).
//
// After the streets, blocks and plots are laid out and before buildings fill the plots, the
// design reserves its shared ground, in the brief's order:
//
//   1  the lake buffer, tank edges, valley corridors and drainage lines: the rules already keep
//      these open (forbidden ground off the design ground, constrained cells that only take
//      water, wetland or landscape), so they are counted, not claimed again
//   2  water first (part C, architecture-v3 section 14.4): where the rain of GATHER_MIN_M2 or
//      more of the design's ground runs through building land before reaching open ground,
//      the plots nearest that point become a water space. The storms come in a chain: each lot's
//      ponds hold the 10-year storm (lotnature.ts: 5-10% of what drains to it, 0.6 m deep), so
//      the public space holds what the 100-year storm brings beyond it, filling when the lots
//      overflow, up to the site's design storm: a basin where much ground gathers, else a lowered field
//   3  a square at each important junction: where two or more secondary or primary streets
//      meet, the busiest first, SQUARE_SPACING_M apart; the plot on the corner becomes it, a
//      water square where rain gathers there, else a square under shade
//   4  a hierarchy of open space (OPEN_LEVELS): where a building plot has no park of a level's
//      size within its walk, the block that would serve the most such plots becomes one, until
//      every plot is served or SHARED_MAX of the land is shared; then, under a site's plot rules,
//      blocks until the parks reach the rules' least share (RMP 2015 6.1 c in Bengaluru: 15%).
//      Each park takes the family its land suits: a basin where rain gathers, else a field
//   5  a doorstep space within DOOR_WALK_M of every building plot: small plots, the one that
//      brings the most plots within the walk first
//
// After programme (grow.ts), schools take their playfields across a local street (pairFields).
// Every space is recorded with its rule, its family (typology/types.ts OPEN_FAMILIES), the storm
// it fills at and the water it holds (plan.shared.spaces).
//
// Shared ground is a layer with its own outline (plan.shared): buildings may front it but not
// occupy it. Each street segment gets a frontage type (active, residential, green edge, lake
// edge) that buildings will read when they are placed, and the plan reports the share of its
// floor area within a walk of each level of open space (the access score).
import { BUILDING, LANDSCAPE, WATER } from "../config.js";
import { DESIGN_RAIN_MM } from "../massing/plotnature.js";
import { plotRulesOf } from "../regs.js";
import { LIBRARY } from "../typology/library.js";
import { measureShape, shapeOf } from "../typology/openshape.js";
import type { OpenFamily } from "../typology/types.js";
import type { Design, Ground, VectorPlan } from "../types.js";
import { area, centroid, dist, inside, type Line, type Pt } from "./geom.js";
import type { Edge, Face } from "./network.js";
import type { Plot } from "./plots.js";

/** The levels of open space, smallest first (corpus: urdpfi-open-space-hierarchy). min_m2 from
 *  URDPFI 2015 as NIUA reproduces it (secondary); walk_m from Fields in Trust 2015 (assumed for
 *  Indian sites). The doorstep level is not reserved as cells (a doorstep space is smaller than
 *  a cell): rule 5 places it as plots. */
export const OPEN_LEVELS = [
  { key: "doorstep", label: "doorstep green", min_m2: 125, walk_m: 100, reserve: false },
  { key: "housing", label: "housing area park", min_m2: 5000, walk_m: 400, reserve: true },
  { key: "neighbourhood", label: "neighbourhood park", min_m2: 10000, walk_m: 1000, reserve: true },
] as const;
export type OpenLevel = (typeof OPEN_LEVELS)[number]["key"];
/** Walking distance over straight-line distance: the middle of SP:118 3.2.1.4's route
 *  directness of 1.1-1.5 for a walkable network. */
export const DETOUR = 1.3;
export const SHARED_MAX = 0.25;          // at most this share of the land claimed as parks and squares (design)
export const SQUARE_SPACING_M = 300;     // squares at least this far apart (design)
export const SQUARE_PLOT_M2: [number, number] = [150, 1200]; // a square is a corner plot of this size: about 12-35 m across (Alexander 61: 15-20 m; assumed)
export const ACTIVE_M = 250;             // a secondary or primary street within this of a centre or square is active (design proxy for integration)
export const LAKE_EDGE_M = 40;           // a street this close to water or the lake buffer is a lake edge

// Water first (rule 2). Thresholds assumed, to be checked against each site's drainage.
/** A water space where at least this much of the design's ground drains through building land. */
export const GATHER_MIN_M2 = 30000;
/** From this much ground a basin (deeper); below it a lowered field. */
export const BASIN_GATHER_M2 = 150000;
/** Storm depth (mm): what each lot's ponds hold (plotnature.ts's design storm, near Bengaluru's
 *  10-year), and the big storm the public ground holds the rest of: the site's own design storm
 *  (site.yaml: a heavy monsoon day; the storage score's storm), else 1.6 times the lots' (assumed:
 *  Gumbel ratios of Indian daily rain's 100-year to 10-year are about 1.4-1.7). */
export const STORM_MM = { lots: DESIGN_RAIN_MM, big: Math.round(DESIGN_RAIN_MM * 1.6) };
export const bigStorm = (G: Pick<Ground, "meta">) => Math.max(G.meta.design_storm_mm || STORM_MM.big, STORM_MM.lots);
/** Share of the gathered rain that runs off built ground (assumed: between roofs 0.9 and open ground 0.4). */
export const GATHER_RUNOFF = 0.7;
/** Water depth each holds when full (m): a basin's (assumed, inside openshape.ts's 0.3-3 m), a
 *  field's 30 cm (Japan's schoolyard guide, Sapporo). */
export const HOLD_M = { basin: 0.9, field: 0.3 } as const;
export const WATER_SPACES_MAX = 16;
/** A square is a water square where this much ground drains through it (assumed). */
export const SQUARE_WET_M2 = 10000;
// Every door (rule 5).
export const DOOR_WALK_M = 100;          // OPEN_LEVELS doorstep's walk
export const DOOR_PLOT_M2: [number, number] = [125, 1500]; // DCPR's least garden to a small square (the top assumed)

/** A public space the rules placed: why (its rule), its family, its plots (and block), where,
 *  how big (m²), the storm it starts to fill at (years), the water it holds (m³) and the ground
 *  draining to it (m²). */
export interface PublicSpace {
  rule: "water" | "square" | "park" | "doorstep" | "field";
  family: OpenFamily;
  plots: number[];
  block?: number;
  at: Pt;
  area: number;
  fillsAt?: number;
  storage: number;
  gather?: number;
  /** A playfield across the street: the school plot it serves. */
  of?: number;
  /** Water it was placed to hold (m³). */
  need?: number;
  /** Its shape in its family's genes (plan/publicform.ts), the library precedent it is nearest,
   *  and what the shape gives (typology/openshape.ts measureShape). */
  shape?: Record<string, number>;
  like?: string;
  measures?: { storage: number; wetUse: number; seats: number; shade: number; enclosure: number };
}

export type Frontage = "active" | "residential" | "green" | "lake";
export const FRONTAGES: Frontage[] = ["active", "residential", "green", "lake"];

export interface SharedResult {
  squares: { at: Pt; plot: number }[];
  parks: { level: OpenLevel; block: number; area: number }[];
  /** Every space the rules placed, with its family and water (part C). */
  spaces: PublicSpace[];
  /** Rain the water spaces were sized for (m³), what they hold (m³), and the design ground whose
   *  rain still leaves the site over building land without meeting open ground (m²). */
  water: { need: number; held: number; unheld: number };
  /** Per open-space level, the share of the design's floor area within its walk. */
  access: Record<OpenLevel, number>;
  /** Share of the land that is shared ground (landscape in the design, the open land beyond it). */
  share: number;
}

/** The open land beyond the design ground, once per ground: its clusters (points within a
 *  cell spacing and a half), each cluster's area, and the clusters beside each design cell
 *  (whatever its use: where its people step onto it). */
interface Outside { clusters: number; area: Float64Array; at: Int32Array[] }
const outsideCache = new WeakMap<Ground, Outside>();
function outside(G: Ground): Outside {
  const hit = outsideCache.get(G);
  if (hit) return hit;
  const open = G.openLand ?? [], m = open.length, n = G.n;
  const R = G.grid.spacing * 1.5, hash = new Map<string, number[]>();
  for (let j = 0; j < m; j++) {
    const h = `${Math.floor(open[j][0] / R)},${Math.floor(open[j][1] / R)}`, l = hash.get(h);
    if (l) l.push(j); else hash.set(h, [j]);
  }
  const near = (x: number, y: number) => {
    const out: number[] = [], cx = Math.floor(x / R), cy = Math.floor(y / R);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      for (const j of hash.get(`${cx + dx},${cy + dy}`) ?? []) if ((open[j][0] - x) ** 2 + (open[j][1] - y) ** 2 <= R * R) out.push(j);
    }
    return out;
  };
  const parent = Int32Array.from({ length: m }, (_, k) => k);
  const find = (a: number): number => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  for (let j = 0; j < m; j++) for (const k of near(open[j][0], open[j][1])) { const ra = find(j), rb = find(k); if (ra !== rb) parent[ra] = rb; }
  const id = new Int32Array(m).fill(-1), roots = new Map<number, number>();
  for (let j = 0; j < m; j++) { const r = find(j); if (!roots.has(r)) roots.set(r, roots.size); id[j] = roots.get(r)!; }
  const area = new Float64Array(roots.size);
  for (let j = 0; j < m; j++) area[id[j]] += G.cellArea;
  const at: Int32Array[] = [];
  for (let i = 0; i < n; i++) at.push(Int32Array.from(new Set(near(G.x[i], G.y[i]).map((j) => id[j]))));
  const o = { clusters: roots.size, area, at };
  outsideCache.set(G, o);
  return o;
}

/** Each patch of open ground (the design's landscape cells, joined to the open land beside
 *  them) and its area: root per design cell (n + cluster for the open land), size per root;
 *  outsideAt: the open-land clusters beside each cell (their roots at n + cluster). */
function patches(G: Ground, use: ArrayLike<number>, credit: ArrayLike<number> | null = null): { root: Int32Array; size: Float64Array; outsideAt: Int32Array[]; n: number } {
  const n = G.n, O = outside(G), N = n + O.clusters;
  const parent = Int32Array.from({ length: N }, (_, k) => k);
  const find = (a: number): number => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  const join = (a: number, b: number) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; };
  for (let i = 0; i < n; i++) {
    if (use[i] !== LANDSCAPE) continue;
    for (let a = 0; a < G.deg; a++) { const j = G.nbr[i * G.deg + a]; if (j >= 0 && use[j] === LANDSCAPE) join(i, j); }
    for (const c of O.at[i]) join(i, n + c);
  }
  const root = new Int32Array(N), size = new Float64Array(N);
  for (let k = 0; k < N; k++) {
    root[k] = find(k);
    size[root[k]] += k >= n ? O.area[k - n] : use[k] === LANDSCAPE ? (credit ? credit[k] : G.cellArea) : 0;
  }
  return { root, size, outsideAt: O.at, n };
}

/** Walking distance (m, as straight-line steps times DETOUR) from each design cell to the
 *  nearest open ground in a patch of at least `min` m². */
function walkTo(G: Ground, use: ArrayLike<number>, P: ReturnType<typeof patches>, min: number): Float64Array {
  const n = G.n, d = new Float64Array(n).fill(Infinity), q: number[] = [];
  for (let i = 0; i < n; i++) {
    const own = use[i] === LANDSCAPE && P.size[P.root[i]] >= min;
    let beside = false;
    for (const c of P.outsideAt[i]) if (P.size[P.root[P.n + c]] >= min) { beside = true; break; }
    if (own || beside) { d[i] = 0; q.push(i); }
  }
  // breadth first over the cells: every step is one cell spacing
  const step = G.grid.spacing * DETOUR;
  for (let h = 0; h < q.length; h++) {
    const i = q[h];
    for (let a = 0; a < G.deg; a++) {
      const j = G.nbr[i * G.deg + a];
      if (j >= 0 && d[j] === Infinity) { d[j] = d[i] + step; q.push(j); }
    }
  }
  return d;
}

/** The design ground (m²) whose rain runs through each cell along the landform's flow
 *  directions before it reaches open ground or water (where it stops, and is counted). */
export function gathered(G: Ground, use: ArrayLike<number>): Float64Array {
  const n = G.n, acc = new Float64Array(n), down = G.down;
  if (!down) return acc;
  for (let i = 0; i < n; i++) {
    if (use[i] === LANDSCAPE || use[i] === WATER) continue;
    for (let j = i, steps = 0; j >= 0 && steps < 4000; steps++) {
      acc[j] += G.cellArea;
      if (use[j] === LANDSCAPE || use[j] === WATER) break;
      j = down[j];
    }
  }
  return acc;
}

/** Water a water square holds per m² of its land, in the library water square's shape. */
let wetPerM2 = -1;
function wetSquare(): number {
  if (wetPerM2 < 0) {
    const p = LIBRARY.find((x) => x.id === "water-square"), s = p && shapeOf(p);
    wetPerM2 = s ? measureShape("stepped", { ...s, wet: 1 }, 1000).storage / 1000 : 0.5;
  }
  return wetPerM2;
}

/** Reserve the design's shared ground, in place: `use` (per cell) and the plots' uses. */
export function reserveShared(G: Ground, use: Int8Array, vx: number[], vy: number[], edges: Edge[], fs: Face[], ps: Plot[],
  plotOf: Int32Array, centres: Pt[], cellOf: (p: Pt) => number, locked: ArrayLike<number> | null = null): SharedResult {
  const n = G.n;
  let land = 0;
  for (let i = 0; i < n; i++) land += G.cellArea;
  const budget = SHARED_MAX * land;
  let claimed = 0;
  const cellsOfPlot = new Map<number, number[]>();
  for (let i = 0; i < n; i++) if (plotOf[i] >= 0) { const l = cellsOfPlot.get(plotOf[i]); if (l) l.push(i); else cellsOfPlot.set(plotOf[i], [i]); }
  const credit = new Float64Array(n).fill(G.cellArea);
  // what earlier increments built (piecemeal growth) stays as it is
  const fixed = (i: number) => !!locked && locked[i] > 0;
  const plotFixed = (k: number) => (cellsOfPlot.get(k) ?? []).some(fixed);
  const toGreen = (k: number) => {
    if (plotFixed(k)) return;
    ps[k].use = LANDSCAPE;
    for (const i of cellsOfPlot.get(k) ?? []) if (G.canGreen[i] && use[i] === BUILDING) { use[i] = LANDSCAPE; claimed += G.cellArea; }
  };

  const plotC = ps.map((p) => centroid(p.ring)), plotA = ps.map((p) => Math.abs(area(p.ring)));
  const blockPlots = fs.map(() => [] as number[]), blockC = fs.map((f) => centroid(f.ring));
  ps.forEach((p, k) => { if (p.block >= 0 && p.block < fs.length) blockPlots[p.block].push(k); });
  const spaces: PublicSpace[] = [];
  const water = { need: 0, held: 0, unheld: 0 };

  // 2. Water first: where the most rain gathers on building land, the plots of its block nearest
  // that point, until they hold the storm their family is built for.
  const passed = new Set<number>();
  for (let round = 0; round < WATER_SPACES_MAX; round++) {
    const acc = gathered(G, use);
    let best = -1;
    for (let i = 0; i < n; i++) {
      const k = plotOf[i];
      if (use[i] !== BUILDING || k < 0 || ps[k].use !== BUILDING || plotFixed(k) || passed.has(i) || acc[i] < GATHER_MIN_M2) continue;
      if (best < 0 || acc[i] > acc[best]) best = i;
    }
    if (best < 0) break;
    passed.add(best);
    const family = acc[best] >= BASIN_GATHER_M2 ? "basin" : "field";
    const V = ((bigStorm(G) - STORM_MM.lots) / 1000) * GATHER_RUNOFF * acc[best], want = V / HOLD_M[family];
    const at: Pt = [G.x[best], G.y[best]], k0 = plotOf[best], b0 = ps[k0].block;
    const rest = b0 >= 0 && b0 < fs.length ? blockPlots[b0] : [];
    const order = [k0, ...rest.filter((k) => k !== k0 && ps[k].use === BUILDING && !plotFixed(k)).sort((a, b) => dist(plotC[a], at) - dist(plotC[b], at))];
    const taken: number[] = [];
    let got = 0;
    for (const k of order) {
      if (got >= want || claimed + plotA[k] > budget) break;
      toGreen(k); taken.push(k); got += plotA[k];
    }
    if (!taken.length) continue;
    const held = Math.min(V, got * HOLD_M[family]);
    water.need += V; water.held += held;
    spaces.push({ rule: "water", family, plots: taken, block: b0, at, area: Math.round(got), fillsAt: 10, storage: Math.round(held), gather: Math.round(acc[best]), need: Math.round(V) });
  }
  const wet = gathered(G, use);

  // 3. Squares at the important junctions.
  const deg = new Map<number, number[]>();
  edges.forEach((e, k) => { if (e.cls >= 2) for (const v of [e.u, e.v]) { const l = deg.get(v); if (l) l.push(k); else deg.set(v, [k]); } });
  const nodes = [...deg.entries()].filter(([, ks]) => ks.length >= 2)
    .map(([v, ks]) => {
      const at: Pt = [vx[v], vy[v]];
      const near = centres.some((c) => dist(c, at) <= ACTIVE_M) ? 2 : 0;
      return { at, weight: ks.reduce((s, k) => s + edges[k].cls, 0) + near + (ks.length >= 3 ? 1 : 0) };
    })
    .sort((a, b) => b.weight - a.weight || a.at[0] - b.at[0] || a.at[1] - b.at[1]);
  const near = bucket(plotC, 40);
  const squares: SharedResult["squares"] = [];
  for (const nd of nodes) {
    if (squares.some((s) => dist(s.at, nd.at) < SQUARE_SPACING_M)) continue;
    let best = -1, bd = 40;
    for (const k of near(nd.at)) {
      if (ps[k].use !== BUILDING || plotA[k] < SQUARE_PLOT_M2[0] || plotA[k] > SQUARE_PLOT_M2[1] || plotFixed(k)) continue;
      const dd = dist(plotC[k], nd.at);
      if (dd < bd) { bd = dd; best = k; }
    }
    if (best < 0 || claimed + plotA[best] > budget) continue;
    toGreen(best);
    squares.push({ at: nd.at, plot: best });
    const c = cellOf(plotC[best]), gather = c >= 0 ? wet[c] : 0, wetOne = gather >= SQUARE_WET_M2;
    const V = wetOne ? ((bigStorm(G) - STORM_MM.lots) / 1000) * GATHER_RUNOFF * gather : 0;
    spaces.push({ rule: "square", family: wetOne ? "stepped" : "canopy", plots: [best], at: nd.at, area: Math.round(plotA[best]),
      ...(wetOne ? { fillsAt: 10, gather: Math.round(gather), need: Math.round(V) } : {}), storage: wetOne ? Math.round(Math.min(V, plotA[best] * wetSquare())) : 0 });
  }

  // 4. The hierarchy: blocks become parks where plots lack one within their walk.
  const parks: SharedResult["parks"] = [];
  /** A block becomes a park: its plots, and every cell whose centre is in it, so the park's
   *  cells add up to its area. False (nothing changed) where no cell can take it: a block too
   *  narrow for any cell centre would be a park the walk can't see. */
  const convert = (b: number, level: OpenLevel): boolean => {
    const ring = fs[b].ring;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of ring) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    const mine: number[] = [];
    for (let i = 0; i < n; i++) {
      if (G.x[i] < x0 || G.x[i] > x1 || G.y[i] < y0 || G.y[i] > y1 || !inside(ring, [G.x[i], G.y[i]])) continue;
      if (use[i] === LANDSCAPE || (use[i] === BUILDING && G.canGreen[i]) || fixed(i)) mine.push(i);
    }
    if (!mine.length || mine.some(fixed) || blockPlots[b].some(plotFixed)) return false;
    for (const k of blockPlots[b]) toGreen(k);
    for (const i of mine) if (use[i] === BUILDING) { use[i] = LANDSCAPE; claimed += G.cellArea; }
    // the park's cells carry its area between them (cells are coarser than blocks)
    for (const i of mine) credit[i] = fs[b].area / mine.length;
    parks.push({ level, block: b, area: Math.round(fs[b].area) });
    // its family by its land: a basin where rain gathers in it (holding the 100-year storm's
    // excess over the lots' 10-year, up to its depth over half its land), else a field
    let gather = 0;
    for (const i of mine) gather = Math.max(gather, wet[i]);
    if (gather >= GATHER_MIN_M2) {
      const V = ((bigStorm(G) - STORM_MM.lots) / 1000) * GATHER_RUNOFF * gather, held = Math.min(V, 0.5 * fs[b].area * HOLD_M.basin);
      water.need += V; water.held += held;
      spaces.push({ rule: "park", family: "basin", plots: blockPlots[b], block: b, at: blockC[b], area: Math.round(fs[b].area), fillsAt: 10, storage: Math.round(held), gather: Math.round(gather), need: Math.round(V) });
    } else spaces.push({ rule: "park", family: "field", plots: blockPlots[b], block: b, at: blockC[b], area: Math.round(fs[b].area), storage: 0 });
    return true;
  };
  for (const L of OPEN_LEVELS) {
    if (!L.reserve) continue;
    const reach = L.walk_m / DETOUR;
    // plot land a block would serve, among the plots lacking this level: its score per park
    // land, so small parks that serve many go first. Scores only fall as plots are served, so
    // a stale score bounds the true one (lazy greedy).
    let lacking = new Uint8Array(ps.length);
    const update = () => {
      const d = walkTo(G, use, patches(G, use, credit), L.min_m2);
      lacking = new Uint8Array(ps.length);
      let any = false;
      // (a plot whose centre is on no design cell, at the ground's ragged edge, isn't counted:
      // no park could reach it in the walk's own terms)
      ps.forEach((p, k) => { if (p.use !== BUILDING) return; const c = cellOf(plotC[k]); if (c >= 0 && d[c] > L.walk_m) { lacking[k] = 1; any = true; } });
      return any;
    };
    const within = bucket(plotC, reach);
    const scoreOf = (b: number) => {
      const c = blockC[b];
      let s = 0;
      for (const k of within(c)) if (lacking[k] && ps[k].block !== b && (plotC[k][0] - c[0]) ** 2 + (plotC[k][1] - c[1]) ** 2 <= reach * reach) s += plotA[k];
      return s / fs[b].area;
    };
    if (!update()) continue;
    const heap = fs.map((f, b) => b).filter((b) => fs[b].area >= L.min_m2 && blockPlots[b].some((k) => ps[k].use === BUILDING))
      .map((b) => ({ b, s: scoreOf(b) })).filter((x) => x.s > 0).sort((x, y) => y.s - x.s || x.b - y.b);
    for (let round = 0; round < 64 && heap.length; round++) {
      // refresh the top until it stays on top
      let top = heap.shift()!;
      for (;;) {
        top.s = scoreOf(top.b);
        if (!heap.length || top.s >= heap[0].s) break;
        let at = heap.findIndex((x) => x.s < top.s);
        if (at < 0) at = heap.length;
        heap.splice(at, 0, top);
        top = heap.shift()!;
      }
      if (top.s <= 0) break;
      if (claimed + fs[top.b].area > budget || !blockPlots[top.b].some((k) => ps[k].use === BUILDING)) continue;
      if (!convert(top.b, L.key)) continue;
      if (!update()) break;
    }
  }
  // Under plot rules with a least park share: more blocks, the smallest that reach it first.
  const R = plotRulesOf(G.meta.id);
  if (R) {
    const parkLand = () => { let a = 0; for (let i = 0; i < n; i++) if (use[i] === LANDSCAPE) a += G.cellArea; return a; };
    const order = fs.map((f, b) => b).filter((b) => blockPlots[b].some((k) => ps[k].use === BUILDING)).sort((a, b) => fs[a].area - fs[b].area);
    for (const b of order) {
      if (parkLand() >= R.parkShareMin * land || claimed + fs[b].area > budget) break;
      if (blockPlots[b].some((k) => ps[k].use === BUILDING)) convert(b, "housing");   // a narrow one is skipped
    }
  }

  // 5. Every door: a small open space within DOOR_WALK_M of every building plot. Plots, not
  // cells (a doorstep space is smaller than a cell), so walks run between plots' centres; open
  // ground counts where an open cell, open land or a plot already open is near.
  const reach = DOOR_WALK_M / DETOUR, nearPlot = bucket(plotC, reach);
  const within = (a: Pt, b: Pt) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 <= reach * reach;
  const lacking = doorLacking(G, use, ps, plotC, plotA);
  const gain = (k: number) => {
    let sum = 0;
    for (const j of nearPlot(plotC[k])) if (j !== k && lacking[j] && within(plotC[j], plotC[k])) sum += plotA[j];
    return sum / plotA[k];
  };
  // lazy greedy on a max-heap: a gain only falls as plots are served, so a popped plot whose
  // refreshed gain still beats the next one's stale gain is the best
  const heap = new MaxHeap();
  for (let k = 0; k < ps.length; k++) {
    if (ps[k].use !== BUILDING || plotA[k] < DOOR_PLOT_M2[0] || plotA[k] > DOOR_PLOT_M2[1] || plotFixed(k)) continue;
    const g = gain(k);
    if (g > 0) heap.push(k, g);
  }
  while (heap.size) {
    const top = { k: heap.pop()!, s: 0 };
    top.s = ps[top.k].use === BUILDING ? gain(top.k) : 0;
    if (top.s <= 0) continue;
    if (heap.size && top.s < heap.peekValue()) { heap.push(top.k, top.s); continue; }
    if (claimed + plotA[top.k] > budget) continue;
    toGreen(top.k);
    lacking[top.k] = false;
    for (const j of nearPlot(plotC[top.k])) if (within(plotC[j], plotC[top.k])) lacking[j] = false;
    spaces.push({ rule: "doorstep", family: "doorstep", plots: [top.k], at: plotC[top.k], area: Math.round(plotA[top.k]), storage: 0 });
  }
  // the ground whose rain still leaves the design over building land, meeting no open ground
  if (G.down) {
    const acc = gathered(G, use);
    for (let i = 0; i < n; i++) if (use[i] === BUILDING && G.down[i] < 0) water.unheld += acc[i];
  }

  let open = 0;
  for (let i = 0; i < n; i++) if (use[i] === LANDSCAPE) open += G.cellArea;
  open += (G.openLand?.length ?? 0) * G.cellArea;
  const share = open / (land + (G.openLand?.length ?? 0) * G.cellArea);
  water.need = Math.round(water.need); water.held = Math.round(water.held); water.unheld = Math.round(water.unheld);
  return { squares, parks, spaces, water, access: { doorstep: 0, housing: 0, neighbourhood: 0 }, share };
}

/** The share of the design's floor area within a walk of each level of open space. */
export function accessOf(G: Ground, d: Pick<Design, "use" | "floorArea">): Record<OpenLevel, number> {
  const P = patches(G, d.use);
  let total = 0;
  for (let i = 0; i < G.n; i++) total += d.floorArea[i];
  const out = {} as Record<OpenLevel, number>;
  for (const L of OPEN_LEVELS) {
    const w = walkTo(G, d.use, P, L.min_m2);
    let served = 0;
    for (let i = 0; i < G.n; i++) if (w[i] <= L.walk_m) served += d.floorArea[i];
    out[L.key] = total > 0 ? served / total : 0;
  }
  return out;
}

/** Each street segment's frontage: a lake edge near water or the lake buffer, a green edge
 *  beside shared ground, active on a secondary or primary street near a centre or square,
 *  else residential. Sampled at the segment's middle, either side, just past its width. */
export function frontages(G: Ground, use: ArrayLike<number>, streets: VectorPlan["streets"], centres: Pt[], squares: Pt[],
  cellOf: (p: Pt) => number): Frontage[] {
  const R = LAKE_EDGE_M, hash = new Map<string, Pt[]>();
  for (const p of [...(G.water ?? []), ...(G.openLand ?? [])]) {
    const h = `${Math.floor(p[0] / R)},${Math.floor(p[1] / R)}`, b = hash.get(h);
    if (b) b.push(p); else hash.set(h, [p]);
  }
  const nearWater = ([x, y]: Pt) => {
    const cx = Math.floor(x / R), cy = Math.floor(y / R);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      for (const [wx, wy] of hash.get(`${cx + dx},${cy + dy}`) ?? []) if ((wx - x) ** 2 + (wy - y) ** 2 <= R * R) return true;
    }
    return false;
  };
  return streets.map((s) => {
    const mid = midpoint(s.pts), [nx, ny] = normalAt(s.pts), off = s.w / 2 + 8;
    const sides: Pt[] = [[mid[0] + nx * off, mid[1] + ny * off], [mid[0] - nx * off, mid[1] - ny * off]];
    if (sides.some(nearWater)) return "lake";
    const uses = sides.map((p) => { const c = cellOf(p); return c >= 0 ? use[c] : -1; });
    if (uses.some((u) => u === LANDSCAPE) && !uses.every((u) => u === BUILDING)) return "green";
    if (s.cls >= 2 && ([...centres, ...squares].some((c) => dist(c, mid) <= ACTIVE_M))) return "active";
    return "residential";
  });
}

/** Points by grid square of size r: the indices within about r of a point (the 3 x 3 squares round it). */
function bucket(pts: Pt[], r: number): (p: Pt) => number[] {
  const hash = new Map<string, number[]>();
  pts.forEach(([x, y], k) => { const h = `${Math.floor(x / r)},${Math.floor(y / r)}`, l = hash.get(h); if (l) l.push(k); else hash.set(h, [k]); });
  return ([x, y]) => {
    const out: number[] = [], cx = Math.floor(x / r), cy = Math.floor(y / r);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (const k of hash.get(`${cx + dx},${cy + dy}`) ?? []) out.push(k);
    return out;
  };
}

function lengthOf(l: Line) { let s = 0; for (let k = 1; k < l.length; k++) s += dist(l[k - 1], l[k]); return s; }
function midpoint(l: Line): Pt {
  const half = lengthOf(l) / 2;
  let run = 0;
  for (let k = 1; k < l.length; k++) {
    const seg = dist(l[k - 1], l[k]);
    if (run + seg >= half) { const t = seg ? (half - run) / seg : 0; return [l[k - 1][0] + (l[k][0] - l[k - 1][0]) * t, l[k - 1][1] + (l[k][1] - l[k - 1][1]) * t]; }
    run += seg;
  }
  return l[l.length - 1];
}
function normalAt(l: Line): Pt {
  const k = Math.max(1, Math.floor(l.length / 2));
  const dx = l[k][0] - l[k - 1][0], dy = l[k][1] - l[k - 1][1], L = Math.hypot(dx, dy) || 1;
  return [-dy / L, dx / L];
}

/** Per plot: a building plot with no open ground of a doorstep space's size within
 *  DOOR_WALK_M (centre to centre, times DETOUR): an open cell, open land, or an open plot. */
function doorLacking(G: Ground, use: ArrayLike<number>, ps: Plot[], plotC: Pt[], plotA: number[]): boolean[] {
  const reach = DOOR_WALK_M / DETOUR, opens: Pt[] = [];
  for (let i = 0; i < G.n; i++) if (use[i] === LANDSCAPE || use[i] === WATER) opens.push([G.x[i], G.y[i]]);
  for (const q of G.openLand ?? []) opens.push(q);
  ps.forEach((p, k) => { if (p.use !== BUILDING && plotA[k] >= DOOR_PLOT_M2[0]) opens.push(plotC[k]); });
  const nearOpen = bucket(opens, reach);
  return ps.map((p, k) => p.use === BUILDING && !nearOpen(plotC[k]).some((j) => (opens[j][0] - plotC[k][0]) ** 2 + (opens[j][1] - plotC[k][1]) ** 2 <= reach * reach));
}

/** The share of the floor area on building plots within DOOR_WALK_M of a doorstep space (plots,
 *  as rule 5 places them; the cell walk of accessOf can't see spaces smaller than a cell). */
export function doorAccess(G: Ground, use: ArrayLike<number>, ps: Plot[], plotOf: Int32Array, floorArea: ArrayLike<number>): number {
  const lacking = doorLacking(G, use, ps, ps.map((p) => centroid(p.ring)), ps.map((p) => Math.abs(area(p.ring))));
  let all = 0, served = 0;
  for (let i = 0; i < G.n; i++) {
    const k = plotOf[i];
    if (k < 0 || ps[k].use !== BUILDING) continue;
    all += floorArea[i];
    if (!lacking[k]) served += floorArea[i];
  }
  return all > 0 ? served / all : 0;
}

/** How far a school looks across the street for its playfield: plot centre to plot centre (m;
 *  a local street and two plot depths, assumed). */
export const ACROSS_M = 60;

/** After programme: a school given less land than it needs takes the playfield its own land
 *  can't hold (URDPFI: half its land is playfield) on the home plots across a local street
 *  from it, nearest first, as shared ground the neighbourhood can use out
 *  of school hours (architecture-v3 14.9, Q2: the street between becomes a shared street at
 *  school hours). In place on `use` and the plots; returns the spaces and, per school plot, the
 *  field placed away from it (m²), which its own lot then needn't hold. */
export function pairFields(G: Ground, use: Int8Array, ps: Plot[], plotOf: Int32Array, schools: { plots: number[]; field: number }[],
  isHome: (k: number) => boolean, locked: ArrayLike<number> | null = null): { spaces: PublicSpace[]; away: Map<number, number>; plots: number[] } {
  const plotC = ps.map((p) => centroid(p.ring)), plotA = ps.map((p) => Math.abs(area(p.ring)));
  const near = bucket(plotC, ACROSS_M), cells = new Map<number, number[]>();
  for (let i = 0; i < G.n; i++) if (plotOf[i] >= 0) { const l = cells.get(plotOf[i]); if (l) l.push(i); else cells.set(plotOf[i], [i]); }
  const fixed = (k: number) => !!locked && (cells.get(k) ?? []).some((i) => locked[i] > 0);
  const spaces: PublicSpace[] = [], away = new Map<number, number>(), taken: number[] = [];
  for (const sc of schools) {
    if (!sc.plots.length || sc.field <= 0) continue;
    const blocks = new Set(sc.plots.map((k) => ps[k].block));
    const cand = new Map<number, number>();
    for (const s of sc.plots) for (const j of near(plotC[s])) {
      if (blocks.has(ps[j].block) || ps[j].use !== BUILDING || !isHome(j) || fixed(j)) continue;
      const d = dist(plotC[j], plotC[s]);
      if (d <= ACROSS_M && d < (cand.get(j) ?? Infinity)) cand.set(j, d);
    }
    const order = [...cand.entries()].sort((a, b) => a[1] - b[1] || a[0] - b[0]).map(([j]) => j);
    const mine: number[] = [];
    let got = 0;
    for (const j of order) {
      if (got >= sc.field) break;
      ps[j].use = LANDSCAPE;
      for (const i of cells.get(j) ?? []) if (use[i] === BUILDING && G.canGreen[i]) use[i] = LANDSCAPE;
      mine.push(j); got += plotA[j];
    }
    if (!mine.length) continue;
    taken.push(...mine);
    away.set(sc.plots[0], Math.min(got, sc.field));
    const c: Pt = [mine.reduce((t, j) => t + plotC[j][0], 0) / mine.length, mine.reduce((t, j) => t + plotC[j][1], 0) / mine.length];
    spaces.push({ rule: "field", family: "field", plots: mine, at: c, area: Math.round(got), storage: 0, of: sc.plots[0] });
  }
  return { spaces, away, plots: taken };
}

/** A max-heap of indices by value (ties: the lower index first). */
class MaxHeap {
  private k: number[] = []; private v: number[] = [];
  get size() { return this.k.length; }
  peekValue() { return this.v[0]; }
  private above(i: number, j: number) { return this.v[i] > this.v[j] || (this.v[i] === this.v[j] && this.k[i] < this.k[j]); }
  private swap(i: number, j: number) { [this.k[i], this.k[j]] = [this.k[j], this.k[i]]; [this.v[i], this.v[j]] = [this.v[j], this.v[i]]; }
  push(key: number, value: number) {
    this.k.push(key); this.v.push(value);
    for (let i = this.k.length - 1; i > 0;) { const p = (i - 1) >> 1; if (!this.above(i, p)) break; this.swap(i, p); i = p; }
  }
  pop(): number | undefined {
    if (!this.k.length) return undefined;
    const top = this.k[0], lk = this.k.pop()!, lv = this.v.pop()!;
    if (this.k.length) {
      this.k[0] = lk; this.v[0] = lv;
      for (let i = 0; ;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < this.k.length && this.above(l, m)) m = l;
        if (r < this.k.length && this.above(r, m)) m = r;
        if (m === i) break;
        this.swap(i, m); i = m;
      }
    }
    return top;
  }
}
