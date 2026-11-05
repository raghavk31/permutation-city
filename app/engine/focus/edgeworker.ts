// The search for a river's edge, off the main thread (docs/architecture-v3.md section 15.9, step E5). It
// takes about 12 s, so the page sends the place and gets the options back.
import * as Comlink from "comlink";
import { readEdge } from "./edge.js";
import { type EdgeOption, searchEdge } from "./edgesearch.js";
import type { Place } from "./place.js";
import { Walk } from "./walk.js";

const api = {
  search(place: Place, released: Uint8Array | null, seed = 1): EdgeOption[] {
    return searchEdge(place, readEdge(place, released), new Walk(place.streets.map((s) => s.pts)), seed);
  },
};
export type EdgeWorker = typeof api;

if (typeof self !== "undefined" && "postMessage" in self && typeof (self as unknown as { document?: unknown }).document === "undefined") Comlink.expose(api);
