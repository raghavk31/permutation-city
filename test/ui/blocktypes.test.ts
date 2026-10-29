// Building type per lot (app/engine/plan/blocktypes.ts, precedents.ts): candidates by programme
// and climate, a precedent's drift, the choice, the tower limit, and version 3.1 growth against
// version 3.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as E from "../../app/engine";
import { MAX_TOWERS_SITE, typeBlocks, type LotIn } from "../../app/engine/plan/blocktypes";
import { candidatesFor, FAMILIES, PRECEDENT, storeysOf, variant } from "../../app/engine/plan/precedents";
import { PROGRAMMES } from "../../app/engine/plan/programme";
import type { Line } from "../../app/engine/plan/geom";
import { BENGALURU } from "../../app/engine/regs";

const load = (id: string) => E.prepare(JSON.parse(readFileSync(join(__dirname, "..", "..", "app", "public", "sites", `${id}.json`), "utf8")));
const rect = (x: number, w: number, l: number): Line => [[x, 0], [x + w, 0], [x + w, l], [x, l]];
const F = (key: string) => FAMILIES.findIndex((f) => f.key === key);

describe("candidates", () => {
  it("lists a programme's building precedents, nearest the site's climate first", () => {
    const c = candidatesFor("homes", "bengaluru-cascade");
    expect(c.length).toBeGreaterThan(20);
    expect(c.every((x) => x.p.programmes.includes("housing") && x.family >= 0)).toBe(true);
    for (let k = 1; k < c.length; k++) expect(c[k].climate).toBeGreaterThanOrEqual(c[k - 1].climate);
    // Bengaluru's own types come first: the vatara and Malleswaram's rows are in its climate
    expect(c.slice(0, 4).map((x) => x.p.id)).toEqual(expect.arrayContaining(["vatara", "malleswaram"]));
  });
  it("leaves out what holds no floor: ponds, terraces, pits, canopies, houses on water", () => {
    for (const prog of PROGRAMMES) for (const x of candidatesFor(prog, "bengaluru-cascade")) {
      expect(["sunken", "terraces", "ponds", "canopy"]).not.toContain(x.p.seed.arrangement);
      expect(x.p.seed.ground).not.toBe("water");
    }
  });
});

describe("drift", () => {
  it("keeps a precedent at its own height as it is", () => {
    const p = PRECEDENT.get("vatara")!;
    expect(variant(p.seed, storeysOf(p.seed))).toEqual({ params: p.seed, drift: [] });
  });
  it("widens a court to the height it is raised to, and a row's street", () => {
    const court = PRECEDENT.get("vatara")!, v = variant(court.seed, 4);
    expect(v.params.court).toBeCloseTo(4 * court.seed.floorH!, 6);
    expect(v.drift.map((d) => d.what)).toEqual(["storeys", "court"]);
    const row = PRECEDENT.get("malleswaram")!, r = variant(row.seed, 5);
    expect(r.params.street).toBeCloseTo(5 * row.seed.floorH!, 6);
    // lowered, nothing widens
    expect(variant(PRECEDENT.get("chettinad")!.seed, 1).drift.map((d) => d.what)).toEqual(["storeys"]);
  });
});

