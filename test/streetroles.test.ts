// Streets as a system (engine/plan/streetroles.ts; architecture-v3 section 14.5, step P4): every
// street has a role and a section that adds up to its width, with the role's footpaths, lanes
// and planting in the order the rules give them.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import * as E from "../app/engine/index.js";
import { ROLES, ROLE_KEYS, sectionOf, streetShade } from "../app/engine/plan/streetroles.js";
import { hotSuns } from "../app/engine/massing/scores.js";
import { makeRng } from "../app/engine/rng.js";

const site = (id: string) => E.prepare(JSON.parse(readFileSync(join(__dirname, "..", "app", "public", "sites", `${id}.json`), "utf8")));
const sum = (ps: { w: number }[]) => ps.reduce((a, p) => a + p.w, 0);
const of = (ps: { kind: string; w: number }[], k: string) => ps.filter((p) => p.kind === k);

describe("street sections", () => {
  test.each(ROLE_KEYS.flatMap((r) => [6, 7.5, 9, 12, 18].map((w) => [r, w] as const)))("%s at %s m adds up to its width", (r, w) => {
    for (const [wet, hot] of [[0, 0], [1, 0], [0, 1]]) for (const over of [false, true]) {
      const s = sectionOf(r, w, wet, hot, over);
      expect(sum(s)).toBeCloseTo(w, 6);
      for (const p of s) expect(p.w).toBeGreaterThan(0);
    }
  });

  test("shared streets have no kerb: one surface, no carriageway, at walking pace", () => {
    for (const r of ROLE_KEYS.filter((k) => ROLES[k].shared)) {
      const s = sectionOf(r, 9, 0.5, 0.5);
      expect(of(s, "carriageway").length).toBe(0);
      expect(of(s, "shared").length).toBe(1);
      expect(ROLES[r].speed).toBeLessThanOrEqual(15);
    }
  });

  test("a home street keeps GSDG's 1.8 m clear path each side; a main street 2.4 m", () => {
    for (const p of of(sectionOf("residential", 9, 0, 0), "footpath")) expect(p.w).toBeGreaterThanOrEqual(1.8);
    for (const p of of(sectionOf("main-street", 18, 0, 0), "footpath")) expect(p.w).toBeGreaterThanOrEqual(2.4);
  });

  test("an 18 m avenue keeps trees on both sides before a third and fourth lane", () => {
    const s = sectionOf("avenue", 18, 0, 0);
    expect(of(s, "planted").filter((p) => p.w >= 1.5).length).toBeGreaterThanOrEqual(2);
  });

  test("a wet climate makes planting a swale; an overflow street gets more of it", () => {
    expect(sectionOf("boulevard", 18, 1, 0).some((p) => p.label.includes("swale"))).toBe(true);
    expect(sum(of(sectionOf("residential", 12, 1, 0, true), "planted"))).toBeGreaterThan(sum(of(sectionOf("residential", 12, 1, 0, false), "planted")));
  });
});

describe("street roles on a site", () => {
  const G = site("guwahati-bharalu"), rng = makeRng(20261103);
  const designs = Array.from({ length: 2 }, () => E.grow(E.randomGenome(rng, 3.1), G));

  test("every street has a role, a speed and a section of its width; place follows its reasons", () => {
    for (const d of designs) for (const s of d.plan!.streets) {
      expect(ROLE_KEYS).toContain(s.role);
      expect(s.speed).toBe(ROLES[s.role as keyof typeof ROLES].speed);
      expect(sum(s.section!)).toBeCloseTo(s.w, 6);
      expect(s.place).toBe(s.why!.length);
      if (s.cls >= 2) expect(ROLES[s.role as keyof typeof ROLES].shared).toBe(false);
    }
  });

  test("some streets on flow lines carry the big storm, and not most", () => {
    const all = designs.flatMap((d) => d.plan!.streets);
    const n = all.filter((s) => s.overflow).length;
    expect(n).toBeGreaterThan(0);
    expect(n / all.length).toBeLessThan(0.2);
  });
});

describe("shade on a street, hot afternoons", () => {
  // a north-south street 12 m wide at Bengaluru's latitude: afternoon sun from the west
  const suns = hotSuns({ lat: 12.9, lon: 77.67, utc: 5.5 }), st = { pts: [[0, 0], [0, 100]] as [number, number][], w: 12 };
  const plotC: [number, number][] = [[-20, 50], [20, 50]];   // left (west) and right (east)
  const bare = sectionOf("avenue", 12, 0, 0), treed = sectionOf("avenue", 18, 0, 0);
  test("taller buildings on the sun's side shade more", () => {
    const low = streetShade(st, bare, [0, 1], plotC, () => 2, suns), tall = streetShade(st, bare, [0, 1], plotC, () => 8, suns);
    expect(tall).toBeGreaterThan(low);
  });
  test("street trees add shade", () => {
    const s18 = { ...st, w: 18 };
    expect(streetShade(s18, treed, [], plotC, () => 0, suns)).toBeGreaterThan(streetShade(s18, bare.map((p) => ({ ...p, w: (p.w * 18) / 12 })), [], plotC, () => 0, suns));
  });
});
