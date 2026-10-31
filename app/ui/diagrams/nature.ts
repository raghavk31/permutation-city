// Nature's rules (engine/typology/nature.ts): one small isometric diagram per gene, showing the
// gene at work in a building or on a site. Same projection, light and colour tokens as iso.ts;
// one idea each, at most a few labels, the gene's numbers only where the number is the point.
import { Scene, darker, iso, lighter, rng, type P3, type Thing } from "./iso";

type Pt = [number, number];
const T = 2; // ground slab thickness
const WATER = "var(--pc-water)", GREEN = "var(--pc-green)", GREEN_L = "var(--pc-green-light)", HEAT = "var(--pc-heat-5)";
const B = (i: number) => `var(--pc-building-${i})`;

/** An upright prism over any ring (for turned floors and odd plans): the faces toward the
 *  viewer shaded by which way they face, then the top. */
function prism(s: Scene, ring: Pt[], z: number, h: number, fill = "var(--pc-surface)") {
  const a = ring.reduce((t, [x, y], i) => { const [u, v] = ring[(i + 1) % ring.length]; return t + x * v - u * y; }, 0), sgn = a > 0 ? 1 : -1;
  const faces = ring.map(([x, y], i) => {
    const [u, v] = ring[(i + 1) % ring.length], L = Math.hypot(u - x, v - y) || 1;
    const n: Pt = [sgn * (v - y) / L, -sgn * (u - x) / L];
    return { p: [[x, y, z], [u, v, z], [u, v, z + h], [x, y, z + h]] as P3[], n, depth: x + u + y + v };
  }).filter((f) => f.n[0] + f.n[1] > 0).sort((p, q) => p.depth - q.depth);
  for (const f of faces) s.poly(f.p, darker(fill, 0.07 + 0.13 * Math.max(0, f.n[0])));
  s.poly(ring.map(([x, y]): P3 => [x, y, z + h]), lighter(fill, 0.04));
}

const ground = (s: Scene, W: number, D: number, fill?: string) => s.slab(0, 0, 0, W, D, T, fill);
/** Rain: short slanted strokes above a ground area. */
function rain(s: Scene, x0: number, y0: number, x1: number, y1: number, z: number, n: number, seed = 3) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) { const x = x0 + r() * (x1 - x0), y = y0 + r() * (y1 - y0), zz = z + r() * 10; s.line([[x, y, zz + 4], [x + 0.6, y + 0.6, zz]], WATER, 0.9, { opacity: 0.7 }); }
}
/** A sun drawn on the page at a world point. */
function sun(s: Scene, at: P3) {
  const c = `<circle cx="0" cy="0" r="5" style="fill: ${HEAT}"/>` + Array.from({ length: 8 }, (_, i) => { const a = i * Math.PI / 4; return `<line x1="${(7.5 * Math.cos(a)).toFixed(1)}" y1="${(7.5 * Math.sin(a)).toFixed(1)}" x2="${(10 * Math.cos(a)).toFixed(1)}" y2="${(10 * Math.sin(a)).toFixed(1)}" style="stroke: ${HEAT}" stroke-width="1.3" stroke-linecap="round"/>`; }).join("");
  const [px, py] = iso(at);
  s.raw(px, py, 0, 0, c);
}
/** Blocks scattered on a grid of cells, skipping where `free` says. */
function blocks(s: Scene, th: Thing[], x0: number, y0: number, x1: number, y1: number, cell: number, free: (x: number, y: number) => boolean, seed = 7, hmax = 9) {
  const r = rng(seed);
  for (let x = x0; x + cell <= x1 + 0.01; x += cell) for (let y = y0; y + cell <= y1 + 0.01; y += cell) {
    if (free(x + cell / 2, y + cell / 2)) continue;
    th.push({ x: x + 1.5, y: y + 1.5, z: T, w: cell - 3, d: cell - 3, h: 3.2 + r() * hmax, floors: true });
  }
}

type Draw = (s: Scene) => void;

