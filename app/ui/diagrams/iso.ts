// Isometric diagrams: simple pictures that explain one idea each (design system, "Diagrams").
// Every diagram uses the same 30° projection and the map's colour tokens through their CSS
// properties, so it follows the theme and a colour means what it means on the map. They are
// SVG strings, used as they are by the workbench (step intros, empty states, term tooltips),
// the story page and docs/ui/system.html.
//
// Rules for a diagram: one idea; at most five labelled things; a plain one-sentence caption;
// no numbers unless the number is the point.

type P3 = [number, number, number];
type P2 = [number, number];

const COS = Math.cos(Math.PI / 6), SIN = 0.5;
/** World (x right-down, y left-down, z up) to the page. */
export const iso = ([x, y, z]: P3): P2 => [(x - y) * COS, (x + y) * SIN - z];

/** A colour darkened toward the ink, for the sides of a box. */
const shade = (c: string, k: number) => `color-mix(in srgb, ${c} ${Math.round(k * 100)}%, var(--pc-ink))`;
const f = (n: number) => +n.toFixed(1);
const pts = (q: P2[]) => q.map(([a, b]) => `${f(a)},${f(b)}`).join(" ");
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

const EDGE = 'stroke="var(--pc-ink)" stroke-opacity=".28" stroke-width=".75" stroke-linejoin="round"';

interface Box { x: number; y: number; z: number; w: number; d: number; h: number; fill: string }

