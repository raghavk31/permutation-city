// Runs evolution off the main thread, so the page stays responsive. Called through Comlink.
import * as Comlink from "comlink";
import { evolve, frontFamilies, type EvolveOptions, type HistoryRow } from "./evolve";
import { prepare } from "./ground";
import type { Ground, SiteExport } from "./types";

let G: Ground | null = null;

export interface FamilyLead { name: string; size: number; genome: number[]; parents: string[] }
export interface EvolveResult { history: HistoryRow[]; everyone: number; frontSize: number; families: FamilyLead[] }

const api = {
  setSite(site: SiteExport) {
    G = prepare(site);
  },
  evolve(options: Omit<EvolveOptions, "progress">, onProgress?: (gen: number, row: HistoryRow) => void): EvolveResult {
    if (!G) throw new Error("no site loaded");
    const run = evolve(G, {
      ...options,
      progress: (gen, r) => onProgress?.(gen, r.history[r.history.length - 1]),
    });
    // Send back the family leads as genomes; the page regrows them (fast, and identical).
    return {
      history: run.history,
      everyone: run.everyone,
      frontSize: run.pop.filter((i) => i.rank === 1).length,
      families: frontFamilies(run).map((f) => ({
        name: f.lead.name, size: f.members.length, genome: f.lead.design.genome, parents: f.lead.parents,
      })),
    };
  },
};

export type EngineWorker = typeof api;
Comlink.expose(api);
