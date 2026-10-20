// Shock tests (app/engine/shocks.ts): sea level, extreme rain, heatwave on one design.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as E from "../../app/engine";

const load = (id: string): E.SiteExport => JSON.parse(readFileSync(join(__dirname, "..", "..", "app", "public", "sites", `${id}.json`), "utf8"));
const docks = load("mumbai-docks"), G = E.prepare(docks), S = E.shockSite(docks, G);
const d = E.grow(E.randomGenome(E.makeRng(11)), G, null, E.DEFAULT_RANGES);
E.evaluate(d, G);

describe("sea level", () => {
  it("maps every design cell to its grid cell, and knows Docks is coastal", () => {
    expect(Array.from(S.cell).every((c) => c >= 0)).toBe(true);
    expect(S.coastal).toBe(true);
  });
  it("floods nothing below the land and more as the sea rises", () => {
    const low = E.seaShock(d, G, S, -5);
    expect(low.fail.every((v) => v === 0)).toBe(true);
    expect(low.after).toEqual(low.before);
    const wet = (lv: number) => E.seaShock(d, G, S, lv).fail.filter((v) => v > 0).length;
    expect(wet(3.5)).toBeLessThanOrEqual(wet(4.2));
    expect(wet(4.2)).toBeLessThanOrEqual(wet(6));
    const high = E.seaShock(d, G, S, 6);
    expect(high.after.scores.storage).toBeLessThanOrEqual(high.before.scores.storage);
    expect(high.after.floorHa).toBeLessThanOrEqual(high.before.floorHa);
  });
  it("matches the site's own flood layer at its levels (connected bathtub)", () => {
    const lv = docks.meta.sea_levels.surge_2050, r = E.seaShock(d, G, S, lv), col = docks.grid.layers!.flood_surge_2050;
    for (let i = 0; i < G.n; i++) expect(r.value[i] > 0).toBe((col[S.cell[i]] ?? 0) > 0);
  });
});

describe("rain", () => {
  it("scores storage against the storm, as the evolution's climate shock does", () => {
    const r = E.rainShock(d, G, S, docks.meta.design_storm_mm * 1.5);
    const shocked = E.grow(d.genome, G, null, E.DEFAULT_RANGES);
    expect(r.after.scores.storage).toBeCloseTo(E.evaluate(shocked, G, 1.5).storage, 3);
  });
  it("fails more in a bigger storm", () => {
    const n = (mm: number) => E.rainShock(d, G, S, mm).fail.filter((v) => v > 0).length;
    expect(n(50)).toBeLessThanOrEqual(n(300));
    expect(n(300)).toBeLessThanOrEqual(n(900));
  });
});

describe("heatwave", () => {
  it("overheats more public ground as it gets hotter, and leaves the scores alone", () => {
    const a = E.heatShock(d, G, S, 0), b = E.heatShock(d, G, S, 4.5);
    expect(a.share[0]).toBeCloseTo(a.share[1], 9);
    expect(b.share[1]).toBeGreaterThanOrEqual(b.share[0]);
    expect(b.after).toEqual(b.before);
  });
});

describe("presets", () => {
  it("offers sea levels near Mumbai, none inland", () => {
    const p = E.seaPresets(docks.meta);
    expect(p.length).toBeGreaterThan(3);
    expect(p.every((x) => x.source.length > 0)).toBe(true);
    expect(E.seaPresets(load("ahmedabad-wadaj").meta)).toEqual([]);
  });
  it("offers each site's return-period storms, rising with the period", () => {
    for (const id of ["mumbai-docks", "ahmedabad-wadaj", "bengaluru-cascade"]) {
      const p = E.rainPresets(load(id).meta), levels = p.filter((x) => /-year/.test(x.label)).map((x) => x.value);
      expect(levels).toHaveLength(4);
      expect(levels).toEqual([...levels].sort((a, b) => a - b));
    }
    expect(E.rainPresets(docks.meta).some((x) => x.value === 944)).toBe(true);
  });
  it("reads AR6 rise from 2025", () => {
    expect(E.seaRise("ssp245", 2025)).toBe(0);
    expect(E.seaRise("ssp245", 2050)).toBeCloseTo(0.169 - 0.059, 3);
    expect(E.seaRise("ssp585", 2100)).toBeGreaterThan(E.seaRise("ssp245", 2100));
  });
});
