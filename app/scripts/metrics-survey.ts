// The form metrics on random designs: their spread per site, and how long each takes
// (docs/metrics.md quotes the ranges).   npm run metrics  (in app/)
import { readFileSync } from "node:fs";
import * as E from "../engine";
for (const id of ["mumbai-ewf", "ahmedabad-wadaj", "mumbai-docks-quad"]) {
  const G = E.prepare(JSON.parse(readFileSync(`public/sites/${id}.json`, "utf8")));
  const rng = E.makeRng(3);
  let t = performance.now();
  E.network(E.grow(E.randomGenome(rng), G), G);
  console.log(id, "links", (performance.now() - t).toFixed(0), "ms");
  const ds = Array.from({ length: 20 }, () => { const d = E.grow(E.randomGenome(rng), G); E.evaluate(d, G); return d; });
  t = performance.now();
  const ms = ds.map((d) => E.measure(d, G));
  console.log("  per design", ((performance.now() - t) / 20).toFixed(1), "ms");
  for (const k of E.METRIC_KEYS) {
    const v = ms.map((m) => m[k]!);
    console.log("  ", k.padEnd(16), Math.min(...v).toFixed(3), Math.max(...v).toFixed(3));
  }
  const tt: Record<string, number> = {};
  for (const k of E.METRIC_KEYS) {
    const t0 = performance.now();
    for (const d of ds) E.measure(d, G, [k]);
    tt[k] = (performance.now() - t0) / 20;
  }
  console.log("  slow:", Object.entries(tt).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `${k} ${v.toFixed(1)}`).join(", "));
}
