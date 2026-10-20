// Space syntax readouts and legibility (pc/metrics/syntax.py; docs/metrics.md, "Space syntax").
//
//   NAIN, NACH at 400 m, 800 m and Rn   means over the site's segments, weighted by length
//   intelligibility   Pearson r between R400 and Rn integration (NAIN) over the site's segments:
//                     how well what you see near you tells you about the whole (Hillier 1996)
//   integration core  the most integrated site segments at Rn, by NAIN, until they hold
//                     CORE_SHARE of the site's street length
//   legibility        mean of three parts, each 0 to 1:
//                       intelligibility (below zero counts as zero)
//                       centres on the core: the design's centres within NEAR_NODE_M of it
//                       landmarks seen: Phase 6 landmarks (network.ts `landmarks`: two standard
//                       deviations and two storeys above the mean height) that someone on the
//                       core sees, within LEGIBLE_M, over the buildings between
import { BUILDING, LEGIBLE_M, NEAR_NODE_M, STOREY_M } from "../config.js";
import { cellAt, RADII, syntaxOf, type Measures, type Syntax } from "../syntax.js";
import { landmarks, pearson, type Net } from "./network.js";

export const CORE_SHARE = 0.1;
export const EYE_M = 1.6;
export const CORE_STEP_M = 20.0;   // viewpoints along the core

/** Length-weighted mean of a per-segment measure over the site (skipping missing values). */
export function siteMean(S: Syntax, v: ArrayLike<number>): number {
  let s = 0, w = 0;
  for (let k = 0; k < S.N.site; k++) {
    if (!Number.isFinite(v[k])) continue;
    s += v[k] * S.N.len[k]; w += S.N.len[k];
  }
  return w ? s / w : 0;
}

const at = (S: Syntax, r: number): Measures => (r === Infinity ? S.rn : S.local.find((m) => m.radius === r)!);

export const nainMean = (r: number) => (net: Net, estimate = false) => {
  const S = syntaxOf(net.d, net.G, estimate);
  return siteMean(S, at(S, r).nain);
};
export const nachMean = (r: number) => (net: Net, estimate = false) => {
  const S = syntaxOf(net.d, net.G, estimate);
  return siteMean(S, at(S, r).nach!);
};

/** Site segments with an Rn value. */
const rnSegments = (S: Syntax) => {
  const out: number[] = [];
  for (let k = 0; k < S.N.site; k++) if (Number.isFinite(S.rn.nain[k])) out.push(k);
  return out;
};

export function intelligibility(net: Net, estimate = false): number {
  const S = syntaxOf(net.d, net.G, estimate), segs = rnSegments(S), local = at(S, RADII[0]);
  return pearson(segs.map((k) => local.nain[k]), segs.map((k) => S.rn.nain[k]));
}

/** The integration core: site segments in order of Rn NAIN until CORE_SHARE of the length. */
export function core(S: Syntax): number[] {
  const segs = rnSegments(S).sort((a, b) => S.rn.nain[b] - S.rn.nain[a] || a - b);
  let total = 0;
  for (const k of segs) total += S.N.len[k];
  const out: number[] = [];
  let sum = 0;
  for (const k of segs) {
    if (out.length && sum >= CORE_SHARE * total) break;
    out.push(k); sum += S.N.len[k];
  }
  return out;
}

function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
  const t = L2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L2)) : 0;
  const ex = px - ax - t * dx, ey = py - ay - t * dy;
  return Math.sqrt(ex * ex + ey * ey);
}

export function centresOnCore(net: Net, S: Syntax, c: number[]): number {
  const { G } = net, N = S.N;
  if (!net.centres.length) return 0;
  let on = 0;
  for (const i of net.centres) {
    if (c.some((s) => segDist(G.x[i], G.y[i], N.vx[N.a[s]], N.vy[N.a[s]], N.vx[N.b[s]], N.vy[N.b[s]]) <= NEAR_NODE_M)) on++;
  }
  return on / net.centres.length;
}

/** Viewpoints along the core: the middle of each CORE_STEP_M stretch of each core segment. */
export function viewpoints(S: Syntax, c: number[]): [number, number][] {
  const N = S.N, out: [number, number][] = [];
  for (const s of c) {
    const m = Math.max(1, Math.ceil(N.len[s] / CORE_STEP_M));
    for (let j = 0; j < m; j++) {
      const t = (j + 0.5) / m;
      out.push([N.vx[N.a[s]] + t * (N.vx[N.b[s]] - N.vx[N.a[s]]), N.vy[N.a[s]] + t * (N.vy[N.b[s]] - N.vy[N.a[s]])]);
    }
  }
  return out;
}

/** Can someone at (px, py) see the top of landmark cell L? The sightline runs from the eye to
 *  the landmark's top; a building cell on the way that rises above it blocks it. */
export function sees(net: Net, px: number, py: number, L: number): boolean {
  const { G, d } = net, dx = G.x[L] - px, dy = G.y[L] - py, dist = Math.sqrt(dx * dx + dy * dy);
  if (dist > LEGIBLE_M) return false;
  const top = d.levels[L] * STOREY_M, step = G.grid.spacing / 2, m = Math.floor(dist / step);
  for (let j = 1; j < m; j++) {
    const t = (j * step) / dist, c = cellAt(G, px + t * dx, py + t * dy);
    if (c < 0 || c === L || d.use[c] !== BUILDING) continue;
    if (d.levels[c] * STOREY_M > EYE_M + t * (top - EYE_M)) return false;
  }
  return true;
}

export function landmarksSeen(net: Net, S: Syntax, c: number[]): number {
  const marks = landmarks(net);
  if (!marks.length) return 0;
  const pts = viewpoints(S, c);
  let seen = 0;
  for (const L of marks) if (pts.some(([x, y]) => sees(net, x, y, L))) seen++;
  return seen / marks.length;
}

/** Legibility and its three parts. */
export function legibilityParts(net: Net, estimate = false) {
  const S = syntaxOf(net.d, net.G, estimate), c = core(S);
  const intel = intelligibility(net, estimate);
  const centres = centresOnCore(net, S, c), seen = landmarksSeen(net, S, c);
  return { intelligibility: intel, centres, landmarks: seen, core: c, legibility: (Math.max(0, intel) + centres + seen) / 3 };
}

export const legibility = (net: Net, estimate = false) => legibilityParts(net, estimate).legibility;
