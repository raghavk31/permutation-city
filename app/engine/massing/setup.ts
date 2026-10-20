// One block of one design, ready to mass: the same on the page and in the worker, so a
// genome the worker sends back builds the same massing on the page.
import type { Ranges } from "../config.js";
import { grow } from "../genome.js";
import type { Design, Ground } from "../types.js";
import { massContext, type MassContext, type RepKind } from "./context.js";
import { envelope, DEFAULT_SETBACKS, type Envelope, type Setbacks } from "./envelope.js";

export interface MassSetup {
  genome: number[]; locks: number[] | null; ranges: Ranges; block: number;
  setbacks?: Setbacks; narrowWings?: boolean; typeWeights?: number[] | null;
}

export interface MassRequest extends MassSetup {
  kind: RepKind; population: number; generations: number; seed: number;
}

export function prepareBlock(G: Ground, s: MassSetup): { d: Design; E: Envelope; ctx: MassContext } {
  const d = grow(s.genome, G, s.locks ? Int8Array.from(s.locks) : null, s.ranges);
  const E = envelope(d, G, s.block, s.setbacks ?? DEFAULT_SETBACKS);
  const lat = G.meta.origin[1];
  return { d, E, ctx: massContext(E, lat, s.narrowWings ?? false, s.typeWeights ?? null) };
}
