// Nature's rules on one plot (architecture-v3 section 13, step B4; typology/nature.ts): five
// genes that change the ground, the roofs and the skin round a precedent, and three scores
// that read them. Ponds in series, stream bands and the other site genes need a site, so they
// come with the site scale (B7).
//
// Genes (precedent.ts genes 14-18, all 0..1):
//   14 water      share of the plot kept as pond or wetland, 0 to WATER_MAX (wetland share:
//                 5-10% of a catchment, placed low; on a flat plot, where the open ground is
//                 widest, then farthest from the street)
//   15 canopy     share of the open ground under tree canopy, 0 to CANOPY_MAX (canopy share,
//                 about 40% at block scale; tree shade, 60-90% of the sun stopped); trees go
//                 nearest the buildings, courts first, where they shade walls and yards
//   16 green      share of the roofs planted, 0 to 1 (forest floor: rain kept where it falls)
//   17 eave       eave or verandah depth, 0 to EAVE_MAX m (leaf size: broad shade in hot-wet
//                 places, small in hot-dry and cold ones)
//   18 porosity   share of the façade open, POROSITY range (stomata: openings sized to the
//                 climate; jali where it is dry)
//
// Scores (all higher is better; each a stand-in, said so, until checked against a model):
//   rain        share of a DESIGN_RAIN_MM storm held on the plot: soaked in by each surface
//               (run-off coefficients, assumed) plus what the ponds store (POND_M deep)
//   plotShade   share of the plot's open ground in shade in the hot hours (HOT), from the
//               buildings and the trees (a tree's crown TREE_M high, stopping TREE_STOP)
//   fit         how well eave depth and façade openness suit the climate's challenges (a rule,
//               from IDEAL; not a thermal model)
import { STOREY_M } from "../config.js";
import type { Challenge, Need } from "../typology/challenges.js";
import type { Envelope } from "./envelope.js";
import { blocked, probe, type Where } from "./scores.js";
import { heights } from "./voxels.js";

export const WATER_MAX = 0.15, CANOPY_MAX = 0.6, EAVE_MAX = 2.5;
export const POROSITY: [number, number] = [0.05, 0.6];
export const DESIGN_RAIN_MM = 75;     // a heavy day's rain (assumed; Bengaluru's 1-in-10 is near this)
export const POND_M = 0.6;            // live storage depth of a pond or wetland (assumed)
/** Run-off coefficients (share that runs off; the rest soaks in), assumed from rational-method tables. */
export const RUNOFF = { roof: 0.9, greenRoof: 0.5, ground: 0.4, underTrees: 0.25 } as const;
export const TREE_M = 8, TREE_STOP = 0.75;

/** The eave and openness each challenge asks for (assumed, design judgement; docs/massing.md). */
export const IDEAL: Partial<Record<Challenge, { eave?: [number, number]; porosity?: [number, number] }>> = {
  heat: { eave: [0.9, 2.5] },
  "humid-heat": { eave: [1.2, 2.5], porosity: [0.3, 0.6] },
  "dry-heat": { eave: [0.6, 1.5], porosity: [0.05, 0.2] },
  cold: { eave: [0, 0.6], porosity: [0.05, 0.15] },
  rain: { eave: [0.9, 2.5] },
  monsoon: { eave: [0.9, 2.5] },
};

export interface PlotNature { water: Int32Array; trees: Int32Array; green: number; eave: number; porosity: number }

export const natureGenes = (g: number[]) => ({
  water: WATER_MAX * clamp(g[14]), canopy: CANOPY_MAX * clamp(g[15]), green: clamp(g[16]),
  eave: Math.round(EAVE_MAX * clamp(g[17]) * 10) / 10, porosity: Math.round((POROSITY[0] + (POROSITY[1] - POROSITY[0]) * clamp(g[18])) * 100) / 100,
});
const clamp = (v: number | undefined) => Math.max(0, Math.min(1, v ?? 0));

/** The genes 14-18 for given values (inverse of natureGenes). */
export function natureGeneValues(v: { water: number; canopy: number; green: number; eave: number; porosity: number }): number[] {
  return [v.water / WATER_MAX, v.canopy / CANOPY_MAX, v.green, v.eave / EAVE_MAX, (v.porosity - POROSITY[0]) / (POROSITY[1] - POROSITY[0])].map(clamp);
}

