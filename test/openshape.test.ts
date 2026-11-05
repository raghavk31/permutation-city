// Open ground's grammar (architecture-v3 section 14, step P2): every family builds at the ends
// of its genes' limits, and each gene moves its measure the way its card says.
import { describe, expect, test } from "vitest";
import { build } from "../app/engine/typology/grammar.js";
import { LIBRARY } from "../app/engine/typology/library.js";
import { EDGE_SECTIONS, REJECTED_EDGES } from "../app/engine/typology/library/edgesections.js";
import { clampShape, edgeSection, edgeShapeOf, OPEN_AREA, OPEN_GENES, familySpread, measureShape, middleShape, shapeOf, shapeParams, type ShapedFamily } from "../app/engine/typology/openshape.js";
import { familyOf } from "../app/engine/plan/precedents.js";

const FAMILIES = Object.keys(OPEN_GENES) as ShapedFamily[];
const spread = familySpread(LIBRARY);
const mid = (f: ShapedFamily) => middleShape(f, spread[f]);
const m = (f: ShapedFamily, change: Record<string, number>) => measureShape(f, { ...mid(f), ...change }, OPEN_AREA[f]);

describe("open ground's grammar", () => {
  test.each(FAMILIES.flatMap((f) => OPEN_GENES[f].flatMap((g) => [[f, g.key, g.lo], [f, g.key, g.hi]] as const)))("%s builds with %s at %s", (f, key, v) => {
    for (const wet of [false, true]) {
      const b = build(shapeParams(f, { ...mid(f), [key]: v }, OPEN_AREA[f], wet));
      expect(b.solids.length).toBeGreaterThan(0);
      for (const s of b.solids) for (const [x, y] of s.ring) expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
    }
    const r = measureShape(f, { ...mid(f), [key]: v }, OPEN_AREA[f]);
    for (const x of Object.values(r)) expect(Number.isFinite(x)).toBe(true);
    expect(r.wetUse).toBeGreaterThanOrEqual(0); expect(r.wetUse).toBeLessThanOrEqual(1.0001);
    expect(r.shade).toBeGreaterThanOrEqual(0); expect(r.shade).toBeLessThanOrEqual(1);
  });

  test("a deeper, wetter pit stores more and leaves less to use", () => {
    expect(m("stepped", { depth: 0.8, wet: 0.5 }).storage).toBeGreaterThan(m("stepped", { depth: 0.2, wet: 0.5 }).storage);
    expect(m("stepped", { wet: 0.9 }).storage).toBeGreaterThan(m("stepped", { wet: 0.2 }).storage);
    expect(m("stepped", { wet: 0.9 }).wetUse).toBeLessThan(m("stepped", { wet: 0.2 }).wetUse);
  });

  test("low steps are seats; tall terraces are not", () => {
    expect(m("stepped", { depth: 0.05, levels: 4 }).seats).toBeGreaterThan(0);
    expect(m("stepped", { depth: 1.2, levels: 3 }).seats).toBe(0);
  });

  test("a basin stores more with more water and leaves less dry ground", () => {
    expect(m("basin", { water: 0.8 }).storage).toBeGreaterThan(m("basin", { water: 0.3 }).storage);
    expect(m("basin", { water: 0.8 }).wetUse).toBeLessThan(m("basin", { water: 0.3 }).wetUse);
    expect(m("basin", { trees: 0.5 }).shade).toBeGreaterThan(m("basin", { trees: 0 }).shade);
  });

  test("a stream park floods more of its banks as the flood rises", () => {
    expect(m("linear", { wet: 0.9 }).storage).toBeGreaterThan(m("linear", { wet: 0.3 }).storage);
    expect(m("linear", { wet: 0.9 }).wetUse).toBeLessThanOrEqual(m("linear", { wet: 0.3 }).wetUse);
  });

  test("more cover is more shade; a lowered field holds rain and is out of use when full", () => {
    expect(m("canopy", { cover: 0.9 }).shade).toBeGreaterThan(m("canopy", { cover: 0.2 }).shade);
    expect(m("field", { sunk: 0.3 }).storage).toBeGreaterThan(0);
    expect(m("field", { sunk: 0 }).storage).toBe(0);
    expect(m("field", { sunk: 0.3 }).wetUse).toBeLessThan(m("field", { sunk: 0 }).wetUse);
    expect(m("field", { edge: 1 }).shade).toBeGreaterThan(m("field", { edge: 0 }).shade);
  });

  describe("a river's edge", () => {
    const at = (c: Record<string, number>) => edgeSection({ ...mid("edge"), ...c });
    const width = (t: ReturnType<typeof edgeSection>) => t.reduce((a, x) => a + x.tread + x.bank, 0);
    test("its section steps from the street to its lowest level, and fills its reach", () => {
      for (const reach of [5, 40, 350]) for (const tiers of [1, 3, 8]) {
        const t = at({ reach, tiers, drop: 10, low: 0.2 });
        expect(t.length).toBe(tiers);
        expect(t[0].z).toBe(10);
        if (tiers > 1) expect(t[tiers - 1].z).toBeCloseTo(2, 5);
        expect(width(t)).toBeCloseTo(reach, 5);
        for (let k = 1; k < tiers; k++) expect(t[k].z).toBeLessThan(t[k - 1].z);
        for (const x of t) { expect(x.tread).toBeGreaterThan(0); expect(x.bank).toBeGreaterThanOrEqual(0); }
      }
    });
    test("the lowest level takes its share", () => {
      const t = at({ reach: 100, tiers: 3, wall: 1, lowWide: 0.1 });
      expect(t[2].tread).toBeCloseTo(10, 5);
      expect(t[0].tread).toBeCloseTo(45, 5);
    });
    test("what was rejected as a case study stays out", () => {
      for (const id of REJECTED_EDGES) { expect(LIBRARY.some((p) => p.id === id), id).toBe(false); expect(EDGE_SECTIONS[id], id).toBeUndefined(); }
    });
    test("what's planted is drawn green, and stone isn't", () => {
      const use = (id: string) => new Set(build(shapeParams("edge", edgeShapeOf(id)!, OPEN_AREA.edge)).solids.map((x) => x.use));
      expect(use("buffalo-bayou").has("green")).toBe(true);
      expect(use("maheshwar-ghat").has("green")).toBe(false);
      expect(build(shapeParams("edge", edgeShapeOf("maheshwar-ghat")!, OPEN_AREA.edge)).solids.some((x) => x.use === "tree")).toBe(false);
    });
    test("a square garden isn't drawn as a strip", () => {
      const q = shapeParams("edge", edgeShapeOf("mehtab-bagh")!, OPEN_AREA.edge);
      expect(q.width / q.depth).toBeGreaterThan(0.8);
    });
    test("a wall takes no run; a bank does, and a gentler one takes more", () => {
      expect(at({ wall: 1 }).every((t) => t.bank === 0)).toBe(true);
      const bank = (b: number) => at({ reach: 350, drop: 5, wall: 0, bank: b }).reduce((a, t) => a + t.bank, 0);
      expect(bank(0.1)).toBeGreaterThan(bank(0.5));
    });
    test("a higher flood takes more of it and makes more room", () => {
      expect(m("edge", { wet: 0.9, low: 0.1, tiers: 4 }).wetUse).toBeLessThan(m("edge", { wet: 0.2, low: 0.1, tiers: 4 }).wetUse);
      expect(m("edge", { wet: 0.9, low: 0.1, tiers: 4 }).storage).toBeGreaterThan(m("edge", { wet: 0.2, low: 0.1, tiers: 4 }).storage);
    });
    test("low steps are seats; a wall's drop isn't", () => {
      expect(m("edge", { drop: 3, tiers: 6, low: 0 }).seats).toBeGreaterThan(0);
      expect(m("edge", { drop: 12, tiers: 2, low: 0 }).seats).toBe(0);
    });
    test("it's drawn with the river in front, and water rises over its levels on a wet day", () => {
      const s = { ...mid("edge"), tiers: 4, low: 0.1, wet: 0.8 };
      const water = (wet: boolean) => build(shapeParams("edge", s, OPEN_AREA.edge, wet)).solids.filter((x) => x.use === "water");
      expect(water(false).length).toBe(1);
      expect(water(true).length).toBeGreaterThan(1);
    });
    test("every section is in the family's limits, says what's sure, and belongs to a real precedent", () => {
      const ids = new Set(LIBRARY.map((p) => p.id));
      for (const [id, t] of Object.entries(EDGE_SECTIONS)) {
        expect(ids.has(id), id).toBe(true);
        expect(t.sure.length, id).toBeGreaterThan(3);
        const { sure: _s, ...shape } = t;
        expect(clampShape("edge", shape), id).toEqual(shape);
      }
    });
    test("the family reads all its members, so a search starts across the range", () => {
      expect(spread.edge.members.length).toBe(Object.keys(EDGE_SECTIONS).length);
      expect(spread.edge.lo.wall).toBe(0);
      expect(spread.edge.hi.wall).toBe(1);
      expect(spread.edge.hi.tiers).toBeGreaterThan(spread.edge.lo.tiers);
    });
    test("every member of the family has a section and its own day and night", () => {
      for (const p of LIBRARY.filter((x) => x.open?.family === "edge")) { expect(EDGE_SECTIONS[p.id], p.id).toBeDefined(); expect(shapeOf(p), p.id).toBeDefined(); }
    });
    test("the place's own precedents are in it", () => {
      for (const id of ["mehtab-bagh", "riverfront-terrace", "asita-east"]) expect(spread.edge.members).toContain(id);
    });
    test("adding this family gives the city exercise no new buildings", () => {
      for (const p of LIBRARY.filter((x) => x.open?.family === "edge")) expect(p.seed.arrangement, p.id).toBe("edge");
      expect(familyOf("edge")).toBeLessThan(0);
    });
  });

  test("a schoolyard 30 cm down on 4,800 m² holds about 1,400 m³", () => {
    const s = shapeOf(LIBRARY.find((p) => p.id === "schoolyard-storage")!)!;
    const r = measureShape("field", s, 80 * 60);
    expect(r.storage).toBeGreaterThan(1200); expect(r.storage).toBeLessThan(1500);
  });

  test("the library's members are read into their family's genes, inside the limits", () => {
    for (const f of FAMILIES) {
      expect(spread[f].members.length, f).toBeGreaterThan(0);
      for (const g of OPEN_GENES[f]) {
        expect(spread[f].lo[g.key]).toBeGreaterThanOrEqual(g.lo);
        expect(spread[f].hi[g.key]).toBeLessThanOrEqual(g.hi);
      }
    }
    const sw = shapeOf(LIBRARY.find((p) => p.id === "stepwell")!)!;
    expect(sw.around).toBe(0); expect(sw.depth).toBeCloseTo(1.35, 1);
  });
});
