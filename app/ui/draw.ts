// Permutation City: drawing on canvas, with no libraries. Maps of grid layers and of designs,
// small line charts and the space syntax map. Colours come from ui/tokens.ts, one meaning per
// colour (docs/ui/colour.md).
//
// No cell outlines: cells of one colour are dissolved into regions whose outlines are smoothed
// (`regions`), so a design reads as shapes, not a board of tiles. The grid stays for analysis;
// the hover readouts still find the cell under the pointer.
import { circumradius, corners, gridOf, type Design, type SiteExport } from "../engine";
import { buildingAt, neutrals, tokens as T } from "./tokens";

export type Palette = ReturnType<typeof palette>;
/** Street centrelines to draw (engine `centrelines`), and the width of each class in metres. */
export interface StreetLines { lines: { cls: number; points: [number, number][] }[]; widths: readonly number[] }
type Colour = string | null;
export interface View { s: number; px: (x: number) => number; py: (y: number) => number; bounds: number[] }
type Ctx = CanvasRenderingContext2D;

export function css(name: string, fallback: string): string {
  const el = document.querySelector(".pc") || document.documentElement; // tokens live on the page root
  const v = getComputedStyle(el).getPropertyValue(name).trim();
  return v || fallback;
}

/** The colours drawing uses: the theme's neutrals, then the tokens' semantic colours. */
export const palette = () => {
  const n = neutrals();
  return {
    ...n,
    t: T,
    water: T.water.deep, green: T.green.existing, build: T.building[3],
    sea: T.water.deep, retained: T.existing.fill,
    /** Water, light to deep (storage, flood, deep, and darker). */
    blues: [T.water.storage, T.water.flood, "#6f97c4", T.water.deep, "#2b5585"],
    /** Buildings, low to tall. */
    oranges: T.building,
  };
};

function hexToRgb(h: string): number[] {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** A colour along a ramp (list of hex colours), t in 0..1. */
export function ramp(stops: readonly string[], t: number): string {
  t = Math.min(Math.max(t, 0), 1) * (stops.length - 1);
  const i = Math.min(Math.floor(t), stops.length - 2), f = t - i;
  const a = hexToRgb(stops[i]), b = hexToRgb(stops[i + 1]);
  return `rgb(${a.map((v, k) => Math.round(v + (b[k] - v) * f)).join(",")})`;
}
/** A ramp in steps (for maps: a few classes read better than a smooth blend, and dissolve). */
export const step = (stops: readonly string[], t: number) =>
  stops[Math.min(stops.length - 1, Math.max(0, Math.floor(Math.min(Math.max(t, 0), 0.9999) * stops.length)))];

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
export function view(xs: ArrayLike<number>, ys: ArrayLike<number>, w: number, h: number, pad = 8, r = 20): View {
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

/** The margin round the design ground every map is framed with: modest, so the design fills
 *  the frame and the context is a rim, not half the picture. */
export const marginOf = (site: SiteExport) => {
  const D = site.design;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < D.x.length; i++) {
    x0 = Math.min(x0, D.x[i]); x1 = Math.max(x1, D.x[i]); y0 = Math.min(y0, D.y[i]); y1 = Math.max(y1, D.y[i]);
  }
  return Math.max(60, 0.06 * Math.max(x1 - x0, y1 - y0));
};

/** Aspect ratio (height / width) of a set of points. */
export function aspectOf(xs: ArrayLike<number>, ys: ArrayLike<number>): number {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < xs.length; i++) {
    x0 = Math.min(x0, xs[i]); x1 = Math.max(x1, xs[i]); y0 = Math.min(y0, ys[i]); y1 = Math.max(y1, ys[i]);
  }
  return Math.min(Math.max((y1 - y0 + 120) / (x1 - x0 + 120), 0.45), 1.6);
}

/** A site's cell outline (metres from the centre, y up) and its centre-to-corner radius. */
export function shapeOf(site: SiteExport) {
  const g = gridOf(site.meta);
  return { corners: corners(g), r: circumradius(g) };
}

// --- dissolving cells into regions ------------------------------------------------------

/** Corners shared between cells, found once per set of cell centres. */
interface Mesh { vid: Int32Array; vx: Float64Array; vy: Float64Array; deg: number }
const meshes = new WeakMap<object, Mesh>();
function meshOf(xs: ArrayLike<number>, ys: ArrayLike<number>, shape: [number, number][]): Mesh {
  const hit = meshes.get(xs as object);
  if (hit && hit.vid.length === xs.length * shape.length) return hit;
  // Corners within 20 cm are one corner. Buckets are 50 cm and a corner looks in the nine round
  // its own, so two copies of a corner that round to neighbouring buckets still meet.
  const deg = shape.length, vid = new Int32Array(xs.length * deg), buckets = new Map<string, number[]>();
  const vx: number[] = [], vy: number[] = [];
  for (let i = 0; i < xs.length; i++) {
    for (let k = 0; k < deg; k++) {
      const x = xs[i] + shape[k][0], y = ys[i] + shape[k][1], bx = Math.round(x * 2), by = Math.round(y * 2);
      let id = -1;
      for (let dx = -1; dx <= 1 && id < 0; dx++) for (let dy = -1; dy <= 1 && id < 0; dy++) {
        for (const c of buckets.get(`${bx + dx},${by + dy}`) ?? []) if (Math.abs(vx[c] - x) < 0.2 && Math.abs(vy[c] - y) < 0.2) { id = c; break; }
      }
      if (id < 0) {
        id = vx.length; vx.push(x); vy.push(y);
        const key = `${bx},${by}`, b = buckets.get(key);
        if (b) b.push(id); else buckets.set(key, [id]);
      }
      vid[i * deg + k] = id;
    }
  }
  const m = { vid, vx: Float64Array.from(vx), vy: Float64Array.from(vy), deg };
  meshes.set(xs as object, m);
  return m;
}

