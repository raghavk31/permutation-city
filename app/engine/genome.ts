// Genome → design (pc/genome.py). See that file for the body plan and the growth steps.
import {
  ATTRACTOR_GENES, BUILDING, DEFAULT_RANGES, GENES_V3, GLOBAL_GENES, KINDS, LANDSCAPE, LENGTH, LENGTH_V3, N_ATTRACTORS,
  PRE_STREET_LENGTH, RANGES_V3, STREET_FRONT_RISE, STREET_GENE_DEFAULT, WATER, WATER_FIELD_REACH_M, type Ranges,
} from "./config.js";
import { growV3 } from "./plan/grow.js";
import { sides, streets } from "./streets.js";
import { passes } from "./graph.js";
import { lerp, norm, roundHalfEven, smooth } from "./num.js";
import type { Attractor, Design, Ground, Kind, Rng, Settings, SettingsV3, Stats } from "./types.js";

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

/** Decode a version 3 genome (LENGTH_V3 numbers): the attractors as before, then GENES_V3. */
export function decodeV3(genome: number[], bounds: Ground["bounds"], ranges: Ranges = DEFAULT_RANGES) {
  const { attractors } = decode(genome, bounds, ranges);
  const settings = {} as SettingsV3;
  GENES_V3.forEach((name, i) => {
    const r = (ranges as unknown as Record<string, readonly [number, number]>)[name] ?? RANGES_V3[name as keyof typeof RANGES_V3];
    (settings as unknown as Record<string, number>)[name] = lerp(genome[N_ATTRACTORS * ATTRACTOR_GENES + i], ...r);
  });
  return { attractors, settings };
}

/** A random genome: version 2 (LENGTH numbers) unless version 3 is asked for. */
export const randomGenome = (rng: Rng, version: 2 | 3 = 2): number[] =>
  Array.from({ length: version === 3 ? LENGTH_V3 : LENGTH }, () => rng.random());

/** Sum of attractor fields of one kind (or all kinds): weight × (1 - d/r)² inside the radius. */
export function field(G: Ground, attractors: Attractor[], kind: Kind | null): Float64Array {
  const f = new Float64Array(G.n);
  for (const a of attractors) {
    if (kind && a.kind !== kind) continue;
    for (let i = 0; i < G.n; i++) {
      const dx = G.x[i] - a.x, dy = G.y[i] - a.y;
      const t = Math.max(1 - Math.sqrt(dx * dx + dy * dy) / a.radius, 0);
      f[i] += a.weight * (t * t);
    }
  }
  return f;
}

/** A genome at the current length: a pre-street genome (47 numbers) gets the default street
 *  genes. Says which it was. */
export function upgrade(genome: number[]): [number[], boolean] {
  if (genome.length >= LENGTH) return [genome, false];  // version 2, or version 3 (grown elsewhere)
  if (genome.length !== PRE_STREET_LENGTH) throw new Error(`a genome has ${LENGTH} numbers (this one has ${genome.length})`);
  return [[...genome, ...Array(LENGTH - PRE_STREET_LENGTH).fill(STREET_GENE_DEFAULT)], true];
}

/** Where water, green and building go: water and green claim their shares of the cells where
 *  their fields are strongest, the rest is building (pc/genome.py). Shared by every version. */
export function claimUses(G: Ground, attractors: Attractor[], s: Pick<Settings, "water_share" | "green_share" | "follow_water">,
  locked: ArrayLike<number> | null): { use: Int8Array; core: Float64Array } {
  const n = G.n;
  const core = norm(field(G, attractors, "core"));
  const greenF = norm(field(G, attractors, "green"));
  const green = greenF.map((v, i) => v + 0.3 * G.trees[i]);
  const waterF = norm(smooth(field(G, attractors, "water"), G.nbr, G.deg, passes(WATER_FIELD_REACH_M, G.grid.spacing)));
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
  return { use, core };
}

/** Grow a design. `locked` (optional): a use code per cell, 0 = free. A version 3 genome
 *  (LENGTH_V3 numbers) grows a vector plan (plan/grow.ts); versions 1 and 2 grow as before. */
export function grow(genome: number[], G: Ground, locked: ArrayLike<number> | null = null,
  ranges: Ranges = DEFAULT_RANGES): Design {
  if (genome.length === LENGTH_V3) return growV3(genome, G, locked, ranges);
  const [full, preStreet] = upgrade(genome);
  genome = full;
  const { attractors, settings: s } = decode(genome, G.bounds, ranges);
  const st = streets(G, s);
  const n = G.n;
  const { use, core } = claimUses(G, attractors, s, locked);

  // No street between two water cells the genes made (it would be a causeway to nowhere).
  const sd = sides(G);
  for (let sid = 0; sid < st.cls.length; sid++) {
    const j = sd.other[sid];
    if (st.cls[sid] && st.cls[sid] < 3 && j >= 0 && use[sd.cell[sid]] === WATER && use[j] === WATER) {
      const take = (st.widths[st.cls[sid]] / 2) * G.grid.edge / G.cellArea;
      st.share[sd.cell[sid]] = Math.max(st.share[sd.cell[sid]] - take, 0);
      st.share[j] = Math.max(st.share[j] - take, 0);
      st.cls[sid] = 0;
    }
  }
  const fronts = new Uint8Array(n);
  for (let sid = 0; sid < st.cls.length; sid++) {
    if (!st.cls[sid]) continue;
    fronts[sd.cell[sid]] = 1;
    if (sd.other[sid] >= 0) fronts[sd.other[sid]] = 1;
  }

  // Heights: peak < 1 spreads height out, > 1 concentrates it in towers; base lifts all.
  // Buildings on a street rise a little higher. Coverage gives up what the streets take;
  // gross floor area is what it would be if they took nothing.
  const levels = new Int32Array(n), coverage = new Float64Array(n), floorArea = new Float64Array(n);
  let gross = 0;
  for (let i = 0; i < n; i++) {
    if (use[i] !== BUILDING) continue;
    let rise = s.base + (1 - s.base) * Math.pow(core[i], s.peak);
    if (fronts[i]) rise = Math.min(rise * STREET_FRONT_RISE, 1);
    levels[i] = Math.min(Math.max(roundHalfEven(1 + (G.cap[i] - 1) * s.intensity * rise), 1), G.cap[i]);
    // Coverage applies to the plot the streets leave: s.coverage of (1 - share), within the
    // permeable minimum.
    const open = Math.min(s.coverage, 1 - G.minPerm[i]);
    coverage[i] = Math.max(Math.min(s.coverage * (1 - st.share[i]), 1 - G.minPerm[i] - st.share[i]), 0);
    floorArea[i] = G.cellArea * coverage[i] * levels[i];
    gross += G.cellArea * open * levels[i];
  }
  return { genome: Array.from(genome), use, levels, coverage, floorArea, attractors, settings: s, scores: null,
    grossFloorArea: gross, street: st.cls, streetWidths: st.widths, ...(preStreet ? { preStreet } : {}) };
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
