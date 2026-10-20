// One block of one design, ready to mass: the same on the page and in the worker, so a
// genome the worker sends back builds the same massing on the page.
import type { Ranges } from "../config.js";
import { grow } from "../genome.js";
import type { Design, Ground, SiteMeta } from "../types.js";
import type { Where } from "./scores.js";
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
  return { d, E, ctx: massContext(E, whereOf(G.meta), s.narrowWings ?? false, s.typeWeights ?? null) };
}

/** Where a site is, for the sun. Exports before the UTC offset was written get India's (the
 *  same rule as pc/site.py `utc_offset_of`), else the nearest hour of longitude. */
export function whereOf(meta: SiteMeta): Where {
  const [lon, lat] = meta.origin;
  const utc = meta.utc_offset_h ?? (lon >= 68 && lon <= 97.5 && lat >= 6 && lat <= 37.5 ? 5.5 : Math.round(lon / 15));
  return { lat, lon, utc };
}
