// Connectivity found the way Frei Otto found path systems (docs/streets.md; architecture-v3 5.1).
//
// Otto's wet-thread machine joined points with threads a little longer than the straight
// line; wetted, the threads drew together into shared routes, trading total length against
// detour. Here the same trade is made on a cost surface:
//
//   lattice    a square lattice (LATTICE_M) over the design ground, each node joined to 16
//              neighbours, so routes aren't bent to grid angles
//   cost       length × (1 + slope + heat) × valley crossing; cheaper on ridges and along
//              the skeleton; design water can't be crossed, design green is dearer
//   routes     destination pairs in order of demand; each runs on the least-cost path, and an
//              edge an earlier route uses costs 1 / (1 + detour) of what it did, so routes with
//              room to detour fold into shared trunks
//
// Fast enough to run on every design (a few milliseconds), and exact: costs are integers
// (millimetres) and ties break on node index, so the Python port (Milestone B) can match it.
import { RIDGE_MIN_HA, WATER, LANDSCAPE } from "../config.js";
import type { Design, Ground } from "../types.js";
import { dist, smoothTrace, type Line, type Pt } from "./geom.js";
import { locator, outline, skeletonLines } from "./ground.js";

export const ROUTE = {
  LATTICE_M: 50,
  SMOOTH_M: 30,         // Gaussian smoothing of a route along its length (smoothTrace): the lattice's steps go
  SLOPE_W: 20,          // cost × (1 + 20 × slope): a 5% slope doubles it
  HEAT_W: 0.5,          // cost × (1 + 0.5 × surface heat, 0..1 over the site)
  CROSSING: 6,          // crossing a valley or its buffer costs six times as much
  RIDGE: 0.8,           // running on a strong ridge costs less
  SKELETON: 0.5,        // running along the skeleton costs half
  SKELETON_NEAR_M: 30,  // a node this close to the skeleton is on it
  GREEN: 1.5,           // through the design's green
  NEIGHBOURS: 2,        // each destination is paired with its nearest few others
  MIN_DEMAND: 0.02,
  PER_KIND: 6,          // at most this many destinations of each kind of place
  PLACE_REACH_M: 150,   // places this far outside the design ground still draw routes
};

export interface Lattice {
  n: number; x: Float64Array; y: Float64Array; cell: Int32Array;   // nodes, and the design cell under each
  nb: Int32Array; base: Float64Array;                                // 16 per node (-1: none), base cost (mm)
  canon: Int32Array;                                                 // each edge's one key, whichever end it is seen from
  gates: number[];                                                   // nodes where existing roads meet the design ground
  gatePts: Pt[];                                                     // the meeting points themselves
  onSkeleton: Uint8Array;
}

const OFFS: [number, number][] = [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [-1, -1], [1, -1],
  [2, 1], [1, 2], [-1, 2], [-2, 1], [-2, -1], [-1, -2], [1, -2], [2, -1]];

const latCache = new WeakMap<Ground, Lattice>();

