// A massing as voxels: what every representation is checked and scored on (docs/massing.md).
//
// Columns of RES_M × RES_M on the envelope's raster, one storey (STOREY_M) high. Voxel
// (q, z) is at index z × N + q, N = nx × ny. Floor area is the count of voxels × RES_M².
//
// Repairs are always said, never silent:
//   clip       voxels outside the plot or above the cap are removed
//   ground     a voxel with nothing under it is removed (no floating floors)
//   thin       a plot over its coverage limit loses its lowest-density columns until it fits
import { STOREY_M } from "../config.js";
import type { Envelope } from "./envelope.js";

/** A box in plan, rotated: the typology grammar's solids (exact geometry for the viewer). */
export interface Box {
  plot: number; cx: number; cy: number; axis: number;
  hu: number; hv: number;   // half extents along the plot axis and across it (m)
  z0: number; z1: number;   // storeys: from z0 up to (not including) z1
}

export interface Massing {
  occ: Uint8Array;            // nx × ny × nz
  boxes?: Box[];              // typology grammar: the exact solids
  field?: Float32Array;       // fields: value per voxel (threshold 0), for the smooth skin
  repairs: Repair[];
  rejected: string | null;    // why it can't stand, or null
}

export interface Repair { kind: "clip" | "ground" | "thin" | "shrink" | "lower"; plot: number; count: number }

export const voxelCount = (E: Envelope) => E.nx * E.ny * E.nz;

/** Floor area (m²) of the whole massing, or of one plot. */
export function floorArea(E: Envelope, occ: Uint8Array, plot = -1): number {
  const N = E.nx * E.ny;
  let n = 0;
  for (let z = 0; z < E.nz; z++) for (let q = 0; q < N; q++) {
    if (occ[z * N + q] && (plot < 0 || E.plotOf[q] === plot)) n++;
  }
  return n * E.res * E.res;
}

/** Footprint (m²) per plot. */
export function footprints(E: Envelope, occ: Uint8Array): Float64Array {
  const N = E.nx * E.ny, out = new Float64Array(E.plots.length);
  for (let q = 0; q < N; q++) if (occ[q] && E.plotOf[q] >= 0) out[E.plotOf[q]] += E.res * E.res;
  return out;
}

/** Height (m) of each column: the massing, or the context where there is no massing. */
export function heights(E: Envelope, occ: Uint8Array): Float32Array {
  const N = E.nx * E.ny, H = Float32Array.from(E.context);
  for (let q = 0; q < N; q++) {
    for (let z = E.nz - 1; z >= 0; z--) if (occ[z * N + q]) { H[q] = Math.max(H[q], (z + 1) * STOREY_M); break; }
  }
  return H;
}

/** Make a massing stand inside its envelope, recording each repair. `weight` (optional, per
 *  voxel) orders the columns thinning removes: lowest total first. */
export function repair(E: Envelope, occ: Uint8Array, weight?: Float32Array): Repair[] {
  const N = E.nx * E.ny, out: Repair[] = [];
  const add = (kind: Repair["kind"], plot: number, count: number) => {
    if (!count) return;
    const r = out.find((x) => x.kind === kind && x.plot === plot);
    if (r) r.count += count; else out.push({ kind, plot, count });
  };
  // Clip.
  for (let z = 0; z < E.nz; z++) for (let q = 0; q < N; q++) {
    const v = z * N + q;
    if (occ[v] && (E.plotOf[q] < 0 || z >= E.capZ[q])) { occ[v] = 0; add("clip", Math.max(E.inPlot[q], -1), 1); }
  }
  // Ground: a voxel needs the one below it.
  for (let q = 0; q < N; q++) {
    let held = true;
    for (let z = 0; z < E.nz; z++) {
      const v = z * N + q;
      if (!occ[v]) { held = false; continue; }
      if (!held) { occ[v] = 0; add("ground", E.plotOf[q], 1); }
    }
  }
  // Thin to the coverage limit.
  const foot = footprints(E, occ);
  E.plots.forEach((p, k) => {
    const limit = p.maxCover * p.area;
    if (foot[k] <= limit + 1e-9) return;
    const cols: [number, number][] = [];
    for (let q = 0; q < N; q++) {
      if (E.plotOf[q] !== k || !occ[q]) continue;
      let w = 0;
      for (let z = 0; z < E.nz; z++) if (occ[z * N + q]) w += weight ? weight[z * N + q] : 1;
      cols.push([w, q]);
    }
    cols.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    let f = foot[k], removed = 0;
    for (const [, q] of cols) {
      if (f <= limit + 1e-9) break;
      for (let z = 0; z < E.nz; z++) { if (occ[z * N + q]) removed++; occ[z * N + q] = 0; }
      f -= E.res * E.res;
    }
    add("thin", k, removed);
  });
  return out;
}

/** Plain words for a list of repairs. */
export function describeRepairs(rs: Repair[], plots: number): string {
  if (!rs.length) return "inside its envelope as grown";
  const word = { clip: "clipped to the envelope", ground: "floating voxels dropped", thin: "thinned to the coverage limit",
    shrink: "shrunk to fit the plot", lower: "lowered to the cap" };
  const kinds = [...new Set(rs.map((r) => r.kind))];
  return "repaired: " + kinds.map((k) => {
    const n = rs.filter((r) => r.kind === k).reduce((s, r) => s + r.count, 0);
    const ps = new Set(rs.filter((r) => r.kind === k).map((r) => r.plot)).size;
    return `${word[k]} (${n} ${k === "shrink" || k === "lower" ? "steps" : "voxels"}${plots > 1 ? `, ${ps} of ${plots} plots` : ""})`;
  }).join("; ");
}