/** Where the ponds and trees go on a massing's open ground. */
export function placeNature(E: Envelope, occ: Uint8Array, g: number[], front?: [number, number]): PlotNature {
  const v = natureGenes(g), N = E.nx * E.ny, open: number[] = [];
  let plotCols = 0;
  for (let q = 0; q < N; q++) if (E.inPlot[q] >= 0) { plotCols++; if (!occ[q]) open.push(q); }
  const xy = (q: number): [number, number] => [E.ox + ((q % E.nx) + 0.5) * E.res, E.oy + (Math.floor(q / E.nx) + 0.5) * E.res];
  // distance (in columns) of each column from the buildings: a breadth-first walk out from them
  const dist = new Int32Array(N).fill(-1), queue: number[] = [];
  for (let q = 0; q < N; q++) if (occ[q]) { dist[q] = 0; queue.push(q); }
  for (let h = 0; h < queue.length; h++) {
    const q = queue[h], c = q % E.nx, r = Math.floor(q / E.nx);
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const cc = c + dc, rr = r + dr;
      if (cc < 0 || rr < 0 || cc >= E.nx || rr >= E.ny) continue;
      const p = rr * E.nx + cc;
      if (dist[p] < 0) { dist[p] = dist[q] + 1; queue.push(p); }
    }
  }
  const clear = (q: number) => (dist[q] < 0 ? 1e9 : dist[q]);
  const back = (q: number) => { if (!front) return 0; const [x, y] = xy(q); return Math.hypot(x - front[0], y - front[1]); };
  // ponds: where the open ground is widest (farthest from the buildings), then farthest from
  // the street; trees: the rest, nearest the buildings (courts and lanes first)
  const nWater = Math.min(open.length, Math.round(v.water * plotCols));
  const water = Int32Array.from([...open].sort((a, b) => clear(b) - clear(a) || back(b) - back(a) || a - b).slice(0, nWater)), wet = new Set(water);
  const dry = open.filter((q) => !wet.has(q)).sort((a, b) => clear(a) - clear(b) || a - b);
  const trees = Int32Array.from(dry.slice(0, Math.round(v.canopy * dry.length)));
  return { water, trees, green: v.green, eave: v.eave, porosity: v.porosity };
}

/** Share of a DESIGN_RAIN_MM storm held on the plot. */
export function rainHeld(E: Envelope, occ: Uint8Array, n: PlotNature): number {
  const N = E.nx * E.ny, a = E.res * E.res, P = DESIGN_RAIN_MM / 1000, wet = new Set(n.water), shade = new Set(n.trees);
  let total = 0, soaked = 0, runoff = 0, onPond = 0;
  for (let q = 0; q < N; q++) {
    if (E.inPlot[q] < 0) continue;
    const v = P * a;
    total += v;
    if (wet.has(q)) { onPond += v; continue; }
    const c = occ[q] ? n.green * RUNOFF.greenRoof + (1 - n.green) * RUNOFF.roof : shade.has(q) ? RUNOFF.underTrees : RUNOFF.ground;
    soaked += (1 - c) * v; runoff += c * v;
  }
  // roofs and ground drain to the ponds, which hold up to their volume
  const store = n.water.length * a * POND_M;
  return total ? Math.min(1, (soaked + Math.min(store, runoff + onPond)) / total) : 0;
}

/** Share of the plot's open ground in shade in the hot hours (buildings and trees). */
export function plotShade(E: Envelope, occ: Uint8Array, n: PlotNature, where: Where): number {
  const P = probe(E, where), N = E.nx * E.ny, H = heights(E, occ), shade = new Set(n.trees);
  for (const q of n.trees) H[q] = Math.max(H[q], TREE_M);
  const hmax = Math.max(P.hmax, TREE_M, E.nz * STOREY_M);
  let sum = 0, m = 0;
  for (let q = 0; q < N; q++) {
    if (E.inPlot[q] < 0 || occ[q] || (Math.floor(q / E.nx) % 2) || (q % E.nx) % 2) continue;
    m++;
    if (!P.hot.length) continue;
    let s = 0;
    for (const sun of P.hot) if (blocked(E, H, hmax, q, sun.dir)) s++;
    const built = s / P.hot.length;
    // under a crown: the crown stops TREE_STOP of what the buildings let through
    sum += shade.has(q) ? built + (1 - built) * TREE_STOP : built;
  }
  return m ? sum / m : 0;
}

/** How well eave depth and openness suit the challenges: per challenge and property, 1 inside
 *  its ideal range, falling to 0 a range's width (at least 0.5 m or 0.15) outside it. */
export function climateFit(n: Pick<PlotNature, "eave" | "porosity">, ns: readonly Need[]): number {
  let s = 0, w = 0;
  for (const need of ns) {
    const ideal = IDEAL[need.key];
    if (!ideal) continue;
    for (const [k, r] of Object.entries(ideal) as ["eave" | "porosity", [number, number]][]) {
      const v = n[k], width = Math.max(r[1] - r[0], k === "eave" ? 0.5 : 0.15);
      const off = v < r[0] ? r[0] - v : v > r[1] ? v - r[1] : 0;
      s += need.weight * Math.max(0, 1 - off / width); w += need.weight;
    }
  }
  return w ? s / w : 1;
}

export const PLOT_SCORES = {
  rain: ["rain held on the plot", (v: number) => `${Math.round(v * 100)}%`, true],
  plotShade: ["shade on the plot's open ground", (v: number) => `${Math.round(v * 100)}%`, true],
  fit: ["eaves and openings suit the climate", (v: number) => `${Math.round(v * 100)}%`, true],
} as const;
export type PlotScoreKey = keyof typeof PLOT_SCORES;

export function plotScores(E: Envelope, occ: Uint8Array, n: PlotNature, ns: readonly Need[], where: Where): Record<PlotScoreKey, number> {
  return { rain: rainHeld(E, occ, n), plotShade: plotShade(E, occ, n, where), fit: climateFit(n, ns) };
}
