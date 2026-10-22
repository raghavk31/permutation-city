// The vector design onto the analysis grid, for scoring (architecture-v3 3.1 step 9).
//
//   share     per cell, the share of its area streets take: each street walked in 6 m steps along
//             its line, each step's area (step × width) given to the cell under it
//   sides     per cell side (streets.ts), the class of the street crossing the line between
//             the two cells' centres: the bridge to everything that reads streets on cell
//             sides (blocks of cells, shocks, the massing envelope). 0: none.
//   plotOf    per cell, the plot its centre stands in (-1: none)
import { sides } from "../streets.js";
import type { Ground } from "../types.js";
import { cross, inside, SegIndex, type Line, type Pt } from "./geom.js";
import type { Edge } from "./network.js";
import type { Plot } from "./plots.js";
import { locator } from "./ground.js";

export interface Raster { share: Float64Array; sides: Int8Array; plotOf: Int32Array }

export function rasterise(G: Ground, edges: Edge[], widthOf: (cls: number) => number, plots: Plot[]): Raster {
  const idx = new SegIndex(30);
  edges.forEach((e, k) => { if (e.cls > 0) idx.addLine(e.pts, k); });
  // Street area per cell: each street walked every STEP metres along its line, each step's
  // area (step × width) given to the cell under it.
  const STEP = 6, loc = locator(G), area = new Float64Array(G.n);
  for (const e of edges) {
    if (e.cls === 0) continue;
    const w = widthOf(e.cls);
    for (let k = 1; k < e.pts.length; k++) {
      const a = e.pts[k - 1], b = e.pts[k], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len < 1e-9) continue;
      const steps = Math.max(1, Math.round(len / STEP)), each = (len / steps) * w;
      for (let t = 0; t < steps; t++) {
        const u = (t + 0.5) / steps, c = loc.cell([a[0] + u * (b[0] - a[0]), a[1] + u * (b[1] - a[1])]);
        if (c >= 0) area[c] += each;
      }
    }
  }
  const share = Float64Array.from(area, (a) => Math.min(a / G.cellArea, 1));
  const sd = sides(G), cls = new Int8Array(sd.cell.length);
  for (let s = 0; s < sd.cell.length; s++) {
    const i = sd.cell[s], j = sd.other[s];
    // A street between two centres passes through one of the two cells.
    if (j < 0 || (area[i] === 0 && area[j] === 0)) continue;
    const a: Pt = [G.x[i], G.y[i]], b: Pt = [G.x[j], G.y[j]];
    let c = 0;
    const mid: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], r = Math.hypot(b[0] - a[0], b[1] - a[1]) / 2 + 1;
    for (const id of idx.near(mid, r)) {
      const k = edges[idx.tag[id]].cls;
      if (k > c && cross(a, b, idx.a[id], idx.b[id])) c = k;
    }
    cls[s] = c;
  }
  // Plots under cell centres: a coarse grid of plot boxes.
  const plotOf = new Int32Array(G.n).fill(-1), cellsOf = new Map<number, number[]>(), size = 60;
  const key = (i: number, j: number) => (i + 32768) * 65536 + (j + 32768);
  plots.forEach((p, k) => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of p.ring) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    for (let i = Math.floor(x0 / size); i <= Math.floor(x1 / size); i++) for (let j = Math.floor(y0 / size); j <= Math.floor(y1 / size); j++) {
      const l = cellsOf.get(key(i, j)); if (l) l.push(k); else cellsOf.set(key(i, j), [k]);
    }
  });
  for (let i = 0; i < G.n; i++) {
    const p: Pt = [G.x[i], G.y[i]];
    for (const k of cellsOf.get(key(Math.floor(p[0] / size), Math.floor(p[1] / size))) ?? []) {
      if (inside(plots[k].ring as Line, p)) { plotOf[i] = k; break; }
    }
  }
  return { share, sides: cls, plotOf };
}