/** A scene drawn in the order things are added; `boxes` sorts a set of boxes back to front. */
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
      ? `<pattern id="${pid}" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)"><rect width="5" height="5" style="fill: var(--pc-surface)"/><line x1="0" y1="0" x2="0" y2="5" style="stroke: var(--pc-forbidden)" stroke-width="1.4"/></pattern>`
      : `<pattern id="${pid}" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" style="stroke: var(--pc-constrained)" stroke-width=".8"/></pattern>`);
    return `url(#${pid})`;
  }

  /** A flat or sloping polygon. */
  poly(p: P3[], fill: string, edge = true): this {
    const q = p.map(iso); this.grow(q);
    this.out.push(`<polygon points="${pts(q)}" style="fill: ${fill}" ${edge ? EDGE : ""}/>`);
    return this;
  }

  /** A box: its top and the two faces toward the viewer. */
  box(x: number, y: number, z: number, w: number, d: number, h: number, fill: string): this {
    const top: P3[] = [[x, y, z + h], [x + w, y, z + h], [x + w, y + d, z + h], [x, y + d, z + h]];
    const right: P3[] = [[x + w, y, z], [x + w, y + d, z], [x + w, y + d, z + h], [x + w, y, z + h]];
    const left: P3[] = [[x, y + d, z], [x + w, y + d, z], [x + w, y + d, z + h], [x, y + d, z + h]];
    if (h > 0) { this.poly(right, shade(fill, 0.74)); this.poly(left, shade(fill, 0.86)); }
    return this.poly(top, fill);
  }

  /** Boxes back to front, so nearer ones hide farther ones. */
  boxes(list: Box[]): this {
    for (const k of [...list].sort((a, c) => (a.x + a.w + a.y + a.d) - (c.x + c.w + c.y + c.d) || a.z - c.z))
      this.box(k.x, k.y, k.z, k.w, k.d, k.h, k.fill);
    return this;
  }

  /** A line through world points. */
  line(p: P3[], stroke: string, width: number, opts: { dash?: string; cap?: "round" | "butt"; opacity?: number } = {}): this {
    const q = p.map(iso); this.grow(q);
    this.out.push(`<polyline points="${pts(q)}" fill="none" style="stroke: ${stroke}" stroke-width="${width}" stroke-linecap="${opts.cap ?? "round"}" stroke-linejoin="round"${opts.dash ? ` stroke-dasharray="${opts.dash}"` : ""}${opts.opacity != null ? ` stroke-opacity="${opts.opacity}"` : ""}/>`);
    return this;
  }

  /** An arrow on the page between two world points. */
  arrow(a: P3, c: P3, color = "var(--pc-ink-2)"): this {
    const [p, q] = [iso(a), iso(c)]; this.grow([p, q]);
    const ang = Math.atan2(q[1] - p[1], q[0] - p[0]), h = 6;
    const l: P2 = [q[0] - h * Math.cos(ang - 0.45), q[1] - h * Math.sin(ang - 0.45)], r: P2 = [q[0] - h * Math.cos(ang + 0.45), q[1] - h * Math.sin(ang + 0.45)];
    this.out.push(`<line x1="${f(p[0])}" y1="${f(p[1])}" x2="${f(q[0])}" y2="${f(q[1])}" style="stroke: ${color}" stroke-width="1.25"/><polygon points="${pts([q, l, r])}" style="fill: ${color}"/>`);
    return this;
  }

  /** A label, with a short leader line from the world point when `dx`/`dy` move it away. */
  label(at: P3, text: string, opts: { dx?: number; dy?: number; anchor?: "start" | "middle" | "end"; strong?: boolean } = {}): this {
    const [x, y] = iso(at), dx = opts.dx ?? 0, dy = opts.dy ?? 0, anchor = opts.anchor ?? "start";
    const tx = x + dx, ty = y + dy, w = text.length * 5.6;
    const x0 = anchor === "start" ? tx : anchor === "end" ? tx - w : tx - w / 2;
    this.grow([[x0, ty - 10], [x0 + w, ty + 3]]);
    if (dx || dy) this.out.push(`<line x1="${f(x)}" y1="${f(y)}" x2="${f(tx - (anchor === "end" ? -3 : anchor === "start" ? 3 : 0))}" y2="${f(ty - 4)}" style="stroke: var(--pc-muted)" stroke-width=".75"/><circle cx="${f(x)}" cy="${f(y)}" r="1.6" style="fill: var(--pc-ink-2)"/>`);
    this.out.push(`<text x="${f(tx)}" y="${f(ty)}" text-anchor="${anchor}" style="fill: var(--pc-${opts.strong ? "ink" : "ink-2"}); font: ${opts.strong ? 500 : 400} 10.5px var(--pc-font)">${esc(text)}</text>`);
    return this;
  }

  /** Raw SVG placed on the page at (x, y), taking up w × h. */
  raw(x: number, y: number, w: number, h: number, svg: string): this {
    this.grow([[x, y], [x + w, y + h]]);
    this.out.push(`<g transform="translate(${f(x)} ${f(y)})">${svg}</g>`);
    return this;
  }

  svg(title: string): string {
    const p = 6, { x0, y0, x1, y1 } = this.b, w = x1 - x0 + 2 * p, h = y1 - y0 + 2 * p;
    return `<svg viewBox="${f(x0 - p)} ${f(y0 - p)} ${f(w)} ${f(h)}" width="${Math.round(w)}" height="${Math.round(h)}" role="img" aria-label="${esc(title)}" class="wb-diagram"><defs>${[...this.defs].join("")}</defs>${this.out.join("")}</svg>`;
  }
}

// A seeded random, so a diagram is the same every time it is drawn.
const rng = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const B = (i: number) => `var(--pc-building-${Math.max(0, Math.min(5, i))})`;

export interface Diagram { id: string; title: string; caption: string; svg: string }

