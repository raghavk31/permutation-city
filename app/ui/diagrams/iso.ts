// Isometric diagrams: simple pictures that explain one idea each (design system, "Diagrams").
// Every diagram uses the same 30° projection, one light (from the upper left of the page), and
// the map's colour tokens through their CSS properties, so it follows the theme and a colour
// means what it means on the map. They are SVG strings, used as they are by the workbench (step
// intros, empty states, term tooltips), the story page and docs/ui/system.html.
//
// Rules for a diagram: one idea; at most five labelled things; a plain one-sentence caption;
// no numbers unless the number is the point. Style, after the references in reference/:
//   paper   context: white faces, a whisper of shade, crisp hairline edges
//   colour  what the diagram is about, in its map colour
//   mark    solid ink: what this step changes
//   ghost   dashed edges: what isn't built yet, or was taken away

export type P3 = [number, number, number];
export type P2 = [number, number];

const COS = Math.cos(Math.PI / 6), SIN = 0.5;
/** Page pixels per world unit. Diagrams are drawn at this one scale and never enlarged, so
 *  labels are the same size in every diagram. */
export const SCALE = 1.5;
/** World (x right-down, y left-down, z up) to the page. */
export const iso = ([x, y, z]: P3): P2 => [(x - y) * COS * SCALE, ((x + y) * SIN - z) * SCALE];

/** The light: from the upper left of the page and above, so the left faces of a box are lit
 *  and the right faces are in shade. Shadows fall the other way, `AWAY` per unit of height. */
const LIGHT = (() => { const v: P3 = [-0.55, 0.25, 1]; const n = Math.hypot(...v); return v.map((c) => c / n) as P3; })();
const AWAY: P2 = [0.5, -0.2];
export const FLOOR = 3.2; // one storey, in diagram units

export const darker = (c: string, k: number) => `color-mix(in srgb, ${c} ${Math.round(100 - k * 100)}%, var(--pc-ink))`;
export const lighter = (c: string, k: number) => `color-mix(in srgb, ${c} ${Math.round(100 - k * 100)}%, var(--pc-surface))`;
export const f = (n: number) => +n.toFixed(1);
export const pts = (q: P2[]) => q.map(([a, b]) => `${f(a)},${f(b)}`).join(" ");
export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

const EDGE = 'stroke="var(--pc-ink)" stroke-opacity=".22" stroke-width=".6" stroke-linejoin="round"';
const SHADOW = "color-mix(in srgb, var(--pc-ink) 13%, transparent)";

export interface Box { kind?: "box"; x: number; y: number; z: number; w: number; d: number; h: number; fill?: string; floors?: boolean; style?: "paper" | "colour" | "mark" | "ghost" }
export interface Tree { kind: "tree"; x: number; y: number; z: number; s: number; fill?: string }
export type Thing = Box | Tree;
type Clip = { x0: number; y0: number; x1: number; y1: number };
const depthOf = (t: Thing) => (t.kind === "tree" ? t.x + t.y + t.s : t.x + t.w + t.y + t.d);

/** A scene drawn in the order things are added; `things` sorts boxes and trees back to front. */
export class Scene {
  private out: string[] = [];
  private b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  private defs = new Set<string>();
  private pins: string[] = [];
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

