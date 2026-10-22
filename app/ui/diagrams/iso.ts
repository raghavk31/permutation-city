// Isometric diagrams: simple pictures that explain one idea each (design system, "Diagrams").
// Every diagram uses the same 30° projection, one light (from the upper left of the page), and
// the map's colour tokens through their CSS properties, so it follows the theme and a colour
// means what it means on the map. They are SVG strings, used as they are by the workbench (step
// intros, empty states, term tooltips), the story page and docs/ui/system.html.
//
// Rules for a diagram: one idea; at most five labelled things; a plain one-sentence caption;
// no numbers unless the number is the point.

type P3 = [number, number, number];
type P2 = [number, number];

const COS = Math.cos(Math.PI / 6), SIN = 0.5;
/** Page pixels per world unit. Diagrams are drawn at this one scale and never enlarged, so
 *  labels are the same size in every diagram. */
const SCALE = 1.5;
/** World (x right-down, y left-down, z up) to the page. */
export const iso = ([x, y, z]: P3): P2 => [(x - y) * COS * SCALE, ((x + y) * SIN - z) * SCALE];

/** The light: from the upper left of the page and above, so the left faces of a box are lit
 *  and the right faces are in shade. Shadows fall the other way, `AWAY` per unit of height. */
const LIGHT = (() => { const v: P3 = [-0.55, 0.25, 1]; const n = Math.hypot(...v); return v.map((c) => c / n) as P3; })();
const AWAY: P2 = [0.5, -0.2];
const FLOOR = 3.2; // one storey, in diagram units

const darker = (c: string, k: number) => `color-mix(in srgb, ${c} ${Math.round(100 - k * 100)}%, var(--pc-ink))`;
const lighter = (c: string, k: number) => `color-mix(in srgb, ${c} ${Math.round(100 - k * 100)}%, var(--pc-surface))`;
const f = (n: number) => +n.toFixed(1);
const pts = (q: P2[]) => q.map(([a, b]) => `${f(a)},${f(b)}`).join(" ");
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

const EDGE = 'stroke="var(--pc-ink)" stroke-opacity=".22" stroke-width=".6" stroke-linejoin="round"';
const SHADOW = "color-mix(in srgb, var(--pc-ink) 13%, transparent)";

export interface Box { kind?: "box"; x: number; y: number; z: number; w: number; d: number; h: number; fill: string; floors?: boolean }
export interface Tree { kind: "tree"; x: number; y: number; z: number; s: number; fill?: string }
type Thing = Box | Tree;
type Clip = { x0: number; y0: number; x1: number; y1: number };
const depthOf = (t: Thing) => (t.kind === "tree" ? t.x + t.y + t.s : t.x + t.w + t.y + t.d);

/** A scene drawn in the order things are added; `things` sorts boxes and trees back to front. */
export class Scene {
  private out: string[] = [];
  private b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  private defs = new Set<string>();
  constructor(private id: string) {}

  private grow(q: P2[]) {
    for (const [a, c] of q) { this.b.x0 = Math.min(this.b.x0, a); this.b.x1 = Math.max(this.b.x1, a); this.b.y0 = Math.min(this.b.y0, c); this.b.y1 = Math.max(this.b.y1, c); }
  }

  /** A pattern fill: "forbidden" (red hatch) or "constrained" (thin grey hatch). */
  pattern(kind: "forbidden" | "constrained"): string {
    const pid = `${this.id}-${kind}`;
    this.defs.add(kind === "forbidden"
      ? `<pattern id="${pid}" width="4.5" height="4.5" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)"><rect width="4.5" height="4.5" style="fill: color-mix(in srgb, var(--pc-forbidden) 10%, var(--pc-surface))"/><line x1="0" y1="0" x2="0" y2="4.5" style="stroke: var(--pc-forbidden)" stroke-width="1.2"/></pattern>`
      : `<pattern id="${pid}" width="5.5" height="5.5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="5.5" height="5.5" style="fill: var(--pc-surface)"/><line x1="0" y1="0" x2="0" y2="5.5" style="stroke: var(--pc-constrained)" stroke-width=".7"/></pattern>`);
    return `url(#${pid})`;
  }

  /** A flat or sloping polygon. `edge`: true for the usual hairline, a colour to seal seams. */
  poly(p: P3[], fill: string, edge: boolean | string = true): this {
    const q = p.map(iso); this.grow(q);
    const e = edge === true ? EDGE : edge ? `style="fill: ${fill}; stroke: ${edge}" stroke-width=".5" stroke-linejoin="round"` : "";
    this.out.push(typeof edge === "string" ? `<polygon points="${pts(q)}" ${e}/>` : `<polygon points="${pts(q)}" style="fill: ${fill}" ${e}/>`);
    return this;
  }

