// The workbench's saved runs (app/ui/workbench/saved.ts): links that breed a run again, and
// files that hold the result, both in the classic page's format.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as E from "../../app/engine";
import type { EvolveResult } from "../../app/engine/worker";
import * as Runs from "../../app/ui/runs";
import * as Saved from "../../app/ui/workbench/saved";

const site: E.SiteExport = JSON.parse(readFileSync(join(__dirname, "..", "..", "app", "public", "sites", "mumbai-docks.json"), "utf8"));
const own = site.rules!;
// one rule's limits changed, as the Rules step would
const k = own.list.findIndex((r) => r.limits && Object.keys(r.limits).length);
const edited: E.RuleSet = { ...own, list: own.list.map((r, i) => (i === k ? { ...r, limits: { ...r.limits, unsealed: 0.55 } } : r)) };
const inputs: Saved.RunInputs = {
  settings: { search: "map-elites", generations: 9, pop: 25, seed: 4242 }, rules: edited, brief: null,
  off: [3, 11], geneLocks: { coverage: 0.4127, local_spacing: 94.25 },
  moves: [
    { id: 1, kind: "street", pts: [[10.5, 20.1], [250.3, 40.7]], cls: 2 },
    { id: 2, kind: "spine", pts: [[0, 0], [100, 0], [100, 80]], width: 24 },
    { id: 3, kind: "plaza", pts: [[0, 0], [40, 0], [40, 40], [0, 40]] },
    { id: 4, kind: "nobuild", pts: [[-50, -50], [-10, -50], [-30, -10]] },
  ],
};

describe("workbench links", () => {
  it("round-trips a run's inputs, the design open and the pen", () => {
    const text = Saved.writeLink({ site: "mumbai-docks", base: own, step: "explore", rules: null, brief: null, moves: [],
      run: inputs, sel: "G9.03", keep: ["G9.03", "G4.11"] });
    const back = Saved.readLink(new URLSearchParams(text.slice(1)), site);
    expect(back.run).toEqual(inputs);
    expect(back.rules).toEqual(edited);
    expect(back.step).toBe("explore");
    expect(back.sel).toBe("G9.03");
    expect(back.keep).toEqual(["G9.03", "G4.11"]);
    expect(back.notes).toEqual([]);
  });
  it("without a run, keeps the site's rules as edited and no run", () => {
    const text = Saved.writeLink({ site: "mumbai-docks", base: own, step: "rules", rules: edited, brief: null, moves: [], run: null, sel: "x", keep: ["x"] });
    const q = new URLSearchParams(text.slice(1));
    expect(q.has("seed")).toBe(false);
    expect(q.has("sel")).toBe(false);
    const back = Saved.readLink(q, site);
    expect(back.run).toBeNull();
    expect(back.rules).toEqual(edited);
  });
  it("carries moves drawn before a run, a kept building by its index", () => {
    const ring = site.context.buildings!.ground!.rings[5];
    const keep: E.Move = { id: 5, kind: "keep", building: 5, pts: Array.from({ length: ring.length / 2 }, (_, i): [number, number] => [ring[2 * i], ring[2 * i + 1]]) };
    const moves = [...inputs.moves, keep];
    const text = Saved.writeLink({ site: "mumbai-docks", base: own, step: "draw", rules: null, brief: null, moves, run: null, sel: null, keep: [] });
    expect(Saved.readLink(new URLSearchParams(text.slice(1)), site).moves).toEqual(moves);
    expect(() => Saved.readLink(new URLSearchParams("site=mumbai-docks&moves=bm90IGpzb24"), site)).toThrow(/moves drawn in this link/);
  });
  it("reads a classic link, noting what the workbench can't do", () => {
    const q = Runs.writeLink(new URLSearchParams({ site: "mumbai-docks" }), {
      settings: { search: "nsga3", gens: 5, pop: 20, seed: 7, objectives: ["legibility"], axes: null, bins: null, shock: null },
      off: [], locks: null, pen: 0, genomeVersion: E.GENOME_VERSION, build: null,
    });
    const back = Saved.readLink(q, site);
    expect(back.run!.settings).toEqual({ search: "auto", generations: 5, pop: 20, seed: 7 });
    expect(back.notes.length).toBe(2);
  });
  it("refuses unknown genes and older genomes with a sentence", () => {
    expect(() => Saved.readLink(new URLSearchParams("site=mumbai-docks&seed=1&gv=3&genes=wings:0.5"), site)).toThrow(/gene "wings"/);
    expect(() => Saved.readLink(new URLSearchParams("site=mumbai-docks&seed=1&gv=2"), site)).toThrow(/classic page/);
  });
});

describe("workbench run files", () => {
  const L = E.LENGTH_V3;
  const genome = (v: number) => Array.from({ length: L }, (_, i) => ((i * 7 + v * 13) % 100) / 100);
  const scores = { storage: 0.8, heat: 2.1, carbon: 400, daylight: 0.6, human: 0.7, gap: 0 } as unknown as E.Scores;
  const result: EvolveResult = {
    history: [], everyone: 60, frontSize: 2, archive: null,
    families: [{ name: "G2.01", size: 2, genome: genome(1), parents: [], design: {} as E.Design }],
    kept: [
      { name: "G2.01", genome: genome(1), parents: [], rank: 1, scores, floorArea: 1, levels: 4, metrics: { legibility: NaN } as unknown as E.Metrics },
      { name: "G2.02", genome: genome(2), parents: ["G2.01"], rank: 1, scores, floorArea: 1, levels: 5, metrics: {} as E.Metrics },
    ],
    lineage: [
      { name: "G2.01", gen: 2, parents: [], how: "first", scores: [] } as unknown as E.LineageNode,
      { name: "G2.02", gen: 2, parents: ["G2.01"], how: "bred", scores: [] } as unknown as E.LineageNode,
    ],
    genomes: Float64Array.from([...genome(1), ...genome(2)]),
  };

  it("round-trips the inputs, the result, the pen and the design open", () => {
    const text = Saved.toFile({ site: { id: "mumbai-docks", name: "Mumbai Docks" }, base: own, run: inputs, ranges: E.DEFAULT_RANGES,
      result, pen: [{ name: "G2.02", genome: genome(2), title: "Design 2" }], sel: "G2.02", step: "massing" });
    const f = Saved.readFile(text);
    expect(f.siteId).toBe("mumbai-docks");
    expect(f.run).toEqual({ settings: inputs.settings, off: inputs.off, geneLocks: inputs.geneLocks });
    expect(f.rulesText).toBeTruthy();
    expect(Saved.decodeMoves(f.movesText!, site)).toEqual(inputs.moves);
    expect(f.result!.kept.map((x) => x.name)).toEqual(["G2.01", "G2.02"]);
    expect(Number.isNaN(f.result!.kept[0].metrics.legibility)).toBe(true);
    expect(Array.from(f.result!.genomes)).toEqual(Array.from(result.genomes));
    expect(f.result!.families[0]).not.toHaveProperty("design");
    expect(f.pen.map((p) => p.name)).toEqual(["G2.02"]);
    expect(f.sel).toBe("G2.02");
    expect(f.step).toBe("massing");
  });
  it("opens on the classic page's reader too", () => {
    const text = Saved.toFile({ site: { id: "mumbai-docks", name: "Mumbai Docks" }, base: own, run: inputs, ranges: E.DEFAULT_RANGES,
      result, pen: [], sel: null, step: "explore" });
    const s = Runs.readSaved(text);
    expect(s.settings!.seed).toBe(4242);
    expect(s.result!.lineage.length).toBe(2);
  });
});
