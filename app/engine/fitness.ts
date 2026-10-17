// Scores (pc/fitness.py). See that file for what each score means and where it comes from.
import {
  BUILDING, CARBON_BASE, CARBON_FREE_LEVELS, CARBON_PER_LEVEL, DAYLIGHT_REACH_M, DAYLIGHT_TAN, HEAT,
  HEAT_PER_LEVEL, HEAT_REACH_M, HUMAN_MAX_LEVELS, LANDSCAPE, PLOT_STORAGE, STOREY_M, STORAGE_LANDSCAPE, STORAGE_WATER,
  WATER,
} from "./config";
import { passes } from "./graph";
import { roundTo, smooth } from "./num";
import type { Design, Ground, ScoreKey, Scores } from "./types";

// name: [label, format, higher is better]
export const SCORES: Record<ScoreKey, [string, (v: number) => string, boolean]> = {
  storage: ["flood storage", (v) => `${Math.round(v * 100)}%`, true],
  heat: ["heat", (v) => `+${v.toFixed(1)}°C`, false],
  carbon: ["embodied carbon", (v) => `${Math.round(v)} kg/m²`, false],
  daylight: ["daylight", (v) => `${Math.round(v * 100)}%`, true],
  human: ["human scale", (v) => `${Math.round(v * 100)}%`, true],
};
export const SCORE_KEYS = Object.keys(SCORES) as ScoreKey[];

export function floorAreaTarget(G: Ground): number {
  const m = G.meta;
  if (m.target_floor_area_ha) return m.target_floor_area_ha * 1e4;
  return m.target_far * G.cellArea * G.n;
}

function dilateMax(v: Float64Array, nbr: Int32Array, deg: number): Float64Array {
  const out = new Float64Array(v.length);
  for (let i = 0; i < v.length; i++) {
    let m = v[i];
    for (let k = 0; k < deg; k++) {
      const j = nbr[i * deg + k];
      if (j >= 0 && v[j] > m) m = v[j];
    }
    out[i] = m;
  }
  return out;
}

/** Score a design (pc.fitness.evaluate). stormFactor > 1 is a climate shock. */
export function evaluate(d: Design, G: Ground, stormFactor = 1.0): Scores {
  const n = G.n, a = G.cellArea, m = G.meta;
  let held = 0, totalFa = 0;
  for (let i = 0; i < n; i++) {
    const depth = d.use[i] === WATER ? STORAGE_WATER : d.use[i] === LANDSCAPE ? STORAGE_LANDSCAPE
      : G.minPerm[i] * PLOT_STORAGE;
    held += depth * a;
    totalFa += d.floorArea[i];
  }
  const storage = held / (m.design_storm_mm * stormFactor / 1000 * (a * n));

  const dt = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    if (d.use[i] === BUILDING) {
      const sealed = Math.min(Math.max(1 - d.coverage[i] - G.minPerm[i], 0), 1);
      dt[i] = d.coverage[i] * HEAT.roof + G.minPerm[i] * HEAT.unsealed + sealed * HEAT.sealed
        + HEAT_PER_LEVEL * d.levels[i];
    } else dt[i] = d.use[i] === WATER ? HEAT.water : HEAT.landscape;
  }
  const sm = smooth(dt, G.nbr, G.deg, passes(HEAT_REACH_M, G.grid.spacing));
  let heatSum = 0;
  for (let i = 0; i < n; i++) heatSum += sm[i] * a;
  const heat = heatSum / (a * n);

  let carbonSum = 0;
  for (let i = 0; i < n; i++) {
    const perM2 = CARBON_BASE * (1 + CARBON_PER_LEVEL * Math.max(d.levels[i] - CARBON_FREE_LEVELS, 0));
    carbonSum += perM2 * d.floorArea[i];
  }
  const carbon = totalFa ? carbonSum / totalFa : CARBON_BASE;

  // Daylight: floors below zMin sit under a 25° line from some building within ~100 m.
  const spacing = G.grid.spacing, rings = passes(DAYLIGHT_REACH_M, spacing);
  let hmax: Float64Array = Float64Array.from(d.levels, (lv) => lv * STOREY_M);
  const zMin = new Float64Array(n);
  for (let k = 1; k <= rings; k++) {
    hmax = dilateMax(hmax, G.nbr, G.deg);
    for (let i = 0; i < n; i++) zMin[i] = Math.max(zMin[i], hmax[i] - k * spacing * DAYLIGHT_TAN);
  }
  let litFa = 0;
  for (let i = 0; i < n; i++) {
    const lit = Math.min(Math.max(d.levels[i] - Math.ceil(zMin[i] / STOREY_M), 0), d.levels[i]);
    litFa += a * d.coverage[i] * lit;
  }
  const daylight = totalFa ? litFa / totalFa : 1.0;

  // Human scale: mid-rise share of floor area, and building cells fronting open space.
  let mid = 0, nb = 0, fronting = 0;
  for (let i = 0; i < n; i++) {
    if (d.levels[i] <= HUMAN_MAX_LEVELS) mid += d.floorArea[i];
    if (d.use[i] !== BUILDING) continue;
    nb++;
    for (let k = 0; k < G.deg; k++) {
      const j = G.nbr[i * G.deg + k];
      if (j >= 0 && (d.use[j] === LANDSCAPE || d.use[j] === WATER)) { fronting++; break; }
    }
  }
  const midrise = totalFa ? mid / totalFa : 1.0;
  const frontage = nb ? fronting / nb : 1.0;
  const human = (midrise + frontage) / 2;

  const target = floorAreaTarget(G);
  const gap = Math.abs(totalFa - target) / target;

  d.scores = {
    storage: roundTo(storage, 3), heat: roundTo(heat, 2), carbon: roundTo(carbon, 0),
    daylight: roundTo(daylight, 3), human: roundTo(human, 3), gap: roundTo(gap, 3),
  };
  d.floorHa = totalFa / 1e4;
  return d.scores;
}
