// Time version 3 growth by stage, per site (A2 speed report).
//   npm run plan-profile -- [site ...] [--n 20]
import { readFileSync } from "node:fs";
import * as E from "../engine/index.js";
import { planTimes } from "../engine/plan/grow.js";

const argv = process.argv.slice(2), ni = argv.indexOf("--n"), N = ni >= 0 ? +argv[ni + 1] : 20;
const ids = argv.filter((a, i) => !a.startsWith("--") && argv[i - 1] !== "--n");
for (const id of ids.length ? ids : ["mumbai-ewf", "mumbai-docks", "ahmedabad-wadaj", "bengaluru-cascade"]) {
  const site: E.SiteExport = JSON.parse(readFileSync(`public/sites/${id}.json`, "utf8"));
  const G = E.prepare(site), rng = E.makeRng(3);
  E.grow(E.randomGenome(rng, 3), G); // warm the per-site caches
  planTimes.on = true; planTimes.t = {};
  const t0 = performance.now();
  for (let k = 0; k < N; k++) { const d = E.grow(E.randomGenome(rng, 3), G); E.evaluate(d, G); }
  const per = (performance.now() - t0) / N;
  const stages = Object.entries(planTimes.t).map(([k, v]) => `${k} ${(v / N).toFixed(1)}`).join(" · ");
  console.log(`${id} (${G.n} cells): ${per.toFixed(0)} ms per design · ${stages}`);
}
