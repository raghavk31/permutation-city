// One plot, one building (architecture-v3 section 13, step B1): an envelope from a plot's
// outline rather than from a grown urban design, so the building-scale search can run on a
// plot typed or drawn by a person, with no site around it.
//
//   outline    the plot as a ring in metres (x east, y north), any simple polygon
//   streets    the plot's sides that face a street, with the street's width: the street band
//              outside them is public ground (the shade and sky scores read it), and the
//              front setback is taken from them
//   setbacks   front from street sides, rear from the side most opposite the main street,
//              side from the rest
//   neighbours existing buildings round the plot as prisms with a height (optional): they
//              shade the plot and the sun they lose is scored
//
// The result is the same Envelope the block massing uses (envelope.ts), with one plot, no
// design cells (cellOf -1) and an empty design context, so every representation, score and
// readout runs on it unchanged.
import { DEFAULT_SETBACKS, MARGIN_M, RES_M, WATER_REACH_M, type Envelope, type Plot, type Setbacks } from "./envelope.js";

type Pt = [number, number];

export interface PlotSpec {
  outline: Pt[];
  /** Sides of the outline (side k runs from corner k to k+1) that face a street, and its width (m). */
  streets: { side: number; width: number }[];
  /** Storeys allowed. */
  storeys: number;
  /** Floor area wanted (m²). */
  target: number;
  setbacks?: Setbacks;
  /** Share of the plot a footprint may cover (default 1: the setbacks alone limit it). */
  maxCover?: number;
  neighbours?: { outline: Pt[]; height: number }[];
  /** Water near the plot (points), for the CPPN's distance-to-water input. */
  water?: Pt[];
}

/** Point to segment distance. */
function segDist(px: number, py: number, [ax, ay]: Pt, [bx, by]: Pt): number {
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
  const t = L2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L2)) : 0;
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

/** Inside a simple polygon (ray casting). */
function inside(px: number, py: number, ring: Pt[]): boolean {
  let at = false;
  for (let j = 0, i = ring.length - 1; j < ring.length; i = j++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) at = !at;
  }
  return at;
}

const ringArea = (r: Pt[]) => Math.abs(r.reduce((s, [x, y], i) => { const [u, v] = r[(i + 1) % r.length]; return s + x * v - u * y; }, 0)) / 2;

