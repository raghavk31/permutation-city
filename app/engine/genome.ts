// Genome → design (pc/genome.py). See that file for the body plan and the growth steps.
import {
  ATTRACTOR_GENES, BUILDING, DEFAULT_RANGES, GLOBAL_GENES, KINDS, LANDSCAPE, LENGTH, N_ATTRACTORS,
  WATER, type Ranges,
} from "./config";
import { lerp, norm, roundHalfEven, smooth } from "./num";
import type { Attractor, Design, Ground, Kind, Rng, Settings, Stats } from "./types";

export function decode(genome: number[], bounds: Ground["bounds"], ranges: Ranges = DEFAULT_RANGES) {
  const [xmin, ymin, xmax, ymax] = bounds;
  const diag = Math.sqrt((xmax - xmin) * (xmax - xmin) + (ymax - ymin) * (ymax - ymin));
  const attractors: Attractor[] = [];
  for (let k = 0; k < N_ATTRACTORS; k++) {
    const [x, y, r, w, kind] = genome.slice(k * ATTRACTOR_GENES, (k + 1) * ATTRACTOR_GENES);
    attractors.push({
      x: lerp(x, xmin, xmax), y: lerp(y, ymin, ymax),
      radius: lerp(r, ...ranges.radius) * diag, weight: lerp(w, ...ranges.weight),
      kind: KINDS[Math.min(Math.trunc(kind * KINDS.length), KINDS.length - 1)],
    });
  }
  const settings = {} as Settings;
  GLOBAL_GENES.forEach((name, i) => {
    settings[name] = lerp(genome[N_ATTRACTORS * ATTRACTOR_GENES + i], ...ranges[name]);
  });
  return { attractors, settings };
}

export const randomGenome = (rng: Rng): number[] => Array.from({ length: LENGTH }, () => rng.random());

/** Sum of attractor fields of one kind: weight × (1 - d/r)² inside the radius. */
function field(G: Ground, attractors: Attractor[], kind: Kind): Float64Array {
  const f = new Float64Array(G.n);
  for (const a of attractors) {
    if (a.kind !== kind) continue;
    for (let i = 0; i < G.n; i++) {
      const dx = G.x[i] - a.x, dy = G.y[i] - a.y;
      const t = Math.max(1 - Math.sqrt(dx * dx + dy * dy) / a.radius, 0);
      f[i] += a.weight * (t * t);
    }
  }
  return f;
}

/** Grow a design. `locked` (optional): a use code per cell, 0 = free. */
export function grow(genome: number[], G: Ground, locked: ArrayLike<number> | null = null,
  ranges: Ranges = DEFAULT_RANGES): Design {
  const { attractors, settings: s } = decode(genome, G.bounds, ranges);
  const n = G.n;
  const core = norm(field(G, attractors, "core"));
  const greenF = norm(field(G, attractors, "green"));
  const green = greenF.map((v, i) => v + 0.3 * G.trees[i]);
  const waterF = norm(smooth(field(G, attractors, "water"), G.nbr, 1));
  const water = waterF.map((v, i) => (1 - s.follow_water) * v + s.follow_water * G.siteWater[i]);

  const use = new Int8Array(n);
  const free = new Uint8Array(n).fill(1);
  if (locked) for (let i = 0; i < n; i++) if (locked[i] > 0) { use[i] = locked[i]; free[i] = 0; }

  const idxBuf = new Uint32Array(n);
  const claim = (score: Float64Array, eligible: boolean[], share: number, code: number) => {
    let have = 0, m = 0;
    for (let i = 0; i < n; i++) {
      if (use[i] === code) have++;
      if (eligible[i] && free[i]) idxBuf[m++] = i;
    }
    const k = Math.min(Math.max(roundHalfEven(share * n) - have, 0), m);
    if (k === 0) return;
    // The k highest scores; among equal scores, the earlier cells (as numpy's stable argsort
    // picks them). Native sort finds the k-th highest value; one pass takes the cells.
    const keys = new Float64Array(m);
    for (let t = 0; t < m; t++) keys[t] = score[idxBuf[t]];
    const threshold = keys.slice().sort()[m - k];
    let above = 0;
    for (let t = 0; t < m; t++) if (keys[t] > threshold) above++;
    let ties = k - above;
    for (let t = 0; t < m; t++) {
      const v = keys[t];
      if (v > threshold || (v === threshold && ties-- > 0)) { use[idxBuf[t]] = code; free[idxBuf[t]] = 0; }
    }
  };
  claim(water, G.canWater, s.water_share, WATER);
  claim(green.map((v, i) => v - 0.5 * core[i]), G.canGreen, s.green_share, LANDSCAPE);
  for (let i = 0; i < n; i++) {
    if (!free[i]) continue;
    use[i] = G.canBuild[i] ? BUILDING : G.canGreen[i] ? LANDSCAPE : WATER;
  }

  // Heights: peak < 1 spreads height out, > 1 concentrates it in towers; base lifts all.
  const levels = new Int32Array(n), coverage = new Float64Array(n), floorArea = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    if (use[i] !== BUILDING) continue;
    const rise = s.base + (1 - s.base) * Math.pow(core[i], s.peak);
    levels[i] = Math.min(Math.max(roundHalfEven(1 + (G.cap[i] - 1) * s.intensity * rise), 1), G.cap[i]);
    coverage[i] = Math.min(s.coverage, 1 - G.minPerm[i]);
    floorArea[i] = G.cellArea * coverage[i] * levels[i];
  }
  return { genome: Array.from(genome), use, levels, coverage, floorArea, attractors, settings: s, scores: null };
}

/** Design summary: shares of use, levels (pc.genome.stats). */
export function stats(d: Design, G: Ground): Stats {
  const n = G.n;
  const count = [0, 0, 0, 0];
  let lvSum = 0, lvMax = 0, nb = 0, fa = 0;
  for (let i = 0; i < n; i++) {
    count[d.use[i]]++;
    fa += d.floorArea[i];
    if (d.use[i] === BUILDING) { nb++; lvSum += d.levels[i]; lvMax = Math.max(lvMax, d.levels[i]); }
  }
  return {
    floor_area_ha: fa / 1e4, far: fa / (G.cellArea * n),
    building: count[1] / n, landscape: count[2] / n, water: count[3] / n,
    mean_levels: nb ? lvSum / nb : 0, max_levels: lvMax,
  };
}
