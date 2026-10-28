// Building type per block, at urban scale (built form brief section 5; docs/built-form.md step 4).
//
// Every design in a run gives each block one building type, chosen from the types the block's
// shape, roads and rules allow, and holds the block to that type's density as Spacematrix
// numbers (Berghauser Pont and Haupt 2010): ground coverage (GSI), storeys (L) and floor area
// over the block's building land (FSI = GSI x L). Here a type is a few lines of arithmetic on
// the block's oriented bounding box, so a run stays fast; its buildings are placed and shaped
// only for the opened design (steps 5-8; architecture-v3 12.3).
//
// Four types in Milestone A (decision 4, 26 October): courtyard, perimeter block, row housing,
// podium with towers. Their rules are the table below, the one place they are kept.
//
// Choosing a block's type:
//   1  what the genes ask of the block: its floor area as the fields grow it (coverage gene,
//      heights from the core field) over its building land, the "wanted" FSI
//   2  each type's storeys, from its range within the block's height caps; for each, the
//      type's coverage on this block (wing depth from the coverage gene); a type with no storey
//      count that fits the block's shape is not feasible
//   3  each feasible type comes as close to the wanted FSI as it can, within the FAR the plot
//      rules allow; the type with the best score is chosen: its gene (the search's
//      preference) plus Martin and March's prior for courts and perimeter blocks at medium and
//      higher density, less how far it falls from the wanted FSI
//   4  towers only at major nodes (a square or a centre), on a high-rise road and site, where
//      no lower type reaches the wanted FSI; at most MAX_TOWERS_SITE towers on the whole site,
//      the blocks furthest short of their density first (decision 8)
import { STOREY_M } from "../config.js";
import { BENGALURU, coverageFor, type PlotRules, roadStoreys } from "../regs.js";
import { massBlock } from "./blockmass.js";
import { centroid, obb, type Line, type Pt } from "./geom.js";

export type TypeKey = "courtyard" | "perimeter" | "row" | "towers";

export interface BlockType {
  key: TypeKey; name: string;
  /** Wing depth, facade to facade (m); for towers, the side of a tower's floor plate. */
  depth: readonly [number, number];
  /** Storeys; for towers, the towers' (the podium has PODIUM_STOREYS). */
  storeys: readonly [number, number];
  /** Where each number comes from. */
  sources: string;
}

/** The four types. Depths are within the Bengaluru Bye-laws' daylight depth: a room lit within
 *  7.5 m of an opening, so a wing lit on both sides at most 15 m deep (Bye-laws 2003, 20.11 (3),
 *  read). Storey ranges are design values (assumed) inside each site's height caps. */
export const BLOCK_TYPES: readonly BlockType[] = [
  { key: "courtyard", name: "courtyard", depth: [10, 14], storeys: [3, 6],
    sources: "wings lit from street and court (Bye-laws 2003 20.11 (3): at most 15 m); court at least COURT_MIN_M and as wide as the wings are high (assumed until step 8 sizes it by winter sun); buildings GAP_M apart" },
  { key: "perimeter", name: "perimeter block", depth: [10, 15], storeys: [3, 6],
    sources: "one ring along the block's streets, BREAKS of it left open for passages (assumed); the yard inside at least as wide as the ring is high and COURT_MIN_M" },
  { key: "row", name: "row housing", depth: [8, 12], storeys: [2, 4],
    sources: "rows along the block's length, lit front and back (assumed depth), walk-ups of two to four storeys (Alexander 21, assumed); rows apart by their height and at least GAP_M (assumed: light at 45° to the ground floor; the RMP's half the height, 3.6 (i), is the legal floor)" },
  { key: "towers", name: "podium with towers", depth: [18, 24], storeys: [5, 15],
    sources: "high-rise from ground plus four floors (Bye-laws 2003 2.46, read); floor plate 18-24 m square (assumed); at most 15 storeys (assumed, the old cap); a podium of PODIUM_STOREYS at the plot's coverage; towers half the taller one's height apart and twice the fire clearance (RMP 3.6 (i), Bye-laws 16.0 (e))" },
];
export const TYPE_GENES = ["t_courtyard", "t_perimeter", "t_row", "t_towers"] as const;

