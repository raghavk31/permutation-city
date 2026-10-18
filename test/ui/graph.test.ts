// The cell grid in the browser (app/engine/graph.ts), against what pc.grid exports.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  cellAreaOf, circumradius, corners, designGraph, gridOf, passes, prepare, siteGraph, type SiteExport,
} from "../../app/engine";

const SITES = join(__dirname, "..", "..", "app", "public", "sites");
const load = (id: string): SiteExport => JSON.parse(readFileSync(join(SITES, `${id}.json`), "utf8"));

describe("grid", () => {
  it("reads files from before format 3 as hexes", () => {
    const g = gridOf({ hex_radius: 20 } as SiteExport["meta"]);
    expect(g).toMatchObject({ type: "hex", size: 20, degree: 6, edge: 20 });
    expect(g.spacing).toBe(Math.sqrt(3) * 20);
  });

  it("turns metres into the same steps as pc.grid.passes", () => {
    expect(passes(100, Math.sqrt(3) * 20)).toBe(3);
    expect(passes(35, Math.sqrt(3) * 20)).toBe(1);
    expect(passes(100, 20)).toBe(5);
    expect(passes(35, 20)).toBe(2);
    expect(passes(5, 30)).toBe(1);
  });

  it("draws cells of the right shape and size", () => {
    expect(corners({ type: "hex", size: 20 })).toHaveLength(6);
    expect(corners({ type: "quad", size: 20 })).toEqual([[10, 10], [-10, 10], [-10, -10], [10, -10]]);
    expect(circumradius({ type: "quad", size: 20 })).toBeCloseTo(14.142, 3);
    expect(cellAreaOf({ type: "quad", size: 25 })).toBe(625);
    expect(cellAreaOf({ type: "hex", size: 20 })).toBeCloseTo(1039.23, 2);
  });
});

for (const id of ["mumbai-docks", "mumbai-docks-quad"]) {
  describe(`${id}: CellGraph`, () => {
    const site = load(id), g = siteGraph(site), grid = gridOf(site.meta);

    it("has the exported grid's areas and degree", () => {
      expect(g.area(0)).toBeCloseTo(cellAreaOf(grid), 2);
      const degrees = Array.from({ length: g.n }, (_, i) => g.neighbours(i).length);
      expect(Math.max(...degrees)).toBe(grid.degree);
    });

    it("has symmetric neighbours one spacing apart, weighted by the shared edge", () => {
      for (let i = 0; i < g.n; i++) {
        for (const j of g.neighbours(i)) {
          expect(g.neighbours(j)).toContain(i);
          const [xi, yi] = g.centroid(i), [xj, yj] = g.centroid(j);
          expect(Math.hypot(xi - xj, yi - yj)).toBeCloseTo(grid.spacing, 1); // centres are rounded to cm
          expect(g.weight(i, j)).toBe(grid.edge);
        }
      }
      expect(g.weight(0, 0)).toBe(0);
    });

    it("gives the design ground the same grid", () => {
      const G = prepare(site), d = designGraph(G);
      expect(G.deg).toBe(grid.degree);
      expect(G.nbr.length).toBe(G.n * grid.degree);
      expect(d.polygon(0)).toHaveLength(grid.type === "quad" ? 4 : 6);
    });
  });
}
