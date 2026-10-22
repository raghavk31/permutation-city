// Plots and envelopes for a version 3 design: the same Envelope as envelope.ts, read from the
// design's vector plan instead of its cells (architecture-v3: "Massing envelopes: the vector
// plots"), so the plots the massing fills are the plots drawn on the plan.
//
//   block      a face of the street network (VectorPlan.blocks), massed when it has building plots
//   plots      the plan's building plots in that block, as drawn (already set back half the
//              street width from the centrelines)
//   setbacks   per plot edge: front where it faces a street or open ground, side where it meets
//              a front edge, rear otherwise
//   envelope   per column (RES_M): street bands within half a street's width of a centreline;
//              a plot's columns clear of its setbacks are buildable up to the rules' cap; the
//              most cover from the rules' least permeable share; the target from the floor
//              area the design put under the plot
//   context    the design's other building plots in the frame at their storeys, and the
//              existing buildings off the design ground (as envelope.ts)
import { BUILDING, LANDSCAPE, STOREY_M, WATER } from "../config.js";
import { area, inside, toSegment, type Line, type Pt } from "../plan/geom.js";
import { locator } from "../plan/ground.js";
import { cellAt } from "../syntax.js";
import type { Design, Ground, VectorPlan } from "../types.js";
import { MARGIN_M, RES_M, WATER_REACH_M, type Envelope, type Plot, type Setbacks } from "./envelope.js";

/** How far past a street's half width a plot edge may lie and still front it (m). */
const FRONT_TOL_M = 2.0;

type Edge = { a: Pt; b: Pt; kind: "front" | "side" | "rear" };

const massable = (p: VectorPlan["plots"][number]) => p.use === BUILDING && p.levels > 0;

/** The blocks of a version 3 design that can be massed: those with building plots. */
export function vectorBlocks(d: Design, G: Ground): { id: number; cells: number[]; ha: number; floorHa: number; plots: number }[] {
  const plan = d.plan!, out: { id: number; cells: number[]; ha: number; floorHa: number; plots: number }[] = [];
  plan.blocks.forEach((_, id) => {
    const ps = plan.plots.filter((p) => p.block === id && massable(p));
    if (!ps.length) return;
    const cells = new Set<number>();
    for (const p of ps) for (const c of cellsUnder(p.ring, G)) cells.add(c);
    const ha = ps.reduce((s, p) => s + Math.abs(area(p.ring)), 0) / 1e4;
    const floorHa = [...cells].reduce((s, i) => s + d.floorArea[i], 0) / 1e4;
    out.push({ id, cells: [...cells].sort((a, b) => a - b), ha, floorHa, plots: ps.length });
  });
  return out;
}

/** Design cells whose centres fall inside a ring. */
function cellsUnder(r: Line, G: Ground): number[] {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of r) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const out: number[] = [];
  for (let i = 0; i < G.n; i++) if (G.x[i] >= x0 && G.x[i] <= x1 && G.y[i] >= y0 && G.y[i] <= y1 && inside(r, [G.x[i], G.y[i]])) out.push(i);
  return out;
}

/** A plot's edges, each a front, side or rear. */
function edgesOf(r: Line, plan: VectorPlan, G: Ground, d: Design): Edge[] {
  const loc = locator(G), n = r.length;
  const fronts = r.map((a, k) => {
    const b = r[(k + 1) % n], m: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    for (const s of plan.streets) for (let j = 1; j < s.pts.length; j++) {
      if (toSegment(m, s.pts[j - 1], s.pts[j]).d <= s.w / 2 + FRONT_TOL_M) return true;
    }
    // open ground beyond the edge: step out 3 m from the middle, away from the plot
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = (b[1] - a[1]) / len, ny = -(b[0] - a[0]) / len;
    for (const sgn of [1, -1]) {
      const p: Pt = [m[0] + sgn * 3 * nx, m[1] + sgn * 3 * ny];
      if (inside(r, p)) continue;
      const c = loc.cell(p);
      if (c >= 0 && (d.use[c] === LANDSCAPE || d.use[c] === WATER)) return true;
    }
    return false;
  });
  return r.map((a, k) => ({
    a, b: r[(k + 1) % n],
    kind: fronts[k] ? "front" : fronts[(k - 1 + n) % n] || fronts[(k + 1) % n] ? "side" : "rear",
  }));
}

