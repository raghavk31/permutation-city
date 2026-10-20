// The search methods (app/engine/niche.ts, elites.ts) and the Explore plots' helpers: what they promise beyond parity with
// Python. Parity (test/parity) checks the two engines agree; this checks they do the job.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  binOf, DESCRIPTORS, divisionsFor, evolve, mapElites, nicheSelect, prepare, quality, referencePoints,
  SCORE_KEYS, type Metrics, type Scores, type SiteExport,
} from "../../app/engine";
import type { Kept } from "../../app/engine/worker";
import * as X from "../../app/ui/explore";

const SITES = join(__dirname, "..", "..", "app", "public", "sites");
const site: SiteExport = JSON.parse(readFileSync(join(SITES, "mumbai-ewf.json"), "utf8"));
const G = prepare(site);
const on = (o: Partial<Scores>): Scores => ({ storage: 1, heat: 1, carbon: 400, daylight: 0.9, human: 0.7, gap: 0, ...o });

describe("NSGA-III", () => {
  it("spreads reference directions evenly over the objectives", () => {
    const r = referencePoints(5, 4);
    expect(r).toHaveLength(70);
    for (const w of r) expect(w.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
    expect(r[0]).toEqual([0, 0, 0, 0, 1]);
    expect(referencePoints(3, 2)).toHaveLength(6);
  });

  it("uses at least one direction per design", () => {
    expect([30, 60, 90].map((p) => divisionsFor(5, p))).toEqual([3, 4, 5]);
  });

  it("fills empty niches first", () => {
    // Two designs already in, both best on storage; of the rest, the one best on daylight
    // sits in an empty niche and goes before a third storage specialist.
    const chosen = [on({ storage: 1.8, daylight: 0.3 }), on({ storage: 1.79, daylight: 0.31 })];
    const last = [on({ storage: 1.78, daylight: 0.32 }), on({ storage: 0.4, daylight: 1.0 })];
    expect(nicheSelect(chosen, last, 1, referencePoints(5, 3))).toEqual([1]);
  });

  it("keeps a different population from NSGA-II with the same seed", () => {
    const a = evolve(G, { seed: 5, generations: 8, pop: 30 });
    const b = evolve(G, { seed: 5, generations: 8, pop: 30, search: "nsga3" });
    expect(b.pop.map((i) => i.name)).not.toEqual(a.pop.map((i) => i.name));
    expect(b.history[0]).toEqual(a.history[0]); // same Generation 0
  });
});

describe("MAP-Elites", () => {
  it("puts values in bins, the ends catching what is outside the range", () => {
    expect(binOf(1, [1, 10], 10)).toBe(0);
    expect(binOf(9.99, [1, 10], 10)).toBe(9);
    expect(binOf(10, [1, 10], 10)).toBe(9);
    expect(binOf(-3, [1, 10], 10)).toBe(0);
    expect(binOf(5.5, [1, 10], 10)).toBe(5);
  });

  it("ranks any design on the brief above every design off it", () => {
    const worst = on({ storage: 0, heat: 9, carbon: 999, daylight: 0, human: 0 });
    expect(quality(worst)).toBe(0);
    expect(quality(on({ gap: 0.11 }))).toBeLessThan(0);
    expect(quality(on({ gap: 0.2 }))).toBeLessThan(quality(on({ gap: 0.11 })));
    expect(quality(on({ storage: 1.8, heat: 0.4, carbon: 400, daylight: 1, human: 0.9 }))).toBe(1);
  });

  it("weighs scores by a brief's weights", () => {
    const s = on({ storage: 1.8, daylight: 0.3 });
    expect(quality(s, { storage: 1 })).toBe(1);
    expect(quality(s, { daylight: 1 })).toBe(0);
    expect(quality(s, { storage: 0 })).toBe(quality(s)); // all zero: equal weights
  });

  it("keeps each elite in the cell its traits put it in, and only improves a cell", () => {
    const best = new Map<number, number>();
    const run = mapElites(G, {
      seed: 3, generations: 10, pop: 30, axes: ["height_variety", "water_share"], bins: 8,
      progress: (_, r) => {
        for (const i of r.pop) {
          expect(i.quality!).toBeGreaterThanOrEqual(best.get(i.cell!) ?? -Infinity);
          best.set(i.cell!, i.quality!);
        }
      },
    });
    const [ax, ay] = [DESCRIPTORS.height_variety, DESCRIPTORS.water_share];
    const cells = run.pop.map((i) => i.cell!);
    expect(new Set(cells).size).toBe(cells.length);
    expect(cells).toEqual([...cells].sort((a, b) => a - b));
    for (const i of run.pop) {
      expect(i.cell).toBe(binOf(ay.value(i.design, G), ay.range, 8) * 8 + binOf(ax.value(i.design, G), ax.range, 8));
    }
    expect(run.history.at(-1)!.filled).toBe(run.pop.length);
    expect(run.everyone).toBe(30 * 11);
  });

  it("refuses a trait it doesn't know", () => {
    expect(() => mapElites(G, { generations: 1, pop: 4, axes: ["elegance", "open_share"] })).toThrow(/elegance/);
  });
});

describe("Explore (app/ui/explore.ts)", () => {
  const kept = (scores: Partial<Scores>, rank = 1, extra: Partial<Kept> = {}): Kept => ({
    name: "x", genome: [], parents: [], rank, scores: on(scores), floorArea: 100, levels: 4, metrics: {} as Metrics, ...extra,
  });

  it("finds the ends of every measure among the designs on the brief", () => {
    const ks = [kept({ storage: 1.2, heat: 1.5 }), kept({ storage: 0.6, heat: 0.9 }, 2),
      kept({ storage: 2.5, heat: 0.2, gap: 0.3 })]; // off the brief: ignored
    const ex = X.extremes(ks);
    const storage = ex.find((e) => e.axis.key === "storage")!, heat = ex.find((e) => e.axis.key === "heat")!;
    expect([storage.lo, storage.hi]).toEqual([1, 0]);
    expect([heat.lo, heat.hi]).toEqual([1, 0]);
    expect(ex.map((e) => e.axis.key)).toEqual([...SCORE_KEYS, "floorArea", "levels"]);
    // None on the brief: all of them count.
    expect(X.extremes([kept({ gap: 0.3 }), kept({ gap: 0.2, storage: 3 })])[0].hi).toBe(1);
  });

  it("knows which end is better", () => {
    expect(X.AXES.find((a) => a.key === "heat")!.up).toBe(false);
    expect(X.AXES.find((a) => a.key === "storage")!.up).toBe(true);
    expect(X.AXES.find((a) => a.key === "floorArea")!.up).toBeNull();
  });

  it("lays the archive out with the high end of the second trait on top", () => {
    const ks = [kept({}, 1, { cell: 0 }), kept({}, 1, { cell: 5 }), kept({}, 1, { cell: 8 })];
    expect(X.archiveRows(ks, 3)).toEqual([[-1, -1, 2], [-1, -1, 1], [0, -1, -1]]);
  });

  it("puts only designs on the brief and unbeaten on the front", () => {
    expect(X.onFront(kept({}))).toBe(true);
    expect(X.onFront(kept({}, 2))).toBe(false);
    expect(X.onFront(kept({ gap: 0.2 }))).toBe(false);
  });
});
