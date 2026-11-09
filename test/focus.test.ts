// A focused brief on a real place (engine/focus; docs/architecture-v3.md section 15, step F1).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { EXERCISES, exerciseOf } from "../app/engine/focus/exercise.js";
import { checkBrief, lineIndex, type Place, profile, type ViewDef, zoneOf } from "../app/engine/focus/place.js";
import { checkRecords, inRings, reachAt, riverYear } from "../app/engine/focus/river.js";
import { ringArea, todayOf } from "../app/engine/focus/today.js";
import { measureView, viewsOf } from "../app/engine/focus/views.js";
import { Walk } from "../app/engine/focus/walk.js";

const place: Place = JSON.parse(readFileSync(join(__dirname, "..", "app", "public", "sites", "agra-taj.place.json"), "utf8"));

describe("the design exercises", () => {
  const places = JSON.parse(readFileSync(join(__dirname, "..", "app", "public", "sites", "places.json"), "utf8"));
  test("every exercise says what it designs and what stays", () => {
    for (const e of EXERCISES) { expect(e.words.length, e.id).toBeGreaterThan(10); expect(e.keeps.length, e.id).toBeGreaterThan(5); }
  });
  test("whole sites and river edges can be chosen; what isn't built can't", () => {
    expect(EXERCISES.filter((e) => e.built).map((e) => e.id)).toEqual(["city", "riverfront"]);
  });
  test("each focused exercise that's built has a place to work on, of its kind", () => {
    for (const e of EXERCISES.filter((x) => x.built && x.id !== "city")) {
      expect(Object.values(places).some((p) => (p as { kind: string }).kind === e.id), e.id).toBe(true);
    }
  });
  test("a place's entry matches its file", () => {
    expect(places["agra-taj"].kind).toBe(place.brief.kind);
    expect(places["agra-taj"].outline.length).toBeGreaterThan(3);
    expect(Math.round(places["agra-taj"].design_ha)).toBe(todayOf(place).measures[0].value);   // the card and the numbers agree
  });
  test("an unknown exercise is nothing", () => expect(exerciseOf("moon")).toBeNull());
});

describe("walking on real lines", () => {
  test("a route follows the lines, not the crow's path", () => {
    const w = new Walk([[0, 0, 100, 0], [100, 0, 100, 100]]);
    const a = w.nearest(0, 0, 5), b = w.nearest(100, 100, 5);
    expect(w.from([a])[b]).toBeCloseTo(200, 3);
  });
  test("two lines that don't meet have no route", () => {
    const w = new Walk([[0, 0, 100, 0], [0, 500, 100, 500]]);
    expect(w.from([w.nearest(0, 0, 5)])[w.nearest(0, 500, 5)]).toBe(Infinity);
    expect(w.joinedShare()).toBeLessThan(0.6);
  });
  test("a side street ending beside a street joins it, though no point is shared", () => {
    const w = new Walk([[0, 0, 100, 0], [50, 3, 50, 100]]);
    expect(w.from([w.nearest(0, 0, 5)])[w.nearest(50, 100, 5)]).toBeLessThan(160);
  });
  test("crossing lines with no shared point (a bridge over a road) stay apart", () => {
    const w = new Walk([[0, 0, 200, 0], [100, -100, 100, 100]]);
    expect(w.from([w.nearest(0, 0, 5)])[w.nearest(100, 100, 5)]).toBe(Infinity);
  });
  test("a limit stops the walk", () => {
    const w = new Walk([[0, 0, 1000, 0]]);
    expect(w.from([w.nearest(0, 0, 5)], 100)[w.nearest(1000, 0, 5)]).toBe(Infinity);
  });
});

