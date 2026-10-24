// Space syntax: angular segment analysis (pc/syntax.py; docs/metrics.md, "Space syntax").
//
// The network, per design:
//   site      the design's streets (sides with a street class, streets.ts), rebuilt as
//             straightened strokes (streetStrokes: cell edges zigzag and meet in Y junctions,
//             which angular analysis would read as turns), cut into straight segments; on sites
//             whose skeleton is landform, the existing major roads over the design ground too
//   buffer    the existing streets to 1 km round the site (pc/syntax.py), minus those whose
//             middle lies on the design ground: the design replaces them
//   links     a buffer street left dangling at the edge of the design ground is joined to the
//             nearest site vertex within LINK_M
//
// The analysis (Turner 2001, 2007; Hillier and Iida 2005), on the segment graph:
//   cost       the turn between two segments, in units of 90°, quantised to 1/TURN_UNITS so
//              both engines count the same ties
//   paths      least-angle paths, ties broken by the shorter (a straight run costs no angle,
//              so cost alone would tie whole chains); only exact ties share a path
//   radius     a segment is reached when the metric length of its path (from the origin's
//              middle to its own) is at most the radius; Rn has no radius, so it means the
//              whole network within the 1 km buffer
//   NC, TD     segments reached, and their total angular depth
//   CH         choice: least-angle paths between pairs of segments that pass through it, ties
//              shared (Brandes 2001)
//   NAIN       NC^1.2 / (TD + 2)                 (Hillier, Yang and Turner 2012)
//   NACH       log(CH + 1) / log(TD + 3)          (Hillier, Yang and Turner 2012)
// Everything is computed on the whole network; only site segments are reported.
//
// Same arithmetic, in the same order, as the Python file.
import { corners } from "./graph.js";
import { sides } from "./streets.js";
import type { Design, Ground } from "./types.js";

export const STROKE_DIR_M = 30.0;     // a street's direction at a junction, read over this length
export const STROKE_MAX_DEG = 45;     // pieces meeting more steeply than this don't carry on as one street
export const STROKE_SIMPLIFY = 0.75;  // × cell size: straightens zigzags along cell edges (10 m off line on 20 m hexes)
export const LINK_M = 40.0;         // a dangling buffer street joins a site vertex this close
export const TURN_UNITS = 256;      // per 90° of turn
export const RADII = [400, 800, Infinity] as const;
export type Radius = (typeof RADII)[number];

/** A segment graph: segments as end vertices, vertices as points. */
export interface Network {
  vx: Float64Array; vy: Float64Array;   // vertices
  a: Int32Array; b: Int32Array;         // per segment: end vertices
  len: Float64Array;                    // per segment: length (m)
  site: number;                         // segments 0 .. site-1 are the design's
  links: number;                        // joins made between buffer and site
}

// --- geometry --------------------------------------------------------------------------

/** Douglas-Peucker on a polyline (indices kept, ends always). */
export function simplify(xs: number[], ys: number[], tol: number): number[] {
  const n = xs.length, keep = new Uint8Array(n);
  keep[0] = 1; keep[n - 1] = 1;
  const stack: [number, number][] = [[0, n - 1]];
  while (stack.length) {
    const [i, j] = stack.pop()!;
    const dx = xs[j] - xs[i], dy = ys[j] - ys[i], L = Math.sqrt(dx * dx + dy * dy);
    let best = -1, bd = tol;
    for (let k = i + 1; k < j; k++) {
      const d = L > 0 ? Math.abs(dx * (ys[k] - ys[i]) - dy * (xs[k] - xs[i])) / L
        : Math.sqrt((xs[k] - xs[i]) ** 2 + (ys[k] - ys[i]) ** 2);
      if (d > bd) { bd = d; best = k; }
    }
    if (best >= 0) { keep[best] = 1; stack.push([best, j], [i, best]); }
  }
  const out: number[] = [];
  for (let k = 0; k < n; k++) if (keep[k]) out.push(k);
  return out;
}

/** Which design cell a point is in (-1: off the design ground): the nearest design centre's,
 *  if the point is inside its outline. */
interface GroundIndex { cell(x: number, y: number): number; has(x: number, y: number): boolean; near(x: number, y: number, r: number): boolean }
const indexCache = new WeakMap<Ground, GroundIndex>();
function groundIndex(G: Ground): GroundIndex {
  let hit = indexCache.get(G);
  if (hit) return hit;
  const B = 2 * G.grid.spacing, buckets = new Map<number, number[]>(), shape = corners(G.grid);
  const key = (bx: number, by: number) => bx * 1048576 + by;
  for (let i = 0; i < G.n; i++) {
    const k = key(Math.floor(G.x[i] / B), Math.floor(G.y[i] / B));
    let l = buckets.get(k);
    if (!l) buckets.set(k, (l = []));
    l.push(i);
  }
  const nearest = (x: number, y: number, r: number) => {
    let best = -1, bd = r * r;
    const bx = Math.floor(x / B), by = Math.floor(y / B), reach = Math.ceil(r / B);
    for (let i = bx - reach; i <= bx + reach; i++) for (let j = by - reach; j <= by + reach; j++) {
      for (const c of buckets.get(key(i, j)) ?? []) {
        const dd = (G.x[c] - x) ** 2 + (G.y[c] - y) ** 2;
        if (dd < bd || (dd === bd && c < best)) { bd = dd; best = c; }
      }
    }
    return best;
  };
  const cell = (x: number, y: number) => {
    const c = nearest(x, y, G.grid.size * 1.01);
    if (c < 0) return -1;
    for (let k = 0; k < shape.length; k++) {
      const [ax, ay] = shape[k], [bx, by] = shape[(k + 1) % shape.length];
      if ((bx - ax) * (y - G.y[c] - ay) - (by - ay) * (x - G.x[c] - ax) < -1e-9) return -1;
    }
    return c;
  };
  hit = {
    cell,
    has: (x, y) => cell(x, y) >= 0,
    near: (x, y, r) => nearest(x, y, r) >= 0,
  };
  indexCache.set(G, hit);
  return hit;
}

