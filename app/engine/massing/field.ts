// Representation 2: a voxel field with a smooth skin (docs/massing.md). Per plot, BALLS
// metaballs of five genes each (all 0..1):
//
//   u, v      centre, as a share of the plot's half length and half width (-1..1)
//   z         centre height, as a share of the plot's cap
//   radius    RADIUS_M
//   strength  -0.5..1 (a negative ball carves: courtyards, notches)
//
// Field at a voxel centre: sum of strength × (1 - (d / r)²)³ inside each radius (Wyvill),
// minus ISO. A voxel is built where the field is above zero; it is only ever evaluated on
// the plot's columns and under the cap, so the voxels are inside by construction. The field
// is kept for the skin (mesh.ts), which is clamped to the envelope.
import { STOREY_M } from "../config.js";
import { jiggle, vecDistance, type MassContext, type Representation } from "./context.js";
import { plotColumns } from "./envelope.js";
import { repair, type Massing } from "./voxels.js";

export const BALLS = 6, BALL_GENES = 5;
export const PLOT_FIELD_GENES = BALLS * BALL_GENES;
export const RADIUS_M: [number, number] = [8, 40];
export const ISO = 0.3;

export function buildField(g: number[], ctx: MassContext): Massing {
  const E = ctx.E, N = E.nx * E.ny, occ = new Uint8Array(N * E.nz), field = new Float32Array(N * E.nz).fill(-ISO);
  E.plots.forEach((p, k) => {
    const ux = Math.cos(p.axis), uy = Math.sin(p.axis);
    const balls = Array.from({ length: BALLS }, (_, b) => {
      const o = k * PLOT_FIELD_GENES + b * BALL_GENES;
      const u = (g[o] * 2 - 1) * p.half[0], v = (g[o + 1] * 2 - 1) * p.half[1];
      return { x: p.cx + u * ux - v * uy, y: p.cy + u * uy + v * ux, z: g[o + 2] * p.capLevels * STOREY_M,
        r: RADIUS_M[0] + (RADIUS_M[1] - RADIUS_M[0]) * g[o + 3], s: -0.5 + 1.5 * g[o + 4] };
    });
    for (const q of plotColumns(E)[k]) {
      const x = E.ox + ((q % E.nx) + 0.5) * E.res, y = E.oy + (Math.floor(q / E.nx) + 0.5) * E.res;
      for (let z = 0; z < E.capZ[q]; z++) {
        const zm = (z + 0.5) * STOREY_M;
        let f = 0;
        for (const b of balls) {
          const t = ((x - b.x) ** 2 + (y - b.y) ** 2 + (zm - b.z) ** 2) / (b.r * b.r);
          if (t < 1) f += b.s * (1 - t) ** 3;
        }
        field[z * N + q] = f - ISO;
        if (f > ISO) occ[z * N + q] = 1;
      }
    }
  });
  const repairs = repair(E, occ, field);
  return { occ, field, repairs, rejected: occ.some((v) => v) ? null : "the field is empty inside the envelope" };
}

export const field: Representation<number[]> = {
  kind: "field", label: "voxel field, smooth skin",
  random(rng, ctx) {
    return Array.from({ length: ctx.E.plots.length * PLOT_FIELD_GENES }, (_, j) => {
      const r = rng.random();
      // Start mostly with positive balls low down, so the first generation stands.
      if (j % BALL_GENES === 4) return 0.35 + 0.65 * r;
      if (j % BALL_GENES === 2) return 0.6 * r;
      return r;
    });
  },
  mutate: (g, rng) => jiggle(g, rng, 3 / PLOT_FIELD_GENES),
  cross(a, b, rng) {
    // Whole balls from one parent or the other.
    const out = [...a];
    for (let k = 0; k < a.length; k += BALL_GENES) if (rng.random() < 0.4) for (let j = 0; j < BALL_GENES; j++) out[k + j] = b[k + j];
    return out;
  },
  build: buildField,
  distance: vecDistance,
};
