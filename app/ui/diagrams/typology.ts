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
  : s.use === "canopy" ? { top: "color-mix(in srgb, var(--pc-ink) 35%, var(--pc-surface))", lit: "color-mix(in srgb, var(--pc-ink) 50%, var(--pc-surface))", dark: "color-mix(in srgb, var(--pc-ink) 60%, var(--pc-surface))" }
  : PAPER;

/** Shade of a vertical face by its outward normal: faces toward +y are lit, toward +x dark. */
const sideShade = (nx: number, ny: number, c: ReturnType<typeof fillOf>) => {
  const t = Math.max(0, Math.min(1, (nx - ny + 1) / 2));
  return t < 0.5 ? c.lit : c.dark;
};

const inside = (r: Pt[], x: number, y: number) => {
  let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) if ((r[i][1] > y) !== (r[j][1] > y) && x < ((r[j][0] - r[i][0]) * (y - r[i][1])) / (r[j][1] - r[i][1]) + r[i][0]) c = !c;
  return c;
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

  /** A hidden edge, dashed: what is behind or under the drawing but shapes it. */
  dashed(p: P3[]) {
    this.s.line(p, "var(--pc-ink)", 0.6, { dash: "2 1.6", opacity: 0.55, cap: "butt" });
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
    if (n > 8 && s.h > 0.01) { this.drum(s, r, z0, z1, c); this.roof(s, r, z1, c); return; }
    sides.sort((p, q) => p.d - q.d).forEach((x) => x.draw());
    this.roof(s, r, z1, c);
  }

  /** A round wall: facets shaded smoothly by their facing, with only its outline drawn, so it
   *  reads as one curved wall rather than a row of slats. */
  drum(s: Solid, r: Pt[], z0: number, z1: number, c: ReturnType<typeof fillOf>) {
    const n = r.length, sign = ringSign(r) > 0 ? 1 : -1, front: [Pt, Pt][] = [];
    const shade = (t: number) => s.use === "built" ? `color-mix(in srgb, var(--pc-ink) ${(3 + 12 * t).toFixed(1)}%, var(--pc-surface))` : t < 0.5 ? c.lit : c.dark;
    for (let i = 0; i < n; i++) {
      const a = r[i], b = r[(i + 1) % n], ex = b[0] - a[0], ey = b[1] - a[1], L = Math.hypot(ex, ey) || 1;
      const nx = (sign * ey) / L, ny = (-sign * ex) / L;
      if (nx + ny <= 0.001) continue;
      front.push([a, b]);
      this.poly([[a[0], a[1], z0], [b[0], b[1], z0], [b[0], b[1], z1], [a[0], a[1], z1]], shade(Math.max(0, Math.min(1, (nx - ny + 1) / 2))), false);
    }
    for (const [a, b] of front) {
      this.s.line([[a[0], a[1], z0], [b[0], b[1], z0]], "var(--pc-ink)", 0.55, { opacity: 0.5 });
      this.s.line([[a[0], a[1], z1], [b[0], b[1], z1]], "var(--pc-ink)", 0.55, { opacity: 0.5 });
    }
    // the two sides of the silhouette
    const sx = (p: Pt) => iso([p[0], p[1], 0])[0];
    const l = r.reduce((m, p) => (sx(p) < sx(m) ? p : m)), rr = r.reduce((m, p) => (sx(p) > sx(m) ? p : m));
    for (const p of [l, rr]) this.s.line([[p[0], p[1], z0], [p[0], p[1], z1]], "var(--pc-ink)", 0.55, { opacity: 0.5 });
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
      const H = kind === "cone" ? R * Math.tan(((s.pitch ?? 45) * Math.PI) / 180) : R * (s.pitch ? Math.tan((s.pitch * Math.PI) / 180) : 0.75), tiers = kind === "cone" ? 1 : 4;
      const rings = Array.from({ length: tiers + 1 }, (_, k) => {
        const t = k / tiers, rr = kind === "cone" ? 1 - t : Math.cos((t * Math.PI) / 2), zz = kind === "cone" ? z + H * t : z + H * Math.sin((t * Math.PI) / 2);
        return r.map(([x, y]): P3 => [cx + (x - cx) * rr, cy + (y - cy) * rr, zz]);
      });
      const faces: { d: number; p: P3[]; fill: string }[] = [];
      for (let k = 0; k < tiers; k++) for (let i = 0; i < r.length; i++) {
        const j = (i + 1) % r.length, p = [rings[k][i], rings[k][j], rings[k + 1][j], rings[k + 1][i]];
        const mx = (p[0][0] + p[1][0]) / 2 - cx, my = (p[0][1] + p[1][1]) / 2 - cy;
        if (mx + my < -0.3 * R && k === 0) continue;
        const t = Math.max(0, Math.min(1, ((mx - my) / (Math.hypot(mx, my) || 1) + 1) / 2));
        faces.push({ d: p[0][0] + p[0][1] + p[1][0] + p[1][1] + k, p, fill: r.length > 8 && s.use === "built" ? `color-mix(in srgb, var(--pc-ink) ${Math.max(1, 2 + 12 * t - 2 * k).toFixed(1)}%, var(--pc-surface))` : mx - my > 0 ? c.dark : c.lit });
      }
      // A cone over a polygon of a few sides is a pyramid: its faces keep their edges and the
      // edges behind it are drawn dashed, so it reads as a pyramid, not a flat shape. Domes and
      // round cones are sealed without hairlines, so they read smooth, not as a cage.
      const pyramid = kind === "cone" && r.length <= 8;
      faces.sort((a, b) => a.d - b.d).forEach((x) => this.poly(x.p, x.fill, pyramid));
      if (!pyramid) {
        // the outline: the front of the eave and, for a cone, its two sides to the apex
        const sx = (p: P3) => iso(p)[0];
        const base = rings[0], top = rings[tiers];
        for (let i = 0; i < r.length; i++) {
          const j = (i + 1) % r.length;
          if ((r[i][0] + r[j][0]) / 2 - cx + (r[i][1] + r[j][1]) / 2 - cy > -0.3 * R) this.s.line([base[i], base[j]], "var(--pc-ink)", 0.55, { opacity: 0.5 });
        }
        const l = base.reduce((m, p) => (sx(p) < sx(m) ? p : m)), rt = base.reduce((m, p) => (sx(p) > sx(m) ? p : m));
        if (kind === "cone") for (const p of [l, rt]) this.s.line([p, top[0]], "var(--pc-ink)", 0.55, { opacity: 0.5 });
        else for (const p of [l, rt]) { const i = base.indexOf(p); this.s.line(rings.map((q) => q[i]), "var(--pc-ink)", 0.55, { opacity: 0.5 }); }
      }
      if (pyramid) {
        const apex: P3 = [cx, cy, z + H], n = r.length;
        const hidden = r.map((_, i) => { const j = (i + 1) % n; return (r[i][0] + r[j][0]) / 2 - cx + (r[i][1] + r[j][1]) / 2 - cy < -0.3 * R; });
        for (let i = 0; i < n; i++) {
          const j = (i + 1) % n;
          if (hidden[i]) this.dashed([[r[i][0], r[i][1], z], [r[j][0], r[j][1], z]]);
          if (hidden[i] && hidden[(i + n - 1) % n]) this.dashed([[r[i][0], r[i][1], z], apex]);
        }
      }
      return;
    }
    if (kind === "mono" && r.length === 4) {
      // a roof rising from the front edge (the first side) to the back by `rise`, planted on top
      const R = s.rise ?? 3, q = r;
      const P = (i: number, up: boolean): P3 => [q[i][0], q[i][1], z + (up ? R : 0)];
      this.poly([P(1, false), P(2, false), P(2, true)], c.dark);
      this.poly([P(0, false), P(3, false), P(3, true)], c.lit);
      this.poly([P(0, false), P(1, false), P(2, true), P(3, true)], PAPER.top);
      return;
    }
    // gable or vault over a quadrilateral: the ridge along the longer pair of sides
    const e0 = Math.hypot(r[1][0] - r[0][0], r[1][1] - r[0][1]), e1 = Math.hypot(r[2][0] - r[1][0], r[2][1] - r[1][1]);
    const q = (e0 >= e1) !== !!s.ridgeShort ? r : [r[1], r[2], r[3], r[0]];
    const span = Math.min(e0, e1), H = kind === "vault" ? span * 0.5 : (span / 2) * Math.tan(((s.pitch ?? 35) * Math.PI) / 180);
    const mid = (a: Pt, b: Pt): Pt => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    let m0 = mid(q[0], q[3]), m1 = mid(q[1], q[2]);
    let ridge: [P3, P3] = [[m0[0], m0[1], z + H], [m1[0], m1[1], z + H]];
    if (kind === "saddle") {
      // a saddle: the ridge sags in the middle and its ends sweep up and out past the gables
      // (a tongkonan, a rumah gadang), drawn as two slopes each side of a raised middle
      const L = Math.hypot(m1[0] - m0[0], m1[1] - m0[1]) || 1, ux = (m1[0] - m0[0]) / L, uy = (m1[1] - m0[1]) / L, out = L * 0.18;
      const e0: P3 = [m0[0] - ux * out, m0[1] - uy * out, z + H * 2.2], e1: P3 = [m1[0] + ux * out, m1[1] + uy * out, z + H * 2.2];
      const c0: P3 = [m0[0] + ux * L * 0.35, m0[1] + uy * L * 0.35, z + H], c1: P3 = [m1[0] - ux * L * 0.35, m1[1] - uy * L * 0.35, z + H];
      const E = (pt: Pt): P3 => [pt[0], pt[1], z];
      const faces = [
        { p: [E(q[0]), E(q[1]), c1, c0], fill: PAPER.lit }, { p: [E(q[3]), E(q[2]), c1, c0], fill: PAPER.top },
        { p: [E(q[0]), c0, e0], fill: PAPER.lit }, { p: [E(q[3]), c0, e0], fill: PAPER.top },
        { p: [E(q[1]), c1, e1], fill: PAPER.lit }, { p: [E(q[2]), c1, e1], fill: PAPER.top },
        { p: [E(q[0]), E(q[3]), e0], fill: PAPER.dark }, { p: [E(q[1]), E(q[2]), e1], fill: PAPER.dark },
      ];
      const dep = (p: P3[]) => p.reduce((a, v) => a + v[0] + v[1], 0) / p.length;
      faces.sort((a, b) => dep(a.p) - dep(b.p)).forEach((x) => this.poly(x.p, x.fill));
      return;
    }
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
    // the floor of this level: whole for the deepest, a frame round the level below otherwise,
    // so the deeper levels stay in view
    if (k === 0) d.poly([[x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]], GROUND);
    else {
      const [a0, b0, a1, b1] = box(sorted[k - 1]);
      for (const [u0, v0, u1, v1] of [[x0, y0, x1, b0], [x0, b0, a0, b1], [a1, b0, x1, b1], [x0, b1, x1, y1]])
        if (u1 - u0 > 0.01 && v1 - v0 > 0.01) d.poly([[u0, v0, z], [u1, v0, z], [u1, v1, z], [u0, v1, z]], GROUND);
    }
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
  // what the near ground hides, dashed: the pit's floor and the corners running down to it
  if (sorted.length) {
    const [b0, c0, b1, c1] = box(sorted[0]), zb = sorted[0].z + sorted[0].h;
    d.dashed([[b0, c0, zb], [b1, c0, zb], [b1, c1, zb], [b0, c1, zb], [b0, c0, zb]]);
    for (const [x, y, bx, by] of [[X1, Y0, b1, c0], [X1, Y1, b1, c1], [X0, Y1, b0, c1]] as [number, number, number, number][])
      d.dashed([[x, y, 0], [bx, by, zb]]);
  }
}