  /** A slab: a thin box for a plot of ground. */
  slab(x: number, y: number, z: number, w: number, d: number, t: number, fill = "var(--pc-surface)"): this {
    return this.box({ x, y, z, w, d, h: t, fill });
  }

  /** A box: its top and the two faces toward the viewer, lit from the upper left; with
   *  `floors`, a line at each storey. */
  box(k: Box): this {
    const { x, y, z, w, d, h, fill } = k;
    const top: P3[] = [[x, y, z + h], [x + w, y, z + h], [x + w, y + d, z + h], [x, y + d, z + h]];
    const right: P3[] = [[x + w, y, z], [x + w, y + d, z], [x + w, y + d, z + h], [x + w, y, z + h]];
    const left: P3[] = [[x, y + d, z], [x + w, y + d, z], [x + w, y + d, z + h], [x, y + d, z + h]];
    if (h > 0) {
      this.poly(right, darker(fill, 0.24)); this.poly(left, darker(fill, 0.1));
      if (k.floors && h > FLOOR * 1.5) {
        let g = "";
        for (let zz = z + FLOOR; zz < z + h - 0.8; zz += FLOOR) {
          const a = iso([x, y + d, zz]), b = iso([x + w, y + d, zz]), c = iso([x + w, y, zz]);
          g += `<polyline points="${pts([a, b, c])}" fill="none" style="stroke: var(--pc-ink)" stroke-opacity=".13" stroke-width=".55"/>`;
        }
        this.out.push(g);
      }
    }
    return this.poly(top, h > 0 ? lighter(fill, 0.08) : fill);
  }

  /** A tree: a trunk and a round canopy, with a highlight toward the light. */
  tree(t: Tree): this {
    const fill = t.fill ?? "var(--pc-green)", base = iso([t.x, t.y, t.z]), top = iso([t.x, t.y, t.z + t.s * 1.5]), r = t.s * SCALE;
    this.grow([[top[0] - r, top[1] - r], [top[0] + r, base[1] + 1]]);
    this.out.push(
      `<line x1="${f(base[0])}" y1="${f(base[1])}" x2="${f(top[0])}" y2="${f(top[1])}" style="stroke: ${darker("var(--pc-building-4)", 0.1)}" stroke-width="${f(Math.max(.8, r * .22))}" stroke-linecap="round"/>`
      + `<circle cx="${f(top[0])}" cy="${f(top[1])}" r="${f(r)}" style="fill: ${fill}" stroke="var(--pc-ink)" stroke-opacity=".2" stroke-width=".5"/>`
      + `<circle cx="${f(top[0] - r * .32)}" cy="${f(top[1] - r * .32)}" r="${f(r * .45)}" style="fill: ${lighter(fill, 0.35)}"/>`);
    return this;
  }

  /** Soft shadows on the ground for boxes and trees: each footprint swept away from the light. */
  shadows(list: Thing[], clip?: Clip): this {
    for (const t of list) {
      const L = t.kind === "tree" ? t.s * 2.2 : t.h, z = t.z + 0.05;
      const foot: P2[] = t.kind === "tree"
        ? Array.from({ length: 8 }, (_, i): P2 => [t.x + t.s * .7 * Math.cos(i * Math.PI / 4), t.y + t.s * .7 * Math.sin(i * Math.PI / 4)])
        : [[t.x, t.y], [t.x + t.w, t.y], [t.x + t.w, t.y + t.d], [t.x, t.y + t.d]];
      let all = [...foot, ...foot.map(([a, c]): P2 => [a + AWAY[0] * L, c + AWAY[1] * L])];
      if (clip) all = all.map(([a, c]): P2 => [Math.min(clip.x1, Math.max(clip.x0, a)), Math.min(clip.y1, Math.max(clip.y0, c))]);
      this.poly(hull(all).map(([a, c]): P3 => [a, c, z]), SHADOW, false);
    }
    return this;
  }

  /** Boxes and trees back to front, so nearer ones hide farther ones, with their shadows
   *  first (clipped to the ground they stand on, when given). */
  things(list: Thing[], clip?: Clip): this {
    this.shadows(list, clip);
    for (const t of [...list].sort((a, c) => depthOf(a) - depthOf(c) || a.z - c.z)) {
      if (t.kind === "tree") this.tree(t); else this.box(t);
    }
    return this;
  }