  /** A box: its top and the two faces toward the viewer, lit from the upper left, then its
   *  edges drawn once (the silhouette and the three edges at the near top corner); with
   *  `floors`, a line at each storey. Style "paper" (default without a fill), "colour"
   *  (default with one), "mark" (solid ink) or "ghost" (dashed edges only). */
  box(k: Box): this {
    const { x, y, z, w, d, h } = k, style = k.style ?? (k.fill ? "colour" : "paper");
    const T: P2[] = [iso([x, y, z + h]), iso([x + w, y, z + h]), iso([x + w, y + d, z + h]), iso([x, y + d, z + h])];
    const Bt: P2[] = [iso([x, y, z]), iso([x + w, y, z]), iso([x + w, y + d, z]), iso([x, y + d, z])];
    this.grow([...T, ...Bt]);
    const seg = (a: P2, b: P2) => `M${f(a[0])} ${f(a[1])}L${f(b[0])} ${f(b[1])}`;
    if (style === "ghost") {
      const d4 = [0, 1, 2, 3].map((i) => seg(T[i], T[(i + 1) % 4]) + seg(Bt[i], Bt[(i + 1) % 4]) + seg(T[i], Bt[i])).join("");
      this.out.push(`<path d="${d4}" fill="none" style="stroke: var(--pc-ink-2)" stroke-width=".7" stroke-dasharray="2.4 2" stroke-opacity=".75"/>`);
      return this;
    }
    const fill = k.fill ?? "var(--pc-surface)";
    const faces = style === "mark"
      ? { top: "color-mix(in srgb, var(--pc-ink) 82%, var(--pc-surface))", left: "var(--pc-ink)", right: "color-mix(in srgb, var(--pc-ink) 92%, var(--pc-surface))" }
      : style === "paper"
        ? { top: "var(--pc-surface)", left: "color-mix(in srgb, var(--pc-ink) 4%, var(--pc-surface))", right: "color-mix(in srgb, var(--pc-ink) 12%, var(--pc-surface))" }
        : { top: lighter(fill, 0.06), left: darker(fill, 0.07), right: darker(fill, 0.2) };
    const line = style === "mark" ? "var(--pc-surface)" : "var(--pc-ink)", op = style === "mark" ? .45 : .6;
    const seal = (q: P2[], c: string) => `<polygon points="${pts(q)}" style="fill: ${c}; stroke: ${c}" stroke-width=".4" stroke-linejoin="round"/>`;
    let g = "";
    if (h > 0) {
      g += seal([Bt[1], Bt[2], T[2], T[1]], faces.right) + seal([Bt[3], Bt[2], T[2], T[3]], faces.left);
      if (k.floors && h > FLOOR * 1.5)
        for (let zz = z + FLOOR; zz < z + h - 0.8; zz += FLOOR)
          g += `<polyline points="${pts([iso([x, y + d, zz]), iso([x + w, y + d, zz]), iso([x + w, y, zz])])}" fill="none" style="stroke: ${line}" stroke-opacity="${style === "mark" ? .28 : .13}" stroke-width=".5"/>`;
    }
    g += seal(T, faces.top);
    const sil = h > 0 ? [T[0], T[1], Bt[1], Bt[2], Bt[3], T[3]] : T;
    g += `<polygon points="${pts(sil)}" fill="none" style="stroke: ${line}" stroke-opacity="${op}" stroke-width=".75" stroke-linejoin="round"/>`;
    if (h > 0) g += `<path d="${seg(T[1], T[2])}${seg(T[2], T[3])}${seg(T[2], Bt[2])}" fill="none" style="stroke: ${line}" stroke-opacity="${op * .75}" stroke-width=".55"/>`;
    this.out.push(g);
    return this;
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
      if (t.kind !== "tree" && t.style === "ghost") continue;
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

  /** A street on the ground: a band with a fine kerb either side (pale on a designed site,
   *  grey on plain ground). */
  street(p: P3[], width: number, fill = "var(--pc-street)"): this {
    this.line(p, "var(--pc-ink)", width + 1, { cap: "butt", opacity: .16 });
    return this.line(p, fill, width, { cap: "butt" });
  }

  /** Lettering lying on the ground, along the world's x or y axis (like a street name painted
   *  on a plan). */
  groundText(at: P3, text: string, axis: "x" | "y", opts: { size?: number; fill?: string; anchor?: "start" | "middle" | "end" } = {}): this {
    const [X, Y] = iso(at), size = opts.size ?? 8, w = text.length * size * .72;
    this.grow([[X - w, Y - w * .6], [X + w, Y + w * .6]]);
    const c = COS.toFixed(4), m = axis === "x" ? `matrix(${c} ${SIN} -${c} ${SIN} ${f(X)} ${f(Y)})` : `matrix(${c} -${SIN} ${c} ${SIN} ${f(X)} ${f(Y)})`;
    this.out.push(`<text transform="${m}" text-anchor="${opts.anchor ?? "middle"}" dominant-baseline="central" style="fill: ${opts.fill ?? "var(--pc-ink-2)"}; font: 500 ${size}px var(--pc-font); letter-spacing: .14em">${esc(text.toUpperCase())}</text>`);
    return this;
  }

  /** A soft wedge of light from a point on the page to a polygon on the ground. */
  cone(from: P2, to: P3[], fill = "var(--pc-heat-5)"): this {
    const q = to.map(iso), all = [from, ...q];
    this.grow(all);
    this.out.push(`<polygon points="${pts(hull(all))}" style="fill: ${fill}" fill-opacity=".16"/>`);
    return this;
  }

  /** A pin: a thin stalk up from a place on the ground to a round badge with a sign in it
   *  (after MVRDV's diagrams). Badges are drawn last, over everything. */
  pin(at: P3, glyph: keyof typeof GLYPHS, fill = "var(--pc-ink)", stalk = 26): this {
    const [x, y] = iso(at), top = y - stalk, R = 8.5;
    this.grow([[x - R, top - R], [x + R, y + 2]]);
    this.pins.push(`<line x1="${f(x)}" y1="${f(y)}" x2="${f(x)}" y2="${f(top + R)}" style="stroke: var(--pc-ink-2)" stroke-width=".8"/><circle cx="${f(x)}" cy="${f(y)}" r="1.6" style="fill: var(--pc-ink)"/>`
      + `<g transform="translate(${f(x)} ${f(top)})"><circle r="${R}" style="fill: ${fill}; stroke: var(--pc-surface)" stroke-width="1.2"/><g style="fill: none; stroke: var(--pc-surface)" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round">${GLYPHS[glyph]}</g></g>`);
    return this;
  }

  /** An arrow painted on the ground along a straight run, following the ground's height
   *  (`zAt`), like the flow arrows on a landscape plan. */
  groundArrow(a: P2, b: P2, zAt: (x: number, y: number) => number, width = 2.4, fill = "var(--pc-water)"): this {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]), u: P2 = [(b[0] - a[0]) / L, (b[1] - a[1]) / L], n: P2 = [-u[1], u[0]];
    const head = Math.min(L * .45, width * 2.4), m: P2 = [b[0] - u[0] * head, b[1] - u[1] * head], w = width / 2;
    const flat: P2[] = [
      [a[0] + n[0] * w, a[1] + n[1] * w], [m[0] + n[0] * w, m[1] + n[1] * w], [m[0] + n[0] * w * 2.3, m[1] + n[1] * w * 2.3], b,
      [m[0] - n[0] * w * 2.3, m[1] - n[1] * w * 2.3], [m[0] - n[0] * w, m[1] - n[1] * w], [a[0] - n[0] * w, a[1] - n[1] * w],
    ];
    return this.poly(flat.map(([x, y]): P3 => [x, y, zAt(x, y) + .5]), fill, "var(--pc-surface)");
  }

  /** The drawing's body and bounds, for composing several into one (`series`). */
  parts() { return { body: this.out.join("") + this.pins.join(""), defs: [...this.defs].join(""), b: { ...this.b } }; }

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
    return `<svg viewBox="${f(x0 - p)} ${f(y0 - p)} ${f(w)} ${f(h)}" width="${Math.round(w)}" height="${Math.round(h)}" role="img" aria-label="${esc(title)}" class="wb-diagram"><defs>${[...this.defs].join("")}</defs>${this.out.join("")}${this.pins.join("")}</svg>`;
  }
}

