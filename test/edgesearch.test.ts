// The search for a river's edge (engine/focus/edgesearch; docs/architecture-v3.md section 15.9, step E4).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, test } from "vitest";
import { readEdge } from "../app/engine/focus/edge.js";
import { fitStretch } from "../app/engine/focus/edgeform.js";
import { pathJoins, scoreEdge, stretchSums, WHEELCHAIR_SLOPE } from "../app/engine/focus/edgescore.js";
import { closestMember, DIRECTIONS, type EdgeOption, searchEdge, searchStretch } from "../app/engine/focus/edgesearch.js";
import type { Place } from "../app/engine/focus/place.js";
import { Walk } from "../app/engine/focus/walk.js";
import { snakesPerKm } from "../app/engine/plan/geom.js";
import { EDGE_SECTIONS } from "../app/engine/typology/library/edgesections.js";
import { edgeShapeOf } from "../app/engine/typology/openshape.js";

const place: Place = JSON.parse(readFileSync(join(__dirname, "..", "app", "public", "sites", "agra-taj.place.json"), "utf8"));
const read = readEdge(place), walk = new Walk(place.streets.map((s) => s.pts));
const today = scoreEdge(place, read, [], walk);

let options: EdgeOption[] = [];
beforeAll(() => { options = searchEdge(place, read, walk); }, 120_000);

const score = (o: EdgeOption, key: string) => o.scores.find((s) => s.key === key)!;
const of = (works: "soft" | "hard") => options.filter((o) => o.works === works);
const pick = (works: "soft" | "hard", d: string) => options.find((o) => o.works === works && o.direction === d)!;

describe("the options", () => {
  test("each direction, lawful and as a what-if, and each one different", () => {
    expect(of("soft").map((o) => o.direction)).toEqual(DIRECTIONS.map((d) => d.id));
    expect(of("hard").map((o) => o.direction)).toEqual(DIRECTIONS.map((d) => d.id));
    expect(new Set(options.map((o) => o.scores.map((s) => s.design).join())).size).toBe(options.length);
  });
  test("every stretch of both banks has a section", () => {
    const all = read.banks.flatMap((b) => b.stretches.map((s) => s.id)).sort();
    for (const o of options) expect(o.fits.map((f) => f.stretch.id).sort(), o.id).toEqual(all);
  });
  test("no limit breaks on any of them", () => {
    const broken = options.flatMap((o) => o.fits.flatMap((f) => f.checks.filter((c) => !c.holds).map((c) => `${o.id} ${f.stretch.id} ${c.id}: ${c.found}`)));
    expect(broken).toEqual([]);
  });
  test("each claims more walkable days than today at all three river levels, or it doesn't stand", () => {
    const t = today.find((s) => s.key === "days_walkable")!;
    for (const o of options) expect(score(o, "days_walkable").designBand![0], o.id).toBeGreaterThan(t.todayBand![1]);
  });
  test("each takes away no room for flood water, at any level", () => {
    for (const o of options) expect(score(o, "flood_room").designBand![0], o.id).toBeGreaterThanOrEqual(0);
  });
});

describe("each direction does what it says", () => {
  test.each(["soft", "hard"] as const)("%s: each wins its own measure", (w) => {
    const best = (key: string) => Math.max(...of(w).map((o) => score(o, key).design!));
    expect(score(pick(w, "path"), "days_walkable").design).toBe(best("days_walkable"));
    expect(score(pick(w, "river"), "path_close").design).toBe(best("path_close"));
    expect(score(pick(w, "room"), "flood_room").design).toBe(best("flood_room"));
    expect(score(pick(w, "green"), "planted").design).toBe(best("planted"));
  });
  test("a path and little else moves no earth and plants next to nothing", () => {
    const o = pick("soft", "path");
    expect(score(o, "earth_moved").design).toBe(0);
    expect(score(o, "planted").design!).toBeLessThan(1);
  });
  test("what a direction doesn't want, it doesn't take: only planting asks for much of it", () => {
    for (const d of ["path", "river", "room"]) expect(score(pick("soft", d), "planted").design!).toBeLessThan(score(pick("soft", "green"), "planted").design! / 5);
  });
  test("a riverside path gives up dry days: the trade is real", () => {
    expect(score(pick("soft", "river"), "days_walkable").design!).toBeLessThan(score(pick("soft", "path"), "days_walkable").design!);
    expect(score(pick("soft", "river"), "path_close").design!).toBeGreaterThan(score(pick("soft", "path"), "path_close").design!);
  });
});

