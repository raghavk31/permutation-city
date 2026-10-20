// The bench file: one massing with everything pc/massing_check.py needs to recompute its
// scores and check it stands inside its envelope (decision D4: Python checks the building
// scale, it doesn't grow it). Rasters are run-length encoded: [value, count, value, count, …].
import { STOREY_M } from "../config.js";
import type { Envelope } from "./envelope.js";
import { HOT, POINT_Z, probe, ROOF_Z, SKY_DIRS, SKY_REACH_M, SKY_UNIT, WIND_ACROSS, WIND_DIRS, WINTER, type MassScores, type Where } from "./scores.js";
import { floorArea, type Massing } from "./voxels.js";

export const BENCH_VERSION = 2;  // 2: existing buildings and their roofs; shade in local hours over three dates

export function rle(a: ArrayLike<number>): number[] {
  const out: number[] = [];
  for (let k = 0; k < a.length;) {
    let j = k;
    while (j < a.length && a[j] === a[k]) j++;
    out.push(a[k], j - k);
    k = j;
  }
  return out;
}

export function unrle(r: number[]): number[] {
  const out: number[] = [];
  for (let k = 0; k < r.length; k += 2) for (let j = 0; j < r[k + 1]; j++) out.push(r[k]);
  return out;
}

export function bench(E: Envelope, m: Massing, where: Where, scores: MassScores, extra: Record<string, unknown> = {}) {
  const P = probe(E, where);
  return {
    version: BENCH_VERSION,
    constants: { STOREY_M, POINT_Z, ROOF_Z, SKY_DIRS, SKY_REACH_M, WIND_DIRS, WINTER, HOT },
    lat: where.lat, lon: where.lon, utc: where.utc, nx: E.nx, ny: E.ny, nz: E.nz, res: E.res, ox: E.ox, oy: E.oy,
    plots: E.plots.map((p) => ({ area: p.area, maxCover: p.maxCover, target: p.target })),
    target: E.target,
    plotOf: rle(E.plotOf), inPlot: rle(E.inPlot), capZ: rle(E.capZ), publicGround: rle(E.publicGround),
    context: rle(E.context), existing: rle(E.existing), occ: rle(m.occ),
    ground: Array.from(P.ground), public: Array.from(P.public), roofs: Array.from(P.roofs), hmax: P.hmax,
    winter: P.winter.map((s) => s.dir), hot: P.hot.map((s) => s.dir), wind: WIND_ACROSS, sky: SKY_UNIT,
    scores, floor: floorArea(E, m.occ), rejected: m.rejected,
    ...extra,
  };
}