/** Signs for pins: simple line drawings centred on 0, 0 (about 9 px across). */
const GLYPHS = {
  bus: `<rect x="-3.6" y="-4.2" width="7.2" height="7" rx="1.4"/><line x1="-3.6" y1="-.8" x2="3.6" y2="-.8"/><line x1="-2.2" y1="2.8" x2="-2.2" y2="4.4"/><line x1="2.2" y1="2.8" x2="2.2" y2="4.4"/>`,
  school: `<path d="M-4.6 -1.2 L0 -3.6 L4.6 -1.2 L0 1.2 Z"/><path d="M-2.6 0 V2.4 Q0 4 2.6 2.4 V0"/>`,
  market: `<path d="M-4.2 -1.4 H4.2 L3.2 -3.8 H-3.2 Z"/><path d="M-3.4 -1.4 V3.8 H3.4 V-1.4"/><line x1="-1" y1="3.8" x2="-1" y2="1"/><line x1="1" y1="1" x2="1" y2="3.8"/>`,
  tree: `<circle cx="0" cy="-1.4" r="3"/><line x1="0" y1="1.6" x2="0" y2="4.4"/>`,
  drop: `<path d="M0 -4.4 C 2.6 -1, 3.4 .6, 3.4 1.6 A 3.4 3.4 0 0 1 -3.4 1.6 C -3.4 .6, -2.6 -1, 0 -4.4 Z"/>`,
} as const;

