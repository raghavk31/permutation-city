// Explore: the designs a run kept, as a scatter matrix, parallel coordinates, extremes per
// measure and (for MAP-Elites) the archive grid. Canvas, no libraries, like draw.ts. Each
// plot returns a hit test, so the page can pick the design under the pointer.
import { SCORES, SCORE_KEYS, TARGET_TOLERANCE } from "../engine";
import type { Kept } from "../engine/worker";
import { fitCanvas, type Palette } from "./draw";

/** A measure to plot. `up`: true when higher is better, false when lower is, null when
 *  neither (floor area is a target, storeys a choice). */
export interface Axis { key: string; label: string; get: (k: Kept) => number; up: boolean | null; fmt: (v: number) => string }

export const SCORE_AXES: Axis[] = SCORE_KEYS.map((k) => {
  const [label, fmt, up] = SCORES[k];
  return { key: k, label, get: (d: Kept) => d.scores[k], up, fmt };
});
export const AXES: Axis[] = [
  ...SCORE_AXES,
  { key: "floorArea", label: "floor area", get: (d) => d.floorArea, up: null, fmt: (v) => `${Math.round(v)} ha` },
  { key: "levels", label: "average storeys", get: (d) => d.levels, up: null, fmt: (v) => v.toFixed(1) },
];

export const onBrief = (d: Kept) => d.scores.gap <= TARGET_TOLERANCE;
/** On the brief and not beaten on every score by another kept design. */
export const onFront = (d: Kept) => d.rank === 1 && onBrief(d);

/** For each measure, the designs at either end: among those on the brief when there are any. */
export function extremes(kept: Kept[], axes = AXES): { axis: Axis; lo: number; hi: number }[] {
  const pool = kept.some(onBrief) ? [...kept.keys()].filter((k) => onBrief(kept[k])) : [...kept.keys()];
  if (!pool.length) return [];
  return axes.map((axis) => {
    let lo = pool[0], hi = pool[0];
    for (const k of pool) {
      const v = axis.get(kept[k]);
      if (v < axis.get(kept[lo])) lo = k;
      if (v > axis.get(kept[hi])) hi = k;
    }
    return { axis, lo, hi };
  });
}

/** Scale an axis 0..1 over the kept designs, flipped so 1 is the better end (or the higher, when neither). */
function scaler(axis: Axis, kept: Kept[]) {
  const vs = kept.map(axis.get);
  let lo = Math.min(...vs), hi = Math.max(...vs);
  if (hi - lo < 1e-9) { lo -= 0.5; hi += 0.5; }
  return (d: Kept) => {
    const t = (axis.get(d) - lo) / (hi - lo);
    return axis.up === false ? 1 - t : t;
  };
}

/** The archive as rows of cells, top row first (high on the second trait), each the index
 *  of its elite in `kept` or -1. */
export function archiveRows(kept: Kept[], bins: number): number[][] {
  const at = new Map(kept.map((d, k) => [d.cell!, k]));
  return Array.from({ length: bins }, (_, r) => Array.from({ length: bins }, (_, c) => at.get((bins - 1 - r) * bins + c) ?? -1));
}

type Hit = (x: number, y: number) => number;
interface Marks { selected: number; hover: number }

function dot(ctx: CanvasRenderingContext2D, p: Palette, d: Kept, x: number, y: number, r: number) {
  ctx.beginPath(); ctx.arc(x, y, r, 0, 2 * Math.PI);
  if (!onBrief(d)) { ctx.strokeStyle = p.muted; ctx.lineWidth = 1; ctx.stroke(); return; }
  ctx.fillStyle = onFront(d) ? p.water : p.muted; ctx.fill();
}

function ring(ctx: CanvasRenderingContext2D, colour: string, x: number, y: number, r: number) {
  ctx.beginPath(); ctx.arc(x, y, r, 0, 2 * Math.PI); ctx.strokeStyle = colour; ctx.lineWidth = 2; ctx.stroke();
}

