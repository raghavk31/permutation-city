// Building-scale massing (app/engine/massing; docs/massing.md). TS only (decision D4): these
// tests and the bench fixtures, which pc/massing_check.py rechecks in Python, stand in for
// parity.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_RANGES, grow, makeRng, prepare, randomGenome, STOREY_M, type SiteExport } from "../../app/engine";
import * as M from "../../app/engine/massing";
import { rle } from "../../app/engine/massing/bench";
import { compile, cppn, OUTPUT, type Cppn } from "../../app/engine/massing/cppn";
import { shapes, TYPES } from "../../app/engine/massing/typology";
import { repair } from "../../app/engine/massing/voxels";

const SITES = join(__dirname, "..", "..", "app", "public", "sites");
const FIXTURES = join(__dirname, "..", "massing", "fixtures");
const load = (id: string): SiteExport => JSON.parse(readFileSync(join(SITES, `${id}.json`), "utf8"));
const wadaj = load("ahmedabad-wadaj"), G = prepare(wadaj);
const design = grow(randomGenome(makeRng(7)), G, null, DEFAULT_RANGES);
const blocks = M.blocksOf(design, G).filter((b) => b.ha >= 0.3).sort((a, b) => b.ha - a.ha || a.id - b.id);
const big = blocks[0];

describe("bench fixtures", () => {
  for (const file of readdirSync(FIXTURES).filter((f) => f.endsWith(".json"))) {
    it(`still builds and scores ${file} the same`, () => {
      const b = JSON.parse(readFileSync(join(FIXTURES, file), "utf8"));
      const H = prepare(load(b.site));
      const { E, ctx } = M.prepareBlock(H, b.setup);
      const m = M.REPRESENTATIONS[b.kind as M.RepKind].build(b.massGenome, ctx);
      expect(rle(m.occ)).toEqual(b.occ);
      expect(M.massScores(E, m.occ, ctx.where)).toEqual(b.scores);
    });
  }
});

describe("sun", () => {
  it("stands due south at solar noon in a northern winter, at 90° - latitude - 23.4°", () => {
    const s = M.sunAt(23, M.dayOfYear(12, 21), 12);
    expect((s.altitude * 180) / Math.PI).toBeCloseTo(90 - 23 - 23.4, 0);
    expect((s.azimuth * 180) / Math.PI).toBeCloseTo(180, 6);
  });
  it("mirrors morning and afternoon about noon", () => {
    const am = M.sunAt(19, 105, 9), pm = M.sunAt(19, 105, 15);
    expect(am.altitude).toBeCloseTo(pm.altitude, 12);
    expect(am.dir[0]).toBeCloseTo(-pm.dir[0], 12);
    expect(am.dir[0]).toBeGreaterThan(0);  // east in the morning
  });
});

describe("envelope", () => {
  const E = M.envelope(design, G, big.id);
  it("splits a large block into plots under twice the limit, and names the interior ones", () => {
    expect(big.ha).toBeGreaterThan(M.PLOT_MAX_HA);
    expect(E.plots.length).toBeGreaterThan(1);
    for (const p of E.plots) expect((p.cells.length * G.cellArea) / 1e4).toBeLessThanOrEqual(2 * M.PLOT_MAX_HA);
    expect(E.plots.filter((p) => p.frontage > 0).length).toBeGreaterThan(E.plots.length / 2);
    const inner = E.note.find((n) => n.includes("interior plot"));
    if (E.plots.some((p) => p.frontage === 0)) expect(inner).toBeDefined();
    expect(new Set(E.plots.flatMap((p) => p.cells)).size).toBe(big.cells.length);
  });
  it("keeps buildable columns inside their plot, off the streets, under the rules' cap", () => {
    for (let q = 0; q < E.nx * E.ny; q++) {
      if (E.plotOf[q] < 0) continue;
      expect(E.inPlot[q]).toBe(E.plotOf[q]);
      expect(E.street[q]).toBe(0);
      expect(E.capZ[q]).toBe(Math.floor(G.cap[E.cellOf[q]]));
    }
  });
  it("sets the floor-area target from the urban design", () => {
    const sum = big.cells.reduce((s, i) => s + design.floorArea[i], 0);
    expect(E.target).toBeCloseTo(sum, 6);
  });
  it("keeps more back from the street with a bigger front setback", () => {
    const deep = M.envelope(design, G, big.id, { front: 8, side: 0, rear: 3 });
    expect(deep.plots.reduce((s, p) => s + p.buildable, 0)).toBeLessThan(E.plots.reduce((s, p) => s + p.buildable, 0));
  });
});

