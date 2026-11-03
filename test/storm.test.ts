// The storm chain on a plan (engine/plan/storm.ts; architecture-v3 section 14, step P6): the lots'
// ponds fill first, the public water spaces only once they overflow, and fuller with more rain.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import * as E from "../app/engine/index.js";
import { makeRng } from "../app/engine/rng.js";

const site = (id: string) => E.prepare(JSON.parse(readFileSync(join(__dirname, "..", "app", "public", "sites", `${id}.json`), "utf8")));

describe("the storm chain", () => {
  const G = site("mumbai-docks"), d = E.grow(E.randomGenome(makeRng(20261104), 3.1), G), big = E.bigStorm(G);
  const wet = (mm: number) => E.stormOn(d.plan!, mm, big);
  const total = (mm: number) => wet(mm).spaces.reduce((a, s) => a + s.fill, 0);

  test("a dry day: nothing holds water", () => {
    expect(wet(0).lots).toBe(0);
    expect(total(0)).toBe(0);
    expect(wet(0).running).toBe(false);
  });

  test("the lots fill first; the public spaces stay dry until they overflow", () => {
    expect(wet(E.STORM_MM.lots / 2).lots).toBeCloseTo(0.5, 6);
    expect(total(E.STORM_MM.lots)).toBe(0);
    expect(wet(E.STORM_MM.lots + 10).running).toBe(true);
    expect(total(E.STORM_MM.lots + 10)).toBeGreaterThan(0);
  });

  test("more rain, fuller spaces; at the design storm the water spaces are full", () => {
    expect(total(big)).toBeGreaterThanOrEqual(total((big + E.STORM_MM.lots) / 2));
    expect(total(big)).toBeGreaterThan(total(E.STORM_MM.lots + 10));
    const full = wet(big).spaces.filter((s, j) => (d.plan!.shared!.spaces[j].need ?? 0) > 0);
    expect(full.length).toBeGreaterThan(0);
    for (const s of full) expect(s.fill).toBeGreaterThan(0.99);
    expect(wet(big * 1.2).spill).toBe(true);
  });
});
