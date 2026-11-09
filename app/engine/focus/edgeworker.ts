// The search for a river's edge, off the main thread (docs/architecture-v3.md section 15.9, step E5). It
// takes about 12 s, so the page sends the place and gets the options back.
import * as Comlink from "comlink";
import { type EdgeRead, readEdge } from "./edge.js";
import type { EdgeDesign } from "./edgedesign.js";
import type { Works } from "./edgeform.js";
import { type Alternative, alternativesFor, type EdgeOption, searchAround, searchEdge, type Values } from "./edgesearch.js";
import type { Place } from "./place.js";
import { Walk } from "./walk.js";

let held: { place: Place; read: EdgeRead; walk: Walk } | null = null;
const here = () => { if (!held) throw new Error("No place set."); return held; };

const api = {
  /** The place to work on, read once: the page changes it when a decision changes the ground. */
  setPlace(place: Place, released: Uint8Array | null) { held = { place, read: readEdge(place, released), walk: new Walk(place.streets.map((s) => s.pts)) }; },
  search(seed = 1): EdgeOption[] { const h = here(); return searchEdge(h.place, h.read, h.walk, seed); },
  around(ask: { design: EdgeDesign | null; locked: string[]; values: Values; works: Works }): EdgeDesign { const h = here(); return searchAround(h.place, h.read, h.walk, ask); },
  alternatives(bankId: number, stretchId: string, works: Works): Alternative[] { const h = here(); return alternativesFor(h.place, h.read, h.walk, bankId, stretchId, works); },
};
export type EdgeWorker = typeof api;

if (typeof self !== "undefined" && "postMessage" in self && typeof (self as unknown as { document?: unknown }).document === "undefined") Comlink.expose(api);