describe("repairs", () => {
  const E = M.envelope(design, G, big.id), N = E.nx * E.ny;
  const q = [...Array(N).keys()].find((k) => E.plotOf[k] >= 0 && E.capZ[k] >= 3)!;
  it("drops voxels with nothing under them and says so", () => {
    const occ = new Uint8Array(N * E.nz);
    occ[q] = 1; occ[2 * N + q] = 1;
    const r = repair(E, occ);
    expect(occ[2 * N + q]).toBe(0);
    expect(r).toEqual([{ kind: "ground", plot: E.plotOf[q], count: 1 }]);
  });
  it("clips voxels off the plot and thins a plot to its coverage limit", () => {
    const occ = new Uint8Array(N * E.nz);
    for (let k = 0; k < N; k++) if (E.inPlot[k] >= 0 || E.street[k]) occ[k] = 1;
    const r = repair(E, occ);
    expect(r.some((x) => x.kind === "clip")).toBe(true);
    const fp = M.footprints(E, occ);
    E.plots.forEach((p, k) => expect(fp[k]).toBeLessThanOrEqual(p.maxCover * p.area + 1e-9));
    expect(M.describeRepairs(r, E.plots.length)).toMatch(/^repaired: clipped to the envelope/);
  });
});

describe("representations", () => {
  const { E, ctx } = M.prepareBlock(G, { genome: design.genome, locks: null, ranges: DEFAULT_RANGES, block: big.id });
  for (const kind of ["typology", "field", "cppn"] as const) {
    it(`${kind}: random massings stand inside their envelopes`, () => {
      const rep = M.REPRESENTATIONS[kind], rng = makeRng(3), N = E.nx * E.ny;
      for (let k = 0; k < 6; k++) {
        const m = rep.build(rep.random(rng, ctx), ctx);
        for (let z = 0; z < E.nz; z++) for (let q = 0; q < N; q++) {
          if (!m.occ[z * N + q]) continue;
          expect(E.plotOf[q]).toBeGreaterThanOrEqual(0);
          expect(z).toBeLessThan(E.capZ[q]);
          if (z) expect(m.occ[(z - 1) * N + q]).toBe(1);
        }
      }
    });
    it(`${kind}: one seed gives one run`, () => {
      const a = M.evolveMassing(ctx, { kind, population: 8, generations: 2, seed: 9 });
      const b = M.evolveMassing({ ...ctx, innov: { conns: new Map(), nodes: new Map(), nextConn: 0, nextNode: 0 } },
        { kind, population: 8, generations: 2, seed: 9 });
      expect(b.pop.map((p) => p.scores)).toEqual(a.pop.map((p) => p.scores));
    });
  }
  it("typology: each type gives its own number of wings", () => {
    const wings = TYPES.map((_, t) => shapes([(t + 0.5) / TYPES.length, 0, 0.5, 1, 1, 0.5, 0.5, 1, 0.5, 0.5], 30, 25, 8, false).length);
    expect(wings).toEqual([4, 2, 3, 1, 1, 2]);
  });
  it("typology: Wings of Light keeps wings at 12 m or less", () => {
    for (const r of shapes([0, 0, 1, 1, 1, 0.5, 0.5, 1, 1, 0.5], 30, 25, 8, true)) {
      expect(Math.min(r[2] - r[0], r[3] - r[1])).toBeLessThanOrEqual(12 + 1e-9);
    }
  });
});

describe("CPPN", () => {
  const { ctx } = M.prepareBlock(G, { genome: design.genome, locks: null, ranges: DEFAULT_RANGES, block: big.id });
  it("grows without loops and keeps innovation numbers for the run", () => {
    const rng = makeRng(11);
    let c: Cppn = cppn.random(rng, ctx);
    for (let k = 0; k < 200; k++) c = cppn.mutate(c, rng, ctx);
    expect(c.nodes.length).toBeGreaterThan(1);
    expect(() => compile(c)([0, 0, 0, 0, 0, 0, 1])).not.toThrow();
    const out = compile(c)([0.3, -0.2, 0.5, 0.1, 0.8, 0.6, 1]);
    expect(Math.abs(out)).toBeLessThanOrEqual(1);
    // The same link always has the same innovation number.
    const seen = new Map<string, number>();
    for (const l of c.links) {
      const key = `${l.from}>${l.to}`;
      if (seen.has(key)) expect(seen.get(key)).toBe(l.innov);
      seen.set(key, l.innov);
      expect(l.to === OUTPUT || c.nodes.some((n) => n.id === l.to)).toBe(true);
    }
  });
  it("crossover keeps the better parent's genes and lines up the rest by history", () => {
    const rng = makeRng(12);
    let a = cppn.random(rng, ctx), b = cppn.random(rng, ctx);
    for (let k = 0; k < 30; k++) { a = cppn.mutate(a, rng, ctx); b = cppn.mutate(b, rng, ctx); }
    const kid = cppn.cross(a, b, rng, ctx);
    expect(kid.links.map((l) => l.innov)).toEqual(a.links.map((l) => l.innov));
    expect(cppn.distance(a, a)).toBe(0);
    expect(cppn.distance(a, b)).toBeGreaterThan(0);
  });
});

