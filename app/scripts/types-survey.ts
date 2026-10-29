// Building types per lot (engine/plan/blocktypes.ts, precedents.ts) over random version 3.1
// designs on each site: how often each family is chosen and has a candidate, the precedents
// used and how far they drifted, the FSI the genes asked for against what the precedents give,
// towers per site, the massing check, and the time typing adds.
//   npm run types-survey -- [--n 24] [--site id]
import { readFileSync } from "node:fs";
import * as E from "../engine/index.js";
import { massPlan, GAP_FLAG } from "../engine/plan/blockmass.js";
import { FAMILIES } from "../engine/plan/precedents.js";
import { planTimes } from "../engine/plan/grow.js";
import { makeRng } from "../engine/rng.js";

const arg = (k: string, d: string) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const N = +arg("n", "24"), only = arg("site", "");
const sites = Object.keys(JSON.parse(readFileSync("public/sites/sites.json", "utf8"))).filter((s) => !only || s === only);

for (const id of sites) {
  const site: E.SiteExport = JSON.parse(readFileSync(`public/sites/${id}.json`, "utf8"));
  const G = E.prepare(site), rng = makeRng(20261027);
  const chosen = FAMILIES.map(() => 0), feasible = FAMILIES.map(() => 0);
  const used = new Map<string, { lots: number; land: number; up: number; own: number; storeys: number }>();
  const byProg = E.PLOT_PROGRAMMES.map(() => new Map<string, number>());
  let lots = 0, none = 0, towers = 0, wanted = 0, got = 0, land = 0, floor = 0, floor0 = 0, flagged = 0, checked = 0, climate = 0;
  E.grow(E.randomGenome(makeRng(1), 3.1), G);  // warm the per-site caches
  planTimes.on = true; planTimes.t = {};
  for (let k = 0; k < N; k++) {
    const g = E.randomGenome(rng, 3.1);
    const d = E.grow(g, G);
    planTimes.on = false;
    const d0 = E.grow(g.slice(0, E.LENGTH_V3_0), G);
    planTimes.on = true;
    const plan = d.plan!;
    for (const b of plan.types ?? []) {
      lots++;
      if (b.type < 0) { none++; continue; }
      chosen[b.type]++; b.feasible.forEach((f) => feasible[f]++);
      towers += b.towers; wanted += b.wanted * b.land; got += b.fsi * b.land; land += b.land; climate += b.climate * b.land;
      const own = b.drift.find((x) => x.what === "storeys")?.from ?? b.storeys;
      const u = used.get(b.precedent) ?? { lots: 0, land: 0, up: 0, own, storeys: 0 };
      u.lots++; u.land += b.land; u.storeys += b.storeys * b.land; if (b.storeys > own) u.up++;
      used.set(b.precedent, u);
      const m = byProg[b.programme]; m.set(b.precedent, (m.get(b.precedent) ?? 0) + b.land);
    }
    const r = massPlan(plan.types ?? [], (t) => t.plots.map((p) => plan.plots[p].ring));
    checked += r.checks.length; flagged += r.checks.filter((c) => c.flagged).length;
    floor += d.floorArea.reduce((a, v) => a + v, 0); floor0 += d0.floorArea.reduce((a, v) => a + v, 0);
  }
  const pct = (v: number, of = lots) => `${Math.round((v / of) * 100)}%`;
  console.log(`\n${id}: ${(lots / N).toFixed(0)} lots a design, no precedent fits ${pct(none)}; ` +
    FAMILIES.map((t, k) => `${t.name} ${pct(chosen[k])} (candidate ${pct(feasible[k])})`).join(", "));
  console.log(`  FSI asked ${(wanted / land).toFixed(2)}, given ${(got / land).toFixed(2)}; climate ${(climate / land).toFixed(2)} steps; towers ${(towers / N).toFixed(2)} a design; ` +
    `massing off by over ${GAP_FLAG * 100}% on ${pct(flagged, checked)} of lots; ` +
    `floor area ${(floor / N / 1e4).toFixed(0)} ha (v3: ${(floor0 / N / 1e4).toFixed(0)} ha); typing ${((planTimes.t.types ?? 0) / N).toFixed(1)} ms ` +
    `of ${(Object.values(planTimes.t).reduce((a, v) => a + v, 0) / N).toFixed(0)} ms a plan`);
  const top = [...used.entries()].sort((a, b) => b[1].land - a[1].land).slice(0, 10);
  console.log("  precedents by land: " + top.map(([p, u]) => `${p} ${pct(u.land, land)} (own ${u.own}, mean ${(u.storeys / u.land).toFixed(1)} storeys)`).join("; "));
  E.PLOT_PROGRAMMES.forEach((p, k) => {
    const m = [...byProg[k].entries()].sort((a, b) => b[1] - a[1]);
    if (m.length) console.log(`  ${p}: ${m.slice(0, 5).map(([q]) => q).join(", ")}`);
  });
}
