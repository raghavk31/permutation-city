// Streets traced through cells don't snake (smoothTrace, snakesPerKm in app/engine/plan/geom.ts).
// Every site in app/public/sites/sites.json is checked, so a new site is held to it too.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as E from "../../app/engine";
import { length, smoothTrace, snakesPerKm, type Line } from "../../app/engine/plan/geom";
import { skeletonLines } from "../../app/engine/plan/ground";

const dir = join(__dirname, "..", "..", "app", "public", "sites");
const load = (id: string) => E.prepare(JSON.parse(readFileSync(join(dir, `${id}.json`), "utf8")));
const ids = Object.keys(JSON.parse(readFileSync(join(dir, "sites.json"), "utf8")));
const long = (ls: Line[]) => ls.filter((l) => length(l) >= 100);
const snaking = (ls: Line[]) => long(ls).filter((l) => snakesPerKm(l) > 0).length;

describe("smoothTrace", () => {
  it("takes a hex zigzag down to a straight line and keeps the ends", () => {
    const zig: Line = Array.from({ length: 30 }, (_, k) => [k * 17.3, k % 2 ? 10 : 0]);
    expect(snakesPerKm(zig)).toBeGreaterThan(10);
    const s = smoothTrace(zig, 1.25 * 34.6);
    expect(snakesPerKm(s)).toBe(0);
    expect(s[0]).toEqual(zig[0]);
    expect(s[s.length - 1]).toEqual(zig[zig.length - 1]);
    expect(Math.max(...s.map((p) => Math.abs(p[1] - 5)))).toBeLessThan(6);
  });

  it("keeps a real bend", () => {
    const bend: Line = [...Array.from({ length: 20 }, (_, k): [number, number] => [k * 10, 0]),
      ...Array.from({ length: 20 }, (_, k): [number, number] => [190, (k + 1) * 10])];
    const s = smoothTrace(bend, 40);
    expect(Math.hypot(s[s.length - 1][0] - 190, s[s.length - 1][1] - 200)).toBeLessThan(1e-6);
    expect(s.some((p) => p[0] > 150 && p[1] > 20 && p[1] < 60)).toBe(true);
  });
});

describe.each(ids)("streets on %s", (id) => {
  it("skeleton lines never snake; routes and local streets rarely do", () => {
    const G = load(id);
    expect(snaking(skeletonLines(G).map((l) => l.points))).toBe(0);
    const routes: Line[] = [], locals: Line[] = [];
    for (let k = 0; k < 2; k++) {
      const d = E.grow(E.randomGenome(E.makeRng(21 + k), 3), G);
      for (const st of d.plan!.streets) (st.cls === 2 ? routes : st.cls === 1 ? locals : []).push(st.pts as Line);
    }
    // A few mild bend pairs come from junction repairs and from contours that really wind.
    expect(snaking(routes)).toBeLessThanOrEqual(Math.max(2, 0.1 * long(routes).length));
    expect(snaking(locals)).toBeLessThanOrEqual(0.05 * long(locals).length);
  }, 60_000);
});
