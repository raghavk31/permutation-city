// Form metrics (app/engine/metrics): hand-worked cases shared with Python (test/metrics/cases.json),
// what the derived network holds on a real site, and promotion to objectives and traits.
// Parity with Python on real designs is in test/parity.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BUILDING, DESCRIPTORS, LANDSCAPE, measure, METRIC_KEYS, METRICS, evolve, grow, makeRng, mapElites, network,
  OBJECTIVE_KEYS, prepare, randomGenome, WATER, type Design, type Ground, type GridInfo, type MetricKey, type SiteExport,
} from "../../app/engine";
import { hullArea, periodicity } from "../../app/engine/metrics/order";

const CASES = JSON.parse(readFileSync(join(__dirname, "..", "metrics", "cases.json"), "utf8"));

/** A Ground and a Design from rows of characters (cases.json). */
function fromRows(rows: string[], size: number): { G: Ground; d: Design } {
  const h = rows.length, w = rows[0].length, n = w * h;
  const grid: GridInfo = { type: "quad", size, spacing: size, degree: 4, edge: size };
  const x = new Float64Array(n), y = new Float64Array(n), nbr = new Int32Array(n * 4).fill(-1);
  const use = new Int8Array(n), levels = new Int32Array(n), floorArea = new Float64Array(n);
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
    const i = r * w + c, ch = rows[r][c];
    x[i] = c * size; y[i] = r * size;
    [[1, 0], [0, 1], [-1, 0], [0, -1]].forEach(([dc, dr], k) => {
      const cc = c + dc, rr = r + dr;
      if (cc >= 0 && cc < w && rr >= 0 && rr < h) nbr[i * 4 + k] = rr * w + cc;
    });
    if (ch === "L") use[i] = LANDSCAPE;
    else if (ch === "W") use[i] = WATER;
    else { use[i] = BUILDING; levels[i] = +ch; floorArea[i] = size * size * 0.5 * levels[i]; }
  }
  const G = {
    n, x, y, grid, deg: 4, nbr, canBuild: [], canGreen: [], canWater: [], cap: new Float64Array(n).fill(9),
    minPerm: new Float64Array(n), trees: new Float64Array(n), siteWater: new Float64Array(n), cellArea: size * size,
    bounds: [0, 0, (w - 1) * size, (h - 1) * size], meta: {} as Ground["meta"], roads: [],
  } as Ground;
  const d = { genome: [], use, levels, coverage: new Float64Array(n), floorArea, attractors: [], settings: {},
    scores: null } as unknown as Design;
  return { G, d };
}

describe("hand-worked cases (shared with Python)", () => {
  for (const c of CASES.cases) {
    it(c.name, () => {
      const { G, d } = fromRows(c.rows, CASES.grid.size);
      const m = measure(d, G, Object.keys(c.expect) as MetricKey[]);
      for (const [k, v] of Object.entries(c.expect)) expect(m[k as MetricKey], k).toBeCloseTo(v as number, 12);
    });
  }
});

describe("pieces", () => {
  it("finds a steady beat, and none in a constant", () => {
    expect(periodicity([1, 0, 1, 0, 1, 0, 1, 0])).toBeCloseTo(1, 12);
    expect(periodicity([2, 2, 2, 2])).toBe(0);
    expect(periodicity([1, 1, 0, 0, 1, 1, 0, 0])).toBeCloseTo(1, 12);
  });

  it("measures a convex hull", () => {
    expect(hullArea([[0, 0], [2, 0], [2, 2], [0, 2], [1, 1]])).toBe(4);
    expect(hullArea([[0, 0], [1, 1]])).toBe(0);
  });
});

describe("on a real site", () => {
  const site: SiteExport = JSON.parse(readFileSync(join(__dirname, "..", "..", "app", "public", "sites", "mumbai-ewf.json"), "utf8"));
  const G = prepare(site);
  const d = grow(randomGenome(makeRng(5)), G);

  it("cuts blocks where existing roads cross, and covers every building cell once", () => {
    const net = network(d, G);
    const built = [...d.use].filter((u) => u === BUILDING).length;
    expect(net.blocks.reduce((s, b) => s + b.length, 0)).toBe(built);
    expect(net.L.cut.some((c) => c === 1)).toBe(true);
    // A cut link is cut from both sides.
    for (let i = 0; i < G.n; i++) for (let k = 0; k < G.deg; k++) {
      const j = G.nbr[i * G.deg + k];
      if (j < 0) continue;
      const back = [...Array(G.deg).keys()].find((q) => G.nbr[j * G.deg + q] === i)!;
      expect(net.L.cut[j * G.deg + back]).toBe(net.L.cut[i * G.deg + k]);
    }
  });

  it("gives every metric a number, within 0 and 1 where it is a share", () => {
    const m = measure(d, G);
    for (const k of METRIC_KEYS) {
      expect(Number.isFinite(m[k]), k).toBe(true);
      if (!("range" in METRICS[k])) { expect(m[k]!).toBeGreaterThanOrEqual(0); expect(m[k]!).toBeLessThanOrEqual(1); }
    }
  });

  it("promotes metrics to objectives, and refuses ones without a better end", () => {
    const run = evolve(G, { seed: 2, generations: 2, pop: 12, objectives: ["dh_enclosure", "the_void"] });
    for (const i of run.pop) {
      expect(i.design.scores).toHaveProperty("dh_enclosure");
      expect((i.design.scores as unknown as Record<string, number>).the_void).toBeCloseTo(measure(i.design, G, ["the_void"]).the_void!, 6);
    }
    expect(run.history.at(-1)).toHaveProperty("the_void");
    expect(OBJECTIVE_KEYS).not.toContain("roughness");
    expect(() => evolve(G, { generations: 1, pop: 4, objectives: ["roughness"] })).toThrow(/better end/);
    expect(() => evolve(G, { generations: 1, pop: 4, objectives: ["dh_enclosure", "the_void", "contrast"] })).toThrow(/two/);
  });

  it("lets MAP-Elites sort by any metric", () => {
    expect(DESCRIPTORS.positive_space.label).toBe("positive space");
    const run = mapElites(G, { seed: 1, generations: 2, pop: 12, axes: ["positive_space", "green_view"], bins: 4 });
    expect(run.pop.length).toBeGreaterThan(0);
  });
});
