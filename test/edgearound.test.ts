// Other ways to do a stretch, and searching around what's locked (docs/architecture-v3.md section 15.11, step I2).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, test } from "vitest";
import { readEdge } from "../app/engine/focus/edge.js";
import { designOf, fitDesign, withStretch } from "../app/engine/focus/edgedesign.js";
import { fitStretch } from "../app/engine/focus/edgeform.js";
import { pathJoins, scoreEdge, stretchSums } from "../app/engine/focus/edgescore.js";
import { alternativesFor, DIRECTIONS, type EdgeOption, searchAround, searchEdge, valuesOf } from "../app/engine/focus/edgesearch.js";
import type { Place } from "../app/engine/focus/place.js";
import { Walk } from "../app/engine/focus/walk.js";

const place: Place = JSON.parse(readFileSync(join(__dirname, "..", "app", "public", "sites", "agra-taj.place.json"), "utf8"));
const read = readEdge(place), walk = new Walk(place.streets.map((s) => s.pts));
const allIds = read.banks.flatMap((b) => b.stretches.map((s) => s.id));
const bankOf = (id: string) => read.banks.find((b) => b.stretches.some((s) => s.id === id))!;
/** Lock everything but these, so a test doesn't have to search the whole edge. */
const allBut = (...free: string[]) => allIds.filter((id) => !free.includes(id));

let options: EdgeOption[] = [];
beforeAll(() => { options = searchEdge(place, read, walk); }, 120_000);
const pick = (id: string) => options.find((o) => o.id === id)!;
const scoresOf = (d: Parameters<typeof fitDesign>[2]) => scoreEdge(place, read, fitDesign(place, read, d), walk);
const by = (d: Parameters<typeof fitDesign>[2], key: string) => scoresOf(d).find((s) => s.key === key)!.design!;

describe("searching around what's locked", () => {
  test("with nothing locked and a direction's values, it finds that option again", () => {
    for (const id of ["soft-river"]) {
      const o = pick(id), found = searchAround(place, read, walk, { design: null, locked: [], values: valuesOf(o.direction), works: o.works });
      expect(scoresOf(found)).toEqual(o.scores);
    }
  }, 60_000);
  test("a locked stretch stays exactly as it was, and the rest can change", () => {
    const d = designOf(pick("soft-green"));
    const found = searchAround(place, read, walk, { design: d, locked: allBut("A5", "B4"), values: valuesOf("room"), works: "soft" });
    for (const id of allBut("A5", "B4")) expect(found.stretches[id], id).toBe(d.stretches[id]);
    expect(found.stretches.B4).not.toEqual(d.stretches.B4);
  }, 60_000);
  test("with everything locked, nothing moves", () => {
    const d = designOf(pick("soft-river"));
    expect(scoresOf(searchAround(place, read, walk, { design: d, locked: allIds, values: valuesOf("room"), works: "soft" }))).toEqual(pick("soft-river").scores);
  }, 60_000);
  test("what it finds holds every limit", () => {
    const found = searchAround(place, read, walk, { design: designOf(pick("soft-river")), locked: allBut("A3", "A5", "A8", "B4"), values: valuesOf("room"), works: "soft" });
    const broken = fitDesign(place, read, found).flatMap((f) => f.checks.filter((c) => !c.holds).map((c) => `${f.stretch.id} ${c.id}`));
    expect(broken).toEqual([]);
  }, 60_000);
  test("a stretch locked at today stays at today, and nothing joins across it", () => {
    const d = withStretch(designOf(pick("soft-path")), "A6", null);
    const found = searchAround(place, read, walk, { design: d, locked: allBut("A5", "A7"), values: valuesOf("path"), works: "soft" });
    expect(found.stretches.A6).toBeUndefined();
    expect(found.stretches.A5).toBeDefined();
    expect(found.stretches.A7).toBeDefined();
    for (const j of pathJoins(read, fitDesign(place, read, found))) expect(j.stretches).not.toContain("A6");
  }, 60_000);
  test("it keeps what it valued and what it held still", () => {
    const values = { ...valuesOf("green"), earth: 2 }, locked = allBut("B4");
    const found = searchAround(place, read, walk, { design: designOf(pick("soft-river")), locked, values, works: "soft" });
    expect(found.searched).toEqual({ values, locked, works: "soft", seed: 1 });
    expect(found.basedOn).toBe("soft-river");
    expect(withStretch(found, "A1", null).searched).toEqual(found.searched);
  }, 60_000);
});

