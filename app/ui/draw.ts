// Permutation City: drawing. Cell maps (hexes or squares), a hand-rolled 3D view and small
// line charts, on canvas, with no libraries. Colours come from CSS custom properties so the
// page's light and dark themes carry through.
import { circumradius, corners, gridOf, type Design, type SiteExport } from "../engine";

export type Palette = ReturnType<typeof palette>;
type Colour = string | null;
export interface View { s: number; px: (x: number) => number; py: (y: number) => number; bounds: number[] }
type Ctx = CanvasRenderingContext2D;

export function css(name: string, fallback: string): string {
  const el = document.querySelector(".pc") || document.documentElement; // tokens live on the page root
  const v = getComputedStyle(el).getPropertyValue(name).trim();
  return v || fallback;
}

export const palette = () => ({
  paper: css("--pc-surface", "#fcfcfb"),
  ink: css("--pc-ink", "#0b0b0b"),
  ink2: css("--pc-ink-2", "#52514e"),
  muted: css("--pc-muted", "#898781"),
  water: css("--pc-water", "#2a78d6"),
  green: css("--pc-green", "#1baf7a"),
  build: css("--pc-build", "#eb6834"),
  sea: css("--pc-sea", "#e1e0d9"),
  retained: css("--pc-retained", "#f0efec"),
  blues: ["#cde2fb", "#86b6ef", "#3987e5", "#1c5cab", "#0d366b"],
  oranges: ["#fbd5c4", "#f19a74", "#eb6834", "#b9481c", "#7a2c0e"],
});

function hexToRgb(h: string): number[] {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** A colour along a ramp (list of hex colours), t in 0..1. */
export function ramp(stops: string[], t: number): string {
  t = Math.min(Math.max(t, 0), 1) * (stops.length - 1);
  const i = Math.min(Math.floor(t), stops.length - 2), f = t - i;
  const a = hexToRgb(stops[i]), b = hexToRgb(stops[i + 1]);
  return `rgb(${a.map((v, k) => Math.round(v + (b[k] - v) * f)).join(",")})`;
}

export function shade(colour: string, k: number): string {
  const m = colour.match(/\d+/g);
  const rgb = m && colour.startsWith("rgb") ? m.slice(0, 3).map(Number) : hexToRgb(colour);
  return `rgb(${rgb.map((v) => Math.round(Math.min(255, v * k))).join(",")})`;
}

/** Size a canvas for crisp drawing at the device's pixel ratio. */
export function fitCanvas(canvas: HTMLCanvasElement, aspect?: number) {
  const w = canvas.clientWidth || canvas.parentElement!.clientWidth;
  const h = aspect ? Math.round(w * aspect) : canvas.clientHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.height = `${h}px`;
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h };
}

/** A view that fits a set of points (local metres) into w×h with a margin. */
export function view(xs: number[], ys: number[], w: number, h: number, pad = 8, r = 20): View {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < xs.length; i++) {
    if (xs[i] < x0) x0 = xs[i]; if (xs[i] > x1) x1 = xs[i];
    if (ys[i] < y0) y0 = ys[i]; if (ys[i] > y1) y1 = ys[i];
  }
  x0 -= r; x1 += r; y0 -= r; y1 += r;
  const s = Math.min((w - 2 * pad) / (x1 - x0), (h - 2 * pad) / (y1 - y0));
  const ox = (w - (x1 - x0) * s) / 2, oy = (h - (y1 - y0) * s) / 2;
  return { s, px: (x) => ox + (x - x0) * s, py: (y) => h - oy - (y - y0) * s, bounds: [x0, y0, x1, y1] };
}

/** Aspect ratio (height / width) of a set of points. */
export function aspectOf(xs: number[], ys: number[]): number {
  const w = Math.max(...xs) - Math.min(...xs) + 40, h = Math.max(...ys) - Math.min(...ys) + 40;
  return Math.min(Math.max(h / w, 0.45), 1.6);
}

/** A site's cell outline (metres from the centre, y up) and its centre-to-corner radius. */
export function shapeOf(site: SiteExport) {
  const g = gridOf(site.meta);
  return { corners: corners(g), r: circumradius(g) };
}

/** Fill cells: xs, ys (local metres), colours (one per cell, null to skip), the cell outline
 *  in metres (`shapeOf`), shrunk by `scale` for marks drawn inside cells. Batched by colour. */