/** A round bowl (Moray, a theatre): from the deepest ring up, each ring's tread as an annulus
 *  over the seating arc and the far half of its riser, then the ground round it. Rings are
 *  drawn from 48-point discs; `sweep` degrees of the circle are stepped, centred on the far
 *  side, and the rest is the flat floor at the bottom. */
function roundPit(d: Drawing, levels: Solid[], water: Solid[], sweep: number) {
  const sorted = [...levels].sort((a, b) => a.z - b.z);
  const geo = (x: Solid) => { const xs = x.ring.map((p) => p[0]); const r = (Math.max(...xs) - Math.min(...xs)) / 2; return { cx: Math.min(...xs) + r, cy: x.ring.reduce((a, p) => a + p[1], 0) / x.ring.length, r }; };
  const { cx, cy, r: R } = geo(sorted[sorted.length - 1]);
  // the arc is centred on the far side (toward -x -y, away from the viewer)
  const mid = (5 * Math.PI) / 4, half = (Math.min(360, sweep) * Math.PI) / 360, N = 48;
  const arc = (r: number, z: number, a0: number, a1: number): P3[] => Array.from({ length: N + 1 }, (_, i) => { const a = a0 + ((a1 - a0) * i) / N; return [cx + r * Math.cos(a), cy + r * Math.sin(a), z]; });
  const zb = sorted[0].z + sorted[0].h;
  // the floor
  d.poly(arc(geo(sorted[0]).r, zb, 0, 2 * Math.PI), GROUND);
  for (const w of water) d.poly(w.ring.map(([x, y]): P3 => [x, y, w.z + w.h]), "var(--pc-water)");
  for (let k = 1; k < sorted.length; k++) {
    const r0 = geo(sorted[k - 1]).r, r1 = geo(sorted[k]).r, z0 = sorted[k - 1].z + sorted[k - 1].h, z1 = sorted[k].z + sorted[k].h;
    const a0 = mid - half, a1 = mid + half;
    // the riser at r0 from z0 to z1: its far side faces the viewer
    const fa0 = Math.max(a0, Math.PI / 4 + 0.001), fa1 = Math.min(a1, (9 * Math.PI) / 4 - 0.001);
    if (fa1 > fa0) d.poly([...arc(r0, z0, fa0, fa1), ...arc(r0, z1, fa0, fa1).reverse()], CUT, false);
    d.poly([...arc(r1, z1, a0, a1), ...arc(r0, z1, a0, a1).reverse()], GROUND);
  }
  // the ground round the bowl: a square with the bowl cut out
  const m = 6, zt = 0, sq: P3[] = [[cx - R - m, cy - R - m, zt], [cx + R + m, cy - R - m, zt], [cx + R + m, cy + R + m, zt], [cx - R - m, cy + R + m, zt]];
  if (sweep >= 360) {
    // the square with the bowl cut out, its seam left unstroked; then its edges and the rim
    d.poly([...sq, sq[0], ...arc(R, zt, 0, 2 * Math.PI).reverse(), sq[0]], GROUND, false);
    d.poly(sq, "none"); d.poly(arc(R, zt, 0, 2 * Math.PI), "none");
  }
}

