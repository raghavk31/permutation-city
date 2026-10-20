// Breeds buildings off the main thread (Comlink), apart from the urban run's worker, so one
// can run while the other is open.
import * as Comlink from "comlink";
import { prepare, withSkeleton } from "../ground.js";
import type { Ground, SiteExport } from "../types.js";
import type { RepKind } from "./context.js";
import { evolveMassing, type MassRun } from "./evolve.js";
import type { MassScores } from "./scores.js";
import { prepareBlock, type MassRequest } from "./setup.js";
import type { Repair } from "./voxels.js";

let G: Ground | null = null;

export interface MassKept {
  name: string; genome: unknown; parents: string[]; rank: number; scores: MassScores; floor: number;
  repairs: Repair[]; rejected: string | null;
}
export interface MassResult { kind: RepKind; history: MassRun["history"]; everyone: number; ms: number; kept: MassKept[] }

const api = {
  setSite(site: SiteExport, off: number[] = []) {
    G = off.length ? withSkeleton(site, prepare(site), new Set(off)) : prepare(site);
  },
  evolve(req: MassRequest, onProgress?: (gen: number, row: MassRun["history"][number]) => void): MassResult {
    if (!G) throw new Error("no site loaded");
    const { ctx } = prepareBlock(G, req);
    const run = evolveMassing(ctx, {
      kind: req.kind, population: req.population, generations: req.generations, seed: req.seed,
      onGeneration: (gen, r) => onProgress?.(gen, r.history[r.history.length - 1]),
    });
    return {
      kind: run.kind, history: run.history, everyone: run.everyone, ms: run.ms,
      kept: run.pop.map((p) => ({ name: p.name, genome: p.genome, parents: p.parents, rank: p.rank, scores: p.scores,
        floor: p.floor, repairs: p.massing.repairs, rejected: p.massing.rejected })),
    };
  },
};

export type MassWorker = typeof api;
Comlink.expose(api);
