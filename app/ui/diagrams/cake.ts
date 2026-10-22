// The layer cake: the whole method in one exploded drawing. Adapted from the author's own
// "Climate resilient process" diagram (reference/): the site's layers stacked from the ground
// up, the solid block where they meet, and the design's layers above it. Each layer has its
// name on the left (along the isometric angle, with a small icon card) and one plain sentence
// on the right. Drawn with the same kit and tokens as every other diagram (iso.ts).
import { byHeight, darker, esc, f, iso, lighter, rng, Scene, type Diagram, type P2, type P3, type Thing } from "./iso.js";

const S = 110;          // the site's side, in diagram units
const GAP = 80;         // between layers: more than half a layer's drawn height, so they read apart
const BLOCK = 12;       // the solid block's depth

// The site: a river along x, a hill in the far corner, a valley along the river.
const riverY = (x: number) => 62 + 13 * Math.sin(x / 17) + 4 * Math.sin(x / 7);
const ground = (x: number, y: number) =>
  2 + 22 * Math.exp(-(((x - 25) ** 2) / 500 + ((y - 20) ** 2) / 420)) + 9 * Math.exp(-(((x - 92) ** 2) / 300 + ((y - 95) ** 2) / 380))
  - 3 * Math.exp(-((y - riverY(x)) ** 2) / 60);

/** The river as a ribbon at height z, `extra` units past the site's edges. */
function river(s: Scene, z: number, extra = 0, fill = "var(--pc-water)") {
  const xs = Array.from({ length: 45 }, (_, k) => -extra + (k / 44) * (S + 2 * extra));
  const w = (x: number) => 3 + 1.5 * Math.sin(x / 11);
  const top = xs.map((x): P3 => [x, riverY(x) - w(x), z]), bot = xs.map((x): P3 => [x, riverY(x) + w(x), z]).reverse();
  s.poly([...top, ...bot], fill, false);
}
const ponds: [number, number, number][] = [[40, 48, 5], [74, 80, 6], [96, 58, 4]];
const pond = (s: Scene, z: number, fill = "var(--pc-water-storage)") => {
  for (const [cx, cy, r] of ponds) s.poly(Array.from({ length: 14 }, (_, k): P3 => [cx + r * 1.3 * Math.cos(k / 14 * 2 * Math.PI), cy + r * Math.sin(k / 14 * 2 * Math.PI), z]), fill, "var(--pc-water)");
};
/** The green: a buffer along the river and the wooded hill. */
const greens: P2[][] = [
  [[0, 50], [30, 44], [60, 52], [90, 50], [S, 46], [S, 78], [80, 84], [50, 80], [20, 82], [0, 76]],
  [[0, 0], [52, 0], [46, 26], [26, 38], [0, 40]],
];
const inGreen = (x: number, y: number) => greens.some((g) => inside(g, x, y));
function inside(r: P2[], x: number, y: number) {
  let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

/** Contour lines of the ground (marching squares), lifted onto a warped sheet at height z. */
function contours(s: Scene, z: number) {
  const n = 30, c = S / n, lift = 0.7, at = (x: number, y: number): P3 => [x, y, z + ground(x, y) * lift];
  for (let k = 0; k <= n; k += 3) { s.line(Array.from({ length: n + 1 }, (_, j) => at(k * c, j * c)), "var(--pc-elevation-3)", .35, { opacity: .5 }); s.line(Array.from({ length: n + 1 }, (_, i) => at(i * c, k * c)), "var(--pc-elevation-3)", .35, { opacity: .5 }); }
  const edge: P3[] = [...Array.from({ length: n + 1 }, (_, i) => at(i * c, 0)), ...Array.from({ length: n + 1 }, (_, j) => at(S, j * c)), ...Array.from({ length: n + 1 }, (_, i) => at(S - i * c, S)), ...Array.from({ length: n + 1 }, (_, j) => at(0, S - j * c))];
  s.poly(edge, "color-mix(in srgb, var(--pc-elevation-1) 55%, transparent)", false);
  for (let L = 1; L < 24; L += 1.5) {
    const strong = Math.abs(L % 6 - 1) < .01;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const x0 = i * c, y0 = j * c, v = [ground(x0, y0), ground(x0 + c, y0), ground(x0 + c, y0 + c), ground(x0, y0 + c)];
      const P: P2[] = [[x0, y0], [x0 + c, y0], [x0 + c, y0 + c], [x0, y0 + c]], hits: P2[] = [];
      for (let e = 0; e < 4; e++) {
        const a = v[e], b = v[(e + 1) % 4];
        if ((a < L) !== (b < L)) { const t = (L - a) / (b - a); hits.push([P[e][0] + t * (P[(e + 1) % 4][0] - P[e][0]), P[e][1] + t * (P[(e + 1) % 4][1] - P[e][1])]); }
      }
      for (let h = 0; h + 1 < hits.length; h += 2)
        s.line([at(...hits[h]), at(...hits[h + 1])], "var(--pc-elevation-4)", strong ? 1 : .55, { opacity: strong ? .95 : .7 });
    }
  }
}