/** The design cell a point lies in, or -1. */
export const cellAt = (G: Ground, x: number, y: number) => groundIndex(G).cell(x, y);

// --- the network -----------------------------------------------------------------------

/** Vertices keyed at 0.1 m, so the same point from two sources is one vertex. */
class Builder {
  vx: number[] = []; vy: number[] = []; a: number[] = []; b: number[] = [];
  private ids = new Map<number, number>();
  vertex(x: number, y: number): number {
    const k = Math.floor(x * 10 + 0.5) * 67108864 + Math.floor(y * 10 + 0.5);
    let v = this.ids.get(k);
    if (v === undefined) { v = this.vx.length; this.ids.set(k, v); this.vx.push(x); this.vy.push(y); }
    return v;
  }
  segment(p: number, q: number) { if (p !== q) { this.a.push(p); this.b.push(q); } }
}

/** Nearest point on a polyline to (x, y): its position, and its distance along the line. */
function project(xs: number[], ys: number[], x: number, y: number): [number, number, number] {
  let best = Infinity, bx = xs[0], by = ys[0], bt = 0, run = 0;
  for (let k = 1; k < xs.length; k++) {
    const dx = xs[k] - xs[k - 1], dy = ys[k] - ys[k - 1], L2 = dx * dx + dy * dy, L = Math.sqrt(L2);
    const t = L2 ? Math.max(0, Math.min(1, ((x - xs[k - 1]) * dx + (y - ys[k - 1]) * dy) / L2)) : 0;
    const px = xs[k - 1] + t * dx, py = ys[k - 1] + t * dy, d = (px - x) * (px - x) + (py - y) * (py - y);
    if (d < best) { best = d; bx = px; by = py; bt = run + t * L; }
    run += L;
  }
  return [bx, by, bt];
}

/**
 * The design's streets as strokes (natural streets; Jiang and Claramunt 2004), straightened.
 * Streets on cell edges zigzag (hex sides swing 30° either way of a street's line) and meet in
 * Y-shaped junctions, which angular analysis would read as turns. So:
 *   chains     street sides between junctions (vertices where the number of street sides
 *              isn't two) and dead ends
 *   pairing    at each junction, the pieces that carry on most nearly straight (directions read
 *              over STROKE_DIR_M, not one cell edge) continue as one street, greedily, up to a
 *              deflection of STROKE_MAX_DEG
 *   strokes    chains joined through their pairs
 *   straighten each stroke simplified as a whole (Douglas-Peucker, STROKE_SIMPLIFY × cell size)
 *   junctions  moved onto the straightened strokes that pass through them (the mean of the
 *              nearest points); strokes that end there end at the moved point
 * Returns the strokes as polylines, ready to cut into segments.
 */
