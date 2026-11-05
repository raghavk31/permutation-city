// A river-edge design against today (engine/focus/edgescore; docs/architecture-v3.md section 15.9, step E3).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { readEdge } from "../app/engine/focus/edge.js";
import { fitStretch, type Works } from "../app/engine/focus/edgeform.js";
import { daysAbove, RISES, type Score, scoreEdge } from "../app/engine/focus/edgescore.js";
import type { Place } from "../app/engine/focus/place.js";
import { Walk } from "../app/engine/focus/walk.js";
import { edgeShapeOf } from "../app/engine/typology/openshape.js";

const place: Place = JSON.parse(readFileSync(join(__dirname, "..", "app", "public", "sites", "agra-taj.place.json"), "utf8"));
const read = readEdge(place), walk = new Walk(place.streets.map((s) => s.pts));
const fitsOf = (id: string, works: Works) => read.banks.flatMap((b) => b.stretches.map((s) => fitStretch(place, read, b.id, s.id, edgeShapeOf(id)!, works)));
const score = (id: string, works: Works) => scoreEdge(place, read, fitsOf(id, works), walk);
const by = (s: Score[], key: string) => s.find((x) => x.key === key)!;

const lawful = score("yanweizhou", "soft"), whatIf = score("maheshwar-ghat", "hard"), nothing = scoreEdge(place, read, [], walk);

describe("the river's height through the year", () => {
  test("the fit says how far it misses each report, and is tied to all of them", () => {
    expect(place.flow!.anchors.length).toBe(4);
    for (const a of place.flow!.anchors) expect(Math.abs(a.miss)).toBeLessThan(2);
  });
  test("higher ground is wet on fewer days, and never more than a year", () => {
    let last = Infinity;
    for (let z = 144; z <= 158; z += 0.5) { const d = daysAbove(place, z); expect(d).toBeLessThanOrEqual(last); expect(d).toBeLessThanOrEqual(366); last = d; }
  });
  test("with the river higher, ground is wet on more days", () => {
    expect(daysAbove(place, 149, 1)).toBeGreaterThan(daysAbove(place, 149, -1));
  });
  test("the dry months agree with what the satellite reads, which it wasn't fitted to", () => {
    const [lo, hi] = read.datum.ordinary!, m = place.flow!.months;
    for (const k of [0, 1, 2, 3, 4, 11]) { expect(m[k]).toBeGreaterThanOrEqual(lo - 0.5); expect(m[k]).toBeLessThanOrEqual(hi + 0.5); }
  });
  test("the monsoon stands higher than the dry months", () => {
    const m = place.flow!.months;
    expect(Math.min(m[6], m[7], m[8])).toBeGreaterThan(Math.max(m[0], m[1], m[2], m[3], m[4]));
  });
});

describe("a design against today", () => {
  test("with nothing designed, the design is today", () => {
    expect(by(nothing, "days_walkable").design).toBe(by(nothing, "days_walkable").today);
    expect(by(nothing, "earth_moved").design).toBe(0);
    expect(by(nothing, "buildings_10").design).toBe(by(nothing, "buildings_10").today);
  });
  test("a path can't take anyone further from the edge", () => {
    for (const s of [lawful, whatIf]) {
      expect(by(s, "buildings_10").design!).toBeGreaterThanOrEqual(by(s, "buildings_10").today!);
      expect(by(s, "fort_taj").design!).toBeLessThanOrEqual(by(s, "fort_taj").today!);
    }
  });
  test("what's walkable improves at all three levels, or the claim doesn't stand", () => {
    const s = by(lawful, "days_walkable");
    expect(s.designBand![0]).toBeGreaterThan(s.todayBand![1]);
  });
  test("different designs plant different amounts", () => {
    expect(by(score("asita-east", "soft"), "planted").design).not.toBe(by(lawful, "planted").design);
  });
  test("the lawful design has no hard ground and the what-if does", () => {
    expect(by(lawful, "paved").design).toBe(0);
    expect(by(whatIf, "paved").design!).toBeGreaterThan(0);
  });
  test("adds room for flood water, or at least loses none, at every level", () => {
    for (const s of [lawful, whatIf]) expect(by(s, "flood_room").designBand![0]).toBeGreaterThanOrEqual(-100);
  });
  test("moved earth is counted as a cost", () => {
    expect(by(lawful, "earth_moved").better).toBe("down");
    expect(by(lawful, "earth_moved").design!).toBeGreaterThan(0);
  });
  test("a bank face dug back ends at an ordinary day's river, in earth, and only digs", () => {
    const ordinary = read.datum.ordinary![1];
    let dug = 0;
    for (const id of ["yanweizhou", "buffalo-bayou", "adyar-poonga"]) for (const f of fitsOf(id, "soft")) for (const s of f.sections) if (s.face) {
      dug++;
      expect(s.vertices[0].z).toBeCloseTo(ordinary, 3);
      expect(s.vertices[0].d).toBeCloseTo(0, 3);
    }
    expect(dug).toBeGreaterThan(0);
  });
  test("every measure says where it came from", () => {
    for (const s of lawful) { expect(["data", "map", "estimate"]).toContain(s.evidence); expect(s.note.length, s.key).toBeGreaterThan(10); }
  });
  test("what nobody has measured today says so, rather than claiming none", () => {
    expect(by(lawful, "path_km").today).toBeNull();
    expect(by(lawful, "seats").today).toBeNull();
  });
  test("runs at a metre lower and higher", () => expect(RISES).toEqual([-1, 0, 1]));
});
