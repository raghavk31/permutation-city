// Downloads for a massing (app/ui/mass/exports.ts): OBJ and Rhino .3dm, read back. (glTF
// goes through three's exporter, which needs a browser; it was checked there.)
import { readFileSync } from "node:fs";
import { join } from "node:path";
import rhino3dm from "rhino3dm";
import { describe, expect, it } from "vitest";
import { DEFAULT_RANGES, grow, makeRng, prepare, randomGenome } from "../../app/engine";
import * as M from "../../app/engine/massing";
import { objText, rhinoBytes, type Part } from "../../app/ui/mass/exports";

const site = JSON.parse(readFileSync(join(__dirname, "..", "..", "app", "public", "sites", "ahmedabad-wadaj.json"), "utf8"));
const G = prepare(site);
const design = grow(randomGenome(makeRng(7)), G, null, DEFAULT_RANGES);
const block = M.blocksOf(design, G).filter((b) => b.ha >= 0.3).sort((a, b) => b.ha - a.ha || a.id - b.id)[0];
const { E, ctx } = M.prepareBlock(G, { genome: design.genome, locks: null, ranges: DEFAULT_RANGES, block: block.id });
const m = M.REPRESENTATIONS.typology.build(M.REPRESENTATIONS.typology.random(makeRng(2), ctx), ctx);
const mass = M.massingMesh(E, m), context = M.contextMesh(E, G, design);
const parts: Part[] = [{ name: "M1", layer: "massing", mesh: mass }, { name: "context", layer: "context", mesh: context }];
const groups = mass.groups.length + 1;

describe("exports", () => {
  it("writes an OBJ with an object per plot and the context, every face on real vertices", () => {
    const text = objText(parts), lines = text.split("\n");
    const v = lines.filter((l) => l.startsWith("v ")).length;
    const faces = lines.filter((l) => l.startsWith("f "));
    expect(lines.filter((l) => l.startsWith("o ")).length).toBe(groups);
    expect(faces.length).toBe((mass.indices.length + context.indices.length) / 3);
    for (const f of faces) for (const k of f.slice(2).split(" ").map(Number)) {
      expect(k).toBeGreaterThanOrEqual(1);
      expect(k).toBeLessThanOrEqual(v);
    }
  });
  it("writes a .3dm Rhino reads back: metres, two layers, a named mesh per plot", async () => {
    const rhino = await rhino3dm();
    const bytes = rhinoBytes(rhino, parts);
    const doc = rhino.File3dm.fromByteArray(bytes);
    expect(doc.settings().modelUnitSystem).toBe(rhino.UnitSystem.Meters);
    expect(doc.layers().count).toBe(2);
    expect(doc.objects().count).toBe(groups);
    const names = Array.from({ length: doc.objects().count }, (_, k) => doc.objects().get(k).attributes().name);
    expect(names).toContain("plot 1");
    expect(names).toContain("context");
    const faces = Array.from({ length: doc.objects().count }, (_, k) => (doc.objects().get(k).geometry() as any).faces().count)
      .reduce((s: number, n: number) => s + n, 0);
    expect(faces).toBe((mass.indices.length + context.indices.length) / 3);
  }, 60_000);
});
