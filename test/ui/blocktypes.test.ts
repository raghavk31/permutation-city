// Building type per block (app/engine/plan/blocktypes.ts): the Spacematrix arithmetic, the
// choice, the tower limit, and version 3.1 growth against version 3.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as E from "../../app/engine";
import { BLOCK_TYPES, courtyardGsi, MAX_TOWERS_SITE, perimeterGsi, rowGsi, typeBlocks } from "../../app/engine/plan/blocktypes";
import type { Line } from "../../app/engine/plan/geom";
import { BENGALURU } from "../../app/engine/regs";

const load = (id: string) => E.prepare(JSON.parse(readFileSync(join(__dirname, "..", "..", "app", "public", "sites", `${id}.json`), "utf8")));
const rect = (x: number, w: number, l: number): Line => [[x, 0], [x + w, 0], [x + w, l], [x, l]];
const T = (key: string) => BLOCK_TYPES.findIndex((t) => t.key === key);

describe("Spacematrix numbers", () => {
  it("gives each type's coverage on a 40 x 60 m block", () => {
    expect(perimeterGsi(40, 60, 10, 12.8)).toBeCloseTo(0.9 * (2400 - 20 * 40) / 2400, 6);
    expect(courtyardGsi(40, 60, 10, 12.8)).toBeCloseTo((32.8 * 60 - 12.8 * 40) / 2400, 6);
    expect(rowGsi(40, 60, 10, 9.6)).toBeCloseTo(0.9 * 2 * 10 / 40, 6);
  });
  it("refuses courts on a block too narrow for one", () => {
    expect(courtyardGsi(25, 80, 10, 9.6)).toBeNull();
    expect(perimeterGsi(25, 80, 10, 9.6)).toBeNull();
    expect(rowGsi(25, 80, 10, 9.6)).not.toBeNull();
  });
  it("widens courts with height", () => {
    // four storeys need a court of 12.8 m: a 32 m block fits one at three storeys only
    expect(perimeterGsi(32, 60, 10, 9.6)).not.toBeNull();
    expect(perimeterGsi(32, 60, 10, 12.8)).toBeNull();
  });
});

describe("choosing types", () => {
  const blk = (x: number, w: number, l: number, fsi: number, road = 18) =>
    ({ ring: rect(x, w, l), land: w * l, floor: fsi * w * l, road, cap: 4, farCap: 2.5 });
  it("prefers courts and perimeter blocks at medium density, rows on narrow blocks", () => {
    const [wide, narrow] = typeBlocks([blk(0, 60, 80, 1.6), blk(100, 24, 80, 1.6)], [0.5, 0.5, 0.5, 0.5], 0.5, [], BENGALURU);
    expect([T("courtyard"), T("perimeter")]).toContain(wide!.type);
    expect(narrow!.type).toBe(T("row"));
    expect(narrow!.feasible).toEqual([T("row")]);
  });
  it("lets the genes choose between feasible types", () => {
    const pick = (prefs: number[]) => typeBlocks([blk(0, 60, 80, 1.2)], prefs, 0.5, [], BENGALURU)[0]!.type;
    expect(pick([1, 0, 0, 0])).toBe(T("courtyard"));
    expect(pick([0, 1, 0, 0])).toBe(T("perimeter"));
  });
  it("builds towers only at a node, where lower types fall short, and at most two on the site", () => {
    const many = Array.from({ length: 6 }, (_, k) => blk(k * 200, 60, 120, 2.5));
    const nodes: [number, number][] = many.map((_, k) => [k * 200 + 30, 60]);
    const typed = typeBlocks(many, [0, 0, 0, 1], 0.5, nodes, BENGALURU);
    const towers = typed.reduce((s, t) => s + (t!.type === T("towers") ? t!.towers : 0), 0);
    expect(towers).toBeGreaterThan(0);
    expect(towers).toBeLessThanOrEqual(MAX_TOWERS_SITE);
    expect(typeBlocks(many, [0, 0, 0, 1], 0.5, [], BENGALURU).some((t) => t!.type === T("towers"))).toBe(false);
    expect(typeBlocks([blk(0, 60, 120, 1.0)], [0, 0, 0, 1], 0.5, [[30, 60]], BENGALURU)[0]!.type).not.toBe(T("towers"));
  });
  it("keeps every type within the block's FAR", () => {
    for (const t of typeBlocks([blk(0, 60, 80, 4)], [0.5, 0.5, 0.5, 0.5], 0.5, [], BENGALURU)) expect(t!.fsi).toBeLessThanOrEqual(2.5 + 1e-9);
  });
});

describe.each(["bengaluru-cascade", "mumbai-docks"])("version 3.1 on %s", (id) => {
  const G = load(id), rng = E.makeRng(7);
  const genomes = Array.from({ length: 4 }, () => E.randomGenome(rng, 3.1));
  it("types the blocks of a 3.1 genome and lays out the same frame as its version 3 part", () => {
    for (const g of genomes) {
      const d = E.grow(g, G), d0 = E.grow(g.slice(0, E.LENGTH_V3_0), G);
      expect(d0.plan!.types).toBeUndefined();
      expect(d.plan!.types!.length).toBeGreaterThan(0);
      expect(d.plan!.plots.length).toBe(d0.plan!.plots.length);
      expect(d.plan!.plots.every((p, k) => p.ring === d0.plan!.plots[k].ring || JSON.stringify(p.ring) === JSON.stringify(d0.plan!.plots[k].ring))).toBe(true);
      expect(JSON.stringify(d.plan!.streets)).toBe(JSON.stringify(d0.plan!.streets));
    }
  });
  it("holds typed blocks to their type's storeys", () => {
    for (const g of genomes) {
      const d = E.grow(g, G), plan = d.plan!;
      const typed = new Map(plan.types!.filter((t) => t.type >= 0).map((t) => [t.block, t]));
      plan.plots.forEach((p) => {
        const t = typed.get(p.block);
        if (!t || p.use !== E.BUILDING || !p.levels) return;
        expect(p.levels).toBeLessThanOrEqual(t.storeys);
      });
    }
  });
});
