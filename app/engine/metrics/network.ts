// The streets and blocks a design implies (pc/metrics/network.py; R5 in docs/architecture-v2.md).
//
// The genome places building, landscape and water, never streets. So they are derived:
//   blocks    connected building cells; an existing major road between two cells cuts them
//   patches   connected open cells (landscape or water), cut the same way
//   frontage  a building cell's links to anything that is not the same block
//   centres   the cells nearest the core attractors (the design's own local centres)
// Phase 8 reuses this for space syntax.
//
// Same arithmetic, in the same order, as the Python file, so both give the same numbers.
import { BUILDING, LANDSCAPE, WATER } from "../config.js";
import type { Design, Ground } from "../types.js";

/** Per site: each link's direction (0 = east, counter-clockwise in equal steps) and whether
 *  an existing road crosses it. `rowStep` is the distance between rows of cells. */
export interface Links { dir: Int8Array; cut: Uint8Array; rowStep: number }

const linkCache = new WeakMap<Ground, Links>();

const orient = (px: number, py: number, qx: number, qy: number, rx: number, ry: number) =>
  (qx - px) * (ry - py) - (qy - py) * (rx - px);

/** Do segments ab and cd cross (touching doesn't count)? */
export function crosses(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number) {
  const d1 = orient(cx, cy, dx, dy, ax, ay), d2 = orient(cx, cy, dx, dy, bx, by);
  const d3 = orient(ax, ay, bx, by, cx, cy), d4 = orient(ax, ay, bx, by, dx, dy);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

export function links(G: Ground): Links {
  const hit = linkCache.get(G);
  if (hit) return hit;
  const n = G.n, D = G.deg, step = (2 * Math.PI) / D;
  const dir = new Int8Array(n * D).fill(-1), cut = new Uint8Array(n * D);
  // Road segments in square buckets, so each link tests only the segments near it.
  const B = 100.0, buckets = new Map<string, number[]>(), segs: number[][] = [];
  for (const line of G.roads ?? []) {
    for (let k = 1; k < line.length; k++) {
      const s = [line[k - 1][0], line[k - 1][1], line[k][0], line[k][1]];
      const id = segs.length;
      segs.push(s);
      const [x0, x1] = [Math.floor(Math.min(s[0], s[2]) / B), Math.floor(Math.max(s[0], s[2]) / B)];
      const [y0, y1] = [Math.floor(Math.min(s[1], s[3]) / B), Math.floor(Math.max(s[1], s[3]) / B)];
      for (let bx = x0; bx <= x1; bx++) for (let by = y0; by <= y1; by++) {
        const key = `${bx},${by}`;
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key)!.push(id);
      }
    }
  }
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < D; k++) {
      const j = G.nbr[i * D + k];
      if (j < 0) continue;
      const dx = G.x[j] - G.x[i], dy = G.y[j] - G.y[i];
      const a = Math.floor(Math.atan2(dy, dx) / step + 0.5);
      dir[i * D + k] = ((a % D) + D) % D;
      if (!segs.length) continue;
      const seen = new Set<number>();
      const [x0, x1] = [Math.floor(Math.min(G.x[i], G.x[j]) / B), Math.floor(Math.max(G.x[i], G.x[j]) / B)];
      const [y0, y1] = [Math.floor(Math.min(G.y[i], G.y[j]) / B), Math.floor(Math.max(G.y[i], G.y[j]) / B)];
      for (let bx = x0; bx <= x1 && !cut[i * D + k]; bx++) for (let by = y0; by <= y1; by++) {
        for (const id of buckets.get(`${bx},${by}`) ?? []) {
          if (seen.has(id)) continue;
          seen.add(id);
          const s = segs[id];
          if (crosses(G.x[i], G.y[i], G.x[j], G.y[j], s[0], s[1], s[2], s[3])) { cut[i * D + k] = 1; break; }
        }
        if (cut[i * D + k]) break;
      }
    }
  }
  const L = { dir, cut, rowStep: G.grid.type === "quad" ? G.grid.size : 1.5 * G.grid.size };
  linkCache.set(G, L);
  return L;
}

export const isOpen = (u: number) => u === LANDSCAPE || u === WATER;

export interface Net {
  G: Ground; d: Design; L: Links;
  block: Int32Array; blocks: number[][];    // building components
  patch: Int32Array; patches: number[][];   // open components
  green: Int32Array; greens: number[][];    // landscape-only components
  centres: number[];                        // cells nearest the core attractors, first kept
  mean: number; sd: number;                 // storeys over building cells
}

/** Connected groups of cells that pass `member`, not across road cuts; numbered in order of
 *  their lowest cell, each listed in breadth-first order. */
export function components(G: Ground, L: Links, member: (i: number) => boolean): [Int32Array, number[][]] {
  const n = G.n, D = G.deg, label = new Int32Array(n).fill(-1), groups: number[][] = [];
  for (let s = 0; s < n; s++) {
    if (label[s] >= 0 || !member(s)) continue;
    const id = groups.length, cells = [s];
    label[s] = id;
    for (let h = 0; h < cells.length; h++) {
      const i = cells[h];
      for (let k = 0; k < D; k++) {
        const j = G.nbr[i * D + k];
        if (j >= 0 && label[j] < 0 && !L.cut[i * D + k] && member(j)) { label[j] = id; cells.push(j); }
      }
    }
    groups.push(cells);
  }
  return [label, groups];
}

