// A storm on the plan (architecture-v3 section 14.8, step P6): how full each part of the storm
// chain is on a day of `mm` of rain. Each lot's ponds take the first STORM_MM.lots (plan/
// lotnature.ts); past it the lots overflow, the overflow streets run, and the public water
// spaces fill in proportion to what they were placed to hold (shared.ts), until the site's design
// storm fills them; past what a space's shape holds, it spills on down the chain. Water depths
// are for drawing: the share of a space's storage filled, times its deepest water (its family's
// depth gene), not a level found by volume.
import type { VectorPlan } from "../types.js";
import { STORM_MM } from "./shared.js";

export interface StormState {
  mm: number;
  /** How full the lots' ponds are (0..1). */
  lots: number;
  /** Per public space (plan.shared.spaces order): share of its storage filled, and water depth (m). */
  spaces: { fill: number; depth: number }[];
  /** The overflow streets run: the lots are full. */
  running: boolean;
  /** Some space holds less than its share: water passes on unheld. */
  spill: boolean;
}

/** The deepest water a space's shape stands (m), by its family. */
export function deepest(s: NonNullable<VectorPlan["shared"]>["spaces"][number]): number {
  const g = s.shape;
  if (!g) return 0;
  switch (s.family) {
    case "field": return g.sunk ?? 0;
    case "basin": case "linear": return g.depth ?? 0;
    case "stepped": return (g.depth ?? 0) * Math.sqrt(s.area / (g.aspect ?? 1)) * (g.wet ?? 1);
    default: return 0;
  }
}

export function stormOn(plan: VectorPlan, mm: number, big: number): StormState {
  const lots = Math.min(1, mm / STORM_MM.lots), running = mm > STORM_MM.lots;
  const e = big > STORM_MM.lots ? Math.max(0, (mm - STORM_MM.lots) / (big - STORM_MM.lots)) : 0;
  let spill = false;
  const spaces = (plan.shared?.spaces ?? []).map((s) => {
    if (!s.need || !running) return { fill: 0, depth: 0 };
    const vol = e * s.need, fill = s.storage > 0 ? Math.min(1, vol / s.storage) : 1;
    if (vol > s.storage + 1) spill = true;
    return { fill, depth: fill * deepest(s) };
  });
  return { mm, lots, spaces, running, spill };
}
