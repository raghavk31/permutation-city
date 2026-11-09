// Open ground's grammar (architecture-v3 section 14, step P2): the shape of a public space as a
// few genes per family, each a ratio or a share where it can be (ratios carry across sizes,
// sizes don't), a size only where a size is the rule (a pond's depth for safety, a schoolyard's
// 30 cm). A shape and the land it is given (m²) make grammar parameters, so the library's
// drawing and measures serve it unchanged; the measures are what P5's scores will read.
//
// Each gene has hard limits (what the shape allows) and the spread the library's members of the
// family actually take (`spread`): the search starts inside the spread and may drift to the
// limits, as buildings do in part B. Streets are their own system (P4) and have no genes here.
import type { Params } from "./grammar.js";
import { EDGE_SECTIONS } from "./library/edgesections.js";
import type { Confidence, OpenFamily, Precedent } from "./types.js";

export interface OpenGene {
  key: string;
  /** In plain words: "How deep, for its width". */
  name: string;
  /** The rule as a ratio, a share or (only where it must be) a size. */
  rule: string;
  lo: number;
  hi: number;
  unit?: string;
  /** Whole numbers only (levels, units). */
  whole?: boolean;
  /** Where the limits come from. */
  why: string;
  conf: Confidence;
}

export type ShapedFamily = Exclude<OpenFamily, "street">;
export type Shape = Record<string, number>;

