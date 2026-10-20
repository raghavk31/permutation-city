// The spread of the space syntax readouts across random designs, per site (docs/metrics.md).
//
//   npm run syntax-survey [-- <site> ...]      12 random designs per site, exact
import { readFileSync } from "node:fs";
import * as E from "../engine/index.js";

const args = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const ids = args.length ? args : ["mumbai-docks", "mumbai-ewf", "ahmedabad-wadaj", "ahmedabad-wadaj-quad", "bengaluru-cascade"];
const keys = E.SYNTAX_KEYS;
console.log(`| site | ${keys.join(" | ")} |`);
console.log(`|---|${keys.map(() => "---").join("|")}|`);
for (const id of ids) {
  const G = E.prepare(JSON.parse(readFileSync(`public/sites/${id}.json`, "utf8")));
  const vs: Record<string, number[]> = Object.fromEntries(keys.map((k) => [k, []]));
  for (let seed = 1; seed <= 12; seed++) {
    const d = E.grow(E.randomGenome(E.makeRng(seed)), G, null, E.DEFAULT_RANGES);
    const m = E.measure(d, G, keys);
    for (const k of keys) vs[k].push(m[k]!);
  }
  const cell = (k: string) => {
    const a = vs[k], mean = a.reduce((s, v) => s + v, 0) / a.length;
    return `${mean.toFixed(2)} (${Math.min(...a).toFixed(2)}–${Math.max(...a).toFixed(2)})`;
  };
  console.log(`| ${id} | ${keys.map(cell).join(" | ")} |`);
}