// The last few dissolves per grid, by their colours: a map draws the same ones again after a
// pan or zoom, and a rule change alters only some of its layers (about 30 ms each on Bengaluru).
// Callers share the outlines, so they read them and never change them.
const dissolved = new WeakMap<ArrayLike<number>, Map<string, Map<string, [number, number][][]>>>();

/**
 * Dissolve cells into regions, one set of closed outlines per colour, in metres.
 *  - A cell side is on an outline when the cell across it has another colour (or none).
 *  - Sides are walked into loops; holes come out wound the other way, so a non-zero fill
 *    leaves them open.
 *  - Smoothing: the loop runs through the middles of its sides (which takes the zigzag out
 *    of hex outlines), is averaged over about two cells' worth of sides (which takes out the
 *    stair steps of a diagonal edge), then has its corners cut (Chaikin). Two regions that
 *    share a boundary smooth it alike, so they meet without a gap.
 */
export function regions(xs: ArrayLike<number>, ys: ArrayLike<number>, colours: Colour[], shape: [number, number][],
  smooth = 2, cut: ((i: number, k: number) => boolean) | null = null): Map<string, [number, number][][]> {
  if (cut) return dissolve(xs, ys, colours, shape, smooth, cut);
  const key = `${smooth}|${shape.flat().join(",")}|${colours.map((c) => c ?? "").join(";")}`;
  let seen = dissolved.get(xs);
  if (!seen) dissolved.set(xs, (seen = new Map()));
  let out = seen.get(key);
  if (out) { seen.delete(key); seen.set(key, out); return out; }
  out = dissolve(xs, ys, colours, shape, smooth, null);
  seen.set(key, out);
  if (seen.size > 24) seen.delete(seen.keys().next().value!);
  return out;
}

function dissolve(xs: ArrayLike<number>, ys: ArrayLike<number>, colours: Colour[], shape: [number, number][],
  smooth: number, cut: ((i: number, k: number) => boolean) | null): Map<string, [number, number][][]> {
  const m = meshOf(xs, ys, shape), deg = m.deg;
  // The colour on each directed side, keyed by its two corners. Side k of cell i runs from
  // corner k to corner k + 1. `cut` makes a side an outline even between cells of one colour
  // (a street between two buildings).
  const sideColour = new Map<number, string>(), cuts = new Set<number>();
  const key = (a: number, b: number) => a * 4194304 + b;
  for (let i = 0; i < xs.length; i++) {
    const c = colours[i];
    if (!c) continue;
    for (let k = 0; k < deg; k++) {
      const kk = key(m.vid[i * deg + k], m.vid[i * deg + (k + 1) % deg]);
      sideColour.set(kk, c);
      if (cut?.(i, k)) cuts.add(kk);
    }
  }
  // Outline sides: those whose reverse side has a different colour, or that are cut.
  const next = new Map<string, Map<number, number[]>>();
  for (const [kk, c] of sideColour) {
    const a = Math.floor(kk / 4194304), b = kk % 4194304;
    if (sideColour.get(key(b, a)) === c && !cuts.has(kk) && !cuts.has(key(b, a))) continue;
    let byStart = next.get(c);
    if (!byStart) next.set(c, (byStart = new Map()));
    const list = byStart.get(a);
    if (list) list.push(b); else byStart.set(a, [b]);
  }
  const out = new Map<string, [number, number][][]>();
  for (const [c, byStart] of next) {
    const loops: [number, number][][] = [];
    for (const [start] of byStart) {
      while (byStart.get(start)?.length) {
        const ring: number[] = [start];
        let at = start, prev = -1;
        for (let guard = 0; guard < 1e6; guard++) {
          const list = byStart.get(at);
          if (!list || !list.length) break;
          // Where two parts of a region touch at a corner, two outline sides leave it: take the
          // sharpest left turn, which keeps the walk on the part it came along.
          let pick = list.length - 1;
          if (list.length > 1 && prev >= 0) {
            const ix = m.vx[at] - m.vx[prev], iy = m.vy[at] - m.vy[prev];
            let best = -Infinity;
            list.forEach((c, j) => {
              const ox = m.vx[c] - m.vx[at], oy = m.vy[c] - m.vy[at];
              let turn = Math.atan2(ix * oy - iy * ox, ix * ox + iy * oy);
              if (turn > Math.PI - 1e-9) turn = -Math.PI; // going back the way it came is the last choice
              if (turn > best) { best = turn; pick = j; }
            });
          }
          const nx = list.splice(pick, 1)[0];
          if (!list.length) byStart.delete(at);
          if (nx === start) break;
          ring.push(nx); prev = at; at = nx;
        }
        if (ring.length >= 3) loops.push(smoothRing(ring.map((v) => [m.vx[v], m.vy[v]] as [number, number]), smooth));
      }
    }
    out.set(c, loops);
  }
  return out;
}