export const OPEN_GENES: Record<ShapedFamily, OpenGene[]> = {
  stepped: [
    { key: "aspect", name: "How long, for its width", rule: "longer side ÷ shorter side", lo: 1, hi: 4, why: "the library's stepwells reach about 3.2; tanks and squares are near 1", conf: "medium" },
    { key: "depth", name: "How deep, for its width", rule: "depth ÷ shorter side", lo: 0.02, hi: 1.4, why: "from a water square (0.05) to Rani ki Vav (1.35)", conf: "medium" },
    { key: "levels", name: "Levels of steps", rule: "levels down to the floor", lo: 1, hi: 14, whole: true, why: "Chand Baori has 13", conf: "low" },
    { key: "around", name: "Steps on every side, or down its length", rule: "1 on every side (a kund), 0 down the length (a stepwell)", lo: 0, hi: 1, whole: true, why: "the two ways the library's pits step down", conf: "high" },
    { key: "wet", name: "How high the water comes", rule: "depth under water on the wet day ÷ depth", lo: 0, hi: 1, why: "dry to full; most are assumed", conf: "assumed" },
    { key: "rim", name: "Galleries round the top", rule: "storeys of colonnade at the rim", lo: 0, hi: 3, whole: true, why: "kalyanis have one or two; Chand Baori a pavilion of three", conf: "low" },
  ],
  basin: [
    { key: "aspect", name: "How long, for its width", rule: "longer side ÷ shorter side", lo: 1, hi: 4, why: "assumed: the library's basins are drawn as grids near square", conf: "assumed" },
    { key: "water", name: "Share under water when full", rule: "water area ÷ land", lo: 0.1, hi: 0.9, why: "wetland parks keep paths and islands dry", conf: "assumed" },
    { key: "cells", name: "Ponds in the chain", rule: "number of ponds", lo: 1, hi: 16, whole: true, why: "one tank to a field of ponds (Qunli, Benjakitti)", conf: "low" },
    { key: "depth", name: "How deep the water stands", rule: "depth when full (a size: safety and soil set it, not proportion)", lo: 0.3, hi: 3, unit: "m", why: "a wetland's 0.3 m to a tank's 3 m", conf: "low" },
    { key: "trees", name: "Trees on the dry ground", rule: "crown cover ÷ dry land", lo: 0, hi: 0.6, why: "open meadow to a wetland forest", conf: "assumed" },
  ],
  linear: [
    { key: "aspect", name: "How long, for its width", rule: "length ÷ width", lo: 3, hi: 40, why: "a stretch of a stream park; whole ones run far longer", conf: "assumed" },
    { key: "channel", name: "Share of the width that is water", rule: "channel width ÷ width", lo: 0.05, hi: 0.7, why: "a rill in a garden to a river with banks", conf: "assumed" },
    { key: "banks", name: "Steps of bank", rule: "levels from the edge to the water", lo: 1, hi: 4, whole: true, why: "a walk at street level and one by the water, or terraces", conf: "low" },
    { key: "depth", name: "How far below the street", rule: "depth (a size: flood and access set it)", lo: 0.2, hi: 6, unit: "m", why: "Cheonggyecheon about 5 m below the street", conf: "medium" },
    { key: "wet", name: "How high a flood comes", rule: "depth under water in a flood ÷ depth", lo: 0, hi: 1, why: "assumed", conf: "assumed" },
    { key: "trees", name: "Trees on the banks", rule: "crown cover ÷ banks", lo: 0, hi: 0.6, why: "assumed", conf: "assumed" },
  ],
  edge: [
    { key: "reach", name: "How far from street to water", rule: "width of the section (a size: land and flood set it)", lo: 5, hi: 350, unit: "m", why: "Lyon's lower level is 5 m at its thinnest; the Waal's dike moved back 350 m", conf: "medium" },
    { key: "drop", name: "How far down to the water", rule: "street to low water (a size: the place sets it)", lo: 1, hi: 15, unit: "m", why: "assumed: our terrain at Agra reads about 5 m at Mehtab Bagh and 11 m at the Taj's garden", conf: "low" },
    { key: "tiers", name: "Levels", rule: "flat levels from the street to the water", lo: 1, hi: 8, whole: true, why: "one floodplain to a ghat's many platforms", conf: "low" },
    { key: "low", name: "How high the lowest level", rule: "height of the lowest level ÷ the drop", lo: 0, hi: 1, why: "at the water like a ghat, or high over it like a Mughal terrace", conf: "low" },
    { key: "lowWide", name: "How wide the lowest level", rule: "its share of the level ground", lo: 0.05, hi: 0.9, why: "a ghat's narrow lowest step to a floodplain that's nearly all lowest level; assumed", conf: "assumed" },
    { key: "wall", name: "Wall or bank", rule: "1 a wall between levels, 0 a planted bank", lo: 0, hi: 1, why: "a Mughal river wall to Buffalo Bayou's banks", conf: "medium" },
    { key: "bank", name: "How steep a bank", rule: "rise ÷ run", lo: 0.05, hi: 0.5, why: "Buffalo Bayou: 1 in 3 or 4 preferred, and planted 1 in 2 failed in places in Harvey", conf: "high" },
    { key: "wet", name: "How high a flood comes", rule: "height of the flood ÷ the drop", lo: 0, hi: 1, why: "most are assumed; at a real place the river's record sets it", conf: "assumed" },
    { key: "trees", name: "Trees on the dry ground", rule: "crown cover ÷ land", lo: 0, hi: 0.6, why: "bare stone at a ghat to Buffalo Bayou's woodland; assumed", conf: "assumed" },
  ],
  canopy: [
    { key: "cover", name: "Share of the ground shaded", rule: "roof or crown area ÷ area", lo: 0.1, hi: 1, why: "a single tree to Medina's umbrellas touching edge to edge", conf: "medium" },
    { key: "height", name: "How high, for its span", rule: "height ÷ span of one roof or crown", lo: 0.1, hi: 1.5, why: "a toguna's low roof to a tall umbrella (Medina 0.6); a tree's crown sets its own", conf: "medium" },
    { key: "units", name: "Roofs or trees", rule: "number of roofs or trees", lo: 1, hi: 36, whole: true, why: "one tree (katte) to many umbrellas", conf: "low" },
    { key: "trees", name: "Trees or roofs", rule: "1 trees, 0 roofs on posts", lo: 0, hi: 1, whole: true, why: "the two kinds of shade in the library", conf: "high" },
  ],
  field: [
    { key: "aspect", name: "How long, for its width", rule: "longer side ÷ shorter side", lo: 1, hi: 2.5, why: "a playfield is about 1.5; a maidan up to 2", conf: "low" },
    { key: "sunk", name: "How far it is lowered", rule: "depth below its edges (a size: safety sets it)", lo: 0, hi: 1, unit: "m", why: "Japan's guide: 30 cm at most for schools, 20 for children's parks; about 1 m in Copenhagen's Enghave Park", conf: "medium" },
    { key: "banks", name: "Steps down from the edge", rule: "levels of seating bank", lo: 1, hi: 3, whole: true, why: "assumed", conf: "assumed" },
    { key: "edge", name: "Trees round the edge", rule: "share of the edge planted (a tree every 8 m)", lo: 0, hi: 1, why: "the maidans' rings of trees", conf: "assumed" },
  ],
  doorstep: [
    { key: "enclosure", name: "How enclosed", rule: "height of the edge ÷ width of the space", lo: 0.3, hi: 3, why: "Paley Park about 2.5; a pol's chowk about 1-2; a van Eyck corner under 1", conf: "low" },
    { key: "sides", name: "Sides with doors", rule: "share of the edge with doors on it (in quarters)", lo: 0.25, hi: 1, why: "a corner to a court lined all round", conf: "assumed" },
    { key: "trees", name: "Trees", rule: "crown cover ÷ area", lo: 0, hi: 0.6, why: "Paley Park's honey locusts cover most of it", conf: "low" },
  ],
};

