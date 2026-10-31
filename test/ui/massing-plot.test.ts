// One plot, one building (architecture-v3 section 13, step B1): an envelope from a plot's
// outline, and the building-scale search running on it unchanged.
import { describe, expect, it } from "vitest";
import * as M from "../../app/engine/massing";
import { floorArea } from "../../app/engine/massing/voxels";
import { CLIMATE } from "../../app/engine/typology/climate";
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
    for (let k = 1; k < candidates.length; k++) expect(candidates[k].answer.fit).toBeLessThanOrEqual(candidates[k - 1].answer.fit + 1e-9);
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
