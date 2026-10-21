// Piecemeal growth (app/engine/piecemeal.ts).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as E from "../../app/engine";
import * as Runs from "../../app/ui/runs";

const docks: E.SiteExport = JSON.parse(readFileSync(join(__dirname, "..", "..", "app", "public", "sites", "mumbai-docks.json"), "utf8"));
const G = E.prepare(docks), S = E.shockSite(docks, G), total = E.floorAreaTarget(G);

describe("growing in increments", () => {
  const rng = E.makeRng(4), g1 = E.randomGenome(rng), g2 = E.randomGenome(rng), g3 = E.randomGenome(rng);
  const f0 = E.emptyFabric(G);
  const d1 = E.growIncrement(g1, G, f0, total * 0.4, false, E.DEFAULT_RANGES, 0.4), f1 = E.buildFabric(f0, d1);
  const d2 = E.growIncrement(g2, G, f1, total * 0.7, false, E.DEFAULT_RANGES, 0.7), f2 = E.buildFabric(f1, d2);
  const d3 = E.growIncrement(g3, G, f2, total, true, E.DEFAULT_RANGES, 1), f3 = E.buildFabric(f2, d3);
  const count = (a: Uint8Array) => a.reduce((s, v) => s + v, 0);
  it("builds no more than the year's share of the land, and everything by the last", () => {
    expect(count(f1.built)).toBeLessThanOrEqual(Math.ceil(0.4 * G.n));
    expect(count(f2.built)).toBeLessThanOrEqual(Math.ceil(0.7 * G.n));
    expect(count(f3.built)).toBe(G.n);
    expect(count(d3.fallow!)).toBe(0);
  });
  it("keeps what earlier increments built exactly as built", () => {
    for (let i = 0; i < G.n; i++) if (f1.built[i]) {
      for (const d of [d2, d3]) {
        expect(d.use[i]).toBe(f1.use[i]);
        expect(d.levels[i]).toBe(f1.levels[i]);
        expect(d.floorArea[i]).toBe(f1.floorArea[i]);
      }
    }
  });
  it("lays the streets out once", () => {
    expect(Array.from(d2.street!)).toEqual(Array.from(d1.street!));
    expect(Array.from(d3.street!)).toEqual(Array.from(d1.street!));
  });
  it("leaves unbuilt ground as open ground", () => {
    for (let i = 0; i < G.n; i++) if (d1.fallow![i]) { expect(d1.use[i]).toBe(E.LANDSCAPE); expect(d1.floorArea[i]).toBe(0); }
  });
  it("replays the same fabric from the built genomes", () => {
    const fs = E.replayFabric(G, [g1, g2, g3]);
    expect(Array.from(fs[3].use)).toEqual(Array.from(f3.use));
    expect(Array.from(fs[3].floorArea)).toEqual(Array.from(f3.floorArea));
    const last = E.growLast(g3, G, fs[2]);
    expect(Array.from(last.use)).toEqual(Array.from(d3.use));
  });
});

describe("growing in increments, version 3", () => {
  const rng = E.makeRng(5), [g1, g2, g3] = [0, 1, 2].map(() => E.randomGenome(rng, 3));
  const f0 = E.emptyFabric(G);
  const d1 = E.growIncrement(g1, G, f0, total * 0.4, false, E.DEFAULT_RANGES, 0.4), f1 = E.buildFabric(f0, d1);
  const d2 = E.growIncrement(g2, G, f1, total * 0.7, false, E.DEFAULT_RANGES, 0.7), f2 = E.buildFabric(f1, d2);
  const d3 = E.growIncrement(g3, G, f2, total, true, E.DEFAULT_RANGES, 1);
  it("lays the streets, blocks and plots out once, in the first increment's frame", () => {
    expect(f1.frame).not.toBeNull();
    expect(f1.streets).toBeNull();
    for (const d of [d2, d3]) {
      expect(d.plan!.streets).toEqual(d1.plan!.streets);
      expect(d.plan!.blocks).toEqual(d1.plan!.blocks);
      expect(d.plan!.plots.map((p) => p.ring)).toEqual(d1.plan!.plots.map((p) => p.ring));
      expect(Array.from(d.street!)).toEqual(Array.from(d1.street!));
    }
  });
  it("keeps what earlier increments built, and fills the plots with each increment's own uses", () => {
    for (let i = 0; i < G.n; i++) if (f1.built[i]) {
      expect(d2.use[i]).toBe(f1.use[i]);
      expect(d2.floorArea[i]).toBe(f1.floorArea[i]);
    }
    expect(d3.genome).toEqual(g3);
    expect(d3.plan!.plots.map((p) => p.use)).not.toEqual(d1.plan!.plots.map((p) => p.use));
  });
  it("replays the same fabric from the built genomes", () => {
    const fs = E.replayFabric(G, [g1, g2, g3]);
    expect(Array.from(E.growLast(g3, G, fs[2]).use)).toEqual(Array.from(d3.use));
  });
});

describe("conditions and wholeness", () => {
  it("raises the sea, the storm and the heat with the year", () => {
    const a = E.conditionsFor(docks.meta, 2025), b = E.conditionsFor(docks.meta, 2050), c = E.conditionsFor(docks.meta, 2050, "ssp585");
    expect(a.warming).toBe(0);
    expect(a.sea).toBe(docks.meta.sea_levels.surge_today);
    expect(b.sea!).toBeGreaterThan(a.sea!);
    expect(b.storm).toBeGreaterThan(a.storm);
    expect(c.heat).toBeGreaterThan(b.heat);
    const inland = JSON.parse(readFileSync(join(__dirname, "..", "..", "app", "public", "sites", "ahmedabad-wadaj.json"), "utf8"));
    expect(E.conditionsFor(inland.meta, 2050).sea).toBeNull();
  });
  it("puts wholeness between 0 and 1", () => {
    const d = E.grow(E.randomGenome(E.makeRng(9)), G, null, E.DEFAULT_RANGES);
    const w = E.wholeness(d, G);
    expect(w).toBeGreaterThan(0); expect(w).toBeLessThan(1);
  });
});

describe("a piecemeal run", () => {
  const r = E.piecemeal(G, S, { generations: 1, pop: 8, seed: 2 });
  it("builds three increments, each penalised only by a drop in wholeness", () => {
    expect(r.increments.map((x) => x.year)).toEqual(E.YEARS);
    for (const x of r.increments) {
      expect(x.penalty).toBeCloseTo(Math.max(0, x.wholeness.before - x.wholeness.after), 3);
      expect(x.chosen.design.scores!).toHaveProperty("wholeness_kept");
    }
    expect(r.fabric.built.every((v) => v === 1)).toBe(true);
  });
  it("is the same for the same seed", () => {
    const again = E.piecemeal(G, S, { generations: 1, pop: 8, seed: 2 });
    expect(again.increments.map((x) => x.chosen.name)).toEqual(r.increments.map((x) => x.chosen.name));
    expect(Array.from(again.fabric.use)).toEqual(Array.from(r.fabric.use));
  });
  it("carries its growth and scenario in a link", () => {
    const s: Runs.RunSettings = { search: "nsga3", gens: 15, pop: 40, seed: 7, objectives: [], axes: null, bins: null, shock: null,
      growth: "piecemeal", scenario: "ssp585" };
    const q = Runs.writeLink(new URLSearchParams(), { settings: s, off: [], locks: null, pen: 0, genomeVersion: 2, build: null });
    expect(Runs.readLink(q, G.n)!.settings).toEqual(s);
  });
});