/** Land for the drawings at each family's usual size (m²), assumed. */
export const OPEN_AREA: Record<ShapedFamily, number> = { stepped: 900, basin: 6000, linear: 4000, edge: 8000, canopy: 1600, field: 6000, doorstep: 400 };

/** One level of a river's edge: its height above low water, the flat tread, then the bank below it
 *  (run and how far it falls). A wall has no run. */
export interface EdgeTier { z: number; tread: number; bank: number; below: number }

/** A river edge's section, street first, from its genes. Levels are evenly spaced from the street
 *  down to the lowest level, which stands `low` × drop above low water, and that last bit is a bank
 *  or wall too. Banks are shortened to fit if the reach is too small to hold them. */
export function edgeSection(s0: Shape): EdgeTier[] {
  const s = clampShape("edge", s0), n = s.tiers, lowest = s.low * s.drop, top = s.drop;
  const step = n > 1 ? (top - lowest) / (n - 1) : 0;
  const zs = Array.from({ length: n }, (_, k) => (n > 1 ? top - k * step : top));
  // n = 1 stands at the street; what's left of the drop is the bank to the water
  const falls = zs.map((z, k) => (k + 1 < n ? z - zs[k + 1] : z));
  const runs = falls.map((f) => (f * (1 - s.wall)) / s.bank);
  const total = runs.reduce((a, r) => a + r, 0), room = s.reach * MIN_BANK_SHARE, fit = total > room ? room / total : 1;
  const banks = runs.map((r) => r * fit), level = s.reach - banks.reduce((a, b) => a + b, 0);
  // the lowest level takes its share of the level ground, and the rest share what's left
  const lowest_ = n > 1 ? level * s.lowWide : level, others = n > 1 ? (level - lowest_) / (n - 1) : 0;
  return zs.map((z, k) => ({ z, tread: k === n - 1 ? lowest_ : others, bank: banks[k], below: z - falls[k] / 2 }));
}

const CROWN_M2 = Math.PI * 5 * 5;     // a tree's crown about 10 m across (assumed, as plotnature.ts)
const TREE_EVERY_M = 8;               // trees on an edge, one every 8 m (assumed)
const SEAT_RISE_M = 0.6;              // a step this high or lower is a seat (assumed)
const WING_M = 8;                     // depth of the buildings round a doorstep space (assumed)
const EDGE_MIN_STRETCH_M = 60;        // a river edge is drawn at least this long, so a wide one still reads along the river
const EDGE_MAX_STRETCH_M = 350;       // and no longer than this, so a thin one isn't a hairline
const EDGE_MIN_LONG = 0.9;            // a river edge is drawn at least this long for its reach, so a square garden doesn't read as a strip
const EDGE_PLANTED = 0.15;            // with this much crown cover an edge is drawn as planted ground, and with less as stone or paving (assumed)
const MIN_BANK_SHARE = 0.8;          // banks may take this much of a river edge's reach; the rest stays level (assumed)

