// Alexander's fifteen properties, those with an urban-scale proxy (pc/metrics/order.py;
// docs/metrics.md, docs/architecture-v2.md 6.4). Salingaros is the reference for the formulas;
// applying them at urban scale, on a cell grid, is our choice.
import { BUILDING, CENTRE_REACH_M, NEAR_NODE_M, RHYTHM_MIN_RUN } from "../config.js";
import { corners } from "../graph.js";
import type { Ground } from "../types.js";
import { entropy } from "./harmony.js";
import { code, junctions, landmarks, near, pearson, type Net } from "./network.js";

/** Sizes of blocks and open patches as a ladder of e-fold steps from one cell up to the
 *  largest: how evenly the ground is shared among the rungs (entropy of area per rung). One
 *  huge block, or a missing rung, scores low; every scale well represented scores high. */
export function levelsOfScale(net: Net): number {
  const sizes = [...net.blocks, ...net.patches].map((c) => c.length);
  if (!sizes.length) return 0;
  let top = 0;
  for (const s of sizes) top = Math.max(top, Math.floor(Math.log(s)));
  const area = new Array(top + 1).fill(0);
  for (const s of sizes) area[Math.floor(Math.log(s))] += s;
  return entropy(area, top + 1);
}

/** Of the edges of open spaces (three cells or more), the share that buildings define. */
export function boundaries(net: Net): number {
  const { G, d, L, patch, patches } = net, D = G.deg;
  let edges = 0, built = 0;
  patches.forEach((cells, p) => {
    if (cells.length < 3) return;
    for (const i of cells) {
      for (let k = 0; k < D; k++) {
        const j = G.nbr[i * D + k];
        if (j >= 0 && !L.cut[i * D + k] && patch[j] === p) continue;
        edges++;
        if (j >= 0 && d.use[j] === BUILDING) built++;
      }
    }
  });
  return edges ? built / edges : 0;
}

/** Runs of cells along each row (left to right), at least 16 long. Kept per site. */
const rowCache = new WeakMap<Ground, number[][]>();
function rows(net: Net): number[][] {
  const { G, L } = net, hit = rowCache.get(G);
  if (hit) return hit;
  const byRow = new Map<number, number[]>();
  for (let i = 0; i < G.n; i++) {
    const r = Math.floor(G.y[i] / L.rowStep + 0.5);
    if (!byRow.has(r)) byRow.set(r, []);
    byRow.get(r)!.push(i);
  }
  const out: number[][] = [], gap = G.grid.spacing * 1.01;
  for (const r of [...byRow.keys()].sort((a, b) => a - b)) {
    const cells = byRow.get(r)!.sort((a, b) => G.x[a] - G.x[b] || a - b);
    let run = [cells[0]];
    for (let t = 1; t <= cells.length; t++) {
      if (t < cells.length && G.x[cells[t]] - G.x[cells[t - 1]] <= gap) { run.push(cells[t]); continue; }
      if (run.length >= RHYTHM_MIN_RUN) out.push(run);
      if (t < cells.length) run = [cells[t]];
    }
  }
  rowCache.set(G, out);
  return out;
}

/** Cosine and sine tables for a transform of length n. */
const waves = new Map<number, [Float64Array, Float64Array]>();
function wave(n: number): [Float64Array, Float64Array] {
  let w = waves.get(n);
  if (!w) {
    const half = Math.floor(n / 2), c = new Float64Array((half + 1) * n), sn = new Float64Array((half + 1) * n);
    for (let k = 1; k <= half; k++) for (let t = 0; t < n; t++) {
      const a = (2 * Math.PI * k * t) / n;
      c[k * n + t] = Math.cos(a); sn[k * n + t] = Math.sin(a);
    }
    w = [c, sn];
    waves.set(n, w);
  }
  return w;
}

/** How much of a sequence's variation sits in its strongest repeat (one frequency of its
 *  discrete Fourier transform): near 1 for a steady beat, low for noise. */
export function periodicity(v: number[]): number {
  const n = v.length, [cs, sn] = wave(n);
  let m = 0;
  for (const x of v) m += x;
  m /= n;
  let total = 0, best = 0;
  for (let k = 1; k <= Math.floor(n / 2); k++) {
    let re = 0, im = 0;
    for (let t = 0; t < n; t++) { re += (v[t] - m) * cs[k * n + t]; im += (v[t] - m) * sn[k * n + t]; }
    const p = re * re + im * im;
    total += p;
    if (p > best) best = p;
  }
  return total > 0 ? best / total : 0;
}

function rhythm(net: Net, value: (i: number) => number): number {
  let sum = 0, len = 0;
  for (const run of rows(net)) { sum += run.length * periodicity(run.map(value)); len += run.length; }
  return len ? sum / len : 0;
}

/** Alternating repetition along the rows: built and open. */
export const rhythmBuilt = (net: Net) => rhythm(net, (i) => (net.d.use[i] === BUILDING ? 1 : 0));