/** The site's routing lattice and its base costs (cached per ground). */
export function lattice(G: Ground): Lattice {
  const hit = latCache.get(G);
  if (hit) return hit;
  const R = ROUTE, s = R.LATTICE_M, loc = locator(G), [bx0, by0, bx1, by1] = G.bounds;
  const nx = Math.ceil((bx1 - bx0) / s) + 1, ny = Math.ceil((by1 - by0) / s) + 1;
  const id = new Int32Array(nx * ny).fill(-1);
  const xs: number[] = [], ys: number[] = [], cells: number[] = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const p: Pt = [bx0 + i * s, by0 + j * s], c = loc.cell(p);
    if (c < 0) continue;
    id[j * nx + i] = xs.length; xs.push(p[0]); ys.push(p[1]); cells.push(c);
  }
  const n = xs.length, nb = new Int32Array(n * 16).fill(-1), base = new Float64Array(n * 16);
  // Surface heat over the site, 0..1.
  let t0 = Infinity, t1 = -Infinity;
  if (G.lst) for (const t of G.lst) if (Number.isFinite(t)) { t0 = Math.min(t0, t); t1 = Math.max(t1, t); }
  const heat = (c: number) => (G.lst && Number.isFinite(G.lst[c]) && t1 > t0 ? (G.lst[c] - t0) / (t1 - t0) : 0);
  const sk = skeletonLines(G), onSk = new Uint8Array(n);
  for (let v = 0; v < n; v++) {
    for (const l of sk) for (let k = 1; k < l.points.length; k++) {
      const a = l.points[k - 1], b = l.points[k], dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
      const t = l2 ? Math.min(Math.max(((xs[v] - a[0]) * dx + (ys[v] - a[1]) * dy) / l2, 0), 1) : 0;
      if (Math.hypot(xs[v] - a[0] - t * dx, ys[v] - a[1] - t * dy) <= R.SKELETON_NEAR_M) { onSk[v] = 1; break; }
    }
  }
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const a = id[j * nx + i];
    if (a < 0) continue;
    OFFS.forEach(([di, dj], k) => {
      const ii = i + di, jj = j + dj;
      if (ii < 0 || jj < 0 || ii >= nx || jj >= ny) return;
      const b = id[jj * nx + ii];
      if (b < 0) return;
      // The midpoint must be on the design ground too (no jumping across a gap).
      if (loc.cell([(xs[a] + xs[b]) / 2, (ys[a] + ys[b]) / 2]) < 0) return;
      const len = Math.hypot(xs[b] - xs[a], ys[b] - ys[a]), ca = cells[a], cb = cells[b];
      let f = 1;
      if (G.z) f *= 1 + R.SLOPE_W * Math.abs(G.z[cb] - G.z[ca]) / len;
      f *= 1 + R.HEAT_W * (heat(ca) + heat(cb)) / 2;
      if (G.vbuf && (G.vbuf[ca] || G.vbuf[cb])) f *= R.CROSSING;
      if (G.ridge && G.ridge[ca] >= RIDGE_MIN_HA && G.ridge[cb] >= RIDGE_MIN_HA) f *= R.RIDGE;
      if (onSk[a] && onSk[b]) f *= R.SKELETON;
      nb[a * 16 + k] = b;
      base[a * 16 + k] = Math.round(len * f * 1000);
    });
  }
  const canon = new Int32Array(n * 16).fill(-1);
  for (let a = 0; a < n; a++) for (let k = 0; k < 16; k++) {
    const b = nb[a * 16 + k];
    if (b < 0) continue;
    if (a < b) { canon[a * 16 + k] = a * 16 + k; continue; }
    for (let kk = 0; kk < 16; kk++) if (nb[b * 16 + kk] === a) { canon[a * 16 + k] = b * 16 + kk; break; }
  }
  // Gates: where existing roads or the skeleton cross the design ground's outline.
  const gatePts: Pt[] = [];
  const rings = outline(G);
  const crossesOutline = (a: Pt, b: Pt) => {
    for (const r of rings) for (let k = 0; k < r.length; k++) {
      const c = r[k], d = r[(k + 1) % r.length];
      const den = (b[0] - a[0]) * (d[1] - c[1]) - (b[1] - a[1]) * (d[0] - c[0]);
      if (Math.abs(den) < 1e-12) continue;
      const u = ((c[0] - a[0]) * (d[1] - c[1]) - (c[1] - a[1]) * (d[0] - c[0])) / den;
      const v = ((c[0] - a[0]) * (b[1] - a[1]) - (c[1] - a[1]) * (b[0] - a[0])) / den;
      if (u >= 0 && u <= 1 && v >= 0 && v <= 1) gatePts.push([a[0] + u * (b[0] - a[0]), a[1] + u * (b[1] - a[1])]);
    }
  };
  for (const r of G.roads ?? []) for (let k = 1; k < r.length; k++) crossesOutline(r[k - 1], r[k]);
  for (const l of sk) for (let k = 1; k < l.points.length; k++) crossesOutline(l.points[k - 1], l.points[k]);
  // One gate per cluster (within 60 m), the first found.
  const kept: Pt[] = [];
  for (const p of gatePts) if (!kept.some((q) => dist(p, q) < 60)) kept.push(p);
  const nearestNode = (p: Pt) => {
    let best = -1, bd = Infinity;
    for (let v = 0; v < n; v++) { const d = (xs[v] - p[0]) ** 2 + (ys[v] - p[1]) ** 2; if (d < bd) { bd = d; best = v; } }
    return best;
  };
  const gates = kept.map(nearestNode);
  const L: Lattice = { n, x: Float64Array.from(xs), y: Float64Array.from(ys), cell: Int32Array.from(cells), nb, base, canon,
    gates, gatePts: kept, onSkeleton: onSk };
  latCache.set(G, L);
  return L;
}

