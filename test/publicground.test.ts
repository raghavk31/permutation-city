// Public ground placed by rule (engine/plan/shared.ts; architecture-v3 section 14, step P3):
// water spaces where rain gathers and low, every building plot within a walk of a doorstep
// space, schools' playfields across a street, and every space recorded with its family.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import * as E from "../app/engine/index.js";
import { locator } from "../app/engine/plan/ground.js";
import { makeRng } from "../app/engine/rng.js";
import { OPEN_FAMILIES } from "../app/engine/typology/types.js";

const site = (id: string) => E.prepare(JSON.parse(readFileSync(join(__dirname, "..", "app", "public", "sites", `${id}.json`), "utf8")));

describe("public ground by rule", () => {
  const G = site("mumbai-docks"), rng = makeRng(20261103);
  const designs = Array.from({ length: 3 }, () => E.grow(E.randomGenome(rng, 3.1), G));

  test("every space has a rule and a family, and holds no more than it was sized for", () => {
    for (const d of designs) {
      const sh = d.plan!.shared!;
      expect(sh.spaces.length).toBeGreaterThan(0);
      for (const s of sh.spaces) {
        expect(Object.keys(OPEN_FAMILIES)).toContain(s.family);
        expect(s.area).toBeGreaterThan(0);
        expect(s.storage).toBeGreaterThanOrEqual(0);
        for (const k of s.plots) expect(d.plan!.plots[k].use).not.toBe(1);   // no longer building plots
      }
      expect(sh.water.held).toBeLessThanOrEqual(sh.water.need + 1);
    }
  });

  test("water spaces sit where rain gathers, on the lower half of the ground", () => {
    const loc = locator(G), zs = Array.from(G.z!).sort((a, b) => a - b), med = zs[zs.length >> 1];
    const water = designs.flatMap((d) => d.plan!.shared!.spaces.filter((s) => s.rule === "water"));
    expect(water.length).toBeGreaterThan(0);
    for (const s of water) expect(s.gather).toBeGreaterThan(0);
    const low = water.filter((s) => { const c = loc.cell(s.at); return c >= 0 && G.z![c] <= med; });
    expect(low.length / water.length).toBeGreaterThanOrEqual(0.5);
  });

  test("every building plot's floor is within a walk of a doorstep space", () => {
    for (const d of designs) expect(d.plan!.shared!.access.doorstep).toBeGreaterThan(0.95);
  });

  test("a school's playfield across the street is in another block, on what were home plots", () => {
    let fields = 0;
    for (const d of designs) {
      const plan = d.plan!;
      for (const s of plan.shared!.spaces.filter((x) => x.rule === "field")) {
        fields++;
        const school = plan.plots[s.of!].block;
        for (const k of s.plots) expect(plan.plots[k].block).not.toBe(school);
        expect(plan.programme!.plot[s.of!]).toBe(2);   // education
      }
    }
    expect(fields).toBeGreaterThan(0);
  });
});