/** Every pair of the five scores, better towards the top and right. */
export function scatterMatrix(canvas: HTMLCanvasElement, kept: Kept[], p: Palette, { selected, hover }: Marks,
  axes = SCORE_AXES): Hit {
  const n = axes.length, m = n - 1;
  const { ctx, w } = fitCanvas(canvas, 1);
  ctx.fillStyle = p.paper; ctx.fillRect(0, 0, w, w);
  const L = 4, T = 4, gap = 6, cell = (w - L - gap * (m - 1) - 20) / m;
  const sc = axes.map((a) => scaler(a, kept));
  const pos: { x: number; y: number }[][] = []; // per panel, per design
  const panels: { x0: number; y0: number; i: number; j: number }[] = [];
  ctx.font = "11px system-ui, sans-serif";
  for (let row = 0; row < m; row++) for (let col = 0; col <= row; col++) {
    const i = col, j = row + 1; // x: axes[i], y: axes[j]
    const x0 = L + col * (cell + gap), y0 = T + row * (cell + gap);
    ctx.strokeStyle = p.sea; ctx.lineWidth = 1; ctx.strokeRect(x0 + 0.5, y0 + 0.5, cell - 1, cell - 1);
    const pts = kept.map((d) => ({ x: x0 + 5 + sc[i](d) * (cell - 10), y: y0 + cell - 5 - sc[j](d) * (cell - 10) }));
    kept.forEach((d, k) => { if (!onFront(d)) dot(ctx, p, d, pts[k].x, pts[k].y, 2.2); });
    kept.forEach((d, k) => { if (onFront(d)) dot(ctx, p, d, pts[k].x, pts[k].y, 2.6); });
    if (hover >= 0) ring(ctx, p.ink2, pts[hover].x, pts[hover].y, 5);
    if (selected >= 0) ring(ctx, p.build, pts[selected].x, pts[selected].y, 6);
    pos.push(pts); panels.push({ x0, y0, i, j });
    // Labels on the outer edge: the x measure under the bottom row, the y measure right of the diagonal.
    ctx.fillStyle = p.ink2;
    if (row === m - 1) { ctx.textAlign = "center"; ctx.fillText(axes[i].label, x0 + cell / 2, y0 + cell + 14, cell); }
    if (col === row) {
      ctx.save(); ctx.translate(x0 + cell + 12, y0 + cell / 2); ctx.rotate(Math.PI / 2);
      ctx.textAlign = "center"; ctx.fillText(axes[j].label, 0, 0, cell); ctx.restore();
    }
  }
  return (x, y) => {
    const k = panels.findIndex((q) => x >= q.x0 && x <= q.x0 + cell && y >= q.y0 && y <= q.y0 + cell);
    if (k < 0) return -1;
    let best = -1, bd = 64;
    pos[k].forEach((q, d) => { const dd = (q.x - x) ** 2 + (q.y - y) ** 2; if (dd < bd) { bd = dd; best = d; } });
    return best;
  };
}

/** One line per design across every measure; each axis better at the top (or higher, for
 *  floor area and storeys). */
export function parallel(canvas: HTMLCanvasElement, kept: Kept[], p: Palette, { selected, hover }: Marks,
  axes = AXES): Hit {
  const { ctx, w, h } = fitCanvas(canvas, 0.42);
  ctx.fillStyle = p.paper; ctx.fillRect(0, 0, w, h);
  const L = 48, R = 48, T = 30, B = 26;
  const X = (a: number) => L + (a / (axes.length - 1)) * (w - L - R);
  const sc = axes.map((a) => scaler(a, kept));
  const ys = kept.map((d) => sc.map((s) => T + (1 - s(d)) * (h - T - B)));
  const line = (k: number) => { ctx.beginPath(); ys[k].forEach((y, a) => (a ? ctx.lineTo(X(a), y) : ctx.moveTo(X(a), y))); ctx.stroke(); };
  ctx.lineJoin = "round";
  ctx.strokeStyle = p.muted; ctx.globalAlpha = 0.35; ctx.lineWidth = 1;
  kept.forEach((d, k) => { if (!onFront(d)) line(k); });
  ctx.strokeStyle = p.water; ctx.globalAlpha = 0.55; ctx.lineWidth = 1.2;
  kept.forEach((d, k) => { if (onFront(d)) line(k); });
  ctx.globalAlpha = 1;
  if (hover >= 0) { ctx.strokeStyle = p.ink2; ctx.lineWidth = 2; line(hover); }
  if (selected >= 0) { ctx.strokeStyle = p.build; ctx.lineWidth = 3; line(selected); }
  ctx.font = "11px system-ui, sans-serif"; ctx.textAlign = "center";
  axes.forEach((a, k) => {
    ctx.strokeStyle = p.ink2; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(X(k), T); ctx.lineTo(X(k), h - B); ctx.stroke();
    ctx.fillStyle = p.ink; ctx.fillText(a.label, X(k), 12, (w - L - R) / (axes.length - 1));
    const vs = kept.map(a.get), hi = Math.max(...vs), lo = Math.min(...vs);
    ctx.fillStyle = p.muted;
    ctx.fillText(a.fmt(a.up === false ? lo : hi), X(k), 25);
    ctx.fillText(a.fmt(a.up === false ? hi : lo), X(k), h - 10);
  });
  return (x, y) => {
    if (x < X(0) || x > X(axes.length - 1)) return -1;
    const s = (x - L) / (w - L - R) * (axes.length - 1), a = Math.min(Math.floor(s), axes.length - 2), f = s - a;
    let best = -1, bd = 7;
    ys.forEach((row, k) => { const d = Math.abs(row[a] + (row[a + 1] - row[a]) * f - y); if (d < bd) { bd = d; best = k; } });
    return best;
  };
}
