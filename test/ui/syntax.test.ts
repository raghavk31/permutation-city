// Space syntax (app/engine/syntax.ts, metrics/syntax.ts): what it promises beyond parity with
// Python (test/parity checks the engines agree segment by segment).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_RANGES, grow, makeRng, measure, network as netOf, prepare, randomGenome, type SiteExport } from "../../app/engine";
import { legibilityParts } from "../../app/engine/metrics/syntax";
import {
  analyse, dual, integrationRn, integrationRnCondensed, nach, nain, network, simplify, syntaxOf, TURN_UNITS, type Network,
} from "../../app/engine/syntax";

const load = (id: string): SiteExport =>
  JSON.parse(readFileSync(join(__dirname, "..", "..", "app", "public", "sites", `${id}.json`), "utf8"));
const docks = load("mumbai-docks"), G = prepare(docks);
const design = grow(randomGenome(makeRng(7)), G, null, DEFAULT_RANGES);

/** A network from points and segments (index pairs). */
function net(pts: [number, number][], segs: [number, number][]): Network {
  const len = Float64Array.from(segs, ([a, b]) => Math.hypot(pts[b][0] - pts[a][0], pts[b][1] - pts[a][1]));
  return { vx: Float64Array.from(pts, (p) => p[0]), vy: Float64Array.from(pts, (p) => p[1]),
    a: Int32Array.from(segs, (s) => s[0]), b: Int32Array.from(segs, (s) => s[1]), len, site: segs.length, links: 0 };
}

describe("geometry", () => {
  it("straightens a hex zigzag and keeps a real bend", () => {
    // A zigzag of hex sides (20 m hexes) along x, then a turn north.
    const xs = [0, 17.3, 34.6, 52, 69.3, 69.3, 69.3], ys = [0, 10, 0, 10, 0, 40, 80];
    const keep = simplify(xs, ys, 15);
    expect(keep).toEqual([0, 4, 6]);
  });
  it("costs a straight run nothing, a right angle 1 and a U-turn 2, in TURN_UNITS", () => {
    const N = net([[0, 0], [10, 0], [20, 0], [10, 10]], [[0, 1], [1, 2], [1, 3]]);
    const D = dual(N), cost = (s: number, t: number) => {
      for (let e = D.start[s]; e < D.start[s + 1]; e++) if (D.to[e] === t) return D.cost[e];
      return -1;
    };
    expect(cost(0, 1)).toBe(0);
    expect(cost(0, 2)).toBe(TURN_UNITS);
    expect(cost(1, 2)).toBe(TURN_UNITS);
  });
});

describe("analysis", () => {
  // A cross: four arms of 50 m meeting at the origin, each arm one segment.
  const cross = net([[0, 0], [50, 0], [-50, 0], [0, 50], [0, -50]], [[0, 1], [0, 2], [0, 3], [0, 4]]);
  const Dc = dual(cross);
  it("gives depth and choice a person can check by hand", () => {
    const r = analyse(cross, Dc, Infinity, [0, 1, 2, 3]);
    // From an arm: the opposite arm is straight on (0), the other two a right angle (1 each).
    expect(r.nc[0]).toBe(3);
    expect(r.td[0]).toBe(2);
    // No segment lies between two others on a least-angle path: every arm meets every other directly.
    expect(Array.from(r.ch)).toEqual([0, 0, 0, 0]);
    expect(nain(3, 2)).toBeCloseTo(Math.pow(3, 1.2) / 4, 12);
    expect(nach(0, 2)).toBe(0);
  });
  it("counts a middle segment's choice on a line", () => {
    const line = net([[0, 0], [10, 0], [20, 0], [30, 0]], [[0, 1], [1, 2], [2, 3]]);
    const r = analyse(line, dual(line), Infinity, [0, 1, 2]);
    expect(r.ch[1]).toBe(2);   // 0 to 2 and 2 to 0 pass through it (the page halves this: one pair)
    expect(r.ch[0]).toBe(0);
  });
  it("limits reach by metric radius, from middle to middle", () => {
    const line = net([[0, 0], [100, 0], [200, 0], [300, 0]], [[0, 1], [1, 2], [2, 3]]);
    expect(analyse(line, dual(line), 150, [0]).nc[0]).toBe(1);
    expect(analyse(line, dual(line), 200, [0]).nc[0]).toBe(2);
  });
  it("gives the same Rn integration from the bucket queue as from the heap", () => {
    const N = network(design, G), D = dual(N), origins = Int32Array.from({ length: 40 }, (_, k) => Math.floor((k * N.site) / 40));
    const a = analyse(N, D, Infinity, origins), b = integrationRn(N, D, origins);
    for (const o of origins) { expect(b.nc[o]).toBe(a.nc[o]); expect(b.td[o]).toBe(a.td[o]); }
  });
});