describe("the lawful options", () => {
  test("have nothing hard in them", () => {
    for (const o of of("soft")) {
      expect(score(o, "paved").design, o.id).toBe(0);
      for (const f of o.fits) expect(f.works, o.id).toBe("soft");
    }
  });
  test("only plant beside a monument", () => {
    for (const o of of("soft")) for (const f of o.fits) if (f.stretch.law === "prohibited") {
      expect(f.cut + f.fill, `${o.id} ${f.stretch.id}`).toBe(0);
      for (const s of f.sections) expect(s.path, `${o.id} ${f.stretch.id}`).toBeNull();
    }
  });
  test("leave no reshaped earth bare", () => {
    for (const o of of("soft")) for (const f of o.fits) if (f.mode === "reshape") expect(f.shape.trees, `${o.id} ${f.stretch.id}`).toBeGreaterThanOrEqual(0.1);
  });
});

describe("the path", () => {
  test("counts its joins as the score does", () => {
    for (const o of options) {
      const j = pathJoins(read, o.fits);
      expect(o.joins.all).toBe(j.length);
      expect(o.joins.steep).toBe(j.filter((x) => x.slope > WHEELCHAIR_SLOPE).length);
      expect(score(o, "path_steep").design).toBe(o.joins.steep);
    }
  });
  test("a wheelchair can use nearly all of it", () => {
    for (const o of options) expect(o.joins.steep / Math.max(1, o.joins.all), o.id).toBeLessThan(0.1);
  });
  test("runs along the bank without snaking", () => {
    for (const o of options) for (const f of o.fits) for (const l of f.lines) if (l.kind === "path") expect(snakesPerKm(l.plan), `${o.id} ${f.stretch.id}`).toBeLessThan(1);
  });
  test("never leaves the usable ground", () => {
    for (const o of options) for (const f of o.fits) {
      const b = read.banks.find((x) => x.stretches.some((s) => s.id === f.stretch.id))!;
      for (const s of f.sections) if (s.path) { expect(s.path.d).toBeGreaterThanOrEqual(0); expect(s.path.d).toBeLessThanOrEqual(b.stations[s.k].reach); }
    }
  });
});

describe("the search reads what the panel shows", () => {
  test("a stretch's share adds up to the score, at the river's worst level", () => {
    const o = pick("soft", "room");
    const sums = o.fits.map((f) => stretchSums(place, read, f, walk));
    const n = read.banks.reduce((a, b) => a + b.stretches.reduce((c, s) => c + s.stations[1] - s.stations[0] + 1, 0), 0);
    const days = (sums.reduce((a, s) => a + s.days, 0) / 0.05 * 365) / n;
    expect(Math.abs(days - score(o, "days_walkable").designBand![0])).toBeLessThan(1);
    expect(Math.abs(sums.reduce((a, s) => a + s.room, 0) - score(o, "flood_room").designBand![0])).toBeLessThan(1);
    expect(Math.abs(sums.reduce((a, s) => a + s.earth, 0) - score(o, "earth_moved").design!)).toBeLessThan(1);
  });
});

describe("one stretch", () => {
  const bank = read.banks.find((b) => b.stretches.some((s) => s.id === "B4"))!;
  const run = (seed: number) => searchStretch(place, read, walk, bank.id, "B4", "soft", seed);
  test("starts from every member of the library", () => {
    const pool = run(1), first = Object.keys(EDGE_SECTIONS).map((id) => edgeShapeOf(id)!);
    expect(pool.length).toBeGreaterThan(first.length);
    first.forEach((m, i) => expect(pool[i].fit.shape.tiers).toBe(m.tiers));
  });
  test("the same seed gives the same answer, and another seed searches differently", () => {
    const a = run(1).map((c) => c.sums.earth), b = run(1).map((c) => c.sums.earth), c = run(2).map((x) => x.sums.earth);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });
  test("keeping the ground moves no earth, and puts the path where it's asked", () => {
    const f = fitStretch(place, read, bank.id, "B4", edgeShapeOf("yanweizhou")!, "soft", { keepGround: true, pathD: 30 });
    expect(f.mode).toBe("plant");
    expect(f.cut + f.fill).toBe(0);
    for (const s of f.sections) if (s.path) expect(s.path.d).toBeLessThanOrEqual(30);
  });
  test("a member is closest to itself", () => {
    for (const id of Object.keys(EDGE_SECTIONS)) expect(closestMember(edgeShapeOf(id)!)).toBe(id);
  });
});