const clampGene = (g: OpenGene, v: number) => { const c = Math.min(g.hi, Math.max(g.lo, v)); return g.whole ? Math.round(c) : c; };
/** A shape with every gene inside its limits (whole numbers rounded). */
export function clampShape(f: ShapedFamily, s: Shape): Shape {
  return Object.fromEntries(OPEN_GENES[f].map((g) => [g.key, clampGene(g, s[g.key] ?? (g.lo + g.hi) / 2)]));
}

/** A shape's plan: the long side and the short side of `area` (m²). */
const sides = (area: number, aspect: number) => { const L = Math.sqrt(area * aspect); return [L, area / L] as const; };

/** Grammar parameters for a shape on `area` m²: the dry day, or the wet day (`wet` true). */
export function shapeParams(f: ShapedFamily, s0: Shape, area: number, wet = false): Params {
  const s = clampShape(f, s0);
  switch (f) {
    case "stepped": {
      const [L, B] = sides(area, s.aspect), dz = s.depth * B;
      return { arrangement: "sunken", width: L, depth: B, storeys: s.rim, count: s.rim > 0 ? 1 : 0, sunken: dz, steps: s.levels,
        descent: s.around ? undefined : "along", ...(wet && s.wet > 0 ? { fill: s.wet * dz } : {}) };
    }
    case "basin": {
      const g = basinGrid(s, area);
      return { arrangement: "ponds", width: g.w, depth: g.d, storeys: 0, count: g.nx, rows: g.ny, street: g.gap, surface: "green",
        trees: Math.round((s.trees * (1 - s.water) * area) / CROWN_M2), ...(wet ? { fill: s.depth } : {}) };
    }
    case "linear": {
      const [L, B] = sides(area, s.aspect), tread = (B * (1 - s.channel)) / (2 * s.banks);
      return { arrangement: "sunken", width: L, depth: B, storeys: 0, sunken: s.depth, steps: s.banks, tread, water: 0.3,
        trees: Math.round((s.trees * (1 - s.channel) * area) / CROWN_M2), ...(wet && s.wet > 0 ? { fill: s.wet * s.depth } : {}) };
    }
    case "edge": {
      // Drawn to scale along the river for a stretch of `area`, the section unchanged: a wide edge is short.
      const L = Math.min(EDGE_MAX_STRETCH_M, Math.max(EDGE_MIN_STRETCH_M, s.reach * EDGE_MIN_LONG, area / s.reach));
      return { arrangement: "edge", width: L, depth: s.reach, storeys: 0, tiers: edgeSection(s), river: Math.max(10, s.reach / 6),
        surface: s.trees >= EDGE_PLANTED ? "green" : "ground",
        trees: Math.round((s.trees * L * s.reach) / CROWN_M2), ...(wet && s.wet > 0 ? { fill: s.wet * s.drop } : {}) };
    }
    case "canopy": {
      const n = s.units, span = Math.sqrt((s.cover * area) / n), side = Math.sqrt(area);
      if (s.trees) return { arrangement: "terraces", width: side, depth: side, storeys: 0, steps: 1, sunken: 0.3, surface: "ground", trees: n, crown: span / Math.sqrt(Math.PI) };
      const nx = Math.ceil(Math.sqrt(n)), ny = Math.ceil(n / nx), gap = Math.max(0, side / nx - span);
      return { arrangement: "canopy", width: span, depth: span, storeys: 0, count: nx, rows: ny, gap, floorH: s.height * span, street: 0 };
    }
    case "field": {
      const [L, B] = sides(area, s.aspect), trees = Math.round((s.edge * 2 * (L + B)) / TREE_EVERY_M);
      if (s.sunk < 0.05) return { arrangement: "terraces", width: L, depth: B, storeys: 0, steps: 1, sunken: 0.3, trees, treesAt: "edge" };
      return { arrangement: "sunken", width: L, depth: B, storeys: 0, sunken: s.sunk, steps: s.banks, tread: Math.min(3, B / (2 * s.banks + 2)),
        trees, treesAt: "edge", ...(wet ? { fill: s.sunk } : {}) };
    }
    case "doorstep": {
      const court = Math.sqrt(area), storeys = Math.max(1, Math.round((s.enclosure * court) / 3.2));
      return { arrangement: "court", width: WING_M, depth: WING_M, storeys, court, rows: Math.max(1, Math.round(s.sides * 4)), street: 6,
        trees: Math.round((s.trees * area) / CROWN_M2), treesAt: "court", crown: 5 };
    }
  }
}

