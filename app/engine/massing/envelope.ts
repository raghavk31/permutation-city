// Plots and envelopes: what the urban design hands to the building scale (docs/massing.md).
//
//   block      a group of building cells between the design's streets (metrics/network.ts)
//   plots      the block, split along its long axis while a part is over PLOT_MAX_HA, never
//              into parts under PLOT_MIN_HA; a part with no street frontage joins a neighbour
//   envelope   per plot, on a raster of RES_M columns: where a building may stand (the cells,
//              less half of each street, less the setbacks), how many storeys (the rules' cap
//              for the cell), the most it may cover (1 - the rules' min permeable share), and
//              its floor-area target (what the urban design put on those cells)
//   context    the design's other buildings near the block, as prisms (levels × STOREY_M); the
//              existing buildings off the design ground, with their heights (Overture, or
//              estimated, labelled); and the public ground (street bands and landscape) the
//              shade and sky scores read
//
// TS only (decision D4). pc/massing_check.py rechecks the scores from an exported bench file.
import { BUILDING, LANDSCAPE, STOREY_M, STREET_W_M, WATER } from "../config.js";
import { corners } from "../graph.js";
import { links, network } from "../metrics/network.js";
import { sides } from "../streets.js";
import { cellAt } from "../syntax.js";
import type { Design, Ground } from "../types.js";
import { vectorBlocks, vectorEnvelope } from "./vector.js";

export const RES_M = 2.0;            // raster column size
export const MARGIN_M = 60.0;        // context kept round the block
export const PLOT_MAX_HA = 0.5, PLOT_MIN_HA = 0.15;
export const DEFAULT_SETBACKS = { front: 3, side: 0, rear: 3 };
export const WATER_REACH_M = 200.0;  // the CPPN's distance-to-water input saturates here

export type Setbacks = { front: number; side: number; rear: number };

export interface Plot {
  id: number;
  cells: number[];
  axis: number;               // radians, the plot's long axis (along its main street frontage)
  cx: number; cy: number;     // centre of its buildable columns
  half: [number, number];     // half extents of the buildable columns along the axis and across it
  capLevels: number;          // the highest cap among its cells
  maxCover: number;           // share of the plot (net of streets) a footprint may cover
  area: number;               // m², the plot net of streets
  buildable: number;          // m², inside the setbacks
  target: number;             // m² floor area, from the urban design
  frontage: number;           // m of street frontage
}

export interface Envelope {
  block: number; cells: number[]; plots: Plot[];
  ox: number; oy: number; nx: number; ny: number; nz: number; res: number;
  cellOf: Int32Array;     // per column: the design cell (-1: off the design ground)
  plotOf: Int16Array;     // per column: the plot it may be built on (-1: not buildable)
  inPlot: Int16Array;     // per column: the plot it belongs to, setbacks included (-1: none)
  capZ: Int16Array;       // per column: storeys allowed
  street: Uint8Array;     // per column: 1 in a street band
  publicGround: Uint8Array; // per column: 1 street band or landscape (the shade score's ground)
  context: Float32Array;  // per column: height of the design's other buildings and of existing ones (m)
  existing: Float32Array; // per column: height of existing buildings off the design ground (m; 0: none)
  neighbours: number[];   // the existing buildings in the frame (indices into Ground.buildings)
  water: Float32Array;    // per column: distance to the nearest water cell (m, capped)
  setbacks: Setbacks;
  target: number;         // m², all plots
  note: string[];
}

/** Point to segment distance. */
function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
  const t = L2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L2)) : 0;
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

/** Inside a convex polygon (counter-clockwise corners)? */
function inside(px: number, py: number, poly: [number, number][]): boolean {
  for (let k = 0; k < poly.length; k++) {
    const [ax, ay] = poly[k], [bx, by] = poly[(k + 1) % poly.length];
    if ((bx - ax) * (py - ay) - (by - ay) * (px - ax) < -1e-9) return false;
  }
  return true;
}

