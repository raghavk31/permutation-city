// What a building-scale run shares: the envelope, the site's latitude, the sun each column
// gets past the context (a CPPN input), and the representations' common interface.
import type { Rng } from "../types.js";
import type { Envelope } from "./envelope.js";
import { probe, blocked } from "./scores.js";
import type { Massing } from "./voxels.js";

export interface MassContext {
  E: Envelope;
  lat: number;
  /** Per column: share of the winter suns not blocked by the context (0..1). */
  exposure: Float32Array;
  /** Pattern priors from the brief (107 Wings of Light, 159 Light on Two Sides): narrow wings. */
  narrowWings: boolean;
  /** The brief's typology priors, one weight per typology.TYPES (null: none). They shape the
   *  first generation of the typology grammar only. */
  typeWeights: number[] | null;
  /** NEAT innovation numbers for this run (cppn.ts). */
  innov: { conns: Map<string, number>; nodes: Map<number, number>; nextConn: number; nextNode: number };
}

export function massContext(E: Envelope, lat: number, narrowWings = false, typeWeights: number[] | null = null): MassContext {
  const P = probe(E, lat), N = E.nx * E.ny, exposure = new Float32Array(N);
  for (let q = 0; q < N; q++) {
    if (E.plotOf[q] < 0 || !P.winter.length) continue;
    let lit = 0;
    for (const s of P.winter) if (!blocked(E, E.context, P.hmax, q, s.dir)) lit++;
    exposure[q] = lit / P.winter.length;
  }
  return { E, lat, exposure, narrowWings, typeWeights, innov: { conns: new Map(), nodes: new Map(), nextConn: 0, nextNode: 0 } };
}

/** One way of writing a building as genes. The genome schema is fixed within a run. */
export interface Representation<G> {
  kind: RepKind;
  label: string;
  random(rng: Rng, ctx: MassContext): G;
  mutate(g: G, rng: Rng, ctx: MassContext): G;
  /** `a` is the better parent (NEAT keeps its extra genes). */
  cross(a: G, b: G, rng: Rng, ctx: MassContext): G;
  build(g: G, ctx: MassContext): Massing;
  /** 0 for identical genomes; about 1 for unrelated ones (families). */
  distance(a: G, b: G): number;
}

export type RepKind = "typology" | "field" | "cppn";

export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Gaussian mutation of a 0..1 vector: each gene moves with probability `p`. */
export function jiggle(g: number[], rng: Rng, p: number, sigma = 0.12): number[] {
  return g.map((v) => (rng.random() < p ? clamp01(v + rng.normal(0, sigma)) : v));
}

/** Mean absolute difference of two 0..1 vectors, scaled so unrelated random genomes give about 1. */
export const vecDistance = (a: number[], b: number[]) => {
  let s = 0;
  for (let k = 0; k < a.length; k++) s += Math.abs(a[k] - b[k]);
  return (3 * s) / Math.max(1, a.length);
};
