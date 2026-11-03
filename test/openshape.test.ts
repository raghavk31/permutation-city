// Open ground's grammar (architecture-v3 section 14, step P2): every family builds at the ends
// of its genes' limits, and each gene moves its measure the way its card says.
import { describe, expect, test } from "vitest";
import { build } from "../app/engine/typology/grammar.js";
import { LIBRARY } from "../app/engine/typology/library.js";
import { OPEN_AREA, OPEN_GENES, familySpread, measureShape, middleShape, shapeOf, shapeParams, type ShapedFamily } from "../app/engine/typology/openshape.js";

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
