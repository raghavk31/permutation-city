// The form metrics on random designs: their spread per site, and how long each takes
// (docs/metrics.md quotes the ranges).
//   npm run metrics -- [metric ...]   (in app/; all metrics if none named)
import { readFileSync } from "node:fs";
import * as E from "../engine";

const SITES = ["mumbai-ewf", "mumbai-docks", "ahmedabad-wadaj", "ahmedabad-wadaj-quad"];
const only = process.argv.slice(2).filter((k) => k !== "--") as E.MetricKey[];
const keys = only.length ? only : E.METRIC_KEYS;
for (const id of SITES) {
  const G = E.prepare(JSON.parse(readFileSync(`public/sites/${id}.json`, "utf8")));
  const rng = E.makeRng(3);
  let t = performance.now();
  E.network(E.grow(E.randomGenome(rng), G), G);
  console.log(id, "links", (performance.now() - t).toFixed(0), "ms");
  const ds = Array.from({ length: 20 }, () => { const d = E.grow(E.randomGenome(rng), G); E.evaluate(d, G); return d; });
  t = performance.now();
  const ms = ds.map((d) => E.measure(d, G, keys));
  console.log("  per design", ((performance.now() - t) / 20).toFixed(1), "ms");
  for (const k of keys) {
    const v = ms.map((m) => m[k]!);
    const mean = v.reduce((a, b) => a + b, 0) / v.length;
    console.log("  ", k.padEnd(16), "min", Math.min(...v).toFixed(3), "mean", mean.toFixed(3), "max", Math.max(...v).toFixed(3));
  }
  if (only.length) continue;
  const tt: Record<string, number> = {};
  for (const k of keys) {
    const t0 = performance.now();
    for (const d of ds) E.measure(d, G, [k]);
    tt[k] = (performance.now() - t0) / 20;
  }
  console.log("  slow:", Object.entries(tt).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `${k} ${v.toFixed(1)}`).join(", "));
}
