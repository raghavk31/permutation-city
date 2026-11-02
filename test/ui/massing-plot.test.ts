// One plot, one building (architecture-v3 section 13, step B1): an envelope from a plot's
// outline, and the building-scale search running on it unchanged.
import { describe, expect, it } from "vitest";
import * as M from "../../app/engine/massing";
import { floorArea } from "../../app/engine/massing/voxels";
import { CLIMATE } from "../../app/engine/typology/climate";
import { rankValue } from "../../app/engine/plan/precedents";
import { area } from "../../app/engine/plan/geom";

const BENGALURU: M.Where = { lat: 12.97, lon: 77.59, utc: 5.5 };

describe("plot envelope", () => {
  const spec: M.PlotSpec = { ...M.rectPlot(40, 30, 0, 12), storeys: 4, target: 40 * 30 * 1.5, setbacks: { front: 3, side: 1.5, rear: 3 } };
  const E = M.plotEnvelope(spec);

  it("reads the plot, its setbacks and its street", () => {
    expect(E.plots).toHaveLength(1);
    const p = E.plots[0];
    expect(p.area).toBeCloseTo(1200, -2);
    // 40 - 2 × 1.5 by 30 - 3 - 3, on the 2 m raster
    expect(p.buildable).toBeGreaterThan(0.8 * 37 * 24);
    expect(p.buildable).toBeLessThan(1.2 * 37 * 24);
    expect(p.frontage).toBe(40);
    expect(p.axis).toBeCloseTo(0);
    let street = 0;
    for (let q = 0; q < E.nx * E.ny; q++) street += E.street[q];
    expect(street * E.res * E.res).toBeGreaterThan(0.8 * 40 * 12);
    expect(E.note).toEqual([]);
  });

  it("turns with the plot", () => {
    const T = M.plotEnvelope({ ...spec, ...M.rectPlot(40, 30, 90, 12) });
    expect(T.plots[0].axis).toBeCloseTo(Math.PI / 2);
    // the 2 m raster falls differently on a turned plot
    expect(Math.abs(T.plots[0].buildable - E.plots[0].buildable)).toBeLessThan(0.1 * E.plots[0].buildable);
  });

  it("puts neighbours in the context", () => {
    const N = M.plotEnvelope({ ...spec, neighbours: [{ outline: [[44, 0], [60, 0], [60, 30], [44, 30]], height: 15 }] });
    expect(N.neighbours).toEqual([0]);
    expect(Math.max(...N.existing)).toBe(15);
    expect(Math.max(...N.context)).toBe(15);
  });

  it.each(["typology", "field", "cppn"] as const)("breeds %s buildings on it", (kind) => {
    const ctx = M.massContext(E, BENGALURU);
    const run = M.evolveMassing(ctx, { kind, population: 12, generations: 3, seed: 5 });
    expect(run.front.length).toBeGreaterThan(0);
    for (const ind of run.front) {
      for (const k of M.MASS_SCORE_KEYS) expect(Number.isFinite(ind.scores[k])).toBe(true);
      // nothing outside the plot's buildable columns or above the cap
      const N = E.nx * E.ny;
      for (let v = 0; v < ind.massing.occ.length; v++) if (ind.massing.occ[v]) {
        const q = v % N, z = Math.floor(v / N);
        expect(E.plotOf[q]).toBe(0);
        expect(z).toBeLessThan(4);
      }
      expect(floorArea(E, ind.massing.occ)).toBe(ind.floor);
    }
    expect(Math.min(...run.front.map((p) => p.scores.gap))).toBeLessThan(0.5);
  });
});

describe("precedents on one plot", () => {
  const normals = CLIMATE.places["site:bengaluru-cascade"];
  const spec: M.PlotSpec = { ...M.rectPlot(48, 36, 0, 12), storeys: 5, target: 48 * 36 * 1.0, setbacks: { front: 3, side: 1.5, rear: 3 } };
  const E = M.plotEnvelope(spec);

  it("lays out the buildable land inside the setbacks", () => {
    const a = E.land!.reduce((s, r) => s + Math.abs(area(r)), 0);
    expect(a).toBeCloseTo((48 - 3) * (36 - 6), -1);
  });

  it("chooses candidates by the challenges they answer", () => {
    const { needs, candidates } = M.plotChoices({ programme: "homes", normals }, E.land!, 5);
    expect(needs.map((n) => n.key)).toContain("heat");
    expect(candidates.length).toBeGreaterThan(2);
    expect(candidates.length).toBeLessThanOrEqual(M.PLOT_CANDIDATES);
    for (let k = 1; k < candidates.length; k++) expect(rankValue(candidates[k].answer.fit, candidates[k].climate)).toBeLessThanOrEqual(rankValue(candidates[k - 1].answer.fit, candidates[k - 1].climate) + 1e-9);
  });

  it("breeds precedent variants that stay on the plot and keep their source", () => {
    const { candidates } = M.plotChoices({ programme: "homes", normals }, E.land!, 5);
    const ctx = { ...M.massContext(E, BENGALURU), candidates };
    const run = M.evolveMassing(ctx, { kind: "precedent", population: 24, generations: 6, seed: 3 });
    expect(run.front.length).toBeGreaterThan(0);
    const N = E.nx * E.ny;
    for (const ind of run.pop) {
      if (ind.massing.rejected) continue;
      expect(ind.massing.source?.precedent).toBeTruthy();
      for (let v = 0; v < ind.massing.occ.length; v++) if (ind.massing.occ[v]) expect(E.plotOf[v % N]).toBe(0);
    }
    // the front reaches near the floor wanted
    expect(Math.min(...run.front.map((p) => p.scores.gap))).toBeLessThan(0.1);

  });
});

