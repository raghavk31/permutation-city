// How much the cell-traced streets snake, per site (snakesPerKm): the skeleton's lines
// and the routes and local streets of a few designs. Checks smoothTrace (geom.ts) by number.
//   npm run wiggle -- [site ...] [--n 5]
import { readFileSync } from "node:fs";
import * as E from "../engine/index.js";
import { snakesPerKm, length } from "../engine/plan/geom.js";
import { skeletonLines } from "../engine/plan/ground.js";

const argv = process.argv.slice(2), ni = argv.indexOf("--n"), N = ni >= 0 ? +argv[ni + 1] : 5;
const ids = argv.filter((a, i) => !a.startsWith("--") && argv[i - 1] !== "--n");
const stat = (ls: number[][][]) => {
  const v = ls.filter((l) => length(l as never) >= 100).map((l) => snakesPerKm(l as never)).sort((a, b) => a - b);
  const some = v.filter((x) => x > 0).length;
  return v.length ? `${some} of ${v.length} lines snake, worst ${v[v.length - 1].toFixed(1)} per km` : "none";
};
for (const id of ids.length ? ids : ["mumbai-ewf", "mumbai-docks", "ahmedabad-wadaj", "bengaluru-cascade", "guwahati-bharalu"]) {
  const G = E.prepare(JSON.parse(readFileSync(`public/sites/${id}.json`, "utf8")));
  const sk = skeletonLines(G).map((l) => l.points);
  const routes: number[][][] = [], locals: number[][][] = [];
  for (let k = 0; k < N; k++) {
    const d = E.grow(E.randomGenome(E.makeRng(21 + k), 3), G);
    for (const st of d.plan!.streets) (st.cls === 2 ? routes : st.cls === 1 ? locals : []).push(st.pts);
  }
  console.log(`${id} (${G.skeleton?.source}): skeleton ${stat(sk)} · routes ${stat(routes)} · local ${stat(locals)}`);
}
