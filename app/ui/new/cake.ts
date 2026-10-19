// The layer cake: each layer as its own map, stacked, with the rules that read them.
import * as E from "../../engine";
import * as Draw from "../draw";

type Kind = "metres" | "share" | "flag" | "count" | "hectares";
type Ramp = "blues" | "oranges" | "greens" | "greys";
interface LayerInfo { label: string; note: string; kind: Kind; ramp: Ramp }

/** What each layer column means (pc/layers.py). Columns not listed here still show, by name. */
const INFO: Record<string, LayerInfo> = {
  water: { label: "water", note: "sea, river, pond, dock", kind: "flag", ramp: "blues" },
  ground: { label: "ground", note: "bare-earth height above sea level (FABDEM)", kind: "metres", ramp: "greys" },
  pool: { label: "rain pooling", note: "water that sits in hollows after rain", kind: "metres", ramp: "blues" },
  catchment_ha: { label: "drainage", note: "the area that drains through this cell (unconditioned ground)", kind: "hectares", ramp: "blues" },
  upstream: { label: "cells upstream", note: "how many cells drain through this one", kind: "count", ramp: "blues" },
  edge_dist: { label: "distance to water", note: "metres to the nearest land-water edge", kind: "metres", ramp: "greys" },
  trees: { label: "trees", note: "tree cover (ESA WorldCover)", kind: "share", ramp: "greens" },
  green: { label: "other green", note: "grass, shrubs, crops, wetland plants", kind: "share", ramp: "greens" },
  mangrove: { label: "mangrove", note: "mangrove cover", kind: "share", ramp: "greens" },
  bare: { label: "bare ground", note: "bare or sparse cover", kind: "share", ramp: "greys" },
  built: { label: "buildings", note: "footprint cover (Overture: Google, OSM, Microsoft)", kind: "share", ramp: "oranges" },
  bldg_h: { label: "building height", note: "surface minus bare earth", kind: "metres", ramp: "oranges" },
  elev: { label: "surface", note: "height including buildings and trees (Copernicus)", kind: "metres", ramp: "greys" },
  industrial: { label: "industry and rail", note: "a stand-in for contaminated ground", kind: "flag", ramp: "oranges" },
  in_design: { label: "design area", note: "inside the ground to design", kind: "flag", ramp: "greys" },
  sea: { label: "sea", note: "water the sea reaches", kind: "flag", ramp: "blues" },
  wl_built: { label: "built-up (WorldCover)", note: "built-up land cover", kind: "share", ramp: "oranges" },
  wl_water: { label: "water (WorldCover)", note: "water land cover", kind: "share", ramp: "blues" },
};
const ORDER = ["water", "ground", "flood_", "pool", "catchment_ha", "upstream", "edge_dist", "trees", "green", "mangrove", "built",
  "industrial", "in_design"];
const HIDDEN = new Set(["sea", "elev", "bare", "wl_built", "wl_water", "upstream"]);

export interface Layer extends LayerInfo { name: string }

export function layerInfo(name: string, site?: E.SiteExport): Layer {
  if (name.startsWith("flood_")) {
    const level = name.slice(6), m = site?.meta.sea_levels?.[level];
    return { name, label: `sea flooding: ${level.replace(/_/g, " ")}`, kind: "metres", ramp: "blues",
      note: `depth when the sea stands at +${m ?? "?"} m, on low ground the sea can reach` };
  }
  const i = INFO[name];
  return i ? { name, ...i } : { name, label: name.replace(/_/g, " "), note: "", kind: "share", ramp: "greys" };
}

/** The layers worth showing, in reading order: water and ground, flooding, rain, green, the city. */
export function layers(site: E.SiteExport): Layer[] {
  const rank = (n: string) => {
    const k = ORDER.findIndex((o) => n === o || (o.endsWith("_") && n.startsWith(o)));
    return k < 0 ? 99 : k;
  };
  return Object.keys(site.grid.layers ?? {}).filter((n) => !HIDDEN.has(n))
    .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b)).map((n) => layerInfo(n, site));
}

const GREENS = ["#d3f2e4", "#8fdcb9", "#1baf7a", "#11815a", "#0a4f37"];
const GREYS = ["#f0efec", "#d0cec7", "#a3a29b", "#6f6e69", "#3d3c39"];

/** Colour of each grid cell for a layer. Cells with nothing to show stay blank. */
export function colours(site: E.SiteExport, l: Layer, P: Draw.Palette): (i: number) => string | null {
  const v = site.grid.layers![l.name], water = site.grid.layers!.water;
  const ramp = l.ramp === "blues" ? P.blues : l.ramp === "oranges" ? P.oranges : l.ramp === "greens" ? GREENS : GREYS;
  if (l.kind === "flag") return (i) => (v[i] ? ramp[3] : null);
  const land = v.filter((x, i) => x !== null && (!water[i] || l.name === "water")) as number[];
  const sorted = [...land].sort((a, b) => a - b);
  const q = (t: number) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(t * sorted.length))] : 0);
  let lo = l.kind === "share" ? 0 : q(0.02), hi = l.kind === "share" ? 1 : q(0.98);
  // Drainage on a log scale, from one cell (nothing drains in) up.
  const logScale = l.name === "upstream" || l.name === "catchment_ha";
  if (logScale) { lo = l.name === "upstream" ? 1 : site.meta.cell_area / 1e4; hi = Math.max(q(0.99), 10 * lo); }
  if (l.name === "edge_dist") hi = Math.min(hi, 1000);
  const t = (x: number) => (logScale ? Math.log(x / lo) / Math.log(hi / lo) : (x - lo) / (hi - lo || 1));
  const continuous = l.name === "ground" || l.name === "edge_dist";
  return (i) => {
    const x = v[i];
    if (x === null || (water[i] && l.name !== "water")) return null;
    if (!continuous && x <= (logScale ? lo * 1.0001 : 0)) return null; // nothing here (or only itself)
    return Draw.ramp(ramp, t(x));
  };
}