describe("the river's records", () => {
  test("a level's reach matches the place's own bands at each mark", () => {
    place.brief.marks.forEach((m, k) => {
      const reach = reachAt(place, m.m);
      for (let i = 0; i < reach.length; i++) expect(reach[i], `${m.id} cell ${i}`).toBe(place.cells.band[i] >= 1 && place.cells.band[i] <= k + 1 ? 1 : 0);
    });
  });
  test("a higher level reaches no less", () => {
    const a = reachAt(place, 150), b = reachAt(place, 153);
    for (let i = 0; i < a.length; i++) expect(b[i]).toBeGreaterThanOrEqual(a[i]);
  });
  test("every testable record is tested, in words, and says whether it agrees", () => {
    const tested = checkRecords(place).filter((r) => r.record.check);
    expect(tested.length).toBeGreaterThan(0);
    for (const r of tested) { expect(r.model.length).toBeGreaterThan(10); expect(typeof r.agrees).toBe("boolean"); }
  });
  test("a point in a ring, and not in its hole", () => {
    const rings = [[[0, 0, 10, 0, 10, 10, 0, 10], [4, 4, 6, 4, 6, 6, 4, 6]]];
    expect(inRings(rings, 2, 2)).toBe(true);
    expect(inRings(rings, 5, 5)).toBe(false);
    expect(inRings(rings, 20, 2)).toBe(false);
  });
});

describe("the river's year", () => {
  test("twelve months, each saying how many looks it had", () => {
    const y = riverYear(place)!;
    expect(y.months.length).toBe(12);
    for (const m of y.months) { expect(m.ha).toBeGreaterThanOrEqual(0); expect(m.looks).toBeGreaterThanOrEqual(0); }
  });
  test("dry days stay within a year", () => {
    for (const d of riverYear(place)!.dry) { expect(d).toBeGreaterThanOrEqual(-1); expect(d).toBeLessThanOrEqual(365); }
  });
  test("a place with no year has none", () => expect(riverYear({ ...place, year: null })).toBeNull());
});

describe("rules on the map", () => {
  const rule = (id: string) => (place.brief.rules ?? []).findIndex((r) => r.id === id);
  const bit = (i: number, id: string) => !!(place.cells.rule![i] & (1 << rule(id)));
  test("each one has its source and status, and the brief passes", () => {
    expect(place.brief.rules!.length).toBeGreaterThan(3);
    expect(checkBrief(place.brief)).toEqual([]);
  });
  test("a cell isn't in the prohibited and regulated rings at once", () => {
    for (let i = 0; i < place.cells.x.length; i++) expect(bit(i, "prohibited") && bit(i, "regulated")).toBe(false);
  });
  test("an unread legal claim is labelled, not counted as law", () => {
    expect(place.brief.rules!.find((r) => r.id === "taj500")!.kind).toBe("unconfirmed");
  });
  test("a rule with no source fails the brief's check", () => {
    const bad = { ...place.brief.rules![0], source: "" };
    expect(checkBrief({ ...place.brief, rules: [bad] }).join()).toContain("source");
  });
});