// A seeded random, so a diagram is the same every time it is drawn.
export const rng = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const B = (i: number) => `var(--pc-building-${Math.max(0, Math.min(5, i))})`;
/** Building colour by height, as on the map: the ramp runs to 15 storeys. */
export const byHeight = (h: number) => B(Math.floor((h / FLOOR) / 15 * 6));
const sun = (s: Scene, at: P3): P2 => {
  const [x, y] = iso(at);
  sunAt = [x, y];
  s.raw(x - 10, y - 10, 20, 20, `<circle cx="10" cy="10" r="5" style="fill: var(--pc-heat-5)"/>${Array.from({ length: 8 }, (_, i) => { const a = i * Math.PI / 4; return `<line x1="${f(10 + 7.5 * Math.cos(a))}" y1="${f(10 + 7.5 * Math.sin(a))}" x2="${f(10 + 10 * Math.cos(a))}" y2="${f(10 + 10 * Math.sin(a))}" style="stroke: var(--pc-heat-5)" stroke-width="1.3" stroke-linecap="round"/>`; }).join("")}`);
  return sunAt;
};
let sunAt: P2 = [0, 0];

/** Frames side by side, each with a caption: "01 TITLE" and a grey line under it (as in a
 *  numbered process sheet). Bottoms line up, so the ground reads level. */
export function series(frames: { scene: Scene; num: string; title: string; note: string }[], label: string): string {
  const parts = frames.map((fr) => ({ ...fr, ...fr.scene.parts() })), GAPX = 26, CAP = 34;
  const H = Math.max(...parts.map((p) => p.b.y1 - p.b.y0));
  let x = 0, body = "", defs = "";
  for (const p of parts) {
    const w = Math.max(p.b.x1 - p.b.x0, 120), dx = x + (w - (p.b.x1 - p.b.x0)) / 2 - p.b.x0, dy = H - p.b.y1;
    body += `<g transform="translate(${f(dx)} ${f(dy)})">${p.body}</g>`;
    body += `<text x="${f(x + w / 2)}" y="${f(H + 20)}" text-anchor="middle" style="fill: var(--pc-ink); font: 500 10.5px var(--pc-font); letter-spacing: .08em"><tspan style="font-weight: 600">${esc(p.num)}</tspan> ${esc(p.title.toUpperCase())}</text>`;
    body += `<text x="${f(x + w / 2)}" y="${f(H + 34)}" text-anchor="middle" style="fill: var(--pc-muted); font: 10.5px var(--pc-font)">${esc(p.note)}</text>`;
    defs += p.defs; x += w + GAPX;
  }
  const W = x - GAPX, pad = 8;
  return `<svg viewBox="${-pad} ${-pad} ${f(W + 2 * pad)} ${f(H + CAP + 2 * pad)}" width="${Math.round(W + 2 * pad)}" height="${Math.round(H + CAP + 2 * pad)}" role="img" aria-label="${esc(label)}" class="wb-diagram"><defs>${defs}</defs>${body}</svg>`;
}