function streetStrokes(G: Ground, cls: ArrayLike<number>): [number[], number[]][] {
  const sd = sides(G), nv = sd.vx.length, deg = new Int32Array(nv);
  const at: number[][] = Array.from({ length: nv }, () => []);
  for (let s = 0; s < cls.length; s++) {
    if (!cls[s]) continue;
    deg[sd.v0[s]]++; deg[sd.v1[s]]++;
    at[sd.v0[s]].push(s); at[sd.v1[s]].push(s);
  }
  // Chains, as vertex lists.
  const used = new Uint8Array(cls.length), chains: number[][] = [];
  const walk = (start: number, s0: number) => {
    const vs = [start];
    let v = start, s = s0;
    for (;;) {
      used[s] = 1;
      v = sd.v0[s] === v ? sd.v1[s] : sd.v0[s];
      vs.push(v);
      if (deg[v] !== 2) break;
      const next = at[v][0] === s ? at[v][1] : at[v][0];
      if (used[next]) break;
      s = next;
    }
    chains.push(vs);
  };
  for (let v = 0; v < nv; v++) if (deg[v] && deg[v] !== 2) for (const s of at[v]) if (!used[s]) walk(v, s);
  for (let s = 0; s < cls.length; s++) if (cls[s] && !used[s]) walk(sd.v0[s], s);  // loops with no junction
  // Each chain end's direction away from its junction, read over STROKE_DIR_M.
  const dirOf = (vs: number[], fromEnd: boolean): [number, number] => {
    const k0 = fromEnd ? vs.length - 1 : 0, step = fromEnd ? -1 : 1;
    let run = 0, k = k0;
    while (k + step >= 0 && k + step < vs.length && run < STROKE_DIR_M) {
      run += Math.sqrt((sd.vx[vs[k + step]] - sd.vx[vs[k]]) ** 2 + (sd.vy[vs[k + step]] - sd.vy[vs[k]]) ** 2);
      k += step;
    }
    return [sd.vx[vs[k]] - sd.vx[vs[k0]], sd.vy[vs[k]] - sd.vy[vs[k0]]];
  };
  // Chain ends at each junction (end e of chain c: 2c start, 2c+1 end), in chain order.
  const endsAt = new Map<number, number[]>();
  chains.forEach((vs, c) => {
    for (const e of [0, 1]) {
      const v = e ? vs[vs.length - 1] : vs[0];
      if (deg[v] >= 3) { let l = endsAt.get(v); if (!l) endsAt.set(v, (l = [])); l.push(2 * c + e); }
    }
  });
  const partner = new Int32Array(2 * chains.length).fill(-1), maxTurn = (STROKE_MAX_DEG * Math.PI) / 180;
  for (const v of [...endsAt.keys()].sort((a, b) => a - b)) {
    const ends = endsAt.get(v)!, pairs: [number, number, number][] = [];
    const dirs = ends.map((x) => dirOf(chains[x >> 1], (x & 1) === 1));
    for (let i = 0; i < ends.length; i++) for (let j = i + 1; j < ends.length; j++) {
      const [ux, uy] = dirs[i], [wx, wy] = dirs[j];
      const deflect = Math.PI - Math.atan2(Math.abs(ux * wy - uy * wx), ux * wx + uy * wy);
      if (deflect <= maxTurn) pairs.push([deflect, i, j]);
    }
    pairs.sort((p, q) => p[0] - q[0] || p[1] - q[1] || p[2] - q[2]);
    for (const [, i, j] of pairs) {
      if (partner[ends[i]] >= 0 || partner[ends[j]] >= 0) continue;
      partner[ends[i]] = ends[j]; partner[ends[j]] = ends[i];
    }
  }
  // Strokes: chains joined through their pairs. A stroke is a vertex list, with the indices
  // in it of the junctions it passes through.
  const inStroke = new Uint8Array(chains.length), strokes: { vs: number[]; joints: number[] }[] = [];
  for (let c0 = 0; c0 < chains.length; c0++) {
    if (inStroke[c0]) continue;
    inStroke[c0] = 1;
    let vs = chains[c0].slice();
    const joints: number[] = [];  // vertices (not indices) the stroke passes through
    // Forwards from the end of c0, then backwards from its start.
    for (const fwd of [true, false]) {
      let end = fwd ? 2 * c0 + 1 : 2 * c0;
      for (;;) {
        const p = partner[end];
        if (p < 0 || inStroke[p >> 1]) break;
        const c = p >> 1, cv = chains[c], enterAtStart = (p & 1) === 0;
        inStroke[c] = 1;
        const add = enterAtStart ? cv.slice(1) : cv.slice(0, -1).reverse();
        if (fwd) { joints.push(vs[vs.length - 1]); vs = vs.concat(add); } else { joints.push(vs[0]); vs = add.reverse().concat(vs); }
        end = enterAtStart ? 2 * c + 1 : 2 * c;  // leave by its other end
      }
    }
    strokes.push({ vs, joints });
  }
  // Straighten each stroke.
  const tol = STROKE_SIMPLIFY * G.grid.size;
  const lines = strokes.map(({ vs }) => {
    const xs = vs.map((v) => sd.vx[v]), ys = vs.map((v) => sd.vy[v]);
    const keep = simplify(xs, ys, tol);
    return { keep: keep.map((k) => vs[k]), xs: keep.map((k) => xs[k]), ys: keep.map((k) => ys[k]) };
  });
  // Junctions onto the strokes through them.
  const sumX = new Map<number, number>(), sumY = new Map<number, number>(), count = new Map<number, number>();
  strokes.forEach(({ joints }, k) => {
    for (const v of joints) {
      const [px, py] = project(lines[k].xs, lines[k].ys, sd.vx[v], sd.vy[v]);
      sumX.set(v, (sumX.get(v) ?? 0) + px); sumY.set(v, (sumY.get(v) ?? 0) + py); count.set(v, (count.get(v) ?? 0) + 1);
    }
  });
  const posX = (v: number) => (count.has(v) ? sumX.get(v)! / count.get(v)! : sd.vx[v]);
  const posY = (v: number) => (count.has(v) ? sumY.get(v)! / count.get(v)! : sd.vy[v]);
  // Each stroke: its ends, the straightened vertices between, and its junctions where they
  // now sit, in order along the straightened line.
  return strokes.map(({ vs, joints }, k) => {
    const L = lines[k], first = vs[0], last = vs[vs.length - 1];
    const isJoint = new Set(joints);
    const mid: [number, number, number, number][] = [];  // along, kind (0 vertex, 1 junction), x, y
    for (let i = 1; i < L.keep.length - 1; i++) {
      if (isJoint.has(L.keep[i])) continue;
      mid.push([project(L.xs, L.ys, L.xs[i], L.ys[i])[2], 0, L.xs[i], L.ys[i]]);
    }
    for (const v of joints) mid.push([project(L.xs, L.ys, sd.vx[v], sd.vy[v])[2], 1, posX(v), posY(v)]);
    mid.sort((p, q) => p[0] - q[0] || p[1] - q[1] || p[2] - q[2] || p[3] - q[3]);
    const xs = [posX(first), ...mid.map((m) => m[2]), posX(last)], ys = [posY(first), ...mid.map((m) => m[3]), posY(last)];
    return [xs, ys] as [number[], number[]];
  });
}