/** Places (Overture) on or within PLACE_REACH_M of the design ground, per site. */
const placeCache = new WeakMap<Ground, Record<"transit" | "schools" | "shops", Pt[]>>();
function placesNear(G: Ground) {
  const hit = placeCache.get(G);
  if (hit) return hit;
  const loc = locator(G), rings = outline(G), reach = ROUTE.PLACE_REACH_M;
  const near = (pts: [number, number][] | undefined) => (pts ?? []).filter((p) => {
    if (loc.cell(p) >= 0) return true;
    for (const r of rings) for (let k = 0; k < r.length; k++) if (Math.abs(r[k][0] - p[0]) < reach && Math.abs(r[k][1] - p[1]) < reach && dist(r[k], p) < reach) return true;
    return false;
  });
  const out = { transit: near(G.activities?.transit), schools: near(G.activities?.schools), shops: near(G.activities?.shops) };
  placeCache.set(G, out);
  return out;
}

export interface Destination { node: number; kind: "gate" | "centre" | "transit" | "school" | "market"; at: Pt }

/** A binary heap of (cost, node), smallest first, ties on node. */
class Heap {
  private c: number[] = []; private v: number[] = [];
  get size() { return this.c.length; }
  push(cost: number, node: number) {
    this.c.push(cost); this.v.push(node);
    let i = this.c.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.less(i, p)) { this.swap(i, p); i = p; } else break;
    }
  }
  pop(): [number, number] {
    const top: [number, number] = [this.c[0], this.v[0]];
    const lc = this.c.pop()!, lv = this.v.pop()!;
    if (this.c.length) {
      this.c[0] = lc; this.v[0] = lv;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < this.c.length && this.less(l, m)) m = l;
        if (r < this.c.length && this.less(r, m)) m = r;
        if (m === i) break;
        this.swap(i, m); i = m;
      }
    }
    return top;
  }
  private less(a: number, b: number) { return this.c[a] < this.c[b] || (this.c[a] === this.c[b] && this.v[a] < this.v[b]); }
  private swap(a: number, b: number) {
    [this.c[a], this.c[b]] = [this.c[b], this.c[a]]; [this.v[a], this.v[b]] = [this.v[b], this.v[a]];
  }
}

export interface RouteGenes {
  detour: number; w_gates: number; w_centres: number; w_transit: number; w_schools: number; w_markets: number;
}

export interface Routes {
  /** Lattice edges used, keyed a*16+k (a < b's side as stored), with the demand they carry. */
  used: Map<number, number>;
  dests: Destination[];
  lines: Line[];          // the routes as smoothed centrelines
}

