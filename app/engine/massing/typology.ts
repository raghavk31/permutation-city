// Representation 1: a typology grammar (docs/massing.md). Ten genes per plot, all 0..1:
//
//   0 type        courtyard, L, U, tower, slab, podium and tower
//   1 turn        eight ways to lay it on the plot: mirror along, mirror across, swap axes
//   2 depth       wing depth, DEPTH_M (narrower with the Wings of Light prior)
//   3 4 extent    the outer rectangle as a share of the plot's length and width
//   5 6 offset    where that rectangle sits in the slack left over
//   7 levels      storeys, as a share of the plot's cap (at least one)
//   8 step        podium storeys (podium and tower), else the second wings' height as a share
//   9 tower       a tower's plan as a share of the outer rectangle
//
// Repairs: a shape that leaves its plot is shrunk (up to SHRINK_STEPS, 10% each), then any
// column still outside is clipped; storeys over a column's cap are lowered.
import type { Rng } from "../types.js";
import { clamp01, jiggle, vecDistance, type MassContext, type Representation } from "./context.js";
import { repair, type Box, type Massing, type Repair } from "./voxels.js";

export const TYPES = ["courtyard", "L", "U", "tower", "slab", "podium and tower"] as const;
export const PLOT_GENES = 10;
export const DEPTH_M: [number, number] = [9, 18];
export const NARROW_DEPTH_M: [number, number] = [9, 12];  // assumed; Pattern 107's width is unchecked
export const MIN_SIDE_M = 6;
export const SHRINK_STEPS = 8;

type Rect = [u0: number, v0: number, u1: number, v1: number, levels: number];

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** The index a 0..1 draw falls on, with weights. */
function weighted(w: number[], r: number): number {
  const total = w.reduce((s, v) => s + Math.max(0, v), 0);
  if (!(total > 0)) return Math.min(w.length - 1, Math.floor(r * w.length));
  let acc = 0;
  for (let k = 0; k < w.length; k++) { acc += Math.max(0, w[k]) / total; if (r < acc) return k; }
  return w.length - 1;
}

/** The rectangles of one plot's building, in the plot's frame (u along its axis, v across). */
export function shapes(g: number[], hu: number, hv: number, cap: number, narrow: boolean, scale = 1): Rect[] {
  const type = TYPES[Math.min(TYPES.length - 1, Math.floor(g[0] * TYPES.length))];
  const turn = Math.min(7, Math.floor(g[1] * 8));
  const [d0, d1] = narrow ? NARROW_DEPTH_M : DEPTH_M;
  const swap = (turn & 4) > 0;
  const [HU, HV] = swap ? [hv, hu] : [hu, hv];
  const A = Math.max(MIN_SIDE_M / 2, lerp(0.5, 1, g[3]) * HU * scale), B = Math.max(MIN_SIDE_M / 2, lerp(0.5, 1, g[4]) * HV * scale);
  const cu = lerp(-1, 1, g[5]) * Math.max(0, HU - A), cv = lerp(-1, 1, g[6]) * Math.max(0, HV - B);
  const w = Math.min(lerp(d0, d1, g[2]), 2 * A, 2 * B);
  const L = Math.max(1, Math.round(lerp(0.25, 1, g[7]) * cap));
  const L2 = Math.max(1, Math.round(lerp(0.5, 1, g[8]) * L));
  const ts = lerp(0.25, 0.6, g[9]);
  const r: Rect[] = [];
  const box = (u0: number, v0: number, u1: number, v1: number, lv: number) => r.push([u0, v0, u1, v1, lv]);
  switch (type) {
    case "courtyard":
      box(-A, -B, A, -B + w, L); box(-A, B - w, A, B, L);
      if (2 * B - 2 * w > 1) { box(-A, -B + w, -A + w, B - w, L2); box(A - w, -B + w, A, B - w, L2); }
      break;
    case "L": box(-A, -B, A, -B + w, L); box(-A, -B + w, -A + w, B, L2); break;
    case "U":
      box(-A, -B, A, -B + w, L); box(-A, -B + w, -A + w, B, L2); box(A - w, -B + w, A, B, L2);
      break;
    case "tower": {
      const a = Math.max(MIN_SIDE_M / 2, ts * A), b = Math.max(MIN_SIDE_M / 2, ts * B);
      box(-a, -b, a, b, L);
      break;
    }
    case "slab": box(-A, -w / 2, A, w / 2, L); break;
    case "podium and tower": {
      const pod = Math.min(L, 1 + Math.floor(g[8] * 4));
      const a = Math.max(MIN_SIDE_M / 2, ts * A), b = Math.max(MIN_SIDE_M / 2, ts * B);
      box(-A, -B, A, B, pod);
      if (L > pod) box(-a, -b, a, b, L);
      break;
    }
  }
  // Lay it on the plot: mirror, swap axes, move into place.
  return r.map(([u0, v0, u1, v1, lv]) => {
    if (turn & 1) [u0, u1] = [-u1, -u0];
    if (turn & 2) [v0, v1] = [-v1, -v0];
    u0 += cu; u1 += cu; v0 += cv; v1 += cv;
    return swap ? [v0, u0, v1, u1, lv] as Rect : [u0, v0, u1, v1, lv] as Rect;
  });
}

