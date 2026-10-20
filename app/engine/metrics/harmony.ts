// Harmony and variety, proportion and coherence (pc/metrics/harmony.py; docs/metrics.md).
// Entropies are shown, not judged: harmony and variety pull against each other.
import { BUILDING, LANDSCAPE, STOREY_M } from "../config.js";
import type { Net } from "./network.js";

/** Shannon entropy of counts (in the order given), over ln(k): 0 all alike, 1 evenly spread. */
export function entropy(counts: number[], k: number): number {
  if (k < 2) return 0;
  let total = 0;
  for (const c of counts) total += c;
  if (!total) return 0;
  let h = 0;
  for (const c of counts) if (c > 0) { const p = c / total; h -= p * Math.log(p); }
  return h / Math.log(k);
}

/** Spread of storeys over building cells, against the tallest the rules allow. */
export function heightEntropy(net: Net): number {
  const { G, d } = net;
  let top = 0;
  for (let i = 0; i < G.n; i++) if (G.cap[i] > top) top = G.cap[i];
  const counts = new Array(Math.max(top, 1)).fill(0);
  for (let i = 0; i < G.n; i++) if (d.use[i] === BUILDING) counts[d.levels[i] - 1]++;
  return entropy(counts, top);
}

/** Spread over the three uses. */
export function useEntropy(net: Net): number {
  const counts = [0, 0, 0];
  for (let i = 0; i < net.G.n; i++) counts[net.d.use[i] - 1]++;
  return entropy(counts, 3);
}

/** Spread over five types: low (up to 4 storeys), mid (5 to 8) and tall buildings, landscape, water. */
export function typeEntropy(net: Net): number {
  const { G, d } = net, counts = [0, 0, 0, 0, 0];
  for (let i = 0; i < G.n; i++) {
    if (d.use[i] === BUILDING) counts[d.levels[i] <= 4 ? 0 : d.levels[i] <= 8 ? 1 : 2]++;
    else counts[d.use[i] === LANDSCAPE ? 3 : 4]++;
  }
  return entropy(counts, 5);
}

/** A small palette of reused proportions: blocks of three or more cells sorted by their plan
 *  shape (long side over short, from the spread of their cells) and their massing (height
 *  over the side of a square of the same area), each in half-octave steps. 1 when every
 *  block shares one proportion, 0 when no two do. The golden ratio gets no special credit. */
export function coherence(net: Net): number {
  const { G, d, blocks } = net, keys: number[] = [];
  for (const cells of blocks) {
    if (cells.length < 3) continue;
    let mx = 0, my = 0, lv = 0;
    for (const i of cells) { mx += G.x[i]; my += G.y[i]; lv += d.levels[i]; }
    const n = cells.length;
    mx /= n; my /= n; lv /= n;
    let sxx = 0, syy = 0, sxy = 0;
    for (const i of cells) {
      const x = G.x[i] - mx, y = G.y[i] - my;
      sxx += x * x; syy += y * y; sxy += x * y;
    }
    sxx /= n; syy /= n; sxy /= n;
    const t = sxx + syy, det = sxx * syy - sxy * sxy, root = Math.sqrt(Math.max((t * t) / 4 - det, 0));
    const big = t / 2 + root, small = t / 2 - root;
    const aspect = small > 0 ? Math.min(Math.sqrt(big / small), 8) : 8;
    const massing = (lv * STOREY_M) / Math.sqrt(n * G.cellArea);
    const ia = Math.min(Math.floor(Math.log2(aspect) * 2), 5);
    const im = Math.min(Math.max(Math.floor(Math.log2(massing) * 2), -8), 4);
    keys.push(ia * 100 + im);
  }
  if (keys.length < 2) return 1;
  const tally = new Map<number, number>();
  for (const k of keys) tally.set(k, (tally.get(k) ?? 0) + 1);
  const counts = [...tally.keys()].sort((a, b) => a - b).map((k) => tally.get(k)!);
  return 1 - entropy(counts, keys.length);
}