describe("views as a measured limit", () => {
  // Flat ground at 100 m with a wall halfway, on a small invented place.
  const flat = (): Place => {
    const x: number[] = [], y: number[] = [], z: number[] = [];
    for (let i = -500; i <= 500; i += 20) for (let j = -100; j <= 100; j += 20) { x.push(i); y.push(j); z.push(100); }
    return { meta: { box: [-500, -100, 500, 100], grid: { spacing: 20 } },
      cells: { x, y, z }, buildings: { rings: [[-10, -40, 10, -40, 10, 40, -10, 40]], h: [30], src: [0], cell: [0], names: { 0: "Wall" } } } as unknown as Place;
  };
  const toward: ViewDef = { id: "v", words: "v", why: "v", status: "assumed", feature: "e", eye: [-400, 0], eye_m: 2, target: { at: [400, 0], half_m: 20, foot_m: 10, name: "T" } };
  test("the limit is the rising sight line, least near the eye", () => {
    const p = flat(), r = measureView(p, toward);
    const at = (px: number) => r.limit[p.cells.x.findIndex((v, i) => v === px && p.cells.y[i] === 0)];
    expect(at(-300)).toBeLessThan(at(200));
    expect(at(0)).toBeCloseTo(2 + (10 - 2) * 0.5, 1);   // halfway: halfway from the eye's 2 m to the foot's 10 m
  });
  test("outside the view's width there is no limit", () => {
    const p = flat(), r = measureView(p, toward);
    expect(r.limit[p.cells.x.findIndex((v, i) => v === -300 && p.cells.y[i] === 100)]).toBeNaN();
  });
  test("a wall in the way blocks the sight line, and is named", () => {
    const r = measureView(flat(), toward);
    expect(r.clear).toBe(0);
    expect(r.blockers[0].name).toBe("Wall");
    expect(r.blockers[0].over).toBeGreaterThan(20);
  });
  test("ground behind a wall isn't seen", () => {
    const p = flat(), r = measureView(p, toward);
    const at = (px: number) => r.seen[p.cells.x.findIndex((v, i) => v === px && p.cells.y[i] === 0)];
    expect(at(-200)).toBe(1);
    expect(at(200)).toBe(0);
  });
  test("what it looks at doesn't block itself", () => {
    const p = flat();
    p.buildings = { ...p.buildings, rings: [[350, -40, 450, -40, 450, 40, 350, 40]], names: { 0: "T" } };
    const r = measureView(p, toward);
    expect(r.clear).toBe(1);
    expect(r.blockers).toEqual([]);
  });
  test("an eye on a plinth stands on its highest ground", () => {
    const p = flat();
    p.buildings = { ...p.buildings, rings: [], h: [], names: {} };
    const k = p.cells.x.findIndex((v, i) => v === -380 && p.cells.y[i] === 0);
    p.cells.z[k] = 110;
    expect(measureView(p, { ...toward, eye: [-400, 0], eye_m: 2, on_high: true }).eyeZ).toBeCloseTo(112, 3);
    expect(measureView(p, { ...toward, eye: [-400, 0], eye_m: 2 }).eyeZ).toBeCloseTo(102, 3);
  });
  test("with the wall gone the view is clear", () => {
    const p = flat();
    p.buildings = { ...p.buildings, rings: [], h: [], names: {} };
    const r = measureView(p, toward);
    expect(r.clear).toBe(1);
    expect(r.blockers).toEqual([]);
  });
  test("across a view, the limit is what's behind", () => {
    const p = flat();
    const across: ViewDef = { id: "a", words: "a", why: "a", status: "assumed", feature: "e", eye: [-400, 0], eye_m: 2, looks: { at: [400, 0], fan_deg: 30 } };
    const r = measureView(p, across);
    const i = p.cells.x.findIndex((v, k) => v === -200 && p.cells.y[k] === 0);
    expect(r.limit[i]).toBeGreaterThan(5);                // the wall's top behind allows height
    const behind = p.cells.x.findIndex((v, k) => v === 300 && p.cells.y[k] === 0);
    expect(r.limit[behind]).toBeLessThan(r.limit[i]);     // with nothing beyond, nearly none
  });
  test("every view of the Agra brief measures, and the Taj's are set in the zone", () => {
    const v = viewsOf(place);
    expect(v.results.length).toBe(place.brief.views!.length);
    const z = zoneOf(place);
    let set = 0;
    for (let i = 0; i < z.length; i++) if (z[i] && Number.isFinite(v.limit[i])) { set++; expect(v.limit[i]).toBeGreaterThanOrEqual(0); }
    expect(set).toBeGreaterThan(0);
  });
});

describe("a brief's check", () => {
  const stay = { id: "a", words: "A", why: "because", source: null, status: "assumed", applies: "limit" as const, decided_by: null, decision: null };
  const brief = { ...place.brief, stays: [stay] };
  test("the Agra brief passes", () => expect(checkBrief(place.brief)).toEqual([]));
  test("a stay with no source must say it is assumed", () => {
    expect(checkBrief({ ...brief, stays: [{ ...stay, status: "reported" }] })[0]).toContain("assumed");
  });
  test("a decision needs someone who made it", () => {
    expect(checkBrief({ ...brief, stays: [{ ...stay, decision: "keep" }] })[0]).toContain("someone");
  });
  test("marks must rise", () => {
    expect(checkBrief({ ...brief, marks: [...brief.marks].reverse() }).join()).toContain("not above");
  });
  test("nothing starts out decided", () => {
    for (const s of place.brief.stays) { expect(s.decided_by).toBeNull(); expect(s.decision).toBeNull(); }
  });
});

