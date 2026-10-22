// Streets on cell edges and the landform skeleton (app/engine/streets.ts, ground.ts): what they
// promise beyond parity with Python (test/parity checks the engines agree on whole runs).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  applyRules, BUILDING, grow, LENGTH, makeRng, measure, prepare, prepareFromRules, PRE_STREET_LENGTH, randomGenome,
  withSkeleton, type Ground, type Settings, type SiteExport,
} from "../../app/engine";
import { sides, streets } from "../../app/engine/streets";

const load = (id: string): SiteExport =>
  JSON.parse(readFileSync(join(__dirname, "..", "..", "app", "public", "sites", `${id}.json`), "utf8"));
const wadaj = load("ahmedabad-wadaj"), docks = load("mumbai-docks");

describe("sides", () => {
  for (const [name, site] of [["hex", wadaj], ["quad", load("ahmedabad-wadaj-quad")]] as const) {
    it(`gives every cell a side in every direction, shared with its neighbour (${name})`, () => {
      const G = prepare(site), sd = sides(G), D = G.deg;
      for (let i = 0; i < G.n; i++) for (let a = 0; a < D; a++) {
        const s = sd.at[i * D + a];
        expect(s).toBeGreaterThanOrEqual(0);
        expect(sd.cell[s] === i || sd.other[s] === i).toBe(true);
      }
      // Neighbours share a side, and its two ends.
      const j = sd.other.findIndex((o) => o >= 0);
      expect(sd.v0[j]).not.toBe(sd.v1[j]);
      // A hex corner joins at most three sides (T and Y junctions only); a square's four.
      const deg = new Int32Array(sd.vx.length);
      for (let s = 0; s < sd.cell.length; s++) { deg[sd.v0[s]]++; deg[sd.v1[s]]++; }
      expect(Math.max(...deg)).toBe(name === "hex" ? 3 : 4);
    });
  }
});

describe("streets", () => {
  const G = prepare(wadaj), sd = sides(G), rng = makeRng(8);
  const designs = Array.from({ length: 6 }, () => grow(randomGenome(rng), G));

  it("keep the skeleton, at its own class", () => {
    expect(G.skeleton!.source).toBe("landform");
    for (const d of designs) G.skeleton!.sides.forEach((s, k) => expect(d.street![s]).toBeGreaterThanOrEqual(G.skeleton!.level[k]));
  });

  it("never run along a valley corridor, except where the skeleton crosses", () => {
    const crossing = new Set(G.skeleton!.sides);
    for (const d of designs) {
      for (let s = 0; s < sd.cell.length; s++) {
        if (!d.street![s] || sd.other[s] < 0 || crossing.has(s)) continue;
        expect(!!G.vbuf![sd.cell[s]] && !!G.vbuf![sd.other[s]]).toBe(false);
      }
    }
  });

  it("reach every block", () => {
    for (const d of designs) {
      // Blocks: cells joined across sides without streets; each touches a street or the edge.
      const seen = new Uint8Array(G.n), D = G.deg;
      for (let s0 = 0; s0 < G.n; s0++) {
        if (seen[s0] || d.use[s0] !== BUILDING) continue;
        const cells = [s0];
        seen[s0] = 1;
        let reached = false;
        for (let h = 0; h < cells.length; h++) {
          for (let a = 0; a < D; a++) {
            const s = sd.at[cells[h] * D + a], j = sd.other[s] === cells[h] ? sd.cell[s] : sd.other[s];
            if (j < 0 || d.street![s]) { reached = true; continue; }
            if (!seen[j]) { seen[j] = 1; cells.push(j); }
          }
        }
        expect(reached).toBe(true);
      }
    }
  });

  it("cost floor area: net is below gross, and no cell gives up more than 60%", () => {
    for (const d of designs) {
      const net = d.floorArea.reduce((a, b) => a + b, 0);
      expect(net).toBeLessThan(d.grossFloorArea!);
      expect(streets(G, d.settings as Settings).share.every((v) => v <= 0.6)).toBe(true);
    }
  });

  it("turn into a tree when the pattern gene says branching", () => {
    const g = randomGenome(makeRng(3)), at = (k: string) => LENGTH - 4 + ["street_spacing", "street_orientation",
      "street_pattern", "street_hierarchy"].indexOf(k);
    const grid = g.slice(), tree = g.slice();
    grid[at("street_pattern")] = 0.1; tree[at("street_pattern")] = 0.95;
    const mGrid = measure(grow(grid, G), G, ["dead_ends", "meshedness"]), mTree = measure(grow(tree, G), G, ["dead_ends", "meshedness"]);
    expect(mTree.dead_ends!).toBeGreaterThan(mGrid.dead_ends!);
  });
});

describe("genome versions", () => {
  it("grow a pre-street genome with the default street genes, and say so", () => {
    const G = prepare(docks), g = randomGenome(makeRng(1));
    const old = g.slice(0, PRE_STREET_LENGTH), d = grow(old, G);
    expect(d.preStreet).toBe(true);
    expect(d.genome).toHaveLength(LENGTH);
    expect(Array.from(d.use)).toEqual(Array.from(grow([...old, 0.5, 0.5, 0.5, 0.5], G).use));
    expect(grow(g, G).preStreet).toBeUndefined();
    expect(() => grow(g.slice(0, 30), G)).toThrow(/numbers/);
  });
});

describe("the skeleton", () => {
  it("is the same after the site's own rules are applied again in the browser", () => {
    const G = prepare(wadaj);
    const res = applyRules(wadaj.rules!, wadaj.grid.layers!, wadaj.grid.x.length);
    const H = prepareFromRules(wadaj, res);
    expect(Array.from(H.skeleton!.sides).sort((a, b) => a - b)).toEqual(Array.from(G.skeleton!.sides).sort((a, b) => a - b));
    expect(Array.from(H.down!)).toEqual(Array.from(G.down!));
  });

  it("loses a ridge's sides when it is switched off", () => {
    const G: Ground = prepare(wadaj), first = G.skeleton!.ridges[0].id;
    const H = withSkeleton(wadaj, G, new Set([first]));
    expect(H.skeleton!.sides.length).toBeLessThan(G.skeleton!.sides.length);
    expect(Array.from(H.skeleton!.ridge)).not.toContain(first);
  });

  it("comes from the existing roads on flat land, and says so", () => {
    const G = prepare(docks);
    expect(G.skeleton!.source).toBe("roads");
    expect(docks.skeleton!.note).toMatch(/not landform/);
  });
});
