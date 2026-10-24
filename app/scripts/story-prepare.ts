// The story page's prepared run (ui/story): one default run and one piecemeal run on a site,
// written to public/story/<site>.json. The page regrows the designs it shows from their
// genomes (the same genome on the same ground gives the same design), so the file holds
// genomes and scores, not geometry, and the page never runs evolution itself.
//
//   npm run story-prepare [-- <site> --seed 1]
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import * as E from "../engine/index.js";

const argv = process.argv.slice(2), opt = (k: string, d: string) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const id = argv.find((a, i) => !a.startsWith("--") && !argv[i - 1]?.startsWith("--")) ?? "mumbai-ewf";
const seed = +opt("seed", "1"), generations = 15, pop = 30;   // the workbench's default run for version 3

const site: E.SiteExport = JSON.parse(readFileSync(`public/sites/${id}.json`, "utf8"));
const G = E.prepare(site), S = E.shockSite(site, G);
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const scoresOf = (s: E.Scores) => Object.fromEntries([...E.SCORE_KEYS, "gap"].map((k) => [k, r3((s as unknown as Record<string, number>)[k])]));

let t = Date.now();
const run = E.evolve(G, { generations, pop, seed, version: 3 });
const front = run.pop.filter((i) => i.rank === 1);
const chosen = E.chooseBuilt(run.pop);
console.error(`${id}: run ${((Date.now() - t) / 1000).toFixed(0)} s, ${front.length} on the front`);

t = Date.now();
const pm = E.piecemeal(G, S, { generations, pop, seed, version: 3 });
console.error(`${id}: piecemeal ${((Date.now() - t) / 1000).toFixed(0)} s`);

const out = {
  site: id, seed, generations, pop, version: 3, made: new Date().toISOString().slice(0, 10),
  // every design grown, as [generation, storage, heat, carbon, daylight, human, gap]
  everyone: run.lineage.map((n) => [n.gen, ...n.scores.map(r3)]),
  front: front.map((i) => ({ name: i.name, genome: i.design.genome, scores: scoresOf(i.design.scores!) })),
  chosen: chosen.name,
  growth: pm.increments.map((x) => ({
    year: x.year, share: x.share, genome: x.chosen.design.genome, scores: scoresOf(x.chosen.design.scores!),
    wholeness: { before: r3(x.wholeness.before), after: r3(x.wholeness.after) }, penalty: r3(x.penalty),
    conditions: x.conditions,
  })),
};
mkdirSync("public/story", { recursive: true });
writeFileSync(`public/story/${id}.json`, JSON.stringify(out));
console.log(`wrote public/story/${id}.json`);
