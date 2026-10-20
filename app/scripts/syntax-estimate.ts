// How close a run's estimate of space syntax is to the exact values the page shows
// (docs/metrics.md, "Space syntax"). Inside a run, when legibility or intelligibility is an
// objective or a MAP-Elites trait, Rn integration is computed on the condensed network
// (app/engine/syntax.ts); everything shown is exact.
//
//   npm run syntax-estimate [-- <site> ...]      20 random designs per site
import { readFileSync } from "node:fs";
import * as E from "../engine/index.js";

const sites = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const ids = sites.length ? sites : ["mumbai-docks", "ahmedabad-wadaj", "bengaluru-cascade", "mumbai-ewf"];
const pearson = (a: number[], b: number[]) => {
  const n = a.length, ma = a.reduce((s, v) => s + v, 0) / n, mb = b.reduce((s, v) => s + v, 0) / n;
  let x = 0, y = 0, z = 0;
  for (let k = 0; k < n; k++) { x += (a[k] - ma) * (b[k] - mb); y += (a[k] - ma) ** 2; z += (b[k] - mb) ** 2; }
  return x / Math.sqrt(y * z);
};
const mae = (a: number[], b: number[]) => a.reduce((s, v, k) => s + Math.abs(v - b[k]), 0) / a.length;

console.log("| site | legibility r | mean error | exact range | intelligibility r | mean error | exact, s per design | estimate, s per design |");
console.log("|---|---|---|---|---|---|---|---|");
for (const id of ids) {
  const G = E.prepare(JSON.parse(readFileSync(`public/sites/${id}.json`, "utf8")));
  const keys: E.MetricKey[] = ["legibility", "intelligibility"];
  const ex: number[][] = [[], []], es: number[][] = [[], []];
  let tE = 0, tS = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const g = E.randomGenome(E.makeRng(seed));
    const a = E.grow(g, G, null, E.DEFAULT_RANGES), b = E.grow(g, G, null, E.DEFAULT_RANGES);
    let t = performance.now();
    const m = E.measure(a, G, keys);
    tE += performance.now() - t;
    t = performance.now();
    const s = E.measure(b, G, keys, true);
    tS += performance.now() - t;
    keys.forEach((k, j) => { ex[j].push(m[k]!); es[j].push(s[k]!); });
  }
  console.log(`| ${id} | ${pearson(ex[0], es[0]).toFixed(3)} | ${mae(ex[0], es[0]).toFixed(3)} | `
    + `${Math.min(...ex[0]).toFixed(2)}–${Math.max(...ex[0]).toFixed(2)} | ${pearson(ex[1], es[1]).toFixed(3)} | ${mae(ex[1], es[1]).toFixed(3)} | `
    + `${(tE / 20000).toFixed(2)} | ${(tS / 20000).toFixed(2)} |`);
}