function basinGrid(s: Shape, area: number) {
  const [L, B] = sides(area, s.aspect);
  const ny = Math.max(1, Math.round(Math.sqrt(s.cells / s.aspect))), nx = Math.ceil(s.cells / ny);
  const cell = (s.water * area) / (nx * ny), cw = L / nx, cd = B / ny;
  // each pond keeps its cell's proportion; what is left between them is bund and path
  const k = Math.sqrt(cell / (cw * cd));
  return { nx, ny, w: cw * k, d: cd * k, gap: Math.max(1, cw * (1 - k)) };
}

/** What a shape gives on `area` m², for the scores (P5); stand-ins, as their notes say. */
export interface OpenMeasures {
  /** Water held between its dry day and its wet day (m³). */
  storage: number;
  /** Share of the area people can still use on its wet day. */
  wetUse: number;
  /** Edge to sit on: steps and banks no higher than a seat (m per 100 m²). */
  seats: number;
  /** Share of the ground under roofs or crowns at noon (a plan share, not a sun model). */
  shade: number;
  /** Height of the edge ÷ width, for a doorstep space; 0 for open ones. */
  enclosure: number;
}

/** The levels of a pit, as the grammar draws them: the plan area of each level and its rise. */
function pitLevels(L: number, B: number, n: number, around: boolean, tread?: number) {
  const step = tread ?? Math.min(L, B) / (2 * n + 2), sx = L / (n + 1), sy = Math.min(2, B / 8);
  const area = (k: number) => around ? Math.max(0, L - 2 * k * step) * Math.max(0, B - 2 * k * step) : k === 0 ? L * B : (L - k * sx) * (B - 2 * sy);
  const perim = (k: number) => around ? 2 * (L - 2 * k * step + B - 2 * k * step) : 2 * (L - k * sx + B - 2 * sy);
  return { area, perim };
}

/** Volume and dry tread of a pit `dz` deep in `n` levels with water `wet` × dz deep. */
function pitMeasures(L: number, B: number, dz: number, n: number, around: boolean, wet: number, tread?: number) {
  const { area, perim } = pitLevels(L, B, n, around, tread), h = dz / n, zt = -dz + wet * dz;
  let storage = 0, dry = 0, seats = 0;
  for (let k = 0; k < n; k++) {
    const lo = -(k + 1) * h, hi = -k * h;
    storage += area(k) * Math.max(0, Math.min(hi, zt) - lo);
    const treadA = area(k) - (k + 1 < n ? area(k + 1) : 0);
    if (lo >= zt - 1e-9 || wet === 0) dry += treadA;
    if (k > 0 && h <= SEAT_RISE_M) seats += perim(k);
  }
  return { storage, wetUse: dry / (L * B), seats: (seats / (L * B)) * 100 };
}

/** `need` (m³), for a field: its water rises only as high as it must to hold that, so a deeper
 *  field keeps its banks dry; without it the field is full to its edge. */
