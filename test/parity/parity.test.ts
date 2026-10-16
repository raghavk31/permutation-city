// Does the TypeScript engine grow, score and rank designs exactly as the Python engine?
// Fixtures: `uv run pc export <site> --fixture` (40 genomes grown and scored in Python).
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { evaluate, grow, paretoRanks, prepare, type Scores, type SiteExport } from "../../app/engine";

const ROOT = join(__dirname, "..", "..");
const FIXTURES = join(__dirname, "fixtures");
const TOL: Record<keyof Scores, number> = {
  storage: 0.0015, heat: 0.015, carbon: 1.5, daylight: 0.0015, human: 0.0015, gap: 0.0015,
};

interface Fixture {
  site: string;
  cases: { genome: number[]; use: number[]; levels: number[]; scores: Scores; rank: number }[];
}

for (const file of readdirSync(FIXTURES).filter((f) => f.endsWith(".json"))) {
  const fx: Fixture = JSON.parse(readFileSync(join(FIXTURES, file), "utf8"));
  const site: SiteExport = JSON.parse(readFileSync(join(ROOT, "app", "public", "sites", `${fx.site}.json`), "utf8"));

  describe(fx.site, () => {
    const G = prepare(site);
    const grown = fx.cases.map((c) => {
      const d = grow(c.genome, G);
      return { d, s: evaluate(d, G) };
    });

    it("grows the same uses and levels in every cell", () => {
      fx.cases.forEach((c, k) => {
        expect(Array.from(grown[k].d.use)).toEqual(c.use);
        expect(Array.from(grown[k].d.levels)).toEqual(c.levels);
      });
    });

    it("gives the same scores", () => {
      fx.cases.forEach((c, k) => {
        for (const key of Object.keys(TOL) as (keyof Scores)[]) {
          expect(Math.abs(grown[k].s[key] - c.scores[key]), `${key}, case ${k}`).toBeLessThanOrEqual(TOL[key]);
        }
      });
    });

    it("gives the same Pareto ranks", () => {
      const ranks = paretoRanks(grown.map((g) => g.s));
      expect(Array.from(ranks)).toEqual(fx.cases.map((c) => c.rank));
    });
  });
}