/** The envelope of one plot given by its outline. */
export function plotEnvelope(spec: PlotSpec): Envelope {
  const ring = spec.outline, n = ring.length;
  if (n < 3) throw new Error("a plot needs at least three corners");
  const setbacks = spec.setbacks ?? DEFAULT_SETBACKS;
  const streetOf = new Map(spec.streets.filter((s) => s.side >= 0 && s.side < n && s.width > 0).map((s) => [s.side, s.width]));
  const sideVec = (k: number): [Pt, Pt] => [ring[k], ring[(k + 1) % n]];
  const len = (k: number) => { const [a, b] = sideVec(k); return Math.hypot(b[0] - a[0], b[1] - a[1]); };

  // The main street: the longest street side. The rear: the side whose direction is most
  // nearly the main street's and whose middle is farthest from it.
  const mainSide = [...streetOf.keys()].sort((a, b) => len(b) - len(a))[0] ?? -1;
  let rear = -1;
  if (mainSide >= 0) {
    const [a, b] = sideVec(mainSide), ux = (b[0] - a[0]) / len(mainSide), uy = (b[1] - a[1]) / len(mainSide);
    let best = -Infinity;
    for (let k = 0; k < n; k++) {
      if (streetOf.has(k)) continue;
      const [p, q] = sideVec(k), L = len(k) || 1, along = Math.abs(((q[0] - p[0]) * ux + (q[1] - p[1]) * uy) / L);
      const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2, away = segDist(mx, my, a, b);
      const s = along * away;
      if (s > best) { best = s; rear = k; }
    }
  }
  const back = (k: number) => (streetOf.has(k) ? setbacks.front : k === rear ? setbacks.rear : setbacks.side);

  // Raster frame: the plot, its streets and the margin.
  const widest = Math.max(0, ...streetOf.values());
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of ring) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const res = RES_M, pad = MARGIN_M + widest;
  const ox = Math.floor((x0 - pad) / res) * res, oy = Math.floor((y0 - pad) / res) * res;
  const nx = Math.ceil((x1 + pad - ox) / res), ny = Math.ceil((y1 + pad - oy) / res), N = nx * ny;
  const cellOf = new Int32Array(N).fill(-1), plotOf = new Int16Array(N).fill(-1), inPlot = new Int16Array(N).fill(-1);
  const capZ = new Int16Array(N), street = new Uint8Array(N), publicGround = new Uint8Array(N);
  const context = new Float32Array(N), existing = new Float32Array(N), water = new Float32Array(N).fill(WATER_REACH_M);
  const cap = Math.max(0, Math.floor(spec.storeys));

  let mx = 0, my = 0, m = 0, area = 0;
  for (let r = 0; r < ny; r++) for (let c = 0; c < nx; c++) {
    const px = ox + (c + 0.5) * res, py = oy + (r + 0.5) * res, q = r * nx + c;
    if (inside(px, py, ring)) {
      inPlot[q] = 0; area += res * res;
      let clear = true;
      for (let k = 0; k < n && clear; k++) if (segDist(px, py, ...sideVec(k)) < back(k)) clear = false;
      if (clear) { plotOf[q] = 0; capZ[q] = cap; mx += px; my += py; m++; }
      if (spec.water?.length) water[q] = Math.min(WATER_REACH_M, ...spec.water.map(([wx, wy]) => Math.hypot(wx - px, wy - py)));
      continue;
    }
    for (const [k, w] of streetOf) if (segDist(px, py, ...sideVec(k)) < w) { street[q] = 1; publicGround[q] = 1; break; }
  }

  // Neighbours as prisms, off the plot.
  const neighbours: number[] = [];
  (spec.neighbours ?? []).forEach((b, k) => {
    if (!(b.height > 0) || b.outline.length < 3) return;
    neighbours.push(k);
    for (let q = 0; q < N; q++) {
      if (inPlot[q] >= 0 || street[q]) continue;
      const px = ox + ((q % nx) + 0.5) * res, py = oy + (Math.floor(q / nx) + 0.5) * res;
      if (inside(px, py, b.outline) && b.height > existing[q]) existing[q] = b.height;
    }
  });
  for (let q = 0; q < N; q++) context[q] = existing[q];

  // The plot's axis: along the main street, else along its longest side.
  const axSide = mainSide >= 0 ? mainSide : [...Array(n).keys()].sort((a, b) => len(b) - len(a))[0];
  const [a, b] = sideVec(axSide), axis = Math.atan2(b[1] - a[1], b[0] - a[0]), ux = Math.cos(axis), uy = Math.sin(axis);
  mx /= m || 1; my /= m || 1;
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  for (let q = 0; q < N; q++) {
    if (plotOf[q] !== 0) continue;
    const dx = ox + ((q % nx) + 0.5) * res - mx, dy = oy + (Math.floor(q / nx) + 0.5) * res - my;
    const u = dx * ux + dy * uy, v = -dx * uy + dy * ux;
    u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v);
  }
  if (!m) { u0 = u1 = v0 = v1 = 0; }
  const cu = (u0 + u1) / 2, cv = (v0 + v1) / 2;
  const plot: Plot = {
    id: 0, cells: [], axis,
    cx: mx + cu * ux - cv * uy, cy: my + cu * uy + cv * ux,
    half: [Math.max((u1 - u0) / 2 + res / 2, res), Math.max((v1 - v0) / 2 + res / 2, res)],
    capLevels: cap, maxCover: Math.min(1, Math.max(0, spec.maxCover ?? 1)), area, buildable: m * res * res,
    target: spec.target, frontage: [...streetOf.keys()].reduce((s, k) => s + len(k), 0),
  };
  const note: string[] = [];
  if (!streetOf.size) note.push("no side faces a street: the plot's axis follows its longest side");
  if (!m) note.push("no room inside the setbacks");
  const drawn = ringArea(ring);
  if (Math.abs(area - drawn) > 0.1 * drawn) note.push(`the 2 m raster reads the plot as ${Math.round(area)} m² of ${Math.round(drawn)} m²`);
  return {
    block: 0, cells: [], plots: [plot], ox, oy, nx, ny, nz: Math.max(1, cap), res, cellOf, plotOf, inPlot, capZ, street, publicGround,
    context, existing, neighbours, water, setbacks, target: spec.target, note,
  };
}

/** A rectangular plot, w along its street and d deep, the street on its south side unless
 *  turned (degrees anticlockwise from east): the plot a form gives when no outline is drawn. */
export function rectPlot(w: number, d: number, turn = 0, streetWidth = 12): Pick<PlotSpec, "outline" | "streets"> {
  const t = (turn * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t);
  const outline = ([[0, 0], [w, 0], [w, d], [0, d]] as Pt[]).map(([x, y]): Pt => [x * c - y * s, x * s + y * c]);
  return { outline, streets: [{ side: 0, width: streetWidth }] };
}
