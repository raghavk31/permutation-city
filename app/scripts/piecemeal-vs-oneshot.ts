// Piecemeal growth against one-shot evolution at the 2050 state (docs/experiments/piecemeal-vs-oneshot.md).
//
// Three modes, the same budget of designs grown:
//   piecemeal       2025, 2035, 2050; each increment generations × pop (piecemeal.ts)
//   one-shot today  one plain run of 3 × (generations + 1) - 1 generations × pop
//   one-shot 2050   the same, scored under 2050's conditions (as piecemeal's last increment is)
// Each mode's 2050 front (rank 1 of the final population) is judged the same way: the plain
// scores, the scores under 2050's conditions, exact wholeness, diversity, and the shocks.
//
// Two more piecemeal arms for H4 (docs/research/claim.md): "piecemeal foresight" (each step
// also scored under 2050, piecemeal.scoreAhead) and "piecemeal no wholeness" (no wholeness
// objective or penalty).
//
//   npm run piecemeal-vs-oneshot [-- <site> ... --seeds 1,2 --gens 15 --pop 40 --version 2 --out file.json
//     --modes piecemeal,piecemeal foresight,piecemeal no wholeness,one-shot today,one-shot 2050]
import { readFileSync, writeFileSync } from "node:fs";
import * as E from "../engine/index.js";

const argv = process.argv.slice(2), opt = (k: string, d: string) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const flags = new Set(argv.flatMap((a, i) => (a.startsWith("--") ? [i, i + 1] : [])));
const ids = argv.filter((_, i) => !flags.has(i));
const sites = ids.length ? ids : ["mumbai-docks", "mumbai-ewf", "ahmedabad-wadaj", "bengaluru-cascade"];
const seeds = opt("seeds", "1,2").split(",").map(Number), gens = +opt("gens", "15"), pop = +opt("pop", "40");
const version = +opt("version", "2") as 2 | 3;
const out = opt("out", "piecemeal-vs-oneshot.json");
const modes = new Set(opt("modes", "piecemeal,one-shot today,one-shot 2050").split(","));
const PIECEMEAL: Record<string, E.PiecemealOptions> = {
  "piecemeal": {}, "piecemeal foresight": { foresight: true }, "piecemeal no wholeness": { wholenessObjective: false },
};