  /** A heightfield as shaded quads, back to front: `colour(z)` sets the band; quads under
   *  `water` are drawn flat at the water level. */
  terrain(nx: number, ny: number, cell: number, h: (i: number, j: number) => number, colour: (z: number) => string, water?: { level: number; fill: string }): this {
    const at = (i: number, j: number): P3 => [i * cell, j * cell, h(i, j)];
    const order: [number, number][] = [];
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) order.push([i, j]);
    order.sort((a, c) => a[0] + a[1] - c[0] - c[1]);
    for (const [i, j] of order) {
      const q = [at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)];
      const zMean = q.reduce((s, p) => s + p[2], 0) / 4;
      if (water && zMean < water.level) {
        this.poly(q.map(([x, y]): P3 => [x, y, water.level]), water.fill, water.fill);
        continue;
      }
      const dzx = ((q[1][2] + q[2][2]) - (q[0][2] + q[3][2])) / (2 * cell), dzy = ((q[3][2] + q[2][2]) - (q[0][2] + q[1][2])) / (2 * cell);
      const n = [-dzx, -dzy, 1], lam = (n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]) / Math.hypot(...n);
      const k = (lam - LIGHT[2]) * 1.6, c = colour(zMean), fill = k >= 0 ? lighter(c, Math.min(.45, k)) : darker(c, Math.min(.4, -k));
      this.poly(q, fill, fill);
    }
    // the near edges as skirts, so the ground reads as a solid
    const lo = -3;
    for (let i = 0; i < nx; i++) this.poly([at(i, ny), at(i + 1, ny), [(i + 1) * cell, ny * cell, lo], [i * cell, ny * cell, lo]], darker(colour(h(i, ny)), 0.12), darker(colour(h(i, ny)), 0.12));
    for (let j = 0; j < ny; j++) this.poly([at(nx, j), at(nx, j + 1), [nx * cell, (j + 1) * cell, lo], [nx * cell, j * cell, lo]], darker(colour(h(nx, j)), 0.26), darker(colour(h(nx, j)), 0.26));
    return this;
  }

  /** A line through world points. */
  line(p: P3[], stroke: string, width: number, opts: { dash?: string; cap?: "round" | "butt"; opacity?: number } = {}): this {
    const q = p.map(iso); this.grow(q);
    this.out.push(`<polyline points="${pts(q)}" fill="none" style="stroke: ${stroke}" stroke-width="${width}" stroke-linecap="${opts.cap ?? "round"}" stroke-linejoin="round"${opts.dash ? ` stroke-dasharray="${opts.dash}"` : ""}${opts.opacity != null ? ` stroke-opacity="${opts.opacity}"` : ""}/>`);
    return this;
  }

  /** A street on the ground: a pale band with a fine kerb either side. */
  street(p: P3[], width: number): this {
    this.line(p, "var(--pc-ink)", width + 1, { cap: "butt", opacity: .16 });
    return this.line(p, "var(--pc-street)", width, { cap: "butt" });
  }

  /** An arrow on the page between two world points. */
  arrow(a: P3, c: P3, color = "var(--pc-ink-2)"): this {
    const [p, q] = [iso(a), iso(c)]; this.grow([p, q]);
    const ang = Math.atan2(q[1] - p[1], q[0] - p[0]), h = 6;
    const l: P2 = [q[0] - h * Math.cos(ang - 0.45), q[1] - h * Math.sin(ang - 0.45)], r: P2 = [q[0] - h * Math.cos(ang + 0.45), q[1] - h * Math.sin(ang + 0.45)];
    this.out.push(`<line x1="${f(p[0])}" y1="${f(p[1])}" x2="${f(q[0] - 3 * Math.cos(ang))}" y2="${f(q[1] - 3 * Math.sin(ang))}" style="stroke: ${color}" stroke-width="1.25"/><polygon points="${pts([q, l, r])}" style="fill: ${color}"/>`);
    return this;
  }

  /** A label on a soft halo, with a leader line from the world point when `dx`/`dy` move it. */
  label(at: P3, text: string, opts: { dx?: number; dy?: number; anchor?: "start" | "middle" | "end"; strong?: boolean } = {}): this {
    const [x, y] = iso(at), dx = opts.dx ?? 0, dy = opts.dy ?? 0, anchor = opts.anchor ?? "start";
    const tx = x + dx, ty = y + dy, w = text.length * 5.9;
    const x0 = anchor === "start" ? tx : anchor === "end" ? tx - w : tx - w / 2;
    this.grow([[x0 - 2, ty - 11], [x0 + w + 2, ty + 4]]);
    if (dx || dy) this.out.push(`<line x1="${f(x)}" y1="${f(y)}" x2="${f(tx - (anchor === "end" ? -3 : anchor === "start" ? 3 : 0))}" y2="${f(ty - 4)}" style="stroke: var(--pc-ink-2)" stroke-opacity=".6" stroke-width=".75"/><circle cx="${f(x)}" cy="${f(y)}" r="1.8" style="fill: var(--pc-ink)" stroke="var(--pc-surface)" stroke-width="1"/>`);
    this.out.push(`<text x="${f(tx)}" y="${f(ty)}" text-anchor="${anchor}" paint-order="stroke" stroke-linejoin="round" style="fill: var(--pc-${opts.strong ? "ink" : "ink-2"}); stroke: var(--pc-surface-2); stroke-width: 3px; font: ${opts.strong ? 500 : 400} 11px var(--pc-font)">${esc(text)}</text>`);
    return this;
  }

  /** Raw SVG placed on the page at (x, y), taking up w × h. */
  raw(x: number, y: number, w: number, h: number, svg: string): this {
    this.grow([[x, y], [x + w, y + h]]);
    this.out.push(`<g transform="translate(${f(x)} ${f(y)})">${svg}</g>`);
    return this;
  }

  svg(title: string): string {
    const p = 8, { x0, y0, x1, y1 } = this.b, w = x1 - x0 + 2 * p, h = y1 - y0 + 2 * p;
    return `<svg viewBox="${f(x0 - p)} ${f(y0 - p)} ${f(w)} ${f(h)}" width="${Math.round(w)}" height="${Math.round(h)}" role="img" aria-label="${esc(title)}" class="wb-diagram"><defs>${[...this.defs].join("")}</defs>${this.out.join("")}</svg>`;
  }
}