/** A street network: main streets with arrows where they leave the site, routes, local grids. */
function network(s: Scene, z: number, style: "lines" | "streets") {
  const main: P3[] = [[0, 28, z], [40, 36, z], [70, 30, z], [S, 22, z]];
  const route: P3[] = [[58, 0, z], [62, 34, z], [56, 52, z], [66, 70, z], [60, S, z]];
  const route2: P3[] = [[S, 96, z], [84, 92, z], [66, 70, z]];
  const locals: P3[][] = [];
  for (let k = 0; k < 4; k++) locals.push([[70 + k * 10, 0, z], [72 + k * 10, 30 - k, z]]);
  for (let k = 0; k < 3; k++) locals.push([[66, 8 + k * 8, z], [S, 2 + k * 8, z]]);
  for (let k = 0; k < 4; k++) locals.push([[20 + k * 12, 86, z], [16 + k * 12, S, z]]);
  for (let k = 0; k < 2; k++) locals.push([[10, 92 + k * 9, z], [64, 90 + k * 9, z]]);
  if (style === "streets") {
    for (const l of locals) s.street(l, 1.6);
    s.street(route, 3); s.street(route2, 3); s.street(main, 4.5);
    return;
  }
  for (const l of locals) s.line(l, "var(--pc-ink-2)", .9, { opacity: .7 });
  s.line(route, "var(--pc-ink-2)", 1.8); s.line(route2, "var(--pc-ink-2)", 1.8);
  s.line(main, "var(--pc-ink)", 3);
  for (const [a, b] of [[main[1], main[0]], [main[2], main[3]], [route[1], route[0]], [route[3], route[4]]] as [P3, P3][]) s.arrow(a, b, "var(--pc-ink)");
}

/** Plots: blocks between the streets, split into plots; parks and ponds where the green is. */
function plots(s: Scene, z: number, r: () => number) {
  const out: { x: number; y: number; w: number; d: number; park: boolean }[] = [];
  const cols = [[2, 18], [20, 36], [42, 56], [68, 82], [84, 108]], rows = [[2, 18], [20, 34], [38, 50], [74, 84], [86, 96], [98, 108]];
  for (const [x0, x1] of cols) for (const [y0, y1] of rows) {
    const k = 2 + Math.floor(r() * 2);
    for (let p = 0; p < k; p++) {
      const w = (x1 - x0) / k, x = x0 + p * w, park = inGreen(x + w / 2, (y0 + y1) / 2);
      if (Math.abs((y0 + y1) / 2 - riverY(x + w / 2)) < 9) continue;
      out.push({ x: x + .5, y: y0 + .5, w: w - 1, d: y1 - y0 - 1, park });
    }
  }
  for (const p of out) s.poly([[p.x, p.y, z], [p.x + p.w, p.y, z], [p.x + p.w, p.y + p.d, z], [p.x, p.y + p.d, z]], p.park ? "var(--pc-green-light)" : `var(--pc-building-${Math.floor(r() * 3)})`, "var(--pc-surface)");
  return out;
}

