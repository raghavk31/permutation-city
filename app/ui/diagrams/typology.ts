// Drawings of the typology library (ui/typologies): a precedent's seed built by the grammar
// (engine/typology/grammar.ts) and drawn in the diagrams' projection and style (iso.ts):
// paper buildings with hairline edges, water and planting in their map colours, a plot of
// ground under them and a 10 m bar. Every drawing is at one scale in world units; the page
// scales the SVG to its frame and states the scale with the bar.
import { build, type Params, type Solid } from "../../engine/typology/grammar";
import { Scene, esc, f, iso, pts, type P3 } from "./iso";

type Pt = [number, number];
const PAPER = { top: "var(--pc-surface)", lit: "color-mix(in srgb, var(--pc-ink) 4%, var(--pc-surface))", dark: "color-mix(in srgb, var(--pc-ink) 13%, var(--pc-surface))" };
const EDGE = `stroke="var(--pc-ink)" stroke-opacity=".5" stroke-width=".55" stroke-linejoin="round"`;
const GROUND = "color-mix(in srgb, var(--pc-ink) 3%, var(--pc-surface-2))";
const CUT = "color-mix(in srgb, var(--pc-ink) 18%, var(--pc-surface-2))";

const fillOf = (s: Solid) =>
  s.use === "water" ? { top: "var(--pc-water)", lit: "var(--pc-water)", dark: "var(--pc-water)" }
  : s.use === "green" ? { top: "var(--pc-green-light)", lit: "color-mix(in srgb, var(--pc-green) 70%, var(--pc-surface))", dark: "color-mix(in srgb, var(--pc-green) 85%, var(--pc-ink))" }
  : s.use === "ground" ? { top: GROUND, lit: CUT, dark: CUT }
  : s.use === "canopy" ? { top: "color-mix(in srgb, var(--pc-ink) 70%, var(--pc-surface))", lit: "var(--pc-ink-2)", dark: "var(--pc-ink)" }
  : PAPER;

/** Shade of a vertical face by its outward normal: faces toward +y are lit, toward +x dark. */
const sideShade = (nx: number, ny: number, c: ReturnType<typeof fillOf>) => {
  const t = Math.max(0, Math.min(1, (nx - ny + 1) / 2));
  return t < 0.5 ? c.lit : c.dark;
};

const centroid = (r: Pt[]): Pt => [r.reduce((a, p) => a + p[0], 0) / r.length, r.reduce((a, p) => a + p[1], 0) / r.length];

class Drawing {
  out: string[] = [];
  constructor(private s: Scene) {}
  poly(p: P3[], fill: string, edge = true) {
    // Scene.poly keeps the bounds; the edge is drawn here for a crisper line.
    this.s.poly(p, fill, edge ? false : fill);
    if (edge) this.s.raw(0, 0, 0, 0, `<polygon points="${pts(p.map(iso))}" fill="none" ${EDGE}/>`);
  }

  /** A prism: visible walls back to front, then its roof. */
  prism(s: Solid) {
    const c = fillOf(s), r = s.ring as Pt[], z0 = s.z, z1 = s.z + s.h, n = r.length;
    const sides: { d: number; draw: () => void }[] = [];
    for (let i = 0; i < n; i++) {
      const a = r[i], b = r[(i + 1) % n], ex = b[0] - a[0], ey = b[1] - a[1], L = Math.hypot(ex, ey) || 1;
      const nx = ey / L, ny = -ex / L; // outward for an anticlockwise ring in y-down world
      const out = ringSign(r) > 0 ? [nx, ny] : [-nx, -ny];
      if (out[0] + out[1] <= 0.001 || s.h <= 0.01) continue; // faces away from the viewer
      sides.push({ d: a[0] + a[1] + b[0] + b[1], draw: () => this.poly([[a[0], a[1], z0], [b[0], b[1], z0], [b[0], b[1], z1], [a[0], a[1], z1]], sideShade(out[0], out[1], c)) });
    }
    sides.sort((p, q) => p.d - q.d).forEach((x) => x.draw());
    this.roof(s, r, z1, c);
  }

