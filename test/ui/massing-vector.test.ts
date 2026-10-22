// Massing a version 3 design (app/engine/massing/vector.ts): the plots it fills are the plan's
// building plots, buildable ground stays inside its plot and off the streets, and the three
// representations breed inside the envelope.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BUILDING, DEFAULT_RANGES, grow, makeRng, prepare, randomGenome, type SiteExport } from "../../app/engine";
import * as M from "../../app/engine/massing";
import { inside, toSegment } from "../../app/engine/plan/geom";

const site: SiteExport = JSON.parse(readFileSync(join(__dirname, "..", "..", "app", "public", "sites", "mumbai-docks.json"), "utf8"));
const G = prepare(site);
const genome = randomGenome(makeRng(3), 3);
const d = grow(genome, G, null, DEFAULT_RANGES);
const blocks = M.blocksOf(d, G).sort((a, b) => b.ha - a.ha || a.id - b.id);
const block = blocks[Math.floor(blocks.length / 3)];
const setup = { genome, locks: null, ranges: DEFAULT_RANGES, block: block.id, setbacks: M.DEFAULT_SETBACKS };
const { E } = M.prepareBlock(G, setup);

describe("vector envelope", () => {
  it("masses the plan's building plots of the block", () => {
    const plots = d.plan!.plots.filter((p) => p.block === block.id && p.use === BUILDING && p.levels > 0);
    expect(blocks.length).toBeGreaterThan(10);
    expect(E.plots.length).toBe(plots.length);
    expect(block.plots).toBe(plots.length);
    expect(E.target).toBeGreaterThan(0);
  });

  it("keeps buildable ground inside its plot and clear of every street", () => {
    const plots = d.plan!.plots.filter((p) => p.block === block.id && p.use === BUILDING && p.levels > 0);
    let n = 0;
    for (let q = 0; q < E.nx * E.ny; q++) {
      const k = E.plotOf[q];
      if (k < 0) continue;
      n++;
      const pt = M.columnXY(E, q);
      expect(inside(plots[k].ring, pt)).toBe(true);
      expect(E.street[q]).toBe(0);
      for (const s of d.plan!.streets) for (let j = 1; j < s.pts.length; j++) {
        expect(toSegment(pt, s.pts[j - 1], s.pts[j]).d).toBeGreaterThanOrEqual(s.w / 2);
      }
    }
    expect(n).toBeGreaterThan(0);
  });

  it("breeds each representation inside the envelope", () => {
    for (const kind of ["typology", "field", "cppn"] as const) {
      const { ctx } = M.prepareBlock(G, setup);
      const run = M.evolveMassing(ctx, { kind, population: 8, generations: 2, seed: 5 });
      const best = run.pop[0];
      expect(best.floor).toBeGreaterThan(0);
      const N = E.nx * E.ny;
      for (let z = 0; z < E.nz; z++) for (let q = 0; q < N; q++) {
        if (best.massing.occ[z * N + q]) { expect(E.plotOf[q]).toBeGreaterThanOrEqual(0); expect(z).toBeLessThan(E.capZ[q]); }
      }
    }
  });
});
