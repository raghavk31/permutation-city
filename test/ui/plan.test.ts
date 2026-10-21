// Version 3 growth: vector plans (app/engine/plan) on every benchmark site.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as E from "../../app/engine";
import { BUILDING } from "../../app/engine/config";
import { familyOf } from "../../app/engine/plan/field";
import { area, obb, type Line } from "../../app/engine/plan/geom";

const load = (id: string) => E.prepare(JSON.parse(readFileSync(join(__dirname, "..", "..", "app", "public", "sites", `${id}.json`), "utf8")));

/** A ring's sharpest corner in degrees (edges under half a metre skipped). */
function minAngle(r: Line): number {
  let m = 180;
  for (let k = 0; k < r.length; k++) {
    const a = r[(k - 1 + r.length) % r.length], b = r[k], c = r[(k + 1) % r.length];
    const ux = a[0] - b[0], uy = a[1] - b[1], vx = c[0] - b[0], vy = c[1] - b[1];
    const lu = Math.hypot(ux, uy), lv = Math.hypot(vx, vy);
    if (lu < 0.5 || lv < 0.5) continue;
    m = Math.min(m, Math.acos(Math.max(-1, Math.min(1, (ux * vx + uy * vy) / lu / lv))) * 180 / Math.PI);
  }
  return m;
}

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
  it("cuts building plots without many slivers, wedges or spikes", () => {
    let n = 0, thin = 0, wedge = 0, sharp = 0;
    for (const d of designs) {
      const fam = familyOf((d.settings as E.SettingsV3).pattern);
      for (const p of d.plan!.plots) {
        if (p.use !== BUILDING) continue;
        const b = obb(p.ring), fill = Math.abs(area(p.ring)) / (4 * b.hl * b.hw);
        n++;
        if (2 * b.hw < 0.6 * fam.frontage[0]) thin++;
        if (fill < 0.6) wedge++;
        if (minAngle(p.ring) < 30) sharp++;
      }
    }
    expect(thin / n).toBeLessThan(0.03);
    expect(wedge / n).toBeLessThan(0.15);
    expect(sharp / n).toBeLessThan(0.08);
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

describe("version 3 traits (MAP-Elites)", () => {
  const G = load("mumbai-docks");
  const withStreets = (streets: { pts: number[][] }[]) => ({ plan: { streets, blocks: [], plots: [] } }) as unknown as E.Design;
  it("reads a grid as ordered and scattered bearings as not", () => {
    const grid = [{ pts: [[0, 0], [100, 0]] }, { pts: [[0, 0], [0, 100]] }];
    expect(E.DESCRIPTORS.orientation_order.value(withStreets(grid), G)).toBeCloseTo(1, 6);
    const fan = Array.from({ length: 18 }, (_, k) => ({ pts: [[0, 0], [Math.sin(k * Math.PI / 18 + 0.01) * 50, Math.cos(k * Math.PI / 18 + 0.01) * 50]] }));
    expect(E.DESCRIPTORS.orientation_order.value(withStreets(fan), G)).toBeLessThan(0.01);
  });
  it("reads 0 for a design without a plan", () => {
    const d = E.grow(E.randomGenome(E.makeRng(2)), G);
    for (const k of E.DESCRIPTOR_KEYS.filter((k) => E.DESCRIPTORS[k].v3)) expect(E.DESCRIPTORS[k].value(d, G)).toBe(0);
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
