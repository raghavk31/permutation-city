// Shock tests: one design under a higher sea, an extreme storm, or a heatwave (docs/shocks.md).
// Each says what fails and where, and gives the scores before and after.
//
//   sea level  the site's connected bathtub (pc/layers.py add_flood) at any level: land floods
//              if it is below the sea and the sea reaches it through land that is also below.
//              Flooded cells' storage is taken by the sea. A building loses every storey the
//              water rises above its plinth (PLINTH_M).
//   rain       a storm of any depth (a return period from docs/shocks.md, or typed). Each cell
//              holds what its use holds (the storage score's depths); the rest runs downhill
//              (the landform's flow directions), filling storage on the way. Water stands in the
//              site's hollows (the pool layer: priority-flood fill depth) when enough arrives to
//              fill them, and leaves at the edge of the design ground. No drains: in a storm
//              this rare they are full.
//   heatwave   each cell's hot-season surface temperature today (Landsat LST), with today's
//              land cover swapped for the design's (the heat score's own model, applied to both),
//              plus the heatwave's rise. Public ground (landscape and streets) hotter than
//              today's hottest tenth of the design ground counts as overheated.
//
// TS only, like the building scale: shocks read a design, they don't breed one.
import { BUILDING, HEAT, HEAT_PER_LEVEL, HEAT_REACH_M, LANDSCAPE, STOREY_M, WATER } from "./config.js";
import { evaluate, floorAreaTarget, heatField, storageDepth } from "./fitness.js";
import { passes } from "./graph.js";
import { smooth } from "./num.js";
import { sides } from "./streets.js";
import type { Design, Ground, Scores, SiteExport } from "./types.js";

export const PLINTH_M = 0.45;   // ground floor above the ground (Model Building Bye-Laws: at least 45 cm)
export const WET_M = 0.15;      // standing water deeper than this counts as flooded ground
export const HOT_QUANTILE = 0.9;

/** What the shocks need from the site beyond the design ground, per design cell. */
export interface ShockSite {
  cell: Int32Array;           // the grid cell under each design cell
  z: Float64Array;            // ground (m above mean sea level)
  pool: Float64Array;         // hollow depth (m)
  lst: Float64Array | null;   // hot-season surface temperature today (°C)
  today: Float64Array;        // the heat model on today's land cover (°C), smoothed like the score
  hot: number;                // today's hottest tenth: the LST it starts at (°C)
  coastal: boolean;
  grid: { n: number; deg: number; nbr: Int32Array; ground: Float64Array; sea: Uint8Array; water: Uint8Array };
}

const quantile = (v: number[], q: number) => {
  const s = v.filter(Number.isFinite).sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))] : NaN;
};

export function shockSite(site: SiteExport, G: Ground): ShockSite {
  const g = site.grid, L = g.layers ?? {}, n = g.x.length;
  const key = (x: number, y: number) => `${x}|${y}`, at = new Map<string, number>();
  for (let c = 0; c < n; c++) at.set(key(g.x[c], g.y[c]), c);
  const cell = Int32Array.from({ length: G.n }, (_, i) => at.get(key(G.x[i], G.y[i])) ?? -1);
  const col = (name: string, fallback: (number | null)[] | undefined = undefined) => {
    const v = L[name] ?? fallback;
    return Float64Array.from(cell, (c) => (c >= 0 && v ? v[c] ?? NaN : NaN));
  };
  const ground = Float64Array.from(L.ground ?? g.ground, (v) => v ?? NaN);
  const lstGrid = L.lst;
  const lst = lstGrid ? col("lst") : null;
  // Today's land cover through the heat score's model: footprints as roofs (with their
  // heights), vegetation as landscape, bare ground as unsealed, the rest sealed.
  const built = col("built", g.built), green = col("green", g.green), bare = col("bare"), bh = col("bldg_h");
  const dt = new Float64Array(G.n);
  for (let i = 0; i < G.n; i++) {
    const b = Number.isFinite(built[i]) ? built[i] : 0, gr = Number.isFinite(green[i]) ? green[i] : 0;
    const ba = Number.isFinite(bare[i]) ? bare[i] : 0, rest = Math.max(0, 1 - b - gr - ba);
    const levels = Number.isFinite(bh[i]) ? bh[i] / STOREY_M : 0;
    dt[i] = b * HEAT.roof + gr * HEAT.landscape + ba * HEAT.unsealed + rest * HEAT.sealed + HEAT_PER_LEVEL * levels * b;
  }
  const today = smooth(dt, G.nbr, G.deg, passes(HEAT_REACH_M, G.grid.spacing));
  const sea = Uint8Array.from(L.sea ?? [], (v) => (v ? 1 : 0)), water = Uint8Array.from(L.water ?? g.water, (v) => (v ? 1 : 0));
  return {
    cell, z: Float64Array.from(cell, (c) => (c >= 0 ? ground[c] : NaN)), pool: col("pool", g.pool), lst, today,
    hot: lst ? quantile(Array.from(lst), HOT_QUANTILE) : NaN,
    coastal: sea.some((v) => v === 1) && Object.keys(G.meta.sea_levels ?? {}).length > 0,
    grid: { n, deg: G.deg, nbr: Int32Array.from(g.nbr ?? []), ground, sea, water },
  };
}

