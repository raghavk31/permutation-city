// Building type per lot, at urban scale (built form brief section 5; docs/built-form.md step 4
// and "Precedents as types").
//
// A lot is a block's building plots of one programme (programme.ts): the homes of a block are
// one lot, a school in it another. Every design in a run builds each lot as one precedent from
// the typology library (precedents.ts), held to a density as Spacematrix numbers (Berghauser
// Pont and Haupt 2010): ground coverage (GSI), storeys and floor area over the lot's building
// land (FSI). The numbers are measured on the precedent's own layout over the lot's plots
// (blockmass.ts), so what the choice reads is what the 3D view draws.
//
// Choosing a lot's precedent:
//   1  what the genes ask of the lot: the floor area the fields grew on it over its building
//      land, the "wanted" FSI
//   2  the candidates: the library's building precedents for the lot's programme, nearest the
//      site's climate first, the first CANDIDATES whose tile fits the lot
//   3  each candidate at every storey count within the lot's height caps and its own (maxStoreys), raised or lowered
//      from its own, thinned to the plot rules' coverage and FAR, its density estimated from
//      the tiles that fit; the best MEASURED by score are laid out on the plots and measured
//   4  the best measured score wins: the gene for the candidate's family of arrangement (the search's
//      preference), Martin and March's prior for courts at medium and higher density, less how
//      far it falls from the wanted FSI, how far its climate is from the site's, and how far it
//      drifted from its own height
//   5  towers only at major nodes (a square or a centre), where nothing lower reaches the wanted
//      FSI; at most MAX_TOWERS_SITE on the whole site, the lots furthest short first
import { coverageFor, type PlotRules, roadStoreys } from "../regs.js";
import { keepShare, massLot, tiles } from "./blockmass.js";
import { area, centroid, convexHull, obb, type Line, type Pt } from "./geom.js";
import { built, CANDIDATES, candidatesFor, type Drift, FAMILIES, maxStoreys, PRECEDENT, variant } from "./precedents.js";
import { PROGRAMMES } from "./programme.js";

/** The type genes (config.ts), one per family of arrangement (precedents.ts FAMILIES). */
export const TYPE_GENES = ["t_courtyard", "t_perimeter", "t_row", "t_towers"] as const;

export const MAX_TOWERS_SITE = 2;       // decision 8, 26 October
export const NODE_M = 150;              // a lot whose middle is this close to a square or a centre stands at a major node (design)
export const PRIOR = 0.25;              // Martin and March: courts preferred ...
export const PRIOR_FSI = 1;             // ... at this FSI and above (medium density; assumed threshold)
export const FIT = 6;                   // weight on falling short of (or over) the wanted FSI, relative: density all but a constraint (user, 28 October)
export const CLIMATE_W = 0.25;          // per noticeable step between the precedent's climate and the site's (assumed)
export const DRIFT_W = 0.15;            // per doubling or halving of the precedent's own height (assumed)
export const MEASURED = 3;              // options per lot laid out and measured, the best by estimate

/** A lot's type: its block and plots (indices into the plan's plots), programme (PROGRAMMES
 *  index), family (FAMILIES index, -1 where no candidate fits), precedent, the families its
 *  candidates came from, its building land (m²), the FSI the genes asked for, the coverage,
 *  storeys and FSI it gives, the caps it was thinned to, its climate distance, its drift from
 *  the precedent, and its towers (tiles of a tower precedent). */
export interface BlockTyping {
  block: number; plots: number[]; programme: number; type: number; precedent: string; feasible: number[];
  land: number; wanted: number; gsi: number; storeys: number; fsi: number; cap: [number, number];
  climate: number; drift: Drift[]; towers: number;
}

/** A lot as growth hands it over: its block, plots (indices and outlines), programme, building
 *  land (m²), the floor area the genes grew on it (m²), the widest road its plots front (m),
 *  its storey cap and the FSI its plot rules allow (Infinity without rules). */
export interface LotIn { block: number; plots: number[]; rings: Line[]; programme: number; land: number; floor: number; road: number; cap: number; farCap: number }

interface Option { k: number; family: number; precedent: string; own: number; n: number; gsi: number; fsi: number; tiles: number; climate: number; drift: Drift[]; score: number; tower: boolean }

/** Types for every lot with building land (null for the others). prefs: the four type genes
 *  (0..1); nodes: squares and centres; siteId: for the climate match. */