/** Split a block's cells into plots (cell index lists). */
function split(G: Ground, cells: number[], front: (i: number) => boolean): number[][] {
  const cellHa = G.cellArea / 1e4;
  const parts: number[][] = [];
  const go = (cs: number[]) => {
    if (cs.length * cellHa <= PLOT_MAX_HA || cs.length * cellHa < 2 * PLOT_MIN_HA) { parts.push(cs); return; }
    // Long axis of the cell centres (principal component).
    let mx = 0, my = 0;
    for (const i of cs) { mx += G.x[i]; my += G.y[i]; }
    mx /= cs.length; my /= cs.length;
    let sxx = 0, sxy = 0, syy = 0;
    for (const i of cs) { const dx = G.x[i] - mx, dy = G.y[i] - my; sxx += dx * dx; sxy += dx * dy; syy += dy * dy; }
    const th = 0.5 * Math.atan2(2 * sxy, sxx - syy), ux = Math.cos(th), uy = Math.sin(th);
    const sorted = [...cs].sort((a, b) => ((G.x[a] - mx) * ux + (G.y[a] - my) * uy) - ((G.x[b] - mx) * ux + (G.y[b] - my) * uy) || a - b);
    const half = sorted.length >> 1;
    go(sorted.slice(0, half));
    go(sorted.slice(half));
  };
  go(cells);
  // A part with no frontage joins the neighbouring part it shares most sides with, while the
  // two stay under twice PLOT_MAX_HA; otherwise it stays an interior plot (reached through
  // its neighbours; the envelope's note says so).
  const D = G.deg, interior = new Set<number[]>();
  for (;;) {
    const k = parts.findIndex((p) => parts.length > 1 && !interior.has(p) && !p.some(front));
    if (k < 0) break;
    const mine = new Set(parts[k]);
    let best = -1, bestN = 0;
    parts.forEach((q, m) => {
      if (m === k || (q.length + parts[k].length) * cellHa > 2 * PLOT_MAX_HA) return;
      let c = 0;
      for (const i of q) for (let s = 0; s < D; s++) if (mine.has(G.nbr[i * D + s])) c++;
      if (c > bestN) { bestN = c; best = m; }
    });
    if (best < 0) { interior.add(parts[k]); continue; }
    parts[best] = [...parts[best], ...parts[k]].sort((a, b) => a - b);
    parts.splice(k, 1);
  }
  return parts;
}

/** The blocks of a design that can be massed (version 3: vector.ts, from its plots): their cells, area and floor area. */
export function blocksOf(d: Design, G: Ground): { id: number; cells: number[]; ha: number; floorHa: number; plots?: number }[] {
  if (d.plan) return vectorBlocks(d, G);
  const net = network(d, G);
  return net.blocks.map((cells, id) => ({
    id, cells, ha: (cells.length * G.cellArea) / 1e4,
    floorHa: cells.reduce((s, i) => s + d.floorArea[i], 0) / 1e4,
  }));
}