/** McHarg's layer cake: maps of the site stacked, read together. */
export function layers(): Diagram {
  const s = new Scene("layers"), W = 100, D = 70, T = 3, GAP = 24, r = rng(3);
  const slab = (k: number) => s.box(0, 0, k * GAP, W, D, T, "var(--pc-surface)");
  // 0: ground height
  slab(0);
  for (let i = 0; i < 5; i++) s.poly([[i * 20, 0, T], [i * 20 + 20, 0, T], [i * 20 + 20, D, T], [i * 20, D, T]], `var(--pc-elevation-${i + 1})`, false);
  // 1: water
  slab(1); const z1 = GAP + T;
  s.poly([[58, 0, z1], [74, 0, z1], [70, D, z1], [52, D, z1]], "var(--pc-water)", false);
  s.poly([[48, 0, z1], [58, 0, z1], [52, D, z1], [40, D, z1]], "var(--pc-water-flood)", false);
  // 2: green
  slab(2); const z2 = 2 * GAP + T;
  s.poly([[0, 0, z2], [34, 0, z2], [24, 30, z2], [0, 36, z2]], "var(--pc-green)", false);
  s.poly([[74, 40, z2], [96, 44, z2], [92, 66, z2], [78, 62, z2]], "var(--pc-green-proposed)", false);
  // 3: existing city
  slab(3); const z3 = 3 * GAP + T, bx: Box[] = [];
  for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) if (r() > .35) bx.push({ x: 4 + i * 11, y: 6 + j * 20, z: z3, w: 8, d: 12, h: 3 + r() * 6, fill: "var(--pc-existing)" });
  s.boxes(bx);
  // labels on the right
  const L = ["ground height", "water and floods", "trees and green", "the city today"];
  L.forEach((t, k) => s.label([W, D, k * GAP + T], t, { dx: 30, dy: 2 }));
  return { id: "layers", title: "Layers", caption: "Each map of the site is a layer. Stacked, they show what the land is like in every spot at once.", svg: s.svg("Four maps of a site stacked like a cake: ground height, water, green, existing buildings.") };
}

/** The rules map: never built, built with limits, free to design. */
export function rules(): Diagram {
  const s = new Scene("rules"), W = 120, D = 80, T = 3, r = rng(9);
  s.box(0, 0, 0, W, D, T, "var(--pc-surface)");
  s.poly([[0, 0, T], [36, 0, T], [28, 34, T], [0, 42, T]], s.pattern("forbidden"));
  s.poly([[36, 0, T], [56, 0, T], [50, D, T], [30, D, T], [28, 34, T]], s.pattern("constrained"));
  const bx: Box[] = [];
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) if (r() > .2) bx.push({ x: 60 + i * 15, y: 4 + j * 19, z: T, w: 11, d: 14, h: 6 + r() * 18, fill: B(1 + Math.floor(r() * 4)) });
  for (let j = 0; j < 3; j++) bx.push({ x: 38, y: 40 + j * 13, z: T, w: 8, d: 9, h: 5, fill: B(0) });
  s.boxes(bx);
  s.label([8, 30, T], "never built", { dx: -22, dy: 6, anchor: "end", strong: true });
  s.label([44, 6, T], "built with limits", { dx: -14, dy: -30, anchor: "end", strong: true });
  s.label([W, 10, T + 20], "free to design", { dx: 14, dy: -10, strong: true });
  return { id: "rules", title: "Rules", caption: "Rules sort the ground: some is never built on, some is built with limits, and the rest is free for designs to use.", svg: s.svg("A site in three parts: a red-hatched part never built, a grey-hatched strip with low buildings, and the rest with taller buildings.") };
}

/** Landform: valleys carry water, ridges carry streets. Ground as columns of cells. */
export function landform(): Diagram {
  const s = new Scene("landform"), n = 12, m = 8, c = 9;
  const hgt = (i: number, j: number) => {
    const a = Math.exp(-(((i - 2.5) ** 2) / 8 + ((j - 3.5) ** 2) / 14)), b = Math.exp(-(((i - 9.5) ** 2) / 8 + ((j - 3.5) ** 2) / 14));
    return 3 + 26 * Math.max(a, b);
  };
  const valley = (i: number) => i === 5 || i === 6;
  const cols: Box[] = [];
  let hmax = 0;
  for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) hmax = Math.max(hmax, hgt(i, j));
  for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) {
    const h = hgt(i, j);
    cols.push({ x: i * c, y: j * c, z: 0, w: c, d: c, h, fill: valley(i) ? "var(--pc-water-flood)" : `var(--pc-elevation-${Math.min(4, Math.floor((h / hmax) * 4.99))})` });
  }
  s.boxes(cols);
  // ridge streets along the two crests
  for (const i of [2.5, 9.5]) s.line(Array.from({ length: m }, (_, j): P3 => [i * c + c / 2, j * c + c / 2, hgt(Math.floor(i), j) + .6]), "var(--pc-ink)", 2.2);
  s.label([5.5 * c + c, 7.5 * c, 3], "valley: water runs here, kept open", { dx: -10, dy: 34, anchor: "middle", strong: true });
  s.label([9.5 * c, 0.5 * c, hgt(9, 0) + 1], "ridge: a main street", { dx: 20, dy: -14, strong: true });
  return { id: "landform", title: "Landform", caption: "Water gathers in the valleys, so they stay open; the ridges between them are where the main streets go.", svg: s.svg("Ground drawn as columns: two hills with a ridge street on each, and a blue valley between them.") };
}

