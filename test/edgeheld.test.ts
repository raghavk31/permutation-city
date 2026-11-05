// A design a person holds (engine/focus/edgedesign; docs/architecture-v3.md section 15.11, step I1).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, test } from "vitest";
import { readEdge } from "../app/engine/focus/edge.js";
import { changesFrom, designOf, type EdgeDesign, fitDesign, goesBeyond, type StretchChoice, whatIfStretches, withStretch } from "../app/engine/focus/edgedesign.js";
import { fitStretch } from "../app/engine/focus/edgeform.js";
import { scoreEdge } from "../app/engine/focus/edgescore.js";
import { type EdgeOption, searchEdge } from "../app/engine/focus/edgesearch.js";
import type { Place } from "../app/engine/focus/place.js";
import { Walk } from "../app/engine/focus/walk.js";
import { edgeShapeOf } from "../app/engine/typology/openshape.js";

const place: Place = JSON.parse(readFileSync(join(__dirname, "..", "app", "public", "sites", "agra-taj.place.json"), "utf8"));
const read = readEdge(place), walk = new Walk(place.streets.map((s) => s.pts));
let options: EdgeOption[] = [];
beforeAll(() => { options = searchEdge(place, read, walk); }, 120_000);

const pick = (id: string) => options.find((o) => o.id === id)!;
const score = (d: EdgeDesign) => { const fits = fitDesign(place, read, d); return { fits, scores: scoreEdge(place, read, fits, walk) }; };
const yan = (works: "soft" | "hard" = "soft"): StretchChoice => ({ shape: edgeShapeOf("yanweizhou")!, works, keepGround: false, pathD: undefined, from: "yanweizhou" });

describe("a design made from an option", () => {
  test("scores exactly as the option did, on every option", () => {
    for (const o of options) expect(score(designOf(o)).scores, o.id).toEqual(o.scores);
  });
  test("is unchanged against it", () => {
    for (const o of options) {
      const d = designOf(o), { fits, scores } = score(d), c = changesFrom(read, o, d, scores, fits);
      expect(c.stretches, o.id).toEqual([]);
      expect(c.measures, o.id).toEqual([]);
      expect(c.steeper, o.id).toEqual([]);
    }
  });
});

describe("changing one stretch", () => {
  test("leaves the others as they were, and isn't fitted again", () => {
    const d = designOf(pick("soft-river")), e = withStretch(d, "B4", yan());
    const a = fitDesign(place, read, d), b = fitDesign(place, read, e);
    a.forEach((f, i) => { if (f.stretch.id === "B4") expect(b[i]).not.toBe(f); else expect(b[i], f.stretch.id).toBe(f); });
  });
  test("doesn't touch the design it came from", () => {
    const d = designOf(pick("soft-river")), was = JSON.stringify(d);
    withStretch(d, "B4", yan());
    expect(JSON.stringify(d)).toBe(was);
  });
  test("moves the measures, and says which", () => {
    const o = pick("soft-river"), e = withStretch(designOf(o), "B4", yan()), { fits, scores } = score(e), c = changesFrom(read, o, e, scores, fits);
    expect(c.stretches).toEqual(["B4"]);
    const earth = c.measures.find((m) => m.key === "earth_moved")!;
    expect(earth.to!).toBeGreaterThan(earth.from!);
    expect(earth.better).toBe(false);
  });
  test("to today takes its path away, and says so", () => {
    const o = pick("soft-path"), e = withStretch(designOf(o), "A6", null), { fits, scores } = score(e), c = changesFrom(read, o, e, scores, fits);
    expect(c.stretches).toEqual(["A6"]);
    expect(fits.find((f) => f.stretch.id === "A6")).toBeUndefined();
    expect(c.measures.find((m) => m.key === "path_km")!.to!).toBeLessThan(c.measures.find((m) => m.key === "path_km")!.from!);
  });
  test("still holds every limit, whatever's chosen", () => {
    for (const s of read.banks.flatMap((b) => b.stretches)) {
      const f = fitDesign(place, read, withStretch(designOf(pick("soft-green")), s.id, yan())).find((x) => x.stretch.id === s.id)!;
      expect(f.checks.filter((c) => !c.holds).map((c) => c.id), s.id).toEqual([]);
    }
  });
});

describe("lawful or a what-if, read from what's in the design", () => {
  test("every lawful option is lawful, and every what-if is one", () => {
    for (const o of options) {
      const n = whatIfStretches(fitDesign(place, read, designOf(o))).length;
      if (o.works === "soft") expect(n, o.id).toBe(0); else expect(n, o.id).toBeGreaterThan(0);
    }
  });
  test("one what-if stretch makes the design one, and it's named", () => {
    const hardBank = read.banks.flatMap((b) => b.stretches).find((s) => s.id === "B4")!;
    const d = withStretch(designOf(pick("soft-green")), hardBank.id, { ...yan("hard"), shape: edgeShapeOf("maheshwar-ghat")! });
    expect(whatIfStretches(fitDesign(place, read, d))).toEqual(["B4"]);
  });
  test("a path beside a monument goes beyond the rules even with nothing hard in it", () => {
    const b = read.banks.find((x) => x.stretches.some((s) => s.law === "prohibited"))!, s = b.stretches.find((x) => x.law === "prohibited" && x.room !== "none")!;
    const f = fitStretch(place, read, b.id, s.id, edgeShapeOf("yanweizhou")!, "hard", { keepGround: true });
    expect(f.sections.some((x) => x.elements.some((e) => e.works === "hard"))).toBe(false);
    expect(goesBeyond(f)).toBe(true);
  });
});

describe("planting counts only what it adds", () => {
  test("ground already at the wanted cover adds none, and more cover wanted adds more", () => {
    const of = (trees: number) => {
      const d = designOf(pick("soft-green"));
      const out: EdgeDesign = { basedOn: null, stretches: Object.fromEntries(Object.entries(d.stretches).map(([k, c]) => [k, { ...c, shape: { ...c.shape, trees } }])) };
      return score(out).scores.find((s) => s.key === "planted")!.design!;
    };
    expect(of(0)).toBe(0);
    expect(of(0.3)).toBeGreaterThan(0);
    expect(of(0.6)).toBeGreaterThan(of(0.3));
  });
  test("it's less than the ground times the cover, because some ground already has trees", () => {
    const o = pick("soft-green"), planted = o.scores.find((s) => s.key === "planted")!.design!;
    let gross = 0;
    for (const f of o.fits) { const len = f.stretch.length / Math.max(1, f.sections.length); for (const s of f.sections) for (const e of s.elements) if (e.planting) gross += ((e.d1 - e.d0) * len * f.shape.trees) / 1e4; }
    expect(planted).toBeLessThan(gross);
  });
});