export interface Diagram { id: string; title: string; caption: string; svg: string }

/** McHarg's layer cake: maps of the site stacked, read together. */
export function layers(): Diagram {
  const s = new Scene("layers"), W = 100, D = 70, T = 2.5, GAP = 48, r = rng(3);
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
  // on the front of the layer, where the one above doesn't hide it
  s.poly([[52, 30, z + T], [W, 22, z + T], [W, D, z + T], [40, D, z + T], [44, 50, z + T]], "var(--pc-green-light)", false);
  const trees: Thing[] = [];
  for (let k = 0; k < 14; k++) { const x = 56 + r() * 40, y = 36 + r() * 30; trees.push({ kind: "tree", x, y, z: z + T, s: 2.4 + r() * 1.2 }); }
  s.things(trees);
  // 3: the city today
  z = 3 * GAP; s.slab(0, 0, z, W, D, T);
  const bx: Thing[] = [];
  for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) if (r() > .3) bx.push({ x: 4 + i * 15, y: 4 + j * 16, z: z + T, w: 10, d: 11, h: 3 + r() * 7 });
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
  for (let k = 0; k < 7; k++) th.push({ kind: "tree", x: 4 + r() * 20, y: 4 + r() * 26, z: T, s: 2.6 + r() });
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) if (r() > .2) th.push({ x: 60 + i * 15, y: 4 + j * 19, z: T, w: 11, d: 14, h: 8 + r() * 22, floors: true });
  for (let j = 0; j < 3; j++) th.push({ x: 37, y: 42 + j * 12.5, z: T, w: 8, d: 9, h: 6.4, floors: true });
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
  // rain running off both hills into the valley, painted on the ground
  const zAt = (x: number, y: number) => Math.max(h(x / c, y / c), 1.6);
  for (const y of [.25, .55, .85].map((v) => v * ny * c)) {
    s.groundArrow([nx * c * .3, y], [nx * c * .45, y + 2], zAt);
    s.groundArrow([nx * c * .72, y - 2], [nx * c * .59, y], zAt);
  }
  s.pin([nx * c * .52, ny * c * .5, 1.7], "drop", "var(--pc-water)", 34);
  s.label([nx * c * .52, ny * c, 1.7], "valley: water runs here, kept open", { dx: 0, dy: 28, anchor: "middle", strong: true });
  s.label([Math.round(nx * .82) * c, 1 * c, h(Math.round(nx * .82), 1) + .4], "ridge: a main street", { dx: 22, dy: -16, strong: true });
  return { id: "landform", title: "Landform", caption: "Water gathers in the valleys, so they stay open; the ridges between them are where the main streets go.", svg: s.svg("Shaded ground with two hills, a street along each crest, blue arrows of rain running down both slopes, and a stream in the valley between.") };
}

/** Street hierarchy: main streets, routes, local streets, and the blocks between. The streets
 *  are the idea, so they carry the tone and their names lie on the ground. */
