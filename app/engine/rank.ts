// Pareto ranks, crowding and families (pc/fitness.py).
import { TARGET_TOLERANCE } from "./config.js";
import { SCORES, SCORE_KEYS } from "./fitness.js";
import type { Scores } from "./types.js";

/** All five scores as "lower is better". */
export const asMin = (s: Scores) => SCORE_KEYS.map((k) => (SCORES[k][2] ? -s[k] : s[k]));

function fronts(f: number[][]): Int32Array {
  const n = f.length, rank = new Int32Array(n);
  const dominates = (j: number, i: number) => {
    let lt = false;
    for (let k = 0; k < f[i].length; k++) {
      if (f[j][k] > f[i][k]) return false;
      if (f[j][k] < f[i][k]) lt = true;
    }
    return lt;
  };
  const remaining = new Set([...Array(n).keys()]);
  let r = 1;
  while (remaining.size) {
    const front = [...remaining].filter((i) => ![...remaining].some((j) => j !== i && dominates(j, i)));
    for (const i of front) { rank[i] = r; remaining.delete(i); }
    r++;
  }
  return rank;
}

/** Rank 1 = Pareto front of designs on brief; designs off brief come after, by closeness. */
export function paretoRanks(scores: Scores[], tol = TARGET_TOLERANCE): Int32Array {
  const n = scores.length, rank = new Int32Array(n);
  const on: number[] = [], off: number[] = [];
  scores.forEach((s, i) => (s.gap <= tol ? on : off).push(i));
  let top = 0;
  if (on.length) {
    const r = fronts(on.map((i) => asMin(scores[i])));
    on.forEach((i, k) => { rank[i] = r[k]; if (r[k] > top) top = r[k]; });
  }
  off.sort((a, b) => scores[a].gap - scores[b].gap);
  off.forEach((i, k) => { rank[i] = top + 1 + k; });
  return rank;
}

/** NSGA-II crowding distance within one front (indices `idx`). */
export function crowding(scores: Scores[], idx: number[]): Float64Array {
  const n = idx.length, dist = new Float64Array(n);
  if (n <= 2) return dist.fill(Infinity);
  const f = idx.map((i) => asMin(scores[i]));
  for (let k = 0; k < SCORE_KEYS.length; k++) {
    const order = [...Array(n).keys()].sort((a, b) => f[a][k] - f[b][k]);
    const span = f[order[n - 1]][k] - f[order[0]][k] || 1;
    dist[order[0]] = dist[order[n - 1]] = Infinity;
    for (let t = 1; t < n - 1; t++) dist[order[t]] += (f[order[t + 1]][k] - f[order[t - 1]][k]) / span;
  }
  return dist;
}

/** Share of cells with a different use, stopping early once it passes `stop`. */
export function difference(a: ArrayLike<number>, b: ArrayLike<number>, stop = 1): number {
  const n = a.length, limit = stop * n;
  let diff = 0;
  for (let i = 0; i < n; i++) if (a[i] !== b[i] && ++diff > limit) return diff / n;
  return diff / n;
}

/** Group designs into families: best first; a design joins the first family whose founder
 *  it is within `threshold` of, otherwise it founds a new one. */
export function families(uses: ArrayLike<number>[], order: number[], threshold = 0.15): number[][] {
  const fams: number[][] = [];
  for (const i of order) {
    const fam = fams.find((f) => difference(uses[f[0]], uses[i], threshold) < threshold);
    if (fam) fam.push(i); else fams.push([i]);
  }
  return fams;
}
