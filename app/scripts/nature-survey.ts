// Nature on every lot (engine/plan/lotnature.ts) over random version 3.1 designs on each site:
// per programme, the share of its open ground it gets and the precedents chosen; over the site,
// ponds, trees and planted roofs, the FSI given, and the storage and heat scores with the lots'
// nature and without it (the same design, its nature taken off).
//   npm run nature-survey -- [--n 12] [--site id]
import { readFileSync } from "node:fs";
import * as E from "../engine/index.js";
import { evaluate } from "../engine/fitness.js";
import { PROGRAMMES } from "../engine/plan/programme.js";
import { makeRng } from "../engine/rng.js";

const arg = (k: string, d: string) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const N = +arg("n", "12"), only = arg("site", "");
const sites = Object.keys(JSON.parse(readFileSync("public/sites/sites.json", "utf8"))).filter((s) => !only || s === only);
const pct = (v: number) => `${Math.round(v * 100)}%`;

for (const id of sites) {
  const site: E.SiteExport = JSON.parse(readFileSync(`public/sites/${id}.json`, "utf8"));
  const G = E.prepare(site), rng = makeRng(20261102);
  const prog = PROGRAMMES.map(() => ({ land: 0, need: 0, got: 0, top: new Map<string, number>() }));
  let land = 0, pond = 0, trees = 0, roofs = 0, green = 0, open = 0, fsi = 0, climate = 0;
  const s1 = { storage: 0, heat: 0 }, s0 = { storage: 0, heat: 0 };
  for (let k = 0; k < N; k++) {
    const d = E.grow(E.randomGenome(rng, 3.1), G);
    for (const t of d.plan?.types ?? []) {
      if (t.type < 0 || !t.nature) continue;
      const n = t.nature, p = prog[t.programme];
      p.land += t.land; p.need += n.need; p.got += n.got; p.top.set(t.precedent, (p.top.get(t.precedent) ?? 0) + t.land);
      land += t.land; pond += n.pond; trees += n.trees; open += n.open; roofs += t.gsi * t.land; green += n.green * t.gsi * t.land;
      fsi += t.fsi * t.land; climate += n.climate * t.land;
    }
    const a = evaluate(d, G);
    s1.storage += a.storage / N; s1.heat += a.heat / N;
    const keep = d.nature;
    delete d.nature;
    const b = evaluate(d, G);
    d.nature = keep;
    s0.storage += b.storage / N; s0.heat += b.heat / N;
  }
  console.log(`\n${id}: ${N} designs, typed land ${(land / N / 1e4).toFixed(1)} ha, FSI given ${(fsi / land).toFixed(2)}`);
  console.log(`  open ground ${pct(open / land)} of typed land: ponds ${pct(pond / land)}, under trees ${pct(trees / land)}; roofs planted ${pct(green / roofs)}; climate work ${pct(climate / land)}`);
  console.log(`  storage ${s0.storage.toFixed(3)} -> ${s1.storage.toFixed(3)}, heat ${s0.heat.toFixed(2)} -> ${s1.heat.toFixed(2)} (without -> with the lots' nature)`);
  prog.forEach((p, k) => {
    if (!p.land) return;
    const top = [...p.top].sort((x, y) => y[1] - x[1]).slice(0, 4).map(([q, v]) => `${q} ${pct(v / p.land)}`).join(", ");
    console.log(`  ${PROGRAMMES[k].padEnd(9)} ${(p.land / N / 1e4).toFixed(1).padStart(5)} ha, open ground for it ${p.need ? pct(p.got / p.need) : "-"} of ${pct(p.need / p.land)} needed; ${top}`);
  });
}
