// Permutation City: the browser engine.
//
// A line-for-line port of pc/genome.py (growth), pc/fitness.py (scores, Pareto ranks,
// families) and pc/evolve.py (evolution), reading a site exported by `pc export`.
// web/test/parity.mjs checks that it grows and scores designs exactly as Python does.
//
// No dependencies. Works in the browser (as a module or in a Web Worker) and in Node.

export const N_ATTRACTORS = 8;
export const ATTRACTOR_GENES = 5;
export const GLOBAL_GENES = ["water_share", "green_share", "follow_water", "coverage", "peak", "intensity", "base"];
export const LENGTH = N_ATTRACTORS * ATTRACTOR_GENES + GLOBAL_GENES.length;
export const KINDS = ["core", "green", "water"];
export const USES = ["building", "landscape", "water"]; // use codes 1, 2, 3 (0 = none)
const BUILDING = 1, LANDSCAPE = 2, WATER = 3;

// Fitness constants (pc/fitness.py)
const STORAGE_WATER = 1.0, STORAGE_LANDSCAPE = 0.10, PLOT_STORAGE = 0.05;
const HEAT = { sealed: 5.0, roof: 4.0, unsealed: 1.0, landscape: 0.5, water: -2.0 };
const HEAT_PER_LEVEL = 0.1;
const CARBON_BASE = 400.0, CARBON_FREE_LEVELS = 6, CARBON_PER_LEVEL = 0.02;
const STOREY_M = 3.2;
const DAYLIGHT_RINGS = 3, DAYLIGHT_TAN = 0.4663076581549986; // tan(25°)
const HUMAN_MAX_LEVELS = 8;
export const TARGET_TOLERANCE = 0.10;
export const DUPLICATE = 0.05;

// name: [label, format, higher is better]
export const SCORES = {
  storage: ["flood storage", (v) => `${Math.round(v * 100)}%`, true],
  heat: ["heat", (v) => `+${v.toFixed(1)}°C`, false],
  carbon: ["embodied carbon", (v) => `${Math.round(v)} kg/m²`, false],
  daylight: ["daylight", (v) => `${Math.round(v * 100)}%`, true],
  human: ["human scale", (v) => `${Math.round(v * 100)}%`, true],
};
const SCORE_KEYS = Object.keys(SCORES);

// --- numbers, as Python does them -----------------------------------------------------

/** Round half to even (Python's round / numpy's round). */
export function roundHalfEven(x) {
  const f = Math.floor(x), d = x - f;
  if (d > 0.5) return f + 1;
  if (d < 0.5) return f;
  return f % 2 === 0 ? f : f + 1;
}

/** Python's round(x, nd), close enough for scores (ties are vanishingly rare). */
function roundTo(x, nd) {
  const p = 10 ** nd;
  return roundHalfEven(x * p) / p;
}

const lerp = (g, lo, hi) => lo + g * (hi - lo);

function norm(v) {
  let top = -Infinity;
  for (const x of v) if (x > top) top = x;
  if (!(top > 0)) return v;
  return v.map((x) => x / top);
}

/** Average each cell with its neighbours, a few times over (pc.genome.smooth). */
export function smooth(v, nbr, passes = 2) {
  const n = v.length;
  let cur = Float64Array.from(v);
  for (let p = 0; p < passes; p++) {
    const next = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let s = 0, c = 0;
      for (let k = 0; k < 6; k++) {
        const j = nbr[i * 6 + k];
        if (j >= 0) { s += cur[j]; c++; } else s += 0;
      }
      next[i] = (cur[i] + s) / (1 + c);
    }
    cur = next;
  }
  return cur;
}

// --- the site's design ground ---------------------------------------------------------