describe("one plot's search: ranges, placement, hybrids", () => {
  const normals = CLIMATE.places["site:bengaluru-cascade"];
  const at = (fsi: number) => M.plotEnvelope({ ...M.rectPlot(48, 36, 0, 12), storeys: 5, target: 48 * 36 * fsi, setbacks: { front: 3, side: 1.5, rear: 3 } });

  it("lets a precedent whose own tile is too big shrink to fit", () => {
    const E = at(1);
    const { candidates } = M.plotChoices({ programme: "homes", normals }, E.land!, 5);
    expect(candidates.map((c) => c.p.id)).toContain("pol");
  });

  it("reaches a denser brief with single precedents, saying what moved", () => {
    const S = M.searchPlot(at(1.5), BENGALURU, { programme: "homes", normals }, { population: 32, generations: 10, seed: 3 });
    expect(S.hybrids).toBe(false);
    const near = S.run.pop.filter((p) => !p.massing.rejected && p.scores.gap <= 0.1);
    expect(near.length).toBeGreaterThan(3);
    expect(near.some((p) => p.massing.source!.drift.some((c) => c.what !== "storeys"))).toBe(true);
    for (const p of near) for (const c of p.massing.source!.drift) if (typeof c.to === "number") expect(Math.abs(c.to * 10 - Math.round(c.to * 10))).toBeLessThan(1e-9);
  });

  it("allows hybrids only when no single precedent reaches the floor wanted", () => {
    const S = M.searchPlot(at(3.5), BENGALURU, { programme: "homes", normals }, { population: 24, generations: 6, seed: 3 });
    expect(S.hybrids).toBe(true);
    expect(S.note.join(" ")).toMatch(/hybrids allowed/);
    // a hybrid builds as one precedent's arrangement with another's units
    const E = at(3.5), ctx = { ...M.massContext(E, BENGALURU), candidates: S.candidates, front: M.frontOf(E), hybrids: true };
    const g = new Array(19).fill(0.5); g[0] = 0.5 / S.candidates.length; g[12] = 1; g[13] = 0.99;
    const src = M.precedent.build(g, ctx).source!;
    expect(src.donor).toBe(S.candidates[S.candidates.length - 1].p.id);
    expect(src.drift[0].what === "units" || src.drift[1].what === "units").toBe(true);
  });

  it("moves the buildings toward the street or away from it", () => {
    // a deep plot, so one row of houses leaves slack front to back
    const E = M.plotEnvelope({ ...M.rectPlot(48, 70, 0, 12), storeys: 5, target: 1000, setbacks: { front: 3, side: 1.5, rear: 3 } });
    const { candidates } = M.plotChoices({ programme: "homes", normals }, E.land!, 5);
    const ctx = { ...M.massContext(E, BENGALURU), candidates, front: M.frontOf(E) };
    const k = candidates.findIndex((c) => c.p.id === "casa-de-patio");
    expect(k).toBeGreaterThanOrEqual(0);
    const mid = (v: number) => {
      const g = new Array(19).fill(0.5); g[0] = (k + 0.5) / candidates.length; g[1] = 0; g[2] = 1; g[4] = v; g[8] = 0;
      const m = M.precedent.build(g, ctx).source!.masses;
      return m.reduce((s, x) => s + x.ring.reduce((t, p) => t + p[1], 0) / x.ring.length, 0) / m.length;
    };
    // the street is on the south side (y < 0): against it the buildings sit lower in y
    expect(mid(0)).toBeLessThan(mid(1) - 2);
  });
});