// A seeded random, so a diagram is the same every time it is drawn.
const rng = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const B = (i: number) => `var(--pc-building-${Math.max(0, Math.min(5, i))})`;
/** Building colour by height, as on the map: the ramp runs to 15 storeys. */
const byHeight = (h: number) => B(Math.floor((h / FLOOR) / 15 * 6));
const sun = (s: Scene, at: P3) => {
  const [x, y] = iso(at);
  return s.raw(x - 10, y - 10, 20, 20, `<circle cx="10" cy="10" r="5" style="fill: var(--pc-heat-5)"/>${Array.from({ length: 8 }, (_, i) => { const a = i * Math.PI / 4; return `<line x1="${f(10 + 7.5 * Math.cos(a))}" y1="${f(10 + 7.5 * Math.sin(a))}" x2="${f(10 + 10 * Math.cos(a))}" y2="${f(10 + 10 * Math.sin(a))}" style="stroke: var(--pc-heat-5)" stroke-width="1.3" stroke-linecap="round"/>`; }).join("")}`);
};

export interface Diagram { id: string; title: string; caption: string; svg: string }

/** McHarg's layer cake: maps of the site stacked, read together. */
export function layers(): Diagram {
  const s = new Scene("layers"), W = 100, D = 70, T = 2.5, GAP = 30, r = rng(3);
  // registration lines at the corners, behind everything
  for (const [x, y] of [[0, D], [W, D], [W, 0]] as P2[]) s.line([[x, y, 0], [x, y, 3 * GAP + T]], "var(--pc-ink-2)", .6, { dash: "2 3", opacity: .5 });
  // 0: ground height, a gentle hill
  const hill = (i: number, j: number) => 9 * Math.exp(-(((i - 3) ** 2) / 6 + ((j - 2) ** 2) / 5));
  s.terrain(10, 7, 10, hill, (z) => `var(--pc-elevation-${Math.min(4, 1 + Math.floor(z / 2.6))})`);
  // 1: water
  let z = GAP; s.slab(0, 0, z, W, D, T);
  s.poly([[50, 0, z + T], [66, 0, z + T], [60, D, z + T], [40, D, z + T]], "var(--pc-water-flood)", false);
  s.poly([[56, 0, z + T], [63, 0, z + T], [56, D, z + T], [48, D, z + T]], "var(--pc-water)", false);
  // 2: green
  z = 2 * GAP; s.slab(0, 0, z, W, D, T);
  s.poly([[0, 0, z + T], [34, 0, z + T], [26, 30, z + T], [0, 38, z + T]], "var(--pc-green-light)", false);
  const trees: Thing[] = [];
  for (let k = 0; k < 9; k++) trees.push({ kind: "tree", x: 4 + r() * 22, y: 3 + r() * 26, z: z + T, s: 2.6 + r() * 1.2 });
  for (let k = 0; k < 4; k++) trees.push({ kind: "tree", x: 76 + r() * 16, y: 44 + r() * 18, z: z + T, s: 2.4 + r(), fill: "var(--pc-green-proposed)" });
  s.things(trees);
  // 3: the city today
  z = 3 * GAP; s.slab(0, 0, z, W, D, T);
  const bx: Thing[] = [];
  for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) if (r() > .3) bx.push({ x: 4 + i * 15, y: 4 + j * 16, z: z + T, w: 10, d: 11, h: 3 + r() * 7, fill: "var(--pc-existing)" });
  s.things(bx, { x0: 0, y0: 0, x1: W, y1: D });
  ["ground height", "water and floods", "trees and green", "the city today"].forEach((t, k) => s.label([W, D, k * GAP + T], t, { dx: 30, dy: 2 }));
  return { id: "layers", title: "Layers", caption: "Each map of the site is a layer. Stacked, they show what the land is like in every spot at once.", svg: s.svg("Four maps of a site stacked like a cake: ground height, water, green, existing buildings.") };
}