/** The existing streets of the buffer, those off this ground (cached per ground). */
const bufferCache = new WeakMap<Ground, number[][]>();
function bufferOf(G: Ground): number[][] {
  let hit = bufferCache.get(G);
  if (!hit) {
    const idx = groundIndex(G);
    hit = (G.syntaxStreets ?? []).filter(([x0, y0, x1, y1]) => !idx.has((x0 + x1) / 2, (y0 + y1) / 2));
    bufferCache.set(G, hit);
  }
  return hit;
}

/** The existing major roads over the design ground (only where the skeleton is landform:
 *  on a roads skeleton the design's primary streets already follow them). */
const roadCache = new WeakMap<Ground, number[][]>();
function roadsOn(G: Ground): number[][] {
  let hit = roadCache.get(G);
  if (!hit) {
    hit = [];
    if (G.skeleton?.source !== "roads") {
      const idx = groundIndex(G);
      for (const line of G.roads ?? []) for (let k = 1; k < line.length; k++) {
        const [x0, y0] = line[k - 1], [x1, y1] = line[k];
        if (idx.has((x0 + x1) / 2, (y0 + y1) / 2)) hit.push([x0, y0, x1, y1]);
      }
    }
    roadCache.set(G, hit);
  }
  return hit;
}

export function network(d: Design, G: Ground): Network {
  const B = new Builder();
  // A version 3 design's streets are its plan's; earlier designs' run on cell sides.
  const strokes: [number[], number[]][] = d.plan ? d.plan.streets.map((st) => [st.pts.map((p) => p[0]), st.pts.map((p) => p[1])])
    : d.street ? streetStrokes(G, d.street) : [];
  for (const [xs, ys] of strokes) {
    for (let k = 1; k < xs.length; k++) B.segment(B.vertex(xs[k - 1], ys[k - 1]), B.vertex(xs[k], ys[k]));
  }
  for (const [x0, y0, x1, y1] of roadsOn(G)) B.segment(B.vertex(x0, y0), B.vertex(x1, y1));
  const site = B.a.length, siteVerts = B.vx.length;
  const buf = bufferOf(G);
  for (const [x0, y0, x1, y1] of buf) B.segment(B.vertex(x0, y0), B.vertex(x1, y1));
  // Join buffer streets left dangling at the design ground's edge.
  const deg = new Int32Array(B.vx.length);
  for (let s = 0; s < B.a.length; s++) { deg[B.a[s]]++; deg[B.b[s]]++; }
  const idx = groundIndex(G), reach = G.grid.size + LINK_M;
  let links = 0;
  const nb = B.a.length;
  for (let s = site; s < nb; s++) for (const v of [B.a[s], B.b[s]]) {
    if (v < siteVerts || deg[v] !== 1 || !idx.near(B.vx[v], B.vy[v], reach)) continue;
    let best = -1, bd = LINK_M * LINK_M;
    for (let u = 0; u < siteVerts; u++) {
      const dd = (B.vx[u] - B.vx[v]) ** 2 + (B.vy[u] - B.vy[v]) ** 2;
      if (dd < bd) { bd = dd; best = u; }
    }
    if (best >= 0) { B.segment(best, v); deg[v]++; links++; }
  }
  const n = B.a.length, len = new Float64Array(n);
  for (let s = 0; s < n; s++) {
    const dx = B.vx[B.b[s]] - B.vx[B.a[s]], dy = B.vy[B.b[s]] - B.vy[B.a[s]];
    len[s] = Math.sqrt(dx * dx + dy * dy);
  }
  return { vx: Float64Array.from(B.vx), vy: Float64Array.from(B.vy), a: Int32Array.from(B.a), b: Int32Array.from(B.b),
    len, site, links };
}

// --- the segment graph -----------------------------------------------------------------

/** Per segment, its neighbours and the turn to each (CSR arrays). */
export interface Dual { start: Int32Array; to: Int32Array; cost: Int32Array }

export function dual(N: Network): Dual {
  const n = N.a.length, nv = N.vx.length;
  const at: number[][] = Array.from({ length: nv }, () => []);
  for (let s = 0; s < n; s++) { at[N.a[s]].push(s); at[N.b[s]].push(s); }
  const start = new Int32Array(n + 1), to: number[] = [], cost: number[] = [];
  for (let s = 0; s < n; s++) {
    start[s] = to.length;
    for (const v of [N.a[s], N.b[s]]) {
      // Arrive along s at v, leave along t.
      const p = N.a[s] === v ? N.b[s] : N.a[s];
      const ux = N.vx[v] - N.vx[p], uy = N.vy[v] - N.vy[p];
      for (const t of at[v]) {
        if (t === s) continue;
        const q = N.a[t] === v ? N.b[t] : N.a[t];
        const wx = N.vx[q] - N.vx[v], wy = N.vy[q] - N.vy[v];
        const turn = Math.atan2(Math.abs(ux * wy - uy * wx), ux * wx + uy * wy);
        to.push(t);
        cost.push(Math.floor((turn / (Math.PI / 2)) * TURN_UNITS + 0.5));
      }
    }
  }
  start[n] = to.length;
  return { start, to: Int32Array.from(to), cost: Int32Array.from(cost) };
}

// --- analysis --------------------------------------------------------------------------

export interface RadiusResult { nc: Float64Array; td: Float64Array; ch: Float64Array }

/** A binary heap of (cost, metric, segment) on typed arrays, smallest first, ties by metric
 *  then segment. Entries go stale when a segment's label improves; the reader skips them. */
