// Bench fixtures for the building scale: one massing per site and representation, bred for a
// few generations, written with everything pc/massing_check.py needs (bench.ts). pytest
// rechecks them (test/python/test_massing_check.py); vitest checks the browser still builds
// and scores them the same (test/ui/massing.test.ts).
//
//   npm run massing-bench            writes test/massing/fixtures/*.json
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import * as E from "../engine/index.js";
import * as M from "../engine/massing/index.js";
import { bench } from "../engine/massing/bench.js";
import { BENCH_SITES, KINDS, benchSetup } from "./massing-bench-setup.js";

mkdirSync("../test/massing/fixtures", { recursive: true });
for (const id of BENCH_SITES) {
  const setup = benchSetup(id);
  const G = E.prepare(JSON.parse(readFileSync(`public/sites/${id}.json`, "utf8")));
  for (const kind of KINDS) {
    const { E: env, ctx } = M.prepareBlock(G, setup);
    const run = M.evolveMassing(ctx, { kind, population: 12, generations: 3, seed: 5 });
    const best = run.pop[0];
    const out = bench(env, best.massing, ctx.where, best.scores, { site: id, setup, kind, massGenome: best.genome });
    const path = `../test/massing/fixtures/${id}-${kind}.json`;
    writeFileSync(path, JSON.stringify(out));
    console.log(path, `${env.plots.length} plots, ${Math.round(best.floor)} m², ${(run.ms / 1000).toFixed(1)} s`);
  }
}
