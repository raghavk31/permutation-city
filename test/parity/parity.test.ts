// Does the TypeScript engine grow, score, rank and evolve exactly as the Python engine?
// Fixtures: `uv run pc export <site> --fixture` (40 genomes grown and scored in Python, a
// stream of random numbers, and three whole evolutions).
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  evaluate, evolve, grow, makeRng, paretoRanks, prepare, randomGenome, type HistoryRow, type Scores, type SiteExport,
} from "../../app/engine";

const ROOT = join(__dirname, "..", "..");
const FIXTURES = join(__dirname, "fixtures");
const TOL: Record<keyof Scores, number> = {
  storage: 0.0015, heat: 0.015, carbon: 1.5, daylight: 0.0015, human: 0.0015, gap: 0.0015,
};

interface Fixture {
  site: string;
  cases: { genome: number[]; use: number[]; levels: number[]; scores: Scores; rank: number }[];
  rng: { seed: number; random: number[]; normal: number[] };
  evolutions: {
    case: { seed: number; generations: number; pop: number; immigrants?: number; shock?: [number, number];
      locked?: "every7"; start?: number };
    history: HistoryRow[];
    pop: { name: string; rank: number; crowd: number | null; parents: string[]; genome: number[]; scores: Scores }[];
  }[];
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

    it("draws the same random numbers", () => {
      const r = makeRng(fx.rng.seed);
      expect(fx.rng.random.map(() => r.random())).toEqual(fx.rng.random);
      expect(fx.rng.normal.map(() => r.normal(0, 0.12))).toEqual(fx.rng.normal);
    });

    for (const ev of fx.evolutions) {
      it(`evolves the same run: ${JSON.stringify(ev.case)}`, () => {
        const { locked: lockMode, start: nStart, ...opts } = ev.case;
        let locked: Int8Array | null = null;
        if (lockMode === "every7") {
          locked = new Int8Array(G.n);
          for (let i = 0; i < G.n; i += 7) locked[i] = 1 + (i % 3);
        }
        let start: number[][] | null = null;
        if (nStart) {
          const r = makeRng(99);
          start = Array.from({ length: nStart }, () => randomGenome(r));
        }
        const run = evolve(G, { ...opts, locked, start });
        expect(run.history).toEqual(ev.history);
        expect(run.pop.map((i) => ({
          name: i.name, rank: i.rank, crowd: Number.isFinite(i.crowd) ? i.crowd : null, parents: i.parents,
          genome: i.design.genome, scores: i.design.scores,
        }))).toEqual(ev.pop);
      });
    }
  });
}
