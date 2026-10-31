// Programme per plot (engine/plan/programme.ts) over random version 3.1 designs on each site:
// people, land per programme, facilities needed and placed, the land they were short, water,
// waste, bus stops and the time placing adds.
//   npm run programme-survey -- [--n 8] [--site id]
import { readFileSync } from "node:fs";
import * as E from "../engine/index.js";
import { planTimes } from "../engine/plan/grow.js";
import { FACILITIES, PROGRAMMES } from "../engine/plan/programme.js";
import { makeRng } from "../engine/rng.js";

const arg = (k: string, d: string) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const N = +arg("n", "8"), only = arg("site", "");
const sites = Object.keys(JSON.parse(readFileSync("public/sites/sites.json", "utf8"))).filter((s) => !only || s === only);

for (const id of sites) {
  const site: E.SiteExport = JSON.parse(readFileSync(`public/sites/${id}.json`, "utf8"));
  const G = E.prepare(site), rng = makeRng(20261029);
  E.grow(E.randomGenome(makeRng(1), 3.1), G);
  planTimes.on = true; planTimes.t = {};
  const land = PROGRAMMES.map(() => 0), needed = FACILITIES.map(() => 0), got = FACILITIES.map(() => 0);
  let people = 0, short = 0, need = 0, stops = 0, access = 0, mld = 0, tpd = 0;
  for (let k = 0; k < N; k++) {
    const pr = E.grow(E.randomGenome(rng, 3.1), G).plan!.programme!;
    people += pr.people; pr.land.forEach((v, i) => (land[i] += v));
    pr.needed.forEach((v, i) => (needed[i] += v)); pr.got.forEach((v, i) => (got[i] += v));
    for (const p of pr.placed) { need += p.need; short += Math.max(p.need - p.land, 0); }
    stops += pr.stops.length; access += pr.stopAccess; mld += pr.water.mld; tpd += pr.waste_tpd;
  }
  const all = land.reduce((a, v) => a + v, 0);
  console.log(`${id}: ${Math.round(people / N)} people (${Math.round(people / N / site.meta.design_ha)} a hectare of design ground); ` +
    PROGRAMMES.map((p, i) => `${p} ${Math.round((land[i] / all) * 100)}%`).join(", "));
  console.log(`  facilities needed/placed: ` + FACILITIES.map((f, i) => needed[i] ? `${f.key} ${(needed[i] / N).toFixed(1)}/${(got[i] / N).toFixed(1)}` : "").filter(Boolean).join(", "));
  console.log(`  land short ${Math.round((short / Math.max(need, 1)) * 100)}% of what facilities needed; water ${(mld / N).toFixed(1)} MLD, waste ${(tpd / N).toFixed(1)} t/day; ` +
    `${(stops / N).toFixed(1)} bus stops, ${Math.round((access / N) * 100)}% of homes' floor within 400 m; programme ${((planTimes.t.programme ?? 0) / N).toFixed(1)} ms ` +
    `of ${(Object.values(planTimes.t).reduce((a, v) => a + v, 0) / N).toFixed(0)} ms a plan`);
}