class Heap {
  c: Int32Array; m: Float64Array; s: Int32Array; size = 0;
  constructor(cap: number) { this.c = new Int32Array(cap); this.m = new Float64Array(cap); this.s = new Int32Array(cap); }
  private less(i: number, j: number) {
    const ci = this.c[i], cj = this.c[j];
    if (ci !== cj) return ci < cj;
    const mi = this.m[i], mj = this.m[j];
    return mi !== mj ? mi < mj : this.s[i] < this.s[j];
  }
  private swap(i: number, j: number) {
    const c = this.c[i]; this.c[i] = this.c[j]; this.c[j] = c;
    const m = this.m[i]; this.m[i] = this.m[j]; this.m[j] = m;
    const s = this.s[i]; this.s[i] = this.s[j]; this.s[j] = s;
  }
  push(c: number, m: number, s: number) {
    if (this.size === this.c.length) {
      const grow = (a: any, A: any) => { const b = new A(a.length * 2); b.set(a); return b; };
      this.c = grow(this.c, Int32Array); this.m = grow(this.m, Float64Array); this.s = grow(this.s, Int32Array);
    }
    let i = this.size++;
    this.c[i] = c; this.m[i] = m; this.s[i] = s;
    while (i > 0) { const p = (i - 1) >> 1; if (!this.less(i, p)) break; this.swap(i, p); i = p; }
  }
  /** Pops the top into (topC, topM, topS). */
  topC = 0; topM = 0; topS = 0;
  pop() {
    this.topC = this.c[0]; this.topM = this.m[0]; this.topS = this.s[0];
    const last = --this.size;
    if (last > 0) {
      this.c[0] = this.c[last]; this.m[0] = this.m[last]; this.s[0] = this.s[last];
      for (let i = 0; ;) {
        const l = 2 * i + 1, r = l + 1;
        let k = i;
        if (l < this.size && this.less(l, k)) k = l;
        if (r < this.size && this.less(r, k)) k = r;
        if (k === i) break;
        this.swap(i, k); i = k;
      }
    }
  }
}

/**
 * Angular analysis at one radius. `origins`: the segments paths start from (integration is
 * reported for these; choice counts paths from these to every segment within the radius).
 */
export function analyse(N: Network, D: Dual, radius: number, origins: ArrayLike<number>): RadiusResult {
  const n = N.a.length, len = N.len, start = D.start, to = D.to, cost = D.cost;
  const nc = new Float64Array(n), td = new Float64Array(n), ch = new Float64Array(n);
  const dist = new Int32Array(n).fill(-1), metric = new Float64Array(n), sigma = new Float64Array(n), delta = new Float64Array(n);
  const done = new Uint8Array(n), order = new Int32Array(n), touched = new Int32Array(n);
  // Predecessors as linked lists in typed arrays: head per segment, then (value, next) per entry.
  const head = new Int32Array(n).fill(-1);
  let pv = new Int32Array(1024), pn = new Int32Array(1024), np = 0;
  const addPred = (t: number, s: number) => {
    if (np === pv.length) { const a = new Int32Array(np * 2), b = new Int32Array(np * 2); a.set(pv); b.set(pn); pv = a; pn = b; }
    pv[np] = s; pn[np] = head[t]; head[t] = np++;
  };
  const heap = new Heap(1024);
  for (let k = 0; k < origins.length; k++) {
    const o = origins[k];
    let nt = 0, no = 0;
    np = 0; heap.size = 0;
    dist[o] = 0; metric[o] = 0; sigma[o] = 1; touched[nt++] = o; heap.push(0, 0, o);
    let reached = 0, depth = 0;
    while (heap.size) {
      heap.pop();
      const c = heap.topC, m = heap.topM, s = heap.topS;
      if (done[s] || c !== dist[s] || m !== metric[s]) continue;
      done[s] = 1;
      order[no++] = s;
      if (s !== o) { reached++; depth += c; }
      const half = len[s] / 2;
      for (let e = start[s]; e < start[s + 1]; e++) {
        const t = to[e];
        if (done[t]) continue;
        const c2 = c + cost[e], m2 = m + half + len[t] / 2;
        if (m2 > radius) continue;
        const dt = dist[t];
        if (dt < 0 || c2 < dt || (c2 === dt && m2 < metric[t])) {
          if (dt < 0) touched[nt++] = t;
          dist[t] = c2; metric[t] = m2; sigma[t] = sigma[s]; head[t] = -1; addPred(t, s);
          heap.push(c2, m2, t);
        } else if (c2 === dt && m2 === metric[t]) {
          sigma[t] += sigma[s]; addPred(t, s);
        }
      }
    }
    nc[o] = reached; td[o] = depth / TURN_UNITS;
    // Choice: dependencies back along the paths.
    for (let i = no - 1; i > 0; i--) {
      const w = order[i], f = (1 + delta[w]) / sigma[w];
      for (let p = head[w]; p >= 0; p = pn[p]) delta[pv[p]] += sigma[pv[p]] * f;
      ch[w] += delta[w];
    }
    for (let i = 0; i < nt; i++) { const s = touched[i]; dist[s] = -1; done[s] = 0; sigma[s] = 0; delta[s] = 0; head[s] = -1; }
  }
  return { nc, td, ch };
}

/**
 * Depths from each origin on any segment graph (CSR), with no radius, by a bucket queue on the
 * integer turn costs (Dial 1969). Each segment s counts `weight[s]` times at its depth, plus
 * `offset[s]` (both optional: 1 and 0), so a condensed graph can stand for the whole network.
 */
