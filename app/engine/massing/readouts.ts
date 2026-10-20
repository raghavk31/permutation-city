// Building-scale readouts (docs/massing.md, docs/metrics.md): shown, never optimised, as at
// the urban scale. The Phase 6 properties that apply to buildings, plus plain measures.
//
//   daylit       share of floor area within DAYLIT_M of an outside wall (courtyards count):
//                a rule of thumb for side-lit rooms, not Pattern 159's own numbers
//   echoes       how alike the wall directions are: 1 - entropy of wall area over 18 bins of
//                direction (mod 90°). Alexander's "echoes" through Salingaros: repeated angles
//   symmetry     local symmetries: per plot, the better of the two mirrors about its own axes
//                (1 - |h - h'| / (h + h') over its columns), weighted by plot area
//   scale        levels of scale: floor plates of every storey and the open ground inside the
//                plots as a ladder of e-fold sizes from one column; entropy of area per rung
//                (metrics/order.ts levelsOfScale, at this scale)
//   cover, far, storeys   footprint over the plots, floor area over the plots, mean and top
import { entropy } from "../metrics/harmony.js";
import type { Envelope } from "./envelope.js";
import type { Mesh } from "./mesh.js";
import { floorArea, footprints, type Massing } from "./voxels.js";

export const DAYLIT_M = 6.0;
export const ECHO_BINS = 18;

export interface MassReadouts {
  daylit: number; echoes: number; symmetry: number; scale: number;
  cover: number; far: number; meanStoreys: number; topStoreys: number;
}

export const READOUTS: Record<keyof MassReadouts, [string, (v: number) => string]> = {
  daylit: ["floor within 6 m of a window wall", (v) => `${Math.round(v * 100)}%`],
  echoes: ["echoes (alike wall directions)", (v) => v.toFixed(2)],
  symmetry: ["local symmetries", (v) => v.toFixed(2)],
  scale: ["levels of scale", (v) => v.toFixed(2)],
  cover: ["plot coverage", (v) => `${Math.round(v * 100)}%`],
  far: ["floor area over the plots (FAR)", (v) => v.toFixed(1)],
  meanStoreys: ["storeys, mean", (v) => v.toFixed(1)],
  topStoreys: ["storeys, top", (v) => String(Math.round(v))],
};

/** Connected groups of columns passing `on` (four-neighbour). */
function groups(E: Envelope, on: (q: number) => boolean): number[] {
  const N = E.nx * E.ny, seen = new Uint8Array(N), sizes: number[] = [];
  for (let s = 0; s < N; s++) {
    if (seen[s] || !on(s)) continue;
    let n = 0;
    const stack = [s];
    seen[s] = 1;
    while (stack.length) {
      const q = stack.pop()!;
      n++;
      for (const p of [q - 1, q + 1, q - E.nx, q + E.nx]) {
        if (p < 0 || p >= N || seen[p] || ((p === q - 1 || p === q + 1) && Math.floor(p / E.nx) !== Math.floor(q / E.nx))) continue;
        if (!on(p)) continue;
        seen[p] = 1; stack.push(p);
      }
    }
    sizes.push(n);
  }
  return sizes;
}