/** A smoothed outline moved `d` metres towards the side it encloses (outer outlines run
 *  anticlockwise and holes clockwise, so that side is always on the left): regions shrink
 *  and their holes grow. Fine for the gentle curves `regions` makes; a part narrower than 2d
 *  turns inside out and is dropped. */
export function inset(loop: [number, number][], d: number): [number, number][] | null {
  const n = loop.length;
  if (n < 3 || d === 0) return loop;
  const out: [number, number][] = [];
  for (let k = 0; k < n; k++) {
    const [px, py] = loop[(k - 1 + n) % n], [x, y] = loop[k], [qx, qy] = loop[(k + 1) % n];
    let ax = x - px, ay = y - py, bx = qx - x, by = qy - y;
    const la = Math.hypot(ax, ay) || 1, lb = Math.hypot(bx, by) || 1;
    ax /= la; ay /= la; bx /= lb; by /= lb;
    // Left normals of the two sides, averaged; the miter stretches it, capped at 2.
    let nx = -(ay + by), ny = ax + bx;
    const ln = Math.hypot(nx, ny) || 1;
    nx /= ln; ny /= ln;
    const cos = nx * -ay + ny * ax, k2 = 1 / Math.max(cos, 0.5);
    out.push([x + nx * d * k2, y + ny * d * k2]);
  }
  // Signed area keeps its sign if the outline survived.
  const area = (r: [number, number][]) => r.reduce((s, [x, y], k) => s + x * r[(k + 1) % r.length][1] - r[(k + 1) % r.length][0] * y, 0);
  return Math.sign(area(out)) === Math.sign(area(loop)) && Math.abs(area(out)) > 4 * d * d ? out : null;
}