describe("the Agra stretch", () => {
  const today = todayOf(place);
  const value = (k: string) => today.measures.find((m) => m.key === k)!.value!;

  test("a higher mark takes in all a lower mark does", () => {
    const [a, b, c] = place.brief.marks.map((_, k) => zoneOf(place, k));
    for (let i = 0; i < a.length; i++) { expect(b[i]).toBeGreaterThanOrEqual(a[i]); expect(c[i]).toBeGreaterThanOrEqual(b[i]); }
  });
  test("what stays is never in the can-change zone", () => {
    const z = zoneOf(place);
    for (let i = 0; i < z.length; i++) if (place.cells.stay[i]) expect(z[i]).toBe(0);
    expect(place.cells.stay.some(Boolean)).toBe(true);
  });
  test("the river is never in the can-change zone, and tanks aren't the river", () => {
    const z = zoneOf(place);
    for (let i = 0; i < z.length; i++) {
      if (place.cells.band[i] === 0) expect(z[i]).toBe(0);
      if (place.cells.tank[i]) expect(place.cells.band[i]).toBeGreaterThan(0);
    }
  });
  test("the Fort isn't a railway station: every stay on the map is near where it should be", () => {
    const stay = (id: string) => place.brief.stays.find((s) => s.id === id)!;
    const x = (id: string) => { const r = stay(id).rings![0][0]; let s = 0; for (let k = 0; k < r.length; k += 2) s += r[k]; return s / (r.length / 2); };
    expect(x("fort")).toBeLessThan(x("taj") - 1000);   // west of the Taj by well over a kilometre
    expect(Math.abs(x("taj") - x("mehtab"))).toBeLessThan(250);
  });
  test("no stray continent-sized land use", () => {
    expect(place.meta.dropped).toContain("Papahānaumokuākea Marine National Monument");
    for (const l of place.land_use) expect(l.name ?? "").not.toContain("Marine");
  });
  test("both banks are found", () => {
    expect(place.cells.side.includes(1)).toBe(true);
    expect(place.cells.side.includes(2)).toBe(true);
  });
  test("the streets mostly join up", () => expect(today.joined).toBeGreaterThan(0.8));
  test("measures are real numbers in their ranges, each with evidence", () => {
    for (const m of today.measures) { expect(m.value, m.key).not.toBeNull(); expect(m.note.length, m.key).toBeGreaterThan(5); }
    for (const k of ["often_wet", "trees", "green", "bank_reach", "walk_10"]) { expect(value(k)).toBeGreaterThanOrEqual(0); expect(value(k)).toBeLessThanOrEqual(100); }
    expect(value("hot")).toBeGreaterThan(30);
    expect(value("hot")).toBeLessThan(55);
  });
  test("the zone grows with the mark", () => {
    const area = place.brief.marks.map((_, k) => todayOf(place, k).measures[0].value!);
    expect(area[0]).toBeLessThan(area[1]);
    expect(area[1]).toBeLessThan(area[2]);
  });
  test("the line is the brief's", () => expect(today.mark).toBe(lineIndex(place.brief)));
  test("walks between the monuments find a route, longer than the straight line", () => {
    for (const w of today.walks) { expect(w.walk, w.words).not.toBeNull(); expect(w.walk!, w.words).toBeGreaterThan(w.straight); }
  });
  test("a real section from the Taj to Mehtab Bagh crosses the river", () => {
    const p = profile(place, place.landmarks["East Gate"], place.landmarks["Mehtab Bagh"]);
    expect(p.some((s) => s.band === 0)).toBe(true);
    expect(p.some((s) => s.z !== null)).toBe(true);
  });
  test("ring area", () => expect(ringArea([0, 0, 10, 0, 10, 10, 0, 10])).toBe(100));
});