  roof(s: Solid, r: Pt[], z: number, c: ReturnType<typeof fillOf>) {
    const kind = s.use === "built" ? s.roof ?? "flat" : "flat";
    const [cx, cy] = centroid(r);
    if (kind === "flat" || (kind !== "cone" && kind !== "dome" && r.length !== 4)) {
      this.poly(r.map(([x, y]): P3 => [x, y, z]), c.top);
      return;
    }
    if (kind === "cone" || kind === "dome") {
      const R = Math.max(...r.map(([x, y]) => Math.hypot(x - cx, y - cy)));
      const H = kind === "cone" ? R * 0.9 : R * 0.75, tiers = kind === "cone" ? 1 : 3;
      const rings = Array.from({ length: tiers + 1 }, (_, k) => {
        const t = k / tiers, rr = kind === "cone" ? 1 - t : Math.cos((t * Math.PI) / 2), zz = kind === "cone" ? z + H * t : z + H * Math.sin((t * Math.PI) / 2);
        return r.map(([x, y]): P3 => [cx + (x - cx) * rr, cy + (y - cy) * rr, zz]);
      });
      const faces: { d: number; p: P3[]; fill: string }[] = [];
      for (let k = 0; k < tiers; k++) for (let i = 0; i < r.length; i++) {
        const j = (i + 1) % r.length, p = [rings[k][i], rings[k][j], rings[k + 1][j], rings[k + 1][i]];
        const mx = (p[0][0] + p[1][0]) / 2 - cx, my = (p[0][1] + p[1][1]) / 2 - cy;
        if (mx + my < -0.3 * R && k === 0) continue;
        faces.push({ d: p[0][0] + p[0][1] + p[1][0] + p[1][1] + k, p, fill: mx - my > 0 ? c.dark : c.lit });
      }
      faces.sort((a, b) => a.d - b.d).forEach((x) => this.poly(x.p, x.fill));
      return;
    }
    // gable or vault over a quadrilateral: the ridge along the longer pair of sides
    const e0 = Math.hypot(r[1][0] - r[0][0], r[1][1] - r[0][1]), e1 = Math.hypot(r[2][0] - r[1][0], r[2][1] - r[1][1]);
    const q = e0 >= e1 ? r : [r[1], r[2], r[3], r[0]];
    const span = Math.min(e0, e1), H = kind === "vault" ? span * 0.5 : span * 0.35;
    const mid = (a: Pt, b: Pt): Pt => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const m0 = mid(q[0], q[3]), m1 = mid(q[1], q[2]);
    const ridge: [P3, P3] = [[m0[0], m0[1], z + H], [m1[0], m1[1], z + H]];
    if (kind === "vault") {
      const segs = 4, prof = (t: number) => Math.sin(t * Math.PI);
      const at = (a: Pt, b: Pt, t: number): P3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, z + H * prof(t)];
      const strips: { d: number; p: P3[]; fill: string }[] = [];
      for (let k = 0; k < segs; k++) {
        const t0 = k / segs, t1 = (k + 1) / segs;
        const p = [at(q[0], q[3], t0), at(q[1], q[2], t0), at(q[1], q[2], t1), at(q[0], q[3], t1)];
        strips.push({ d: p.reduce((a, v) => a + v[0] + v[1], 0) + 100 * (t0 < 0.5 ? 0 : 0), p, fill: t0 < 0.5 ? c.lit : c.top });
      }
      strips.sort((a, b) => a.d - b.d).forEach((x) => this.poly(x.p, x.fill));
      return;
    }
    const slopes = [
      { p: [[q[0][0], q[0][1], z], [q[1][0], q[1][1], z], ridge[1], ridge[0]] as P3[] },
      { p: [[q[3][0], q[3][1], z], [q[2][0], q[2][1], z], ridge[1], ridge[0]] as P3[] },
    ];
    const ends = [
      { p: [[q[0][0], q[0][1], z], [q[3][0], q[3][1], z], ridge[0]] as P3[] },
      { p: [[q[1][0], q[1][1], z], [q[2][0], q[2][1], z], ridge[1]] as P3[] },
    ];
    const depth = (p: P3[]) => p.reduce((a, v) => a + v[0] + v[1], 0) / p.length;
    [...slopes.map((x) => ({ ...x, fill: PAPER.lit })), ...ends.map((x) => ({ ...x, fill: PAPER.dark }))]
      .sort((a, b) => depth(a.p) - depth(b.p))
      .forEach((x, i) => this.poly(x.p, i === 3 ? PAPER.top : x.fill));
  }
}

const ringSign = (r: Pt[]) => { let s = 0; for (let i = 0; i < r.length; i++) { const a = r[i], b = r[(i + 1) % r.length]; s += a[0] * b[1] - a[1] * b[0]; } return s; };

/** A pit (stepwell, kalyani, cave court): its levels from the deepest up, each with the far
 *  walls that a viewer looking in would see, then the ground round it on top. */
