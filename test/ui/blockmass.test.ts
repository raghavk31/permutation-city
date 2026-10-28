// Default massing of typed blocks (app/engine/plan/blockmass.ts): clipping, each type's layout,
// and the consistency check between what a type promises and what its massing delivers.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as E from "../../app/engine";
import { clip, GAP_FLAG, massBlock, massPlan } from "../../app/engine/plan/blockmass";
import { BLOCK_TYPES } from "../../app/engine/plan/blocktypes";
import { area, type Line } from "../../app/engine/plan/geom";

const sq = (x: number, y: number, w: number, h: number): Line => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
const T = (key: string) => BLOCK_TYPES.findIndex((t) => t.key === key);
const typed = (key: string, depth: number, storeys: number, land: number) => ({ block: 0, type: T(key), gsi: 0.5, storeys, fsi: 0, depth, towers: key === "towers" ? 1 : 0, land });

describe("clipping", () => {
  it("cuts a polygon to a convex window", () => {
    expect(Math.abs(area(clip(sq(0, 0, 10, 10), sq(5, 5, 10, 10))))).toBeCloseTo(25, 6);
    expect(clip(sq(0, 0, 10, 10), sq(20, 20, 5, 5)).length).toBe(0);
  });
});

describe("a 60 x 90 m block", () => {
  const land = [sq(0, 0, 90, 60)];
  it("lays rows that cover the share the arithmetic gives", () => {
    const m = massBlock(typed("row", 10, 3, 5400), land);
    // rows 10 m deep, 9.6 m apart across 60 m: three rows, 10% of each left open
    expect(m.gsi).toBeCloseTo((0.9 * 3 * 10) / 60, 2);
    expect(m.masses.every((x) => x.storeys === 3)).toBe(true);
  });
  it("lays a perimeter ring round a yard", () => {
    const m = massBlock(typed("perimeter", 12, 4, 5400), land);
    const ring = (90 * 60 - 66 * 36) / 5400;
    expect(m.gsi).toBeGreaterThan(0.8 * ring);
    expect(m.gsi).toBeLessThan(ring + 1e-6);
  });
  it("keeps every building on the land", () => {
    for (const key of ["courtyard", "perimeter", "row", "towers"]) for (const x of massBlock(typed(key, 12, 4, 5400), land).masses)
      for (const [px, py] of x.ring) { expect(px).toBeGreaterThan(-1e-6); expect(px).toBeLessThan(90 + 1e-6); expect(py).toBeGreaterThan(-1e-6); expect(py).toBeLessThan(60 + 1e-6); }
  });
});

describe.each(["bengaluru-cascade", "mumbai-docks"])("massing the typed blocks of %s", (id) => {
  const G = E.prepare(JSON.parse(readFileSync(join(__dirname, "..", "..", "app", "public", "sites", `${id}.json`), "utf8")));
  const d = E.grow(E.randomGenome(E.makeRng(11), 3.1), G), plan = d.plan!;
  const r = massPlan(plan.types!, (b) => plan.plots.filter((p) => p.block === b && p.use === E.BUILDING).map((p) => p.ring));
  it("masses every typed block", () => {
    expect(r.masses.length).toBeGreaterThan(0);
    expect(new Set(r.masses.map((m) => m.block)).size).toBeGreaterThan(plan.types!.filter((t) => t.type >= 0).length * 0.8);
  });
  it("delivers each low type's floor area within the flag on most blocks", () => {
    const low = r.checks.filter((c) => BLOCK_TYPES[c.type].key !== "towers");
    expect(low.filter((c) => Math.abs(c.gap) <= GAP_FLAG).length / low.length).toBeGreaterThan(0.6);
  });
});
