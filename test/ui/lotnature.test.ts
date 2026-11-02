// Nature on every lot (app/engine/plan/lotnature.ts): the programme's open ground first, ponds
// never on it, usable open ground only in pieces wide enough (blockmass.ts usableOpen), and the
// site's storage and heat scores reading the lots' ponds, trees and planted roofs.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as E from "../../app/engine";
import { evaluate } from "../../app/engine/fitness";
import { type Mass, usableOpen } from "../../app/engine/plan/blockmass";
import { lotNature, OPEN_NEED, WETLAND } from "../../app/engine/plan/lotnature";
import type { Line } from "../../app/engine/plan/geom";
import { makeRng } from "../../app/engine/rng";

const load = (id: string) => E.prepare(JSON.parse(readFileSync(join(__dirname, "..", "..", "app", "public", "sites", `${id}.json`), "utf8")));
const box = (x: number, y: number, w: number, d: number): Line => [[x, y], [x + w, y], [x + w, y + d], [x, y + d]];
const mass = (ring: Line, holes?: Line[]): Mass => ({ ring, ...(holes ? { holes } : {}), z: 0, storeys: 2, block: 0 });
const wet = [{ key: "monsoon" as const, weight: 1, why: "" }], hot = [{ key: "heat" as const, weight: 1, why: "" }];

describe("lot nature", () => {
  it("keeps the programme's open ground before any pond", () => {
    const n = lotNature("homes", 5000, 0.7, 50000, wet);
    expect(n.need).toBeCloseTo(0.2 * 5000);           // DCPR 27(1): 20% from 2,501 m²
    expect(n.got).toBeCloseTo(n.need);
    expect(n.pond).toBeLessThanOrEqual(n.open - n.got + 1e-9);
    expect(n.met).toBe(1);
  });
  it("sizes ponds by the ground draining to the lot, more where rain matters", () => {
    const dry = lotNature("homes", 20000, 0.3, 60000, hot), monsoon = lotNature("homes", 20000, 0.3, 60000, wet);
    expect(dry.pond).toBeCloseTo(WETLAND[0] * 60000);
    expect(monsoon.pond).toBeCloseTo(WETLAND[1] * 60000);
    expect(monsoon.climate).toBeGreaterThan(lotNature("homes", 20000, 0.3, 0, wet).climate);
  });
  it("misses the programme's need when its open ground comes in pieces too small", () => {
    const whole = lotNature("education", 10000, 0.3, 0, hot), cut = lotNature("education", 10000, 0.3, 0, hot, 1000);
    expect(whole.met).toBe(1);
    expect(cut.met).toBeCloseTo(1000 / (OPEN_NEED.education.share(10000) * 10000));
  });
  it("gives a sewage plant's open ground to its wetland", () => {
    const n = lotNature("water", 4000, 0.25, 4000, hot);
    expect(n.pond).toBeCloseTo(3000);
  });
});

describe("usable open ground", () => {
  const land = [box(0, 0, 60, 40)];
  it("counts a yard wide enough, not a strip or a narrow court", () => {
    // a 60 x 40 lot: a building on the left 40 m leaves a 20 x 40 yard
    const yard = usableOpen(land, [mass(box(0, 0, 40, 40))], 7.5, 125);
    expect(yard).toBeGreaterThan(0.85 * 20 * 40);
    expect(yard).toBeLessThanOrEqual(20 * 40 + 1e-9);
    // a building leaving a 4 m strip: none of it counts
    expect(usableOpen(land, [mass(box(0, 0, 56, 40))], 7.5, 125)).toBe(0);
    // a court of 6 x 6 m inside a building that fills the lot: too small
    expect(usableOpen(land, [mass(box(0, 0, 60, 40), [box(27, 17, 6, 6).reverse() as Line])], 7.5, 125)).toBe(0);
    // a court of 20 x 20 m does count
    expect(usableOpen(land, [mass(box(0, 0, 60, 40), [box(20, 10, 20, 20).reverse() as Line])], 7.5, 125)).toBeGreaterThan(300);
  });
  it("asks more of a playfield than of a garden", () => {
    const m = [mass(box(0, 0, 45, 40))];   // a 15 x 40 yard: a garden, not an 18 m playfield
    expect(usableOpen(land, m, 7.5, 125)).toBeGreaterThan(0);
    expect(usableOpen(land, m, 18, 648)).toBe(0);
  });
});

describe("the site's scores read the lots' nature", () => {
  it("holds more rain and runs cooler with it than without", () => {
    const G = load("bengaluru-cascade"), d = E.grow(E.randomGenome(makeRng(3), 3.1), G);
    expect(d.nature).toBeTruthy();
    expect(d.plan!.types!.some((t) => (t.nature?.pond ?? 0) > 0 && (t.nature?.trees ?? 0) > 0)).toBe(true);
    const a = { ...evaluate(d, G) }, keep = d.nature;
    delete d.nature;
    const b = { ...evaluate(d, G) };
    d.nature = keep;
    expect(a.storage).toBeGreaterThan(b.storage);
    expect(a.heat).toBeLessThan(b.heat);
  });
});