describe("nature's rules on one plot", () => {
  const normals = CLIMATE.places["site:bengaluru-cascade"];
  const E = M.plotEnvelope({ ...M.rectPlot(48, 36, 0, 12), storeys: 5, target: 1728, setbacks: { front: 3, side: 1.5, rear: 3 } });
  const { needs, candidates } = M.plotChoices({ programme: "homes", normals }, E.land!, 5);
  const ctx = { ...M.massContext(E, BENGALURU), candidates, front: M.frontOf(E), needs };
  const with_ = (over: Record<number, number>) => {
    const g = M.ownGenes(ctx, 0);
    for (const [k, v] of Object.entries(over)) g[+k] = v;
    const m = M.precedent.build(g, ctx);
    expect(m.rejected).toBeNull();
    return { m, s: M.plotScores(E, m.occ, m.source!.nature!, needs, BENGALURU) };
  };

  it("holds more rain with ponds and planted roofs", () => {
    const bare = with_({}).s.rain, ponds = with_({ 14: 1 }).s.rain, roofs = with_({ 16: 1 }).s.rain;
    expect(ponds).toBeGreaterThan(bare + 0.05);
    expect(roofs).toBeGreaterThan(bare);
    expect(ponds).toBeLessThanOrEqual(1);
  });

  it("shades more of the plot with trees", () => {
    expect(with_({ 15: 1 }).s.plotShade).toBeGreaterThan(with_({}).s.plotShade + 0.1);
  });

  it("puts ponds at the back and trees by the buildings", () => {
    const { m } = with_({ 14: 1, 15: 0.5 }), n = m.source!.nature!, f = M.frontOf(E)!;
    const y = (q: number) => E.oy + (Math.floor(q / E.nx) + 0.5) * E.res;
    const mean = (a: Int32Array) => a.reduce((s, q) => s + y(q), 0) / a.length;
    expect(mean(n.water)).toBeGreaterThan(mean(n.trees));
    expect(f[1]).toBeLessThan(0);
  });

  it("scores eaves and openings by the climate", () => {
    // Bengaluru: hot days, a dry spell, some humid heat; deep eaves and middling openness suit
    expect(M.climateFit({ eave: 1.5, porosity: 0.25 }, needs)).toBeGreaterThan(M.climateFit({ eave: 0, porosity: 0.6 }, needs));
    const cold = [{ key: "cold" as const, weight: 1, why: "" }];
    expect(M.climateFit({ eave: 0.3, porosity: 0.1 }, cold)).toBe(1);
    expect(M.climateFit({ eave: 2, porosity: 0.5 }, cold)).toBeLessThan(0.3);
  });

  it("ranks the plot search on its own scores", () => {
    const S = M.searchPlot(E, BENGALURU, { programme: "homes", normals }, { population: 24, generations: 6, seed: 4 });
    expect(S.objectives.map(([k]) => k)).toEqual(["shade", "sky", "wind", "rain", "plotShade", "fit"]);
    const front = S.run.front.filter((p) => !p.massing.rejected);
    expect(front.length).toBeGreaterThan(0);
    for (const p of front) for (const k of ["rain", "plotShade", "fit"]) expect(Number.isFinite((p.scores as unknown as Record<string, number>)[k])).toBe(true);
    // the front holds more rain than the precedents as they came (no ponds, no planted roofs)
    expect(Math.max(...front.map((p) => (p.scores as unknown as Record<string, number>).rain))).toBeGreaterThan(0.6);
  });
});

describe("the /build page's search (plotworker.runPlot)", () => {
  it("returns distinct designs with their sources, the challenges and the candidates", async () => {
    const { runPlot } = await import("../../app/engine/massing/plotworker");
    const spec: M.PlotSpec = { ...M.rectPlot(40, 30, 90, 9), storeys: 4, target: 1200, setbacks: { front: 3, side: 1.5, rear: 3 } };
    const r = runPlot(spec, BENGALURU, { programme: "homes", normals: CLIMATE.places["site:bengaluru-cascade"], extra: { flood: 1 } }, { population: 16, generations: 4, seed: 2 });
    expect(r.needs.some((n) => n.key === "flood")).toBe(true);
    expect(r.candidates.length).toBeGreaterThan(0);
    expect(r.designs.length).toBeGreaterThan(3);
    const keys = new Set(r.designs.map((d) => JSON.stringify([d.source.precedent, d.source.params, d.source.storeys, d.source.keep, d.source.nature?.water.length, d.source.nature?.trees.length, d.source.nature?.green, d.source.nature?.eave, d.source.nature?.porosity])));
    expect(keys.size).toBe(r.designs.length);
    for (const d of r.designs) { expect(d.source.masses.length).toBeGreaterThan(0); expect(Number.isFinite(d.scores.rain)).toBe(true); }
    // structured-clone safe: what the worker posts back survives a round trip
    expect(structuredClone(r).designs.length).toBe(r.designs.length);
  });
});
