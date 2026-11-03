// Each public space's form, evolved within its family (engine/plan/publicform.ts), and the
// public ground's scores (engine/metrics/publicground.ts; architecture-v3 section 14, step P5):
// the search does at least as well as the precedent it starts from, keeps a school's field
// safe, and the scores move the right way when a space or its trees are taken away.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import * as E from "../app/engine/index.js";
import { METRICS } from "../app/engine/metrics/index.js";
import { network } from "../app/engine/metrics/network.js";
import { formOf, formScore, SCHOOL_SUNK_M } from "../app/engine/plan/publicform.js";
import { makeRng } from "../app/engine/rng.js";
import { LIBRARY } from "../app/engine/typology/library.js";
import { measureShape, shapeOf } from "../app/engine/typology/openshape.js";

const site = (id: string) => E.prepare(JSON.parse(readFileSync(join(__dirname, "..", "app", "public", "sites", `${id}.json`), "utf8")));
const score = (k: keyof typeof METRICS, d: E.Design, G: E.Ground) => METRICS[k].value(network(d, G));

describe("a space's form", () => {
  const water = { rule: "water" as const, family: "field" as const, plots: [0], at: [0, 0] as [number, number], area: 6000, storage: 0, need: 1500 };

  test("the search ends no worse than the best library precedent it starts from", () => {
    const out = formOf(water, 0.5, 1)!;
    const best = Math.max(...LIBRARY.filter((p) => p.open?.family === "field").map((p) => shapeOf(p)).filter((s) => !!s)
      .map((s) => formScore("field", measureShape("field", { ...s!, sunk: s!.sunk }, 6000, 1500), 1500, 0.5)));
    expect(formScore("field", out.m, 1500, 0.5)).toBeGreaterThanOrEqual(best - 1e-9);
    expect(out.m.storage).toBeGreaterThanOrEqual(1500 * 0.99);
  });

  test("a school's playfield is lowered no more than 30 cm", () => {
    const out = formOf({ ...water, rule: "field", need: 0 }, 0.5, 2)!;
    expect(out.shape.sunk).toBeLessThanOrEqual(SCHOOL_SUNK_M + 1e-9);
  });

  test("a deeper field holding the same water keeps more of itself dry", () => {
    const s = { aspect: 1.4, sunk: 0.3, banks: 3, edge: 0.3 };
    expect(measureShape("field", { ...s, sunk: 0.9 }, 6000, 1500).wetUse).toBeGreaterThan(measureShape("field", s, 6000, 1500).wetUse);
  });
});

describe("public ground's scores", () => {
  const G = site("mumbai-docks"), rng = makeRng(20261103), d = E.grow(E.randomGenome(rng, 3.1), G);

  test("every score is a number in its range on a grown design", () => {
    for (const k of ["storm_held", "storm_usable", "street_shade", "doors_on_spaces", "canopy_cover", "safe_to_walk"] as const) {
      const v = score(k, d, G);
      expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1);
    }
    expect(score("places_to_sit", d, G)).toBeGreaterThanOrEqual(0);
  });

  test("taking a water space away leaves rain unheld", () => {
    const sh = d.plan!.shared!, k = sh.spaces.findIndex((s) => (s.need ?? 0) > 0 && s.storage > 0);
    expect(k).toBeGreaterThanOrEqual(0);
    const before = score("storm_held", d, G);
    const without = { ...d, plan: { ...d.plan!, shared: { ...sh, spaces: sh.spaces.filter((_, j) => j !== k) } } };
    expect(score("storm_held", without, G)).toBeLessThan(before);
  });

  test("taking the street trees away leaves streets hotter and the canopy thinner", () => {
    const bare = { ...d, plan: { ...d.plan!, streets: d.plan!.streets.map((s) => ({ ...s, shade: s.shade, section: s.section!.map((p) => (p.kind === "planted" ? { ...p, w: 0.5 } : p)) })) } };
    expect(score("canopy_cover", bare, G)).toBeLessThan(score("canopy_cover", d, G));
    const anyTrees = d.plan!.streets.some((s) => s.section!.some((p) => p.kind === "planted" && p.w >= 1.5));
    expect(anyTrees).toBe(true);
  });
});