export function typeBlocks(lots: LotIn[], prefs: number[], nodes: Pt[], R: PlotRules | null, siteId: string): (BlockTyping | null)[] {
  const all = lots.map((lot) => {
    if (lot.land <= 0 || !lot.rings.length) return null;
    let hull = convexHull(lot.rings.flat());
    if (area(hull) < 0) hull = [...hull].reverse();
    const c = hull.length >= 3 ? centroid(hull) : lot.rings[0][0];
    const atNode = nodes.some((p) => Math.hypot(p[0] - c[0], p[1] - c[1]) <= NODE_M);
    const wanted = lot.floor / lot.land;
    const cov = R ? coverageFor(R, lot.land) : 1, top = Math.min(lot.cap, R ? roadStoreys(R, lot.road) : Infinity);
    const caps: [number, number] = [cov, Number.isFinite(lot.farCap) ? lot.farCap : 0];
    const prog = PROGRAMMES[lot.programme] ?? "homes";
    // Every candidate at every storey count the caps allow, estimated: the tiles that fit the
    // lot's box, each the precedent's floor area, over the land, as if the land filled the box
    // evenly. Towers only at a node.
    const box = obb(hull), L = 2 * box.hl, W = 2 * box.hw, fill = Math.min(1, lot.land / (L * W || 1));
    const guesses: Option[] = [], feasible = new Set<number>();
    let fitted = 0;
    for (const cand of candidatesFor(prog, siteId)) {
      if (fitted >= CANDIDATES) break;
      const tower = cand.p.seed.arrangement === "tower";
      if (tower && !atNode) continue;
      const lo = tower ? 2 : 1;
      let any = false;
      for (let n = lo, hi = Math.min(top, maxStoreys(cand.p.seed)); n <= hi; n++) {
        const b = built(cand.p, n), t = tiles(b.plot.w, b.plot.d, L, W);
        if (!t) continue;
        any = true;
        const k = t.nU * t.nV * fill / lot.land, f = keepShare(b.footprint * k, b.floorArea * k, 1, caps[0], caps[1]);
        guesses.push({ k: 0, family: cand.family, precedent: cand.p.id, own: cand.own, n, gsi: b.footprint * k * f, fsi: b.floorArea * k * f,
          tiles: Math.max(1, Math.round(t.nU * t.nV * f)), climate: cand.climate, drift: [], score: 0, tower });
      }
      if (any) { fitted++; feasible.add(cand.family); }
    }
    const scoreOf = (o: Option) => (prefs[o.family] ?? 0) + (o.family === 0 && wanted >= PRIOR_FSI ? PRIOR : 0)
      - FIT * Math.abs(o.fsi - wanted) / Math.max(wanted, 0.05) - CLIMATE_W * o.climate - DRIFT_W * Math.abs(Math.log2(o.n / o.own));
    for (const o of guesses) o.score = scoreOf(o);
    // The best MEASURED of them (and the best tower) laid out on the plots and measured.
    const ranked = [...guesses].sort((x, y) => y.score - x.score || x.n - y.n);
    const pick = [...ranked.filter((o) => !o.tower).slice(0, MEASURED), ...ranked.filter((o) => o.tower).slice(0, 1)];
    const options: Option[] = [];
    for (const g of pick) {
      const m = massLot({ block: lot.block, type: g.family, precedent: g.precedent, storeys: g.n, gsi: 0, fsi: 0, land: lot.land, cap: caps }, lot.rings, false);
      if (m.fsi <= 0) continue;
      const o: Option = { ...g, k: options.length, gsi: m.gsi, fsi: m.fsi, tiles: m.tiles, drift: variant(PRECEDENT.get(g.precedent)!.seed, g.n).drift };
      o.score = scoreOf(o);
      options.push(o);
    }
    const low = guesses.reduce((m, o) => (o.tower ? m : Math.max(m, o.fsi)), 0);
    return { lot, wanted, caps, options, feasible: [...feasible].sort(), short: low < wanted ? (wanted - low) / wanted : 0 };
  });
  const choose = (b: number, towersLeft: number): BlockTyping | null => {
    const a = all[b];
    if (!a) return null;
    let best: Option | null = null;
    for (const o of a.options) {
      if (o.tower && (o.tiles > towersLeft || a.short <= 0)) continue;
      if (!best || o.score > best.score + 1e-12) best = o;
    }
    const lot = a.lot;
    const base = { block: lot.block, plots: lot.plots, programme: lot.programme, feasible: a.feasible, land: lot.land, wanted: a.wanted, cap: a.caps };
    if (!best) return { ...base, type: -1, precedent: "", gsi: 0, storeys: 0, fsi: 0, climate: 0, drift: [], towers: 0 };
    return { ...base, type: best.family, precedent: best.precedent, gsi: best.gsi, storeys: best.n, fsi: best.fsi, climate: best.climate,
      drift: best.drift, towers: best.tower ? best.tiles : 0 };
  };
  // At most MAX_TOWERS_SITE towers on the site: the lots furthest short of their density choose
  // first, while towers are left; then every other lot, with none.
  const out: (BlockTyping | null)[] = lots.map(() => null);
  const order = all.map((_, b) => b).filter((b) => all[b]?.options.some((o) => o.tower))
    .sort((x, y) => all[y]!.short - all[x]!.short || x - y);
  let left = MAX_TOWERS_SITE;
  for (const b of order) {
    out[b] = choose(b, left);
    left -= out[b]!.towers;
  }
  lots.forEach((_, b) => { if (!out[b] && all[b]) out[b] = choose(b, 0); });
  return out;
}

/** A plan's types in sum: lots and building land of each family (FAMILIES order), lots no
 *  precedent fits, towers, the FSI asked and given over all typed land, and the precedents
 *  used (by lots, most first) with their mean storeys against their own. */
export function typeSummary(types: readonly BlockTyping[]) {
  const blocks = FAMILIES.map(() => 0), land = FAMILIES.map(() => 0);
  let none = 0, towers = 0, asked = 0, given = 0, all = 0;
  const used = new Map<string, { id: string; lots: number; land: number; storeys: number; own: number; family: number }>();
  for (const t of types) {
    if (t.type < 0) { none++; continue; }
    blocks[t.type]++; land[t.type] += t.land; towers += t.towers;
    asked += t.wanted * t.land; given += t.fsi * t.land; all += t.land;
    const own = (t.drift ?? []).find((d) => d.what === "storeys")?.from ?? t.storeys;
    const u = used.get(t.precedent) ?? { id: t.precedent, lots: 0, land: 0, storeys: 0, own, family: t.type };
    u.lots++; u.land += t.land; u.storeys += t.storeys * t.land;
    used.set(t.precedent, u);
  }
  const precedents = [...used.values()].map((u) => ({ ...u, storeys: u.storeys / u.land })).sort((a, b) => b.land - a.land || (a.id < b.id ? -1 : 1));
  return { blocks, land, none, towers, asked: all ? asked / all : 0, given: all ? given / all : 0, precedents };
}
