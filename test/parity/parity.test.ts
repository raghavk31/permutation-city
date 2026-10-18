// Does the TypeScript engine apply rules, grow, score, rank and evolve exactly as the
// Python engine? Fixtures: `uv run pc export <site> --fixture` (the site's rules and an
// edited set applied in Python, 40 genomes grown and scored, a stream of random numbers,
// and three whole evolutions).
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  applyRules, designFromRules, evaluate, evolve, grow, makeRng, paretoRanks, prepare, prepareFromRules, randomGenome,
  type HistoryRow, type RuleSet, type Scores, type SiteExport,
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
  rule_cases: {
    name: string; rules: RuleSet; skipped: string[];
    state: number[]; memberships: number[]; max_levels: number[]; min_permeable: number[]; uses: string[];
    conflict: number[]; roles: string[]; reasons: string[]; raised_ground: number[]; remediate: number[];
    design: SiteExport["design"];
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

    for (const rc of fx.rule_cases) {
      describe(`rules: ${rc.name}`, () => {
        const res = applyRules(rc.rules, site.grid.layers!, site.grid.x.length);

        it("gives every cell the same memberships, state and limits", () => {
          expect(res.skipped).toEqual(rc.skipped);
          expect(Array.from(res.memberships)).toEqual(rc.memberships);
          expect(Array.from(res.state)).toEqual(rc.state);
          expect(Array.from(res.maxLevels)).toEqual(rc.max_levels);
          expect(Array.from(res.minPermeable)).toEqual(rc.min_permeable);
          expect(res.uses).toEqual(rc.uses);
          expect(Array.from(res.conflict)).toEqual(rc.conflict);
          expect(res.roles).toEqual(rc.roles);
          expect(res.reasons).toEqual(rc.reasons);
          expect(Array.from(res.raisedGround)).toEqual(rc.raised_ground);
          expect(Array.from(res.remediate)).toEqual(rc.remediate);
        });

        it("rebuilds the same design ground", () => {
          expect(designFromRules(site, res)).toEqual(rc.design);
        });

        if (rc.name === "site") {
          it("matches the exported site exactly", () => {
            expect(Array.from(res.state)).toEqual(site.grid.state);
            expect(Array.from(res.memberships)).toEqual(site.grid.memberships);
            expect(designFromRules(site, res)).toEqual(site.design);
            const a = prepareFromRules(site, res), b = prepare(site);
            expect(a).toEqual(b);
          });
        }
      });
    }

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
