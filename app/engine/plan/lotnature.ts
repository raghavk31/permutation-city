// Nature on every lot, at urban scale (docs/built-form.md, "Nature on every lot"; the user,
// 2 November: score how well a lot's form serves the climate's needs together with its
// programme's; that is what makes a type a programme's own).
//
// A lot's open ground (its building land less what the buildings cover) holds first what its
// programme needs: a garden or playground for homes, shops, health and culture, a playfield for
// schools, a yard for the waste yard (OPEN_NEED). Trees may stand in a garden (the bye-law asks
// for them), not on a playfield or a yard; ponds never take what the programme needs. What
// is left over takes nature by the place's climate challenges (typology/challenges.ts):
//
//   ponds     a wetland of WETLAND (5-10%, more where rain or monsoon matter) of the ground
//             that drains through the lot (typology/nature.ts wetland share: 5-10% of a
//             catchment, placed low), on spare ground only. The sewage plant's open ground is
//             all wetland (treatment wetland)
//   trees     CANOPY_MAX of the dry open ground and the gardens, scaled up where heat matters
//   roofs     planted, GREEN_MAX at most, where rain or heat matters
//
// No genes: nothing in the site's scores charges for a pond, a tree or a planted roof, so a
// gene for them would only run to its top. What limits them is the land: a dense precedent
// leaves no ground over, and the programme's need comes first.
//
// Two readings per lot, for choosing its type (blocktypes.ts) and for the readouts:
//   met       share of the programme's open ground the lot has (1: all of it)
//   climate   how much of the climate's work its ground and roofs do: the share of a
//             DESIGN_RAIN_MM storm held (plotnature.ts's run-off coefficients and pond depth)
//             and the share of its open ground under trees or water, averaged
import type { Need } from "../typology/challenges.js";
import { DESIGN_RAIN_MM, POND_M, RUNOFF } from "../massing/plotnature.js";
import type { ProgrammeKey } from "./programme.js";

/** What a programme's open ground is for, and how much of its land it needs. */
export interface OpenNeed { kind: "garden" | "field" | "yard" | "wetland"; share: (land: number) => number; source: string }
/** The least a piece of usable open ground measures across (m) and in area (m²), by kind:
 *  a garden DCPR 2034 Reg. 27(1)(b)-(c), read (7.5 m, 125 m²); a playfield URDPFI Table 8.48,
 *  read (a primary school's at least 18 x 36 m; a senior secondary's 68 x 126 m, not asked of a
 *  lot); a yard assumed (a lorry turning). */
export const PIECE: Record<OpenNeed["kind"], { width: number; area: number }> = {
  garden: { width: 7.5, area: 125 }, field: { width: 18, area: 648 }, yard: { width: 12, area: 300 }, wetland: { width: 0, area: 0 },
};

/** Recreational open space by layout area: Mumbai DCPR 2034 Regulation 27(1)(a), read (15%
 *  from 1,001 m², 20% from 2,501 m², 25% above 10,000 m²); applied on every site (assumed;
 *  Guwahati's bye-laws ask 20% for group housing, read). */
const ros = (land: number) => (land > 10000 ? 0.25 : land > 2500 ? 0.2 : land > 1000 ? 0.15 : 0);
export const OPEN_NEED: Record<ProgrammeKey, OpenNeed> = {
  homes: { kind: "garden", share: ros, source: "DCPR 2034 Reg. 27(1): recreational open space, open to the sky, a garden or playground with trees" },
  shops: { kind: "garden", share: ros, source: "DCPR 2034 Reg. 27(1): residential and commercial layouts" },
  health: { kind: "garden", share: ros, source: "DCPR 2034 Reg. 27(1), applied to health (assumed)" },
  culture: { kind: "garden", share: ros, source: "DCPR 2034 Reg. 27(1), applied to culture (assumed)" },
  education: { kind: "field", share: () => 0.5, source: "URDPFI 2014 Table 8.48-8.49: playfield 0.20 of 0.40 ha (primary), 1.00 of 1.80 ha (senior secondary), 2.50 of 5.00 ha (college)" },
  industry: { kind: "garden", share: (land) => (land >= 1000 ? 0.15 : 0), source: "DCPR 2034 Reg. 27(2): industrial plots of 1,000 m² or more, 15%" },
  water: { kind: "wetland", share: () => 0, source: "sewage treatment: its open ground a treatment wetland (design)" },
  waste: { kind: "yard", share: () => 0.3, source: "waste yard: working yard for sorting and compost windrows (assumed)" },
};

