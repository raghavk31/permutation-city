// Runs evolution off the main thread, so the page stays responsive. Called through Comlink.
import * as Comlink from "comlink";
import { mapElites, type ArchiveInfo, type EliteOptions } from "./elites.js";
import { evolve, frontFamilies, type EvolveOptions, type HistoryRow, type Search } from "./evolve.js";
import { stats } from "./genome.js";
import { prepare } from "./ground.js";
import type { Ground, Scores, SiteExport } from "./types.js";

let G: Ground | null = null;

export interface FamilyLead { name: string; size: number; genome: number[]; parents: string[] }
/** A design the run kept (the final population, or MAP-Elites' archive), for the Explore plots. */
export interface Kept {
  name: string; genome: number[]; parents: string[]; rank: number; scores: Scores;
  floorArea: number; levels: number; cell?: number; quality?: number;
}
export interface EvolveResult {
  history: HistoryRow[]; everyone: number; frontSize: number; families: FamilyLead[]; kept: Kept[];
  archive: ArchiveInfo | null;
}
export type RunRequest = Omit<EvolveOptions, "progress" | "search"> & Omit<EliteOptions, "progress"> & {
  search?: Search | "map-elites";
};

const api = {
  setSite(site: SiteExport) {
    G = prepare(site);
  },
  evolve({ search = "nsga2", axes, bins, weights, ...options }: RunRequest,
    onProgress?: (gen: number, row: HistoryRow) => void): EvolveResult {
    if (!G) throw new Error("no site loaded");
    const g = G;
    const progress = (gen: number, r: { history: HistoryRow[] }) => onProgress?.(gen, r.history[r.history.length - 1]);
    const run = search === "map-elites"
      ? mapElites(g, { ...options, axes, bins, weights, progress })
      : { ...evolve(g, { ...options, search, progress }), archive: null };
    // Send back genomes; the page regrows the designs it draws (fast, and identical).
    return {
      history: run.history,
      everyone: run.everyone,
      frontSize: run.pop.filter((i) => i.rank === 1).length,
      families: frontFamilies(run).map((f) => ({
        name: f.lead.name, size: f.members.length, genome: f.lead.design.genome, parents: f.lead.parents,
      })),
      kept: run.pop.map((i) => {
        const st = stats(i.design, g);
        return {
          name: i.name, genome: i.design.genome, parents: i.parents, rank: i.rank, scores: i.design.scores!,
          floorArea: st.floor_area_ha, levels: st.mean_levels, cell: i.cell, quality: i.quality,
        };
      }),
      archive: run.archive,
    };
  },
};

export type EngineWorker = typeof api;
Comlink.expose(api);