/** The rules map: never built, built with limits, free to design. */
export function rules(): Diagram {
  const s = new Scene("rules"), W = 120, D = 80, T = 3, r = rng(9);
  s.slab(0, 0, 0, W, D, T);
  s.poly([[0, 0, T], [36, 0, T], [28, 34, T], [0, 42, T]], s.pattern("forbidden"));
  s.poly([[36, 0, T], [56, 0, T], [50, D, T], [30, D, T], [28, 34, T]], s.pattern("constrained"));
  const th: Thing[] = [];
  for (let k = 0; k < 6; k++) th.push({ kind: "tree", x: 4 + r() * 20, y: 4 + r() * 24, z: T, s: 2.6 + r() });
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) if (r() > .2) { const h = 8 + r() * 22; th.push({ x: 60 + i * 15, y: 4 + j * 19, z: T, w: 11, d: 14, h, fill: byHeight(h), floors: true }); }
  for (let j = 0; j < 3; j++) th.push({ x: 37, y: 42 + j * 12.5, z: T, w: 8, d: 9, h: 6.4, fill: byHeight(6.4), floors: true });
  s.things(th, { x0: 0, y0: 0, x1: W, y1: D });
  s.label([8, 34, T], "never built", { dx: -22, dy: 8, anchor: "end", strong: true });
  s.label([44, 6, T], "built with limits", { dx: -14, dy: -32, anchor: "end", strong: true });
  s.label([W, 8, T + 26], "free to design", { dx: 14, dy: -8, strong: true });
  return { id: "rules", title: "Rules", caption: "Rules sort the ground: some is never built on, some is built with limits, and the rest is free for designs to use.", svg: s.svg("A site in three parts: a red-hatched wooded hill never built, a grey-hatched strip with low buildings, and the rest with taller buildings.") };
}

/** Landform: valleys carry water, ridges carry streets. */
export function landform(): Diagram {
  const s = new Scene("landform"), nx = 22, ny = 14, c = 5;
  const h = (i: number, j: number) => {
    const x = i / nx, y = j / ny;
    const hills = 24 * Math.exp(-(((x - .2) ** 2) / .03 + ((y - .45) ** 2) / .2)) + 20 * Math.exp(-(((x - .82) ** 2) / .025 + ((y - .5) ** 2) / .25));
    return 2 + hills + 2.5 * Math.sin(y * 5) * (1 - Math.abs(x - .5) * 2) - 3 * Math.exp(-((x - .52) ** 2) / .004);
  };
  s.terrain(nx, ny, c, h, (z) => `var(--pc-elevation-${Math.min(4, Math.floor(z / 6))})`, { level: 1.6, fill: "var(--pc-water-flood)" });
  // the valley's stream
  s.line(Array.from({ length: ny + 1 }, (_, j): P3 => [nx * c * .52, j * c, 1.7]), "var(--pc-water)", 2.4);
  // ridge streets along the two crests
  const crest = (x0: number) => Array.from({ length: ny + 1 }, (_, j): P3 => { let bi = x0, bz = -1; for (let i = x0 - 3; i <= x0 + 3; i++) if (h(i, j) > bz) { bz = h(i, j); bi = i; } return [bi * c, j * c, bz + .4]; });
  for (const x0 of [Math.round(nx * .2), Math.round(nx * .82)]) { const p = crest(x0); s.line(p, "var(--pc-ink)", 3.4, { opacity: .25 }); s.line(p, "var(--pc-street)", 2.2); }
  s.label([nx * c * .52, ny * c, 1.7], "valley: water runs here, kept open", { dx: 0, dy: 28, anchor: "middle", strong: true });
  s.label([Math.round(nx * .82) * c, 1 * c, h(Math.round(nx * .82), 1) + .4], "ridge: a main street", { dx: 22, dy: -16, strong: true });
  return { id: "landform", title: "Landform", caption: "Water gathers in the valleys, so they stay open; the ridges between them are where the main streets go.", svg: s.svg("Shaded ground with two hills, a street along each crest, and a stream in the valley between.") };
}

