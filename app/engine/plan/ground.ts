// What every vector design on a site shares, worked out once per ground and cached: the
// design ground's outline, a point → cell lookup, and the cleaned street skeleton.
import { corners } from "../graph.js";
import { sides } from "../streets.js";
import type { Ground } from "../types.js";
import { area, dist, smoothTrace, type Line, type Pt } from "./geom.js";

/** Nearest design cell to a point, within a cell radius (-1: off the design ground). */
const LOC_RES = 3;
export interface Locator { cell(p: Pt): number }

const locCache = new WeakMap<Ground, Locator>();
export function locator(G: Ground): Locator {
  const hit = locCache.get(G);
  if (hit) return hit;
  const s = G.grid.spacing, R = G.grid.size, buckets = new Map<number, number[]>();
  const key = (i: number, j: number) => (i + 32768) * 65536 + (j + 32768);
  for (let c = 0; c < G.n; c++) {
    const k = key(Math.floor(G.x[c] / s), Math.floor(G.y[c] / s)), b = buckets.get(k);
    if (b) b.push(c); else buckets.set(k, [c]);
  }
  const exact = ([x, y]: Pt) => {
    const i0 = Math.floor(x / s), j0 = Math.floor(y / s);
    let best = -1, bd = R * R;
    for (let i = i0 - 1; i <= i0 + 1; i++) for (let j = j0 - 1; j <= j0 + 1; j++) {
      for (const c of buckets.get(key(i, j)) ?? []) {
        const d = (G.x[c] - x) ** 2 + (G.y[c] - y) ** 2;
        if (d < bd || (d === bd && c < best)) { bd = d; best = c; }
      }
    }
    return best;
  };
  // A raster of the answer, LOC_RES metres a pixel, read at the pixel a point falls in (so a
  // point within about LOC_RES of a cell edge may get the neighbour: fine for growth, which
  // samples, and the metrics read the cells themselves).
  const [bx0, by0, bx1, by1] = G.bounds, pad = 2 * R, res = LOC_RES;
  const ox = bx0 - pad, oy = by0 - pad, W = Math.ceil((bx1 - bx0 + 2 * pad) / res), H = Math.ceil((by1 - by0 + 2 * pad) / res);
  // Filled cell by cell: only the pixels within a cell radius of its centre are asked.
  const ras = new Int32Array(W * H).fill(-1), k = Math.ceil(R / res) + 1;
  for (let c = 0; c < G.n; c++) {
    const ci = Math.floor((G.x[c] - ox) / res), cj = Math.floor((G.y[c] - oy) / res);
    for (let j = Math.max(0, cj - k); j <= Math.min(H - 1, cj + k); j++) for (let i = Math.max(0, ci - k); i <= Math.min(W - 1, ci + k); i++) {
      if (ras[j * W + i] !== -1) continue;
      ras[j * W + i] = exact([ox + (i + 0.5) * res, oy + (j + 0.5) * res]);
    }
  }
  const loc: Locator = {
    cell([x, y]) {
      const i = Math.floor((x - ox) / res), j = Math.floor((y - oy) / res);
      return i < 0 || j < 0 || i >= W || j >= H ? -1 : ras[j * W + i];
    },
  };
  locCache.set(G, loc);
  return loc;
}

/** The design ground's outline: closed rings of cell corners (outer rings anticlockwise,
 *  holes clockwise), not smoothed. A cell edge is on the outline when no other cell shares it;
 *  corners are matched within 20 cm. */
