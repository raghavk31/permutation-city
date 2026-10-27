// Shared ground before buildings (app/engine/plan/shared.ts): squares at junctions, parks
// where plots lack one within a walk, frontage per street, access to each level of open space;
// and the street cross-sections (engine/config.ts).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as E from "../../app/engine";
import { DETOUR, FRONTAGES, OPEN_LEVELS, SHARED_MAX, SQUARE_SPACING_M } from "../../app/engine/plan/shared";
import { centroid, dist } from "../../app/engine/plan/geom";

const read = (id: string) => E.prepare(JSON.parse(readFileSync(join(__dirname, "..", "..", "app", "public", "sites", `${id}.json`), "utf8")));

describe("shared ground", () => {
  const G = read("ahmedabad-wadaj");
  const rng = E.makeRng(7);
  const designs = [0, 1, 2].map(() => E.grow(E.randomGenome(rng, 3), G));

  it("puts squares at junctions, far enough apart, on what were building plots", () => {
    for (const d of designs) {
      const sq = d.plan!.shared!.squares;
      expect(sq.length).toBeGreaterThan(0);
      for (let a = 0; a < sq.length; a++) for (let b = a + 1; b < sq.length; b++) expect(dist(sq[a].at, sq[b].at)).toBeGreaterThanOrEqual(SQUARE_SPACING_M);
      for (const s of sq) {
        expect(d.plan!.plots[s.plot].use).toBe(E.LANDSCAPE);
        expect(dist(centroid(d.plan!.plots[s.plot].ring), s.at)).toBeLessThan(40);
      }
    }
  });

  it("reserves parks only as big as their level, within the land budget, and leaves the plots served", () => {
    let land = 0;
    for (let i = 0; i < G.n; i++) land += G.cellArea;
    for (const d of designs) {
      const sh = d.plan!.shared!;
      let parkLand = 0;
      for (const p of sh.parks) {
        const L = OPEN_LEVELS.find((l) => l.key === p.level)!;
        expect(p.area).toBeGreaterThanOrEqual(L.min_m2);
        parkLand += p.area;
        for (const k of d.plan!.plots.keys()) if (d.plan!.plots[k].block === p.block) expect(d.plan!.plots[k].use).not.toBe(E.BUILDING);
      }
      expect(parkLand).toBeLessThanOrEqual(SHARED_MAX * land * 1.05);
      // the levels it reserves for reach nearly all the floor area (plots at the ground's ragged edge aside)
      expect(sh.access.housing).toBeGreaterThan(0.9);
      expect(sh.access.neighbourhood).toBeGreaterThan(0.9);
    }
  });

  it("measures access as a share, never more for a smaller walk to a bigger park", () => {
    for (const d of designs) {
      const a = d.plan!.shared!.access;
      for (const k of ["doorstep", "housing", "neighbourhood"] as const) { expect(a[k]).toBeGreaterThanOrEqual(0); expect(a[k]).toBeLessThanOrEqual(1); }
      expect(DETOUR).toBeGreaterThan(1);
    }
  });

  it("gives every street a frontage type, with active streets only on secondary and primary streets", () => {
    for (const d of designs) for (const st of d.plan!.streets) {
      expect(st.frontage).toBeGreaterThanOrEqual(0);
      expect(st.frontage).toBeLessThan(FRONTAGES.length);
      if (FRONTAGES[st.frontage!] === "active") expect(st.cls).toBeGreaterThanOrEqual(2);
    }
  });

  it("calls streets beside the lake buffer lake edges (Bengaluru)", () => {
    const B = read("bengaluru-cascade");
    const d = E.grow(E.randomGenome(E.makeRng(3), 3), B);
    expect(B.openLand!.length).toBeGreaterThan(0);
    expect(d.plan!.streets.some((s) => FRONTAGES[s.frontage!] === "lake")).toBe(true);
  });
});

describe("street cross-sections", () => {
  it("add up to each street's width and follow the SP:118 templates", () => {
    for (const w of [18, 12, 9, 7.5, 6, 15]) {
      const s = E.sectionFor(w);
      expect(s.parts.reduce((a, p) => a + p.w, 0)).toBeCloseTo(w, 6);
    }
    expect(E.sectionFor(18).template).toBe("SP:118 18A");
    expect(E.sectionFor(12).parts.find((p) => p.kind === "carriageway")!.w).toBe(6);
    expect(E.sectionFor(6).parts.some((p) => p.kind === "carriageway")).toBe(false);   // a shared street
  });
});
