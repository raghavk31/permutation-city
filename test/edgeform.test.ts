// A section on real ground (engine/focus/edgeform; docs/architecture-v3.md section 15.9, step E2).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { readEdge, type Station } from "../app/engine/focus/edge.js";
import { existingAt, fitStretch, freeWindow, PLANT_M, SOFT_BANK, surfaceAt, TREE_HOLD, type Works } from "../app/engine/focus/edgeform.js";
import type { Place } from "../app/engine/focus/place.js";
import { snakesPerKm } from "../app/engine/plan/geom.js";
import { EDGE_SECTIONS } from "../app/engine/typology/library/edgesections.js";
import { edgeShapeOf } from "../app/engine/typology/openshape.js";

const place: Place = JSON.parse(readFileSync(join(__dirname, "..", "app", "public", "sites", "agra-taj.place.json"), "utf8"));
const read = readEdge(place);
const line = place.brief.marks.find((m) => m.id === place.brief.line)!.m;

// Every precedent on every stretch, each way: what's true of one has to be true of all of them.
const fits = (["soft", "hard"] as Works[]).flatMap((works) => Object.keys(EDGE_SECTIONS).flatMap((id) => read.banks.flatMap((b) => b.stretches.map((s) => ({
  id, works, bank: b, fit: fitStretch(place, read, b.id, s.id, edgeShapeOf(id)!, works),
})))));
const name = (x: (typeof fits)[number]) => `${x.id} ${x.works} ${x.fit.stretch.id}`;
const stationOf = (x: (typeof fits)[number], k: number): Station => x.bank.stations[k];

describe("every precedent, on every stretch, both ways", () => {
  test("no limit breaks", () => {
    const broken = fits.flatMap((x) => x.fit.checks.filter((c) => !c.holds).map((c) => `${name(x)}: ${c.id}: ${c.found}`));
    expect(broken).toEqual([]);
  });
  test("nothing passes the bank or the end of the usable ground", () => {
    for (const x of fits) for (const s of x.fit.sections) for (const e of s.elements) {
      expect(e.d0, name(x)).toBeGreaterThanOrEqual(-1e-6);
      expect(e.d1, name(x)).toBeLessThanOrEqual(stationOf(x, s.k).reach + 1e-6);
    }
  });
  test("no earth is added below the record flood, over a stretch", () => {
    for (const x of fits) expect(x.fit.net, name(x)).toBeLessThanOrEqual(1);
  });
  test("a section meets today's ground at both ends of what it reshapes", () => {
    for (const x of fits) for (const s of x.fit.sections) if (s.window) {
      const t = stationOf(x, s.k);
      // A wall has two heights at one distance, so look for a vertex there at today's height.
      // A bank face dug back ends lower on purpose: only its inland end meets today's ground.
      for (const d of s.face ? [s.window[1]] : s.window) {
        const near = s.vertices.filter((v) => Math.abs(v.d - d) < 1e-6).map((v) => Math.abs(v.z - existingAt(t, d)!));
        expect(Math.min(...near), name(x)).toBeLessThan(0.05);
      }
    }
  });
  test("ground with trees keeps its level", () => {
    for (const x of fits) for (const s of x.fit.sections) if (s.window) {
      const t = stationOf(x, s.k);
      for (const g of t.ground) if (g.d >= s.window[0] && g.d <= s.window[1]) expect(g.trees ?? 0, name(x)).toBeLessThan(TREE_HOLD);
    }
  });
  test("what grows and what's raised stay under the view", () => {
    for (const x of fits) for (const s of x.fit.sections) {
      const t = stationOf(x, s.k);
      if (t.view === null) continue;
      for (const e of s.elements) if (e.planting) expect(PLANT_M[e.planting], `${name(x)} ${e.planting}`).toBeLessThanOrEqual(t.view + 1e-6);
    }
  });
  test("a surface runs in order, with no vertical jump in soft works", () => {
    for (const x of fits) for (const s of x.fit.sections) {
      for (let i = 1; i < s.vertices.length; i++) {
        expect(s.vertices[i].d, name(x)).toBeGreaterThanOrEqual(s.vertices[i - 1].d - 1e-6);
      }
    }
  });
  test("a path is on the ground, and runs along the bank without snaking", () => {
    for (const x of fits) {
      for (const l of x.fit.lines) if (l.kind === "path") expect(snakesPerKm(l.plan), name(x)).toBeLessThan(1);
      for (const s of x.fit.sections) if (s.path) { expect(s.path.d, name(x)).toBeGreaterThanOrEqual(0); expect(s.path.d, name(x)).toBeLessThanOrEqual(stationOf(x, s.k).reach); }
    }
  });
});

