// A river's edge read as a line (engine/focus/edge; docs/architecture-v3.md section 15.9, step E1).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { bankLines, cutStretches, datumCheck, monthlyLevels, readEdge, STATION_M, type Station, STRETCH_MIN_M } from "../app/engine/focus/edge.js";
import type { Place } from "../app/engine/focus/place.js";
import { inRings } from "../app/engine/focus/river.js";
import { length, snakesPerKm } from "../app/engine/plan/geom.js";

const place: Place = JSON.parse(readFileSync(join(__dirname, "..", "app", "public", "sites", "agra-taj.place.json"), "utf8"));
const read = readEdge(place);
const river = place.water.find((w) => w.subtype === "river")!;

describe("the two banks", () => {
  test("there are two, each a real length of the study area", () => {
    expect(read.banks.map((b) => b.id)).toEqual([1, 2]);
    for (const b of read.banks) { expect(b.length).toBeGreaterThan(2500); expect(b.length).toBeLessThan(5000); }
  });
  test("a traced bank doesn't snake", () => {
    for (const { line } of bankLines(place)) expect(snakesPerKm(line)).toBe(0);
  });
  test("stations are evenly spaced along the bank, and cover it", () => {
    for (const b of read.banks) {
      b.stations.forEach((t, k) => expect(t.s).toBe(k * STATION_M));
      expect(b.stations[b.stations.length - 1].s).toBeGreaterThan(length(b.line) - 2 * STATION_M);
    }
  });
  test("inland is away from the river", () => {
    for (const b of read.banks) {
      const inward = b.stations.filter((t) => !inRings(river.rings, t.x + t.nx * 30, t.y + t.ny * 30)).length;
      expect(inward / b.stations.length, b.words).toBeGreaterThan(0.95);
    }
  });
});

describe("a station's section", () => {
  const all = read.banks.flatMap((b) => b.stations);
  test("what a design could use is within the section, and something ends it", () => {
    for (const t of all) {
      expect(t.reach).toBeGreaterThanOrEqual(0);
      expect(t.reach).toBeLessThanOrEqual(500);
      expect(t.stop).toBeTruthy();
    }
  });
  test("no usable ground stands above the line where it stops for rising", () => {
    const line = place.brief.marks.find((m) => m.id === place.brief.line)!.m;
    for (const t of all.filter((a) => a.stop === "rises" && a.reach > 20)) {
      const before = t.ground.filter((g) => g.d < t.reach - 20 && g.z !== null);
      // The cells are coarse and the section's ground is drawn smooth, so allow what a cell can hide.
      for (const g of before) expect(g.z!).toBeLessThan(line + 5);
    }
  });
  test("the Taj's river wall leaves no room: the river runs at its foot", () => {
    const a = read.banks[0].stretches.filter((s) => s.law === "prohibited" && s.reach.mid <= 30);
    expect(a.length).toBeGreaterThan(0);
  });
  test("the two banks differ, so one section can't serve both", () => {
    const mid = (b: number) => read.banks[b].stations.map((t) => t.reach).sort((x, y) => x - y)[read.banks[b].stations.length >> 1];
    expect(mid(1)).toBeGreaterThan(mid(0) * 1.5);
  });
  test("a section sharing a cell with the river claims no reading of days wet", () => {
    const narrow = all.filter((t) => t.reach < 2 * place.meta.grid.spacing);
    expect(narrow.length).toBeGreaterThan(0);
    for (const t of narrow) expect(t.wetDays).toBeNull();
  });
  test("past the bank the surface is what the terrain says, not 0", () => {
    for (const t of all) for (const g of t.out) if (g.z !== null) expect(g.z).toBeGreaterThan(100);
  });
});

describe("stretches", () => {
  test("they cover each bank, in order, with no gaps", () => {
    for (const b of read.banks) {
      expect(b.stretches[0].from).toBe(0);
      b.stretches.forEach((s, k) => { if (k) expect(s.stations[0]).toBe(b.stretches[k - 1].stations[1] + 1); });
      expect(b.stretches[b.stretches.length - 1].stations[1]).toBe(b.stations.length - 1);
    }
  });
  test("none is too short to want a design of its own", () => {
    for (const b of read.banks) for (const s of b.stretches) expect(s.length, s.id).toBeGreaterThanOrEqual(STRETCH_MIN_M);
  });
  test("each has its own name", () => {
    const ids = read.banks.flatMap((b) => b.stretches.map((s) => s.id));
    expect(new Set(ids).size).toBe(ids.length);
  });
  const fake = (over: Partial<Station>, k: number): Station => ({ bank: 1, s: k * STATION_M, x: 0, y: 0, nx: 0, ny: 1, ground: [], out: [], reach: 100, stop: "rises", rise: 100,
    law: "free", room: "wide", view: null, viewLow: false, trees: 0, hot: null, wetDays: null, toWaterLow: null, toWaterHigh: null, ...over });
  test("a change in the law starts a new stretch", () => {
    const st = Array.from({ length: 12 }, (_, k) => fake({ law: k < 6 ? "free" : "prohibited" }, k));
    const out = cutStretches(1, st, 600);
    expect(out.map((s) => s.law)).toEqual(["free", "prohibited"]);
  });
  test("one odd station doesn't make a stretch", () => {
    const st = Array.from({ length: 12 }, (_, k) => fake({ room: k === 5 ? "narrow" : "wide" }, k));
    expect(cutStretches(1, st, 600)).toHaveLength(1);
  });
  test("the last stretch ends at the bank's end, not past it", () => {
    const st = Array.from({ length: 4 }, (_, k) => fake({}, k));
    expect(cutStretches(1, st, 170)[0].to).toBe(170);
  });
});

describe("how far the heights hold", () => {
  const datum = datumCheck(place);
  test("the reports disagree in both directions, within a metre, so test a metre each way", () => {
    expect(datum.range).not.toBeNull();
    expect(datum.range![0]).toBeLessThan(0);
    expect(datum.range![1]).toBeGreaterThan(0);
    expect(Math.max(-datum.range![0], datum.range![1])).toBeLessThanOrEqual(1);
  });
  test("the place holds the terrain under the river, not zeros", () => {
    const riverCells = place.cells.bed!.filter((v, i) => place.cells.band[i] === 0);
    expect(riverCells.every((v) => v !== null && v > 100)).toBe(true);
  });
  test("an ordinary day's river stands below the lowest reported reading", () => {
    expect(datum.ordinary).not.toBeNull();
    expect(datum.ordinary![1]).toBeLessThan(Math.min(...place.brief.records!.map((r) => r.m)));
  });
  test("a month too cloudy to see isn't read as a level", () => {
    const july = monthlyLevels(place)[6];
    expect(july.looks).toBeLessThan(20);
    expect(july.read).toBe(false);
  });
  test("the gauge's zero is named as unread, in words", () => {
    expect(datum.clues.some((c) => /zero/.test(c.found))).toBe(true);
  });
});