export function format(l: Layer, x: number | null): string {
  if (x === null) return "no value";
  if (l.kind === "flag") return x ? "yes" : "no";
  if (l.kind === "share") return `${Math.round(x * 100)}%`;
  if (l.kind === "count") return Math.round(x).toLocaleString("en-IN");
  if (l.kind === "hectares") return `${Number(x.toFixed(x >= 10 ? 0 : 2))} ha`;
  return `${Math.abs(x) >= 100 ? Math.round(x) : Number(x.toFixed(2))} m`;
}

// --- rules ------------------------------------------------------------------------------

export const OPS = [">", ">=", "<", "<=", "==", "!="] as const;
export const STATE_NOTES = ["never built on", "kept as it is", "buildable with limits", "the genes decide"];

/** A comparison inside a rule's condition, with the path to it, so its number can be edited. */
export interface Leaf { path: number[]; layer: string; op?: string; value?: number; negated: boolean }

export function leaves(c: E.Condition, path: number[] = [], negated = false): Leaf[] {
  if ("all" in c) return c.all.flatMap((p, k) => leaves(p, [...path, k], negated));
  if ("any" in c) return c.any.flatMap((p, k) => leaves(p, [...path, k], negated));
  if ("not" in c) return leaves(c.not, [...path, 0], !negated);
  return [{ path, layer: c.layer, op: c.op, value: c.value, negated }];
}

type Change = Partial<{ op: string; value: number }>;

function setAt(c: E.Condition, path: number[], change: Change): E.Condition {
  if (!path.length) return "layer" in c ? ({ ...c, ...change } as E.Condition) : c;
  const [k, ...rest] = path;
  if ("all" in c) return { all: c.all.map((p, i) => (i === k ? setAt(p, rest, change) : p)) };
  if ("any" in c) return { any: c.any.map((p, i) => (i === k ? setAt(p, rest, change) : p)) };
  if ("not" in c) return { not: setAt(c.not, rest, change) };
  return c;
}

/** A copy of the rules with one comparison changed. */
export function editLeaf(rules: E.RuleSet, ruleId: number, path: number[], change: Change): E.RuleSet {
  return { ...rules, list: rules.list.map((r) => (r.id === ruleId ? { ...r, when: setAt(r.when, path, change) } : r)) };
}

/** A copy of the rules with one limit changed (undefined removes it). */
export function editLimit(rules: E.RuleSet, ruleId: number, key: "max_levels" | "min_permeable",
  value: number | undefined): E.RuleSet {
  return { ...rules, list: rules.list.map((r) => {
    if (r.id !== ruleId) return r;
    const limits = { ...r.limits };
    if (value === undefined) delete limits[key]; else limits[key] = value;
    return { ...r, limits };
  }) };
}

/** Turn a rule off or on. Off, it matches nothing (all of: itself and its negation) and
 *  keeps its id, so memberships stay comparable; on, it gets its condition back. */
export function setOff(rules: E.RuleSet, ruleId: number, off: boolean): E.RuleSet {
  return { ...rules, list: rules.list.map((r) => {
    if (r.id !== ruleId || isOff(r) === off) return r;
    return { ...r, when: off ? { all: [r.when, { not: r.when }] } : (r.when as { all: E.Condition[] }).all[0] };
  }) };
}

export function isOff(r: E.Rule): boolean {
  const w = r.when;
  return "all" in w && w.all.length === 2 && "not" in w.all[1] && JSON.stringify(w.all[1].not) === JSON.stringify(w.all[0]);
}

export function describe(c: E.Condition, site?: E.SiteExport): string {
  const name = (l: string) => layerInfo(l, site).label;
  if ("all" in c) return c.all.map((p) => describe(p, site)).join(" and ");
  if ("any" in c) return `(${c.any.map((p) => describe(p, site)).join(" or ")})`;
  if ("not" in c) return `not ${describe(c.not, site)}`;
  return c.op ? `${name(c.layer)} ${c.op} ${c.value}` : name(c.layer);
}

/** Hectares of land each rule touches. */
export function ruleHectares(site: E.SiteExport, res: E.RuleResult): number[] {
  const water = site.grid.layers!.water, a = site.meta.cell_area / 1e4;
  return res.hits.map((m) => {
    let n = 0;
    for (let i = 0; i < m.length; i++) if (m[i] && !water[i]) n++;
    return n * a;
  });
}

/** Hectares of land in each state (forbidden, retained, constrained, open), and in conflict. */
export function stateHectares(site: E.SiteExport, res: E.RuleResult): { states: number[]; conflict: number } {
  const water = site.grid.layers!.water, a = site.meta.cell_area / 1e4, states = [0, 0, 0, 0];
  let conflict = 0;
  for (let i = 0; i < res.n; i++) {
    if (water[i]) continue;
    states[res.state[i]] += a;
    if (res.conflict[i]) conflict += a;
  }
  return { states, conflict };
}
