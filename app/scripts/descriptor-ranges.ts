// Where MAP-Elites' traits fall (app/engine/elites.ts DESCRIPTORS): the 2nd and 98th
// percentiles over 500 random designs per site, against the ranges the bins cover.
//   npm run ranges  (in app/)
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DESCRIPTORS, DESCRIPTOR_KEYS, evaluate, grow, makeRng, prepare, randomGenome, type SiteExport } from "../engine";

const SITES = ["mumbai-ewf", "mumbai-docks", "ahmedabad-wadaj"];
const values: Record<string, number[]> = Object.fromEntries(DESCRIPTOR_KEYS.map((k) => [k, []]));
for (const id of SITES) {
  const G = prepare(JSON.parse(readFileSync(join(import.meta.dirname, "..", "public", "sites", `${id}.json`), "utf8")) as SiteExport);
  const rng = makeRng(17);
  for (let n = 0; n < 500; n++) {
    const d = grow(randomGenome(rng), G);
    evaluate(d, G);
    for (const k of DESCRIPTOR_KEYS) values[k].push(DESCRIPTORS[k].value(d, G));
  }
}
const q = (xs: number[], p: number) => [...xs].sort((a, b) => a - b)[Math.floor(p * (xs.length - 1))];
console.log(`| trait | bins cover | 2nd to 98th percentile, ${SITES.length * 500} random designs |\n|---|---|---|`);
for (const k of DESCRIPTOR_KEYS) {
  const { label, range } = DESCRIPTORS[k];
  console.log(`| ${label} | ${range[0]} to ${range[1]} | ${q(values[k], 0.02).toFixed(2)} to ${q(values[k], 0.98).toFixed(2)} |`);
}
