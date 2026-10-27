// Rules in plain words (design system, "Plain words"): a rule's condition as a sentence whose
// numbers are the parts a person can change ("Never built where the hillside is steeper than 25%").
import type * as E from "../../engine";
import { FAMILIES } from "../../engine/config";
import * as Cake from "../new/cake";

/** A piece of a sentence: words, or a number someone can edit (in the units shown). */
export type Part = { text: string } | { leaf: Cake.Leaf; shown: number; unit: string; scale: number };

// COPY: rule verbs and comparison words
export const VERB: Record<E.Rule["kind"], string> = {
  forbidden: "Never built", retained: "Kept as it is", constrained: "Built with limits",
};
const OP: Record<string, string> = { ">": "over", ">=": "at least", "<": "under", "<=": "at most", "==": "exactly", "!=": "not" };

/** Units for a layer's numbers, and the factor from stored to shown (shares are shown in %). */
function unitOf(l: Cake.Layer): { unit: string; scale: number } {
  if (l.name === "slope") return { unit: "%", scale: 100 };
  if (l.kind === "share") return { unit: "%", scale: 100 };
  if (l.kind === "hectares") return { unit: " ha", scale: 1 };
  if (l.kind === "metres") return { unit: l.name === "lst" ? " °C" : " m", scale: 1 };
  return { unit: "", scale: 1 };
}

// COPY: how a yes/no layer reads in a sentence
const FLAG: Record<string, string> = {
  water: "on water", in_design: "inside the design area", industrial: "on industrial or rail land",
  valley_buffer: "beside a valley", mapped_channel: "on a mapped stream or drain", sea: "where the sea reaches",
};
// COPY: how a measured layer is named in a sentence
const NAME: Record<string, string> = {
  slope: "the slope", edge_dist: "the distance to water", valley_order: "the stream order",
  flow_acc_ha: "the area draining here", lst: "the hot-season surface", ground: "the ground",
};
const NOT_FLAG: Record<string, string> = { in_design: "outside the design area", industrial: "off industrial land", water: "on land" };

function parts(c: E.Condition, site: E.SiteExport): Part[] {
  if ("all" in c) return c.all.flatMap((p, k) => (k ? [{ text: " and " }, ...parts(p, site)] : parts(p, site)));
  if ("any" in c) return c.any.flatMap((p, k) => (k ? [{ text: " or " }, ...parts(p, site)] : parts(p, site)));
  if ("not" in c) {
    const inner = c.not;
    if ("layer" in inner && !inner.op) return [{ text: NOT_FLAG[inner.layer] ?? `not ${FLAG[inner.layer] ?? Cake.layerInfo(inner.layer, site).label}` }];
    return [{ text: "not " }, ...parts(inner, site)];
  }
  const l = Cake.layerInfo(c.layer, site);
  if (!c.op) return [{ text: FLAG[c.layer] ?? `where there is ${l.label}` }];
  const { unit, scale } = unitOf(l), leaf = Cake.leaves(c)[0];
  const name = NAME[l.name] ?? l.label;
  const op = l.name === "slope" && c.op === ">" ? "is steeper than" : l.name === "edge_dist" && c.op === "<" ? "is under" : `is ${OP[c.op] ?? c.op}`;
  return [{ text: `${name} ${op} ` }, { leaf, shown: +(((c.value ?? 0) * scale).toFixed(2)), unit, scale }];
}

/** The rule's condition as a sentence ("Where the slope is steeper than 25%", "On water").
 *  Leaf paths are relative to the rule's whole condition. */
export function sentence(r: E.Rule, site: E.SiteExport): Part[] {
  const ps = parts(r.when, site);
  const first = ps[0];
  if (first && "text" in first && /^(on |in |inside |outside |off |beside |where |not )/.test(first.text)) {
    ps[0] = { text: first.text[0].toUpperCase() + first.text.slice(1) };
  } else ps.unshift({ text: "Where " });
  // give each editable part the path to its comparison in the whole condition
  const ls = Cake.leaves(r.when);
  let k = 0;
  return ps.map((p) => ("leaf" in p ? { ...p, leaf: ls[k++] } : p));
}

/** What a rule's limits allow, as short phrases. */
export function limits(r: E.Rule): string[] {
  const out: string[] = [];
  if (r.limits.max_levels !== undefined) out.push(`at most ${r.limits.max_levels} level${r.limits.max_levels === 1 ? "" : "s"}`);
  if (r.limits.min_permeable !== undefined) out.push(`${Math.round(r.limits.min_permeable * 100)}% left unsealed`);
  if (r.limits.uses?.length) out.push(`only ${r.limits.uses.join(", ")}`);
  if (r.limits.raised_ground) out.push("on raised ground");
  return out;
}

// Genes in plain words (inspector): version 3's site-wide genes, grouped, each with how its
// decoded value reads. The attractors are drawn on the plan instead.
const pctOf = (v: number) => `${Math.round(v * 100)}%`;
const weight = (v: number) => (v < 0.05 ? "off" : v < 0.35 ? "a little" : v < 0.7 ? "some" : "strongly");
export interface GeneWords { gene: E.GeneV3; label: string; fmt: (v: number) => string }
// COPY: gene groups and labels
export const GENE_GROUPS: [string, GeneWords[]][] = [
  ["Land", [
    { gene: "water_share", label: "water", fmt: pctOf },
    { gene: "green_share", label: "green", fmt: pctOf },
    { gene: "follow_water", label: "water follows the streams", fmt: pctOf },
  ]],
  ["Buildings", [
    { gene: "coverage", label: "ground covered", fmt: pctOf },
    { gene: "intensity", label: "height, against the limit", fmt: pctOf },
    { gene: "peak", label: "heights peak at the centres", fmt: (v) => (v < 1 ? "gently" : v < 2 ? "clearly" : "sharply") },
    { gene: "base", label: "height away from the centres", fmt: pctOf },
  ]],
  ["Streets and plots", [
    { gene: "pattern", label: "block pattern", fmt: (v) => familyName(v) },
    { gene: "local_spacing", label: "local streets every", fmt: (v) => `${Math.round(v)} m` },
    { gene: "plot_depth", label: "plot depth", fmt: (v) => `${Math.round(v * 100)}% of the pattern's range` },
    { gene: "detour", label: "routes detour to share a street", fmt: (v) => `up to ${pctOf(v)}` },
  ]],
  ["Main routes go to", [
    { gene: "w_gates", label: "the site's gates", fmt: weight },
    { gene: "w_centres", label: "centres", fmt: weight },
    { gene: "w_transit", label: "transit stops", fmt: weight },
    { gene: "w_schools", label: "schools", fmt: weight },
    { gene: "w_markets", label: "markets", fmt: weight },
  ]],
  ["Local streets follow", [
    { gene: "f_landform", label: "the land", fmt: weight },
    { gene: "f_edges", label: "water edges and roads", fmt: weight },
    { gene: "f_wind", label: "the wind", fmt: weight },
  ]],
  // version 3.1 only: a block takes the type it allows that the genes prefer most, near its density
  ["Building types preferred", [
    { gene: "t_courtyard", label: "courtyards", fmt: weight },
    { gene: "t_perimeter", label: "perimeter blocks", fmt: weight },
    { gene: "t_row", label: "row housing", fmt: weight },
    { gene: "t_towers", label: "podium with towers", fmt: weight },
  ]],
];

/** The block pattern family a `pattern` gene value picks (its five bands). */
function familyName(v: number): string {
  return FAMILIES[Math.min(Math.floor(v * FAMILIES.length), FAMILIES.length - 1)].name;
}