/** The envelope of one block of a version 3 design. */
export function vectorEnvelope(d: Design, G: Ground, block: number, setbacks: Setbacks): Envelope {
  const plan = d.plan!, loc = locator(G);
  const mine = plan.plots.map((p, k) => ({ p, k })).filter(({ p }) => p.block === block && massable(p));
  if (!mine.length) throw new Error(`no building plots in block ${block}`);

  // Raster frame: the block's plots and a margin.
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const { p } of mine) for (const [x, y] of p.ring) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const res = RES_M;
  const ox = Math.floor((x0 - MARGIN_M) / res) * res, oy = Math.floor((y0 - MARGIN_M) / res) * res;
  const nx = Math.ceil((x1 + MARGIN_M - ox) / res), ny = Math.ceil((y1 + MARGIN_M - oy) / res);
  const N = nx * ny, X = (q: number) => ox + ((q % nx) + 0.5) * res, Y = (q: number) => oy + (Math.floor(q / nx) + 0.5) * res;
  const cellOf = new Int32Array(N).fill(-1), plotOf = new Int16Array(N).fill(-1), inPlot = new Int16Array(N).fill(-1);
  const capZ = new Int16Array(N), street = new Uint8Array(N), publicGround = new Uint8Array(N);
  const context = new Float32Array(N), water = new Float32Array(N).fill(WATER_REACH_M);
  for (let q = 0; q < N; q++) cellOf[q] = loc.cell([X(q), Y(q)]);

  // Street bands, from the centrelines.
  for (const s of plan.streets) {
    const hw = s.w / 2;
    for (let j = 1; j < s.pts.length; j++) {
      const a = s.pts[j - 1], b = s.pts[j];
      const c0 = Math.max(0, Math.floor((Math.min(a[0], b[0]) - hw - ox) / res)), c1 = Math.min(nx - 1, Math.floor((Math.max(a[0], b[0]) + hw - ox) / res));
      const r0 = Math.max(0, Math.floor((Math.min(a[1], b[1]) - hw - oy) / res)), r1 = Math.min(ny - 1, Math.floor((Math.max(a[1], b[1]) + hw - oy) / res));
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
        const q = r * nx + c;
        if (!street[q] && toSegment([X(q), Y(q)], a, b).d < hw) { street[q] = 1; publicGround[q] = 1; }
      }
    }
  }

  // Columns of a ring, inside the frame.
  const columns = (r: Line, each: (q: number) => void) => {
    let a0 = Infinity, b0 = Infinity, a1 = -Infinity, b1 = -Infinity;
    for (const [x, y] of r) { a0 = Math.min(a0, x); a1 = Math.max(a1, x); b0 = Math.min(b0, y); b1 = Math.max(b1, y); }
    const c0 = Math.max(0, Math.floor((a0 - ox) / res)), c1 = Math.min(nx - 1, Math.floor((a1 - ox) / res));
    const r0 = Math.max(0, Math.floor((b0 - oy) / res)), r1 = Math.min(ny - 1, Math.floor((b1 - oy) / res));
    for (let rr = r0; rr <= r1; rr++) for (let c = c0; c <= c1; c++) { const q = rr * nx + c; if (inside(r, [X(q), Y(q)])) each(q); }
  };

  // The design's other building plots in the frame, at their storeys; its open ground.
  plan.plots.forEach((p) => {
    if (p.block === block && massable(p)) return;
    if (massable(p)) columns(p.ring, (q) => { if (!street[q]) context[q] = Math.max(context[q], p.levels * STOREY_M); });
    else if (p.use === LANDSCAPE) columns(p.ring, (q) => { publicGround[q] = 1; });
  });
  for (let q = 0; q < N; q++) if (!street[q] && cellOf[q] >= 0 && d.use[cellOf[q]] === LANDSCAPE && !context[q]) publicGround[q] = 1;

  // Water, for the CPPN input (as envelope.ts): distance per design cell, read per column.
  const wet: [number, number][] = [...(G.water ?? [])];
  for (let i = 0; i < G.n; i++) if (d.use[i] === WATER || (G.valley && G.valley[i] > 0)) wet.push([G.x[i], G.y[i]]);
  const wetAt = new Map<number, number>();
  const wd = (i: number) => {
    let v = wetAt.get(i);
    if (v === undefined) { v = WATER_REACH_M; for (const [wx, wy] of wet) v = Math.min(v, Math.hypot(wx - G.x[i], wy - G.y[i])); wetAt.set(i, v); }
    return v;
  };

  // This block's plots: their columns, and those clear of the setbacks.
  const back = { front: setbacks.front, side: setbacks.side, rear: setbacks.rear };
  const edges = mine.map(({ p }) => edgesOf(p.ring, plan, G, d));
  mine.forEach(({ p }, id) => {
    columns(p.ring, (q) => {
      if (street[q]) return;
      inPlot[q] = id;
      if (cellOf[q] >= 0) water[q] = wd(cellOf[q]);
      const pt: Pt = [X(q), Y(q)];
      if (edges[id].some((e) => toSegment(pt, e.a, e.b).d < back[e.kind])) return;
      plotOf[q] = id;
      capZ[q] = cellOf[q] >= 0 ? Math.max(0, Math.floor(G.cap[cellOf[q]])) : 0;
    });
  });

  // Existing buildings off the design ground (envelope.ts).
  const existing = new Float32Array(N), neighbours: number[] = [], B = G.buildings;
  if (B) for (let k = 0; k < B.rings.length; k++) {
    const r = B.rings[k], m = r.length / 2, ring: Line = [];
    let mx = 0, my = 0, bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
    for (let j = 0; j < m; j++) {
      const x = r[2 * j], y = r[2 * j + 1];
      ring.push([x, y]); mx += x; my += y;
      bx0 = Math.min(bx0, x); bx1 = Math.max(bx1, x); by0 = Math.min(by0, y); by1 = Math.max(by1, y);
    }
    if (bx1 < ox || bx0 > ox + nx * res || by1 < oy || by0 > oy + ny * res) continue;
    if (cellAt(G, mx / m, my / m) >= 0) continue;
    neighbours.push(k);
    columns(ring, (q) => { if (cellOf[q] < 0 && B.h[k] > existing[q]) existing[q] = B.h[k]; });
  }
  for (let q = 0; q < N; q++) if (existing[q] > context[q]) context[q] = existing[q];

  const plots: Plot[] = mine.map((_, id) => {
    // Axis: along the plot's front edges (directions doubled, so opposite ones add up), else
    // the long axis of its buildable columns.
    let fx = 0, fy = 0, frontage = 0;
    for (const e of edges[id]) {
      if (e.kind !== "front") continue;
      const len = Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]), th = Math.atan2(e.b[1] - e.a[1], e.b[0] - e.a[0]);
      fx += len * Math.cos(2 * th); fy += len * Math.sin(2 * th); frontage += len;
    }
    let mx = 0, my = 0, m = 0, sxx = 0, sxy = 0, syy = 0, cols = 0, target = 0, capLevels = 0, perm = 0;
    const cells = new Set<number>();
    for (let q = 0; q < N; q++) {
      if (inPlot[q] === id) {
        cols++;
        const i = cellOf[q];
        if (i >= 0) {
          cells.add(i);
          target += (d.floorArea[i] / G.cellArea) * res * res;
          perm = Math.max(perm, G.minPerm[i]);
        }
      }
      if (plotOf[q] !== id) continue;
      mx += X(q); my += Y(q); m++;
      capLevels = Math.max(capLevels, capZ[q]);
    }
    mx /= m || 1; my /= m || 1;
    for (let q = 0; q < N; q++) {
      if (plotOf[q] !== id) continue;
      const dx = X(q) - mx, dy = Y(q) - my;
      sxx += dx * dx; sxy += dx * dy; syy += dy * dy;
    }
    const axis = frontage > 0 && Math.hypot(fx, fy) > 1e-6 ? 0.5 * Math.atan2(fy, fx) : 0.5 * Math.atan2(2 * sxy, sxx - syy);
    const ux = Math.cos(axis), uy = Math.sin(axis);
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (let q = 0; q < N; q++) {
      if (plotOf[q] !== id) continue;
      const dx = X(q) - mx, dy = Y(q) - my, u = dx * ux + dy * uy, v = -dx * uy + dy * ux;
      u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v);
    }
    if (!m) { u0 = u1 = v0 = v1 = 0; }
    const cu = (u0 + u1) / 2, cv = (v0 + v1) / 2;
    return {
      id, cells: [...cells].sort((a, b) => a - b), axis,
      cx: mx + cu * ux - cv * uy, cy: my + cu * uy + cv * ux,
      half: [Math.max((u1 - u0) / 2 + res / 2, res), Math.max((v1 - v0) / 2 + res / 2, res)],
      capLevels, maxCover: Math.max(0, 1 - perm), area: cols * res * res, buildable: m * res * res, target, frontage,
    };
  });
  const nz = Math.max(1, ...plots.map((p) => p.capLevels));
  const note: string[] = [];
  const inner = plots.filter((p) => p.frontage <= 0).length;
  if (inner) note.push(`${inner} interior plot${inner > 1 ? "s" : ""} with no street or open frontage`);
  if (plots.some((p) => !p.buildable)) note.push("a plot has no room inside its setbacks");
  const cells = [...new Set(plots.flatMap((p) => p.cells))].sort((a, b) => a - b);
  return {
    block, cells, plots, ox, oy, nx, ny, nz, res, cellOf, plotOf, inPlot, capZ, street, publicGround, context, existing, neighbours, water,
    setbacks, target: plots.reduce((s, p) => s + p.target, 0), note,
  };
}

/** The design's building plots near a block's frame, as rings with a height, for the context
 *  mesh: each ring shrunk about its middle to the plot's cover. */
export function vectorContext(E: Envelope, G: Ground, d: Design): { ring: Line; h: number }[] {
  const plan = d.plan!, loc = locator(G), x1 = E.ox + E.nx * E.res, y1 = E.oy + E.ny * E.res, out: { ring: Line; h: number }[] = [];
  for (const p of plan.plots) {
    if (p.block === E.block || !massable(p)) continue;
    if (!p.ring.some(([x, y]) => x >= E.ox && x <= x1 && y >= E.oy && y <= y1)) continue;
    let cx = 0, cy = 0;
    for (const [x, y] of p.ring) { cx += x; cy += y; }
    cx /= p.ring.length; cy /= p.ring.length;
    const c = loc.cell([cx, cy]), s = Math.sqrt(Math.max(0.2, c >= 0 ? d.coverage[c] : 0.5));
    out.push({ ring: p.ring.map(([x, y]) => [cx + (x - cx) * s, cy + (y - cy) * s] as Pt), h: p.levels * STOREY_M });
  }
  return out;
}
