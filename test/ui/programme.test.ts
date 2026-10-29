// Programme before buildings (app/engine/plan/programme.ts): the norms' arithmetic, and a grown
// plan's programme: every building plot labelled, facilities placed where their rules say,
// and bus stops covering the homes.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as E from "../../app/engine";
import { FACILITIES, facilityCounts, PROGRAMMES, STOP_WALK_M, stpLand } from "../../app/engine/plan/programme";
import { centroid, dist } from "../../app/engine/plan/geom";

const load = (id: string) => E.prepare(JSON.parse(readFileSync(join(__dirname, "..", "..", "app", "public", "sites", `${id}.json`), "utf8")));
const P = (k: string) => PROGRAMMES.indexOf(k as (typeof PROGRAMMES)[number]);

describe("norms", () => {
  it("sizes the sewage plant from URDPFI Table 8.35", () => {
    expect(stpLand(10)).toBeCloseTo(1900, 6);
    expect(stpLand(7.5)).toBeCloseTo(1450, 6);
    expect(stpLand(0)).toBe(0);
  });
  it("needs a facility once per its population served, none below half of one", () => {
    const n = facilityCounts(20000), at = (k: string) => n[FACILITIES.findIndex((f) => f.key === k)];
    expect(at("primary")).toBe(4);            // 5,000 a school
    expect(at("secondary")).toBe(3);          // 7,500: 2.67
    expect(at("dispensary")).toBe(1);         // 15,000: 1.33
    expect(at("hospital")).toBe(0);           // 1 lakh: 0.2
    expect(facilityCounts(60000)[FACILITIES.findIndex((f) => f.key === "hospital")]).toBe(1);
  });
});

describe("a grown plan's programme", () => {
  const G = load("mumbai-docks");
  const d = E.grow(E.randomGenome(E.makeRng(11), 3.1), G), plan = d.plan!, pr = plan.programme!;
  it("labels every building plot, and only those", () => {
    plan.plots.forEach((p, k) => expect(pr.plot[k] >= 0).toBe(p.use === 1));
    expect(pr.plot.filter((v) => v === P("homes")).length).toBeGreaterThan(pr.plot.filter((v) => v > 0).length);
  });
  it("counts people from the homes' floor", () => {
    expect(pr.people).toBeGreaterThan(1000);
    expect(pr.water.mld).toBeGreaterThan(0);
  });
  it("places each facility's plots in one block, near its anchor", () => {
    for (const f of pr.placed) {
      const blocks = new Set(f.plots.map((k) => plan.plots[k].block));
      expect(blocks.size).toBeLessThanOrEqual(1);
      // the last plot taken may overshoot the need by up to one plot
      expect(f.land).toBeLessThan(f.need * 0.9 + 3000);
    }
  });
  it("keeps schools away from industry", () => {
    const ind = pr.placed.filter((f) => f.kind === -3).map((f) => f.at);
    const schools = pr.placed.filter((f) => f.kind >= 0 && FACILITIES[f.kind].programme === "education").map((f) => f.at);
    if (!ind.length || !schools.length) return;
    const nearest = schools.map((s) => Math.min(...ind.map((q) => dist(q, s))));
    expect(Math.max(...nearest)).toBeGreaterThan(100);
  });
  it("puts most homes within a walk of a bus stop", () => {
    expect(pr.stops.length).toBeGreaterThan(0);
    expect(pr.stopAccess).toBeGreaterThan(0.8);
    const homes = plan.plots.filter((_, k) => pr.plot[k] === P("homes")).map((p) => centroid(p.ring));
    const near = homes.filter((h) => pr.stops.some((s) => dist(s, h) <= STOP_WALK_M)).length;
    expect(near / homes.length).toBeGreaterThan(0.7);
  });
  it("is the same for the same genome", () => {
    const again = E.grow(Array.from(d.genome), G).plan!.programme!;
    expect(again.plot).toEqual(pr.plot);
  });
});