/** Street hierarchy: main streets, routes, local streets, and the blocks between. */
export function streets(): Diagram {
  const s = new Scene("streets"), W = 130, D = 92, T = 3, r = rng(21);
  s.slab(0, 0, 0, W, D, T);
  const MAIN = 42, ROUTE = 66, LOCAL = [30, 100];
  s.street([[0, MAIN, T + .1], [W, MAIN, T + .1]], 9);
  s.street([[ROUTE, 0, T + .1], [ROUTE, D, T + .1]], 6);
  for (const x of LOCAL) s.street([[x, 0, T + .1], [x, D, T + .1]], 3.4);
  const th: Thing[] = [];
  const xs = [0, LOCAL[0], ROUTE, LOCAL[1], W], ys = [0, MAIN, D];
  for (let i = 0; i < xs.length - 1; i++) for (let j = 0; j < ys.length - 1; j++) {
    const x0 = xs[i] + 5.5, x1 = xs[i + 1] - 5.5, y0 = ys[j] + 6.5, y1 = ys[j + 1] - 6.5, k = 2;
    for (let p = 0; p < k; p++) for (const half of [0, 1]) {
      const pw = (x1 - x0) / k, pd = (y1 - y0) / 2, hh = 5 + r() * 11;
      th.push({ x: x0 + p * pw + 1.5, y: (half ? y0 + pd : y0) + 1.5, z: T, w: pw - 3, d: pd - 3, h: hh, fill: byHeight(hh), floors: true });
    }
  }
  for (let x = 5; x < W; x += 10) if (Math.abs(x - ROUTE) > 5 && LOCAL.every((l) => Math.abs(x - l) > 4)) {
    th.push({ kind: "tree", x, y: MAIN - 5, z: T, s: 2 }, { kind: "tree", x: x + 2, y: MAIN + 5, z: T, s: 2 });
  }
  s.things(th, { x0: 0, y0: 0, x1: W, y1: D });
  s.label([0, MAIN, T], "main street", { dx: -10, dy: -18, anchor: "end", strong: true });
  s.label([ROUTE, 0, T], "route", { dx: 12, dy: -22, strong: true });
  s.label([LOCAL[1], D, T], "local street", { dx: -6, dy: 22, anchor: "end", strong: true });
  return { id: "streets", title: "Streets", caption: "Wide main streets carry the city across, routes link the places people go, and narrow local streets make the blocks.", svg: s.svg("Blocks of buildings cut by one wide tree-lined street, one medium street and two narrow ones.") };
}

/** A design's recipe: a few settings, read as a plan. */
export function recipe(): Diagram {
  const s = new Scene("recipe"), r = rng(5);
  const bars = [["street spacing", .35], ["block pattern", .7], ["height", .55], ["green", .3], ["water", .6]] as const;
  let g = "";
  bars.forEach(([name, v], k) => {
    const y = k * 17;
    g += `<text x="0" y="${y + 9}" style="fill: var(--pc-ink-2); font: 11px var(--pc-font)">${name}</text>`;
    g += `<rect x="86" y="${y + 3}" width="58" height="6" rx="3" style="fill: color-mix(in srgb, var(--pc-ink) 12%, var(--pc-surface))"/><rect x="86" y="${y + 3}" width="${f(58 * v)}" height="6" rx="3" style="fill: var(--pc-ink-2)"/><circle cx="${f(86 + 58 * v)}" cy="${y + 6}" r="4" style="fill: var(--pc-surface); stroke: var(--pc-ink-2)" stroke-width="1.5"/>`;
  });
  s.raw(-300, -70, 150, 86, g);
  s.raw(-128, -32, 34, 12, `<line x1="0" y1="6" x2="26" y2="6" style="stroke: var(--pc-ink-2)" stroke-width="1.25"/><polygon points="26,2 33,6 26,10" style="fill: var(--pc-ink-2)"/>`);
  const W = 72, D = 62, T = 3;
  s.slab(0, 0, 0, W, D, T);
  s.poly([[0, 40, T], [26, 40, T], [26, D, T], [0, D, T]], "var(--pc-green-light)", false);
  s.poly([[48, 44, T], [66, 44, T], [66, 57, T], [48, 57, T]], "var(--pc-water-storage)", "var(--pc-water)");
  const th: Thing[] = [];
  for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) { const h = 8 + r() * 16; th.push({ x: 3 + i * 17, y: 3 + j * 18, z: T, w: 13, d: 14, h, fill: byHeight(h), floors: true }); }
  for (let k = 0; k < 5; k++) th.push({ kind: "tree", x: 4 + r() * 18, y: 43 + r() * 15, z: T, s: 2.3 + r() * .8, fill: "var(--pc-green-proposed)" });
  s.things(th, { x0: 0, y0: 0, x1: W, y1: D });
  return { id: "recipe", title: "Recipe", caption: "Every design grows from a short recipe of settings. Change a setting and a different plan grows on the same ground.", svg: s.svg("Five setting sliders on the left, an arrow, and the small plan they produce on the right.") };
}