function smoothRing(pts: [number, number][], rounds: number): [number, number][] {
  if (rounds <= 0) return pts;
  let r: [number, number][] = pts.map((p, k) => {
    const q = pts[(k + 1) % pts.length];
    return [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
  });
  // A moving average over five sides, twice; small loops (one or two cells) keep their shape.
  if (r.length > 12) {
    for (let pass = 0; pass < 2; pass++) {
      const n = r.length;
      r = r.map((_, k) => {
        let x = 0, y = 0;
        for (let j = -2; j <= 2; j++) { const q = r[(k + j + n) % n]; x += q[0]; y += q[1]; }
        return [x / 5, y / 5] as [number, number];
      });
    }
  }
  for (let n = 1; n < rounds + 1; n++) {
    const s: [number, number][] = [];
    for (let k = 0; k < r.length; k++) {
      const p = r[k], q = r[(k + 1) % r.length];
      s.push([0.75 * p[0] + 0.25 * q[0], 0.75 * p[1] + 0.25 * q[1]], [0.25 * p[0] + 0.75 * q[0], 0.25 * p[1] + 0.75 * q[1]]);
    }
    r = s;
  }
  return r;
}

function tracePath(ctx: Ctx, v: View, loops: [number, number][][]) {
  ctx.beginPath();
  for (const loop of loops) {
    loop.forEach(([x, y], k) => (k ? ctx.lineTo(v.px(x), v.py(y)) : ctx.moveTo(v.px(x), v.py(y))));
    ctx.closePath();
  }
}

// --- patterns ---------------------------------------------------------------------------

const patternCache = new WeakMap<Ctx, Map<string, CanvasPattern>>();
/** A repeating pattern: diagonal hatch ("/" or "\\") or a stipple of dots, in a colour. */
export function pattern(ctx: Ctx, kind: "/" | "\\" | "dots", colour: string, gap = 6, width = 1): CanvasPattern {
  let cache = patternCache.get(ctx);
  if (!cache) patternCache.set(ctx, (cache = new Map()));
  const id = `${kind}${colour}${gap}${width}`;
  const hit = cache.get(id);
  if (hit) return hit;
  const dpr = Math.min(window.devicePixelRatio || 1, 2), n = Math.round(gap * dpr);
  const c = document.createElement("canvas");
  c.width = c.height = n;
  const g = c.getContext("2d")!;
  g.strokeStyle = g.fillStyle = colour; g.lineWidth = width * dpr;
  if (kind === "dots") { g.beginPath(); g.arc(n / 4, n / 4, 0.75 * dpr, 0, 2 * Math.PI); g.arc((3 * n) / 4, (3 * n) / 4, 0.75 * dpr, 0, 2 * Math.PI); g.fill(); }
  else {
    g.beginPath();
    for (const o of [-n, 0, n]) {
      if (kind === "/") { g.moveTo(o, n); g.lineTo(o + n, 0); } else { g.moveTo(o, 0); g.lineTo(o + n, n); }
    }
    g.stroke();
  }
  const p = ctx.createPattern(c, "repeat")!;
  p.setTransform(new DOMMatrix().scale(1 / dpr));
  cache.set(id, p);
  return p;
}

export interface FillStyle { pattern?: "/" | "\\" | "dots"; gap?: number; ink?: string; edge?: string; width?: number; fill?: boolean }

/** Fill cells as dissolved regions, a colour per cell (null: none). `styles` adds a pattern
 *  or an edge line to a colour; colours named there only as patterns aren't filled. */
export function fillRegions(ctx: Ctx, v: View, xs: ArrayLike<number>, ys: ArrayLike<number>, colours: Colour[],
  shape: [number, number][], styles: Record<string, FillStyle> = {}, smooth = 2) {
  const rs = regions(xs, ys, colours, shape, smooth);
  ctx.save();
  ctx.lineJoin = "round";
  // Under the regions, everything they cover in the commonest filled colour: where three
  // regions meet, their smoothed outlines can leave a sliver, and it shows that colour, not paper.
  const filled = colours.map((c) => (c && styles[c]?.fill !== false ? "all" : null));
  const counts = new Map<string, number>();
  for (const c of colours) if (c && styles[c]?.fill !== false) counts.set(c, (counts.get(c) ?? 0) + 1);
  const common = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (common && counts.size > 1) {
    tracePath(ctx, v, regions(xs, ys, filled, shape, smooth).get("all") ?? []);
    ctx.fillStyle = common; ctx.fill();
  }
  for (const [c, loops] of rs) {
    const st = styles[c] ?? {};
    tracePath(ctx, v, loops);
    if (st.fill !== false) {
      ctx.fillStyle = c; ctx.fill();
      ctx.strokeStyle = c; ctx.lineWidth = 1.2; ctx.stroke(); // closes hairline seams between regions
    }
    if (st.pattern) { ctx.fillStyle = pattern(ctx, st.pattern, st.ink ?? T.ink2, st.gap); ctx.fill(); }
    if (st.edge) { ctx.strokeStyle = st.edge; ctx.lineWidth = st.width ?? 0.9; ctx.stroke(); }
  }
  ctx.restore();
}

/** Plain cell shapes, shrunk by `scale` (debug overlays and small markers only; maps of
 *  designs and layers use `fillRegions`). */
export function cells(ctx: Ctx, v: View, xs: ArrayLike<number>, ys: ArrayLike<number>, colours: Colour[],
  shape: [number, number][], scale = 1) {
  const k = v.s * scale;
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
      pts.forEach(([dx, dy], j) => (j ? ctx.lineTo(cx + dx, cy + dy) : ctx.moveTo(cx + dx, cy + dy)));
      ctx.closePath();
    }
    ctx.fillStyle = c;
    ctx.fill();
  }
}

/** Small dots at cell centres (locks, marks), never cell outlines. */
export function dots(ctx: Ctx, v: View, xs: ArrayLike<number>, ys: ArrayLike<number>, on: (i: number) => boolean,
  colour: string, radius = 1.6) {
  ctx.save(); ctx.fillStyle = colour; ctx.beginPath();
  for (let i = 0; i < xs.length; i++) {
    if (!on(i)) continue;
    const x = v.px(xs[i]), y = v.py(ys[i]);
    ctx.moveTo(x + radius, y); ctx.arc(x, y, radius, 0, 2 * Math.PI);
  }
  ctx.fill(); ctx.restore();
}

// --- context ----------------------------------------------------------------------------

// The footprints as one path in metres, made once per site: tracing Bengaluru's thousands of
// buildings again was most of every map's draw. Views are affine, so the path is drawn
// through the view's transform.
const footprintPaths = new WeakMap<SiteExport, Path2D>();

/** The buildings standing on the design ground today (the design replaces them): all of them
 *  outlined (the Draw step, to pick one to keep), or only those kept by a move, drawn as the
 *  existing city over a design. */
const groundPaths = new WeakMap<object, Path2D>();
export function groundBuildings(ctx: Ctx, v: View, site: SiteExport, which: "all" | "kept", p: Palette) {
  const g = site.context.buildings?.ground;
  if (!g?.rings.length) return;
  const ids = which === "all" ? null : site.moves?.kept ?? [];
  if (ids && !ids.length) return;
  const keyObj = ids ? site.moves! : g;
  let path = groundPaths.get(keyObj);
  if (!path) {
    path = new Path2D();
    for (const k of ids ?? g.rings.keys()) {
      const r = g.rings[k];
      if (!r) continue;
      for (let i = 0; i < r.length; i += 2) (i ? path.lineTo(r[i], r[i + 1]) : path.moveTo(r[i], r[i + 1]));
      path.closePath();
    }
    groundPaths.set(keyObj, path);
  }
  const e = v.px(0), f = v.py(0), a = v.px(1) - e, d = v.py(1) - f;
  ctx.save();
  ctx.transform(a, 0, 0, d, e, f);
  if (which === "kept") {
    ctx.fillStyle = T.existing.fill; ctx.fill(path);
    ctx.strokeStyle = p.ink; ctx.lineWidth = 1 / Math.abs(a); ctx.stroke(path);
  } else {
    ctx.strokeStyle = T.existing.edge; ctx.lineWidth = 0.6 / Math.abs(a); ctx.stroke(path);
  }
  ctx.restore();
}

