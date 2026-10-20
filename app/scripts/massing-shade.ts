// How much the hot-season shade score spreads across massings, as defined now (local
// 14:00-17:00 on the 15th of March, April and May) against before (15 April, solar
// 11:00-16:00), and how often new massing takes winter sun from existing neighbours
// (docs/massing.md).
//
//   npm run massing-shade [-- <site> ...]
import { readFileSync } from "node:fs";
import * as E from "../engine/index.js";
import * as M from "../engine/massing/index.js";
import { blocked, probe } from "../engine/massing/scores.js";
import { whereOf } from "../engine/massing/setup.js";
import { dayOfYear, sunPath } from "../engine/massing/sun.js";
import { heights } from "../engine/massing/voxels.js";

const args = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const ids = args.length ? args : ["mumbai-docks", "ahmedabad-wadaj", "bengaluru-cascade"];
const stats = (v: number[]) => {
  const n = v.length, mean = v.reduce((s, x) => s + x, 0) / n, sd = Math.sqrt(v.reduce((s, x) => s + (x - mean) ** 2, 0) / n);
  return { mean, sd, lo: Math.min(...v), hi: Math.max(...v) };
};
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

console.log("| site | block | massings | shade before: mean, sd, range | shade now: mean, sd, range | sd now / before | neighbours: share > 0, mean, max |");
console.log("|---|---|---|---|---|---|---|");
for (const id of ids) {
  const G = E.prepare(JSON.parse(readFileSync(`public/sites/${id}.json`, "utf8")));
  const d = E.grow(E.randomGenome(E.makeRng(7)), G, null, E.DEFAULT_RANGES);
  const blocks = M.blocksOf(d, G).filter((b) => b.ha >= 0.3);
  // Three blocks: a mid-sized one, and the two nearest the edge of the design ground (where
  // existing neighbours are in reach).
  const edgeOf = (cells: number[]) => cells.filter((i) => { for (let k = 0; k < G.deg; k++) if (G.nbr[i * G.deg + k] < 0) return true; return false; }).length;
  const byEdge = [...blocks].sort((a, b) => edgeOf(b.cells) / b.cells.length - edgeOf(a.cells) / a.cells.length || a.id - b.id);
  const mid = [...blocks].sort((a, b) => b.ha - a.ha || a.id - b.id)[Math.floor(blocks.length / 3)];
  for (const b of [mid, byEdge[0], byEdge[1]]) {
    const { E: env, ctx } = M.prepareBlock(G, { genome: d.genome, locks: null, ranges: E.DEFAULT_RANGES, block: b.id });
    const where = whereOf(G.meta), P = probe(env, where);
    const old = sunPath(where.lat, dayOfYear(4, 15), 11, 16, 0.5);
    const before: number[] = [], now: number[] = [], nb: number[] = [];
    for (const kind of ["typology", "field", "cppn"] as const) {
      const run = M.evolveMassing(ctx, { kind, population: 16, generations: 4, seed: 3 });
      for (const p of run.pop) {
        const H = heights(env, p.massing.occ), N = env.nx * env.ny;
        let shaded = 0, n = 0;
        for (const q of P.public) {
          if (p.massing.occ[q % N]) continue;
          n++;
          for (const s of old) if (blocked(env, H, P.hmax, q, s.dir)) shaded++;
        }
        before.push(n && old.length ? shaded / (n * old.length) : 0);
        now.push(p.scores.shade);
        nb.push(p.scores.neighbours);
      }
    }
    const a = stats(before), c = stats(now), z = stats(nb);
    console.log(`| ${id} | ${b.id} (${b.ha.toFixed(1)} ha, ${P.roofs.length} roof points) | ${now.length} | `
      + `${pct(a.mean)}, ${pct(a.sd)}, ${pct(a.lo)}–${pct(a.hi)} | ${pct(c.mean)}, ${pct(c.sd)}, ${pct(c.lo)}–${pct(c.hi)} | `
      + `${(c.sd / (a.sd || NaN)).toFixed(1)}× | ${pct(nb.filter((x) => x > 0).length / nb.length)}, ${z.mean.toFixed(2)} h, ${z.hi.toFixed(2)} h |`);
  }
}
