// Streets on cell edges (pc/streets.py; docs/landform.md).
//
// Streets run along the sides of cells, never through them: a street on a 20 m hex would be
// 35 m wide. Each street side takes half its width from the cell on either side, and that
// comes out of the cell's buildable area.
//
//   sides      every side of every design cell, listed once, with its two end vertices
//   skeleton   the primary streets, fixed per site (pc/skeleton.py, carried on the Ground)
//   streets    the secondary streets and lanes a genome's street genes ask for, grown inside
//              the skeleton
//
// Same arithmetic, in the same order, as the Python file, so both engines give the same
// streets for the same genome.
import {
  MIN_STREET_SLOPE, PRIMARY_W_M, STREET_LANE_W, STREET_SECONDARY_W, STREET_SHARE_MAX,
} from "./config.js";
import { links } from "./metrics/network.js";
import type { Ground, Settings } from "./types.js";

export const LANE = 1, SECONDARY = 2, PRIMARY = 3;

export interface Sides {
  n: number; D: number;
  cell: Int32Array; dir: Int8Array; other: Int32Array;  // per side: listed under, direction, neighbour (-1: edge)
  v0: Int32Array; v1: Int32Array;                        // per side: end vertices
  vx: Float64Array; vy: Float64Array;                    // per vertex
  at: Int32Array;                                        // per cell and direction (n × D): the side there
}

/** A cell's outline as offsets from its centre (as pc/streets.py computes them). */
function cornersOf(G: Ground): [number, number][] {
  const s = G.grid.size;
  if (G.grid.type === "quad") { const h = s / 2; return [[h, h], [-h, h], [-h, -h], [h, -h]]; }
  return [30, 90, 150, 210, 270, 330].map((d) => [s * Math.cos((d * Math.PI) / 180), s * Math.sin((d * Math.PI) / 180)]);
}

const sideCache = new WeakMap<Ground, Sides>();

/** Every side of every design cell once: cells in turn, directions in turn, a side already
 *  listed under its neighbour skipped. Vertices are cell corners matched at 0.1 m. */
export function sides(G: Ground): Sides {
  const hit = sideCache.get(G);
  if (hit) return hit;
  const L = links(G), n = G.n, D = G.deg;
  const nbrIn = new Int32Array(n * D).fill(-1);
  for (let i = 0; i < n; i++) for (let k = 0; k < D; k++) {
    const j = G.nbr[i * D + k];
    if (j >= 0) nbrIn[i * D + L.dir[i * D + k]] = j;
  }
  const shape = cornersOf(G), vid = new Map<number, number>(), vx: number[] = [], vy: number[] = [];
  const vertex = (x: number, y: number) => {
    const key = Math.floor(x * 10 + 0.5) * 4194304 + Math.floor(y * 10 + 0.5);
    let v = vid.get(key);
    if (v === undefined) { v = vx.length; vid.set(key, v); vx.push(x); vy.push(y); }
    return v;
  };
  const cell: number[] = [], dir: number[] = [], other: number[] = [], v0: number[] = [], v1: number[] = [];
  const at = new Int32Array(n * D).fill(-1);
  for (let i = 0; i < n; i++) for (let a = 0; a < D; a++) {
    const j = nbrIn[i * D + a];
    if (j >= 0 && j < i) continue;
    const c0 = shape[(a - 1 + D) % D], c1 = shape[a], sid = cell.length;
    cell.push(i); dir.push(a); other.push(j);
    v0.push(vertex(G.x[i] + c0[0], G.y[i] + c0[1]));
    v1.push(vertex(G.x[i] + c1[0], G.y[i] + c1[1]));
    at[i * D + a] = sid;
    if (j >= 0) at[j * D + ((a + D / 2) % D)] = sid;
  }
  const out: Sides = {
    n, D, cell: Int32Array.from(cell), dir: Int8Array.from(dir), other: Int32Array.from(other),
    v0: Int32Array.from(v0), v1: Int32Array.from(v1), vx: Float64Array.from(vx), vy: Float64Array.from(vy), at,
  };
  sideCache.set(G, out);
  return out;
}

/** Each vertex's sides, in side order. */
const adjCache = new WeakMap<Sides, [number, number][][]>();
export function adjacency(sd: Sides): [number, number][][] {
  let adj = adjCache.get(sd);
  if (!adj) {
    adj = Array.from({ length: sd.vx.length }, () => []);
    for (let s = 0; s < sd.cell.length; s++) { adj[sd.v0[s]].push([sd.v1[s], s]); adj[sd.v1[s]].push([sd.v0[s], s]); }
    adjCache.set(sd, adj);
  }
  return adj;
}