describe("the network", () => {
  const N = network(design, G);
  it("joins the design's streets to the city round it, and drops existing streets over the design ground", () => {
    expect(N.site).toBeGreaterThan(100);
    expect(N.links).toBeGreaterThan(10);
    expect(N.a.length - N.site - N.links).toBeLessThan(docks.syntax!.segments.length);
  });
  it("reads streets on cell edges as streets: most junctions have a near-straight way through", () => {
    // On hex edges a street zigzags 30° either way and junctions are Y-shaped; strokes undo that.
    for (const H of [G, prepare(load("ahmedabad-wadaj")), prepare(load("ahmedabad-wadaj-quad"))]) {
      const d = grow(randomGenome(makeRng(7)), H, null, DEFAULT_RANGES), M = network(d, H);
      const at: number[][] = Array.from({ length: M.vx.length }, () => []);
      for (let s = 0; s < M.site; s++) { at[M.a[s]].push(s); at[M.b[s]].push(s); }
      const turn = (v: number, s: number, t: number) => {
        const p = M.a[s] === v ? M.b[s] : M.a[s], q = M.a[t] === v ? M.b[t] : M.a[t];
        const ux = M.vx[v] - M.vx[p], uy = M.vy[v] - M.vy[p], wx = M.vx[q] - M.vx[v], wy = M.vy[q] - M.vy[v];
        return (Math.atan2(Math.abs(ux * wy - uy * wx), ux * wx + uy * wy) * 180) / Math.PI;
      };
      let straight = 0, junctions = 0;
      at.forEach((ss, v) => {
        if (ss.length < 3) return;
        junctions++;
        let best = 180;
        for (const s of ss) for (const t of ss) if (s !== t) best = Math.min(best, turn(v, s, t));
        if (best <= 20) straight++;
      });
      expect(straight / junctions).toBeGreaterThan(0.7);
    }
  });
  it("has no segment of zero length", () => {
    for (let s = 0; s < N.a.length; s++) expect(N.len[s]).toBeGreaterThan(0);
  });
});

describe("the run's estimate", () => {
  it("tracks exact Rn integration closely (the condensed network)", () => {
    const N = network(design, G), D = dual(N);
    const site = Int32Array.from({ length: N.site }, (_, k) => k);
    const ex = integrationRn(N, D, site), es = integrationRnCondensed(N, D, G);
    const a = Array.from(site, (s) => nain(ex.nc[s], ex.td[s])), b = Array.from(site, (s) => nain(es.nc[s], es.td[s]));
    const ma = a.reduce((x, y) => x + y) / a.length, mb = b.reduce((x, y) => x + y) / b.length;
    let sab = 0, saa = 0, sbb = 0;
    a.forEach((v, k) => { sab += (v - ma) * (b[k] - mb); saa += (v - ma) ** 2; sbb += (b[k] - mb) ** 2; });
    expect(sab / Math.sqrt(saa * sbb)).toBeGreaterThan(0.95);
    // It counts the whole network, as the exact analysis does.
    for (const s of site) expect(Math.abs(es.nc[s] - ex.nc[s])).toBeLessThanOrEqual(1);
  });
  it("is used only when asked for, and the exact values are kept apart", () => {
    const d = grow(randomGenome(makeRng(8)), G, null, DEFAULT_RANGES);
    const est = syntaxOf(d, G, true), exact = syntaxOf(d, G);
    expect(est.estimate).toBe(true);
    expect(exact.estimate).toBe(false);
    expect(exact.local[0].nach).not.toBeNull();
    expect(est.local[0].nach).toBeNull();
  });
});

describe("legibility", () => {
  it("is the mean of its three parts, each between 0 and 1", () => {
    const p = legibilityParts(netOf(design, G));
    for (const v of [p.centres, p.landmarks, p.legibility]) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1); }
    expect(p.legibility).toBeCloseTo((Math.max(0, p.intelligibility) + p.centres + p.landmarks) / 3, 12);
    expect(p.core.length).toBeGreaterThan(0);
    expect(measure(design, G, ["legibility"]).legibility).toBeCloseTo(p.legibility, 12);
  });
});