export const COURT_MIN_M = 12;          // Correa's cluster court, about 12 x 12 m (Belapur; brief section 1, secondary)
export const COURT_OF_HEIGHT = 1;       // a court at least as wide as its wings are high (assumed; step 8 replaces it)
export const GAP_M = 6;                 // between buildings in a block: the bye-laws' fire clearance (Bye-laws 2003 16.0 (e), read; applied to all)
export const ROW_GAP_OF_HEIGHT = 1;     // rows apart by their height (assumed)
export const BREAKS = 0.1;              // share of a row or a perimeter ring left open for passages and breezeways (assumed)
export const PODIUM_STOREYS = 2;        // assumed
export const MAX_TOWERS_SITE = 2;       // decision 8, 26 October
export const MAX_TOWERS_BLOCK = 2;
export const NODE_M = 150;              // a block whose middle is this close to a square or a centre stands at a major node (design)
export const PRIOR = 0.25;              // Martin and March: courts and perimeter blocks preferred ...
export const PRIOR_FSI = 1;             // ... at this FSI and above (medium density; assumed threshold)
export const FIT = 2;                   // weight on falling short of (or over) the wanted FSI

/** A block's type, and the density it holds the block to. land: the block's building land (m²),
 *  wanted: the FSI the genes asked for, gsi/storeys/fsi: what the type gives, towers: how many
 *  (podium with towers only), feasible: the types the block allows (indices into BLOCK_TYPES). */
export interface BlockTyping {
  block: number; type: number; feasible: number[];
  land: number; wanted: number; gsi: number; storeys: number; fsi: number; depth: number; towers: number;
}

/** What one type gives a block at one storey count, or null where its shape doesn't fit. */
export interface Fit { gsi: number; storeys: number; fsi: number; towers: number }

/** The block as Spacematrix sees it: its building land, and the oriented bounding box of its
 *  outline scaled to that land (W across, L along, W <= L). */
export interface BlockShape { land: number; W: number; L: number; road: number; cap: number; atNode: boolean;
  /** The coverage a low type actually gets on the block's plots, laid out and clipped
   *  (blockmass.ts), in place of the bounding-box arithmetic; null where it doesn't fit. */
  measure?: (type: number, depth: number, storeys: number) => number | null }

export function shapeOf(ring: Line, land: number): { W: number; L: number } {
  const b = obb(ring);
  const w = 2 * Math.min(b.hl, b.hw), l = 2 * Math.max(b.hl, b.hw);
  const k = w * l > 0 ? Math.sqrt(land / (w * l)) : 0;
  return { W: w * k, L: l * k };
}

/** GSI of courtyard buildings tiled over the block: each a ring of wings round a court, units
 *  stretched along the block's length to fill it, GAP_M apart. */
export function courtyardGsi(W: number, L: number, d: number, H: number): number | null {
  const c = Math.max(COURT_MIN_M, COURT_OF_HEIGHT * H), u = c + 2 * d;
  const nW = Math.floor((W + GAP_M) / (u + GAP_M)), nL = Math.floor((L + GAP_M) / (u + GAP_M));
  if (!nW || !nL) return null;
  const Lu = (L - (nL - 1) * GAP_M) / nL;
  return (nW * nL * (u * Lu - c * (Lu - 2 * d))) / (W * L);
}

/** GSI of one ring of depth d along the block's edge, with a yard inside. */
export function perimeterGsi(W: number, L: number, d: number, H: number): number | null {
  if (W - 2 * d < Math.max(COURT_MIN_M, COURT_OF_HEIGHT * H)) return null;
  return ((1 - BREAKS) * (W * L - (W - 2 * d) * (L - 2 * d))) / (W * L);
}

/** GSI of rows of depth d along the block's length. */
export function rowGsi(W: number, _L: number, d: number, H: number): number | null {
  if (W < d) return null;
  const gap = Math.max(ROW_GAP_OF_HEIGHT * H, GAP_M);
  const r = Math.floor((W - d) / (d + gap)) + 1;
  return ((1 - BREAKS) * r * d) / W;
}