/** The median slope between neighbouring cells (for contour streets). */
const slopeCache = new WeakMap<Ground, number>();
function medianSlope(G: Ground): number {
  let v = slopeCache.get(G);
  if (v === undefined) {
    const s: number[] = [];
    for (let i = 0; i < G.n; i++) for (let k = 0; k < G.deg; k++) {
      const j = G.nbr[i * G.deg + k];
      if (j > i) s.push(Math.abs(G.z![i] - G.z![j]) / G.grid.spacing);
    }
    s.sort((a, b) => a - b);
    v = s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0;
    slopeCache.set(G, v);
  }
  return v;
}

/** Metres from the nearest valley cell, by steps (for streets parallel to the valleys). */
const valleyCache = new WeakMap<Ground, Float64Array | null>();
function valleyDistance(G: Ground): Float64Array | null {
  if (valleyCache.has(G)) return valleyCache.get(G)!;
  let out: Float64Array | null = null;
  if (G.valley && G.valley.some((v) => v > 0)) {
    const dist = new Int32Array(G.n).fill(-1), q: number[] = [];
    for (let i = 0; i < G.n; i++) if (G.valley[i] > 0) { dist[i] = 0; q.push(i); }
    for (let h = 0; h < q.length; h++) {
      const i = q[h];
      for (let k = 0; k < G.deg; k++) {
        const j = G.nbr[i * G.deg + k];
        if (j >= 0 && dist[j] < 0) { dist[j] = dist[i] + 1; q.push(j); }
      }
    }
    let top = 0;
    for (let i = 0; i < G.n; i++) top = Math.max(top, dist[i]);
    out = Float64Array.from(dist, (d) => (d < 0 ? top + 1 : d) * G.grid.spacing);
  }
  valleyCache.set(G, out);
  return out;
}

/** The street field a genome asks for: first-family streets follow its level lines. 0..1/3:
 *  contours (ground height over the median slope, in metres); 1/3..2/3: parallel to the
 *  valleys (distance from them); 2/3..1: a fixed bearing (0 to 180°). Without contours
 *  (flat land) or valleys to follow, the bearing is used, from the same gene. */
function field(G: Ground, orientation: number): Float64Array {
  const mode = Math.min(Math.floor(orientation * 3), 2), t = orientation * 3 - mode;
  // On flat land the heights are noise, so contours mean nothing: use the bearing.
  const flat = (G.meta.landform?.relief.class ?? "flat") === "flat";
  if (mode === 0 && G.z && !flat) {
    const s = Math.max(medianSlope(G), MIN_STREET_SLOPE);
    return Float64Array.from(G.z, (z) => z / s);
  }
  if (mode === 1) { const v = valleyDistance(G); if (v) return v; }
  const th = t * Math.PI, c = Math.cos(th), sn = Math.sin(th);
  return Float64Array.from(G.x, (x, i) => x * c + G.y[i] * sn);
}

/** The second family runs across the first: the direction perpendicular to the first
 *  field's overall gradient (a least-squares plane through it). */
function crossField(G: Ground, f: Float64Array): Float64Array {
  const n = G.n;
  let mx = 0, my = 0, mf = 0;
  for (let i = 0; i < n; i++) { mx += G.x[i]; my += G.y[i]; mf += f[i]; }
  mx /= n; my /= n; mf /= n;
  let sxx = 0, sxy = 0, syy = 0, sxf = 0, syf = 0;
  for (let i = 0; i < n; i++) {
    const x = G.x[i] - mx, y = G.y[i] - my, v = f[i] - mf;
    sxx += x * x; sxy += x * y; syy += y * y; sxf += x * v; syf += y * v;
  }
  const det = sxx * syy - sxy * sxy;
  const a = det !== 0 ? (sxf * syy - syf * sxy) / det : 0, b = det !== 0 ? (syf * sxx - sxf * sxy) / det : 0;
  const g = a === 0 && b === 0 ? 0 : Math.atan2(b, a), th = g + Math.PI / 2, c = Math.cos(th), sn = Math.sin(th);
  return Float64Array.from(G.x, (x, i) => x * c + G.y[i] * sn);
}

const mod2 = (x: number) => ((x % 2) + 2) % 2;