/** The engine's view of an exported site (pc.export.ground_from_export). */
export function prepare(site) {
  const d = site.design, n = d.x.length;
  let xmin = Infinity, ymin = Infinity, xmax = -Infinity, ymax = -Infinity;
  for (let i = 0; i < n; i++) {
    if (d.x[i] < xmin) xmin = d.x[i];
    if (d.x[i] > xmax) xmax = d.x[i];
    if (d.y[i] < ymin) ymin = d.y[i];
    if (d.y[i] > ymax) ymax = d.y[i];
  }
  return {
    n, x: Float64Array.from(d.x), y: Float64Array.from(d.y),
    nbr: Int32Array.from(d.nbr),
    canBuild: d.can.map((c) => (c & 1) > 0), canGreen: d.can.map((c) => (c & 2) > 0),
    canWater: d.can.map((c) => (c & 4) > 0),
    cap: Float64Array.from(d.cap), minPerm: Float64Array.from(d.min_perm),
    trees: Float64Array.from(d.trees), siteWater: Float64Array.from(d.site_water),
    cellArea: site.meta.cell_area, bounds: [xmin, ymin, xmax, ymax],
    meta: site.meta,
  };
}

// --- genome → design ------------------------------------------------------------------

export function decode(genome, bounds) {
  const [xmin, ymin, xmax, ymax] = bounds;
  const diag = Math.sqrt((xmax - xmin) * (xmax - xmin) + (ymax - ymin) * (ymax - ymin));
  const attractors = [];
  for (let k = 0; k < N_ATTRACTORS; k++) {
    const [x, y, r, w, kind] = genome.slice(k * ATTRACTOR_GENES, (k + 1) * ATTRACTOR_GENES);
    attractors.push({
      x: lerp(x, xmin, xmax), y: lerp(y, ymin, ymax),
      radius: lerp(r, 0.04, 0.30) * diag, weight: lerp(w, 0.2, 1.0),
      kind: KINDS[Math.min(Math.trunc(kind * KINDS.length), KINDS.length - 1)],
    });
  }
  const g = {};
  GLOBAL_GENES.forEach((name, i) => { g[name] = genome[N_ATTRACTORS * ATTRACTOR_GENES + i]; });
  const settings = {
    water_share: lerp(g.water_share, 0.05, 0.30),
    green_share: lerp(g.green_share, 0.10, 0.45),
    follow_water: g.follow_water,
    coverage: lerp(g.coverage, 0.35, 0.80),
    peak: lerp(g.peak, 0.5, 3.0),
    intensity: lerp(g.intensity, 0.25, 1.0),
    base: lerp(g.base, 0.0, 0.6),
  };
  return { attractors, settings };
}