const outlineCache = new WeakMap<Ground, Line[]>();
export function outline(G: Ground): Line[] {
  const hit = outlineCache.get(G);
  if (hit) return hit;
  const shape = corners(G.grid), D = shape.length;
  // Corners within 20 cm are one corner: 50 cm buckets, each corner looks in the nine round it.
  const buckets = new Map<string, number[]>(), vx: number[] = [], vy: number[] = [];
  const vert = (x: number, y: number) => {
    const bx = Math.round(x * 2), by = Math.round(y * 2);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      for (const c of buckets.get(`${bx + dx},${by + dy}`) ?? []) if (Math.abs(vx[c] - x) < 0.2 && Math.abs(vy[c] - y) < 0.2) return c;
    }
    const v = vx.length;
    vx.push(x); vy.push(y);
    const k = `${bx},${by}`, l = buckets.get(k);
    if (l) l.push(v); else buckets.set(k, [v]);
    return v;
  };
  const edges = new Map<string, [number, number]>();
  for (let i = 0; i < G.n; i++) {
    const vs = shape.map(([dx, dy]) => vert(G.x[i] + dx, G.y[i] + dy));
    for (let k = 0; k < D; k++) {
      const a = vs[k], b = vs[(k + 1) % D], key = a < b ? `${a},${b}` : `${b},${a}`;
      if (edges.has(key)) edges.delete(key); else edges.set(key, [a, b]); // shared edges cancel
    }
  }
  const next = new Map<number, number[]>();
  for (const [a, b] of edges.values()) { const l = next.get(a); if (l) l.push(b); else next.set(a, [b]); }
  const out: Line[] = [];
  for (const [start] of next) {
    while (next.get(start)?.length) {
      const ring: Line = [];
      let v = start;
      for (let guard = 0; guard < 1e6; guard++) {
        ring.push([vx[v], vy[v]]);
        const l = next.get(v);
        if (!l || !l.length) break;
        const w = l.pop()!;
        if (w === start) break;
        v = w;
      }
      if (ring.length >= 3) out.push(ring);
    }
  }
  outlineCache.set(G, out);
  return out;
}

/** Distance from a point to the design ground's outline. */
export function toOutline(G: Ground, p: Pt): number {
  let best = Infinity;
  for (const r of outline(G)) for (let k = 0; k < r.length; k++) {
    const a = r[k], b = r[(k + 1) % r.length];
    const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
    const t = l2 ? Math.min(Math.max(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2, 0), 1) : 0;
    best = Math.min(best, Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy));
  }
  return best;
}

// --- the cleaned skeleton ------------------------------------------------------------------

/** Settings for cleaning (docs/streets.md). */
export const SKELETON = {
  RES: 4,          // m per pixel of the thinning raster
  MERGE_M: 14,     // sides are painted this far either side, so zigzags within ~2× merge
  ROAD_MERGE_M: 20, // wider for road skeletons, so a dual carriageway's two sides merge
  HOLE_M2: 4000,   // gaps enclosed by the paint smaller than this are filled (no ladder of loops)
  SPUR_M: 30,      // spurs shorter than this left by thinning are pruned
  SMOOTH_CELLS: 1.25, // Gaussian smoothing along a line, in cell spacings (smoothTrace): takes out
                      // the hex zigzag and the cell-to-cell wander. Roads too: they are traced on cell sides
  SPLINE_STEP_M: 6,
  SNAP_M: 20,      // an end this close to another line joins it
};

export interface SkeletonLine { cls: number; points: Line }

const skCache = new WeakMap<Ground, SkeletonLine[]>();

/** The site's skeleton as clean centrelines: its sides painted thick, so the two carriageways
 *  of a road and the zigzag of hex sides merge, thinned to one pixel (Zhang and Suen 1984),
 *  traced, spurs pruned, smoothed (smoothTrace) and fitted with splines; loose ends
 *  snapped to the nearest line. Each line keeps the highest class painted under it. */