export interface Streets {
  cls: Int8Array;          // per side: 0 none, 1 lane, 2 secondary, 3 primary
  share: Float64Array;     // per cell: share of its area that streets take
  widths: [number, number, number, number];  // metres by class
  crossings: number;       // sides of the network between two valley cells
}

/** Breadth-first search from every vertex in `from` (in vertex order) over sides that `ok`
 *  allows: each vertex's distance in sides (-1: unreached) and the side it was reached by. */
function tree(sd: Sides, from: Uint8Array, ok: (s: number) => boolean): { dist: Int32Array; via: Int32Array } {
  const adj = adjacency(sd), nv = sd.vx.length, dist = new Int32Array(nv).fill(-1), via = new Int32Array(nv).fill(-1);
  const q: number[] = [];
  for (let v = 0; v < nv; v++) if (from[v]) { dist[v] = 0; q.push(v); }
  for (let h = 0; h < q.length; h++) {
    const v = q[h];
    for (const [w, s] of adj[v]) if (dist[w] < 0 && ok(s)) { dist[w] = dist[v] + 1; via[w] = s; q.push(w); }
  }
  return { dist, via };
}

/** The sides from vertex `v` back along the search tree to where it started. */
function back(sd: Sides, t: { via: Int32Array; dist: Int32Array }, v: number): number[] {
  const out: number[] = [];
  while (t.dist[v] > 0) { const s = t.via[v]; out.push(s); v = sd.v0[s] === v ? sd.v1[s] : sd.v0[s]; }
  return out;
}

/** Of `vs`, the vertex nearest the tree's start (lowest number on ties), or -1. */
function nearest(t: { dist: Int32Array }, vs: number[]): number {
  let best = -1;
  for (const v of vs) if (t.dist[v] >= 0 && (best < 0 || t.dist[v] < t.dist[best] || (t.dist[v] === t.dist[best] && v < best))) best = v;
  return best;
}

/** Group the chosen sides into connected parts (by shared vertices), each as its sides,
 *  in order of their first side. */
function parts(sd: Sides, cls: Int8Array): number[][] {
  const adj = adjacency(sd), seen = new Uint8Array(sd.cell.length), out: number[][] = [];
  for (let s0 = 0; s0 < cls.length; s0++) {
    if (!cls[s0] || seen[s0]) continue;
    const part = [s0], vq = [sd.v0[s0], sd.v1[s0]];
    seen[s0] = 1;
    for (let h = 0; h < vq.length; h++) {
      for (const [w, s] of adj[vq[h]]) if (cls[s] && !seen[s]) { seen[s] = 1; part.push(s); vq.push(w); }
    }
    out.push(part.sort((a, b) => a - b));
  }
  return out;
}

