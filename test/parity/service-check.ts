// Load a site built by the layer service into the browser engine: rules, design ground
// and a short evolution. Usage: npx vite-node ../test/parity/service-check.ts <file.json>
import { readFileSync } from "node:fs";
import { applyRules, designFromRules, evolve, prepare, prepareFromRules, type SiteExport } from "../../app/engine";

const site: SiteExport = JSON.parse(readFileSync(process.argv[2], "utf8"));
const n = site.grid.x.length;
const res = applyRules(site.rules!, site.grid.layers!, n);
const same = JSON.stringify(designFromRules(site, res)) === JSON.stringify(site.design);
const G = prepareFromRules(site, res);
const t = performance.now();
const run = evolve(G, { generations: 10, pop: 30, seed: 1 });
console.log({
  name: site.meta.name, cells: n, design: G.n, format: site.meta.format, skipped: res.skipped,
  layers: Object.keys(site.grid.layers!).length, rebuildMatchesExport: same,
  front: run.pop.filter((i) => i.rank === 1).length, ms: Math.round(performance.now() - t),
  prepareMatches: JSON.stringify(prepare(site).siteWater) === JSON.stringify(G.siteWater),
});