export function skeletonLines(G: Ground): SkeletonLine[] {
  const hit = skCache.get(G);
  if (hit) return hit;
  const sk = G.skeleton, out: SkeletonLine[] = [];
  if (!sk || !sk.sides.length) { skCache.set(G, out); return out; }
  // On flat land the skeleton is the existing roads (pc/skeleton.py). v3 keeps only the major
  // ones (primary class: motorway to tertiary) fixed; the design replaces lesser roads inside
  // the site, and its own routes build the rest (docs/streets.md).
  const keep = Array.from(sk.sides, (_, k) => sk.source !== "roads" || sk.level[k] >= 3);
  const sd = sides(G), S = SKELETON, res = S.RES;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  sk.sides.forEach((sid, k) => { if (keep[k]) for (const v of [sd.v0[sid], sd.v1[sid]]) {
    x0 = Math.min(x0, sd.vx[v]); x1 = Math.max(x1, sd.vx[v]); y0 = Math.min(y0, sd.vy[v]); y1 = Math.max(y1, sd.vy[v]);
  } });
  if (!Number.isFinite(x0)) { skCache.set(G, out); return out; }
  const pad = S.ROAD_MERGE_M + 2 * res;
  x0 -= pad; y0 -= pad; x1 += pad; y1 += pad;
  const W = Math.ceil((x1 - x0) / res), H = Math.ceil((y1 - y0) / res);
  const img = new Uint8Array(W * H), cls = new Uint8Array(W * H);
  const r = (sk.source === "roads" ? S.ROAD_MERGE_M : S.MERGE_M) / res;
  sk.sides.forEach((sid, k) => {
    if (!keep[k]) return;
    const ax = (sd.vx[sd.v0[sid]] - x0) / res, ay = (sd.vy[sd.v0[sid]] - y0) / res;
    const bx = (sd.vx[sd.v1[sid]] - x0) / res, by = (sd.vy[sd.v1[sid]] - y0) / res;
    const c = sk.level[k];
    for (let j = Math.max(0, Math.floor(Math.min(ay, by) - r)); j <= Math.min(H - 1, Math.ceil(Math.max(ay, by) + r)); j++)
      for (let i = Math.max(0, Math.floor(Math.min(ax, bx) - r)); i <= Math.min(W - 1, Math.ceil(Math.max(ax, bx) + r)); i++) {
        const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
        const t = l2 ? Math.min(Math.max(((i + 0.5 - ax) * dx + (j + 0.5 - ay) * dy) / l2, 0), 1) : 0;
        if ((i + 0.5 - ax - t * dx) ** 2 + (j + 0.5 - ay - t * dy) ** 2 <= r * r) {
          img[j * W + i] = 1;
          if (c > cls[j * W + i]) cls[j * W + i] = c;
        }
      }
  });
  fillHoles(img, W, H, S.HOLE_M2 / (res * res));
  thin(img, W, H);
  const lines = trace(img, W, H);
  // Prune short spurs (an end joined to a junction), once.
  const ends = (l: number[]) => [l[0], l[l.length - 1]];
  const degree = new Map<number, number>();
  for (const l of lines) for (const e of ends(l)) degree.set(e, (degree.get(e) ?? 0) + 1);
  const kept = lines.filter((l) => {
    const [a, b] = ends(l), lenM = l.length * res;
    const spur = (degree.get(a) === 1) !== (degree.get(b) === 1);
    return !(spur && lenM < S.SPUR_M) && l.length >= 2;
  });
  for (const l of kept) {
    let pts: Line = l.map((p) => [x0 + ((p % W) + 0.5) * res, y0 + (Math.floor(p / W) + 0.5) * res]);
    pts = smoothTrace(pts, S.SMOOTH_CELLS * G.grid.spacing, S.SPLINE_STEP_M);
    let c = 0;
    for (const p of l) c = Math.max(c, cls[p]);
    out.push({ cls: c || 3, points: pts });
  }
  snapEnds(out, S.SNAP_M);
  skCache.set(G, out);
  return out;
}

/** Thin a raster to one-pixel lines and trace them (pixel indices), filling holes smaller
 *  than `holePx` first. Shared by the skeleton and the organic family. */
export function thinAndTrace(img: Uint8Array, W: number, H: number, holePx: number): number[][] {
  if (holePx > 0) fillHoles(img, W, H, holePx);
  thin(img, W, H);
  return trace(img, W, H);
}

/** Fill background regions not connected to the raster's border and smaller than `maxPx`. */
function fillHoles(img: Uint8Array, W: number, H: number, maxPx: number) {
  const seen = new Uint8Array(W * H);
  for (let start = 0; start < W * H; start++) {
    if (img[start] || seen[start]) continue;
    const q = [start];
    seen[start] = 1;
    let border = false;
    for (let h = 0; h < q.length; h++) {
      const p = q[h], i = p % W, j = (p - i) / W;
      if (i === 0 || j === 0 || i === W - 1 || j === H - 1) border = true;
      for (const n of [i > 0 ? p - 1 : -1, i < W - 1 ? p + 1 : -1, j > 0 ? p - W : -1, j < H - 1 ? p + W : -1]) {
        if (n >= 0 && !img[n] && !seen[n]) { seen[n] = 1; q.push(n); }
      }
    }
    if (!border && q.length <= maxPx) for (const p of q) img[p] = 1;
  }
}

