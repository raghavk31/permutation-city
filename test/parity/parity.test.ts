// Does the TypeScript engine apply rules, grow, score, rank and evolve exactly as the
// Python engine? Fixtures: `uv run pc export <site> --fixture` (the site's rules and an
// edited set applied in Python, 40 genomes grown and scored, a stream of random numbers,
// and whole runs of NSGA-II, NSGA-III and MAP-Elites).
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  applyBrief, validateBrief, typologySeeds, type BriefContext, type RunConfig, type Brief,
  applyRules, designFromRules, evaluate, evolve, grow, makeRng, mapElites, measure, paretoRanks, type MetricKey, prepare, prepareFromRules, randomGenome,
  type HistoryRow, type RuleSet, type Scores, type SiteExport,
} from "../../app/engine";
import { choiceRn, syntaxOf } from "../../app/engine/syntax";

const ROOT = join(__dirname, "..", "..");
const FIXTURES = join(__dirname, "fixtures");
const TOL: Record<keyof Scores, number> = {
  storage: 0.0015, heat: 0.015, carbon: 1.5, daylight: 0.0015, human: 0.0015, gap: 0.0015,
};

/** One design's space syntax, segment by segment (pc/export.py `_syntax_case`). */
interface SyntaxCase {
  segments: number; site: number; links: number;
  local: { radius: number; nain: (number | null)[]; nach: (number | null)[] }[];
  rn: (number | null)[];
  choice_rn?: { nach: (number | null)[]; nain: (number | null)[] };
}

interface Fixture {
  site: string;
  cases: { genome: number[]; use: number[]; levels: number[]; scores: Scores; rank: number; metrics?: Record<string, number>;
    syntax?: SyntaxCase }[];
  rng: { seed: number; random: number[]; normal: number[] };
  evolutions: {
    case: { search?: "nsga2" | "nsga3" | "map-elites"; seed: number; generations: number; pop: number;
      immigrants?: number; shock?: [number, number]; locked?: "every7"; start?: number;
      axes?: [string, string]; bins?: number; weights?: Partial<Record<keyof Scores, number>>; objectives?: MetricKey[] };
    history: HistoryRow[];
    pop: { name: string; rank: number; crowd: number | null; parents: string[]; genome: number[]; scores: Scores;
      cell?: number; quality?: number }[];
  }[];
  rule_cases: {
    name: string; rules: RuleSet; skipped: string[];
    state: number[]; memberships: number[]; max_levels: number[]; min_permeable: number[]; uses: string[];
    conflict: number[]; roles: string[]; reasons: string[]; raised_ground: number[]; remediate: number[];
    design: SiteExport["design"];
  }[];
  briefs: {
    context: BriefContext;
    cases: { name: string; brief: Brief; warnings: string[]; config: RunConfig }[];
    seeds: number[][][];
  };
}

const BRIEF_CASES = JSON.parse(readFileSync(join(__dirname, "brief-cases.json"), "utf8"));

for (const file of readdirSync(FIXTURES).filter((f) => f.endsWith(".json"))) {
  const fx: Fixture = JSON.parse(readFileSync(join(FIXTURES, file), "utf8"));
  const site: SiteExport = JSON.parse(readFileSync(join(ROOT, "app", "public", "sites", `${fx.site}.json`), "utf8"));
  // Python has no plot rules (version 3 generation is TypeScript only in Milestone A), so the
  // engines are compared on the brief's own target.
  site.meta.capacity = null;

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

    it("gives the same form metrics", () => {
      const withMetrics = fx.cases.filter((c) => c.metrics);
      expect(withMetrics.length).toBeGreaterThan(0);
      fx.cases.forEach((c, k) => {
        if (!c.metrics) return;
        // Space syntax is in only the first few cases (it takes seconds per design in Python).
        const m = measure(grown[k].d, G, Object.keys(c.metrics) as MetricKey[]);
        for (const [key, v] of Object.entries(c.metrics)) {
          expect(m[key as MetricKey], `${key}, case ${k}`).toBeCloseTo(v, 9);
        }
      });
    });

    const sx = fx.cases.find((c) => c.syntax);
    if (sx) it("builds the same street network and space syntax, segment by segment", () => {
      const k = fx.cases.indexOf(sx), want = sx.syntax!;
      const S = syntaxOf(grown[k].d, G);
      expect([S.N.a.length, S.N.site, S.N.links]).toEqual([want.segments, want.site, want.links]);
      const near = (got: ArrayLike<number> | null, exp: (number | null)[], what: string) => {
        expect(got, what).not.toBeNull();
        exp.forEach((v, s) => {
          if (v === null) expect(Number.isFinite(got![s]), `${what} ${s}`).toBe(false);
          else expect(got![s], `${what} ${s}`).toBeCloseTo(v, 9);
        });
      };
      want.local.forEach((w, r) => { near(S.local[r].nain, w.nain, `NAIN R${w.radius}`); near(S.local[r].nach, w.nach, `NACH R${w.radius}`); });
      near(S.rn.nain, want.rn, "NAIN Rn");
      if (want.choice_rn) {
        const c = choiceRn(grown[k].d, G);
        near(c.nach, want.choice_rn.nach, "NACH Rn");
        near(c.nain, want.choice_rn.nain, "NAIN Rn (from every segment)");
      }
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

    describe("briefs", () => {
      const meta = { target_far: site.meta.target_far, target_floor_area_ha: site.meta.target_floor_area_ha,
        design_storm_mm: site.meta.design_storm_mm };
      fx.briefs.cases.forEach((c, k) => {
        it(`validates and applies the same: ${c.name}`, () => {
          const { brief, warnings } = validateBrief(BRIEF_CASES.cases[k].input, fx.briefs.context);
          expect(warnings).toEqual(c.warnings);
          expect(brief).toEqual(c.brief);
          expect(applyBrief(brief, { rules: site.rules!, meta })).toEqual(c.config);
        });
      });
      it("makes the same typology seeds", () => {
        BRIEF_CASES.seeds.forEach((s: { priors: never[]; count: number; seed: number }, k: number) => {
          expect(typologySeeds(s.priors, s.count, s.seed)).toEqual(fx.briefs.seeds[k]);
        });
      });
    });

    it("draws the same random numbers", () => {
      const r = makeRng(fx.rng.seed);
      expect(fx.rng.random.map(() => r.random())).toEqual(fx.rng.random);
      expect(fx.rng.normal.map(() => r.normal(0, 0.12))).toEqual(fx.rng.normal);
    });

    for (const ev of fx.evolutions) {
      it(`evolves the same run: ${JSON.stringify(ev.case)}`, () => {
        const { locked: lockMode, start: nStart, search, ...opts } = ev.case;
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
        const run = search === "map-elites" ? mapElites(G, { ...opts, locked, start })
          : evolve(G, { ...opts, search, locked, start });
        expect(run.history).toEqual(ev.history);
        expect(run.pop.map((i) => ({
          name: i.name, rank: i.rank, crowd: Number.isFinite(i.crowd) ? i.crowd : null, parents: i.parents,
          genome: i.design.genome, scores: i.design.scores,
          ...(search === "map-elites" ? { cell: i.cell, quality: i.quality } : {}),
        }))).toEqual(ev.pop);
      });
    }
  });
}