/** Columns a box covers (centre inside). */
function cover(ctx: MassContext, b: Box, out: (q: number) => void) {
  const E = ctx.E, ux = Math.cos(b.axis), uy = Math.sin(b.axis);
  const R = Math.hypot(b.hu, b.hv);
  const c0 = Math.max(0, Math.floor((b.cx - R - E.ox) / E.res)), c1 = Math.min(E.nx - 1, Math.ceil((b.cx + R - E.ox) / E.res));
  const r0 = Math.max(0, Math.floor((b.cy - R - E.oy) / E.res)), r1 = Math.min(E.ny - 1, Math.ceil((b.cy + R - E.oy) / E.res));
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
    const dx = E.ox + (c + 0.5) * E.res - b.cx, dy = E.oy + (r + 0.5) * E.res - b.cy;
    const u = dx * ux + dy * uy, v = -dx * uy + dy * ux;
    if (Math.abs(u) <= b.hu && Math.abs(v) <= b.hv) out(r * E.nx + c);
  }
}

function boxesOf(ctx: MassContext, plot: number, g: number[], scale: number): Box[] {
  const p = ctx.E.plots[plot], ux = Math.cos(p.axis), uy = Math.sin(p.axis);
  return shapes(g, p.half[0], p.half[1], p.capLevels, ctx.narrowWings, scale).map(([u0, v0, u1, v1, lv]) => {
    const mu = (u0 + u1) / 2, mv = (v0 + v1) / 2;
    return { plot, cx: p.cx + mu * ux - mv * uy, cy: p.cy + mu * uy + mv * ux, axis: p.axis,
      hu: (u1 - u0) / 2, hv: (v1 - v0) / 2, z0: 0, z1: lv };
  });
}

export function buildTypology(g: number[], ctx: MassContext): Massing {
  const E = ctx.E, N = E.nx * E.ny, occ = new Uint8Array(N * E.nz), boxes: Box[] = [], pre: Repair[] = [];
  E.plots.forEach((p, k) => {
    const gene = g.slice(k * PLOT_GENES, (k + 1) * PLOT_GENES);
    if (!p.buildable) return;
    let bs: Box[] = [], step = 0;
    for (; step <= SHRINK_STEPS; step++) {
      bs = boxesOf(ctx, k, gene, Math.pow(0.9, step));
      let out = 0, foot = new Set<number>();
      for (const b of bs) cover(ctx, b, (q) => { foot.add(q); if (E.plotOf[q] !== k) out++; });
      if (!out && foot.size * E.res * E.res <= p.maxCover * p.area + 1e-9) break;
    }
    if (step) pre.push({ kind: "shrink", plot: k, count: Math.min(step, SHRINK_STEPS) });
    // Lower each box to the lowest cap under it.
    for (const b of bs) {
      let cap = Infinity;
      cover(ctx, b, (q) => { if (E.plotOf[q] === k) cap = Math.min(cap, E.capZ[q]); });
      if (cap < b.z1) { pre.push({ kind: "lower", plot: k, count: b.z1 - cap }); b.z1 = Math.max(0, cap); }
      if (b.z1 > b.z0) boxes.push(b);
      let clipped = 0;
      for (let z = b.z0; z < b.z1; z++) cover(ctx, b, (q) => { if (E.plotOf[q] === k) occ[z * N + q] = 1; else clipped++; });
      if (clipped) pre.push({ kind: "clip", plot: k, count: clipped });
    }
  });
  const repairs = [...pre, ...repair(E, occ)];
  // Lowered or clipped boxes are kept as drawn; the voxels are what is scored.
  return { occ, boxes, repairs, rejected: occ.some((v) => v) ? null : "nothing left inside the envelope" };
}

export const typology: Representation<number[]> = {
  kind: "typology", label: "typology grammar",
  random(rng, ctx) {
    const g: number[] = [];
    for (let k = 0; k < ctx.E.plots.length; k++) {
      const gene = Array.from({ length: PLOT_GENES }, () => rng.random());
      // The brief's typology priors, else (with Wings of Light) courtyard, L, U and slab
      // over towers. Both only shape where the first generation starts.
      const w = ctx.typeWeights ?? (ctx.narrowWings ? [1, 1, 1, 0.25, 1, 0.25] : null);
      if (w) gene[0] = (weighted(w, rng.random()) + 0.5) / TYPES.length;
      g.push(...gene);
    }
    return g;
  },
  mutate(g, rng) {
    const out = jiggle(g, rng, 2 / PLOT_GENES);
    // Now and then a plot changes type outright.
    for (let k = 0; k < out.length; k += PLOT_GENES) if (rng.random() < 0.05) out[k] = clamp01(rng.random());
    return out;
  },
  cross(a, b, rng) {
    // Whole plots from one parent or the other, so a building stays one building.
    const out = [...a];
    for (let k = 0; k < a.length; k += PLOT_GENES) if (rng.random() < 0.4) for (let j = 0; j < PLOT_GENES; j++) out[k + j] = b[k + j];
    return out;
  },
  build: buildTypology,
  distance: vecDistance,
};
