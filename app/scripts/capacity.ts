// Measure what each site's plot rules let its plans hold (engine/capacity.ts), on its ground as
// exported and, where the site has a design lake buffer wider than the law's, on the ground with
// only the law's buffer. Prints a table; --write stores it in engine/capacity-table.ts.
//   npm run capacity -- [--write]
import { readFileSync, writeFileSync } from "node:fs";
import * as E from "../engine/index.js";
import { briefFloorArea } from "../engine/fitness.js";
import { measureCapacity } from "../engine/capacity.js";
import { plotRulesOf } from "../engine/regs.js";
import { applyRules } from "../engine/rules.js";
import type { Capacity } from "../engine/types.js";

const write = process.argv.includes("--write");
const sites = Object.keys(JSON.parse(readFileSync("public/sites/sites.json", "utf8")));
const out: Record<string, Capacity[]> = {};
const ha = (m2: number) => `${(m2 / 1e4).toFixed(1)} ha`;

for (const id of sites) {
  const site: E.SiteExport = JSON.parse(readFileSync(`public/sites/${id}.json`, "utf8"));
  if (!plotRulesOf(site.meta.id)) continue;
  const grounds: [string, E.Ground][] = [["the site's rules", E.prepare(site)]];
  const design = site.rules?.list.find((r) => r.name === "lake buffer (design choice)");
  if (design && site.rules && site.grid.layers) {
    const rules = { ...site.rules, list: site.rules.list.filter((r) => r !== design) };
    const res = applyRules(rules, site.grid.layers, site.grid.x.length);
    grounds.push(["the law's lake buffer only", E.prepareFromRules(site, res)]);
  }
  out[id] = [];
  for (const [note, G] of grounds) {
    const t0 = performance.now(), c = measureCapacity(G, note), brief = briefFloorArea(G);
    out[id].push(c);
    console.log(`${id}, ${note}: brief ${ha(brief)}, rules hold ${ha(c.floor_m2)} (median plan ${ha(c.median_m2)}), ` +
      `target ${ha(Math.min(brief, c.floor_m2))}, short of the brief by ${Math.max(0, Math.round((1 - c.floor_m2 / brief) * 100))}% ` +
      `[${G.n} cells, ${((performance.now() - t0) / 1000).toFixed(0)} s]`);
  }
}

if (write) {
  writeFileSync("engine/capacity-table.ts", `// Written by scripts/capacity.ts (npm run capacity -- --write): what each site's plot rules let
// its plans hold, per ground (engine/capacity.ts). Don't edit by hand.
import type { Capacity } from "./types.js";

export const CAPACITY_TABLE: Record<string, Capacity[]> = ${JSON.stringify(out, null, 2)};
`);
  console.log("wrote engine/capacity-table.ts");
}