/** The existing city round the design: building footprints in light grey with an edge. */
export function footprints(ctx: Ctx, v: View, site: SiteExport) {
  const b = site.context.buildings;
  if (!b?.rings?.length) return;
  let path = footprintPaths.get(site);
  if (!path) {
    path = new Path2D();
    for (const r of b.rings) {
      for (let k = 0; k < r.length; k += 2) (k ? path.lineTo(r[k], r[k + 1]) : path.moveTo(r[k], r[k + 1]));
      path.closePath();
    }
    footprintPaths.set(site, path);
  }
  const e = v.px(0), f = v.py(0), a = v.px(1) - e, d = v.py(1) - f;
  ctx.save();
  ctx.transform(a, 0, 0, d, e, f);
  ctx.fillStyle = T.existing.fill; ctx.fill(path);
  ctx.strokeStyle = T.existing.edge; ctx.lineWidth = 0.5 / Math.abs(a); ctx.stroke(path);
  ctx.restore();
}

/** Roads and rail (quiet, under the design's own lines), the site boundary and place names. */
export function context(ctx: Ctx, v: View, c: SiteExport["context"], p: Palette,
  { labels = false, boundary = true, roads = true } = {}) {
  const line = (pts: [number, number][]) => {
    ctx.beginPath();
    pts.forEach(([x, y], k) => (k ? ctx.lineTo(v.px(x), v.py(y)) : ctx.moveTo(v.px(x), v.py(y))));
    ctx.stroke();
  };
  ctx.save();
  ctx.lineJoin = "round"; ctx.lineCap = "round";
  if (roads) {
    ctx.strokeStyle = T.existing.rail; ctx.lineWidth = 0.7; ctx.setLineDash([3, 3]);
    c.rail.forEach(line);
    ctx.setLineDash([]); ctx.strokeStyle = T.existing.road; ctx.lineWidth = 1.1;
    c.roads.forEach(line);
  }
  if (boundary && c.boundary.length) { ctx.strokeStyle = p.ink; ctx.lineWidth = 1.2; c.boundary.forEach(line); }
  if (labels) {
    ctx.font = `11px ${T.font.text}`; ctx.textAlign = "center";
    for (const pl of c.places) {
      const x = v.px(pl.x), y = v.py(pl.y);
      ctx.lineWidth = 3; ctx.strokeStyle = p.paper; ctx.strokeText(pl.name, x, y + 4);
      ctx.fillStyle = p.ink2; ctx.fillText(pl.name, x, y + 4);
    }
  }
  ctx.restore();
}

/** Existing water on the grid (sea, lakes, rivers), dissolved, in the deep water colour. */
function existingWater(ctx: Ctx, v: View, site: SiteExport, shape: [number, number][]) {
  const g = site.grid;
  fillRegions(ctx, v, g.x, g.y, g.water.map((w) => (w ? T.water.deep : null)), shape);
}

// --- rules ------------------------------------------------------------------------------

/** How each rule state is drawn, the same on every page: forbidden a muted red hatch, retained
 *  the existing city's grey, constrained a thin grey hatch (never a fill), open a pale ground
 *  for the genes. `colour` is a key for `fillRegions`; `swatch` is CSS for a legend. */
export const RULE_LOOK: { colour: string; style: FillStyle; swatch: string }[] = [
  { colour: "rule-forbidden", style: { fill: false, pattern: "/", ink: T.forbidden, edge: T.forbidden },
    swatch: `background: repeating-linear-gradient(-45deg, ${T.forbidden} 0 1px, transparent 1px 5px)` },
  { colour: T.existing.fill, style: { edge: T.existing.edge }, swatch: `background: ${T.existing.fill}` },
  { colour: "rule-constrained", style: { fill: false, pattern: "\\", gap: 11, ink: T.line, edge: T.constrained },
    swatch: `background: repeating-linear-gradient(45deg, ${T.line} 0 1px, transparent 1px 7px); border-color: ${T.constrained}` },
  { colour: T.paper2, style: { edge: T.ink2 }, swatch: `background: ${T.paper2}; border-color: ${T.ink2}` },
];
export const RULE_STYLES: Record<string, FillStyle> = Object.fromEntries(RULE_LOOK.map((r) => [r.colour, r.style]));

// --- designs ----------------------------------------------------------------------------

/** Colour per design cell: water (the design's ponds and tanks, as storage), proposed green,
 *  or buildings by storeys. */