/** Street hierarchy: main streets, routes, local streets, and the blocks between. */
export function streets(): Diagram {
  const s = new Scene("streets"), W = 130, D = 90, T = 3, r = rng(21);
  s.box(0, 0, 0, W, D, T, "var(--pc-surface)");
  const bx: Box[] = [];
  const xs = [0, 32, 64, 98, W], ys = [0, 40, D];
  for (let i = 0; i < xs.length - 1; i++) for (let j = 0; j < ys.length - 1; j++) {
    const x0 = xs[i] + 4, x1 = xs[i + 1] - 4, y0 = ys[j] + 4, y1 = ys[j + 1] - 4, k = 3;
    for (let p = 0; p < k; p++) bx.push({ x: x0 + p * (x1 - x0) / k + .5, y: y0, z: T, w: (x1 - x0) / k - 1, d: (y1 - y0) / 2 - 1, h: 3 + r() * 9, fill: B(Math.floor(r() * 3)) }),
      bx.push({ x: x0 + p * (x1 - x0) / k + .5, y: (y0 + y1) / 2 + .5, z: T, w: (x1 - x0) / k - 1, d: (y1 - y0) / 2 - 1, h: 3 + r() * 9, fill: B(Math.floor(r() * 3)) });
  }
  s.line([[0, 40, T + .2], [W, 40, T + .2]], "var(--pc-street-ground)", 6, { cap: "butt" });
  s.line([[64, 0, T + .2], [64, D, T + .2]], "var(--pc-street-ground)", 4, { cap: "butt" });
  for (const x of [32, 98]) s.line([[x, 0, T + .2], [x, D, T + .2]], "var(--pc-street-ground)", 2, { cap: "butt" });
  s.boxes(bx);
  s.label([0, 40, T], "main street, 18 m", { dx: -8, dy: -22, anchor: "end", strong: true });
  s.label([64, 0, T], "route, 12 m", { dx: 8, dy: -24, strong: true });
  s.label([98, D, T], "local street, 6 to 9 m", { dx: -6, dy: 22, anchor: "end", strong: true });
  return { id: "streets", title: "Streets", caption: "Wide main streets carry the city across, routes link the places people go, and narrow local streets make the blocks.", svg: s.svg("A grid of blocks cut by one wide street, one medium street and two narrow ones.") };
}

/** A design's recipe: a few settings, read as a plan. */
export function recipe(): Diagram {
  const s = new Scene("recipe"), r = rng(5);
  const bars = [["street spacing", .35], ["block pattern", .7], ["height", .55], ["green", .3], ["water", .6]] as const;
  let g = "";
  bars.forEach(([name, v], k) => {
    const y = k * 16;
    g += `<text x="0" y="${y + 8}" style="fill: var(--pc-ink-2); font: 10.5px var(--pc-font)">${name}</text>`;
    g += `<rect x="82" y="${y + 2}" width="56" height="6" rx="3" style="fill: color-mix(in srgb, var(--pc-ink) 12%, var(--pc-surface))"/><rect x="82" y="${y + 2}" width="${56 * v}" height="6" rx="3" style="fill: var(--pc-ink-2)"/>`;
  });
  s.raw(-210, -60, 140, 80, g);
  s.raw(-60, -36, 30, 12, `<line x1="0" y1="6" x2="24" y2="6" style="stroke: var(--pc-ink-2)" stroke-width="1.25"/><polygon points="24,2 30,6 24,10" style="fill: var(--pc-ink-2)"/>`);
  const W = 70, D = 60, T = 3;
  s.box(0, 0, 0, W, D, T, "var(--pc-surface)");
  s.poly([[0, 40, T], [24, 40, T], [24, D, T], [0, D, T]], "var(--pc-green-proposed)", false);
  s.poly([[48, 44, T], [64, 44, T], [64, 56, T], [48, 56, T]], "var(--pc-water-storage)", false);
  const bx: Box[] = [];
  for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) bx.push({ x: 3 + i * 17, y: 3 + j * 18, z: T, w: 13, d: 14, h: 6 + r() * 14, fill: B(1 + Math.floor(r() * 3)) });
  s.boxes(bx);
  return { id: "recipe", title: "Recipe", caption: "Every design grows from a short recipe of settings. Change a setting and a different plan grows on the same ground.", svg: s.svg("Five setting sliders on the left, an arrow, and the small plan they produce on the right.") };
}

