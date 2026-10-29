// The typology library (docs/typologies.md): every precedent's seed builds, its figures cite a
// source it has, and the grammar's measures are sane.
import { describe, expect, test } from "vitest";
import { build } from "../app/engine/typology/grammar.js";
import { LIBRARY } from "../app/engine/typology/library.js";

describe("typology library", () => {
  test("ids are unique", () => {
    expect(new Set(LIBRARY.map((p) => p.id)).size).toBe(LIBRARY.length);
  });

  test.each(LIBRARY.map((p) => [p.id, p] as const))("%s builds and cites its sources", (_, p) => {
    const b = build(p.seed);
    expect(b.solids.length).toBeGreaterThan(0);
    for (const s of b.solids) for (const [x, y] of s.ring) expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
    expect(b.fsi).toBeGreaterThanOrEqual(0);
    expect(b.gsi).toBeLessThanOrEqual(1.0001);
    for (const f of p.figures) if (f.src != null) expect(p.sources[f.src], `${p.id}: ${f.what}`).toBeDefined();
    expect(p.sources.length).toBeGreaterThan(0);
  });

  test("a Chengqi Lou ring has 72 rooms on its outer ring", () => {
    const p = LIBRARY.find((x) => x.id === "tulou")!;
    const outer = build(p.seed).solids.filter((s) => s.storeys === p.seed.storeys);
    expect(outer.length).toBe(72);
  });
});