export function measureShape(f: ShapedFamily, s0: Shape, area: number, need = 0): OpenMeasures {
  const s = clampShape(f, s0);
  switch (f) {
    case "stepped": {
      const [L, B] = sides(area, s.aspect), m = pitMeasures(L, B, s.depth * B, s.levels, !!s.around, s.wet);
      return { ...m, shade: 0, enclosure: 0 };
    }
    case "basin":
      return { storage: s.water * area * s.depth, wetUse: 1 - s.water, seats: 0, shade: s.trees * (1 - s.water), enclosure: 0 };
    case "linear": {
      const [L, B] = sides(area, s.aspect), m = pitMeasures(L, B, s.depth, s.banks, true, s.wet, (B * (1 - s.channel)) / (2 * s.banks));
      return { ...m, shade: s.trees * (1 - s.channel), enclosure: 0 };
    }
    case "edge": {
      // Per stretch of `area`: the flood it makes room for, what stays above it, walls and bank edges
      // low enough to sit on. Land under the flood line counts as wet, tread and bank alike.
      const tiers = edgeSection(s), L = area / s.reach, flood = s.wet * s.drop;
      let storage = 0, dry = 0, seats = 0;
      tiers.forEach((t, k) => {
        const w = t.tread + t.bank, rise = k + 1 < tiers.length ? t.z - tiers[k + 1].z : t.z;
        if (t.z >= flood) dry += w; else storage += w * L * (flood - t.z);
        if (rise > 0 && rise <= SEAT_RISE_M) seats += L;
      });
      return { storage, wetUse: flood > 0 ? dry / s.reach : 1, seats: (seats / area) * 100, shade: s.trees, enclosure: 0 };
    }
    case "canopy":
      return { storage: 0, wetUse: 1, seats: 0, shade: s.cover, enclosure: 0 };
    case "field": {
      const [L, B] = sides(area, s.aspect), trees = Math.round((s.edge * 2 * (L + B)) / TREE_EVERY_M);
      const shade = Math.min(1, (trees * CROWN_M2 * 0.5) / area); // half of each edge tree's crown falls on the field
      if (s.sunk < 0.05) return { storage: 0, wetUse: 1, seats: 0, shade, enclosure: 0 };
      const tread = Math.min(3, B / (2 * s.banks + 2)), full = pitMeasures(L, B, s.sunk, s.banks, true, 1, tread);
      if (need <= 0 || full.storage <= need) return { ...full, shade, enclosure: 0 };
      // the lowest water line that holds the need
      let lo = 0, hi = 1;
      for (let k = 0; k < 30; k++) { const mid = (lo + hi) / 2; if (pitMeasures(L, B, s.sunk, s.banks, true, mid, tread).storage >= need) hi = mid; else lo = mid; }
      return { ...pitMeasures(L, B, s.sunk, s.banks, true, hi, tread), shade, enclosure: 0 };
    }
    case "doorstep":
      return { storage: 0, wetUse: 1, seats: 0, shade: s.trees, enclosure: s.enclosure };
  }
}

/** A river edge's section, from its table: seeds can't say it, and some members belong to other
 *  families too (Varanasi's ghats are also stepped, the Waal also along a flow line). */
export function edgeShapeOf(id: string): Shape | undefined {
  const t = EDGE_SECTIONS[id];
  if (!t) return undefined;
  const { sure: _sure, ...s } = t;
  return clampShape("edge", s);
}

/** A library precedent's shape in its family's genes, read from its seed, when its arrangement
 *  is one the family's grammar draws; undefined otherwise (charbagh's channels, a street). */