/** One small plan in a sequence, placed `o` along the page: `order` 0 is scattered, 1 is
 *  settled with a park. */
function smallPlan(s: Scene, o: number, order: number, seed: number) {
  const r = rng(seed), W = 40, D = 40, T = 2, x0 = o, y0 = -o, park = order > .5;
  s.slab(x0, y0, 0, W, D, T);
  if (park) s.poly([[x0 + 2, y0 + 26, T], [x0 + 18, y0 + 26, T], [x0 + 18, y0 + D - 2, T], [x0 + 2, y0 + D - 2, T]], "var(--pc-green-light)", false);
  const th: Thing[] = [];
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    if (park && i < 2 && j >= 3) continue;
    const jit = (1 - order) * 4, skip = r() < .3 * (1 - order), hh = 4 + r() * (6 + order * 12);
    if (skip) continue;
    th.push({ x: x0 + 2 + i * 9.5 + (r() - .5) * jit, y: y0 + 2 + j * 9.5 + (r() - .5) * jit, z: T, w: 6.5, d: 6.5, h: hh, fill: byHeight(hh), floors: true });
  }
  if (park) for (let k = 0; k < 3; k++) th.push({ kind: "tree", x: x0 + 5 + k * 5, y: y0 + 31 + (k % 2) * 4, z: T, s: 2, fill: "var(--pc-green-proposed)" });
  s.things(th, { x0, y0, x1: x0 + W, y1: y0 + D });
}

/** Evolution: generations of designs, the better ones breeding. */
export function evolution(): Diagram {
  const s = new Scene("evolution"), W = 40, D = 40, STEP = 62;
  smallPlan(s, 0, 0, 4); smallPlan(s, STEP, .5, 8); smallPlan(s, 2 * STEP, 1, 12);
  for (const k of [0, 1]) s.arrow([k * STEP + W + 8, -k * STEP + D / 2 - 14, 4], [(k + 1) * STEP - 2, -(k + 1) * STEP + D / 2 + 2, 4]);
  ["generation 0: random", "generation 5", "generation 15"].forEach((n, k) => s.label([k * STEP + W, -k * STEP + D, 0], n, { dy: 26, dx: -4, anchor: "middle", strong: k === 2 }));
  return { id: "evolution", title: "Evolution", caption: "Designs breed. The better ones become parents, so each generation tends to do a little better than the last.", svg: s.svg("Three small plans left to right: scattered, then tidier, then ordered with a park, joined by arrows.") };
}

/** The trade-off front (a flat chart: a picture where a chart is clearer). */
export function tradeoff(): Diagram {
  const r = rng(17), W = 230, H = 146, p = 24;
  const dots = Array.from({ length: 28 }, () => { const a = r(), b = r(); return { x: a, y: .1 + a * a * .6 + b * .3 }; });
  const front = dots.filter((d) => !dots.some((e) => e !== d && e.x >= d.x && e.y <= d.y && (e.x > d.x || e.y < d.y))).sort((a, b) => a.x - b.x);
  const X = (v: number) => p + v * (W - 2 * p), Y = (v: number) => H - p - (1 - v) * (H - 2 * p);
  // everything the front beats, lightly shaded
  const area: P2[] = [[X(0), Y(1)], ...front.flatMap((d, i): P2[] => [[X(d.x), Y(i ? front[i - 1].y : 1)], [X(d.x), Y(d.y)]]), [X(1), Y(front[front.length - 1].y)], [X(1), Y(1)]];
  let g = `<polygon points="${pts(area)}" style="fill: color-mix(in srgb, var(--pc-ink) 5%, transparent)"/>`;
  g += `<line x1="${p}" y1="${H - p}" x2="${W - p}" y2="${H - p}" style="stroke: var(--pc-line)"/><line x1="${p}" y1="${p}" x2="${p}" y2="${H - p}" style="stroke: var(--pc-line)"/>`;
  g += `<polyline points="${front.map((d) => `${f(X(d.x))},${f(Y(d.y))}`).join(" ")}" fill="none" style="stroke: var(--pc-ink)" stroke-width="1.2" stroke-dasharray="3 3"/>`;
  for (const d of dots) { const on = front.includes(d); g += `<circle cx="${f(X(d.x))}" cy="${f(Y(d.y))}" r="${on ? 3.8 : 2.8}" style="fill: var(--pc-${on ? "ink" : "muted"})" fill-opacity="${on ? 1 : .45}"${on ? ' stroke="var(--pc-surface-2)" stroke-width="1.2"' : ""}/>`; }
  g += `<text x="${W - p}" y="${H - 7}" text-anchor="end" style="fill: var(--pc-ink); font: 500 11px var(--pc-font)">more water stored →</text>`;
  g += `<text x="${p - 9}" y="${p}" text-anchor="end" transform="rotate(-90 ${p - 9} ${p})" style="fill: var(--pc-ink); font: 500 11px var(--pc-font)">← cooler</text>`;
  const lf = front[Math.floor(front.length / 2)];
  g += `<text x="${f(X(lf.x)) + 8}" y="${f(Y(lf.y)) + 22}" paint-order="stroke" style="fill: var(--pc-ink-2); stroke: var(--pc-surface-2); stroke-width: 3px; font: 11px var(--pc-font)">the front</text>`;
  const s = new Scene("tradeoff").raw(0, 0, W, H, g);
  return { id: "tradeoff", title: "Trade-offs", caption: "No design is best at everything. The front is the set of designs that no other design beats on both counts.", svg: s.svg("A scatter of designs, more water stored to the right and cooler to the bottom, with the best edge joined by a dashed line.") };
}

