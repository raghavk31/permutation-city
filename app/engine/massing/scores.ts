// Building-scale scores (docs/massing.md). All read a height per raster column: the massing
// stands on the ground with no floating floors (voxels.ts), so a column's top is exact.
//
//   sun       hours of direct sun on the open ground round the block on 21 December (solar
//             08:00 to 16:00), mean over sample points: higher is better (winter sun)
//   shade     share of the public ground (street bands, landscape) in shade when people are
//             out in the heat: local time 14:00 to 17:00 on the 15th of March, April and May
//             (HOT): higher is better. At these latitudes the noon sun is nearly overhead, so a
//             day-long average would hide the afternoon shade that matters
//   neighbours  hours of 21 December sun the new massing takes from the roofs of existing
//             buildings nearby (WINTER, as `sun`), mean over their roof points: lower is better
//   sky       sky view factor on the public ground, 1 - mean sin²(horizon) over 16 directions:
//             higher is better (daylight in the street, night cooling)
//   wind      frontal area density of the block's massing, mean over eight wind directions
//             (projected area / plot area; Grimmond and Oke 1999): lower lets more air through
//   gap       |floor area - target| / target, as the urban scale's gap
//
// Sun and sky pull against shade: that is the trade-off to explore. The sample points and
// sun vectors go into the bench file, so pc/massing_check.py recomputes every score.
import { STOREY_M, TARGET_TOLERANCE } from "../config.js";
import type { Envelope } from "./envelope.js";
import { dayOfYear, solarHour, sunPath, type Sun } from "./sun.js";
import { floorArea, heights } from "./voxels.js";

export const SAMPLE_STRIDE = 2;          // every other column: points 4 m apart
export const NEAR_M = 30.0;              // ground and public points within this of the block
export const POINT_Z = 1.0;              // m above the ground: a sample point's height
export const SKY_DIRS = 16, SKY_REACH_M = 100.0;
/** The sky view's directions as unit vectors (in the bench file, like the suns). */
export const SKY_UNIT: [number, number][] = Array.from({ length: SKY_DIRS }, (_, k) => {
  const a = (2 * Math.PI * k) / SKY_DIRS;
  return [Math.cos(a), Math.sin(a)];
});
export const WIND_DIRS = 8;
/** Per wind direction (k × 180° / WIND_DIRS; both ways read the same): the unit vector across it,
 *  onto which the massing is projected. In the bench file, so Python uses the same numbers. */
export const WIND_ACROSS: [number, number][] = Array.from({ length: WIND_DIRS }, (_, k) => {
  const a = (Math.PI * k) / WIND_DIRS;
  return [-Math.sin(a), Math.cos(a)];
});
export const WINTER = { month: 12, day: 21, from: 8, to: 16, step: 0.5 };
// Local clock time, converted to solar time per date through the site's longitude and UTC offset.
export const HOT = { dates: [[3, 15], [4, 15], [5, 15]] as [number, number][], from: 14, to: 17, step: 0.5, clock: true };
export const ROOF_Z = 0.5;               // m above a roof: a neighbour's sample point

/** Where a site is, for the sun: latitude and longitude (degrees), UTC offset (hours). */
export interface Where { lat: number; lon: number; utc: number }

export interface MassScores { sun: number; shade: number; sky: number; wind: number; neighbours: number; gap: number }
export type MassScoreKey = Exclude<keyof MassScores, "gap">;

/** [label, format, higher is better] as fitness.SCORES. */
export const MASS_SCORES: Record<MassScoreKey, [string, (v: number) => string, boolean]> = {
  sun: ["winter sun on the ground", (v) => `${v.toFixed(1)} h`, true],
  shade: ["hot-season shade on public ground", (v) => `${Math.round(v * 100)}%`, true],
  sky: ["sky view from the street", (v) => v.toFixed(2), true],
  wind: ["frontal area (wind blocked)", (v) => v.toFixed(2), false],
  neighbours: ["winter sun taken from neighbours", (v) => `${v.toFixed(2)} h`, false],
};
export const MASS_SCORE_KEYS = Object.keys(MASS_SCORES) as MassScoreKey[];