export function cells(ctx: Ctx, v: View, xs: number[], ys: number[], colours: Colour[],
  shape: [number, number][], scale = 1) {
  const k = v.s * 1.02 * scale; // a hair larger than the cell, so no seams show between cells
  const pts = shape.map(([dx, dy]) => [dx * k, -dy * k]);
  const groups = new Map<string, number[]>();
  for (let i = 0; i < xs.length; i++) {
    const c = colours[i];
    if (!c) continue;
    if (!groups.has(c)) groups.set(c, []);
    groups.get(c)!.push(i);
  }
  for (const [c, idx] of groups) {
    ctx.beginPath();
    for (const i of idx) {
      const cx = v.px(xs[i]), cy = v.py(ys[i]);
      pts.forEach(([dx, dy], k) => (k ? ctx.lineTo(cx + dx, cy + dy) : ctx.moveTo(cx + dx, cy + dy)));
      ctx.closePath();
    }
    ctx.fillStyle = c;
    ctx.fill();
  }
}

/** Roads, rail, the boundary and place names. */
export function context(ctx: Ctx, v: View, c: SiteExport["context"], p: Palette,
  { labels = false, boundary = true } = {}) {
  const line = (pts: [number, number][]) => {
    ctx.beginPath();
    pts.forEach(([x, y], k) => (k ? ctx.lineTo(v.px(x), v.py(y)) : ctx.moveTo(v.px(x), v.py(y))));
    ctx.stroke();
  };
  ctx.save();
  ctx.lineJoin = "round";
  ctx.strokeStyle = p.ink2; ctx.lineWidth = 0.6; ctx.setLineDash([4, 2]);
  c.rail.forEach(line);
  ctx.setLineDash([]); ctx.strokeStyle = p.ink; ctx.lineWidth = 0.8;
  c.roads.forEach(line);
  if (boundary && c.boundary.length) { ctx.lineWidth = 1.6; c.boundary.forEach(line); }
  if (labels) {
    ctx.font = "11px system-ui, sans-serif"; ctx.textAlign = "center";
    for (const pl of c.places) {
      const x = v.px(pl.x), y = v.py(pl.y);
      const w = ctx.measureText(pl.name).width + 8;
      ctx.fillStyle = p.paper; ctx.globalAlpha = 0.85; ctx.fillRect(x - w / 2, y - 9, w, 15); ctx.globalAlpha = 1;
      ctx.fillStyle = p.ink; ctx.fillText(pl.name, x, y + 2);
    }
  }
  ctx.restore();
}

/** Colour per design cell: water, landscape, or buildings by storeys. */
export function designColours(d: Design, p: Palette): Colour[] {
  return Array.from(d.use, (u, i) => (u === 3 ? p.water : u === 2 ? p.green : u === 1
    ? ramp(p.oranges, d.levels[i] / 15) : null));
}

/** A design in plan: background (existing water, protected edge, retained city) + design. */
export function plan(canvas: HTMLCanvasElement, site: SiteExport, d: Design, p: Palette,
  { aspect, attractors = false, labels = false, locked = null }:
  { aspect?: number; attractors?: boolean; labels?: boolean; locked?: ArrayLike<number> | null } = {}): View {
  const g = site.grid, D = site.design, { corners: shape, r } = shapeOf(site);
  const { ctx, w, h } = fitCanvas(canvas, aspect);
  const v = view(D.x, D.y, w, h, 6, r * 3);
  ctx.fillStyle = p.paper; ctx.fillRect(0, 0, w, h);
  cells(ctx, v, g.x, g.y, g.state.map((s, i) => (g.water[i] || s === 0 ? p.sea : s === 1 ? p.retained : null)), shape);
  cells(ctx, v, D.x, D.y, designColours(d, p), shape);
  if (locked) {
    ctx.save(); ctx.globalAlpha = 0.5;
    cells(ctx, v, D.x, D.y, Array.from(locked, (c) => (c ? p.ink : null)), shape, 0.35);
    ctx.restore();
  }
  context(ctx, v, site.context, p, { labels });
  if (attractors) {
    ctx.save();
    for (const a of d.attractors) {
      ctx.strokeStyle = p.ink; ctx.lineWidth = 1; ctx.globalAlpha = 0.75;
      ctx.setLineDash(a.kind === "core" ? [] : a.kind === "green" ? [6, 4] : [2, 3]);
      ctx.beginPath(); ctx.arc(v.px(a.x), v.py(a.y), a.radius * v.s, 0, 2 * Math.PI); ctx.stroke();
    }
    ctx.restore();
  }
  return v;
}

/** Many small plans of one size (the MAP-Elites archive): the ground around the design and
 *  the roads are drawn once, then copied under and over each design. */
