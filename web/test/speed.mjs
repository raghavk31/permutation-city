// How long does a full evolution take in JavaScript?   node web/test/speed.mjs
import { readFileSync } from "node:fs";
import { prepare, evolve, frontFamilies, stats } from "../engine.js";

for (const id of ["mumbai-docks", "mumbai-ewf", "ahmedabad-wadaj"]) {
  const G = prepare(JSON.parse(readFileSync(new URL(`../dist/${id}.json`, import.meta.url), "utf8")));
  const t0 = performance.now();
  const run = evolve(G, { generations: 30, pop: 60, seed: 1, shock: [15, 1.3] });
  const ms = performance.now() - t0;
  const fams = frontFamilies(run);
  const h = run.history.at(-1);
  console.log(`${id}: ${run.everyone} designs in ${(ms / 1000).toFixed(1)} s · on brief ${h.on_brief} · `
    + `${fams.length} families · best storage ${h.storage} (after a ×1.3 storm) · coolest +${h.heat}`);
  const s = stats(fams[0].lead.design, G);
  console.log(`   family A: ${s.floor_area_ha.toFixed(0)} ha, ${s.mean_levels.toFixed(1)} storeys, `
    + `green ${(s.landscape * 100).toFixed(0)}%, water ${(s.water * 100).toFixed(0)}%`);
}