describe("the lawful design", () => {
  const soft = fits.filter((x) => x.works === "soft");
  test("has nothing hard in it", () => {
    for (const x of soft) for (const s of x.fit.sections) for (const e of s.elements) expect(e.works, name(x)).not.toBe("hard");
  });
  test("keeps earth banks gentle", () => {
    for (const x of soft) for (const s of x.fit.sections) for (const e of s.elements) if (e.kind === "bank") {
      expect((e.z1 - e.z0) / (e.d1 - e.d0), name(x)).toBeLessThanOrEqual(SOFT_BANK + 1e-6);
    }
  });
  test("beside a monument, only plants: no earth moved and no path", () => {
    const beside = soft.filter((x) => x.fit.stretch.law === "prohibited");
    expect(beside.length).toBeGreaterThan(0);
    for (const x of beside) {
      expect(x.fit.cut + x.fit.fill, name(x)).toBe(0);
      for (const s of x.fit.sections) expect(s.path, name(x)).toBeNull();
    }
  });
  test("says what it assumes about the law", () => {
    for (const x of soft) if (x.fit.mode === "reshape") expect(x.fit.notes.join(" "), name(x)).toMatch(/Nobody has read/);
  });
});

describe("the what-if", () => {
  const hard = fits.filter((x) => x.works === "hard");
  test("is hard somewhere, and labelled so", () => {
    const stone = hard.filter((x) => x.fit.sections.some((s) => s.elements.some((e) => e.works === "hard")));
    expect(stone.length).toBeGreaterThan(0);
    for (const x of stone) expect(x.fit.notes.join(" "), name(x)).toMatch(/what-if/i);
  });
  test("still puts nothing hard beside a monument", () => {
    for (const x of hard) if (x.fit.stretch.law === "prohibited") {
      for (const s of x.fit.sections) for (const e of s.elements) expect(e.works, name(x)).not.toBe("hard");
    }
  });
});

describe("a stretch as one thing", () => {
  test("a stretch with no room is left alone", () => {
    for (const x of fits) if (x.fit.stretch.room === "none") {
      expect(x.fit.mode, name(x)).toBe("none");
      expect(x.fit.cut + x.fit.fill, name(x)).toBe(0);
    }
  });
  test("levels run from the street down, within today's ground", () => {
    for (const x of fits) x.fit.levels.forEach((z, i, l) => { if (i) expect(z, name(x)).toBeLessThanOrEqual(l[i - 1] + 1e-6); expect(z, name(x)).toBeLessThan(line + 10); });
  });
  test("most of a stretch reshapes, or none of it does", () => {
    for (const x of fits) if (x.fit.mode === "reshape") {
      const n = x.fit.sections.filter((s) => s.mode === "reshape").length;
      expect(n / x.fit.sections.length, name(x)).toBeGreaterThanOrEqual(0.5);
    }
  });
  test("some of these precedents really do reshape something", () => {
    expect(fits.filter((x) => x.fit.mode === "reshape").length).toBeGreaterThan(30);
  });
});

describe("the free window", () => {
  const station = (ground: Station["ground"], reach = 100): Station => ({ bank: 1, s: 0, x: 0, y: 0, nx: 0, ny: 1, ground, out: [], reach, stop: "rises", rise: reach, law: "free", room: "wide", view: null, viewLow: false, trees: 0, hot: null, wetDays: null, toWaterLow: null, toWaterHigh: null });
  const flat = (trees: (d: number) => number) => Array.from({ length: 11 }, (_, k) => ({ d: k * 10, z: 150, trees: trees(k * 10) }));
  test("is the longest run without trees", () => {
    expect(freeWindow(station(flat((d) => (d === 30 ? 0.5 : 0))))).toEqual([40, 100]);
  });
  test("is nothing when trees cover the ground", () => {
    expect(freeWindow(station(flat(() => 0.5)))).toBeNull();
  });
  test("is nothing when too little is free", () => {
    expect(freeWindow(station(flat((d) => (d === 10 ? 0 : 0.5))))).toBeNull();
  });
  test("stops at the usable ground", () => {
    expect(freeWindow(station(flat(() => 0), 50))).toEqual([0, 50]);
  });
});
