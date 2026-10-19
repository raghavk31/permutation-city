// NSGA-III survival (pc/niche.py): reference directions and niching (Deb and Jain 2014).
//
// Two simplifications from the paper, both so Python and the browser pick the same designs
// bit for bit: scores are normalised between the ideal and the worst point of the
// candidates (no hyperplane intercepts, which need a linear solve), and ties go to the
// lower index, not a random draw. Distances are compared squared, so there is no sqrt.
import { asMin } from "./rank.js";
import type { Scores } from "./types.js";

/** Das-Dennis points: every way to split 1 into `p` equal parts over `m` objectives. */
export function referencePoints(m: number, p: number): number[][] {
  const out: number[][] = [];
  const rec = (left: number, cur: number[]) => {
    if (cur.length === m - 1) { out.push([...cur, left / p]); return; }
    for (let i = 0; i <= left; i++) rec(left - i, [...cur, i / p]);
  };
  rec(p, []);
  return out;
}

const choose = (n: number, k: number) => {
  let c = 1;
  for (let i = 1; i <= k; i++) c = (c * (n - k + i)) / i;
  return Math.round(c);
};

/** The fewest divisions that give at least one reference direction per design. */
export function divisionsFor(m: number, pop: number): number {
  let p = 1;
  while (choose(p + m - 1, m - 1) < pop) p++;
  return p;
}

/** Which of `last` (the split front) survive: `need` indices into it, in the order picked.
 *  `chosen` are the designs already in (whole fronts); they fill the niches first. */
export function nicheSelect(chosen: Scores[], last: Scores[], need: number, refs: number[][]): number[] {
  const f = chosen.concat(last).map(asMin), m = refs[0].length, n = f.length, c = chosen.length;
  const ideal = f[0].slice(), worst = f[0].slice();
  for (const row of f) for (let k = 0; k < m; k++) {
    if (row[k] < ideal[k]) ideal[k] = row[k];
    if (row[k] > worst[k]) worst[k] = row[k];
  }
  const span = ideal.map((lo, k) => worst[k] - lo || 1);
  const ww = refs.map((w) => { let s = 0; for (let k = 0; k < m; k++) s += w[k] * w[k]; return s; });
  const ref = new Int32Array(n), dist = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const x = f[i].map((v, k) => (v - ideal[k]) / span[k]);
    let xx = 0;
    for (let k = 0; k < m; k++) xx += x[k] * x[k];
    let best = -1, bestD = Infinity;
    for (let j = 0; j < refs.length; j++) {
      let dot = 0;
      for (let k = 0; k < m; k++) dot += x[k] * refs[j][k];
      const d = xx - (dot * dot) / ww[j];
      if (d < bestD) { bestD = d; best = j; }
    }
    ref[i] = best; dist[i] = bestD;
  }
  const count = new Int32Array(refs.length);
  for (let i = 0; i < c; i++) count[ref[i]]++;
  const open = refs.map(() => true), taken = new Uint8Array(last.length), out: number[] = [];
  while (out.length < need) {
    let j = -1;
    for (let r = 0; r < refs.length; r++) if (open[r] && (j < 0 || count[r] < count[j])) j = r;
    let pick = -1;
    for (let i = 0; i < last.length; i++) {
      if (!taken[i] && ref[c + i] === j && (pick < 0 || dist[c + i] < dist[c + pick])) pick = i;
    }
    if (pick < 0) { open[j] = false; continue; }
    taken[pick] = 1;
    out.push(pick);
    count[j]++;
  }
  return out;
}