export interface TypologyDrawing { svg: string; fsi: number; gsi: number; floorArea: number; plot: { w: number; d: number } }

/** The drawing of one seed. */
export function drawTypology(p: Params, title: string): TypologyDrawing {
  const b = build(p), s = new Scene(`ty-${title.replace(/\W+/g, "-")}`), d = new Drawing(s);
  const below = b.solids.filter((x) => x.use === "ground" && x.z < 0), water = b.solids.filter((x) => x.use === "water" && x.z < -0.5);
  const above = b.solids.filter((x) => !below.includes(x) && !water.includes(x));
  const { w: W, d: D } = b.plot;

  if (below.length && below[0].ring.length > 8) roundPit(d, below, water, p.sweep ?? 360);
  else if (below.length) pit(d, below, water, b.plot);
  else d.poly([[-2, -2, 0], [W + 2, -2, 0], [W + 2, D + 2, 0], [-2, D + 2, 0]], p.ground === "water" ? "var(--pc-water)" : GROUND);

  // back to front by the nearest corner, lower first
  const key = (x: Solid) => Math.max(...x.ring.map(([a, c]) => a + c)) * 0.5 + Math.min(...x.ring.map(([a, c]) => a + c)) * 0.5 + x.z * 0.01;
  // parts on a roof (windcatchers, stacks) are drawn right after the block they stand on
  const onRoof = (x: Solid) => x.use === "built" && x.storeys === 0 && x.z > 0.5;
  const hostOf = (x: Solid) => {
    const [cx, cy] = centroid(x.ring as Pt[]);
    return above.find((b) => b !== x && !onRoof(b) && Math.abs(b.z + b.h - x.z) < 0.05 && inside(b.ring as Pt[], cx, cy));
  };
  const parts = new Map<Solid, Solid[]>(), loose: Solid[] = [];
  for (const x of above) if (onRoof(x)) { const h = hostOf(x); if (h) parts.set(h, [...(parts.get(h) ?? []), x]); else loose.push(x); }
  // land first (mounds, fields, steps, water), then what stands on it
  const land = (x: Solid) => x.use === "green" || x.use === "ground" || x.use === "water";
  const order = [
    ...above.filter(land).sort((a, c) => key(a) - key(c)),
    ...[...above.filter((x) => !onRoof(x) && !land(x) && x.use !== "canopy"), ...loose].sort((a, c) => key(a) - key(c))
      .flatMap((x) => [x, ...(parts.get(x) ?? []).sort((a, c) => key(a) - key(c))]),
    // canopies last: they cover their posts
    ...above.filter((x) => x.use === "canopy").sort((a, c) => key(a) - key(c)),
  ];
  for (const x of order) {
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