/** Steps from the nearest source over every link (people cross roads), -1 if unreachable. */
export function walk(G: Ground, sources: number[]): Int32Array {
  const D = G.deg, dist = new Int32Array(G.n).fill(-1), queue: number[] = [];
  for (const s of sources) if (dist[s] < 0) { dist[s] = 0; queue.push(s); }
  for (let h = 0; h < queue.length; h++) {
    const i = queue[h];
    for (let k = 0; k < D; k++) {
      const j = G.nbr[i * D + k];
      if (j >= 0 && dist[j] < 0) { dist[j] = dist[i] + 1; queue.push(j); }
    }
  }
  return dist;
}

/** The neighbour of `i` in direction `a`, or -1; and the link slot, for the cut. */
export function stepTo(net: Net, i: number, a: number): [number, number] {
  const D = net.G.deg;
  for (let k = 0; k < D; k++) if (net.L.dir[i * D + k] === a) return [net.G.nbr[i * D + k], i * D + k];
  return [-1, -1];
}

const netCache = new WeakMap<Design, Net>();

export function network(d: Design, G: Ground): Net {
  const hit = netCache.get(d);
  if (hit && hit.G === G) return hit;
  const L = links(G);
  const [block, blocks] = components(G, L, (i) => d.use[i] === BUILDING);
  const [patch, patches] = components(G, L, (i) => isOpen(d.use[i]));
  const [green, greens] = components(G, L, (i) => d.use[i] === LANDSCAPE);
  const centres: number[] = [];
  for (const a of d.attractors) {
    if (a.kind !== "core") continue;
    let best = 0, bd = Infinity;
    for (let i = 0; i < G.n; i++) {
      const dx = G.x[i] - a.x, dy = G.y[i] - a.y, dd = dx * dx + dy * dy;
      if (dd < bd) { bd = dd; best = i; }
    }
    if (!centres.includes(best)) centres.push(best);
  }
  let nb = 0, s1 = 0, s2 = 0;
  for (let i = 0; i < G.n; i++) {
    if (d.use[i] !== BUILDING) continue;
    nb++; s1 += d.levels[i]; s2 += d.levels[i] * d.levels[i];
  }
  const mean = nb ? s1 / nb : 0;
  const net: Net = { G, d, L, block, blocks, patch, patches, green, greens, centres, mean,
    sd: nb ? Math.sqrt(Math.max(s2 / nb - mean * mean, 0)) : 0 };
  netCache.set(d, net);
  return net;
}

/** Open cells touching three or more different blocks: where routes between blocks meet. */
export function junctions(net: Net): number[] {
  const { G, d, L, block } = net, D = G.deg, out: number[] = [];
  for (let i = 0; i < G.n; i++) {
    if (!isOpen(d.use[i])) continue;
    const seen: number[] = [];
    for (let k = 0; k < D; k++) {
      const j = G.nbr[i * D + k];
      if (j >= 0 && !L.cut[i * D + k] && block[j] >= 0 && !seen.includes(block[j])) seen.push(block[j]);
    }
    if (seen.length >= 3) out.push(i);
  }
  return out;
}

/** Building cells that stand out: at least two standard deviations and two storeys above the mean. */
export function landmarks(net: Net): number[] {
  const { G, d, mean, sd } = net, out: number[] = [];
  if (!(sd > 0)) return out;
  for (let i = 0; i < G.n; i++) {
    if (d.use[i] === BUILDING && d.levels[i] >= mean + 2 * sd && d.levels[i] >= mean + 2) out.push(i);
  }
  return out;
}

/** Pearson correlation; 0 when either side doesn't vary. */
export function pearson(a: number[], b: number[]): number {
  const n = a.length;
  if (n < 2) return 0;
  let ma = 0, mb = 0;
  for (let t = 0; t < n; t++) { ma += a[t]; mb += b[t]; }
  ma /= n; mb /= n;
  let sab = 0, saa = 0, sbb = 0;
  for (let t = 0; t < n; t++) {
    const x = a[t] - ma, y = b[t] - mb;
    sab += x * y; saa += x * x; sbb += y * y;
  }
  return saa > 0 && sbb > 0 ? sab / Math.sqrt(saa * sbb) : 0;
}

/** Share of `cells` within `reach` metres (straight line) of any of `targets`. */
export function near(G: Ground, cells: number[], targets: number[], reach: number): number {
  if (!cells.length || !targets.length) return 0;
  const r2 = reach * reach;
  let c = 0;
  for (const i of cells) {
    for (const t of targets) {
      const dx = G.x[i] - G.x[t], dy = G.y[i] - G.y[t];
      if (dx * dx + dy * dy <= r2) { c++; break; }
    }
  }
  return c / cells.length;
}

/** Each cell's use and height band: 0 open, 1 up to 4 storeys, 2 up to 8, 3 taller (+ 4 × use). */
export const code = (d: Design, i: number) =>
  d.use[i] * 4 + (d.use[i] === BUILDING ? (d.levels[i] <= 4 ? 1 : d.levels[i] <= 8 ? 2 : 3) : 0);