export function readouts(E: Envelope, m: Massing, mesh?: Mesh): MassReadouts {
  const N = E.nx * E.ny, occ = m.occ;
  // Daylit: chamfer distance (columns) to the nearest empty column, storey by storey.
  let lit = 0, total = 0;
  const dist = new Float32Array(N);
  for (let z = 0; z < E.nz; z++) {
    const o = z * N;
    let any = false;
    for (let q = 0; q < N; q++) { dist[q] = occ[o + q] ? 1e9 : 0; if (occ[o + q]) any = true; }
    if (!any) continue;
    for (let r = 0; r < E.ny; r++) for (let c = 0; c < E.nx; c++) {
      const q = r * E.nx + c;
      if (c > 0) dist[q] = Math.min(dist[q], dist[q - 1] + 1);
      if (r > 0) dist[q] = Math.min(dist[q], dist[q - E.nx] + 1);
    }
    for (let r = E.ny - 1; r >= 0; r--) for (let c = E.nx - 1; c >= 0; c--) {
      const q = r * E.nx + c;
      if (c < E.nx - 1) dist[q] = Math.min(dist[q], dist[q + 1] + 1);
      if (r < E.ny - 1) dist[q] = Math.min(dist[q], dist[q + E.nx] + 1);
    }
    for (let q = 0; q < N; q++) if (occ[o + q]) { total++; if ((dist[q] - 0.5) * E.res <= DAYLIT_M) lit++; }
  }
  // Echoes from the mesh's walls.
  let echoes = 0;
  if (mesh) {
    const bins = new Array(ECHO_BINS).fill(0), P = mesh.positions, I = mesh.indices;
    for (let k = 0; k < I.length; k += 3) {
      const a = 3 * I[k], b = 3 * I[k + 1], c = 3 * I[k + 2];
      const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
      const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const area = Math.hypot(nx, ny, nz) / 2;
      if (!area || Math.abs(nz) / (2 * area) > 0.5) continue;
      const th = ((Math.atan2(ny, nx) % (Math.PI / 2)) + Math.PI / 2) % (Math.PI / 2);
      bins[Math.min(ECHO_BINS - 1, Math.floor((th / (Math.PI / 2)) * ECHO_BINS))] += area;
    }
    echoes = bins.some((v) => v) ? 1 - entropy(bins, ECHO_BINS) : 0;
  }
  // Local symmetries per plot.
  const H = new Float32Array(N);
  for (let q = 0; q < N; q++) for (let z = E.nz - 1; z >= 0; z--) if (occ[z * N + q]) { H[q] = z + 1; break; }
  let sym = 0, symW = 0;
  E.plots.forEach((p, k) => {
    const ux = Math.cos(p.axis), uy = Math.sin(p.axis);
    let best = 0;
    for (const flip of [[1, -1], [-1, 1]]) {
      let diff = 0, sum = 0;
      for (let q = 0; q < N; q++) {
        if (E.inPlot[q] !== k) continue;
        const dx = E.ox + ((q % E.nx) + 0.5) * E.res - p.cx, dy = E.oy + (Math.floor(q / E.nx) + 0.5) * E.res - p.cy;
        const u = (dx * ux + dy * uy) * flip[0], v = (-dx * uy + dy * ux) * flip[1];
        const x = p.cx + u * ux - v * uy, y = p.cy + u * uy + v * ux;
        const c = Math.floor((x - E.ox) / E.res), r = Math.floor((y - E.oy) / E.res);
        const h2 = c >= 0 && r >= 0 && c < E.nx && r < E.ny && E.inPlot[r * E.nx + c] === k ? H[r * E.nx + c] : 0;
        diff += Math.abs(H[q] - h2); sum += H[q] + h2;
      }
      if (sum) best = Math.max(best, 1 - diff / sum);
    }
    sym += best * p.area; symW += p.area;
  });
  // Levels of scale.
  const sizes: number[] = [];
  for (let z = 0; z < E.nz; z++) sizes.push(...groups(E, (q) => occ[z * N + q] === 1));
  sizes.push(...groups(E, (q) => E.inPlot[q] >= 0 && !occ[q]));
  let top = 0;
  for (const s of sizes) top = Math.max(top, Math.floor(Math.log(s)));
  const rungs = new Array(top + 1).fill(0);
  for (const s of sizes) rungs[Math.floor(Math.log(s))] += s;
  const fp = footprints(E, occ), plotArea = E.plots.reduce((s, p) => s + p.area, 0);
  const foot = fp.reduce((s, v) => s + v, 0), fa = floorArea(E, occ);
  let maxH = 0;
  for (let q = 0; q < N; q++) maxH = Math.max(maxH, H[q]);
  return {
    daylit: total ? lit / total : 0, echoes, symmetry: symW ? sym / symW : 0,
    scale: sizes.length ? entropy(rungs, top + 1) : 0,
    cover: plotArea ? foot / plotArea : 0, far: plotArea ? fa / plotArea : 0,
    meanStoreys: foot ? fa / foot : 0, topStoreys: maxH,
  };
}
