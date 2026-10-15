// Does the browser engine grow and score designs exactly as the Python engine?
//   node web/test/parity.mjs            (after: uv run pc export <sites> --fixture)
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { prepare, grow, evaluate, paretoRanks } from "../engine.js";

const here = dirname(fileURLToPath(import.meta.url));
const TOL = { storage: 0.0015, heat: 0.015, carbon: 1.5, daylight: 0.0015, human: 0.0015, gap: 0.0015 };
let failures = 0;

for (const file of readdirSync(here).filter((f) => f.startsWith("fixture-"))) {
  const fx = JSON.parse(readFileSync(join(here, file), "utf8"));
  const site = JSON.parse(readFileSync(join(here, "..", "dist", `${fx.site}.json`), "utf8"));
  const G = prepare(site);
  let useMiss = 0, levelMiss = 0, scoreMiss = 0, worst = {};
  const scores = [];
  for (const c of fx.cases) {
    const d = grow(c.genome, G);
    const s = evaluate(d, G);
    scores.push(s);
    useMiss += c.use.reduce((m, u, i) => m + (u !== d.use[i]), 0);
    levelMiss += c.levels.reduce((m, l, i) => m + (l !== d.levels[i]), 0);
    for (const k of Object.keys(TOL)) {
      const diff = Math.abs(s[k] - c.scores[k]);
      worst[k] = Math.max(worst[k] || 0, diff);
      if (diff > TOL[k]) scoreMiss++;
    }
  }
  const ranks = paretoRanks(scores);
  const rankMiss = fx.cases.reduce((m, c, i) => m + (c.rank !== ranks[i]), 0);
  const cells = fx.cases.length * G.n;
  const ok = useMiss === 0 && levelMiss === 0 && scoreMiss === 0 && rankMiss === 0;
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${fx.site}: ${fx.cases.length} designs × ${G.n} cells`
    + `  uses differ ${useMiss}/${cells}  levels differ ${levelMiss}/${cells}`
    + `  scores off ${scoreMiss}  ranks differ ${rankMiss}`);
  console.log(`      largest score difference: ${Object.entries(worst).map(([k, v]) => `${k} ${v.toPrecision(2)}`).join(", ")}`);
}
process.exit(failures ? 1 : 0);
