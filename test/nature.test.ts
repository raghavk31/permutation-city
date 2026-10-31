// Nature's rules (engine/typology/nature.ts): ids unique, figures cite a source the gene has,
// numeric ranges are ordered, and every gene has a diagram that draws.
import { describe, expect, test } from "vitest";
import { GENES } from "../app/engine/typology/nature.js";
import { drawGene, hasDiagram } from "../app/ui/diagrams/nature.js";

describe("nature's rules", () => {
  test("ids are unique", () => {
    expect(new Set(GENES.map((g) => g.id)).size).toBe(GENES.length);
  });

  test.each(GENES.map((g) => [g.id, g] as const))("%s cites its sources, orders its ranges and draws", (_, g) => {
    for (const f of g.figures) if (f.src != null) expect(g.sources[f.src], `${g.id}: ${f.what}`).toBeDefined();
    for (const r of [g.natural, g.built]) {
      if (r.src != null) expect(g.sources[r.src], `${g.id}: ${r.what}`).toBeDefined();
      if (r.lo != null && r.hi != null) expect(r.lo).toBeLessThanOrEqual(r.hi);
    }
    expect(g.sources.length).toBeGreaterThan(0);
    expect(hasDiagram(g.id)).toBe(true);
    const svg = drawGene(g.id, g.name);
    expect(svg).toMatch(/^<svg/);
    expect(svg).not.toMatch(/NaN|Infinity/);
  });
});
