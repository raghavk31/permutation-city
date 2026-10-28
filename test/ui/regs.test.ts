// Plot rules (engine/regs.ts) and the rule-capped target (engine/capacity.ts): built form brief,
// section 3.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as E from "../../app/engine";
import { BUILDING, STREET_SHARE_MAX } from "../../app/engine/config";
import { briefFloorArea, floorAreaTarget } from "../../app/engine/fitness";
import { capacityOf, groundKey } from "../../app/engine/capacity";
import { frameOf } from "../../app/engine/plan/grow";
import { area } from "../../app/engine/plan/geom";
import { BENGALURU as R, coverageFor, farFor, highSetback, lowSetbacks, plotRulesOf, roadStoreys } from "../../app/engine/regs";

const load = (id: string): E.SiteExport =>
  JSON.parse(readFileSync(join(__dirname, "..", "..", "app", "public", "sites", `${id}.json`), "utf8"));

describe("Bengaluru plot rules, as read", () => {
  it("gives FAR by road width and coverage by plot size (RMP 2015 Table 10)", () => {
    expect(farFor(R, 9)).toBe(1.75);
    expect(farFor(R, 12)).toBe(1.75);
    expect(farFor(R, 18)).toBe(2.25);
    expect(farFor(R, 30)).toBe(3.0);
    expect(farFor(R, 40)).toBe(3.25);
    expect(coverageFor(R, 300)).toBe(0.75);
    expect(coverageFor(R, 1500)).toBe(0.6);
    expect(coverageFor(R, 10000)).toBe(0.5);
  });
  it("caps height on roads under 9 m at 11.5 m, three storeys (Table 10 note b)", () => {
    expect(roadStoreys(R, 7.5)).toBe(3);
    expect(roadStoreys(R, 9)).toBe(Infinity);
  });
  it("sets back by height above 11.5 m and by share below (Tables 8, 9)", () => {
    expect(highSetback(R, 14)).toBe(5);
    expect(highSetback(R, 24)).toBe(8);
    expect(highSetback(R, 60)).toBe(16);
    const s = lowSetbacks(R, 25, 12, 300);
    expect(s.front).toBeCloseTo(3);
    expect(s.rear).toBeCloseTo(2);
    expect(s.side).toBeCloseTo(0.96);
    expect(lowSetbacks(R, 80, 60, 4800)).toEqual({ front: 5, rear: 5, side: 5 });
  });
  it("is only known for sites whose regulations were read", () => {
    expect(plotRulesOf("bengaluru-cascade")).toBe(R);
    expect(plotRulesOf("mumbai-docks")).toBeNull();
  });
});

describe("plans on Bengaluru keep to the plot rules", () => {
  const site = load("bengaluru-cascade"), G = E.prepare(site), rng = E.makeRng(11);
  const designs = Array.from({ length: 4 }, () => E.grow(E.randomGenome(rng, 3), G));

  it("no building plot over its FAR, its coverage or its road's height", () => {
    for (const d of designs) {
      const f = frameOf(d)!, fa = new Float64Array(f.ps.length), land = new Float64Array(f.ps.length);
      for (let i = 0; i < G.n; i++) {
        const k = f.ras.plotOf[i];
        if (d.use[i] !== BUILDING || k < 0) continue;
        fa[k] += d.floorArea[i];
        land[k] += G.cellArea * (1 - Math.min(f.ras.share[i], STREET_SHARE_MAX));
        expect(d.levels[i]).toBeLessThanOrEqual(Math.min(roadStoreys(R, f.ps[k].road), G.cap[i]));
      }
      for (let i = 0; i < G.n; i++) {
        const k = f.ras.plotOf[i];
        if (d.use[i] === BUILDING && k >= 0) expect(d.coverage[i]).toBeLessThanOrEqual(coverageFor(R, land[k]) + 1e-9);
      }
      f.ps.forEach((p, k) => {
        if (p.use !== BUILDING || !land[k]) return;
        expect(fa[k]).toBeLessThanOrEqual(farFor(R, p.road) * land[k] * (1 + 1e-9));
      });
      expect(d.plan!.rules!.capacity).toBeGreaterThan(0);
      expect(d.plan!.rules!.plotShare).toBeLessThanOrEqual(R.plotShareMax);
    }
  });
  it("records each plot's widest street", () => {
    const widths = new Set(designs.flatMap((d) => d.plan!.plots.map((p) => p.road)));
    expect([...widths].some((w) => (w ?? 0) >= 12)).toBe(true);
    for (const d of designs) for (const p of d.plan!.plots) expect(Math.abs(area(p.ring))).toBeGreaterThan(0);
  });
});

describe("the target is the lesser of the brief and the rules", () => {
  const site = load("bengaluru-cascade"), G = E.prepare(site);
  it("finds the committed capacity for the exported ground", () => {
    const c = capacityOf(G)!;
    expect(c.key).toBe(groundKey(G));
    expect(floorAreaTarget(G)).toBe(Math.min(briefFloorArea(G), c.floor_m2));
    expect(floorAreaTarget(G)).toBeLessThan(briefFloorArea(G));
  });
  it("falls back to the brief on ground it wasn't measured on, or when told not to apply it", () => {
    const H = E.prepare(site);
    H.cap = H.cap.map((v) => v + 1);
    expect(capacityOf(H)).toBeNull();
    expect(floorAreaTarget(H)).toBe(briefFloorArea(H));
    const off = E.prepare({ ...site, meta: { ...site.meta, capacity: null } });
    expect(floorAreaTarget(off)).toBe(briefFloorArea(off));
  });
  it("leaves sites without plot rules on their brief", () => {
    const D = E.prepare(load("mumbai-docks"));
    expect(floorAreaTarget(D)).toBe(briefFloorArea(D));
  });
});
