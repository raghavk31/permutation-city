// What a site's plot rules let its plans hold, and the floor-area target that follows: the
// lesser of the brief and that (built form decision 2, 2026-10-26; docs/built-form.md).
//
// A plan's capacity is the sum over its building plots of the FAR its road allows times its
// area (regs.ts; VectorPlan.rules.capacity). The site's capacity is the 90th percentile over a
// fixed sample of random plans grown on the ground as it is: what the better plans may hold
// under the rules. It depends on the ground (the rules), so it is kept with a fingerprint of the
// ground it was measured on, and a ground that changed (a rule edited) is measured again.
import { CAPACITY_TABLE } from "./capacity-table.js";
import { grow, randomGenome } from "./genome.js";
import { plotRulesOf } from "./regs.js";
import { makeRng } from "./rng.js";
import type { Capacity, Ground } from "./types.js";

export type { Capacity };

export const SAMPLE_N = 48, SAMPLE_SEED = 20261027, SAMPLE_P = 0.9;

const keys = new WeakMap<Ground, string>();
/** A fingerprint of the ground plans grow on: its cells, what each may hold and its caps. */
export function groundKey(G: Ground): string {
  let k = keys.get(G);
  if (k) return k;
  let h = 2166136261;
  const mix = (v: number) => { h ^= v >>> 0; h = Math.imul(h, 16777619) >>> 0; };
  mix(G.n);
  for (let i = 0; i < G.n; i++) {
    mix((G.canBuild[i] ? 1 : 0) | (G.canGreen[i] ? 2 : 0) | (G.canWater[i] ? 4 : 0));
    mix(Math.round(G.cap[i] * 100)); mix(Math.round(G.minPerm[i] * 1000));
  }
  k = `${G.meta.id}:${G.n}:${h.toString(16)}`;
  keys.set(G, k);
  return k;
}

const TABLE: Record<string, Capacity[]> = CAPACITY_TABLE;

/** The site's capacity on this ground, if measured: one carried on the site (measured on the
 *  page after a rule was edited), else the committed table (scripts/capacity.ts). */
export function capacityOf(G: Ground): Capacity | null {
  if (!plotRulesOf(G.meta.id)) return null;
  const key = groundKey(G), own = G.meta.capacity;
  if (own === null) return null;
  if (own && own.key === key) return own;
  return (TABLE[G.meta.id] ?? []).find((c) => c.key === key) ?? null;
}

/** Measure the site's capacity on this ground (about 48 plans: seconds, so off the page's
 *  main thread). */
export function measureCapacity(G: Ground, note = ""): Capacity {
  const rng = makeRng(SAMPLE_SEED), caps: number[] = [];
  for (let k = 0; k < SAMPLE_N; k++) caps.push(grow(randomGenome(rng, 3), G).plan?.rules?.capacity ?? 0);
  return summarise(G, caps, note);
}

/** The sample's genomes, for growing elsewhere (the pool), and the summary of their capacities. */
export function sampleGenomes(): number[][] {
  const rng = makeRng(SAMPLE_SEED), out: number[][] = [];
  for (let k = 0; k < SAMPLE_N; k++) out.push(randomGenome(rng, 3));
  return out;
}
export function summarise(G: Ground, caps: number[], note = ""): Capacity {
  const s = [...caps].sort((a, b) => a - b), at = (p: number) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  return { key: groundKey(G), floor_m2: Math.round(at(SAMPLE_P)), median_m2: Math.round(at(0.5)), n: s.length, seed: SAMPLE_SEED, note };
}