/** Massing: buildings on a block, with the sun's shadows. */
export function massing(): Diagram {
  const s = new Scene("massing"), W = 90, D = 64, T = 3;
  s.slab(0, 0, 0, W, D, T);
  s.poly([[34, 18, T], [70, 18, T], [70, 46, T], [34, 46, T]], "var(--pc-green-light)", false);
  const th: Thing[] = [
    { x: 6, y: 18, z: T, w: 20, d: 20, h: 38.4, fill: byHeight(38.4), floors: true },
    { x: 6, y: 44, z: T, w: 20, d: 14, h: 12.8, fill: byHeight(12.8), floors: true },
    { x: 34, y: 50, z: T, w: 48, d: 10, h: 9.6, fill: byHeight(9.6), floors: true },
    { x: 76, y: 6, z: T, w: 10, d: 40, h: 16, fill: byHeight(16), floors: true },
    { kind: "tree", x: 44, y: 38, z: T, s: 2.4, fill: "var(--pc-green-proposed)" }, { kind: "tree", x: 60, y: 30, z: T, s: 2.4, fill: "var(--pc-green-proposed)" },
  ];
  s.things(th, { x0: 0, y0: 0, x1: W, y1: D });
  sun(s, [-30, 40, 56]);
  s.label([16, 28, T + 38.4], "taller: more floors", { dx: -16, dy: -14, anchor: "end", strong: true });
  s.label([48, 22, T], "its shadow on the yard", { dx: 28, dy: -30, strong: true });
  return { id: "massing", title: "Massing", caption: "On one block, the buildings are given heights and shapes. The sun shows which streets and yards they shade.", svg: s.svg("A block with a tower, three lower buildings with a line per storey, and the tower's shadow across a green yard.") };
}

/** Growing in phases: what is built stays, each phase adds. */
export function growth(): Diagram {
  const s = new Scene("growth"), W = 40, D = 40, T = 2, STEP = 62, r = rng(31);
  const all: Box[] = [];
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { const h = 4 + r() * 12; all.push({ x: 2 + i * 9.5, y: 2 + j * 9.5, z: T, w: 6.5, d: 6.5, h, fill: byHeight(h), floors: true }); }
  const order = all.map((_, k) => k).sort(() => r() - .5);
  ["2025", "2035", "2050"].forEach((yr, p) => {
    const o = p * STEP, n = [5, 10, 16][p];
    s.slab(o, -o, 0, W, D, T);
    s.things(order.slice(0, n).map((k) => ({ ...all[k], x: all[k].x + o, y: all[k].y - o })), { x0: o, y0: -o, x1: o + W, y1: -o + D });
    s.label([o + W, -o + D, 0], yr, { dy: 26, dx: -4, anchor: "middle", strong: p === 2 });
  });
  for (const k of [0, 1]) s.arrow([k * STEP + W + 8, -k * STEP + D / 2 - 14, 4], [(k + 1) * STEP - 2, -(k + 1) * STEP + D / 2 + 2, 4]);
  return { id: "growth", title: "Growing in phases", caption: "The site is built in phases. What is built stays, and each phase adds to it under its own year's conditions.", svg: s.svg("The same block in 2025, 2035 and 2050, with more buildings each time and the earlier ones unchanged.") };
}

/** Every diagram, in the order the story tells them. */
export const DIAGRAMS = () => [layers(), rules(), landform(), streets(), recipe(), evolution(), tradeoff(), massing(), growth()];

function hull(p: P2[]): P2[] {
  const q = [...p].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: P2, a: P2, b: P2) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: P2[] = [], up: P2[] = [];
  for (const x of q) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], x) <= 0) lo.pop(); lo.push(x); }
  for (const x of [...q].reverse()) { while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], x) <= 0) up.pop(); up.push(x); }
  return [...lo.slice(0, -1), ...up.slice(0, -1)];
}