export function designColours(d: Design, p?: Palette): Colour[] {
  void p;
  return Array.from(d.use, (u, i) => (u === 3 ? T.water.storage : u === 2 ? T.green.proposed : u === 1
    ? buildingAt(d.levels[i]) : null));
}
/** How a design's colours are finished: proposed green stippled, design water edged. */
export const DESIGN_STYLES: Record<string, FillStyle> = {
  [T.green.proposed]: { pattern: "dots", ink: T.green.existing },
  [T.water.storage]: { edge: T.water.edge },
};

/** Streets as pale bands through the design, at their true width (at least a hairline), the
 *  primary streets with a thin centre line. */
export function streets(ctx: Ctx, v: View, s: StreetLines | null | undefined, p: Palette) {
  if (!s) return;
  ctx.save();
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  for (const pass of [0, 1]) {
    for (const l of s.lines) {
      if (pass === 1 && l.cls < 3) continue;
      ctx.beginPath();
      l.points.forEach(([x, y], k) => (k ? ctx.lineTo(v.px(x), v.py(y)) : ctx.moveTo(v.px(x), v.py(y))));
      ctx.strokeStyle = pass ? T.street.primary : T.street.onDesign;
      ctx.lineWidth = pass ? 0.5 : Math.max(s.widths[l.cls] * v.s, 0.9);
      ctx.stroke();
    }
  }
  void p;
  ctx.restore();
}

/** Attractors drawn boldly: a ring for each one's reach and a mark at its centre, coloured by
 *  what it pulls (building density, green, water), the ring solid, dashed or dotted to match. */
export function attractors(ctx: Ctx, v: View, d: Design) {
  const kindColour = { core: T.building[4], green: T.green.existing, water: T.water.deep } as Record<string, string>;
  ctx.save();
  for (const a of d.attractors) {
    const c = kindColour[a.kind] ?? T.ink, x = v.px(a.x), y = v.py(a.y), r = a.radius * v.s;
    ctx.fillStyle = c;
    ctx.beginPath(); ctx.arc(x, y, r, 0, 2 * Math.PI);
    ctx.globalAlpha = 0.9; ctx.strokeStyle = c; ctx.lineWidth = 1.8;
    ctx.setLineDash(a.kind === "core" ? [] : a.kind === "green" ? [7, 4] : [2, 3]);
    ctx.stroke(); ctx.setLineDash([]);
    ctx.globalAlpha = 1; ctx.beginPath(); ctx.arc(x, y, 4, 0, 2 * Math.PI); ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = T.paper; ctx.stroke();
  }
  ctx.restore();
}

/** A version 3 design as it is: plots coloured by use (buildings by storeys), its streets
 *  at their widths on top. No cells. */
export function vectorPlan(ctx: Ctx, v: View, d: Design) {
  const plan = d.plan!;
  ctx.save();
  ctx.lineJoin = "round";
  const ring = (r: [number, number][]) => { ctx.beginPath(); r.forEach(([x, y], k) => (k ? ctx.lineTo(v.px(x), v.py(y)) : ctx.moveTo(v.px(x), v.py(y)))); ctx.closePath(); };
  // Blocks first, in the street colour's neighbour (the ground between plots), then plots.
  for (const b of plan.blocks) { ring(b); ctx.fillStyle = T.paper2; ctx.fill(); }
  for (const p of plan.plots) {
    ring(p.ring);
    const c = p.use === 1 ? buildingAt(p.levels) : p.use === 2 ? T.green.proposed : p.use === 3 ? T.water.storage : T.paper2;
    ctx.fillStyle = c; ctx.fill();
    if (p.use === 2) { ctx.fillStyle = pattern(ctx, "dots", T.green.existing); ctx.fill(); }
    ctx.strokeStyle = p.use === 1 ? T.paper : c; ctx.lineWidth = p.use === 1 ? 0.5 : 0.8; ctx.stroke();
  }
  ctx.lineCap = "round";
  for (const pass of [0, 1]) for (const st of [...plan.streets].sort((a, b) => a.cls - b.cls)) {
    if (pass === 1 && st.cls < 3) continue;
    ctx.beginPath();
    st.pts.forEach(([x, y], k) => (k ? ctx.lineTo(v.px(x), v.py(y)) : ctx.moveTo(v.px(x), v.py(y))));
    ctx.strokeStyle = pass ? T.street.primary : T.street.onDesign;
    ctx.lineWidth = pass ? 0.5 : Math.max(st.w * v.s, 0.8);
    ctx.stroke();
  }
  ctx.restore();
}

export interface PlanOptions {
  aspect?: number; attractors?: boolean; labels?: boolean; locked?: ArrayLike<number> | null; roads?: StreetLines | null;
}

/** The ground under a design: paper, existing water, the existing city's footprints. */
function ground(ctx: Ctx, v: View, site: SiteExport, p: Palette, w: number, h: number, shape: [number, number][]) {
  ctx.fillStyle = p.paper; ctx.fillRect(0, 0, w, h);
  existingWater(ctx, v, site, shape);
  footprints(ctx, v, site);
  context(ctx, v, site.context, p, { boundary: false });
}