const GSI = { courtyard: courtyardGsi, perimeter: perimeterGsi, row: rowGsi };

/** The rules a type reads: the site's, or Bengaluru's high-rise and spacing figures where the
 *  site has none (assumed for those sites). */
const highRise = (R: PlotRules | null) => R ?? BENGALURU;

/** Every storey count a type can take on a block, with what it gives, within the block's caps:
 *  coverage within the rules' coverage for the block's land, floor area within its FAR. */
export function fitsOf(t: BlockType, b: BlockShape, depth: number, R: PlotRules | null, farCap: number): Fit[] {
  const out: Fit[] = [];
  const covCap = R ? coverageFor(R, b.land) : 1;
  const roadCap = R ? roadStoreys(R, b.road) : Infinity;
  if (t.key === "towers") {
    const H = highRise(R);
    if (!b.atNode || b.road < H.highRiseRoadM || b.W < Math.max(H.highRiseSiteM, depth + 2 * H.fireClearM)) return out;
    const pod = Math.min(PODIUM_STOREYS, roadCap), cover = Math.min(covCap, 0.6);
    for (let m = t.storeys[0]; m <= Math.min(t.storeys[1], roadCap); m++) {
      const gap = Math.max(H.spacingOfHeight * m * STOREY_M, 2 * H.fireClearM);
      const most = Math.min(MAX_TOWERS_BLOCK, Math.floor((b.L + gap) / (depth + gap)));
      for (let n = 1; n <= most; n++) {
        const fsi = cover * pod + (n * depth * depth * (m - pod)) / b.land;
        if (fsi > farCap) continue;
        out.push({ gsi: cover, storeys: m, fsi, towers: n });
      }
    }
    return out;
  }
  const hi = Math.min(t.storeys[1], b.cap, roadCap);
  for (let n = t.storeys[0]; n <= hi; n++) {
    const g = b.measure ? b.measure(BLOCK_TYPES.indexOf(t), depth, n) : GSI[t.key](b.W, b.L, depth, n * STOREY_M);
    if (g === null || g <= 0) continue;
    const gsi = Math.min(g, covCap, farCap / n);
    out.push({ gsi, storeys: n, fsi: gsi * n, towers: 0 });
  }
  return out;
}