/** Alternating repetition along the rows: the skyline (storeys, open ground as 0). */
export const rhythmSkyline = (net: Net) => rhythm(net, (i) => (net.d.use[i] === BUILDING ? net.d.levels[i] : 0));

/** Area of a convex hull (Andrew's monotone chain). */
export function hullArea(pts: [number, number][]): number {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return 0;
  const cross = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: [number, number][] = [], upper: [number, number][] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  for (let t = p.length - 1; t >= 0; t--) {
    const q = p[t];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  const hull = lower.slice(0, -1).concat(upper.slice(0, -1));
  let a = 0;
  for (let t = 0; t < hull.length; t++) {
    const [x1, y1] = hull[t], [x2, y2] = hull[(t + 1) % hull.length];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
}

/** Positive space: how convex the open spaces are (area over the area of their convex
 *  hull), for spaces of three cells or more, weighted by area. */
export function positiveSpace(net: Net): number {
  const { G, patches } = net, shape = corners(G.grid);
  let sum = 0, all = 0;
  for (const cells of patches) {
    if (cells.length < 3) continue;
    const pts: [number, number][] = [];
    for (const i of cells) for (const [dx, dy] of shape) pts.push([G.x[i] + dx, G.y[i] + dy]);
    const ratio = Math.min((cells.length * G.cellArea) / hullArea(pts), 1);
    sum += cells.length * ratio; all += cells.length;
  }
  return all ? sum / all : 0;
}

/** Local symmetries: of the cells whose whole ring of neighbours is in the design and mixed
 *  (at least two cells differ from the commonest kind; one odd cell out is trivially
 *  symmetric), the share whose ring (use and height band) is mirror-symmetric about some axis. */
export function localSymmetry(net: Net): number {
  const { G, d, L } = net, D = G.deg, ring = new Array<number>(D);
  let mixed = 0, sym = 0;
  for (let i = 0; i < G.n; i++) {
    let full = true;
    for (let k = 0; k < D; k++) {
      const j = G.nbr[i * D + k];
      if (j < 0) { full = false; break; }
      ring[L.dir[i * D + k]] = code(d, j);
    }
    if (!full) continue;
    let common = 0;
    for (const c of ring) { let k = 0; for (const e of ring) if (e === c) k++; common = Math.max(common, k); }
    if (common >= D - 1) continue;
    mixed++;
    for (let m = 0; m < D; m++) {
      let ok = true;
      for (let a = 0; a < D && ok; a++) ok = ring[a] === ring[(((m - a) % D) + D) % D];
      if (ok) { sym++; break; }
    }
  }
  return mixed ? sym / mixed : 0;
}

/** Each cell's mirror image (the nearest cell within half a spacing, or -1) about axes
 *  through the design's centre every 15°. Depends only on the site, so it is kept per site. */
const mirrorCache = new WeakMap<Ground, Int32Array[]>();
export function mirrors(G: Ground): Int32Array[] {
  const hit0 = mirrorCache.get(G);
  if (hit0) return hit0;
  const s = G.grid.spacing, n = G.n;
  let cx = 0, cy = 0;
  for (let i = 0; i < n; i++) { cx += G.x[i]; cy += G.y[i]; }
  cx /= n; cy /= n;
  const hash = new Map<number, number[]>(), key = (bx: number, by: number) => bx * 100003 + by;
  for (let i = 0; i < n; i++) {
    const k = key(Math.floor(G.x[i] / s), Math.floor(G.y[i] / s));
    if (!hash.has(k)) hash.set(k, []);
    hash.get(k)!.push(i);
  }
  const lim = (s * 0.5) * (s * 0.5), out: Int32Array[] = [];
  for (let t = 0; t < 12; t++) {
    const th = (t * 15 * Math.PI) / 180, c = Math.cos(2 * th), sn = Math.sin(2 * th);
    const m = new Int32Array(n).fill(-1);
    for (let i = 0; i < n; i++) {
      const dx = G.x[i] - cx, dy = G.y[i] - cy;
      const rx = cx + dx * c + dy * sn, ry = cy + dx * sn - dy * c;
      const bx = Math.floor(rx / s), by = Math.floor(ry / s);
      let hit = -1, hd = lim;
      for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
        for (const j of hash.get(key(bx + ox, by + oy)) ?? []) {
          const ex = G.x[j] - rx, ey = G.y[j] - ry, dd = ex * ex + ey * ey;
          if (dd < hd || (dd === hd && hit >= 0 && j < hit)) { hd = dd; hit = j; }
        }
      }
      m[i] = hit;
    }
    out.push(m);
  }
  mirrorCache.set(G, out);
  return out;
}

/** Global mirror symmetry of the skyline: for each axis, the correlation of storeys (open
 *  ground as 0) between each cell and its mirror image, times the share of cells that have
 *  one; the best axis. */
export function symmetry(net: Net): number {
  const { G, d } = net;
  const v = (i: number) => (d.use[i] === BUILDING ? d.levels[i] : 0);
  let best = 0;
  for (const m of mirrors(G)) {
    const a: number[] = [], b: number[] = [];
    for (let i = 0; i < G.n; i++) if (m[i] >= 0) { a.push(v(i)); b.push(v(m[i])); }
    const score = Math.max(pearson(a, b), 0) * (a.length / G.n);
    if (score > best) best = score;
  }
  return best;
}

/** Asymmetric balance: 1 when the centre of the floor area sits on the centre of the design
 *  ground, 0 when it is a quarter of the ground's diagonal away. */
export function balance(net: Net): number {
  const { G, d } = net;
  let cx = 0, cy = 0, fx = 0, fy = 0, fa = 0;
  for (let i = 0; i < G.n; i++) {
    cx += G.x[i]; cy += G.y[i];
    fx += d.floorArea[i] * G.x[i]; fy += d.floorArea[i] * G.y[i]; fa += d.floorArea[i];
  }
  if (!fa) return 0;
  cx /= G.n; cy /= G.n; fx /= fa; fy /= fa;
  const [x0, y0, x1, y1] = G.bounds, diag = Math.sqrt((x1 - x0) * (x1 - x0) + (y1 - y0) * (y1 - y0));
  const off = Math.sqrt((fx - cx) * (fx - cx) + (fy - cy) * (fy - cy));
  return Math.max(1 - (4 * off) / diag, 0);
}

/** Contrast: the share of neighbouring cells that differ in use or height band. */
export function contrast(net: Net): number {
  const { G, d } = net, D = G.deg;
  let links = 0, differ = 0;
  for (let i = 0; i < G.n; i++) {
    for (let k = 0; k < D; k++) {
      const j = G.nbr[i * D + k];
      if (j <= i) continue;
      links++;
      if (code(d, i) !== code(d, j)) differ++;
    }
  }
  return links ? differ / links : 0;
}

/** Gradients: where neighbouring buildings differ in height, the share that step by one
 *  storey (change by degrees, not jumps). */
export function gradients(net: Net): number {
  const { G, d } = net, D = G.deg;
  let links = 0, gentle = 0;
  for (let i = 0; i < G.n; i++) {
    if (d.use[i] !== BUILDING) continue;
    for (let k = 0; k < D; k++) {
      const j = G.nbr[i * D + k];
      if (j <= i || d.use[j] !== BUILDING || d.levels[i] === d.levels[j]) continue;
      links++;
      if (Math.abs(d.levels[i] - d.levels[j]) === 1) gentle++;
    }
  }
  return links ? gentle / links : 0;
}

/** Roughness: variation of storeys within each block (standard deviation over mean), for
 *  blocks of three cells or more, weighted by size. Alexander wants it low but not zero. */
export function roughness(net: Net): number {
  const { d, blocks } = net;
  let sum = 0, all = 0;
  for (const cells of blocks) {
    if (cells.length < 3) continue;
    let s1 = 0, s2 = 0;
    for (const i of cells) { s1 += d.levels[i]; s2 += d.levels[i] * d.levels[i]; }
    const m = s1 / cells.length, sd = Math.sqrt(Math.max(s2 / cells.length - m * m, 0));
    sum += cells.length * (m > 0 ? sd / m : 0); all += cells.length;
  }
  return all ? sum / all : 0;
}

/** The void: the largest open space as a share of the design ground. */
export function theVoid(net: Net): number {
  let top = 0;
  for (const cells of net.patches) if (cells.length > top) top = cells.length;
  return top / net.G.n;
}

/** Strong centres: around each core centre (300 m), how strongly storeys fall away with
 *  distance (correlation of storeys with nearness, 0 if they don't); the mean over centres. */
export function strongCentres(net: Net): number {
  const { G, d, centres } = net;
  if (!centres.length) return 0;
  let sum = 0;
  for (const c of centres) {
    const nearness: number[] = [], lv: number[] = [];
    for (let i = 0; i < G.n; i++) {
      if (d.use[i] !== BUILDING) continue;
      const dx = G.x[i] - G.x[c], dy = G.y[i] - G.y[c], r = Math.sqrt(dx * dx + dy * dy);
      if (r <= CENTRE_REACH_M) { nearness.push(-r); lv.push(d.levels[i]); }
    }
    sum += Math.max(pearson(nearness, lv), 0);
  }
  return sum / centres.length;
}

/** Contrast and emphasis: of the landmarks (buildings far taller than the rest), the share
 *  within 100 m of a node (a junction or a centre). 0 when there are none. */
export const landmarkPlacement = (net: Net) =>
  near(net.G, landmarks(net), [...junctions(net), ...net.centres], NEAR_NODE_M);
