// One worker of the pool (pool.ts): grows and scores the genomes it is given.
import * as Comlink from "comlink";
import { score } from "./evolve.js";
import { grow } from "./genome.js";
import { prepare, withSkeleton } from "./ground.js";
import { measure, METRIC_KEYS, SYNTAX_KEYS, type Metrics } from "./metrics/index.js";
import { slim, type GrowerApi } from "./pool.js";
import type { Ground } from "./types.js";

const NON_SYNTAX = METRIC_KEYS.filter((k) => !SYNTAX_KEYS.includes(k));

let G: Ground | null = null;

const api: GrowerApi = {
  setSite(site, off) {
    G = off.length ? withSkeleton(site, prepare(site), new Set(off)) : prepare(site);
  },
  grow(genomes, o) {
    if (!G) throw new Error("no site loaded");
    const locked = o.locked ? Int8Array.from(o.locked) : null;
    return genomes.map((g) => {
      const d = grow(g, G!, locked, o.ranges);
      score(d, G!, o.storm, o.objectives);
      return slim(d);
    });
  },
  whole(genomes, o) {
    if (!G) throw new Error("no site loaded");
    const locked = o.locked ? Int8Array.from(o.locked) : null;
    return genomes.map((g) => { const d = grow(g, G!, locked, o.ranges); score(d, G!, o.storm, o.objectives); return d; });
  },
  measure(genomes, o) {
    if (!G) throw new Error("no site loaded");
    const locked = o.locked ? Int8Array.from(o.locked) : null;
    return genomes.map((g) => measure(grow(g, G!, locked, o.ranges), G!, NON_SYNTAX) as Metrics);
  },
};

Comlink.expose(api);