describe("choosing precedents", () => {
  const lot = (x: number, w: number, l: number, fsi: number, programme = 0, block = 0): LotIn =>
    ({ block, plots: [block], rings: [rect(x, w, l)], programme, land: w * l, floor: fsi * w * l, road: 18, cap: 6, farCap: 2.5 });
  const site = "bengaluru-cascade";
  it("builds homes from housing precedents and a school from education's, near the density asked", () => {
    const [homes, school] = typeBlocks([lot(0, 60, 80, 1.2), lot(100, 60, 80, 1.0, PROGRAMMES.indexOf("education"), 1)], [0.5, 0.5, 0.5, 0.5], [], BENGALURU, site);
    expect(PRECEDENT.get(homes!.precedent)!.programmes).toContain("housing");
    expect(PRECEDENT.get(school!.precedent)!.programmes).toContain("education");
    expect(Math.abs(homes!.fsi - 1.2) / 1.2).toBeLessThan(0.25);
  });
  it("lets the genes choose between families", () => {
    const pick = (prefs: number[]) => typeBlocks([lot(0, 60, 80, 0.8)], prefs, [], BENGALURU, site)[0]!.type;
    expect(pick([3, 0, 0, 0])).toBe(F("court"));
    expect(pick([0, 0, 3, 0])).toBe(F("row"));
  });
  it("keeps every lot within its FAR and its storey cap", () => {
    for (const t of typeBlocks([lot(0, 60, 80, 4), lot(100, 40, 120, 3, 0, 1)], [0.5, 0.5, 0.5, 0.5], [], BENGALURU, site)) {
      expect(t!.fsi).toBeLessThanOrEqual(2.5 * 1.1);
      expect(t!.storeys).toBeLessThanOrEqual(6);
    }
  });
  it("builds towers only at a node, where lower types fall short, and at most two on the site", () => {
    const many = Array.from({ length: 6 }, (_, k) => ({ ...lot(k * 300, 120, 160, 4, 0, k), cap: 15, farCap: 4 }));
    const nodes: [number, number][] = many.map((_, k) => [k * 300 + 60, 80]);
    const towers = (ls: LotIn[], ns: [number, number][]) => typeBlocks(ls, [0, 0, 0, 1], ns, BENGALURU, site).reduce((s, t) => s + t!.towers, 0);
    expect(towers(many, nodes)).toBeLessThanOrEqual(MAX_TOWERS_SITE);
    expect(towers(many, [])).toBe(0);
  });
  it("types no lot it cannot fit", () => {
    expect(typeBlocks([lot(0, 3, 3, 1)], [0.5, 0.5, 0.5, 0.5], [], BENGALURU, site)[0]!.type).toBe(-1);
  });
});

describe.each(["bengaluru-cascade", "mumbai-docks"])("version 3.1 on %s", (id) => {
  const G = load(id), rng = E.makeRng(7);
  const genomes = Array.from({ length: 4 }, () => E.randomGenome(rng, 3.1));
  it("types the lots of a 3.1 genome and lays out the same frame as its version 3 part", () => {
    for (const g of genomes) {
      const d = E.grow(g, G), d0 = E.grow(g.slice(0, E.LENGTH_V3_0), G);
      expect(d0.plan!.types).toBeUndefined();
      expect(d.plan!.types!.length).toBeGreaterThan(0);
      expect(d.plan!.plots.length).toBe(d0.plan!.plots.length);
      expect(d.plan!.plots.every((p, k) => p.ring === d0.plan!.plots[k].ring || JSON.stringify(p.ring) === JSON.stringify(d0.plan!.plots[k].ring))).toBe(true);
      expect(JSON.stringify(d.plan!.streets)).toBe(JSON.stringify(d0.plan!.streets));
    }
  });
  it("gives every building plot to one lot of its block and programme, and holds it to the lot's storeys", () => {
    for (const g of genomes) {
      const plan = E.grow(g, G).plan!, seen = new Set<number>();
      for (const t of plan.types!) for (const k of t.plots) {
        expect(seen.has(k)).toBe(false);
        seen.add(k);
        expect(plan.plots[k].block).toBe(t.block);
        expect(Math.max(plan.programme!.plot[k], 0)).toBe(t.programme);
        if (t.type >= 0 && plan.plots[k].levels) expect(plan.plots[k].levels).toBeLessThanOrEqual(t.storeys);
      }
      // every building plot that holds a building is in a lot
      plan.plots.forEach((p, k) => { if (p.use === E.BUILDING && p.levels > 0) expect(seen.has(k)).toBe(true); });
    }
  });
});
