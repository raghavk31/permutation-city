// How designs from an evolution hold up under the shock presets (docs/shocks.md): the front of
// one run per site, each design under every sea-level and rain preset and the IMD heatwaves.
//
//   npm run shock-survey [-- <site> ...]
import { readFileSync } from "node:fs";
import * as E from "../engine/index.js";

const args = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const ids = args.length ? args : ["mumbai-docks", "mumbai-ewf", "ahmedabad-wadaj", "bengaluru-cascade"];
const med = (v: number[]) => { const s = [...v].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
const range = (v: number[], f: (x: number) => string) => `${f(med(v))} (${f(Math.min(...v))}–${f(Math.max(...v))})`;
const pct = (x: number) => `${Math.round(x * 100)}%`;

for (const id of ids) {
  const site: E.SiteExport = JSON.parse(readFileSync(`public/sites/${id}.json`, "utf8"));
  const G = E.prepare(site), S = E.shockSite(site, G);
  const run = E.evolve(G, { generations: 20, pop: 40, seed: 1 });
  const front = run.pop.filter((i) => i.rank === 1 && i.design.scores!.gap <= E.TARGET_TOLERANCE).map((i) => i.design);
  console.log(`\n## ${id}: ${front.length} designs on the front (20 generations × 40, seed 1)\n`);
  console.log("| shock | what fails | median (range) |\n|---|---|---|");
  for (const p of E.seaPresets(site.meta)) {
    const r = front.map((d) => E.seaShock(d, G, S, p.value));
    const flooded = r.map((x) => x.fail.filter((v) => v > 0).length / G.n), lost = r.map((x) => 1 - x.after.floorHa / x.before.floorHa);
    console.log(`| sea ${p.label} | ground flooded; floor lost | ${range(flooded, pct)}; ${range(lost, pct)} |`);
  }
  for (const p of E.rainPresets(site.meta)) {
    const r = front.map((d) => E.rainShock(d, G, S, p.value));
    const spill = r.map((x) => x.fail.filter((v) => v > 0).length / G.n), st = r.map((x) => x.after.scores.storage);
    const bld = r.map((x) => x.fail.filter((v) => v === 2).length);
    console.log(`| rain ${p.label} | cells failing; buildings over plinth; storage | ${range(spill, pct)}; ${range(bld, (x) => String(x))}; ${range(st, pct)} |`);
  }
  for (const p of E.HEAT_PRESETS) {
    const r = front.map((d) => E.heatShock(d, G, S, p.value));
    console.log(`| heat ${p.label} | public ground overheated (usual day → heatwave) | ${range(r.map((x) => x.share[0]), pct)} → ${range(r.map((x) => x.share[1]), pct)} |`);
  }
}