export function plans(canvases: HTMLCanvasElement[], site: SiteExport, designs: Design[], p: Palette, aspect: number) {
  if (!canvases.length) return;
  const g = site.grid, D = site.design, { corners: shape, r } = shapeOf(site);
  const first = fitCanvas(canvases[0], aspect), { w, h } = first;
  const v = view(D.x, D.y, w, h, 6, r * 3);
  const layer = (draw: (ctx: Ctx) => void) => {
    const c = document.createElement("canvas");
    c.width = canvases[0].width; c.height = canvases[0].height;
    const ctx = c.getContext("2d")!;
    ctx.setTransform(c.width / w, 0, 0, c.width / w, 0, 0);
    draw(ctx);
    return c;
  };
  const under = layer((ctx) => {
    ctx.fillStyle = p.paper; ctx.fillRect(0, 0, w, h);
    cells(ctx, v, g.x, g.y, g.state.map((s, i) => (g.water[i] || s === 0 ? p.sea : s === 1 ? p.retained : null)), shape);
  });
  const over = layer((ctx) => context(ctx, v, site.context, p));
  const copy = (ctx: Ctx, c: HTMLCanvasElement) => { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(c, 0, 0); ctx.restore(); };
  canvases.forEach((canvas, k) => {
    const { ctx } = k ? fitCanvas(canvas, aspect) : first;
    copy(ctx, under);
    cells(ctx, v, D.x, D.y, designColours(designs[k], p), shape);
    copy(ctx, over);
  });
}

/** Any per-cell grid layer: values → colours with `colourOf`. */
export function layer(canvas: HTMLCanvasElement, site: SiteExport, colourOf: (i: number) => Colour, p: Palette,
  { aspect, labels = false }: { aspect?: number; labels?: boolean } = {}): View {
  const g = site.grid, { corners: shape, r } = shapeOf(site);
  const { ctx, w, h } = fitCanvas(canvas, aspect);
  const v = view(g.x, g.y, w, h, 6, r);
  ctx.fillStyle = p.paper; ctx.fillRect(0, 0, w, h);
  cells(ctx, v, g.x, g.y, g.x.map((_, i) => colourOf(i)), shape);
  context(ctx, v, site.context, p, { labels });
  return v;
}

/** Which grid cell is under a canvas point (for hover): the nearest centre, within one
 *  cell radius. On both grids the nearest centre is the cell the point is in. */
export function cellAt(v: View, xs: number[], ys: number[], mx: number, my: number, radius: number): number {
  let best = -1, bd = (radius * v.s) ** 2;
  for (let i = 0; i < xs.length; i++) {
    const dx = v.px(xs[i]) - mx, dy = v.py(ys[i]) - my, dd = dx * dx + dy * dy;
    if (dd < bd) { bd = dd; best = i; }
  }
  return best;
}

/**
 * The design in 3D: cell prisms in an oblique projection, painted far to near.
 * bearing in radians (drag to change); tilt is the view angle from straight down.
 */
