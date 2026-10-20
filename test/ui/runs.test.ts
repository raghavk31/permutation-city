// Saving and reloading runs (app/ui/runs.ts), and the lineage runs record for the family tree.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as E from "../../app/engine";
import * as Runs from "../../app/ui/runs";
import * as Tree from "../../app/ui/tree";

const site: E.SiteExport = JSON.parse(readFileSync(join(__dirname, "..", "..", "app", "public", "sites", "mumbai-docks.json"), "utf8"));
const G = E.prepare(site);

describe("run links", () => {
  const settings: Runs.RunSettings = {
    search: "nsga3", gens: 12, pop: 30, seed: 123456, objectives: ["legibility", "dh_enclosure"], axes: null, bins: null, shock: [6, 1.3],
  };
  it("round-trips settings, skeleton, locks and versions through the query string", () => {
    const locks = new Int8Array(G.n);
    locks.fill(3, 10, 40); locks.fill(2, 500, 520); locks[G.n - 1] = 1;
    const q = Runs.writeLink(new URLSearchParams({ site: "mumbai-docks", rules: "abc" }), {
      settings, off: [4, 17], locks, pen: 2, genomeVersion: E.GENOME_VERSION, build: "1234abc",
    });
    expect(q.get("site")).toBe("mumbai-docks");
    expect(q.get("rules")).toBe("abc");
    const back = Runs.readLink(new URLSearchParams(q.toString()), G.n)!;
    expect(back.settings).toEqual(settings);
    expect(back.off).toEqual([4, 17]);
    expect(Array.from(back.locks!)).toEqual(Array.from(locks));
    expect(back.pen).toBe(2);
    expect(back.genomeVersion).toBe(E.GENOME_VERSION);
    expect(back.build).toBe("1234abc");
    expect(q.toString().length).toBeLessThan(400);
  });
  it("is null without a seed, and refuses what it doesn't know", () => {
    expect(Runs.readLink(new URLSearchParams("site=x"), G.n)).toBeNull();
    expect(() => Runs.readLink(new URLSearchParams("seed=1&obj=nonsense"), G.n)).toThrow(/metric/);
    expect(() => Runs.readLink(new URLSearchParams("seed=1&search=sa"), G.n)).toThrow(/search/);
    expect(() => Runs.readLink(new URLSearchParams("seed=1&pop=3"), G.n)).toThrow(/population/);
    expect(() => Runs.readLink(new URLSearchParams("seed=1&locks=1z"), 10)).toThrow(/different site/);
  });
  it("keeps MAP-Elites' traits", () => {
    const s = { ...settings, search: "map-elites" as const, objectives: [], axes: ["mean_levels", "open_share"] as [string, string], bins: 8, shock: null };
    const q = Runs.writeLink(new URLSearchParams(), { settings: s, off: [], locks: null, pen: 0, genomeVersion: 2, build: null });
    expect(Runs.readLink(q, G.n)!.settings).toEqual(s);
  });
  it("says when a link comes from an older genome or another build", () => {
    expect(Runs.versionNotes(1, null)[0]).toMatch(/genome version 1/);
    expect(Runs.versionNotes(E.GENOME_VERSION, null)).toEqual([]);
  });
});

