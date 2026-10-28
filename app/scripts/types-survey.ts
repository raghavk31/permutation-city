// Building types per block (engine/plan/blocktypes.ts) over random version 3.1 designs on each
// site: how often each type is chosen and feasible, the FSI the genes asked for against what the
// types give, towers per site, and the time typing adds.
//   npm run types-survey -- [--n 24] [--site id]
import { readFileSync } from "node:fs";
import * as E from "../engine/index.js";
import { BLOCK_TYPES } from "../engine/plan/blocktypes.js";
import { planTimes } from "../engine/plan/grow.js";
import { makeRng } from "../engine/rng.js";

const arg = (k: string, d: string) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const N = +arg("n", "24"), only = arg("site", "");
const sites = Object.keys(JSON.parse(readFileSync("public/sites/sites.json", "utf8"))).filter((s) => !only || s === only);

for (const id of sites) {
  const site: E.SiteExport = JSON.parse(readFileSync(`public/sites/${id}.json`, "utf8"));
  const G = E.prepare(site), rng = makeRng(20261027);
  const chosen = BLOCK_TYPES.map(() => 0), feasible = BLOCK_TYPES.map(() => 0);
  let blocks = 0, none = 0, towers = 0, wanted = 0, got = 0, land = 0, floor = 0, floor0 = 0;
  E.grow(E.randomGenome(makeRng(1), 3.1), G);  // warm the per-site caches
  planTimes.on = true; planTimes.t = {};
  for (let k = 0; k < N; k++) {
    const g = E.randomGenome(rng, 3.1);
    const d = E.grow(g, G);
    planTimes.on = false;
    const d0 = E.grow(g.slice(0, E.LENGTH_V3_0), G);
    planTimes.on = true;
    for (const b of d.plan!.types ?? []) {
      blocks++;
      if (b.type < 0) { none++; continue; }
      chosen[b.type]++; b.feasible.forEach((f) => feasible[f]++);
      towers += b.towers; wanted += b.wanted * b.land; got += b.fsi * b.land; land += b.land;
    }
    floor += d.floorArea.reduce((a, v) => a + v, 0); floor0 += d0.floorArea.reduce((a, v) => a + v, 0);
  }
  const pct = (v: number) => `${Math.round((v / blocks) * 100)}%`;
  console.log(`${id}: ${(blocks / N).toFixed(0)} typed blocks a design, none fits ${pct(none)}; ` +
    BLOCK_TYPES.map((t, k) => `${t.name} ${pct(chosen[k])} (feasible ${pct(feasible[k])})`).join(", "));
  console.log(`  FSI asked ${(wanted / land).toFixed(2)}, given ${(got / land).toFixed(2)}; towers ${(towers / N).toFixed(2)} a design; ` +
    `floor area ${(floor / N / 1e4).toFixed(0)} ha (v3: ${(floor0 / N / 1e4).toFixed(0)} ha); typing ${((planTimes.t.types ?? 0) / N).toFixed(1)} ms ` +
    `of ${(Object.values(planTimes.t).reduce((a, v) => a + v, 0) / N).toFixed(0)} ms a plan`);
}