/** Evolution: generations of designs, the better ones breeding. */
export function evolution(): Diagram {
  const s = new Scene("evolution"), W = 40, D = 40, T = 2, STEP = 62;
  const plan = (k: number, order: number, seed: number) => {
    const r = rng(seed), o = k * STEP, x0 = o, y0 = -o;
    s.box(x0, y0, 0, W, D, T, "var(--pc-surface)");
    if (order > .5) s.poly([[x0 + 2, y0 + 26, T], [x0 + 18, y0 + 26, T], [x0 + 18, y0 + D - 2, T], [x0 + 2, y0 + D - 2, T]], "var(--pc-green-proposed)", false);
    const bx: Box[] = [];
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      if (order > .5 && i < 2 && j >= 3) continue;
      const jit = (1 - order) * 4;
      if (r() < .3 * (1 - order)) continue;
      bx.push({ x: x0 + 2 + i * 9.5 + (r() - .5) * jit, y: y0 + 2 + j * 9.5 + (r() - .5) * jit, z: T, w: 6.5, d: 6.5, h: 3 + r() * (5 + order * 10), fill: B(Math.floor(r() * 4)) });
    }
    s.boxes(bx);
  };
  plan(0, 0, 4); plan(1, .5, 8); plan(2, 1, 12);
  for (const k of [0, 1]) s.arrow([k * STEP + W + 8, -k * STEP + D / 2 - 14, 4], [(k + 1) * STEP - 2, -(k + 1) * STEP + D / 2 + 2, 4]);
  const names = ["generation 0: random", "generation 5", "generation 15"];
  names.forEach((n, k) => s.label([k * STEP + W, -k * STEP + D, 0], n, { dy: 26, dx: -4, anchor: "middle", strong: k === 2 }));
  return { id: "evolution", title: "Evolution", caption: "Designs breed. The better ones become parents, so each generation tends to do a little better than the last.", svg: s.svg("Three small plans left to right: scattered, then tidier, then ordered with a park, joined by arrows.") };
}

/** The trade-off front (a flat chart: a picture where a chart is clearer). */
export function tradeoff(): Diagram {
  const r = rng(17), W = 220, H = 140, p = 22;
  const dots = Array.from({ length: 26 }, () => { const a = r(), b = r(); return { x: a, y: .1 + a * a * .6 + b * .3 }; });
  const front = dots.filter((d) => !dots.some((e) => e !== d && e.x >= d.x && e.y <= d.y && (e.x > d.x || e.y < d.y))).sort((a, b) => a.x - b.x);
  const X = (v: number) => p + v * (W - 2 * p), Y = (v: number) => H - p - (1 - v) * (H - 2 * p);
  let g = `<line x1="${p}" y1="${H - p}" x2="${W - p}" y2="${H - p}" style="stroke: var(--pc-line)"/><line x1="${p}" y1="${p}" x2="${p}" y2="${H - p}" style="stroke: var(--pc-line)"/>`;
  g += `<polyline points="${front.map((d) => `${f(X(d.x))},${f(Y(d.y))}`).join(" ")}" fill="none" style="stroke: var(--pc-ink-2)" stroke-dasharray="3 3"/>`;
  for (const d of dots) g += `<circle cx="${f(X(d.x))}" cy="${f(Y(d.y))}" r="${front.includes(d) ? 3.6 : 2.8}" style="fill: var(--pc-${front.includes(d) ? "ink" : "muted"})" fill-opacity="${front.includes(d) ? 1 : .5}"/>`;
  g += `<text x="${W - p}" y="${H - 6}" text-anchor="end" style="fill: var(--pc-ink); font: 500 10.5px var(--pc-font)">more water stored →</text>`;
  g += `<text x="${p - 8}" y="${p}" text-anchor="end" transform="rotate(-90 ${p - 8} ${p})" style="fill: var(--pc-ink); font: 500 10.5px var(--pc-font)">← cooler</text>`;
  const lf = front[Math.floor(front.length / 2)];
  g += `<text x="${f(X(lf.x)) + 6}" y="${f(Y(lf.y)) + 22}" style="fill: var(--pc-ink-2); font: 10.5px var(--pc-font)">the front</text>`;
  const s = new Scene("tradeoff").raw(0, 0, W, H, g);
  return { id: "tradeoff", title: "Trade-offs", caption: "No design is best at everything. The front is the set of designs that no other design beats on both counts.", svg: s.svg("A scatter of designs, more water stored to the right and cooler to the bottom, with the best edge joined by a dashed line.") };
}