// Small icon cards for the left: 2D signs of each layer.
const ICON = 46;
const card = (inner: string) => `<rect x=".5" y=".5" width="${ICON - 1}" height="${ICON - 1}" rx="6" style="fill: var(--pc-surface); stroke: var(--pc-line)"/>${inner}`;
const icons: Record<string, string> = {
  water: card(`<path d="M8 16 q6 -5 12 0 t12 0 t8 0 M8 24 q6 -5 12 0 t12 0 t8 0 M8 32 q6 -5 12 0 t12 0 t8 0" fill="none" style="stroke: var(--pc-water)" stroke-width="2" stroke-linecap="round"/>`),
  green: card(`<path d="M8 34 C 10 18, 24 12, 38 16 C 40 26, 30 36, 8 34 Z" style="fill: var(--pc-green-light)"/><circle cx="18" cy="24" r="5" style="fill: var(--pc-green)"/><circle cx="29" cy="21" r="4" style="fill: var(--pc-green)"/>`),
  topo: card(`${[14, 10, 6].map((r, i) => `<ellipse cx="${23 + i}" cy="${23 - i}" rx="${r + 3}" ry="${r}" fill="none" style="stroke: var(--pc-elevation-4)" stroke-width="1.2"/>`).join("")}`),
  site: card(`<polygon points="23,9 37,17 23,25 9,17" style="fill: var(--pc-green-light); stroke: var(--pc-ink)" stroke-opacity=".3" stroke-width=".6"/><polygon points="9,17 23,25 23,36 9,28" style="fill: ${darker("var(--pc-elevation-3)", .1)}"/><polygon points="23,25 37,17 37,28 23,36" style="fill: ${darker("var(--pc-elevation-3)", .3)}"/><path d="M14 17 q5 3 9 1 t10 2" fill="none" style="stroke: var(--pc-water)" stroke-width="1.6"/>`),
  streets: card(`<path d="M8 30 L38 16 M14 12 L30 36" fill="none" style="stroke: var(--pc-ink)" stroke-width="2"/><path d="M33 15 l5 1 l-3 4 M28 31 l2 5 l-5 -1" fill="none" style="stroke: var(--pc-ink)" stroke-width="1.6" stroke-linejoin="round"/><path d="M10 22 L22 16 M20 38 L36 28" style="stroke: var(--pc-ink-2)" stroke-width="1"/>`),
  plots: card(`<rect x="9" y="9" width="12" height="16" style="fill: var(--pc-building-1)"/><rect x="23" y="9" width="14" height="9" style="fill: var(--pc-building-0)"/><rect x="23" y="20" width="14" height="5" style="fill: var(--pc-green-light)"/><rect x="9" y="27" width="28" height="10" style="fill: var(--pc-building-2)"/>`),
  buildings: card(`${[[10, 22, 14], [20, 12, 24], [31, 18, 18]].map(([x, y, h]) => `<rect x="${x}" y="${y}" width="8" height="${h}" style="fill: ${byHeight(h * 1.4)}; stroke: var(--pc-ink)" stroke-opacity=".3" stroke-width=".6"/>`).join("")}`),
};

