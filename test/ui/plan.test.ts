// Version 3 growth: vector plans (app/engine/plan) on every benchmark site.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as E from "../../app/engine";

const load = (id: string) => E.prepare(JSON.parse(readFileSync(join(__dirname, "..", "..", "app", "public", "sites", `${id}.json`), "utf8")));

describe.each(["mumbai-docks", "mumbai-ewf", "ahmedabad-wadaj", "bengaluru-cascade"])("version 3 on %s", (id) => {
  const G = load(id), rng = E.makeRng(101);
  const designs = Array.from({ length: 6 }, (_, k) => {
    const g = E.randomGenome(rng, 3);
    g[40 + 17] = (k % 5 + 0.5) / 5;  // each pattern family in turn
    return E.grow(g, G);
  });
  it("grows a plan with streets, blocks and plots, and the same plan from the same genome", () => {
    for (const d of designs) {
      const p = d.plan!;
      expect(p.streets.length).toBeGreaterThan(0);
      expect(p.blocks.length).toBeGreaterThan(0);
      expect(p.plots.length).toBeGreaterThan(0);
      for (const st of p.streets) expect(st.pts.length).toBeGreaterThanOrEqual(2);
    }
    const again = E.grow(designs[0].genome, G);
    expect(again.plan!.streets.length).toBe(designs[0].plan!.streets.length);
    expect(Array.from(again.levels)).toEqual(Array.from(designs[0].levels));
  });
  it("rasterises onto the grid: streets take part of cells, scores are finite", () => {
    for (const d of designs) {
      E.evaluate(d, G);
      expect(Object.values(d.scores!).every(Number.isFinite)).toBe(true);
      expect(d.floorArea.reduce((a, b) => a + b, 0)).toBeLessThan(d.grossFloorArea!);
      expect(d.street!.some((c) => c > 0)).toBe(true);
    }
  });
});

describe("genome versions", () => {
  it("reads versions by length and grows versions 1 and 2 as before", () => {
    expect(E.versionOf(new Array(E.LENGTH_V3).fill(0.5))).toBe(3);
    expect(E.versionOf(new Array(E.LENGTH).fill(0.5))).toBe(2);
    expect(E.versionOf(new Array(E.PRE_STREET_LENGTH).fill(0.5))).toBe(1);
    const G = load("mumbai-docks"), g2 = E.randomGenome(E.makeRng(3));
    expect(E.grow(g2, G).plan).toBeUndefined();
  });
});