const DRAW: Record<string, Draw> = {
  "river-branching": (s) => {
    ground(s, 110, 90);
    const z = T + 0.1, trunkX = 55, th: Thing[] = [];
    s.line([[trunkX, 0, z], [trunkX, 90, z]], WATER, 5, { cap: "butt" });
    for (const y of [18, 45, 72]) for (const side of [-1, 1]) {
      const end = trunkX + side * 46;
      s.line([[trunkX, y, z], [end, y - 6, z]], WATER, 2.6);
      for (const t of [0.35, 0.65, 0.95]) { const bx = trunkX + side * 46 * t, by = y - 6 * t; s.line([[bx, by, z], [bx + side * 4, by - 9, z]], WATER, 1.1); }
    }
    s.label([trunkX, 86, z], "one main drain", { dx: 18, dy: 6 });
    s.label([trunkX + 46, 39, z], "3 to 5 branches at each step", { dx: 6, dy: -24, anchor: "end" });
    s.things(th);
  },
  murray: (s) => {
    ground(s, 100, 70);
    const z = T + 0.1, p = 7.4, c = p / Math.cbrt(2);
    s.line([[10, 35, z], [50, 35, z]], WATER, p * 1.5, { cap: "butt" });
    s.line([[50, 35, z], [90, 14, z]], WATER, c * 1.5, { cap: "butt" });
    s.line([[50, 35, z], [90, 56, z]], WATER, c * 1.5, { cap: "butt" });
    s.label([22, 35, z], "parent", { dx: -6, dy: 22, strong: true });
    s.label([80, 52, z], "branches: each 79% as wide", { dx: 4, dy: 22 });
    s.label([50, 35, z], "parent³ = sum of branches³", { dx: 10, dy: -34 });
  },
  meander: (s) => {
    ground(s, 120, 80);
    const z = T + 0.1, pts: P3[] = [];
    for (let x = 0; x <= 120; x += 3) pts.push([x, 40 + 14 * Math.sin((x / 120) * Math.PI * 2 * 1.6), z]);
    s.line(pts, GREEN_L, 34, { cap: "butt" });
    s.line(pts, WATER, 3.2);
    const th: Thing[] = [];
    blocks(s, th, 0, 0, 120, 80, 12, (x, y) => Math.abs(y - 40) < 31);
    s.things(th);
    s.label([60, 40, z], "a bend every 11 channel widths", { dx: 0, dy: -46, anchor: "middle" });
    s.label([100, 30, z], "buildings clear of the whole belt", { dx: 8, dy: 28 });
  },
  "wetland-share": (s) => {
    const W = 100, D = 80;
    s.terrain(10, 8, 10, (i, j) => 6 + Math.abs(j - 4) * 1.6 + i * 0.3, () => "var(--pc-street-ground)", { level: 7.4, fill: WATER });
    const th: Thing[] = [];
    for (let i = 0; i < 10; i++) for (const j of [0, 1, 6, 7]) th.push({ x: i * 10 + 2, y: j * 10 + 2, z: 6 + Math.abs(j + 0.5 - 4) * 1.6 + i * 0.3, w: 6, d: 6, h: 4 + ((i * 7 + j) % 4) * 2.5, floors: true });
    s.things(th);
    s.label([30, 40, 8], "5 to 10% kept wet, in the low ground", { dx: -10, dy: -40 });
    void W; void D;
  },
  "forest-soil": (s) => {
    ground(s, 70, 56);
    s.poly([[2, 30, T + 0.1], [68, 30, T + 0.1], [68, 54, T + 0.1], [2, 54, T + 0.1]], GREEN_L);
    const th: Thing[] = [{ x: 14, y: 8, z: T, w: 30, d: 18, h: 9.6, floors: true }];
    for (const [x, y] of [[10, 40], [24, 46], [40, 38], [56, 46], [60, 34]] as Pt[]) th.push({ kind: "tree", x, y, z: T, s: 3 });
    s.things(th);
    s.poly([[16, 10, T + 9.7], [42, 10, T + 9.7], [42, 24, T + 9.7], [16, 24, T + 9.7]], GREEN);
    s.poly([[50, 10, T + 0.15], [64, 10, T + 0.15], [64, 24, T + 0.15], [50, 24, T + 0.15]], WATER);
    rain(s, 0, 0, 70, 56, 24, 40);
    s.label([57, 17, T], "70% of the year's rain held on the plot", { dx: 4, dy: 36 });
  },
  "ponds-in-series": (s) => {
    for (let i = 0; i < 4; i++) {
      const z = 16 - i * 4, x = i * 26;
      s.slab(x, 0, 0, 26, 40, z);
      s.poly([[x + 4, 8, z + 0.1], [x + 22, 8, z + 0.1], [x + 22, 32, z + 0.1], [x + 4, 32, z + 0.1]], WATER);
      if (i < 3) s.arrow([x + 22, 20, z + 1], [x + 30, 20, z - 3], WATER);
    }
    s.label([13, 20, 16], "each pond spills to the next", { dx: 0, dy: -30 });
    s.label([91, 20, 4], "the storm arrives later, lower", { dx: 0, dy: 30, anchor: "middle" });
  },
  riparian: (s) => {
    ground(s, 120, 80);
    const z = T + 0.1;
    s.poly([[0, 22, z], [120, 22, z], [120, 58, z], [0, 58, z]], GREEN_L);
    s.line([[0, 40, z + 0.1], [120, 40, z + 0.1]], WATER, 5, { cap: "butt" });
    const th: Thing[] = [];
    for (let x = 4; x < 120; x += 9) th.push({ kind: "tree", x, y: 28 + (x % 3), z: T, s: 2.6 }, { kind: "tree", x: x + 4, y: 51 - (x % 4), z: T, s: 2.6 });
    blocks(s, th, 0, 0, 120, 80, 12, (_x, y) => y > 20 && y < 60, 4);
    s.things(th);
    s.label([110, 52, z], "15 to 45 m planted each side", { dx: 6, dy: 26 });
  },
  mangrove: (s) => {
    s.slab(0, 0, 0, 120, 30, 0.6, "var(--pc-sea)");
    ground(s, 120, 0.01);
    s.slab(0, 30, 0, 120, 30, T, GREEN_L);
    s.slab(0, 60, 0, 120, 28, T);
    const th: Thing[] = [], r = rng(9);
    for (let i = 0; i < 46; i++) th.push({ kind: "tree", x: r() * 118 + 1, y: 32 + r() * 26, z: T, s: 2.2 + r() });
    for (let x = 4; x < 116; x += 14) th.push({ x, y: 66, z: T, w: 10, d: 10, h: 6 + (x % 3) * 3, floors: true });
    s.things(th);
    s.label([10, 12, 0.6], "waves", { dx: -4, dy: -14 });
    s.label([110, 45, T], "100 to 500 m of mangrove", { dx: 10, dy: 30 });
  },
  "canopy-cooling": (s) => {
    ground(s, 90, 90);
    const th: Thing[] = [], r = rng(12);
    s.street([[0, 45, T + 0.1], [90, 45, T + 0.1]], 8);
    blocks(s, th, 0, 0, 90, 90, 15, (x, y) => Math.abs(y - 45) < 8 || (x + y) % 30 < 15, 3, 6);
    for (let i = 0; i < 40; i++) { const x = r() * 88 + 1, y = r() * 88 + 1; if (Math.abs(y - 45) > 5) th.push({ kind: "tree", x, y, z: T, s: 3.4 }); }
    for (let x = 4; x < 90; x += 8) th.push({ kind: "tree", x, y: 39, z: T, s: 3.4 }, { kind: "tree", x: x + 3, y: 51, z: T, s: 3.4 });
    s.things(th, { x0: 0, y0: 0, x1: 90, y1: 90 });
    s.label([80, 80, T], "about 40% of the block under trees", { dx: 4, dy: 22 });
  },
  "forest-edge": (s) => {
    ground(s, 100, 100);
    s.slab(10, 10, T, 80, 80, 0.5, GREEN_L);
    s.slab(30, 30, T + 0.5, 40, 40, 0.5, GREEN);
    const th: Thing[] = [], r = rng(5);
    for (let i = 0; i < 70; i++) { const x = 12 + r() * 76, y = 12 + r() * 76; th.push({ kind: "tree", x, y, z: T + 0.5, s: 2.6 }); }
    s.things(th);
    s.label([12, 50, T], "edge: sun and dry air reach 30 to 60 m in", { dx: -10, dy: -44, anchor: "end" });
    s.label([50, 50, T + 1], "a cool core only if wider than twice that", { dx: 30, dy: 70 });
  },
  "forest-layers": (s) => {
    ground(s, 100, 70);
    const th: Thing[] = [
      { x: 10, y: 10, z: T, w: 14, d: 14, h: 38, floors: true, fill: B(4) },
      { x: 34, y: 8, z: T, w: 22, d: 18, h: 19, floors: true, fill: B(2) },
      { x: 64, y: 12, z: T, w: 20, d: 16, h: 16, floors: true, fill: B(2) },
      { x: 12, y: 40, z: T, w: 18, d: 14, h: 6.4, floors: true, fill: B(1) },
      { x: 40, y: 42, z: T, w: 16, d: 14, h: 6.4, floors: true, fill: B(1) },
      { x: 70, y: 44, z: T, w: 16, d: 12, h: 3.2, fill: B(0) },
    ];
    for (const [x, y] of [[32, 36], [60, 36], [86, 36], [34, 62], [62, 62], [90, 60]] as Pt[]) th.push({ kind: "tree", x, y, z: T, s: 4 });
    s.things(th);
    s.label([17, 17, 40], "emergent", { dx: -14, dy: -8, anchor: "end" });
    s.label([45, 17, 21], "canopy", { dx: 26, dy: -22 });
    s.label([48, 49, 8], "understorey", { dx: 30, dy: 24 });
    s.label([78, 50, 4], "floor", { dx: 22, dy: 22 });
  },
  corridor: (s) => {
    ground(s, 120, 80);
    const z = T + 0.1;
    s.poly([[4, 6, z], [34, 6, z], [34, 34, z], [4, 34, z]], GREEN_L);
    s.poly([[86, 46, z], [116, 46, z], [116, 76, z], [86, 76, z]], GREEN_L);
    s.line([[30, 30, z], [60, 40, z], [90, 50, z]], GREEN_L, 14);
    const th: Thing[] = [], r = rng(8);
    for (let i = 0; i < 26; i++) th.push({ kind: "tree", x: 6 + r() * 26, y: 8 + r() * 24, z: T, s: 2.4 }, { kind: "tree", x: 88 + r() * 26, y: 48 + r() * 26, z: T, s: 2.4 });
    for (let t = 0; t <= 1; t += 0.1) th.push({ kind: "tree", x: 30 + 60 * t, y: 30 + 20 * t, z: T, s: 2.2 });
    blocks(s, th, 0, 0, 120, 80, 14, (x, y) => (x < 38 && y < 38) || (x > 82 && y > 42) || Math.abs(y - (30 + (x - 30) / 3)) < 12, 2);
    s.things(th);
    s.label([60, 40, T], "parks joined by a green path", { dx: 0, dy: -50, anchor: "middle" });
  },
  "termite-breathing": (s) => {
    ground(s, 80, 60);
    s.box({ x: 16, y: 14, z: T, w: 40, d: 34, h: 22, floors: true });
    s.box({ x: 56, y: 22, z: T, w: 6, d: 18, h: 36, fill: HEAT });
    s.arrow([59, 31, 12], [59, 31, 46], "var(--pc-ink)");
    sun(s, [76, 4, 56]);
    s.label([59, 31, 40], "sunlit shaft: air up by day", { dx: 14, dy: -6 });
    s.label([30, 40, 12], "heavy core, flushed at night", { dx: -10, dy: 30, anchor: "end" });
  },

  "burrow-wind": (s) => {
    ground(s, 90, 56);
    s.box({ x: 14, y: 14, z: T, w: 60, d: 30, h: 10, floors: true });
    s.box({ x: 56, y: 20, z: T + 10, w: 16, d: 18, h: 9, fill: B(2) });
    s.arrow([-6, 29, 6], [14, 29, 6], "var(--pc-ink)");
    s.arrow([64, 29, 19], [84, 29, 32], "var(--pc-ink)");
    s.label([-6, 29, 6], "air in, low", { dx: -4, dy: 14, anchor: "end" });
    s.label([84, 29, 32], "out high, in the wind", { dx: 6, dy: -4 });
  },

  "cactus-ribs": (s) => {
    ground(s, 80, 56);
    s.box({ x: 14, y: 10, z: T, w: 52, d: 32, h: 20, floors: true });
    for (let x = 16; x < 66; x += 5) s.box({ x, y: 42, z: T, w: 1.2, d: 4, h: 20, fill: B(1) });
    sun(s, [-30, 90, 50]);
    s.label([40, 46, 20], "fins: wall partly in its own shade", { dx: 0, dy: -40, anchor: "middle" });
  },

  "elephant-skin": (s) => {
    ground(s, 70, 44);
    s.box({ x: 8, y: 12, z: T, w: 54, d: 8, h: 20, fill: "var(--pc-existing)" });
    for (let x = 10; x < 62; x += 3) s.line([[x, 20, T + 1], [x + 1, 20, T + 19]], WATER, 1, { opacity: 0.8 });
    for (let z = T + 3; z < T + 20; z += 3) s.line([[8, 20, z], [62, 20, z]], WATER, 0.7, { opacity: 0.6 });
    s.label([50, 20, 10], "grooves hold water, cool as it dries", { dx: 10, dy: 34 });
  },

  "silver-ant": (s) => {
    ground(s, 80, 56);
    s.box({ x: 14, y: 12, z: T, w: 50, d: 32, h: 14, floors: true });
    sun(s, [4, 4, 50]);
    s.arrow([8, 8, 42], [32, 26, 17], HEAT);
    s.arrow([38, 30, 17], [70, 6, 56], "var(--pc-ink-2)");
    s.label([60, 40, 16], "a white roof sends the sun back", { dx: 6, dy: 30 });
  },

  "leaf-size": (s) => {
    ground(s, 120, 50);
    s.box({ x: 12, y: 14, z: T, w: 32, d: 22, h: 7 });
    s.poly([[6, 8, T + 9], [50, 8, T + 9], [50, 42, T + 9], [6, 42, T + 9]], B(2));
    s.box({ x: 74, y: 14, z: T, w: 32, d: 22, h: 10 });
    for (let x = 75; x < 106; x += 1.6) s.line([[x, 36.2, T + 1], [x, 36.2, T + 9]], "var(--pc-ink)", 0.5, { opacity: 0.5 });
    for (let z = T + 1.5; z < T + 9; z += 1.6) s.line([[74, 36.2, z], [106, 36.2, z]], "var(--pc-ink)", 0.5, { opacity: 0.5 });
    s.label([28, 40, T + 9], "hot and wet: big roofs, deep eaves", { dx: 0, dy: 30, anchor: "middle" });
    s.label([90, 36, T + 2], "hot and dry: fine screens", { dx: 0, dy: 34, anchor: "middle" });
  },
  stomata: (s) => {
    ground(s, 70, 44);
    s.box({ x: 8, y: 10, z: T, w: 54, d: 16, h: 22 });
    for (let i = 0; i < 8; i++) for (let j = 0; j < 4; j++) {
      const open = (i + j) % 3 === 0, x = 10.5 + i * 6.5, z = T + 2 + j * 5;
      s.poly([[x, 26.1, z], [x + 4.4, 26.1, z], [x + 4.4, 26.1, z + 3.6], [x, 26.1, z + 3.6]], open ? "var(--pc-ink)" : B(1));
    }
    s.label([40, 26, 4], "shut at noon, open at night", { dx: 10, dy: 30 });
  },

  "weaver-nest": (s) => {
    ground(s, 80, 70);
    const th: Thing[] = [{ x: 24, y: 24, z: T, w: 32, d: 22, h: 6.4, fill: B(2) }];
    for (const [x, y, w, d] of [[10, 10, 60, 12], [10, 22, 12, 26], [58, 22, 12, 26], [10, 48, 60, 12]] as [number, number, number, number][]) th.push({ x, y, z: T, w, d, h: 6.4, floors: true });
    s.things(th);
    s.label([40, 35, T + 6.4], "rooms in the middle", { dx: 0, dy: -50, anchor: "middle", strong: true });
    s.label([64, 54, T + 6.4], "stores and verandahs take the heat", { dx: 6, dy: 30 });
  },

  huddle: (s) => {
    ground(s, 130, 50);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) s.box({ x: 86 + i * 9, y: 10 + j * 14, z: T, w: 9, d: 14, h: 6.4, floors: true, fill: B(1) });
    for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) s.box({ x: 12 + i * 12, y: 10 + j * 18, z: T, w: 7, d: 12, h: 6.4, style: "ghost" });
    s.label([30, 30, 6], "apart", { dx: 0, dy: 34, anchor: "middle" });
    s.label([104, 30, 6], "walls shared", { dx: 0, dy: 34, anchor: "middle" });
  },
  "tree-shade": (s) => {
    ground(s, 70, 60);
    const th: Thing[] = [{ x: 4, y: 4, z: T, w: 62, d: 10, h: 9.6, floors: true }, { x: 4, y: 14, z: T, w: 10, d: 42, h: 9.6, floors: true }];
    for (const [x, y] of [[30, 30], [48, 40], [36, 48], [54, 24]] as Pt[]) th.push({ kind: "tree", x, y, z: T, s: 6 });
    s.things(th, { x0: 0, y0: 0, x1: 70, y1: 60 });
    s.label([42, 36, T], "shade above, air below", { dx: 16, dy: 34 });
  },
  phyllotaxis: (s) => {
    ground(s, 60, 60);
    const cx = 30, cy = 30, w = 22, d = 10;
    for (let k = 0; k < 7; k++) {
      const a = (k * 137.5 * Math.PI) / 180, c = Math.cos(a), sn = Math.sin(a);
      const ring: Pt[] = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]].map(([x, y]): Pt => [cx + x * c - y * sn, cy + x * sn + y * c]);
      prism(s, [[cx - 3, cy - 3], [cx + 3, cy - 3], [cx + 3, cy + 3], [cx - 3, cy + 3]], T + k * 3.2, 3.2, B(1));
      prism(s, ring, T + k * 3.2 + 2.6, 0.6, k === 6 ? B(2) : "var(--pc-surface)");
    }
    s.label([cx, cy, T + 24], "each floor turned 137.5°", { dx: 0, dy: -20, anchor: "middle" });
  },
  "fog-catch": (s) => {
    ground(s, 80, 56);
    s.box({ x: 14, y: 16, z: T, w: 50, d: 28, h: 12, floors: true });
    for (let x = 16; x <= 62; x += 2.5) s.line([[x, 16, T + 12], [x, 16, T + 26]], "var(--pc-ink-2)", 0.5);
    for (let z = T + 12.5; z <= T + 26; z += 2.5) s.line([[16, 16, z], [62, 16, z]], "var(--pc-ink-2)", 0.5);
    s.arrow([40, -24, 22], [40, 12, 20], WATER);
    s.label([62, 16, T + 24], "a net across the fog", { dx: 10, dy: -8 });
  },

  "tree-branching": (s) => {
    ground(s, 70, 60);
    const zr = T + 14;
    for (const [x, y] of [[22, 20], [48, 40]] as Pt[]) {
      s.line([[x, y, T], [x, y, T + 7]], "var(--pc-ink)", 2.4);
      for (const [dx, dy] of [[-8, -6], [8, -6], [-8, 6], [8, 6]]) s.line([[x, y, T + 7], [x + dx, y + dy, zr]], "var(--pc-ink)", 1.4);
    }
    s.poly([[6, 6, zr], [64, 6, zr], [64, 54, zr], [6, 54, zr]], lighter(B(1), 0.2));
    s.label([48, 40, T + 4], "trunks split; area kept at each split", { dx: 22, dy: 30 });
  },
  "lily-ribs": (s) => {
    ground(s, 70, 70);
    const cx = 35, cy = 35, R = 28, z = T + 8, ring: P3[] = [];
    for (let i = 0; i < 32; i++) { const a = (i / 32) * Math.PI * 2; ring.push([cx + R * Math.cos(a), cy + R * Math.sin(a), z]); }
    for (const [x, y] of [[cx, cy], [cx + 14, cy], [cx, cy + 14], [cx - 14, cy], [cx, cy - 14]] as Pt[]) s.line([[x, y, T], [x, y, z]], "var(--pc-ink)", 1);
    s.poly(ring, lighter(GREEN, 0.3));
    for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; s.line([[cx, cy, z + 0.1], [cx + R * Math.cos(a), cy + R * Math.sin(a), z + 0.1]], darker(GREEN, 0.3), 1); }
    for (const r of [10, 19]) { const c: P3[] = []; for (let i = 0; i <= 32; i++) { const a = (i / 32) * Math.PI * 2; c.push([cx + r * Math.cos(a), cy + r * Math.sin(a), z + 0.1]); } s.line(c, darker(GREEN, 0.3), 0.6); }
    s.label([cx + R, cy, z], "deep ribs out from the centre, tied across", { dx: 16, dy: 20 });
  },
  "three-thirty-three-hundred": (s) => {
    ground(s, 130, 50);
    s.box({ x: 8, y: 16, z: T, w: 14, d: 14, h: 9.6, floors: true, fill: B(2) });
    const th: Thing[] = [{ kind: "tree", x: 28, y: 14, z: T, s: 3 }, { kind: "tree", x: 30, y: 24, z: T, s: 3 }, { kind: "tree", x: 27, y: 34, z: T, s: 3 }];
    s.poly([[96, 6, T + 0.1], [126, 6, T + 0.1], [126, 44, T + 0.1], [96, 44, T + 0.1]], GREEN_L);
    for (let i = 0; i < 8; i++) th.push({ kind: "tree", x: 100 + (i % 4) * 7, y: 12 + Math.floor(i / 4) * 18, z: T, s: 3 });
    s.things(th);
    s.line([[22, 46, T + 0.2], [96, 46, T + 0.2]], "var(--pc-ink)", 0.8, { dash: "3 2" });
    s.groundText([59, 48, T + 0.2], "300 m or less", "x", { size: 7 });
    s.label([30, 24, T + 6], "3 trees in view", { dx: 0, dy: -34, anchor: "middle" });
  },
  fractal: (s) => {
    ground(s, 110, 30);
    const r = rng(17), th: Thing[] = [];
    let x = 4;
    while (x < 104) {
      const w = 6 + r() * 10, big = 6 + r() * 22;
      th.push({ x, y: 8, z: T, w, d: 14, h: big, floors: true, fill: B(Math.min(4, Math.floor(big / 7))) });
      if (r() < 0.6) th.push({ x: x + w * 0.2, y: 10, z: T + big, w: w * 0.5, d: 8, h: 2 + r() * 5, fill: B(1) });
      x += w + 0.4;
    }
    s.things(th);
    s.label([60, 15, 30], "varied at every scale, like a tree line (D 1.3 to 1.5)", { dx: 0, dy: -24, anchor: "middle" });
  },
  "prospect-refuge": (s) => {
    ground(s, 80, 60);
    s.box({ x: 6, y: 6, z: T, w: 68, d: 10, h: 9.6, floors: true });
    s.box({ x: 6, y: 16, z: T + 3.6, w: 68, d: 5, h: 0.6, fill: B(2) });
    for (let x = 8; x < 74; x += 8) s.line([[x, 21, T], [x, 21, T + 3.6]], "var(--pc-ink)", 0.9);
    s.poly([[8, 28, T + 0.1], [72, 28, T + 0.1], [72, 56, T + 0.1], [8, 56, T + 0.1]], GREEN_L);
    s.things([{ kind: "tree", x: 40, y: 44, z: T, s: 5 }]);
    s.label([40, 18, T + 2], "back covered, a roof overhead", { dx: -40, dy: -40, anchor: "end" });
    s.label([60, 44, T], "looking out over open ground", { dx: 20, dy: 30 });
  },
  "water-in-view": (s) => {
    ground(s, 90, 70);
    const ring: P3[] = [];
    for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; ring.push([45 + 22 * Math.cos(a), 38 + 13 * Math.sin(a), T + 0.1]); }
    s.poly(ring, WATER);
    const th: Thing[] = [];
    for (let x = 6; x < 84; x += 13) th.push({ x, y: 4, z: T, w: 10, d: 10, h: 6 + (x % 3) * 3, floors: true });
    for (let x = 12; x < 84; x += 12) th.push({ kind: "tree", x, y: 62, z: T, s: 2.6 });
    s.things(th);
    s.line([[10, 20, T + 0.2], [80, 20, T + 0.2]], "var(--pc-street)", 3);
    s.label([45, 38, T], "the tank opened to paths and windows", { dx: 20, dy: 40 });
  },
};

/** The gene's diagram, or a plain ground when it has none yet. */
export function drawGene(id: string, title: string): string {
  const s = new Scene(`gene-${id}`);
  (DRAW[id] ?? ((x: Scene) => ground(x, 60, 40)))(s);
  return s.svg(title);
}
export const hasDiagram = (id: string) => id in DRAW;