export const WETLAND: [number, number] = [0.05, 0.1];   // share of the catchment (typology/nature.ts wetland_share)
export const CANOPY_MAX = 0.6;                           // of open ground, as on one plot (plotnature.ts)
export const GREEN_MAX = 0.5;                            // of roofs: the rest stairs, tanks, terraces, solar (assumed)
/** Rain a planted roof and a tree's ground hold beyond bare roof and bare ground (m of water):
 *  plotnature.ts's run-off coefficients over its design storm. */
export const GREEN_HOLD_M = (RUNOFF.roof - RUNOFF.greenRoof) * DESIGN_RAIN_MM / 1000;
export const TREE_HOLD_M = (RUNOFF.ground - RUNOFF.underTrees) * DESIGN_RAIN_MM / 1000;

/** A lot's nature: areas in m² of its building land; green the planted share of its roofs. */
export interface LotNature { open: number; need: number; got: number; pond: number; trees: number; green: number; met: number; climate: number }

/** How much each of the site's challenges weighs (0..1), by group. */
export function climateWeights(ns: readonly Need[]) {
  const w = (...ks: string[]) => ns.reduce((m, n) => (ks.includes(n.key) ? Math.max(m, n.weight) : m), 0);
  return { wet: w("rain", "monsoon"), hot: w("heat", "humid-heat", "dry-heat") };
}

/** The nature a lot of `land` m² takes at coverage `gsi`, with `catchment` m² draining to it.
 *  usable: its open ground in pieces the programme can use (blockmass.ts usableOpen), where its
 *  layout has been measured; else all its open ground. */
export function lotNature(prog: ProgrammeKey, land: number, gsi: number, catchment: number, ns: readonly Need[], usable?: number): LotNature {
  const N = OPEN_NEED[prog] ?? OPEN_NEED.homes, { wet, hot } = climateWeights(ns);
  const open = Math.max(0, land * (1 - gsi)), need = N.share(land) * land, got = Math.min(open, usable ?? open, need), spare = open - got;
  const pond = N.kind === "wetland" ? spare : Math.min(spare, (WETLAND[0] + (WETLAND[1] - WETLAND[0]) * wet) * Math.max(catchment, land));
  const canopy = CANOPY_MAX * (0.5 + 0.5 * hot);
  // trees on the dry spare ground, and in a garden (not on a playfield or a yard)
  const trees = canopy * (spare - pond + (N.kind === "garden" ? got : 0));
  const green = GREEN_MAX * Math.max(wet, hot);
  const met = need > 0 ? got / need : 1;
  // a storm on the lot: roofs (some planted) and open ground run off to the ponds, which hold their depth
  const roof = land * gsi, P = DESIGN_RAIN_MM / 1000, total = land * P;
  let soaked = 0, runoff = 0;
  const add = (a: number, c: number) => { soaked += (1 - c) * a * P; runoff += c * a * P; };
  add(roof * green, RUNOFF.greenRoof); add(roof * (1 - green), RUNOFF.roof);
  add(trees, RUNOFF.underTrees); add(Math.max(0, open - pond - trees), RUNOFF.ground);
  const held = total ? Math.min(1, (soaked + Math.min(pond * POND_M, runoff + pond * P)) / total) : 0;
  const cover = open ? Math.min(1, (pond + trees) / open) : 0;
  return { open, need, got, pond, trees, green, met, climate: (held + cover) / 2 };
}