/** The fit that comes closest to the wanted FSI (the fewer storeys and towers on a tie). */
export function closest(fits: Fit[], wanted: number): Fit | null {
  let best: Fit | null = null, bd = Infinity;
  for (const f of fits) {
    const d = Math.abs(f.fsi - wanted);
    if (d < bd - 1e-9) { best = f; bd = d; }
  }
  return best;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** A block as growth hands it over: its outline, building land (m²), the floor area the genes
 *  grew on it (m²), the widest road its plots front (m), its storey cap and the FSI its plot
 *  rules allow (Infinity without rules). */
export interface BlockIn { ring: Line; land: number; floor: number; road: number; cap: number; farCap: number;
  /** The block's building plots: when given, low types are measured on them (blockmass.ts). */
  plots?: Line[] }

/** Types for every block with building land (null for the others). prefs: the four type genes
 *  (0..1); depthT: where wing depth sits in each type's range (0..1, from the coverage gene);
 *  nodes: squares and centres. */
export function typeBlocks(blocks: BlockIn[], prefs: number[], depthT: number, nodes: Pt[], R: PlotRules | null): (BlockTyping | null)[] {
  const ti = BLOCK_TYPES.findIndex((t) => t.key === "towers");
  const all = blocks.map((blk) => {
    if (blk.land <= 0) return null;
    const { W, L } = shapeOf(blk.ring, blk.land), c = centroid(blk.ring);
    const atNode = nodes.some((p) => Math.hypot(p[0] - c[0], p[1] - c[1]) <= NODE_M);
    const plots = blk.plots;
    // the layout depends on storeys only through the court's width (courtyards) and the gap
    // between rows, so equal layouts are measured once
    const seen = new Map<string, number | null>();
    const measure = plots?.length ? (k: number, depth: number, n: number) => {
      const key = BLOCK_TYPES[k].key, H = n * STOREY_M;
      const id = `${k}:${depth}:${key === "perimeter" ? 0 : key === "courtyard" ? Math.max(COURT_MIN_M, COURT_OF_HEIGHT * H) : Math.max(ROW_GAP_OF_HEIGHT * H, GAP_M)}`;
      if (!seen.has(id)) {
        const m = massBlock({ block: -1, type: k, gsi: 0, storeys: n, fsi: 0, depth, towers: 0, land: blk.land }, plots);
        seen.set(id, m.gsi > 0 ? m.gsi : null);
      }
      return seen.get(id)!;
    } : undefined;
    const shape: BlockShape = { land: blk.land, W, L, road: blk.road, cap: blk.cap, atNode, measure };
    const depths = BLOCK_TYPES.map((t) => lerp(t.depth[0], t.depth[1], t.key === "towers" ? 0.5 : depthT));
    const fits = BLOCK_TYPES.map((t, k) => fitsOf(t, shape, depths[k], R, blk.farCap));
    const wanted = blk.floor / blk.land;
    // Towers only where no lower type reaches the density.
    let low = 0;
    fits.forEach((fs, k) => { if (k !== ti) for (const f of fs) low = Math.max(low, f.fsi); });
    if (low >= wanted) fits[ti] = [];
    return { wanted, depths, fits, short: low < wanted ? (wanted - low) / wanted : 0 };
  });
  const choose = (b: number, towersLeft: number): BlockTyping | null => {
    const a = all[b];
    if (!a) return null;
    let best: { k: number; f: Fit; score: number } | null = null;
    const feasible: number[] = [];
    a.fits.forEach((fs, k) => {
      if (fs.length) feasible.push(k);
      const f = closest(k === ti ? fs.filter((x) => x.towers <= towersLeft) : fs, a.wanted);
      if (!f) return;
      const t = BLOCK_TYPES[k].key;
      const prior = (t === "courtyard" || t === "perimeter") && a.wanted >= PRIOR_FSI ? PRIOR : 0;
      const score = prefs[k] + prior - FIT * Math.abs(f.fsi - a.wanted) / Math.max(a.wanted, 0.05);
      if (!best || score > best.score + 1e-12) best = { k, f, score };
    });
    const land = blocks[b].land, bb = best as { k: number; f: Fit; score: number } | null;
    if (!bb) return { block: b, type: -1, feasible, land, wanted: a.wanted, gsi: 0, storeys: 0, fsi: 0, depth: 0, towers: 0 };
    return { block: b, type: bb.k, feasible, land, wanted: a.wanted, gsi: bb.f.gsi, storeys: bb.f.storeys, fsi: bb.f.fsi,
      depth: a.depths[bb.k], towers: bb.f.towers };
  };
  // At most MAX_TOWERS_SITE towers on the site: the blocks furthest short of their density
  // choose first, while towers are left; then every other block, with none.
  const out: (BlockTyping | null)[] = blocks.map(() => null);
  const order = all.map((a, b) => b).filter((b) => all[b]?.fits[ti].length)
    .sort((x, y) => all[y]!.short - all[x]!.short || x - y);
  let left = MAX_TOWERS_SITE;
  for (const b of order) {
    out[b] = choose(b, left);
    if (out[b]!.type === ti) left -= out[b]!.towers;
  }
  blocks.forEach((_, b) => { if (!out[b] && all[b]) out[b] = choose(b, 0); });
  return out;
}

/** A plan's types in sum: blocks and building land of each type (BLOCK_TYPES order), blocks no
 *  type fits, towers, and the FSI asked and given over all typed land. */
export function typeSummary(types: readonly BlockTyping[]) {
  const blocks = BLOCK_TYPES.map(() => 0), land = BLOCK_TYPES.map(() => 0);
  let none = 0, towers = 0, asked = 0, given = 0, all = 0;
  for (const t of types) {
    if (t.type < 0) { none++; continue; }
    blocks[t.type]++; land[t.type] += t.land; towers += t.towers;
    asked += t.wanted * t.land; given += t.fsi * t.land; all += t.land;
  }
  return { blocks, land, none, towers, asked: all ? asked / all : 0, given: all ? given / all : 0 };
}