/** The ground drawn once per site, size and palette and copied under each plan: on a site with
 *  many existing buildings (Bengaluru) drawing their footprints was half of every plan, and
 *  Explore draws a dozen plans at once. */
const grounds = new WeakMap<SiteExport, Map<string, HTMLCanvasElement>>();

function groundUnder(site: SiteExport, p: Palette, canvas: HTMLCanvasElement, v: View, w: number, h: number,
  shape: [number, number][]): HTMLCanvasElement {
  const key = `${canvas.width}x${canvas.height}|${w}x${h}|${p.paper}|${p.ink}`;
  let seen = grounds.get(site);
  if (!seen) grounds.set(site, (seen = new Map()));
  let under = seen.get(key);
  if (!under) {
    under = document.createElement("canvas");
    under.width = canvas.width; under.height = canvas.height;
    const uctx = under.getContext("2d")!;
    uctx.setTransform(canvas.width / w, 0, 0, canvas.width / w, 0, 0);
    ground(uctx, v, site, p, w, h, shape);
    seen.set(key, under);
    if (seen.size > 12) seen.delete(seen.keys().next().value!);
  }
  return under;
}

/** A design in plan, framed to the design ground: the ground, the design dissolved into
 *  shapes, its streets, then the boundary (and the attractors, when asked). */
export function plan(canvas: HTMLCanvasElement, site: SiteExport, d: Design, p: Palette,
  { aspect, attractors: showAttractors = false, labels = false, locked = null, roads = null }: PlanOptions = {}): View {
  const D = site.design, { corners: shape } = shapeOf(site);
  const { ctx, w, h } = fitCanvas(canvas, aspect);
  const v = view(D.x, D.y, w, h, 4, marginOf(site));
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(groundUnder(site, p, canvas, v, w, h, shape), 0, 0); ctx.restore();
  if (d.plan) vectorPlan(ctx, v, d);
  else { fillRegions(ctx, v, D.x, D.y, designColours(d), shape, DESIGN_STYLES); streets(ctx, v, roads, p); }
  groundBuildings(ctx, v, site, "kept", p);
  if (locked) dots(ctx, v, D.x, D.y, (i) => !!locked[i], p.ink, 1.4);
  context(ctx, v, site.context, p, { labels, roads: false });
  if (showAttractors) attractors(ctx, v, d);
  return v;
}

/** Many small plans of one size (galleries, the archive), each over the same drawn ground. */
export function plans(canvases: HTMLCanvasElement[], site: SiteExport, designs: Design[], p: Palette, aspect: number,
  roads: (StreetLines | null)[] = []) {
  if (!canvases.length) return;
  const D = site.design, { corners: shape } = shapeOf(site);
  const first = fitCanvas(canvases[0], aspect), { w, h } = first;
  const v = view(D.x, D.y, w, h, 4, marginOf(site));
  const under = groundUnder(site, p, canvases[0], v, w, h, shape);
  canvases.forEach((canvas, k) => {
    const { ctx } = k ? fitCanvas(canvas, aspect) : first;
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(under, 0, 0); ctx.restore();
    if (designs[k].plan) vectorPlan(ctx, v, designs[k]);
    else { fillRegions(ctx, v, D.x, D.y, designColours(designs[k]), shape, DESIGN_STYLES); streets(ctx, v, roads[k], p); }
    groundBuildings(ctx, v, site, "kept", p);
    context(ctx, v, site.context, p, { roads: false });
  });
}

/** Any per-cell grid layer, framed to the design ground: values → colours with `colourOf`,
 *  dissolved; `styles` hatches or edges some colours. */
export function layer(canvas: HTMLCanvasElement, site: SiteExport, colourOf: (i: number) => Colour, p: Palette,
  { aspect, labels = false, styles = {} as Record<string, FillStyle>, buildings = true }:
  { aspect?: number; labels?: boolean; styles?: Record<string, FillStyle>; buildings?: boolean } = {}): View {
  const g = site.grid, D = site.design, { corners: shape } = shapeOf(site);
  const { ctx, w, h } = fitCanvas(canvas, aspect);
  const v = view(D.x, D.y, w, h, 4, marginOf(site));
  ctx.fillStyle = p.paper; ctx.fillRect(0, 0, w, h);
  fillRegions(ctx, v, g.x, g.y, g.x.map((_, i) => colourOf(i)), shape, styles);
  if (buildings) footprints(ctx, v, site);
  context(ctx, v, site.context, p, { labels });
  return v;
}

/** Which grid cell is under a canvas point (for hover): the nearest centre, within one
 *  cell radius. On both grids the nearest centre is the cell the point is in. */