/** Zhang-Suen thinning, in place. Only pixels still set are visited. */
function thin(img: Uint8Array, W: number, H: number) {
  let live: number[] = [];
  for (let p = 0; p < W * H; p++) if (img[p]) live.push(p);
  const nbr = new Uint8Array(8);
  for (let changed = true, guard = 0; changed && guard < 400; guard++) {
    changed = false;
    for (const step of [0, 1]) {
      const del: number[] = [];
      for (const p of live) {
        const i = p % W, j = (p - i) / W;
        if (i === 0 || j === 0 || i === W - 1 || j === H - 1) continue;
        nbr[0] = img[p - W]; nbr[1] = img[p - W + 1]; nbr[2] = img[p + 1]; nbr[3] = img[p + W + 1];
        nbr[4] = img[p + W]; nbr[5] = img[p + W - 1]; nbr[6] = img[p - 1]; nbr[7] = img[p - W - 1];
        let b = 0, a = 0;
        for (let k = 0; k < 8; k++) { b += nbr[k]; if (!nbr[k] && nbr[(k + 1) & 7]) a++; }
        if (b < 2 || b > 6 || a !== 1) continue;
        if (step === 0 ? nbr[0] * nbr[2] * nbr[4] || nbr[2] * nbr[4] * nbr[6] : nbr[0] * nbr[2] * nbr[6] || nbr[0] * nbr[4] * nbr[6]) continue;
        del.push(p);
      }
      for (const p of del) img[p] = 0;
      if (del.length) changed = true;
    }
    live = live.filter((p) => img[p]);
  }
}

/** Trace one-pixel lines into chains between ends and junctions (pixel indices). A diagonal
 *  neighbour counts only when no orthogonal pixel already joins the two, so the corners of a
 *  staircase are not taken for junctions. */
function trace(img: Uint8Array, W: number, H: number): number[][] {
  const set = (i: number, j: number) => i >= 0 && j >= 0 && i < W && j < H && img[j * W + i] === 1;
  const nb = (p: number) => {
    const i = p % W, j = (p - i) / W, out: number[] = [];
    for (const [di, dj] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) if (set(i + di, j + dj)) out.push((j + dj) * W + i + di);
    for (const [di, dj] of [[1, -1], [1, 1], [-1, 1], [-1, -1]]) {
      if (set(i + di, j + dj) && !set(i + di, j) && !set(i, j + dj)) out.push((j + dj) * W + i + di);
    }
    return out;
  };
  const deg = new Map<number, number>();
  for (let p = 0; p < W * H; p++) if (img[p]) deg.set(p, nb(p).length);
  const node = (p: number) => deg.get(p) !== 2;
  const usedEdge = new Set<string>(), lines: number[][] = [];
  const ek = (a: number, b: number) => (a < b ? `${a},${b}` : `${b},${a}`);
  for (const [p] of deg) {
    if (!node(p)) continue;
    for (const q0 of nb(p)) {
      if (usedEdge.has(ek(p, q0))) continue;
      const chain = [p, q0];
      usedEdge.add(ek(p, q0));
      let prev = p, cur = q0;
      while (!node(cur)) {
        const nx = nb(cur).find((x) => x !== prev && !usedEdge.has(ek(cur, x)));
        if (nx === undefined) break;
        usedEdge.add(ek(cur, nx)); chain.push(nx); prev = cur; cur = nx;
      }
      lines.push(chain);
    }
  }
  // Closed loops with no junction at all.
  for (const [p] of deg) {
    if (node(p) || nb(p).every((x) => usedEdge.has(ek(p, x)))) continue;
    const chain = [p];
    let prev = -1, cur = p;
    for (;;) {
      const nx = nb(cur).find((x) => x !== prev && !usedEdge.has(ek(cur, x)));
      if (nx === undefined) break;
      usedEdge.add(ek(cur, nx)); chain.push(nx); prev = cur; cur = nx;
      if (cur === p) break;
    }
    if (chain.length > 2) lines.push(chain);
  }
  return lines;
}

/** Join each loose end to the nearest point of another line within `r` (a short straight join). */
function snapEnds(lines: SkeletonLine[], r: number) {
  const endPts = (l: SkeletonLine) => [l.points[0], l.points[l.points.length - 1]];
  lines.forEach((l, k) => {
    for (const [e, atStart] of [[l.points[0], true], [l.points[l.points.length - 1], false]] as [Pt, boolean][]) {
      // already meets another line's end or body?
      let best: Pt | null = null, bd = r;
      lines.forEach((m, j) => {
        if (j === k) return;
        for (const p of m.points) { const d = dist(e, p); if (d < bd) { bd = d; best = p; } }
      });
      if (!best || bd < 0.5) continue;
      if (atStart) l.points.unshift(best); else l.points.push(best);
    }
  });
  void endPts; void area;
}