export function depths(n: number, start: Int32Array, to: Int32Array, cost: Int32Array, origins: ArrayLike<number>,
  weight?: Float64Array, offset?: Float64Array): { nc: Float64Array; td: Float64Array } {
  const nc = new Float64Array(n), td = new Float64Array(n);
  let maxCost = 0;
  for (let e = 0; e < cost.length; e++) if (cost[e] > maxCost) maxCost = cost[e];
  const W = maxCost + 1;                     // circular buckets: every pending label is within W of the current
  // Bucket lists hold queue entries, not segments: a segment can wait in two buckets at once
  // (an old label and a better one), and the reader skips the stale entry.
  const bHead = new Int32Array(W).fill(-1), dist = new Int32Array(n).fill(-1), done = new Uint8Array(n);
  const touched = new Int32Array(n);
  let eNode = new Int32Array(Math.max(16, to.length + 1)), eNext = new Int32Array(eNode.length);
  for (let k = 0; k < origins.length; k++) {
    const o = origins[k];
    let nt = 0, ne = 0, pending = 0, cur = 0, reached = 0, depth = 0;
    const put = (t: number, c: number) => {
      if (ne === eNode.length) {
        const a = new Int32Array(ne * 2), b = new Int32Array(ne * 2); a.set(eNode); b.set(eNext); eNode = a; eNext = b;
      }
      const bb = c % W;
      eNode[ne] = t; eNext[ne] = bHead[bb]; bHead[bb] = ne++; pending++;
    };
    dist[o] = 0; touched[nt++] = o; put(o, 0);
    while (pending) {
      const b = cur % W, en = bHead[b];
      if (en < 0) { cur++; continue; }
      bHead[b] = eNext[en];
      pending--;
      const s = eNode[en];
      if (done[s] || dist[s] !== cur) continue;
      done[s] = 1;
      if (s !== o) {
        const w = weight ? weight[s] : 1;
        reached += w; depth += w * cur + (offset ? offset[s] : 0);
      }
      for (let e = start[s]; e < start[s + 1]; e++) {
        const t = to[e];
        if (done[t]) continue;
        const c2 = cur + cost[e];
        if (dist[t] < 0 || c2 < dist[t]) {
          if (dist[t] < 0) touched[nt++] = t;
          dist[t] = c2;
          put(t, c2);
        }
      }
    }
    nc[o] = reached; td[o] = depth / TURN_UNITS;
    for (let i = 0; i < nt; i++) { dist[touched[i]] = -1; done[touched[i]] = 0; }
  }
  return { nc, td };
}

/** Exact Rn integration for some origins: depths over the whole network. */
export const integrationRn = (N: Network, D: Dual, origins: ArrayLike<number>) =>
  depths(N.a.length, D.start, D.to, D.cost, origins);

/** Least-angle cost from one segment to every other (-1: unreached), by the same queue. */
export function costsFrom(n: number, start: Int32Array, to: Int32Array, cost: Int32Array, src: number): Int32Array {
  let maxCost = 0;
  for (let e = 0; e < cost.length; e++) if (cost[e] > maxCost) maxCost = cost[e];
  const W = maxCost + 1, bHead = new Int32Array(W).fill(-1), dist = new Int32Array(n).fill(-1), done = new Uint8Array(n);
  const eNode: number[] = [], eNext: number[] = [];
  let pending = 0, cur = 0;
  const put = (t: number, c: number) => { const bb = c % W; eNode.push(t); eNext.push(bHead[bb]); bHead[bb] = eNode.length - 1; pending++; };
  dist[src] = 0; put(src, 0);
  while (pending) {
    const b = cur % W, en = bHead[b];
    if (en < 0) { cur++; continue; }
    bHead[b] = eNext[en];
    pending--;
    const s = eNode[en];
    if (done[s] || dist[s] !== cur) continue;
    done[s] = 1;
    for (let e = start[s]; e < start[s + 1]; e++) {
      const t = to[e], c2 = cur + cost[e];
      if (!done[t] && (dist[t] < 0 || c2 < dist[t])) { dist[t] = c2; put(t, c2); }
    }
  }
  return dist;
}

// --- condensed Rn: the buffer reduced to its gateways -----------------------------------
//
// Outside the design ground nothing changes from design to design. So for Rn integration
// during a run, the buffer is reduced once per ground: each buffer street the design's
// streets join (a gateway) keeps its least-angle cost, through the buffer alone, to every
// buffer segment and to every other gateway. Per design, the graph is the site's segments, the
// links and the gateways, with gateways joined pairwise at their buffer costs. Each gateway
// stands for the buffer segments it is nearest to (by that cost), at their depth beyond it.
// Exact apart from that assignment: a segment reached more cheaply through another gateway
// from some origin is counted from its nearest one. docs/metrics.md gives the error.

interface BufferNet { n: number; dual: Dual; from: Map<number, Int32Array> }
const bufferNets = new WeakMap<Ground, BufferNet>();
function bufferNet(G: Ground): BufferNet {
  let hit = bufferNets.get(G);
  if (!hit) {
    const B = new Builder();
    for (const [x0, y0, x1, y1] of bufferOf(G)) B.segment(B.vertex(x0, y0), B.vertex(x1, y1));
    const N: Network = { vx: Float64Array.from(B.vx), vy: Float64Array.from(B.vy), a: Int32Array.from(B.a), b: Int32Array.from(B.b),
      len: new Float64Array(B.a.length), site: 0, links: 0 };
    hit = { n: B.a.length, dual: dual(N), from: new Map() };
    bufferNets.set(G, hit);
  }
  return hit;
}