const med = (v: number[]) => { const s = v.filter(Number.isFinite).sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
const clone = (d: E.Design): E.Design => ({ ...d, scores: null });

interface Judged {
  mode: string; site: string; seed: number; seconds: number; designs: number; front: number; onBrief: number;
  plain: Record<string, number>; y2050: Record<string, number>; wholeness: number; chosen: Record<string, number>;
  spread: number; families: number;
  shocks: { seaFlooded: number | null; seaFloorLost: number | null; seaStorage: number | null; rainFailed: number; rainStorage: number; heatOverheated: number };
  increments?: { year: number; penalty: number; before: number; after: number; built: number; chosen: string; seconds: number; gap: number }[];
}

function judge(mode: string, site: string, seed: number, seconds: number, designs: number, front: E.Design[], G: E.Ground,
  S: E.ShockSite, c2050: E.Conditions, depth: Float64Array | null, chosen: E.Design): Judged {
  const target = E.floorAreaTarget(G), all = front.length;
  // The front's designs within the floor-area brief (plain scoring), when there are any.
  const plainOf = (d: E.Design) => { const x = clone(d); E.evaluate(x, G); return x.scores!; };
  const on = front.filter((d) => plainOf(d).gap <= E.TARGET_TOLERANCE);
  const onBrief = on.length;
  if (on.length) front = on;
  const plain = front.map(plainOf);
  const y = front.map((d) => { const x = clone(d); E.evaluate(x, G); E.scoreUnder(x, G, S, c2050, target, depth); return x.scores!; });
  const keys = [...E.SCORE_KEYS, "gap"] as const;
  const summary = (rows: E.Scores[]) => Object.fromEntries(keys.map((k) => [k, med(rows.map((r) => r[k]))]));
  const W = front.map((d) => E.wholeness(clone(d), G, false));
  const battery: E.ShockBattery = {
    sea: S.coastal ? c2050.sea! + E.seaRise("ssp585", 2100) - E.seaRise("ssp245", 2050) : null,
    rain: E.rainPresets(G.meta).find((p) => /^100-year/.test(p.label))?.value ?? G.meta.design_storm_mm * 2,
    heat: 4.5,
  };
  const sh = front.map((d) => { const x = clone(d); E.evaluate(x, G); return E.shockSummary(x, G, S, battery); });
  const cs = clone(chosen); E.evaluate(cs, G);
  const div = E.diversity(front);
  return {
    mode, site, seed, seconds, designs, front: all, onBrief,
    plain: summary(plain), y2050: summary(y), wholeness: med(W),
    chosen: { ...cs.scores!, wholeness: E.wholeness(clone(chosen), G, false) } as unknown as Record<string, number>,
    spread: div.spread, families: div.families,
    shocks: {
      seaFlooded: S.coastal ? med(sh.map((s) => s.sea!.flooded)) : null, seaFloorLost: S.coastal ? med(sh.map((s) => s.sea!.floorLost)) : null,
      seaStorage: S.coastal ? med(sh.map((s) => s.sea!.storage)) : null,
      rainFailed: med(sh.map((s) => s.rain.failed)), rainStorage: med(sh.map((s) => s.rain.storage)),
      heatOverheated: med(sh.map((s) => s.heat.overheated)),
    },
  };
}

const results: Judged[] = [];
for (const id of sites) {
  const site: E.SiteExport = JSON.parse(readFileSync(`public/sites/${id}.json`, "utf8"));
  const G = E.prepare(site), S = E.shockSite(site, G), target = E.floorAreaTarget(G);
  const c2050 = E.conditionsFor(G.meta, 2050), depth = c2050.sea !== null && S.coastal ? E.seaDepth(S, c2050.sea) : null;
  const oneGens = 3 * (gens + 1) - 1;
  for (const seed of seeds) {
    let t = Date.now();
    for (const [mode, extra] of Object.entries(PIECEMEAL)) {
      if (!modes.has(mode)) continue;
      t = Date.now();
      const pm = E.piecemeal(G, S, { generations: gens, pop, seed, version, ...extra });
      const last = pm.increments[pm.increments.length - 1];
      const pmFront = last.pop.filter((i) => i.rank === 1).map((i) => i.design);
      const j = judge(mode, id, seed, (Date.now() - t) / 1000, pm.increments.reduce((s, x) => s + x.everyone, 0), pmFront, G, S, c2050, depth, last.chosen.design);
      j.increments = pm.increments.map((x) => ({ year: x.year, penalty: x.penalty, before: x.wholeness.before, after: x.wholeness.after,
        built: x.chosen.design.fresh!.reduce((s, v) => s + v, 0), chosen: x.chosen.name, seconds: x.seconds,
        gap: x.chosen.design.scores!.gap }));
      results.push(j); console.error(`${id} seed ${seed} ${mode} ${j.seconds.toFixed(0)} s`);
    }

    if (modes.has("one-shot today")) {
    t = Date.now();
    const today = E.evolve(G, { generations: oneGens, pop, seed, version });
    const tFront = today.pop.filter((i) => i.rank === 1);
    results.push(judge("one-shot today", id, seed, (Date.now() - t) / 1000, today.everyone, tFront.map((i) => i.design), G, S, c2050, depth,
      E.chooseBuilt(today.pop).design));
    console.error(`${id} seed ${seed} one-shot today`);
    }

    if (modes.has("one-shot 2050")) {
    t = Date.now();
    const y = E.evolve(G, { generations: oneGens, pop, seed, version, hooks: { score: (d) => E.scoreUnder(d, G, S, c2050, target, depth) } });
    const yFront = y.pop.filter((i) => i.rank === 1);
    results.push(judge("one-shot 2050", id, seed, (Date.now() - t) / 1000, y.everyone, yFront.map((i) => i.design), G, S, c2050, depth,
      E.chooseBuilt(y.pop).design));
    console.error(`${id} seed ${seed} one-shot 2050`);
    }
    writeFileSync(out, JSON.stringify(results, null, 1));
  }
}
writeFileSync(out, JSON.stringify(results, null, 1));
console.log(`wrote ${out}: ${results.length} rows`);