export function shapeOf(p: Precedent): Shape | undefined {
  const o = p.open, q = p.seed;
  if (!o || o.family === "street") return undefined;
  if (o.family === "edge") return edgeShapeOf(p.id);
  const f = o.family as ShapedFamily, long = Math.max(q.width, q.depth), short = Math.min(q.width, q.depth);
  const s = ((): Shape | undefined => {
    switch (f) {
      case "stepped":
        if (q.arrangement !== "sunken" || q.footprint === "round") return undefined;
        return { aspect: long / short, depth: (q.sunken ?? 0) / short, levels: q.steps ?? 4, around: q.descent === "along" ? 0 : 1,
          wet: o.fill && q.sunken ? o.fill / q.sunken : 0, rim: q.count ? q.storeys : 0 };
      case "basin": {
        if (q.arrangement !== "ponds") return undefined;
        const nx = q.count ?? 4, ny = q.rows ?? 3, g = q.street ?? 4, W = nx * (q.width + g), D = ny * (q.depth + g);
        const water = (nx * ny * q.width * q.depth) / (W * D);
        return { aspect: Math.max(W, D) / Math.min(W, D), water, cells: nx * ny, depth: o.fill ?? q.water ?? 1,
          trees: Math.min(0.6, ((q.trees ?? 0) * CROWN_M2) / ((1 - water) * W * D)) };
      }
      case "linear":
        if (q.arrangement !== "sunken") return undefined;
        return { aspect: long / short, channel: 1 / ((q.steps ?? 4) + 1), banks: q.steps ?? 4, depth: q.sunken ?? 1,
          wet: o.fill && q.sunken ? o.fill / q.sunken : 0, trees: Math.min(0.6, ((q.trees ?? 0) * CROWN_M2) / (q.width * q.depth)) };
      case "canopy": {
        if (q.arrangement === "canopy") {
          const n = (q.count ?? 1) * (q.rows ?? 1), W = (q.count ?? 1) * q.width, D = (q.rows ?? 1) * q.depth + (q.street ?? 4);
          return { cover: Math.min(1, (n * q.width * q.depth) / (W * D)), height: (q.floorH ?? 4) / long, units: n, trees: 0 };
        }
        if (q.arrangement === "terraces" && q.trees) {
          return { cover: Math.min(1, (q.trees * CROWN_M2) / (q.width * q.depth)), height: 0.8, units: q.trees, trees: 1 };
        }
        return undefined;
      }
      case "field": {
        if (q.arrangement !== "sunken" && q.arrangement !== "terraces") return undefined;
        if (q.arrangement === "terraces" && (q.steps ?? 1) > 1) return undefined; // a sloped park, not a field
        const per = 2 * (q.width + q.depth);
        return { aspect: long / short, sunk: q.arrangement === "sunken" ? q.sunken ?? 0 : 0, banks: q.steps ?? 1,
          edge: q.treesAt === "edge" ? Math.min(1, ((q.trees ?? 0) * TREE_EVERY_M) / per) : 0 };
      }
      case "doorstep": {
        if (q.arrangement !== "court" || !q.court) return undefined;
        return { enclosure: (q.storeys * (q.floorH ?? 3.2)) / q.court, sides: (q.rows ?? 4) / 4,
          trees: Math.min(0.6, ((q.trees ?? 0) * CROWN_M2) / (q.court * q.court)) };
      }
    }
  })();
  return s && clampShape(f, s);
}

/** Per family and gene, the spread the library's members take, and which members were read. */
export function familySpread(lib: Precedent[]): Record<ShapedFamily, { members: string[]; lo: Shape; hi: Shape }> {
  const out = {} as Record<ShapedFamily, { members: string[]; lo: Shape; hi: Shape }>;
  for (const f of Object.keys(OPEN_GENES) as ShapedFamily[]) {
    const shapes = (f === "edge"
      ? lib.filter((p) => EDGE_SECTIONS[p.id]).map((p) => [p.id, edgeShapeOf(p.id)] as const)
      : lib.filter((p) => p.open?.family === f).map((p) => [p.id, shapeOf(p)] as const)).filter((x): x is readonly [string, Shape] => !!x[1]);
    const lo: Shape = {}, hi: Shape = {};
    for (const g of OPEN_GENES[f]) {
      const vs = shapes.map(([, s]) => s[g.key]);
      lo[g.key] = vs.length ? Math.min(...vs) : g.lo;
      hi[g.key] = vs.length ? Math.max(...vs) : g.hi;
    }
    out[f] = { members: shapes.map(([id]) => id), lo, hi };
  }
  return out;
}

/** The middle of a family's spread: the shape the page draws first. */
export function middleShape(f: ShapedFamily, spread: { lo: Shape; hi: Shape }): Shape {
  return clampShape(f, Object.fromEntries(OPEN_GENES[f].map((g) => [g.key, (spread.lo[g.key] + spread.hi[g.key]) / 2])));
}