/** Route the design's destinations over the lattice, merging by the detour gene. */
export function route(G: Ground, d: Design, g: RouteGenes, centres: Pt[]): Routes {
  const L = lattice(G), R = ROUTE, n = L.n;
  // This design's costs: no route through its water; dearer through its green.
  const blocked = new Uint8Array(n), green = new Uint8Array(n);
  for (let v = 0; v < n; v++) { const u = d.use[L.cell[v]]; if (u === WATER) blocked[v] = 1; else if (u === LANDSCAPE) green[v] = 1; }
  // Destinations: gates, centres, places (each kind spread out, at most PER_KIND).
  const nearestFree = (p: Pt) => {
    let best = -1, bd = Infinity;
    for (let v = 0; v < n; v++) {
      if (blocked[v]) continue;
      const dd = (L.x[v] - p[0]) ** 2 + (L.y[v] - p[1]) ** 2;
      if (dd < bd) { bd = dd; best = v; }
    }
    return best;
  };
  const dests: Destination[] = [];
  const add = (kind: Destination["kind"], pts: Pt[], weight: number) => {
    if (weight <= 0.05 || !pts.length) return;
    const chosen: Pt[] = [];
    // Spread out: farthest point first from the first.
    const pool = [...pts];
    while (chosen.length < R.PER_KIND && pool.length) {
      let best = 0, bd = -1;
      pool.forEach((p, k) => {
        const dmin = chosen.length ? Math.min(...chosen.map((c) => dist(c, p))) : Infinity;
        if (dmin > bd) { bd = dmin; best = k; }
      });
      if (chosen.length && bd < 120) break;
      chosen.push(pool.splice(best, 1)[0]);
    }
    for (const p of chosen) {
      const v = nearestFree(p);
      if (v >= 0 && !dests.some((x) => x.node === v)) dests.push({ node: v, kind, at: p });
    }
  };
  L.gates.forEach((v, k) => { if (!blocked[v] && g.w_gates > 0.05) dests.push({ node: v, kind: "gate", at: L.gatePts[k] }); });
  add("centre", centres, g.w_centres);
  const pl = placesNear(G);
  add("transit", pl.transit, g.w_transit);
  add("school", pl.schools, g.w_schools);
  add("market", pl.shops, g.w_markets);
  const weight = (x: Destination) => ({ gate: g.w_gates, centre: g.w_centres, transit: g.w_transit, school: g.w_schools, market: g.w_markets })[x.kind];
  // Pairs: each destination with its nearest few, and each with its nearest gate.
  const pairs = new Map<string, number>();
  dests.forEach((a, i) => {
    const others = dests.map((b, j) => [j, dist(a.at, b.at)] as [number, number]).filter(([j]) => j !== i).sort((p, q) => p[1] - q[1] || p[0] - q[0]);
    const picks = others.slice(0, R.NEIGHBOURS).map(([j]) => j);
    const gate = others.find(([j]) => dests[j].kind === "gate");
    if (gate && !picks.includes(gate[0])) picks.push(gate[0]);
    for (const j of picks) {
      const key = i < j ? `${i},${j}` : `${j},${i}`, dd = dist(a.at, dests[j].at);
      const demand = (weight(a) * weight(dests[j])) / (1 + dd / 500);
      if (demand >= R.MIN_DEMAND) pairs.set(key, demand);
    }
  });
  const order = [...pairs].sort((p, q) => q[1] - p[1] || (p[0] < q[0] ? -1 : 1));
  // Route in order; used edges get cheaper.
  const used = new Map<number, number>(), discount = 1 / (1 + g.detour);
  const ekey = (a: number, k: number) => L.canon[a * 16 + k];
  const cost = new Float64Array(n), via = new Int32Array(n);
  for (const [key, demand] of order) {
    const [i, j] = key.split(",").map(Number), src = dests[i].node, dst = dests[j].node;
    cost.fill(Infinity); via.fill(-1);
    cost[src] = 0;
    const h = new Heap();
    h.push(0, src);
    while (h.size) {
      const [c, a] = h.pop();
      if (c > cost[a]) continue;
      if (a === dst) break;
      for (let k = 0; k < 16; k++) {
        const b = L.nb[a * 16 + k];
        if (b < 0 || (blocked[b] && b !== dst)) continue;
        let e = L.base[a * 16 + k];
        if (green[a] || green[b]) e *= ROUTE.GREEN;
        if (used.has(ekey(a, k))) e *= discount;
        const nc = c + Math.round(e);
        if (nc < cost[b]) { cost[b] = nc; via[b] = a * 16 + k; h.push(nc, b); }
      }
    }
    if (!Number.isFinite(cost[dst])) continue;
    for (let v = dst; v !== src;) {
      const e = via[v], a = Math.floor(e / 16), k = e % 16, kk = ekey(a, k);
      used.set(kk, (used.get(kk) ?? 0) + demand);
      v = a;
    }
  }
  return { used, dests, lines: chains(L, used) };
}

/** The used lattice edges as chains between junctions and ends, smoothed. */
function chains(L: Lattice, used: Map<number, number>): Line[] {
  const adj = new Map<number, number[]>();
  const link = (a: number, b: number) => { const l = adj.get(a); if (l) l.push(b); else adj.set(a, [b]); };
  for (const e of used.keys()) { const a = Math.floor(e / 16), b = L.nb[e]; link(a, b); link(b, a); }
  const seen = new Set<string>(), out: Line[] = [];
  const key = (a: number, b: number) => (a < b ? `${a},${b}` : `${b},${a}`);
  const node = (v: number) => (adj.get(v)?.length ?? 0) !== 2;
  const starts = [...adj.keys()].sort((a, b) => a - b);
  for (const s of [...starts.filter(node), ...starts]) {
    for (const t of (adj.get(s) ?? []).slice().sort((a, b) => a - b)) {
      if (seen.has(key(s, t))) continue;
      const chain = [s, t];
      seen.add(key(s, t));
      let prev = s, cur = t;
      while (!node(cur)) {
        const nx = adj.get(cur)!.find((x) => x !== prev && !seen.has(key(cur, x)));
        if (nx === undefined) break;
        seen.add(key(cur, nx)); chain.push(nx); prev = cur; cur = nx;
      }
      const pts: Line = chain.map((v) => [L.x[v], L.y[v]]);
      out.push(pts.length > 2 ? smoothTrace(pts, ROUTE.SMOOTH_M, 8) : pts);
    }
  }
  return out;
}