/** Rn integration of the site's segments on the condensed network. */
export function integrationRnCondensed(N: Network, D: Dual, G: Ground): { nc: Float64Array; td: Float64Array } {
  const n = N.a.length, bn = bufferNet(G), first = N.site, last = n - N.links;  // buffer: first .. last-1
  if (last - first !== bn.n) throw new Error("the buffer network is out of step with the design's");
  const isBuf = (s: number) => s >= first && s < last;
  // Gateways: buffer segments next to a site or link segment.
  const gate: number[] = [], isGate = new Uint8Array(n);
  for (let s = 0; s < n; s++) {
    if (isBuf(s)) continue;
    for (let e = D.start[s]; e < D.start[s + 1]; e++) { const t = D.to[e]; if (isBuf(t) && !isGate[t]) { isGate[t] = 1; gate.push(t); } }
  }
  gate.sort((a, b) => a - b);
  const costs = gate.map((g) => {
    let c = bn.from.get(g - first);
    if (!c) { c = costsFrom(bn.n, bn.dual.start, bn.dual.to, bn.dual.cost, g - first); bn.from.set(g - first, c); }
    return c;
  });
  // The condensed graph: site and link segments, then the gateways. Each gateway stands for
  // the buffer segments nearest to it (ties: the lower index), itself included.
  const keep = new Int32Array(n).fill(-1), nodes: number[] = [];
  for (let s = 0; s < n; s++) if (!isBuf(s)) { keep[s] = nodes.length; nodes.push(s); }
  for (const g of gate) { keep[g] = nodes.length; nodes.push(g); }
  const m = nodes.length, weight = new Float64Array(m).fill(1), offset = new Float64Array(m);
  for (const g of gate) weight[keep[g]] = 0;
  for (let b = 0; b < bn.n; b++) {
    let best = -1, bc = 0;
    for (let k = 0; k < gate.length; k++) { const c = costs[k][b]; if (c >= 0 && (best < 0 || c < bc)) { best = k; bc = c; } }
    if (best >= 0) { weight[keep[gate[best]]]++; offset[keep[gate[best]]] += bc; }
  }
  const start = new Int32Array(m + 1), to: number[] = [], cost: number[] = [];
  for (let k = 0; k < m; k++) {
    start[k] = to.length;
    const s = nodes[k];
    for (let e = D.start[s]; e < D.start[s + 1]; e++) {
      const t = D.to[e];
      if (keep[t] >= 0 && !(isBuf(s) && isBuf(t))) { to.push(keep[t]); cost.push(D.cost[e]); }
    }
    if (isGate[s]) {
      // Gateway to gateway at the buffer's cost, except where a third gateway is strictly
      // cheaper on the way: that route is in the graph already, so no distance changes.
      const k1 = gate.indexOf(s), c = costs[k1];
      for (let k2 = 0; k2 < gate.length; k2++) {
        const g2 = gate[k2], c12 = c[g2 - first];
        if (k2 === k1 || c12 < 0) continue;
        let beaten = false;
        for (let k3 = 0; k3 < gate.length && !beaten; k3++) {
          if (k3 === k1 || k3 === k2) continue;
          const c13 = c[gate[k3] - first], c32 = costs[k3][g2 - first];
          if (c13 >= 0 && c32 >= 0 && c13 + c32 < c12) beaten = true;
        }
        if (!beaten) { to.push(keep[g2]); cost.push(c12); }
      }
    }
  }
  start[m] = to.length;
  const origins = Int32Array.from({ length: N.site }, (_, k) => k);
  const r = depths(m, start, Int32Array.from(to), Int32Array.from(cost), origins, weight, offset);
  const nc = new Float64Array(n), td = new Float64Array(n);
  for (const s of origins) { nc[s] = r.nc[s]; td[s] = r.td[s]; }
  return { nc, td };
}

export const nain = (nc: number, td: number) => Math.pow(nc, 1.2) / (td + 2);
export const nach = (ch: number, td: number) => Math.log(ch + 1) / Math.log(td + 3);

// --- per design ------------------------------------------------------------------------

/** The measures at one radius, for the site's segments. */
export interface Measures {
  radius: number;
  nc: Float64Array; td: Float64Array; nain: Float64Array;
  ch: Float64Array | null; nach: Float64Array | null;   // choice: R400 and R800 when exact, Rn on request
}

export interface Syntax {
  N: Network; D: Dual;
  local: Measures[];   // R400, R800 (reading it computes any not yet computed; localAt computes one)
  at: (radius: number) => Measures;
  rn: Measures;        // Rn within the 1 km buffer
  estimate: boolean;   // Rn integration on the condensed network, and no choice (a run's view)
}

/** Segments whose middle is within `radius` of a site segment's middle: every origin whose
 *  paths can reach a site segment within the radius (a straight line is never longer than a
 *  path), so choice at that radius counts all of them. */