describe("meshes and readouts", () => {
  const { E, ctx } = M.prepareBlock(G, { genome: design.genome, locks: null, ranges: DEFAULT_RANGES, block: big.id });
  const edgesNotTwice = (mesh: M.Mesh) => {
    const count = new Map<string, number>(), I = mesh.indices;
    for (let k = 0; k < I.length; k += 3) for (let e = 0; e < 3; e++) {
      const a = I[k + e], b = I[k + ((e + 1) % 3)], key = a < b ? `${a}|${b}` : `${b}|${a}`;
      count.set(key, (count.get(key) ?? 0) + 1);
    }
    return [...count.values()].filter((v) => v !== 2).length;
  };
  it("skins a field into a closed surface on the ground and under the cap", () => {
    const m = M.REPRESENTATIONS.field.build(M.REPRESENTATIONS.field.random(makeRng(4), ctx), ctx);
    const mesh = M.skinMesh(E, m);
    expect(mesh.indices.length).toBeGreaterThan(0);
    expect(edgesNotTwice(mesh)).toBeLessThan(mesh.indices.length / 3 / 100);  // ambiguous corners only
    for (let v = 2; v < mesh.positions.length; v += 3) {
      expect(mesh.positions[v]).toBeGreaterThanOrEqual(0);
      expect(mesh.positions[v]).toBeLessThanOrEqual(E.nz * STOREY_M + 1e-4);
    }
  });
  it("reads out daylight, echoes, symmetry and scale between 0 and 1", () => {
    const m = M.REPRESENTATIONS.typology.build(M.REPRESENTATIONS.typology.random(makeRng(5), ctx), ctx);
    const r = M.readouts(E, m, M.massingMesh(E, m));
    for (const k of ["daylit", "echoes", "symmetry", "scale", "cover"] as const) {
      expect(r[k]).toBeGreaterThanOrEqual(0);
      expect(r[k]).toBeLessThanOrEqual(1);
    }
    // Boxes laid on plot axes: wall directions repeat.
    expect(r.echoes).toBeGreaterThan(0.3);
    expect(r.far).toBeCloseTo(M.floorArea(E, m.occ) / E.plots.reduce((s, p) => s + p.area, 0), 9);
  });
});

describe("time and neighbours", () => {
  it("turns local clock time into solar time (longitude, UTC offset, equation of time)", () => {
    // Early November the sun runs about 16 minutes ahead of the clock's mean sun.
    expect(M.equationOfTime(M.dayOfYear(11, 3)) * 60).toBeCloseTo(16.4, 0);
    // On the zone's own meridian, only the equation of time is left.
    const doy = M.dayOfYear(4, 15);
    expect(M.solarHour(12, 82.5, 5.5, doy) - 12).toBeCloseTo(M.equationOfTime(doy), 12);
    // Bengaluru (77.6° E, UTC+5:30) is about 20 minutes behind IST's meridian.
    expect((M.solarHour(12, 77.6, 5.5, doy) - 12 - M.equationOfTime(doy)) * 60).toBeCloseTo(-19.6, 1);
  });
  it("triangulates a concave footprint without spilling outside it", () => {
    const L: [number, number][] = [[0, 0], [30, 0], [30, 10], [10, 10], [10, 30], [0, 30]];
    const tris = M.triangulate(L);
    const area = (a: [number, number], b: [number, number], c: [number, number]) => ((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2;
    expect(tris.length).toBe(4);
    expect(tris.reduce((s, [i, j, k]) => s + area(L[i], L[j], L[k]), 0)).toBeCloseTo(500, 9);
    for (const [i, j, k] of tris) expect(area(L[i], L[j], L[k])).toBeGreaterThan(0);
  });
  it("puts existing buildings on the raster off the design ground only, and scores sun taken from them", () => {
    const site = load("mumbai-docks"), H = prepare(site);
    const d = grow(randomGenome(makeRng(7)), H, null, DEFAULT_RANGES);
    // The block with the most existing roofs in its frame.
    const best = M.blocksOf(d, H).filter((b) => b.ha >= 0.3).map((b) => {
      const { E, ctx } = M.prepareBlock(H, { genome: d.genome, locks: null, ranges: DEFAULT_RANGES, block: b.id });
      return { E, ctx, roofs: M.probe(E, ctx.where).roofs.length };
    }).sort((a, b) => b.roofs - a.roofs)[0];
    const { E, ctx } = best;
    expect(best.roofs).toBeGreaterThan(0);
    for (let q = 0; q < E.nx * E.ny; q++) if (E.existing[q] > 0) {
      expect(E.cellOf[q]).toBe(-1);
      expect(E.context[q]).toBeGreaterThanOrEqual(E.existing[q]);
    }
    const empty = new Uint8Array(E.nx * E.ny * E.nz);
    expect(M.massScores(E, empty, ctx.where).neighbours).toBe(0);
    // Every buildable voxel built: the most the block could take, never negative.
    const full = new Uint8Array(E.nx * E.ny * E.nz), N = E.nx * E.ny;
    for (let q = 0; q < N; q++) for (let z = 0; z < E.capZ[q]; z++) if (E.plotOf[q] >= 0) full[z * N + q] = 1;
    expect(M.massScores(E, full, ctx.where).neighbours).toBeGreaterThanOrEqual(0);
  });
});