export function streets(): Diagram {
  const s = new Scene("streets"), W = 130, D = 92, T = 3, r = rng(21);
  s.slab(0, 0, 0, W, D, T);
  const MAIN = 42, ROUTE = 66, LOCAL = [30, 100], grey = "color-mix(in srgb, var(--pc-ink) 34%, var(--pc-surface))";
  for (const x of LOCAL) s.street([[x, 0, T + .1], [x, D, T + .1]], 6, grey);
  s.street([[ROUTE, 0, T + .1], [ROUTE, D, T + .1]], 10, grey);
  s.street([[0, MAIN, T + .1], [W, MAIN, T + .1]], 15, grey);
  s.groundText([30, MAIN, T + .2], "main street", "x", { size: 10, fill: "var(--pc-surface)" });
  s.groundText([ROUTE, 76, T + .2], "route", "y", { size: 8, fill: "var(--pc-surface)" });
  s.groundText([LOCAL[1], 78, T + .2], "local", "y", { size: 6, fill: "var(--pc-surface)" });
  const th: Thing[] = [];
  const xs = [0, LOCAL[0], ROUTE, LOCAL[1], W], ys = [0, MAIN, D];
  for (let i = 0; i < xs.length - 1; i++) for (let j = 0; j < ys.length - 1; j++) {
    const x0 = xs[i] + 7, x1 = xs[i + 1] - 7, y0 = ys[j] + 10, y1 = ys[j + 1] - 8, k = 2;
    for (let p = 0; p < k; p++) for (const half of [0, 1]) {
      const pw = (x1 - x0) / k, pd = (y1 - y0) / 2;
      th.push({ x: x0 + p * pw + 1.5, y: (half ? y0 + pd : y0) + 1.5, z: T, w: pw - 3, d: pd - 3, h: 4 + r() * 6, floors: true });
    }
  }
  for (let x = 5; x < W; x += 10) if (Math.abs(x - ROUTE) > 6 && LOCAL.every((l) => Math.abs(x - l) > 5)) {
    th.push({ kind: "tree", x, y: MAIN - 9, z: T, s: 2 }, { kind: "tree", x: x + 2, y: MAIN + 9, z: T, s: 2 });
  }
  s.things(th, { x0: 0, y0: 0, x1: W, y1: D });
  // the places the routes join
  s.pin([ROUTE, MAIN, T], "bus", "var(--pc-ink)", 40);
  s.pin([16, 20, T + 6], "school", "var(--pc-ink)", 34);
  s.pin([84, 70, T + 6], "market", "var(--pc-ink)", 30);
  return { id: "streets", title: "Streets", caption: "Wide main streets carry the city across, routes link the places people go, and narrow local streets make the blocks.", svg: s.svg("White blocks cut by a wide tree-lined main street, a route and two local streets, each named on the ground, with pins on a bus stop, a school and a market.") };
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
  for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) th.push({ x: 3 + i * 17, y: 3 + j * 18, z: T, w: 13, d: 14, h: 8 + r() * 16, floors: true });
  for (let k = 0; k < 5; k++) th.push({ kind: "tree", x: 4 + r() * 18, y: 43 + r() * 15, z: T, s: 2.3 + r() * .8, fill: "var(--pc-green-proposed)" });
  s.things(th, { x0: 0, y0: 0, x1: W, y1: D });
  return { id: "recipe", title: "Recipe", caption: "Every design grows from a short recipe of settings. Change a setting and a different plan grows on the same ground.", svg: s.svg("Five setting sliders on the left, an arrow, and the small plan they produce on the right.") };
}

/** One small plan: `order` 0 is scattered, 1 is settled with a park; `marked` buildings (by
 *  index) are drawn in ink, as what changed. */
function smallPlan(order: number, seed: number, marked: number[] = []): Scene {
  const s = new Scene(`plan${seed}`), r = rng(seed), W = 40, D = 40, T = 2, park = order > .7;
  s.slab(0, 0, 0, W, D, T);
  if (park) s.poly([[2, 26, T], [18, 26, T], [18, D - 2, T], [2, D - 2, T]], "var(--pc-green-light)", false);
  const th: Thing[] = [];
  let n = 0;
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    if (park && i < 2 && j >= 3) continue;
    const jit = (1 - order) * 5, skip = r() < .3 * (1 - order), hh = 4 + r() * (6 + order * 12);
    if (skip) continue;
    th.push({ x: 2 + i * 9.5 + (r() - .5) * jit, y: 2 + j * 9.5 + (r() - .5) * jit, z: T, w: 6.5, d: 6.5, h: hh, floors: true, style: marked.includes(n) ? "mark" : "paper" });
    n++;
  }
  if (park) for (let k = 0; k < 3; k++) th.push({ kind: "tree", x: 5 + k * 5, y: 31 + (k % 2) * 4, z: T, s: 2, fill: "var(--pc-green-proposed)" });
  s.things(th, { x0: 0, y0: 0, x1: W, y1: D });
  return s;
}