export function reach(N: Network, radius: number): Int32Array {
  const n = N.a.length, B = radius, buckets = new Map<number, number[]>(), out: number[] = [];
  const mx = (s: number) => (N.vx[N.a[s]] + N.vx[N.b[s]]) / 2, my = (s: number) => (N.vy[N.a[s]] + N.vy[N.b[s]]) / 2;
  const key = (i: number, j: number) => i * 1048576 + j;
  for (let s = 0; s < N.site; s++) {
    const k = key(Math.floor(mx(s) / B), Math.floor(my(s) / B));
    let l = buckets.get(k);
    if (!l) buckets.set(k, (l = []));
    l.push(s);
  }
  for (let s = 0; s < n; s++) {
    if (s < N.site) { out.push(s); continue; }
    const x = mx(s), y = my(s), i0 = Math.floor(x / B), j0 = Math.floor(y / B);
    let near = false;
    for (let i = i0 - 1; i <= i0 + 1 && !near; i++) for (let j = j0 - 1; j <= j0 + 1 && !near; j++) {
      for (const t of buckets.get(key(i, j)) ?? []) if ((mx(t) - x) ** 2 + (my(t) - y) ** 2 <= radius * radius) { near = true; break; }
    }
    if (near) out.push(s);
  }
  return Int32Array.from(out);
}

function measures(radius: number, site: number, nc: ArrayLike<number>, td: ArrayLike<number>, ch: ArrayLike<number> | null): Measures {
  const m: Measures = {
    radius, nc: new Float64Array(site).fill(NaN), td: new Float64Array(site).fill(NaN), nain: new Float64Array(site).fill(NaN),
    ch: ch ? new Float64Array(site) : null, nach: ch ? new Float64Array(site) : null,
  };
  const set = (s: number) => {
    m.nc[s] = nc[s]; m.td[s] = td[s]; m.nain[s] = nain(nc[s], td[s]);
    if (ch) { m.ch![s] = ch[s] / 2; m.nach![s] = nach(ch[s] / 2, td[s]); }  // each pair was counted from both ends
  };
  for (let s = 0; s < site; s++) set(s);
  return m;
}

type Entry = { G: Ground; exact?: Syntax; estimate?: Syntax; choice?: Measures };
const cache = new WeakMap<Design, Entry>();
// Syntax depends only on the streets (and the ground), so designs with the same streets share
// it: in piecemeal growth every design after the first increment keeps the first's frame.
const byStreets = new WeakMap<Ground, Map<string, Entry>>();
export const SHARED_SYNTAX = 64;   // networks remembered per ground, most recent kept
const streetsKey = (d: Design) => d.plan ? d.plan.streets.map((st) => st.pts.join(";")).join("|")
  : d.street ? `v2:${d.street.join("")}` : "";
function entry(d: Design, G: Ground) {
  let e = cache.get(d);
  if (e && e.G === G) return e;
  let m = byStreets.get(G);
  if (!m) byStreets.set(G, (m = new Map()));
  const k = streetsKey(d);
  e = m.get(k);
  if (e) m.delete(k);
  else e = { G };
  m.set(k, e);
  if (m.size > SHARED_SYNTAX) m.delete(m.keys().next().value!);
  cache.set(d, e);
  return e;
}

/**
 * A design's space syntax. Exact: integration and choice at R400 and R800, Rn integration on
 * the whole network. Estimate (inside a run, when a syntax metric is an objective or a trait):
 * integration only, with Rn on the condensed network (integrationRnCondensed); what the page
 * shows is always exact.
 */
export function syntaxOf(d: Design, G: Ground, estimate = false): Syntax {
  const e = entry(d, G);
  const hit = estimate ? e.estimate ?? e.exact : e.exact;
  if (hit) return hit;
  const base = e.exact ?? e.estimate;
  const N = base?.N ?? network(d, G), D = base?.D ?? dual(N);
  const site = Int32Array.from({ length: N.site }, (_, k) => k);
  // Each radius is analysed when first read: a run's wholeness needs R400 and Rn, not R800.
  // Choice at a radius needs every origin within reach; integration needs only the site's.
  const radii = RADII.filter((r) => r !== Infinity), done = new Map<number, Measures>();
  const at = (r: number) => {
    let m = done.get(r);
    if (!m) {
      const res = analyse(N, D, r, estimate ? site : reach(N, r));
      done.set(r, (m = measures(r, N.site, res.nc, res.td, estimate ? null : res.ch)));
    }
    return m;
  };
  const rn = estimate && G.syntaxStreets?.length ? integrationRnCondensed(N, D, G) : integrationRn(N, D, site);
  const out = { N, D, at, rn: measures(Infinity, N.site, rn.nc, rn.td, null), estimate } as Syntax;
  Object.defineProperty(out, "local", { get: () => radii.map(at), enumerable: true });
  if (estimate) e.estimate = out; else e.exact = out;
  return out;
}

/** Exact Rn choice for a design: least-angle paths from every segment of the network (the
 *  site and the 1 km buffer). Seconds to a minute: for the design a person opens. */
export function choiceRn(d: Design, G: Ground, onProgress?: (done: number, of: number) => void): Measures {
  const e = entry(d, G);
  if (e.choice) return e.choice;
  const S = syntaxOf(d, G), n = S.N.a.length, ch = new Float64Array(n), td = new Float64Array(n), nc = new Float64Array(n);
  const step = 256;
  for (let k = 0; k < n; k += step) {
    const part = Int32Array.from({ length: Math.min(step, n - k) }, (_, j) => k + j);
    const r = analyse(S.N, S.D, Infinity, part);
    for (let s = 0; s < n; s++) ch[s] += r.ch[s];
    for (const s of part) { nc[s] = r.nc[s]; td[s] = r.td[s]; }
    onProgress?.(Math.min(n, k + step), n);
  }
  e.choice = measures(Infinity, S.N.site, nc, td, ch);
  return e.choice;
}
