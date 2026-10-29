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
// gsi: the coverage the type holds the block to (1 lays a low type out unthinned)
const typed = (key: string, depth: number, storeys: number, land: number, gsi = key === "towers" ? 0.5 : 1) =>
  ({ block: 0, type: T(key), gsi, storeys, fsi: 0, depth, towers: key === "towers" ? 1 : 0, land });

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
  it("thins a capped block to its cap, leaving whole buildings out", () => {
    const full = massBlock(typed("row", 10, 3, 5400), land), thin = massBlock(typed("row", 10, 3, 5400, 0.25), land);
    expect(thin.gsi).toBeLessThan(0.25 * (1 + GAP_FLAG));
    expect(thin.gsi).toBeGreaterThan(0.25 * (1 - GAP_FLAG));
    // the pieces kept are the full layout's, unchanged
    const key = (r: Line) => r.map(([x, y]) => `${x.toFixed(3)},${y.toFixed(3)}`).join(" ");
    const all = new Set(full.masses.map((m) => key(m.ring)));
    expect(thin.masses.every((m) => all.has(key(m.ring)))).toBe(true);
    // courtyards: a court opened on a side where the block holds fewer than three
    const court = massBlock(typed("courtyard", 10, 3, 5400, 0.3), land);
    expect(court.gsi).toBeLessThan(0.3 * (1 + GAP_FLAG));
  });
  it("leaves a block over its cap untouched only within the margin", () => {
    const full = massBlock(typed("perimeter", 12, 4, 5400), land);
    expect(massBlock(typed("perimeter", 12, 4, 5400, full.gsi), land).masses.length).toBe(full.masses.length);
  });
  it("lays no perimeter ring round a yard narrower than the ring is high", () => {
    // 40 m across, 12 m wings: a 16 m yard, under 6 storeys' 19.2 m
    expect(massBlock(typed("perimeter", 12, 6, 3600), [sq(0, 0, 90, 40)]).masses.length).toBe(0);
    expect(massBlock(typed("perimeter", 12, 4, 3600), [sq(0, 0, 90, 40)]).masses.length).toBeGreaterThan(0);
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