describe("what a person values changes what's found", () => {
  const d = () => designOf(pick("soft-path")), free = allBut("A5", "B4");
  const run = (values: ReturnType<typeof valuesOf>) => searchAround(place, read, walk, { design: d(), locked: free, values, works: "soft" });
  test("valuing flood room more finds more of it", () => {
    expect(by(run({ ...valuesOf("path"), room: 1 }), "flood_room")).toBeGreaterThan(by(run(valuesOf("path")), "flood_room"));
  }, 60_000);
  test("dearer earth moves less of it", () => {
    const base = { ...valuesOf("room") };
    expect(by(run({ ...base, earth: 40 }), "earth_moved")).toBeLessThan(by(run({ ...base, earth: 0.25 }), "earth_moved"));
  }, 60_000);
  test("valuing planting plants more", () => {
    expect(by(run({ ...valuesOf("path"), planted: 1 }), "planted")).toBeGreaterThan(by(run(valuesOf("path")), "planted"));
  }, 60_000);
});

describe("other ways to do one stretch", () => {
  const alts = (id: string, works: "soft" | "hard" = "soft") => alternativesFor(place, read, walk, bankOf(id).id, id, works);
  test("there are several, none a copy of another, and each says what it's best at", () => {
    const list = alts("B4");
    expect(list.length).toBeGreaterThanOrEqual(3);
    expect(new Set(list.map((a) => JSON.stringify([a.choice.shape, a.choice.keepGround, a.choice.pathD]))).size).toBe(list.length);
    for (const a of list) expect(a.best.length).toBeGreaterThan(0);
  }, 60_000);
  test("each holds every limit, and is what it says when it's used", () => {
    for (const a of alts("B4")) {
      const f = fitStretch(place, read, bankOf("B4").id, "B4", a.choice.shape, a.choice.works, { keepGround: a.choice.keepGround, pathD: a.choice.pathD });
      expect(f.checks.filter((c) => !c.holds)).toEqual([]);
      expect(stretchSums(place, read, f, walk)).toEqual(a.sums);
    }
  }, 60_000);
  test("no two are level at the same thing: one that's already level says so instead", () => {
    const list = alts("B4");
    expect(list.filter((a) => a.sums.earth === 0 && a.sums.planted === 0 && a.choice.pathD === list[0].choice.pathD).length).toBeLessThanOrEqual(1);
    expect(list.flatMap((a) => a.best).length).toBe(new Set(list.flatMap((a) => a.best)).size);
  }, 60_000);
  test("least earth means none on ground that can be left alone", () => {
    expect(alts("B4").find((a) => a.best.includes("the least earth moved"))!.sums.earth).toBe(0);
  }, 60_000);
  test("with no room, nothing can differ, so there's little to offer", () => {
    expect(alts("A14").length).toBeLessThanOrEqual(1);
  }, 60_000);
  test("lawful alternatives have nothing hard in them", () => {
    for (const a of alts("B4")) expect(a.sums.paved).toBe(0);
  }, 60_000);
});

describe("values as they come", () => {
  test("every direction has them, with earth at its usual cost", () => {
    for (const d of DIRECTIONS) expect(valuesOf(d.id).earth).toBe(1);
  });
  test("an option's design records its direction's values", () => {
    expect(designOf(pick("soft-room")).searched!.values).toEqual(valuesOf("room"));
  });
});
