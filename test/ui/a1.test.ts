// A1: dissolving cells into regions (app/ui/draw.ts) and choosing representatives (app/ui/families.ts).
import { describe, expect, it } from "vitest";
import { corners, type Design } from "../../app/engine";
import { inset, regions } from "../../app/ui/draw";
import { apart, representatives } from "../../app/ui/families";

const hex = corners({ type: "hex", size: 20 });
const W = Math.sqrt(3) * 20; // centre to centre along a row

/** A row-offset hex patch, `rows` × `cols`, centres in metres. */
function patch(rows: number, cols: number) {
  const xs: number[] = [], ys: number[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { xs.push(c * W + (r % 2) * W / 2); ys.push(r * 30); }
  return { xs, ys };
}
const area = (loop: [number, number][]) => loop.reduce((s, [x, y], k) => s + x * loop[(k + 1) % loop.length][1] - loop[(k + 1) % loop.length][0] * y, 0) / 2;

describe("regions", () => {
  it("dissolves cells of one colour into one outline, wound anticlockwise", () => {
    const { xs, ys } = patch(4, 5);
    const r = regions(xs, ys, xs.map(() => "a"), hex);
    expect(r.get("a")!.length).toBe(1);
    expect(area(r.get("a")![0])).toBeGreaterThan(0);
  });
  it("gives each colour its own regions, and a hole its own clockwise outline", () => {
    const { xs, ys } = patch(5, 5);
    const centre = 12; // the middle cell
    const r = regions(xs, ys, xs.map((_, i) => (i === centre ? "b" : "a")), hex);
    const loops = r.get("a")!;
    expect(loops.length).toBe(2);
    expect(loops.filter((l) => area(l) < 0).length).toBe(1); // the hole
    expect(r.get("b")!.length).toBe(1);
  });
  it("matches corners that differ by float noise", () => {
    const { xs, ys } = patch(3, 4);
    const noisy = xs.map((x, i) => x + (i % 2 ? 0.07 : -0.06));
    expect(regions(noisy, ys, xs.map(() => "a"), hex).get("a")!.length).toBe(1);
  });
  it("splits a region along cut sides (a street between buildings)", () => {
    const { xs, ys } = patch(1, 4);
    // Cut the side between cell 1 and cell 2: side k of a cell runs from corner k to k + 1;
    // corners 5 and 0 (330° and 30°) bound the side facing east.
    const r = regions(xs, ys, xs.map(() => "a"), hex, 2, (i, k) => i === 1 && k === 5);
    expect(r.get("a")!.length).toBe(2);
  });
  it("insets outlines towards what they enclose, and drops parts too thin to keep", () => {
    const { xs, ys } = patch(4, 5);
    const loop = regions(xs, ys, xs.map(() => "a"), hex).get("a")![0];
    const smaller = inset(loop, 3)!;
    expect(area(smaller)).toBeLessThan(area(loop));
    expect(area(smaller)).toBeGreaterThan(0);
    const one = regions([0], [0], ["a"], hex).get("a")![0];
    expect(inset(one, 30)).toBeNull();
  });
});

describe("representatives", () => {
  const design = (use: number[], scores: Record<string, number>, levels = 3) =>
    ({ use: Int8Array.from(use), levels: Int32Array.from(use.map(() => levels)), coverage: new Float64Array(use.length),
      floorArea: Float64Array.from(use.map(() => 1000)), scores } as unknown as Design);
  const s = (storage: number) => ({ storage, heat: 1, carbon: 400, daylight: 0.8, human: 0.6, gap: 0.05 });
  const items = [
    { design: design([1, 1, 1, 1], s(1)) },
    { design: design([1, 1, 1, 2], s(1.1)) },   // close to the first
    { design: design([1, 2, 3, 3], s(2)) },     // far from both (every design has a building, all 3 storeys)
    { design: design([3, 3, 3, 1], s(0.5)) },
  ];
  it("starts from the first and takes the most distinct next", () => {
    const reps = representatives(items, 2);
    expect(reps.map((r) => items.indexOf(r.item))).toEqual([0, 2]);
    expect(reps.reduce((n, r) => n + r.members.length, 0)).toBe(items.length);
  });
  it("names each by what sets it apart, each phrase once", () => {
    const G = { n: 4, cellArea: 1000 } as never;
    const labels = apart(items.map((i) => i.design), G);
    expect(labels[2]).toBe("most flood storage");
    expect(new Set(labels.filter((l) => l !== "a balance of the scores")).size)
      .toBe(labels.filter((l) => l !== "a balance of the scores").length);
  });
});