/** The envelope of one block of a design (version 3: vector.ts). */
export function envelope(d: Design, G: Ground, block: number, setbacks: Setbacks = DEFAULT_SETBACKS): Envelope {
  if (d.plan) return vectorEnvelope(d, G, block, setbacks);
  const net = network(d, G), L = links(G), sd = sides(G), D = G.deg;
  const cells = net.blocks[block];
  if (!cells) throw new Error(`no block ${block}`);
  const inBlock = new Set(cells);
  const shape = corners(G.grid), R = G.grid.size;

  // Per cell and direction: what is across that side. Street width (m) if a street of the
  // design or an existing road runs there; -1 another cell of the block; -2 anything else.
  const roadDir = new Uint8Array(G.n * D);
  for (let i = 0; i < G.n; i++) for (let k = 0; k < D; k++) {
    if (G.nbr[i * D + k] >= 0 && L.cut[i * D + k]) roadDir[i * D + L.dir[i * D + k]] = 1;
  }
  const across = (i: number, a: number): { w: number; j: number } => {
    const sid = sd.at[i * D + a];
    const j = sid < 0 ? -1 : sd.cell[sid] === i ? sd.other[sid] : sd.cell[sid];
    const cls = d.street && sid >= 0 ? d.street[sid] : 0;
    const w = cls && d.streetWidths ? d.streetWidths[cls] : roadDir[i * D + a] ? STREET_W_M : 0;
    return { w, j };
  };
  // Frontage: a street, or open ground (landscape, water) next door.
  const front = (i: number) => {
    for (let a = 0; a < D; a++) {
      const { w, j } = across(i, a);
      if (w > 0 || (j >= 0 && (d.use[j] === LANDSCAPE || d.use[j] === WATER))) return true;
    }
    return false;
  };
  const parts = split(G, cells, front);
  const plotOfCell = new Map<number, number>();
  parts.forEach((p, k) => p.forEach((i) => plotOfCell.set(i, k)));

  // Raster frame.
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const i of cells) {
    x0 = Math.min(x0, G.x[i] - R); x1 = Math.max(x1, G.x[i] + R);
    y0 = Math.min(y0, G.y[i] - R); y1 = Math.max(y1, G.y[i] + R);
  }
  const res = RES_M;
  const ox = Math.floor((x0 - MARGIN_M) / res) * res, oy = Math.floor((y0 - MARGIN_M) / res) * res;
  const nx = Math.ceil((x1 + MARGIN_M - ox) / res), ny = Math.ceil((y1 + MARGIN_M - oy) / res);
  const N = nx * ny;
  const cellOf = new Int32Array(N).fill(-1), plotOf = new Int16Array(N).fill(-1), inPlot = new Int16Array(N).fill(-1);
  const capZ = new Int16Array(N), street = new Uint8Array(N), publicGround = new Uint8Array(N);
  const context = new Float32Array(N), water = new Float32Array(N).fill(WATER_REACH_M);

  // Water, for the CPPN input: the site's water cells (lakes and rivers, mostly off the
  // design ground), the design's own water, and valley channels.
  const wet: [number, number][] = [...(G.water ?? [])];
  for (let i = 0; i < G.n; i++) if (d.use[i] === WATER || (G.valley && G.valley[i] > 0)) wet.push([G.x[i], G.y[i]]);

  for (let i = 0; i < G.n; i++) {
    if (G.x[i] + R < ox || G.x[i] - R > ox + nx * res || G.y[i] + R < oy || G.y[i] - R > oy + ny * res) continue;
    const poly = shape.map(([dx, dy]) => [G.x[i] + dx, G.y[i] + dy] as [number, number]);
    const c0 = Math.max(0, Math.floor((G.x[i] - R - ox) / res)), c1 = Math.min(nx - 1, Math.ceil((G.x[i] + R - ox) / res));
    const r0 = Math.max(0, Math.floor((G.y[i] - R - oy) / res)), r1 = Math.min(ny - 1, Math.ceil((G.y[i] + R - oy) / res));
    // This cell's sides: street bands (half the street's width) and setback lines.
    let wd = WATER_REACH_M;
    if (inBlock.has(i)) for (const [wx, wy] of wet) wd = Math.min(wd, Math.hypot(wx - G.x[i], wy - G.y[i]));
    const mine = plotOfCell.get(i) ?? -1;
    const side: [number, number, number, number, number, number][] = [];  // ax, ay, bx, by, street half width, setback
    for (let a = 0; a < D; a++) {
      const [c0x, c0y] = shape[(a - 1 + D) % D], [c1x, c1y] = shape[a];
      const ax = G.x[i] + c0x, ay = G.y[i] + c0y, bx = G.x[i] + c1x, by = G.y[i] + c1y;
      const { w, j } = across(i, a);
      let back = 0;
      if (w > 0) back = setbacks.front;
      else if (mine >= 0 && j >= 0 && plotOfCell.has(j)) back = plotOfCell.get(j) === mine ? 0 : setbacks.side;
      else if (mine >= 0) back = setbacks.rear;
      side.push([ax, ay, bx, by, w / 2, back]);
    }
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      const px = ox + (c + 0.5) * res, py = oy + (r + 0.5) * res, q = r * nx + c;
      if (cellOf[q] >= 0 || !inside(px, py, poly)) continue;
      cellOf[q] = i;
      let inStreet = false, clear = true;
      for (const [ax, ay, bx, by, hw, back] of side) {
        const dd = segDist(px, py, ax, ay, bx, by);
        if (dd < hw) inStreet = true;
        else if (dd < hw + back) clear = false;
      }
      if (inStreet) { street[q] = 1; publicGround[q] = 1; continue; }
      if (inBlock.has(i)) {
        inPlot[q] = mine;
        water[q] = wd;
        if (clear) { plotOf[q] = mine; capZ[q] = Math.max(0, Math.floor(G.cap[i])); }
      } else if (d.use[i] === BUILDING) {
        context[q] = d.levels[i] * STOREY_M;
      } else if (d.use[i] === LANDSCAPE) {
        publicGround[q] = 1;
      }
    }
  }

  // Existing buildings off the design ground, as prisms on the raster (pc/export.py
  // `existing_buildings`). One whose middle is on the design ground is left out: the design
  // replaces it. Columns on the design ground keep what the design puts there.
  const existing = new Float32Array(N), neighbours: number[] = [], B = G.buildings;
  if (B) for (let k = 0; k < B.rings.length; k++) {
    const r = B.rings[k], m = r.length / 2;
    let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity, mx = 0, my = 0;
    for (let j = 0; j < m; j++) {
      const x = r[2 * j], y = r[2 * j + 1];
      bx0 = Math.min(bx0, x); bx1 = Math.max(bx1, x); by0 = Math.min(by0, y); by1 = Math.max(by1, y); mx += x; my += y;
    }
    if (bx1 < ox || bx0 > ox + nx * res || by1 < oy || by0 > oy + ny * res) continue;
    if (cellAt(G, mx / m, my / m) >= 0) continue;
    neighbours.push(k);
    const c0 = Math.max(0, Math.floor((bx0 - ox) / res)), c1 = Math.min(nx - 1, Math.floor((bx1 - ox) / res));
    const r0 = Math.max(0, Math.floor((by0 - oy) / res)), r1 = Math.min(ny - 1, Math.floor((by1 - oy) / res));
    for (let rr = r0; rr <= r1; rr++) for (let c = c0; c <= c1; c++) {
      const q = rr * nx + c;
      if (cellOf[q] >= 0) continue;
      const px = ox + (c + 0.5) * res, py = oy + (rr + 0.5) * res;
      let inside = false;  // ray casting
      for (let j = 0, i = m - 1; j < m; i = j++) {
        const xi = r[2 * i], yi = r[2 * i + 1], xj = r[2 * j], yj = r[2 * j + 1];
        if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
      }
      if (inside && B.h[k] > existing[q]) existing[q] = B.h[k];
    }
  }
  for (let q = 0; q < N; q++) if (existing[q] > context[q]) context[q] = existing[q];

  const plots: Plot[] = parts.map((cs, id) => {
    // Axis: along the plot's longest street frontage (side directions doubled, so opposite
    // directions add up), else the long axis of its columns.
    let fx = 0, fy = 0, frontage = 0;
    for (const i of cs) for (let a = 0; a < D; a++) {
      const { w } = across(i, a);
      if (w <= 0) continue;
      const [c0x, c0y] = shape[(a - 1 + D) % D], [c1x, c1y] = shape[a];
      const len = Math.hypot(c1x - c0x, c1y - c0y), th = Math.atan2(c1y - c0y, c1x - c0x);
      fx += len * Math.cos(2 * th); fy += len * Math.sin(2 * th); frontage += len;
    }
    let mx = 0, my = 0, m = 0, sxx = 0, sxy = 0, syy = 0, area = 0;
    for (let q = 0; q < N; q++) {
      if (inPlot[q] === id) area += res * res;
      if (plotOf[q] !== id) continue;
      mx += ox + ((q % nx) + 0.5) * res; my += oy + (Math.floor(q / nx) + 0.5) * res; m++;
    }
    mx /= m || 1; my /= m || 1;
    for (let q = 0; q < N; q++) {
      if (plotOf[q] !== id) continue;
      const dx = ox + ((q % nx) + 0.5) * res - mx, dy = oy + (Math.floor(q / nx) + 0.5) * res - my;
      sxx += dx * dx; sxy += dx * dy; syy += dy * dy;
    }
    const axis = frontage > 0 && Math.hypot(fx, fy) > 1e-6 ? 0.5 * Math.atan2(fy, fx) : 0.5 * Math.atan2(2 * sxy, sxx - syy);
    const ux = Math.cos(axis), uy = Math.sin(axis);
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (let q = 0; q < N; q++) {
      if (plotOf[q] !== id) continue;
      const dx = ox + ((q % nx) + 0.5) * res - mx, dy = oy + (Math.floor(q / nx) + 0.5) * res - my;
      const u = dx * ux + dy * uy, v = -dx * uy + dy * ux;
      u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v);
    }
    const cu = (u0 + u1) / 2, cv = (v0 + v1) / 2;
    let capLevels = 0, perm = 0;
    for (const i of cs) { capLevels = Math.max(capLevels, Math.floor(G.cap[i])); perm = Math.max(perm, G.minPerm[i]); }
    return {
      id, cells: cs, axis,
      cx: mx + cu * ux - cv * uy, cy: my + cu * uy + cv * ux,
      half: [Math.max((u1 - u0) / 2 + res / 2, res), Math.max((v1 - v0) / 2 + res / 2, res)],
      capLevels, maxCover: Math.max(0, 1 - perm), area, buildable: m * res * res,
      target: cs.reduce((s, i) => s + d.floorArea[i], 0), frontage,
    };
  });
  const nz = Math.max(1, ...plots.map((p) => p.capLevels));
  const note: string[] = [];
  if (parts.length > 1) note.push(`split into ${parts.length} plots of ${PLOT_MIN_HA}–${PLOT_MAX_HA} ha`);
  const inner = parts.filter((p) => !p.some(front)).length;
  if (inner) note.push(`${inner} interior plot${inner > 1 ? "s" : ""} with no street or open frontage`);
  if (plots.some((p) => !p.buildable)) note.push("a plot has no room inside its setbacks");
  return {
    block, cells, plots, ox, oy, nx, ny, nz, res, cellOf, plotOf, inPlot, capZ, street, publicGround, context, existing, neighbours, water,
    setbacks, target: plots.reduce((s, p) => s + p.target, 0), note,
  };
}

/** Each plot's buildable columns (cached). */
const colCache = new WeakMap<Envelope, Int32Array[]>();
export function plotColumns(E: Envelope): Int32Array[] {
  let out = colCache.get(E);
  if (!out) {
    const lists: number[][] = E.plots.map(() => []);
    for (let q = 0; q < E.nx * E.ny; q++) if (E.plotOf[q] >= 0) lists[E.plotOf[q]].push(q);
    out = lists.map((l) => Int32Array.from(l));
    colCache.set(E, out);
  }
  return out;
}

/** Column centre (m) of column q. */
export const columnXY = (E: Envelope, q: number): [number, number] =>
  [E.ox + ((q % E.nx) + 0.5) * E.res, E.oy + (Math.floor(q / E.nx) + 0.5) * E.res];