export interface Probe {
  where: Where;
  ground: Int32Array;     // columns: the open ground round the block (plots and public)
  public: Int32Array;     // columns: the public ground near the block
  roofs: Int32Array;      // columns: existing buildings' roofs in the frame
  roofLit: Int32Array;    // per roof point: winter suns it gets with no massing on the block
  winter: Sun[]; hot: Sun[];
  hmax: number;           // m, the highest a column can be (cap or context)
}

/** The hot-season suns: HOT's local hours on each of its dates, in solar time. */
export function hotSuns(w: Where): Sun[] {
  const out: Sun[] = [];
  for (const [month, day] of HOT.dates) {
    const doy = dayOfYear(month, day);
    out.push(...sunPath(w.lat, doy, solarHour(HOT.from, w.lon, w.utc, doy), solarHour(HOT.to, w.lon, w.utc, doy), HOT.step));
  }
  return out;
}

const probes = new WeakMap<Envelope, Probe>();

/** The sample points and suns for an envelope (cached). */
export function probe(E: Envelope, where: Where): Probe {
  const hit = probes.get(E);
  if (hit && hit.where.lat === where.lat && hit.where.lon === where.lon && hit.where.utc === where.utc) return hit;
  const N = E.nx * E.ny;
  // Distance (in columns) from the block's plots, by a two-pass chamfer.
  const far = new Float32Array(N).fill(1e9);
  for (let q = 0; q < N; q++) if (E.inPlot[q] >= 0) far[q] = 0;
  const pass = (q: number, p: number, w: number) => { if (far[p] + w < far[q]) far[q] = far[p] + w; };
  for (let r = 0; r < E.ny; r++) for (let c = 0; c < E.nx; c++) {
    const q = r * E.nx + c;
    if (c > 0) pass(q, q - 1, 1);
    if (r > 0) { pass(q, q - E.nx, 1); if (c > 0) pass(q, q - E.nx - 1, Math.SQRT2); if (c < E.nx - 1) pass(q, q - E.nx + 1, Math.SQRT2); }
  }
  for (let r = E.ny - 1; r >= 0; r--) for (let c = E.nx - 1; c >= 0; c--) {
    const q = r * E.nx + c;
    if (c < E.nx - 1) pass(q, q + 1, 1);
    if (r < E.ny - 1) { pass(q, q + E.nx, 1); if (c < E.nx - 1) pass(q, q + E.nx + 1, Math.SQRT2); if (c > 0) pass(q, q + E.nx - 1, Math.SQRT2); }
  }
  const reach = NEAR_M / E.res, ground: number[] = [], pub: number[] = [], roofs: number[] = [];
  let hmax = 0;
  for (let q = 0; q < N; q++) {
    hmax = Math.max(hmax, E.context[q], E.capZ[q] * STOREY_M);
    const r = Math.floor(q / E.nx), c = q % E.nx;
    if (r % SAMPLE_STRIDE || c % SAMPLE_STRIDE) continue;
    if (E.existing[q] > 0) roofs.push(q);
    if (far[q] > reach || E.context[q] > 0) continue;
    if (E.inPlot[q] >= 0 || E.publicGround[q]) ground.push(q);
    if (E.publicGround[q]) pub.push(q);
  }
  const W = WINTER, winter = sunPath(where.lat, dayOfYear(W.month, W.day), W.from, W.to, W.step);
  // What each roof gets with no massing on the block (the context alone).
  const roofLit = Int32Array.from(roofs, (q) => {
    let lit = 0;
    for (const s of winter) if (!blocked(E, E.context, hmax, q, s.dir, E.existing[q] + ROOF_Z)) lit++;
    return lit;
  });
  const out: Probe = {
    where, ground: Int32Array.from(ground), public: Int32Array.from(pub), roofs: Int32Array.from(roofs), roofLit, hmax,
    winter, hot: hotSuns(where),
  };
  probes.set(E, out);
  return out;
}

/** Does anything block the sun from column q, from a point z0 up (POINT_Z: the ground)? A walk
 *  over the columns the ray crosses (Amanatides and Woo), comparing the ray's height where it
 *  enters each column with the column's top. */
