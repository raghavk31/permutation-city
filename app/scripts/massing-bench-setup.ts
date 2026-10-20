// The urban design and block each building-scale bench fixture starts from (massing-bench.ts).
import { readFileSync } from "node:fs";
import * as E from "../engine/index.js";
import * as M from "../engine/massing/index.js";

export const BENCH_SITES = ["ahmedabad-wadaj", "bengaluru-cascade", "mumbai-docks-quad"];
export const KINDS = ["typology", "field", "cppn"] as const;

/** A random urban design for a site, and its block a third of the way down by size (0.3 ha or more). */
export function benchSetup(id: string, dir = "public/sites"): M.MassSetup & { site: string } {
  const site = JSON.parse(readFileSync(`${dir}/${id}.json`, "utf8"));
  const G = E.prepare(site);
  const genome = E.randomGenome(E.makeRng(7));
  const d = E.grow(genome, G, null, E.DEFAULT_RANGES);
  const blocks = M.blocksOf(d, G).filter((b) => b.ha >= 0.3).sort((a, b) => b.ha - a.ha || a.id - b.id);
  return { site: id, genome, locks: null, ranges: E.DEFAULT_RANGES, block: blocks[Math.floor(blocks.length / 3)].id };
}
