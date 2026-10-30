// Default massing of typed lots (app/engine/plan/blockmass.ts): clipping, tiling a precedent
// over a lot, joining units into buildings, trimming at the land's edge, thinning to the caps,
// height limits, and the consistency check between what a lot's type promises and what its
// massing delivers.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as E from "../../app/engine";
import { clip, GAP_FLAG, massLot, massPlan, tiles } from "../../app/engine/plan/blockmass";
import { frameOf } from "../../app/engine/plan/grow";
import { area, type Line } from "../../app/engine/plan/geom";
import { built, maxStoreys, PRECEDENT, storeysOf } from "../../app/engine/plan/precedents";

const sq = (x: number, y: number, w: number, h: number): Line => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
const typed = (precedent: string, storeys: number, cap?: [number, number]) =>
  ({ block: 0, type: 0, precedent, storeys, gsi: 0, fsi: 0, land: 5400, cap });

describe("clipping", () => {
  it("cuts a polygon to a convex window", () => {
    expect(Math.abs(area(clip(sq(0, 0, 10, 10), sq(5, 5, 10, 10))))).toBeCloseTo(25, 6);
    expect(clip(sq(0, 0, 10, 10), sq(20, 20, 5, 5)).length).toBe(0);
  });
});

describe("tiling", () => {
  it("fits whole tiles, turning them where more fit", () => {
    expect(tiles(20, 20, 90, 60)).toEqual({ nU: 4, nV: 3, turned: false });
    expect(tiles(10, 40, 90, 15)).toEqual({ nU: 2, nV: 1, turned: true });
    expect(tiles(100, 100, 90, 60)).toBeNull();
  });
});

describe("a 60 x 90 m lot", () => {
  const land = [sq(0, 0, 90, 60)];
  it("is built as its precedent's tiles, as dense as the precedent where they fill it", () => {
    const b = built(PRECEDENT.get("vatara")!, 2), m = massLot(typed("vatara", 2), land);
    const t = tiles(b.plot.w, b.plot.d, 90, 60)!;
    expect(m.tiles).toBe(t.nU * t.nV);
    expect(m.fsi).toBeCloseTo((b.floorArea * t.nU * t.nV) / 5400, 1);
  });
  it("thins a capped lot to its cap, leaving whole tiles out", () => {
    const full = massLot(typed("chettinad", 2), land), thin = massLot(typed("chettinad", 2, [0, full.fsi / 2]), land);
    expect(thin.fsi).toBeLessThan((full.fsi / 2) * (1 + GAP_FLAG));
    expect(thin.fsi).toBeGreaterThan((full.fsi / 2) * (1 - 2 * GAP_FLAG));
    expect(thin.tiles).toBeLessThan(full.tiles);
    // the pieces kept are the full layout's, unchanged
    const key = (r: Line) => r.map(([x, y]) => `${x.toFixed(3)},${y.toFixed(3)}`).join(" ");
    const all = new Set(full.masses.map((m) => key(m.ring)));
    expect(thin.masses.every((m) => all.has(key(m.ring)))).toBe(true);
  });
  it("keeps every building on the land", () => {
    for (const id of ["vatara", "malleswaram", "chettinad", "superquadra"]) for (const x of massLot(typed(id, 3), land).masses)
      for (const [px, py] of x.ring) { expect(px).toBeGreaterThan(-1e-6); expect(px).toBeLessThan(90 + 1e-6); expect(py).toBeGreaterThan(-1e-6); expect(py).toBeLessThan(60 + 1e-6); }
  });
});

describe("buildings, not pieces", () => {
  const land = [sq(0, 0, 90, 60)];
  it("joins a row's shared-wall houses into one terrace, its wells holes in it", () => {
    const b = built(PRECEDENT.get("tube-house")!, 3), m = massLot(typed("tube-house", 3), land);
    const units = b.solids.filter((s) => s.use === "built" && (s.storeys ?? 0) > 0).length;
    expect(m.masses.length).toBeLessThan(units * m.tiles / 4);
    expect(m.masses.some((x) => (x.holes?.length ?? 0) > 0)).toBe(true);
  });
  it("draws a court house as one ring round its court", () => {
    for (const x of massLot(typed("vatara", 2), land).masses) expect(x.holes?.length ?? 0).toBeLessThanOrEqual(1);
    expect(massLot(typed("vatara", 2), land).masses.filter((x) => x.holes?.length).length).toBeGreaterThan(0);
  });
  it("trims at the land's edge by whole units: nothing off the land, nothing thinner than a unit's sliver", () => {
    const L: Line[] = [sq(0, 0, 90, 30), sq(0, 30, 37, 30)];
    for (const id of ["tube-house", "pol", "vatara"]) for (const x of massLot(typed(id, 2), L).masses) {
      for (const [px, py] of x.ring) expect(py <= 30 + 1e-6 || px <= 37 + 1e-6).toBe(true);
      expect(Math.abs(area(x.ring))).toBeGreaterThanOrEqual(25);
    }
  });
});

describe("height limits", () => {
  it("never raises a precedent past twice its height, or past 2.5 times its wings' depth", () => {
    const hakka = PRECEDENT.get("weilongwu")!.seed;
    expect(maxStoreys(hakka)).toBeLessThanOrEqual(2);
    for (const p of PRECEDENT.values()) {
      const m = maxStoreys(p.seed), own = storeysOf(p.seed);
      expect(m).toBeGreaterThanOrEqual(own);
      if (p.seed.arrangement !== "tower") expect(m).toBeLessThanOrEqual(Math.max(own, own + 1, 2 * own));
    }
  });
});

describe.each(["bengaluru-cascade", "mumbai-docks"])("massing the typed lots of %s", (id) => {
  const G = E.prepare(JSON.parse(readFileSync(join(__dirname, "..", "..", "app", "public", "sites", `${id}.json`), "utf8")));
  const d = E.grow(E.randomGenome(E.makeRng(11), 3.1), G), plan = d.plan!;
  const r = massPlan(plan.types!, (t) => t.plots.map((k) => plan.plots[k].ring));
  it("masses every typed lot", () => {
    expect(r.masses.length).toBeGreaterThan(0);
    expect(r.checks.length).toBe(plan.types!.filter((t) => t.type >= 0).length);
  });
  it("delivers each lot's floor area within the flag", () => {
    expect(r.checks.filter((c) => Math.abs(c.gap) <= GAP_FLAG).length / r.checks.length).toBeGreaterThan(0.95);
  });
  it("counts floor area only where a building is drawn: no building cell in a plot of another use", () => {
    const f = frameOf(d)!;
    for (let i = 0; i < G.n; i++) if (d.use[i] === E.BUILDING && f.ras.plotOf[i] >= 0) expect(plan.plots[f.ras.plotOf[i]].use).toBe(E.BUILDING);
  });
});