/** Evolution: generations of designs, the better ones breeding. */
export function evolution(): Diagram {
  // COPY: evolution frames
  const svg = series([
    { scene: smallPlan(0, 4), num: "01", title: "Start", note: "random designs" },
    { scene: smallPlan(.5, 8, [2, 5, 9]), num: "02", title: "Breed", note: "the best become parents" },
    { scene: smallPlan(1, 12), num: "03", title: "Settle", note: "after 15 generations" },
  ], "Three small plans: scattered, then tidier with a few changed buildings in black, then settled with a park.");
  return { id: "evolution", title: "Evolution", caption: "Designs breed. The better ones become parents, so each generation tends to do a little better than the last.", svg };
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

/** Massing: buildings on a block, with the sun's light and shadows. */
export function massing(): Diagram {
  const s = new Scene("massing"), W = 90, D = 64, T = 3;
  s.slab(0, 0, 0, W, D, T);
  const yard: P3[] = [[34, 18, T], [70, 18, T], [70, 46, T], [34, 46, T]];
  s.poly(yard, "var(--pc-green-light)", false);
  const th: Thing[] = [
    { x: 6, y: 18, z: T, w: 20, d: 20, h: 38.4, floors: true },
    { x: 6, y: 44, z: T, w: 20, d: 14, h: 12.8, floors: true },
    { x: 34, y: 50, z: T, w: 48, d: 10, h: 9.6, floors: true },
    { x: 76, y: 6, z: T, w: 10, d: 40, h: 16, floors: true },
    { kind: "tree", x: 44, y: 38, z: T, s: 2.4, fill: "var(--pc-green-proposed)" }, { kind: "tree", x: 60, y: 30, z: T, s: 2.4, fill: "var(--pc-green-proposed)" },
  ];
  const at = sun(s, [-34, 44, 70]);
  s.cone(at, [[52, 18, T], [70, 18, T], [70, 46, T], [52, 46, T]]);
  s.things(th, { x0: 0, y0: 0, x1: W, y1: D });
  s.label([16, 28, T + 38.4], "taller: more floors", { dx: -16, dy: -14, anchor: "end", strong: true });
  s.label([44, 24, T], "and a longer shadow on the yard", { dx: 30, dy: -34, strong: true });
  return { id: "massing", title: "Massing", caption: "On one block, the buildings are given heights and shapes. The sun shows which streets and yards they shade.", svg: s.svg("White buildings on a block, a tower casting its shadow across a green yard, and the sun's light falling on the rest of the yard.") };
}

/** Growing in phases: what is built stays, each phase adds; what comes later is dashed. */
export function growth(): Diagram {
  const r = rng(31), all: Box[] = [];
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) all.push({ x: 2 + i * 9.5, y: 2 + j * 9.5, z: 2, w: 6.5, d: 6.5, h: 4 + r() * 12, floors: true });
  const order = all.map((_, k) => k).sort(() => r() - .5), phaseOf = new Map(order.map((k, i) => [k, i < 5 ? 0 : i < 10 ? 1 : 2]));
  const frame = (p: number) => {
    const s = new Scene(`grow${p}`);
    s.slab(0, 0, 0, 40, 40, 2);
    s.things(all.map((b, k): Box => {
      const ph = phaseOf.get(k)!;
      return { ...b, style: ph < p ? "paper" : ph === p ? "mark" : "ghost" };
    }), { x0: 0, y0: 0, x1: 40, y1: 40 });
    return s;
  };
  // COPY: growth frames
  const svg = series([
    { scene: frame(0), num: "2025", title: "First phase", note: "the rest still to come" },
    { scene: frame(1), num: "2035", title: "Added", note: "what was built stays" },
    { scene: frame(2), num: "2050", title: "Complete", note: "under 2050's conditions" },
  ], "The same block in 2025, 2035 and 2050: each phase's new buildings in black, earlier ones white, later ones dashed.");
  return { id: "growth", title: "Growing in phases", caption: "The site is built in phases. What is built stays, and each phase adds to it under its own year's conditions.", svg };
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