describe("run files", () => {
  it("packs genomes exactly", () => {
    const a = Float64Array.from([0, 1, 0.1, 1 / 3, Math.PI / 4, 0.999999999999]);
    expect(Array.from(Runs.base64ToF64(Runs.f64ToBase64(a)))).toEqual(Array.from(a));
  });
  it("reads a saved run and refuses broken ones", () => {
    const g = E.randomGenome(E.makeRng(1));
    const saved: Runs.SavedRun = {
      format: Runs.RUN_FORMAT, version: 1, build: "dev", genomeVersion: 2, saved: "2026-10-20T00:00:00Z",
      site: { id: "mumbai-docks", name: "Docks", rules: null, brief: null }, off: [], locks: null, lockNote: [],
      pen: [{ name: "R1", genome: g }], children: [], brood: 1, settings: null, start: null, typologySeeds: 0, ranges: null,
      result: null, selected: null, heights: null,
    };
    expect(Runs.readSaved(JSON.stringify(saved)).pen[0].genome).toEqual(g);
    expect(() => Runs.readSaved("{")).toThrow(/JSON/);
    expect(() => Runs.readSaved(JSON.stringify({ ...saved, format: "x" }))).toThrow(/saved Permutation City run/);
    expect(() => Runs.readSaved(JSON.stringify({ ...saved, pen: [{ name: "x", genome: [2] }] }))).toThrow(/pen/);
    // A 47-number genome (before streets) still loads.
    expect(() => Runs.readSaved(JSON.stringify({ ...saved, pen: [{ name: "old", genome: g.slice(0, E.PRE_STREET_LENGTH) }] }))).not.toThrow();
  });
});

describe("lineage", () => {
  const run = E.evolve(G, { generations: 4, pop: 12, seed: 5 });
  it("records every design once, with parents made before it", () => {
    expect(run.lineage.length).toBe(run.everyone);
    expect(run.genomes.length).toBe(run.everyone);
    const at = new Map(run.lineage.map((n, k) => [n.name, k]));
    expect(at.size).toBe(run.everyone);
    run.lineage.forEach((n, k) => {
      if (n.how === "bred") {
        for (const p of n.parents) expect(at.get(p)!).toBeLessThan(k);
        expect(n.fromA).toBeGreaterThanOrEqual(0);
        expect(n.fromA).toBeLessThanOrEqual(1);
        expect(n.mutated).toBeGreaterThanOrEqual(0);
      } else expect(n.parents.length).toBeLessThanOrEqual(1);
      expect(run.genomes[k]).toHaveLength(E.LENGTH);
    });
    for (const i of run.pop) expect(at.has(i.name)).toBe(true);
  });
  it("is the same for the same seed, and doesn't change the run", () => {
    const again = E.evolve(G, { generations: 4, pop: 12, seed: 5 });
    expect(again.lineage).toEqual(run.lineage);
    expect(again.history).toEqual(run.history);
  });
  it("lays out the tree: survivors and ancestors by default, every design on request", () => {
    const kept = new Set(run.pop.map((i) => i.name)), front = new Set(run.pop.filter((i) => i.rank === 1).map((i) => i.name));
    const few = Tree.layoutTree(run.lineage, kept, front, false), all = Tree.layoutTree(run.lineage, kept, front, true);
    expect(all.placed.length).toBe(run.everyone);
    expect(few.placed.length + few.hidden.reduce((s, v) => s + v, 0)).toBe(run.everyone);
    expect(few.placed.filter((p) => p.role === "front").length).toBe(front.size);
    expect(few.placed.filter((p) => p.role === "kept" || p.role === "front").length).toBe(kept.size);
    expect(few.placed.some((p) => p.role === "dead")).toBe(false);
    for (const L of [few, all]) {
      for (const [p, c, share] of L.edges) {
        expect(L.placed[p].gen).toBeLessThan(L.placed[c].gen);
        expect(share).toBeGreaterThanOrEqual(0); expect(share).toBeLessThanOrEqual(1);
      }
      for (const row of L.rows) {
        const xs = row.map((i) => L.placed[i].x);
        expect(xs).toEqual([...xs].sort((a, b) => a - b));
        for (const x of xs) { expect(x).toBeGreaterThan(0); expect(x).toBeLessThan(1); }
      }
    }
    // A kept design's ancestry reaches Generation 0 (or a newcomer).
    const last = few.rows[few.generations - 1][0], anc = Tree.ancestry(few, last);
    expect([...anc].some((i) => few.placed[i].gen === 0 || run.lineage[few.placed[i].k].how === "immigrant")).toBe(true);
  });
  it("records MAP-Elites' designs too", () => {
    const m = E.mapElites(G, { generations: 2, pop: 10, seed: 3, bins: 4 });
    expect(m.lineage.length).toBe(m.everyone);
  });
});