/** The layer cake. `notes`: the sentence on the right of each layer (off for small uses). */
export function layerCake(opts: { notes?: boolean } = {}): Diagram {
  const s = new Scene("cake"), r = rng(42), notes = opts.notes ?? true;
  // z of each layer, from the ground up
  const Z = { water: 0, green: GAP, topo: 2 * GAP, site: 3 * GAP + 6, streets: 4 * GAP + BLOCK + 14, plots: 5 * GAP + BLOCK + 14, buildings: 6 * GAP + BLOCK + 14 };

  // the pale band behind the stack
  const [bl] = iso([0, S, 0]), [br] = iso([S, 0, 0]), top = iso([0, 0, Z.buildings + 40])[1], bot = iso([S, S, 0])[1];
  s.raw(bl - 10, top, br - bl + 20, bot - top + 16, `<rect width="${f(br - bl + 20)}" height="${f(bot - top + 16)}" style="fill: color-mix(in srgb, var(--pc-ink) 4%, transparent)"/>`);

  // water: the river running past the site's edges, and ponds
  river(s, Z.water, 22, "var(--pc-water)");
  pond(s, Z.water);
  // natural systems: the green, wooded
  for (const g of greens) s.poly(g.map(([x, y]): P3 => [x, y, Z.green]), "var(--pc-green-light)", "var(--pc-green)");
  const trees: Thing[] = [];
  for (let k = 0; k < 70; k++) { const x = r() * S, y = r() * S; if (inGreen(x, y) && Math.abs(y - riverY(x)) > 5) trees.push({ kind: "tree", x, y, z: Z.green, s: 1.6 + r() * .9 }); }
  s.things(trees);
  // topography: contours on a warped sheet
  contours(s, Z.topo);

  // the site: a solid block where the layers meet
  const zt = Z.site + BLOCK;
  s.box({ x: 0, y: 0, z: Z.site, w: S, d: S, h: BLOCK, fill: "var(--pc-elevation-2)" });
  for (let k = 1; k < 3; k++) {  // strata on the block's faces
    const zz = Z.site + (BLOCK * k) / 3;
    s.line([[0, S, zz], [S, S, zz], [S, 0, zz]], darker("var(--pc-elevation-3)", .2), .6, { opacity: .6 });
  }
  s.poly([[0, 0, zt + .05], [S, 0, zt + .05], [S, S, zt + .05], [0, S, zt + .05]], lighter("var(--pc-surface-2)", .2), false);
  for (const g of greens) s.poly(g.map(([x, y]): P3 => [x, y, zt + .1]), "var(--pc-green-light)", false);
  river(s, zt + .15, 0, "var(--pc-water)");
  pond(s, zt + .15);
  network(s, zt + .2, "streets");
  const siteThings: Thing[] = [];
  for (let k = 0; k < 40; k++) { const x = r() * S, y = r() * S; if (inGreen(x, y) && Math.abs(y - riverY(x)) > 5) siteThings.push({ kind: "tree", x, y, z: zt, s: 1.4 + r() * .7 }); }
  const sitePlots = plots(new Scene("tmp"), 0, rng(7)).filter((p) => !p.park);
  for (const p of sitePlots) { const h = 3 + r() * 8; siteThings.push({ x: p.x + .8, y: p.y + .8, z: zt, w: p.w - 1.6, d: p.d - 1.6, h, fill: byHeight(h), floors: true }); }
  s.things(siteThings, { x0: 0, y0: 0, x1: S, y1: S });

  // the design's layers
  network(s, Z.streets, "lines");
  // the plots sit on a pale sheet of the whole site, the river cut through it
  s.poly([[0, 0, Z.plots], [S, 0, Z.plots], [S, S, Z.plots], [0, S, Z.plots]], "color-mix(in srgb, var(--pc-building-0) 35%, var(--pc-surface))", "var(--pc-line)");
  river(s, Z.plots + .05, 0, "var(--pc-water-flood)");
  const ps = plots(s, Z.plots + .1, rng(7));
  const bx: Thing[] = [];
  for (const p of ps) if (!p.park) { const h = 4 + r() * 16; bx.push({ x: p.x + .8, y: p.y + .8, z: Z.buildings, w: p.w - 1.6, d: p.d - 1.6, h, fill: byHeight(h), floors: true }); }
  s.things(bx);

  // labels: the name on the left, along the iso angle, with its icon card; a sentence on the right
  // COPY: layer names and sentences
  const L: { key: keyof typeof Z; name: string; icon: string; note: string[] }[] = [
    { key: "buildings", name: "Buildings", icon: "buildings", note: ["Heights and shapes on each plot,", "checked for sun, shade and floor area."] },
    { key: "plots", name: "Plots", icon: "plots", note: ["Blocks split into plots, with parks and", "ponds where the water and green need room."] },
    { key: "streets", name: "Streets", icon: "streets", note: ["Main streets on the ridges or the roads", "people use, routes to the places they go."] },
    { key: "site", name: "The site", icon: "site", note: ["Where the layers meet: the ground", "the rules allow, and the design on it."] },
    { key: "topo", name: "Topography", icon: "topo", note: ["The shape of the ground: where water", "runs and gathers, where ridges run."] },
    { key: "green", name: "Natural systems", icon: "green", note: ["Trees, forest and green kept as a", "connected network, with buffers."] },
    { key: "water", name: "Water", icon: "water", note: ["Rivers, ponds and the paths rain takes", "across the site."] },
  ];
  const leftX = iso([0, S, 0])[0], rightX = iso([S, 0, 0])[0];
  for (const l of L) {
    const z = l.key === "site" ? zt : Z[l.key];
    const [ax, ay] = iso([0, S * .55, z]), lx = leftX - 40, ly = ay + 6;
    // card, then the name rising at the iso angle, then a dotted line to the layer
    const w = l.name.length * 7.3, nsx = lx - 92, nsy = ly + 14, ex = nsx + w * .866 + 4, ey = nsy - w * .5 - 3;
    s.raw(lx - 150, ly - ICON / 2, ICON, ICON, icons[l.icon]);
    s.raw(lx - 104, ly, 1, 1, `<line x1="0" y1="0" x2="${f(nsx - (lx - 104) - 3)}" y2="${f(nsy - ly - 3)}" style="stroke: var(--pc-ink-2)" stroke-width=".8" stroke-dasharray="1.5 2.5"/>`);
    s.raw(nsx, ey - 12, w * .87 + 8, nsy - ey + 16, `<text transform="translate(0 ${f(nsy - ey + 12)}) rotate(-30)" style="fill: var(--pc-ink); font: 500 13px var(--pc-font)">${esc(l.name)}</text>`);
    s.raw(ex, Math.min(ey, ay), 1, 1, `<line x1="0" y1="${f(ey - Math.min(ey, ay))}" x2="${f(ax - ex)}" y2="${f(ay - Math.min(ey, ay))}" style="stroke: var(--pc-ink-2)" stroke-width=".8" stroke-dasharray="1.5 2.5"/><circle cx="${f(ax - ex)}" cy="${f(ay - Math.min(ey, ay))}" r="1.6" style="fill: var(--pc-ink)"/>`);
    if (notes) {
      const [bx2, by2] = iso([S, S * .45, z]), nx = rightX + 40, ny = by2 - 6;
      s.raw(bx2, Math.min(by2, ny), 1, 1, `<line x1="0" y1="${f(by2 - Math.min(by2, ny))}" x2="${f(nx - bx2 - 4)}" y2="${f(ny - Math.min(by2, ny))}" style="stroke: var(--pc-ink-2)" stroke-opacity=".6" stroke-width=".7"/><circle cx="0" cy="${f(by2 - Math.min(by2, ny))}" r="1.6" style="fill: var(--pc-ink)"/>`);
      s.raw(nx, ny - 4, 210, 30, `<text style="fill: var(--pc-ink-2); font: 11px var(--pc-font)">${l.note.map((t, i) => `<tspan x="0" dy="${i ? 14 : 0}">${esc(t)}</tspan>`).join("")}</text>`);
    }
  }
  return {
    id: "cake", title: "The layer cake",
    caption: "The site is read in layers from the ground up. Where they meet, the rules say what the land allows, and the design adds streets, plots and buildings on top.",
    svg: s.svg("An exploded stack: water, natural systems and topography below; the site as a solid block where they meet; streets, plots and buildings above."),
  };
}
