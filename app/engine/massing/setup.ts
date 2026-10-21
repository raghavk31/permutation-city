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
  /** Existing buildings' heights set by the user (index into Ground.buildings → metres). */
  heights?: Record<number, number> | null;
}

export interface MassRequest extends MassSetup {
  kind: RepKind; population: number; generations: number; seed: number;
}

/** The ground with the user's heights on its existing buildings, their source "user". */
export function withHeights(G: Ground, heights: Record<number, number> | null | undefined): Ground {
  const B = G.buildings;
  const set = B && heights ? Object.entries(heights).map(([k, v]) => [+k, v] as const)
    .filter(([k, v]) => k >= 0 && k < B.h.length && Number.isFinite(v) && v > 0) : [];
  if (!B || !set.length) return G;
  const sources = B.sources.includes("user") ? B.sources : [...B.sources, "user"], user = sources.indexOf("user");
  const h = [...B.h], src = [...B.src];
  for (const [k, v] of set) { h[k] = v; src[k] = user; }
  return { ...G, buildings: { ...B, h, src, sources } };
}

export function prepareBlock(G0: Ground, s: MassSetup): { d: Design; E: Envelope; ctx: MassContext; G: Ground } {
  const G = withHeights(G0, s.heights);
  const d = grow(s.genome, G, s.locks ? Int8Array.from(s.locks) : null, s.ranges);
  const E = envelope(d, G, s.block, s.setbacks ?? DEFAULT_SETBACKS);
  return { d, E, ctx: massContext(E, whereOf(G.meta), s.narrowWings ?? false, s.typeWeights ?? null), G };
}

/** Where a site is, for the sun. Exports before the UTC offset was written get India's (the
 *  same rule as pc/site.py `utc_offset_of`), else the nearest hour of longitude. */
export function whereOf(meta: SiteMeta): Where {
  const [lon, lat] = meta.origin;
  const utc = meta.utc_offset_h ?? (lon >= 68 && lon <= 97.5 && lat >= 6 && lat <= 37.5 ? 5.5 : Math.round(lon / 15));
  return { lat, lon, utc };
}
