// What the brief compiler is told about a site: its size, its layers in a few numbers, its
// rules and its current brief. Made in the browser from the site file and the rules as
// edited in the layer cake, so the compiler sees the same ground the person does.
import * as E from "../engine/index.js";
import { placeOf } from "./retrieve.js";

export interface SiteSummary {
  name: string;
  place: string;                 // mumbai | ahmedabad | other
  origin: [number, number];      // lon, lat
  grid: string;                  // "20 m hexes"
  design_ha: number;
  target: { fsi: number; floor_area_ha: number | null; floor_area_target_ha: number };
  design_storm_mm: number;
  sea_levels_m: Record<string, number>;
  height_cap_levels: number;     // the rules' default cap on open ground
  ground_ha: { forbidden: number; retained: number; constrained: number; open: number; conflicts: number };
  layers: {
    ground_m: [number, number, number];   // lowest, median, highest bare-earth height
    flooded_ha: number | null;            // land the highest sea level reaches (coastal sites)
    deepest_flood_m: number | null;
    rain_pooling_ha: number;              // land where rain pools more than 0.2 m
    green_share: number; built_share: number; industrial_share: number;
  };
  rules: { name: string; kind: string; off: boolean; limits: E.RuleLimits; roles: string[]; why: string }[];
}

const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;

export function summarise(site: E.SiteExport, rules: E.RuleSet, res: E.RuleResult): SiteSummary {
  const g = site.grid, L = g.layers!, n = g.x.length, ha = site.meta.cell_area / 1e4;
  const land = [...Array(n).keys()].filter((i) => !L.water[i]);
  const col = (name: string) => land.map((i) => Number(L[name]?.[i] ?? 0));
  const ground = col("ground").sort((a, b) => a - b);
  const floods = Object.keys(L).filter((k) => k.startsWith("flood_"));
  const top = floods.length ? floods.reduce((a, b) => (Math.max(...col(a)) >= Math.max(...col(b)) ? a : b)) : null;
  const flood = top ? col(top) : [];
  const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
  const green = land.map((i) => Number(L.trees?.[i] ?? 0) + Number(L.green?.[i] ?? 0) + Number(L.mangrove?.[i] ?? 0));
  const count = [0, 0, 0, 0];
  let conflicts = 0;
  for (const i of land) { count[res.state[i]]++; if (res.conflict[i]) conflicts++; }
  const m = site.meta;
  const G = E.prepare(site);
  return {
    name: m.name, place: placeOf(m.origin), origin: m.origin, grid: E.gridLabel(E.gridOf(m)),
    design_ha: m.design_ha,
    target: { fsi: m.target_far, floor_area_ha: m.target_floor_area_ha, floor_area_target_ha: r1(E.floorAreaTarget(G) / 1e4) },
    design_storm_mm: m.design_storm_mm, sea_levels_m: m.sea_levels ?? {},
    height_cap_levels: rules.defaults.max_levels,
    ground_ha: { forbidden: r1(count[0] * ha), retained: r1(count[1] * ha), constrained: r1(count[2] * ha),
      open: r1(count[3] * ha), conflicts: r1(conflicts * ha) },
    layers: {
      ground_m: [r1(ground[0] ?? 0), r1(ground[Math.floor(ground.length / 2)] ?? 0), r1(ground[ground.length - 1] ?? 0)],
      flooded_ha: top ? r1(flood.filter((v) => v > 0).length * ha) : null,
      deepest_flood_m: top ? r1(Math.max(0, ...flood)) : null,
      rain_pooling_ha: r1(col("pool").filter((v) => v > 0.2).length * ha),
      green_share: r2(mean(green)), built_share: r2(mean(col("built"))), industrial_share: r2(mean(col("industrial"))),
    },
    rules: rules.list.map((r) => ({ name: r.name, kind: r.kind, off: E.isOff(r), limits: r.limits, roles: r.roles, why: r.why })),
  };
}