export function cellAt(v: View, xs: ArrayLike<number>, ys: ArrayLike<number>, mx: number, my: number, radius: number): number {
  let best = -1, bd = (radius * v.s) ** 2;
  for (let i = 0; i < xs.length; i++) {
    const dx = v.px(xs[i]) - mx, dy = v.py(ys[i]) - my, dd = dx * dx + dy * dy;
    if (dd < bd) { bd = dd; best = i; }
  }
  return best;
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
  const L = 8, R = 52, Tp = 10, B = 16;
  const X = (i: number) => L + (i / Math.max(values.length - 1, 1)) * (w - L - R);
  const Y = (v: number) => Tp + (1 - (v - lo) / (hi - lo)) * (h - Tp - B);
  ctx.strokeStyle = p.line; ctx.lineWidth = 1;
  [0, 0.5, 1].forEach((f) => { ctx.beginPath(); ctx.moveTo(L, Tp + f * (h - Tp - B)); ctx.lineTo(w - R, Tp + f * (h - Tp - B)); ctx.stroke(); });
  if (marker !== null) {
    ctx.setLineDash([3, 3]); ctx.strokeStyle = p.ink2;
    ctx.beginPath(); ctx.moveTo(X(marker), Tp); ctx.lineTo(X(marker), h - B); ctx.stroke(); ctx.setLineDash([]);
  }
  ctx.strokeStyle = colour || p.ink; ctx.lineWidth = 1.6; ctx.lineJoin = "round";
  ctx.beginPath(); pts.forEach(([i, v], k) => (k ? ctx.lineTo(X(i), Y(v)) : ctx.moveTo(X(i), Y(v)))); ctx.stroke();
  const [li, lv] = pts[pts.length - 1];
  ctx.fillStyle = p.ink; ctx.font = `12px ${T.font.text}`; ctx.textAlign = "left";
  ctx.fillText(format(lv), X(li) + 6, Y(lv) + 4);
  ctx.fillStyle = p.muted; ctx.font = `10px ${T.font.text}`;
  ctx.fillText("gen 0", L, h - 3); ctx.textAlign = "right"; ctx.fillText(`gen ${values.length - 1}`, w - R, h - 3);
}

/** Low to high for space syntax maps: the measure ramp (pale to deep violet), which shares no
 *  hue with water, green or buildings. */
export const SYNTAX_RAMP = T.measure;

/** A design's streets coloured by a space syntax measure (values per site segment; null: none
 *  yet), over the design faintly, with the buffer's streets in grey, the integration core
 *  underlined in ink and landmarks as triangles. Colours run from the 5th to the 95th
 *  percentile, so a few extreme segments don't wash out the rest. */
export function syntaxMap(canvas: HTMLCanvasElement, site: SiteExport, d: Design, p: Palette,
  o: { aspect: number; site: Float64Array; buffer: Float64Array; values: ArrayLike<number> | null; core: number[]; landmarks: number[] }): View {
  const D = site.design, { corners: shape } = shapeOf(site);
  const { ctx, w, h } = fitCanvas(canvas, o.aspect);
  const v = view(D.x, D.y, w, h, 4, marginOf(site));
  ctx.fillStyle = p.paper; ctx.fillRect(0, 0, w, h);
  ctx.save(); ctx.globalAlpha = 0.25;
  fillRegions(ctx, v, D.x, D.y, designColours(d), shape);
  ctx.restore();
  const seg = (a: Float64Array, s: number) => {
    ctx.beginPath();
    ctx.moveTo(v.px(a[4 * s]), v.py(a[4 * s + 1])); ctx.lineTo(v.px(a[4 * s + 2]), v.py(a[4 * s + 3]));
    ctx.stroke();
  };
  ctx.lineCap = "round";
  ctx.strokeStyle = T.existing.road; ctx.lineWidth = 0.6;
  for (let s = 0; s < o.buffer.length / 4; s++) seg(o.buffer, s);
  ctx.strokeStyle = p.ink; ctx.lineWidth = 5;
  for (const s of o.core) seg(o.site, s);
  const n = o.site.length / 4, vals = o.values;
  const fin: number[] = [];
  if (vals) for (let s = 0; s < n; s++) if (Number.isFinite(vals[s])) fin.push(vals[s]);
  fin.sort((a, b) => a - b);
  const lo = fin.length ? fin[Math.floor(fin.length * 0.05)] : 0, hi = fin.length ? fin[Math.min(fin.length - 1, Math.floor(fin.length * 0.95))] : 1;
  const order = [...Array(n).keys()].sort((a, b) => (vals ? (vals[a] || 0) - (vals[b] || 0) : 0));
  ctx.lineWidth = 2.2;
  for (const s of order) {
    ctx.strokeStyle = vals && Number.isFinite(vals[s]) ? ramp(SYNTAX_RAMP, hi > lo ? (vals[s] - lo) / (hi - lo) : 0.5) : p.ink2;
    seg(o.site, s);
  }
  ctx.fillStyle = p.ink;
  for (const i of o.landmarks) {
    const x = v.px(D.x[i]), y = v.py(D.y[i]);
    ctx.beginPath(); ctx.moveTo(x, y - 6); ctx.lineTo(x + 5, y + 4); ctx.lineTo(x - 5, y + 4); ctx.closePath(); ctx.fill();
  }
  return v;
}