export function blocked(E: Envelope, H: Float32Array, hmax: number, q: number, d: readonly number[], z0 = POINT_Z): boolean {
  const res = E.res;
  let c = q % E.nx, r = Math.floor(q / E.nx);
  const x = (c + 0.5) * res, y = (r + 0.5) * res;
  const dx = d[0], dy = d[1], dz = d[2];
  if (dz <= 0) return true;
  const stepC = dx > 0 ? 1 : -1, stepR = dy > 0 ? 1 : -1;
  const tdx = dx !== 0 ? res / Math.abs(dx) : Infinity, tdy = dy !== 0 ? res / Math.abs(dy) : Infinity;
  let tx = dx !== 0 ? ((dx > 0 ? (c + 1) * res : c * res) - x) / dx : Infinity;
  let ty = dy !== 0 ? ((dy > 0 ? (r + 1) * res : r * res) - y) / dy : Infinity;
  for (;;) {
    let t: number;
    if (tx < ty) { t = tx; tx += tdx; c += stepC; } else { t = ty; ty += tdy; r += stepR; }
    if (c < 0 || r < 0 || c >= E.nx || r >= E.ny) return false;
    const z = z0 + t * dz;
    if (z >= hmax) return false;
    if (H[r * E.nx + c] > z) return true;
  }
}

/** Sky view factor at column q: 1 - mean of sin² of the horizon angle over SKY_DIRS. */
export function skyView(E: Envelope, H: Float32Array, q: number): number {
  const c0 = q % E.nx, r0 = Math.floor(q / E.nx), steps = Math.floor(SKY_REACH_M / E.res);
  let s = 0;
  for (const [ux, uy] of SKY_UNIT) {
    let best = 0;  // tan of the horizon angle
    for (let m = 1; m <= steps; m++) {
      const c = Math.floor(c0 + 0.5 + ux * m), r = Math.floor(r0 + 0.5 + uy * m);
      if (c < 0 || r < 0 || c >= E.nx || r >= E.ny) break;
      const t = (H[r * E.nx + c] - POINT_Z) / (m * E.res);
      if (t > best) best = t;
    }
    s += (best * best) / (1 + best * best);  // sin² of atan(best)
  }
  return 1 - s / SKY_DIRS;
}

/** Frontal area density of the massing alone (not the context), mean over WIND_DIRS. */
export function frontal(E: Envelope, occ: Uint8Array): number {
  const N = E.nx * E.ny, area = E.plots.reduce((s, p) => s + p.area, 0);
  if (!area) return 0;
  let sum = 0;
  for (const [px, py] of WIND_ACROSS) {
    const seen = new Set<number>();
    for (let z = 0; z < E.nz; z++) for (let q = 0; q < N; q++) {
      if (!occ[z * N + q]) continue;
      const s = Math.floor(((q % E.nx) * px + Math.floor(q / E.nx) * py) + 1e6);
      seen.add(z * 4194304 + s);
    }
    sum += seen.size * E.res * STOREY_M;
  }
  return sum / WIND_DIRS / area;
}

/** The scores of a massing. */
export function massScores(E: Envelope, occ: Uint8Array, where: Where): MassScores {
  const P = probe(E, where), H = heights(E, occ), N = E.nx * E.ny;
  let lit = 0, nG = 0;
  for (const q of P.ground) {
    if (occ[q]) continue;
    nG++;
    for (const s of P.winter) if (!blocked(E, H, P.hmax, q, s.dir)) lit++;
  }
  let shaded = 0, sky = 0, nP = 0;
  for (const q of P.public) {
    if (occ[q % N]) continue;
    nP++;
    for (const s of P.hot) if (blocked(E, H, P.hmax, q, s.dir)) shaded++;
    sky += skyView(E, H, q);
  }
  let taken = 0;
  P.roofs.forEach((q, k) => {
    let lit = 0;
    for (const s of P.winter) if (!blocked(E, H, P.hmax, q, s.dir, E.existing[q] + ROOF_Z)) lit++;
    taken += P.roofLit[k] - lit;
  });
  const fa = floorArea(E, occ);
  return {
    sun: nG ? (lit * WINTER.step) / nG : 0,
    shade: nP && P.hot.length ? shaded / (nP * P.hot.length) : 0,
    sky: nP ? sky / nP : 1,
    wind: frontal(E, occ),
    neighbours: P.roofs.length ? (taken * WINTER.step) / P.roofs.length : 0,
    gap: E.target > 0 ? Math.abs(fa - E.target) / E.target : 0,
  };
}

export const onBrief = (s: MassScores) => s.gap <= TARGET_TOLERANCE;