/** The streets of a design: the skeleton, plus what the street genes ask for. */
export function streets(G: Ground, s: Settings): Streets {
  const sd = sides(G), ns = sd.cell.length, D = G.deg;
  const cls = new Int8Array(ns);
  const corridor = (sid: number) => !!G.vbuf && sd.other[sid] >= 0 && !!G.vbuf[sd.cell[sid]] && !!G.vbuf[sd.other[sid]];
  const sk = G.skeleton;

  // 1-2. Two families of level lines at the chosen spacing; 3. the pattern.
  const f1 = field(G, s.street_orientation), f2 = crossField(G, f1), S = s.street_spacing;
  const regime = Math.min(Math.floor(s.street_pattern * 3), 2);  // 0 grid, 1 loop, 2 branching
  for (let sid = 0; sid < ns; sid++) {
    const i = sd.cell[sid], j = sd.other[sid];
    if (j < 0 || corridor(sid)) continue;
    const a1 = Math.floor(f1[i] / S), b1 = Math.floor(f1[j] / S), a2 = Math.floor(f2[i] / S), b2 = Math.floor(f2[j] / S);
    if (a1 !== b1) {
      const boundary = Math.max(a1, b1);
      if (regime < 2 || mod2(boundary) === 0) cls[sid] = SECONDARY;
    } else if (a2 !== b2) {
      const boundary = Math.max(a2, b2), along = a1;
      if (regime === 0 || (regime === 1 ? mod2(boundary + along) === 0 : mod2(boundary) === 0)) cls[sid] = LANE;
    }
  }
  // The skeleton wins.
  if (sk) for (let k = 0; k < sk.sides.length; k++) cls[sk.sides[k]] = Math.max(cls[sk.sides[k]], sk.level[k]);

  // 4. Join every part to the main network (the skeleton's parts; without a skeleton, the
  //    parts that reach the edge of the design ground) by the shortest path that keeps out of
  //    the valleys, or drop it. One search from the main network serves every part.
  const main = new Uint8Array(sd.vx.length);
  const edgeVertex = new Uint8Array(sd.vx.length);
  for (let sid = 0; sid < ns; sid++) if (sd.other[sid] < 0) { edgeVertex[sd.v0[sid]] = 1; edgeVertex[sd.v1[sid]] = 1; }
  const isSkeleton = new Uint8Array(ns);
  if (sk) for (const sid of sk.sides) isSkeleton[sid] = 1;
  const groups = parts(sd, cls);
  const hasSkeleton = !!sk && sk.sides.length > 0;
  const rooted = (p: number[]) => (hasSkeleton ? p.some((x) => isSkeleton[x])
    : p.some((x) => edgeVertex[sd.v0[x]] || edgeVertex[sd.v1[x]]));
  let anyMain = false;
  for (const p of groups) if (rooted(p)) for (const x of p) { main[sd.v0[x]] = 1; main[sd.v1[x]] = 1; anyMain = true; }
  const vertsOf = (p: number[]) => [...new Set(p.flatMap((x) => [sd.v0[x], sd.v1[x]]))].sort((a, b) => a - b);
  const join = anyMain ? tree(sd, main, (sid) => !corridor(sid)) : null;
  const added: number[] = [];
  for (const p of groups) {
    if (rooted(p)) continue;
    const v = join ? nearest(join, vertsOf(p)) : -1;
    if (v < 0) { for (const x of p) if (!isSkeleton[x]) cls[x] = 0; continue; }
    for (const x of back(sd, join!, v)) if (!cls[x]) { cls[x] = SECONDARY; added.push(x); }
    for (const x of p) { main[sd.v0[x]] = 1; main[sd.v1[x]] = 1; }
  }
  for (const x of added) { main[sd.v0[x]] = 1; main[sd.v1[x]] = 1; }

  // 5. Every block can be reached: each region of cells not split by streets touches a
  //    street of the main network or the edge of the design ground; if not, the shortest
  //    path (valleys allowed, as a last resort) joins it.
  if (anyMain) {
    const region = new Int32Array(G.n).fill(-1);
    let reach: { dist: Int32Array; via: Int32Array } | null = null;
    for (let s0 = 0; s0 < G.n; s0++) {
      if (region[s0] >= 0) continue;
      const cells = [s0];
      region[s0] = s0;
      let reached = false;
      for (let h = 0; h < cells.length; h++) {
        const i = cells[h];
        for (let a = 0; a < D; a++) {
          const sid = sd.at[i * D + a];
          if (sid < 0) continue;
          const j = sd.other[sid] === i ? sd.cell[sid] : sd.other[sid];
          if (j < 0 || (cls[sid] && main[sd.v0[sid]])) { reached = true; continue; }
          if (!cls[sid] && region[j] < 0) { region[j] = s0; cells.push(j); }
        }
      }
      if (reached) continue;
      reach ??= tree(sd, main, () => true);
      const vs: number[] = [];
      for (const i of cells) for (let a = 0; a < D; a++) { const sid = sd.at[i * D + a]; if (sid >= 0) vs.push(sd.v0[sid], sd.v1[sid]); }
      const v = nearest(reach, [...new Set(vs)].sort((a, b) => a - b));
      if (v >= 0) for (const x of back(sd, reach, v)) if (!cls[x]) cls[x] = SECONDARY;
    }
  }

  // 6. Widths, and the share of each cell the streets take.
  const widths: [number, number, number, number] = [0, STREET_LANE_W[0] + (STREET_LANE_W[1] - STREET_LANE_W[0]) * s.street_hierarchy,
    STREET_SECONDARY_W[0] + (STREET_SECONDARY_W[1] - STREET_SECONDARY_W[0]) * s.street_hierarchy, PRIMARY_W_M];
  const share = new Float64Array(G.n);
  let crossings = 0;
  for (let sid = 0; sid < ns; sid++) {
    if (!cls[sid]) continue;
    if (corridor(sid)) crossings++;
    const take = (widths[cls[sid]] / 2) * G.grid.edge / G.cellArea;
    share[sd.cell[sid]] += take;
    if (sd.other[sid] >= 0) share[sd.other[sid]] += take;
  }
  for (let i = 0; i < G.n; i++) share[i] = Math.min(share[i], STREET_SHARE_MAX);
  return { cls, share, widths, crossings };
}
