// Shared ground before buildings (built form brief section 4; docs/built-form.md step 3).
//
// After the streets, blocks and plots are laid out and before buildings fill the plots, the
// design reserves its shared ground, in the brief's order:
//
//   1  the lake buffer, tank edges, valley corridors and drainage lines: the rules already keep
//      these open (forbidden ground off the design ground, constrained cells that only take
//      water, wetland or landscape), so they are counted, not claimed again
//   2  a square at each important junction: where two or more secondary or primary streets
//      meet, the busiest first, SQUARE_SPACING_M apart; the plot on the corner becomes it
//   3  a hierarchy of open space (OPEN_LEVELS): where a building plot has no park of a level's
//      size within its walk, the block that would serve the most such plots becomes one, until
//      every plot is served or SHARED_MAX of the land is shared; then, under a site's plot rules,
//      blocks until the parks reach the rules' least share (RMP 2015 6.1 c in Bengaluru: 15%)
//
// Shared ground is a layer with its own outline (plan.shared): buildings may front it but not
// occupy it. Each street segment gets a frontage type (active, residential, green edge, lake
// edge) that buildings will read when they are placed, and the plan reports the share of its
// floor area within a walk of each level of open space (the access score).
import { BUILDING, LANDSCAPE } from "../config.js";
import { plotRulesOf } from "../regs.js";
import type { Design, Ground, VectorPlan } from "../types.js";
import { area, centroid, dist, inside, type Line, type Pt } from "./geom.js";
import type { Edge, Face } from "./network.js";
import type { Plot } from "./plots.js";

/** The levels of open space, smallest first (corpus: urdpfi-open-space-hierarchy). min_m2 from
 *  URDPFI 2015 as NIUA reproduces it (secondary); walk_m from Fields in Trust 2015 (assumed for
 *  Indian sites). The doorstep level is built at block scale (courts), so it is measured here,
 *  never reserved. */
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

export type Frontage = "active" | "residential" | "green" | "lake";
export const FRONTAGES: Frontage[] = ["active", "residential", "green", "lake"];

export interface SharedResult {
  squares: { at: Pt; plot: number }[];
  parks: { level: OpenLevel; block: number; area: number }[];
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

  // 2. Squares at the important junctions.
  const deg = new Map<number, number[]>();
  edges.forEach((e, k) => { if (e.cls >= 2) for (const v of [e.u, e.v]) { const l = deg.get(v); if (l) l.push(k); else deg.set(v, [k]); } });
  const nodes = [...deg.entries()].filter(([, ks]) => ks.length >= 2)
    .map(([v, ks]) => {
      const at: Pt = [vx[v], vy[v]];
      const near = centres.some((c) => dist(c, at) <= ACTIVE_M) ? 2 : 0;
      return { at, weight: ks.reduce((s, k) => s + edges[k].cls, 0) + near + (ks.length >= 3 ? 1 : 0) };
    })
    .sort((a, b) => b.weight - a.weight || a.at[0] - b.at[0] || a.at[1] - b.at[1]);
  const plotC = ps.map((p) => centroid(p.ring)), plotA = ps.map((p) => Math.abs(area(p.ring)));
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
  }

  // 3. The hierarchy: blocks become parks where plots lack one within their walk.
  const blockPlots = fs.map(() => [] as number[]), blockC = fs.map((f) => centroid(f.ring));
  ps.forEach((p, k) => { if (p.block >= 0 && p.block < fs.length) blockPlots[p.block].push(k); });
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

  let open = 0;
  for (let i = 0; i < n; i++) if (use[i] === LANDSCAPE) open += G.cellArea;
  open += (G.openLand?.length ?? 0) * G.cellArea;
  const share = open / (land + (G.openLand?.length ?? 0) * G.cellArea);
  return { squares, parks, access: { doorstep: 0, housing: 0, neighbourhood: 0 }, share };
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