export function solid(canvas: HTMLCanvasElement, site: SiteExport, d: Design, p: Palette,
  { aspect = 0.62, bearing = -0.5, tilt = 0.95 } = {}) {
  const g = site.grid, D = site.design, { corners: shape, r } = shapeOf(site);
  const { ctx, w, h } = fitCanvas(canvas, aspect);
  ctx.fillStyle = p.paper; ctx.fillRect(0, 0, w, h);
  const cb = Math.cos(bearing), sb = Math.sin(bearing), ct = Math.cos(tilt), st = Math.sin(tilt);
  const rot = (x: number, y: number): [number, number] => [x * cb - y * sb, x * sb + y * cb];
  // Fit the rotated design ground.
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < D.x.length; i++) {
    const [x, y] = rot(D.x[i], D.y[i]);
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  const zmax = 15 * 3.2 * 2.2; // storeys → metres, exaggerated for legibility
  const s = Math.min((w - 20) / (x1 - x0 + 2 * r), (h - 20) / ((y1 - y0 + 2 * r) * ct + zmax * st));
  const cx = w / 2 - ((x0 + x1) / 2) * s, cy = h / 2 + ((y0 + y1) / 2) * ct * s + (zmax * st * s) / 2;
  const P = (x: number, y: number, z: number): [number, number] => [cx + x * s, cy - y * ct * s - z * st * s];

  // Corners of a cell, rotated with the scene.
  const corners = shape.map(([x, y]) => rot(x, y));
  const light = [-0.45, -0.7]; // from the viewer's lower left

  const cells: { x: number; y: number; z: number; colour: string }[] = [];
  for (let i = 0; i < g.x.length; i++) {
    if (!(g.water[i] || g.state[i] === 0 || g.state[i] === 1)) continue;
    const [x, y] = rot(g.x[i], g.y[i]);
    cells.push({ x, y, z: 0, colour: g.water[i] || g.state[i] === 0 ? p.sea : p.retained });
  }
  const colours = designColours(d, p);
  for (let i = 0; i < D.x.length; i++) {
    const [x, y] = rot(D.x[i], D.y[i]);
    cells.push({ x, y, z: d.use[i] === 1 ? d.levels[i] * 3.2 * 2.2 : 0, colour: colours[i]! });
  }
  cells.sort((a, b) => b.y - a.y || a.z - b.z); // far first

  for (const c of cells) {
    const top = corners.map(([dx, dy]) => P(c.x + dx, c.y + dy, c.z));
    if (c.z > 0) {
      for (let k = 0; k < corners.length; k++) {
        const [ax, ay] = corners[k], [bx, by] = corners[(k + 1) % corners.length];
        const mx = (ax + bx) / 2, my = (ay + by) / 2;
        if (my > 0) continue; // this side faces away from the viewer
        const lit = 0.72 + 0.28 * Math.max(0, -(mx * light[0] + my * light[1]) / r);
        const a0 = P(c.x + ax, c.y + ay, 0), b0 = P(c.x + bx, c.y + by, 0);
        const a1 = P(c.x + ax, c.y + ay, c.z), b1 = P(c.x + bx, c.y + by, c.z);
        ctx.beginPath(); ctx.moveTo(...a0); ctx.lineTo(...b0); ctx.lineTo(...b1); ctx.lineTo(...a1); ctx.closePath();
        ctx.fillStyle = shade(c.colour, lit * 0.82); ctx.fill();
      }
    }
    ctx.beginPath(); top.forEach((q, k) => (k ? ctx.lineTo(...q) : ctx.moveTo(...q))); ctx.closePath();
    ctx.fillStyle = c.colour; ctx.fill();
    if (c.z > 0) { ctx.strokeStyle = shade(c.colour, 0.8); ctx.lineWidth = 0.4; ctx.stroke(); }
  }
}

/** A small line chart: one series, end labels. */
export function sparkline(canvas: HTMLCanvasElement, values: (number | null)[], p: Palette,
  { format = (v: number) => String(v), colour, marker = null }:
  { format?: (v: number) => string; colour?: string; marker?: number | null } = {}) {
  const { ctx, w, h } = fitCanvas(canvas, 0.42);
  ctx.fillStyle = p.paper; ctx.fillRect(0, 0, w, h);
  const pts = values.map((v, i) => [i, v] as [number, number | null])
    .filter((pt): pt is [number, number] => pt[1] !== null && pt[1] !== undefined);
  if (pts.length < 1) return;
  const vs = pts.map(([, v]) => v);
  let lo = Math.min(...vs), hi = Math.max(...vs);
  if (hi === lo) { hi += 1; lo -= 1; }
  const L = 8, R = 52, T = 10, B = 16;
  const X = (i: number) => L + (i / Math.max(values.length - 1, 1)) * (w - L - R);
  const Y = (v: number) => T + (1 - (v - lo) / (hi - lo)) * (h - T - B);
  ctx.strokeStyle = p.sea; ctx.lineWidth = 1;
  [0, 0.5, 1].forEach((f) => { ctx.beginPath(); ctx.moveTo(L, T + f * (h - T - B)); ctx.lineTo(w - R, T + f * (h - T - B)); ctx.stroke(); });
  if (marker !== null) {
    ctx.setLineDash([3, 3]); ctx.strokeStyle = p.ink2;
    ctx.beginPath(); ctx.moveTo(X(marker), T); ctx.lineTo(X(marker), h - B); ctx.stroke(); ctx.setLineDash([]);
  }
  ctx.strokeStyle = colour || p.water; ctx.lineWidth = 2; ctx.lineJoin = "round";
  ctx.beginPath(); pts.forEach(([i, v], k) => (k ? ctx.lineTo(X(i), Y(v)) : ctx.moveTo(X(i), Y(v)))); ctx.stroke();
  const [li, lv] = pts[pts.length - 1];
  ctx.fillStyle = p.ink; ctx.font = "12px system-ui, sans-serif"; ctx.textAlign = "left";
  ctx.fillText(format(lv), X(li) + 6, Y(lv) + 4);
  ctx.fillStyle = p.muted; ctx.font = "10px system-ui, sans-serif";
  ctx.fillText("gen 0", L, h - 3); ctx.textAlign = "right"; ctx.fillText(`gen ${values.length - 1}`, w - R, h - 3);
}