function pit(d: Drawing, levels: Solid[], water: Solid[], plot: { w: number; d: number }) {
  const sorted = [...levels].sort((a, b) => a.z - b.z);
  const box = (s: Solid) => { const xs = s.ring.map((p) => p[0]), ys = s.ring.map((p) => p[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; };
  for (let k = 0; k < sorted.length; k++) {
    const s = sorted[k], [x0, y0, x1, y1] = box(s), z = s.z + s.h, zTop = k + 1 < sorted.length ? sorted[k + 1].z + sorted[k + 1].h : 0;
    d.poly([[x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]], GROUND);
    if (k === 0) for (const w of water) d.poly(w.ring.map(([x, y]): P3 => [x, y, w.z + w.h]), "var(--pc-water)");
    // the far walls, from this level up to the next
    d.poly([[x0, y0, z], [x1, y0, z], [x1, y0, zTop], [x0, y0, zTop]], CUT);
    d.poly([[x0, y0, z], [x0, y1, z], [x0, y1, zTop], [x0, y0, zTop]], "color-mix(in srgb, var(--pc-ink) 10%, var(--pc-surface-2))");
  }
  // the ground round the pit: far strips, then near strips, which hide the pit's near side
  const top = sorted.length ? box(sorted[sorted.length - 1]) : [0, 0, plot.w, plot.d];
  const [X0, Y0, X1, Y1] = top, m = 6, depth = sorted.length ? sorted[0].z : 0;
  const strip = (x0: number, y0: number, x1: number, y1: number) => {
    d.poly([[x0, y0, 0], [x1, y0, 0], [x1, y1, 0], [x0, y1, 0]], GROUND);
  };
  strip(X0 - m, Y0 - m, X1 + m, Y0); strip(X0 - m, Y0, X0, Y1);
  strip(X1, Y0, X1 + m, Y1); strip(X0 - m, Y1, X1 + m, Y1 + m);
  // the ground cut away at the near edges down to the pit's floor, as in a section model
  d.poly([[X1 + m, Y0 - m, 0], [X1 + m, Y1 + m, 0], [X1 + m, Y1 + m, depth], [X1 + m, Y0 - m, depth]], CUT);
  d.poly([[X0 - m, Y1 + m, 0], [X1 + m, Y1 + m, 0], [X1 + m, Y1 + m, depth], [X0 - m, Y1 + m, depth]], "color-mix(in srgb, var(--pc-ink) 10%, var(--pc-surface-2))");
}

export interface TypologyDrawing { svg: string; fsi: number; gsi: number; floorArea: number; plot: { w: number; d: number } }

/** The drawing of one seed. */
export function drawTypology(p: Params, title: string): TypologyDrawing {
  const b = build(p), s = new Scene(`ty-${title.replace(/\W+/g, "-")}`), d = new Drawing(s);
  const below = b.solids.filter((x) => x.use === "ground" && x.z < 0), water = b.solids.filter((x) => x.use === "water" && x.z < -0.5);
  const above = b.solids.filter((x) => !below.includes(x) && !water.includes(x));
  const { w: W, d: D } = b.plot;

  if (below.length) pit(d, below, water, b.plot);
  else d.poly([[-2, -2, 0], [W + 2, -2, 0], [W + 2, D + 2, 0], [-2, D + 2, 0]], GROUND);

  // back to front by the nearest corner, lower first
  const key = (x: Solid) => Math.max(...x.ring.map(([a, c]) => a + c)) * 0.5 + Math.min(...x.ring.map(([a, c]) => a + c)) * 0.5 + x.z * 0.01;
  for (const x of [...above].sort((a, c) => key(a) - key(c))) {
    if (x.use === "tree") s.tree({ kind: "tree", x: x.ring[0][0], y: x.ring[0][1], z: 0, s: x.h / 3 });
    else d.prism(x);
  }

  // a 10 m bar along the near edge (its label is on the page, which keeps it one size)
  const y = D + 6;
  s.line([[0, y, 0], [10, y, 0]], "var(--pc-ink)", 1.4, { cap: "butt" });
  s.line([[0, y - 1, 0], [0, y + 1, 0]], "var(--pc-ink)", 1, { cap: "butt" });
  s.line([[10, y - 1, 0], [10, y + 1, 0]], "var(--pc-ink)", 1, { cap: "butt" });
  return { svg: s.svg(esc(title)), fsi: b.fsi, gsi: b.gsi, floorArea: b.floorArea, plot: b.plot };
}

export const fmt = (n: number, k = 1) => (Number.isFinite(n) ? f(+n.toFixed(k)) : "-");