/** What a shock did to the scores. Floor area is net, in ha; `gap` follows it. */
export interface ShockScores { scores: Scores; floorHa: number }
export interface ShockResult {
  before: ShockScores; after: ShockScores;
  /** Per design cell, what failed: 0 nothing, 1 a minor failure, 2 a serious one (see each shock). */
  fail: Uint8Array;
  /** Per design cell, the shock's own quantity (sea: flood depth m; rain: standing water m; heat: °C). */
  value: Float64Array;
  lines: string[];           // what failed, in words
}

function scoresOf(d: Design, G: Ground): ShockScores {
  const s = d.scores ?? evaluate(d, G);
  let fa = 0;
  for (let i = 0; i < G.n; i++) fa += d.floorArea[i];
  return { scores: { ...s }, floorHa: fa / 1e4 };
}

const round = (v: number, p: number) => Math.round(v * 10 ** p) / 10 ** p;

/** The design under a sea at `level` m above mean sea level. fail: 1 flooded ground,
 *  2 a building with water above its plinth. */
export function seaShock(d: Design, G: Ground, S: ShockSite, level: number): ShockResult {
  const before = scoresOf(d, G), a = G.cellArea, gr = S.grid;
  const wet = new Uint8Array(gr.n), queue: number[] = [];
  for (let c = 0; c < gr.n; c++) if (gr.sea[c]) { wet[c] = 1; queue.push(c); }
  for (let h = 0; h < queue.length; h++) {
    const c = queue[h];
    for (let k = 0; k < gr.deg; k++) {
      const o = gr.nbr[c * gr.deg + k];
      if (o >= 0 && !wet[o] && gr.ground[o] < level) { wet[o] = 1; queue.push(o); }
    }
  }
  const value = new Float64Array(G.n), fail = new Uint8Array(G.n);
  let held = 0, lost = 0, floodedCells = 0, buildings = 0, storeys = 0;
  for (let i = 0; i < G.n; i++) {
    const c = S.cell[i], depth = c >= 0 && wet[c] && !gr.water[c] ? level - S.z[i] : 0;
    value[i] = Math.max(0, depth);
    if (depth > 0) { floodedCells++; fail[i] = 1; } else held += storageDepth(d, G, i) * a;
    if (d.use[i] === BUILDING && depth > PLINTH_M) {
      const under = Math.min(d.levels[i], Math.ceil((depth - PLINTH_M) / STOREY_M));
      lost += d.floorArea[i] * (under / Math.max(1, d.levels[i]));
      buildings++; storeys += under; fail[i] = 2;
    }
  }
  const after = afterScores(before, G, held, lost);
  const ha = (k: number) => (k * a) / 1e4;
  return {
    before, after, fail, value,
    lines: [
      `${ha(floodedCells).toFixed(1)} ha of the design ground under water (${Math.round((floodedCells / G.n) * 100)}%)`,
      `${buildings} building cells with water above the plinth: ${storeys} storeys and ${(lost / 1e4).toFixed(1)} ha of floor lost`,
      `flooded storage no longer holds rain: flood storage ${pct(before.scores.storage)} → ${pct(after.scores.storage)}`,
    ],
  };
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

/** Scores after a shock that changed what the ground holds (`held`, m³, against the site's own
 *  design storm) or the floor area (`lostM2`). The other scores don't move. */
function afterScores(before: ShockScores, G: Ground, held: number, lostM2: number, storm = G.meta.design_storm_mm): ShockScores {
  const fa = before.floorHa * 1e4 - lostM2, target = floorAreaTarget(G);
  return {
    scores: { ...before.scores, storage: round(held / ((storm / 1000) * G.cellArea * G.n), 3), gap: round(Math.abs(fa - target) / target, 3) },
    floorHa: fa / 1e4,
  };
}

/** The design in a storm of `mm` millimetres. fail: 1 a pond or tank that filled and spilled,
 *  or standing water over WET_M; 2 a building with standing water above its plinth. */
export function rainShock(d: Design, G: Ground, S: ShockSite, mm: number): ShockResult {
  const before = scoresOf(d, G), n = G.n, a = G.cellArea, R = mm / 1000;
  const down = G.down ?? new Int32Array(n).fill(-1);
  // Upstream first: cells nothing drains into, then those whose upstream is done.
  const into = new Int32Array(n);
  for (let i = 0; i < n; i++) if (down[i] >= 0) into[down[i]]++;
  const order: number[] = [];
  for (let i = 0; i < n; i++) if (!into[i]) order.push(i);
  for (let h = 0; h < order.length; h++) { const j = down[order[h]]; if (j >= 0 && --into[j] === 0) order.push(j); }
  const inflow = new Float64Array(n), value = new Float64Array(n), fail = new Uint8Array(n);
  let held = 0, leaving = 0, spilled = 0, saturated = 0, standing = 0, buildings = 0;
  let ponds = 0, green = 0;
  for (let i = 0; i < n; i++) { if (d.use[i] === WATER) ponds++; else if (d.use[i] === LANDSCAPE) green++; }
  for (const i of order) {
    let v = inflow[i] + R * a;
    const cap = storageDepth(d, G, i) * a, kept = Math.min(v, cap);
    held += storageDepth(d, G, i) * a;
    v -= kept;
    // A pond or tank that fills and spills is storage failing; landscape that fills is only
    // saturated ground (it holds 10 cm), counted apart.
    if (v > 0 && d.use[i] === WATER) { spilled++; fail[i] = 1; }
    if (v > 0 && d.use[i] === LANDSCAPE) saturated++;
    const hollow = (Number.isFinite(S.pool[i]) ? S.pool[i] : 0) * a, pond = Math.min(v, hollow);
    value[i] = pond / a;
    v -= pond;
    if (value[i] > WET_M) { standing++; fail[i] = Math.max(fail[i], 1); }
    if (d.use[i] === BUILDING && value[i] > PLINTH_M) { buildings++; fail[i] = 2; }
    if (down[i] >= 0) inflow[down[i]] += v; else leaving += v;
  }
  // The storage score in this storm: what the ground holds against this storm's volume.
  const after = afterScores(before, G, held, 0, mm);
  const ha = (k: number) => ((k * a) / 1e4).toFixed(1);
  return {
    before, after, fail, value,
    lines: [
      `${spilled} of ${ponds} water cells (ponds, tanks) filled and spilled; ${pct(green ? saturated / green : 0)} of the landscape saturated`,
      `${ha(standing)} ha with standing water over ${WET_M * 100} cm; ${buildings} building cells with water above the plinth`,
      `${Math.round(leaving).toLocaleString("en-IN")} m³ ran off the design ground (${pct(leaving / (R * a * n))} of the rain)`,
      `flood storage against this storm ${pct(after.scores.storage)} (against the ${G.meta.design_storm_mm} mm design storm ${pct(before.scores.storage)})`,
    ],
  };
}

/** A battery of shocks (sea level, storm, heatwave; no sea inland) and what each did, in a
 *  few numbers: for comparing designs and growth strategies. */
export interface ShockBattery { sea: number | null; rain: number; heat: number }
export interface ShockSummary {
  sea: { flooded: number; floorLost: number; storage: number } | null;   // share of ground, share of floor, score after
  rain: { failed: number; buildings: number; storage: number };          // share of cells failing, building cells over the plinth, score in that storm
  heat: { overheated: number };                                          // share of public ground
}
export function shockSummary(d: Design, G: Ground, S: ShockSite, b: ShockBattery): ShockSummary {
  const count = (f: Uint8Array, min = 1) => f.reduce((s, v) => s + (v >= min ? 1 : 0), 0);
  let sea: ShockSummary["sea"] = null;
  if (b.sea !== null && S.coastal) {
    const r = seaShock(d, G, S, b.sea);
    sea = { flooded: count(r.fail) / G.n, floorLost: 1 - r.after.floorHa / Math.max(r.before.floorHa, 1e-9), storage: r.after.scores.storage };
  }
  const rain = rainShock(d, G, S, b.rain), heat = heatShock(d, G, S, b.heat);
  return {
    sea, rain: { failed: count(rain.fail) / G.n, buildings: count(rain.fail, 2), storage: rain.after.scores.storage },
    heat: { overheated: heat.share[1] },
  };
}

/** Each design cell's surface temperature in a heatwave `plus` °C hotter than today's hot
 *  season, and public ground (landscape cells and streets) above today's hottest tenth.
 *  fail: 1 an overheated street beside the cell, 2 the cell itself overheated public ground. */
export function heatShock(d: Design, G: Ground, S: ShockSite, plus: number): ShockResult & { share: [number, number] } {
  const before = scoresOf(d, G), n = G.n, a = G.cellArea;
  const value = new Float64Array(n), fail = new Uint8Array(n);
  if (!S.lst || !Number.isFinite(S.hot)) {
    return { before, after: before, fail, value, share: [0, 0], lines: ["no surface temperature for this site, so no heatwave test"] };
  }
  const field = heatField(d, G);
  for (let i = 0; i < n; i++) value[i] = S.lst[i] + (field[i] - S.today[i]);
  const share = (rise: number) => {
    let area = 0, hot = 0;
    for (let i = 0; i < n; i++) if (d.use[i] === LANDSCAPE && Number.isFinite(value[i])) {
      area += a; if (value[i] + rise > S.hot) hot += a;
    }
    if (d.street && d.streetWidths) {
      const sd = sides(G), edge = G.grid.edge;
      for (let s = 0; s < d.street.length; s++) {
        if (!d.street[s]) continue;
        const i = sd.cell[s], j = sd.other[s], t = j >= 0 ? (value[i] + value[j]) / 2 : value[i];
        if (!Number.isFinite(t)) continue;
        const w = edge * d.streetWidths[d.street[s]];
        area += w; if (t + rise > S.hot) hot += w;
      }
    }
    return area ? hot / area : 0;
  };
  const was = share(0), now = share(plus);
  for (let i = 0; i < n; i++) {
    value[i] += plus;
    if (d.use[i] === LANDSCAPE && value[i] > S.hot) fail[i] = 2;
  }
  if (d.street) {
    const sd = sides(G);
    for (let s = 0; s < d.street.length; s++) {
      if (!d.street[s]) continue;
      const i = sd.cell[s], j = sd.other[s], t = j >= 0 ? (value[i] + value[j]) / 2 : value[i];
      if (t > S.hot) { if (!fail[i]) fail[i] = 1; if (j >= 0 && !fail[j]) fail[j] = 1; }
    }
  }
  let hottest = -Infinity;
  for (let i = 0; i < n; i++) if (Number.isFinite(value[i]) && value[i] > hottest) hottest = value[i];
  return {
    before, after: before, fail, value, share: [was, now],
    lines: [
      `public ground (landscape and streets) over ${S.hot.toFixed(1)}°C, today's hottest tenth of the design ground: ${pct(was)} on a usual hot-season day, ${pct(now)} in the heatwave`,
      `hottest cell ${hottest.toFixed(1)}°C at the surface`,
      `the heat score (${before.scores.heat.toFixed(1)}°C) measures the design's own warming, which a heatwave doesn't change`,
    ],
  };
}