/** Massing: buildings on a block, with the sun's shadows. */
export function massing(): Diagram {
  const s = new Scene("massing"), W = 80, D = 60, T = 3, away: P2 = [.55, -.35]; // shadows fall away from a sun in the south-west
  s.box(0, 0, 0, W, D, T, "var(--pc-surface)");
  const bx: Box[] = [
    { x: 6, y: 6, z: T, w: 16, d: 46, h: 10, fill: B(1) }, { x: 30, y: 6, z: T, w: 18, d: 18, h: 34, fill: B(4) },
    { x: 30, y: 34, z: T, w: 18, d: 18, h: 16, fill: B(2) }, { x: 56, y: 6, z: T, w: 18, d: 46, h: 8, fill: B(0) },
  ];
  // Shadows: each footprint swept away from the sun, length in proportion to height.
  for (const k of bx) {
    const L = k.h * .9, corners: P2[] = [[k.x, k.y], [k.x + k.w, k.y], [k.x + k.w, k.y + k.d], [k.x, k.y + k.d]];
    const all = [...corners, ...corners.map(([x, y]): P2 => [Math.min(W, x + away[0] * L), Math.max(0, y + away[1] * L)])];
    s.poly(hull(all).map(([x, y]): P3 => [x, y, T + .1]), "color-mix(in srgb, var(--pc-ink) 22%, transparent)", false);
  }
  s.boxes(bx);
  const [sx, sy] = iso([-8, -8, 46]);
  s.raw(sx - 9, sy - 9, 18, 18, `<circle cx="9" cy="9" r="5" style="fill: var(--pc-accent)" fill-opacity=".85"/>${Array.from({ length: 8 }, (_, i) => { const a = i * Math.PI / 4; return `<line x1="${f(9 + 7 * Math.cos(a))}" y1="${f(9 + 7 * Math.sin(a))}" x2="${f(9 + 9.5 * Math.cos(a))}" y2="${f(9 + 9.5 * Math.sin(a))}" style="stroke: var(--pc-accent)" stroke-width="1.2"/>`; }).join("")}`);
  s.label([39, 15, T + 34], "taller: more floor, longer shadow", { dx: 24, dy: -18, strong: true });
  return { id: "massing", title: "Massing", caption: "On one block, the buildings are given heights and shapes. The sun shows which streets and yards they shade.", svg: s.svg("A block with four buildings of different heights and the shadows they cast on the ground.") };
}

/** Growing in phases: what is built stays, each phase adds. */
export function growth(): Diagram {
  const s = new Scene("growth"), W = 40, D = 40, T = 2, STEP = 62, r = rng(31);
  const all: Box[] = [];
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) all.push({ x: 2 + i * 9.5, y: 2 + j * 9.5, z: T, w: 6.5, d: 6.5, h: 4 + r() * 10, fill: B(Math.floor(r() * 4)) });
  const order = all.map((_, k) => k).sort(() => r() - .5);
  ["2025", "2035", "2050"].forEach((yr, p) => {
    const o = p * STEP, n = [5, 10, 16][p];
    s.box(o, -o, 0, W, D, T, "var(--pc-surface)");
    s.boxes(order.slice(0, n).map((k) => ({ ...all[k], x: all[k].x + o, y: all[k].y - o })));
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
