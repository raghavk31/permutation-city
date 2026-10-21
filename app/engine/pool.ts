// A pool of workers that grow and score designs in parallel (version 3 designs take about
// 0.1 to 0.3 s each). The run itself stays in one place (evolve.ts evolveAsync); only each
// generation's batch is shared out. Growing is pure, so the run is the same with any number
// of workers. Designs come back without their vector plan, which is regrown when one is shown.
import * as Comlink from "comlink";
import type { Ranges } from "./config.js";
import type { MetricKey, Metrics } from "./metrics/index.js";
import type { Design, SiteExport } from "./types.js";

export interface GrowerApi {
  setSite(site: SiteExport, off: number[]): void;
  grow(genomes: number[][], o: { storm: number; ranges: Ranges; locked: number[] | null; objectives: MetricKey[] }): Design[];
  /** Designs grown and scored whole, their plan included (the ones the page draws). */
  whole(genomes: number[][], o: { storm: number; ranges: Ranges; locked: number[] | null; objectives: MetricKey[] }): Design[];
  /** Every form metric but space syntax, for designs regrown whole (their plan included). */
  measure(genomes: number[][], o: { ranges: Ranges; locked: number[] | null }): Metrics[];
}

/** A design without its plan, for sending between workers. */
export function slim(d: Design): Design {
  const { plan, ...rest } = d;
  void plan;
  return rest;
}

export class Pool {
  private workers: { raw: Worker; api: Comlink.Remote<GrowerApi> }[] = [];
  constructor(size: number, site: SiteExport, off: number[]) {
    for (let k = 0; k < size; k++) {
      const raw = new Worker(new URL("./grower.ts", import.meta.url), { type: "module" });
      const api = Comlink.wrap<GrowerApi>(raw);
      api.setSite(site, off);
      this.workers.push({ raw, api });
    }
  }
  get size() { return this.workers.length; }
  /** Grow and score genomes, shared out in contiguous runs, back in order. */
  async grow(genomes: number[][], o: Parameters<GrowerApi["grow"]>[1]): Promise<Design[]> {
    const n = this.workers.length, per = Math.ceil(genomes.length / n);
    const parts = await Promise.all(this.workers.map((w, k) => {
      const slice = genomes.slice(k * per, (k + 1) * per);
      return slice.length ? w.api.grow(slice, o) : Promise.resolve([] as Design[]);
    }));
    return parts.flat();
  }
  async whole(genomes: number[][], o: Parameters<GrowerApi["whole"]>[1]): Promise<Design[]> {
    const n = this.workers.length, per = Math.ceil(genomes.length / n);
    const parts = await Promise.all(this.workers.map((w, k) => {
      const slice = genomes.slice(k * per, (k + 1) * per);
      return slice.length ? w.api.whole(slice, o) : Promise.resolve([] as Design[]);
    }));
    return parts.flat();
  }
  async measure(genomes: number[][], o: Parameters<GrowerApi["measure"]>[1]): Promise<Metrics[]> {
    const n = this.workers.length, per = Math.ceil(genomes.length / n);
    const parts = await Promise.all(this.workers.map((w, k) => {
      const slice = genomes.slice(k * per, (k + 1) * per);
      return slice.length ? w.api.measure(slice, o) : Promise.resolve([] as Metrics[]);
    }));
    return parts.flat();
  }
  terminate() { for (const w of this.workers) w.raw.terminate(); this.workers = []; }
}

/** How many workers to use: the machine's cores less one (the page), at least 1, at most 8. */
export const poolSize = () => Math.max(1, Math.min(8, ((globalThis.navigator?.hardwareConcurrency ?? 4) - 1)));
