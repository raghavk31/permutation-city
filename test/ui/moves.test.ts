// Moves drawn before a run (app/engine/moves.ts): evolution keeps every one, and a move on
// ground the rules never build on is a conflict.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as E from "../../app/engine";
import { BUILDING, LANDSCAPE } from "../../app/engine/config";
import { toSegment, type Line, type Pt } from "../../app/engine/plan/geom";
import { FORBIDDEN, OPEN } from "../../app/engine/rules";

const read = (id: string): E.SiteExport =>
  JSON.parse(readFileSync(join(__dirname, "..", "..", "app", "public", "sites", `${id}.json`), "utf8"));
const square = ([x, y]: Pt, r: number): Line => [[x - r, y - r], [x + r, y - r], [x + r, y + r], [x - r, y + r]];

describe("moves on the Bengaluru tank cascade", () => {
  const site = read("bengaluru-cascade"), g = site.grid, D = site.design;
  const at = (i: number): Pt => [g.x[i], g.y[i]];
  // an open grid cell whose neighbours within 60 m are open too, for areas that sit cleanly
  const openCell = (skip: Pt[] = []) => {
    for (let i = 0; i < g.x.length; i++) {
      if (g.state[i] !== OPEN || skip.some((p) => Math.hypot(p[0] - g.x[i], p[1] - g.y[i]) < 300)) continue;
      let ok = true;
      for (let j = 0; j < g.x.length && ok; j++) if (Math.hypot(g.x[j] - g.x[i], g.y[j] - g.y[i]) < 60 && g.state[j] !== OPEN) ok = false;
      if (ok) return i;
    }
    throw new Error("no open cell");
  };
  const genome = E.randomGenome(E.makeRng(7), 3);

  it("changes nothing without moves", () => {
    const m = E.applyMoves(site, [], g.state, g.reasons);
    expect(m.site).toBe(site);
    const a = E.grow(genome, E.prepare(site)), b = E.grow(genome, E.prepare(m.site));
    expect(Array.from(b.use)).toEqual(Array.from(a.use));
    expect(b.plan!.streets.length).toBe(a.plan!.streets.length);
  });

  it("keeps a plaza unbuilt and a spine green, with no conflict on open ground", () => {
    const p = at(openCell()), s0 = at(openCell([p]));
    const spine: Line = [s0, [s0[0] + 200, s0[1]]];
    const moves: E.Move[] = [{ id: 1, kind: "plaza", pts: square(p, 40) }, { id: 2, kind: "spine", pts: spine, width: 30 }];
    const m = E.applyMoves(site, moves, g.state, g.reasons);
    const plaza = m.cells.get(1)!, green = m.cells.get(2)!;
    expect(plaza.length).toBeGreaterThan(0);
    expect(green.length).toBeGreaterThan(0);
    const d = E.grow(genome, E.prepare(m.site));
    for (const k of plaza) expect(d.use[k]).toBe(0);
    for (const k of green) expect(d.use[k]).toBe(LANDSCAPE);
    // conflicts only for spine cells over never-built ground, which a spine may cover
    expect(m.conflicts.filter((c) => c.move === 1)).toEqual([]);
  });

  it("builds nothing in a no-build zone", () => {
    const p = at(openCell());
    const m = E.applyMoves(site, [{ id: 1, kind: "nobuild", pts: square(p, 50) }], g.state, g.reasons);
    const d = E.grow(genome, E.prepare(m.site));
    for (const k of m.cells.get(1)!) expect(d.use[k]).not.toBe(BUILDING);
    expect(m.conflicts).toEqual([]);
  });

  it("lays a drawn main street in the plan", () => {
    // across the design ground, between two of its cells 500-700 m apart
    const a = 0, pa: Pt = [D.x[a], D.y[a]];
    let b = -1;
    for (let k = 0; k < D.x.length && b < 0; k++) { const r = Math.hypot(D.x[k] - pa[0], D.y[k] - pa[1]); if (r > 500 && r < 700) b = k; }
    const line: Line = [pa, [D.x[b], D.y[b]]];
    const m = E.applyMoves(site, [{ id: 1, kind: "street", pts: line, cls: 3 }], g.state, g.reasons);
    const d = E.grow(genome, E.prepare(m.site));
    const mid: Pt = [(line[0][0] + line[1][0]) / 2, (line[0][1] + line[1][1]) / 2];
    const near = d.plan!.streets.filter((s) => s.cls === 3).some((s) => {
      for (let k = 1; k < s.pts.length; k++) if (toSegment(mid, s.pts[k - 1], s.pts[k]).d < 5) return true;
      return false;
    });
    expect(near).toBe(true);
  });
});

describe("conflicts on Guwahati's steep ground", () => {
  const site = read("guwahati-bharalu"), g = site.grid;
  const steep = g.x.findIndex((_, i) => g.state[i] === FORBIDDEN && /steep/.test(g.reasons[i]));
  const never = new Set(site.rules!.list.filter((r) => r.kind === "forbidden").map((r) => r.name));

  it("blocks a plaza on ground the rules never build on, and says why", () => {
    const m = E.applyMoves(site, [{ id: 3, kind: "plaza", pts: square([g.x[steep], g.y[steep]], 30) }], g.state, g.reasons, never);
    expect(m.conflicts.length).toBeGreaterThan(0);
    expect(m.conflicts[0].move).toBe(3);
    expect(m.conflicts[0].text).toMatch(/never build on/);
    expect(m.conflicts[0].text).toMatch(/steep/);
  });

  it("lets a green spine and a no-build zone cover it", () => {
    const p: Pt = [g.x[steep], g.y[steep]];
    const m = E.applyMoves(site, [
      { id: 1, kind: "nobuild", pts: square(p, 30) },
      { id: 2, kind: "spine", pts: [p, [p[0] + 100, p[1]]], width: 20 },
    ], g.state, g.reasons);
    expect(m.conflicts).toEqual([]);
  });
});