function field(G, attractors, kind) {
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
export function grow(genome, G, locked = null) {
  const { attractors, settings: s } = decode(genome, G.bounds);
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
  const claim = (score, eligible, share, code) => {
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

// --- scores ---------------------------------------------------------------------------

export function floorAreaTarget(G) {
  const m = G.meta;
  if (m.target_floor_area_ha) return m.target_floor_area_ha * 1e4;
  return m.target_far * G.cellArea * G.n;
}

function dilateMax(v, nbr) {
  const out = new Float64Array(v.length);
  for (let i = 0; i < v.length; i++) {
    let m = v[i];
    for (let k = 0; k < 6; k++) {
      const j = nbr[i * 6 + k];
      if (j >= 0 && v[j] > m) m = v[j];
    }
    out[i] = m;
  }
  return out;
}

/** Score a design (pc.fitness.evaluate). stormFactor > 1 is a climate shock. */
export function evaluate(d, G, stormFactor = 1.0) {
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
  const sm = smooth(dt, G.nbr, 3);
  let heatSum = 0;
  for (let i = 0; i < n; i++) heatSum += sm[i] * a;
  const heat = heatSum / (a * n);

  let carbonSum = 0;
  for (let i = 0; i < n; i++) {
    const perM2 = CARBON_BASE * (1 + CARBON_PER_LEVEL * Math.max(d.levels[i] - CARBON_FREE_LEVELS, 0));
    carbonSum += perM2 * d.floorArea[i];
  }
  const carbon = totalFa ? carbonSum / totalFa : CARBON_BASE;

  const spacing = Math.sqrt(3) * m.hex_radius;
  let hmax = Float64Array.from(d.levels, (lv) => lv * STOREY_M);
  const zMin = new Float64Array(n);
  for (let k = 1; k <= DAYLIGHT_RINGS; k++) {
    hmax = dilateMax(hmax, G.nbr);
    for (let i = 0; i < n; i++) zMin[i] = Math.max(zMin[i], hmax[i] - k * spacing * DAYLIGHT_TAN);
  }
  let litFa = 0;
  for (let i = 0; i < n; i++) {
    const lit = Math.min(Math.max(d.levels[i] - Math.ceil(zMin[i] / STOREY_M), 0), d.levels[i]);
    litFa += a * d.coverage[i] * lit;
  }
  const daylight = totalFa ? litFa / totalFa : 1.0;

  let mid = 0, nb = 0, fronting = 0;
  for (let i = 0; i < n; i++) {
    if (d.levels[i] <= HUMAN_MAX_LEVELS) mid += d.floorArea[i];
    if (d.use[i] !== BUILDING) continue;
    nb++;
    for (let k = 0; k < 6; k++) {
      const j = G.nbr[i * 6 + k];
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

/** Design summary: shares of use, levels (pc.genome.stats). */
export function stats(d, G) {
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

// --- ranking --------------------------------------------------------------------------

const asMin = (s) => SCORE_KEYS.map((k) => (SCORES[k][2] ? -s[k] : s[k]));

function fronts(f) {
  const n = f.length, rank = new Int32Array(n);
  const dominates = (j, i) => {
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
export function paretoRanks(scores, tol = TARGET_TOLERANCE) {
  const n = scores.length, rank = new Int32Array(n);
  const on = [], off = [];
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
export function crowding(scores, idx) {
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
export function difference(a, b, stop = 1) {
  const n = a.length, limit = stop * n;
  let diff = 0;
  for (let i = 0; i < n; i++) if (a[i] !== b[i] && ++diff > limit) return diff / n;
  return diff / n;
}

/** Group designs into families: best first; a design joins the first family whose founder
 *  it is within `threshold` of, otherwise it founds a new one. */
export function families(uses, order, threshold = 0.15) {
  const fams = [];
  for (const i of order) {
    const fam = fams.find((f) => difference(uses[f[0]], uses[i], threshold) < threshold);
    if (fam) fam.push(i); else fams.push([i]);
  }
  return fams;
}

// --- evolution ------------------------------------------------------------------------

/** Seeded random numbers (mulberry32) with normal draws (Box-Muller). */
export function makeRng(seed = 1) {
  let t = seed >>> 0;
  const random = () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
  const normal = (mu = 0, sigma = 1) => {
    const u = 1 - random(), v = random();
    return mu + sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  return { random, normal };
}

export const randomGenome = (rng) => Array.from({ length: LENGTH }, () => rng.random());

function crossover(a, b, rng, pA = 0.6) {
  const child = b.slice();
  const nAtt = N_ATTRACTORS * ATTRACTOR_GENES;
  for (let k = 0; k < N_ATTRACTORS; k++) {
    if (rng.random() < pA) for (let g = k * ATTRACTOR_GENES; g < (k + 1) * ATTRACTOR_GENES; g++) child[g] = a[g];
  }
  for (let g = nAtt; g < LENGTH; g++) if (rng.random() < pA) child[g] = a[g];
  return child;
}

function mutate(g, rng, rate = 2 / LENGTH, sigma = 0.12) {
  return g.map((v) => (rng.random() < rate ? Math.min(Math.max(v + rng.normal(0, sigma), 0), 1) : v));
}

/** Children of two genomes, for breeding by hand. */
export function breed(a, b, rng, n = 6) {
  return Array.from({ length: n }, () => mutate(crossover(a, b, rng), rng));
}

function rank(inds) {
  const scores = inds.map((i) => i.design.scores);
  const r = paretoRanks(scores);
  for (const level of new Set(r)) {
    const idx = [...r.keys()].filter((i) => r[i] === level);
    const c = crowding(scores, idx);
    idx.forEach((i, k) => { inds[i].rank = level; inds[i].crowd = c[k]; });
  }
  // Copies: within 5% of a better design → pushed to the back, so families keep their places.
  const order = [...inds.keys()].sort((a, b) => inds[a].rank - inds[b].rank || inds[b].crowd - inds[a].crowd);
  const kept = [];
  for (const i of order) {
    if (kept.some((j) => difference(inds[i].design.use, inds[j].design.use, DUPLICATE) < DUPLICATE)) inds[i].rank += 1000;
    else kept.push(i);
  }
}

const better = (a, b) => (a.rank < b.rank || (a.rank === b.rank && a.crowd > b.crowd) ? a : b);

/**
 * Breed `generations` of `pop` designs (pc.evolve.evolve).
 * options: seed, immigrants, locked (use code per cell), shock [generation, stormFactor],
 *          start (genomes for Generation 0), progress(gen, run) callback
 */
export function evolve(G, { generations = 30, pop = 60, seed = 1, immigrants = 0.1, locked = null,
  shock = null, start = null, progress = null } = {}) {
  const rng = makeRng(seed);
  let storm = 1.0;
  const make = (g, name, parents) => {
    const design = grow(g, G, locked);
    evaluate(design, G, storm);
    return { name, design, parents, rank: 0, crowd: 0 };
  };
  const genomes = Array.from({ length: pop }, () => randomGenome(rng));
  (start || []).forEach((g, k) => { genomes[k % pop] = g.slice(); });
  const run = { pop: genomes.map((g, k) => make(g, `G0.${String(k + 1).padStart(2, "0")}`, [])), history: [], everyone: 0 };
  run.everyone = run.pop.length;
  rank(run.pop);
  record(run, 0, storm);
  progress?.(0, run);

  for (let gen = 1; gen <= generations; gen++) {
    if (shock && gen === shock[0]) {
      storm = shock[1];
      for (const i of run.pop) evaluate(i.design, G, storm);
      rank(run.pop);
    }
    const children = [];
    for (let k = 0; k < pop; k++) {
      const name = `G${gen}.${String(k + 1).padStart(2, "0")}`;
      if (rng.random() < immigrants) { children.push(make(randomGenome(rng), name, ["immigrant"])); continue; }
      const pick = () => {
        const i = Math.floor(rng.random() * run.pop.length);
        let j = Math.floor(rng.random() * (run.pop.length - 1));
        if (j >= i) j++;
        return better(run.pop[i], run.pop[j]);
      };
      const pa = pick(), pb = pick();
      children.push(make(mutate(crossover(pa.design.genome, pb.design.genome, rng), rng), name, [pa.name, pb.name]));
    }
    run.everyone += children.length;
    const both = run.pop.concat(children);
    rank(both);
    both.sort((a, b) => a.rank - b.rank || b.crowd - a.crowd);
    run.pop = both.slice(0, pop);
    rank(run.pop);
    record(run, gen, storm);
    progress?.(gen, run);
  }
  return run;
}

function record(run, gen, storm) {
  const on = run.pop.filter((i) => i.design.scores.gap <= TARGET_TOLERANCE);
  const h = { generation: gen, on_brief: on.length, front_size: run.pop.filter((i) => i.rank === 1).length,
    storm_factor: storm };
  for (const k of SCORE_KEYS) {
    const vals = on.map((i) => i.design.scores[k]);
    h[k] = vals.length ? (SCORES[k][2] ? Math.max(...vals) : Math.min(...vals)) : null;
  }
  run.history.push(h);
}

/** The final front, grouped into families, one representative each (best first). */
export function frontFamilies(run, threshold = 0.15) {
  const front = run.pop.filter((i) => i.rank === 1).sort((a, b) => b.crowd - a.crowd);
  const fams = families(front.map((i) => i.design.use), [...front.keys()], threshold);
  return fams.map((f) => ({ lead: front[f[0]], members: f.map((k) => front[k]) }));
}
