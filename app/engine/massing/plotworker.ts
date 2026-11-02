// One plot's search off the main thread (architecture-v3 section 13, B5; the /build page).
// The page sends the plot and the brief; this builds the envelope, runs searchPlot and sends
// back what the page draws: each distinct design's scores, its source (precedent, drift,
// masses, ponds and trees) and the climate's challenges. The page rebuilds the same envelope
// from the same plot for the 3D view.
import * as Comlink from "comlink";
import type { Need } from "../typology/challenges.js";
import type { Where } from "./scores.js";
import { plotEnvelope, type PlotSpec } from "./plot.js";
import { searchPlot } from "./plotsearch.js";
import type { PlotBrief, Source } from "./precedent.js";
import type { Repair } from "./voxels.js";

export interface PlotDesign {
  name: string; rank: number; floor: number; scores: Record<string, number>; source: Source; repairs: Repair[];
}
export interface PlotCandidateView { id: string; name: string; place: string; fit: number; answers: string[]; against: string[] }
export interface PlotResult {
  needs: Need[]; candidates: PlotCandidateView[]; designs: PlotDesign[]; note: string[]; hybrids: boolean;
  objectives: [string, boolean][]; ms: number; history: { gen: number; front: number; valid: number }[];
}

export function runPlot(spec: PlotSpec, where: Where, brief: PlotBrief, opts: { population: number; generations: number; seed: number },
  onProgress?: (gen: number, of: number) => void): PlotResult {
  const E = plotEnvelope(spec), t0 = performance.now();
  const S = searchPlot(E, where, brief, { ...opts, onGeneration: (gen) => onProgress?.(gen, opts.generations) });
  // one card per distinct design: best rank first, then nearest the floor wanted
  const seen = new Set<string>(), designs: PlotDesign[] = [];
  for (const p of [...S.run.pop].sort((a, b) => a.rank - b.rank || a.scores.gap - b.scores.gap)) {
    const s = p.massing.source;
    if (p.massing.rejected || !s) continue;
    const key = `${s.precedent}|${s.donor ?? ""}|${JSON.stringify(s.params)}|${s.storeys}|${s.keep.toFixed(2)}|${s.nature?.water.length}|${s.nature?.trees.length}|${s.nature?.green.toFixed(2)}|${s.nature?.eave}|${s.nature?.porosity}`;
    if (seen.has(key)) continue;
    seen.add(key);
    designs.push({ name: p.name, rank: p.rank, floor: p.floor, scores: { ...(p.scores as unknown as Record<string, number>) }, source: s, repairs: p.massing.repairs });
  }
  return {
    needs: S.needs,
    candidates: S.candidates.map((c) => ({ id: c.p.id, name: c.p.name, place: c.p.place, fit: c.answer.fit, answers: c.answer.answers, against: c.answer.against })),
    designs, note: [...E.note, ...S.note], hybrids: S.hybrids, objectives: S.objectives as [string, boolean][],
    ms: performance.now() - t0, history: S.run.history.map((h) => ({ gen: h.gen, front: h.front, valid: h.valid })),
  };
}

const api = {
  run(spec: PlotSpec, where: Where, brief: PlotBrief, opts: { population: number; generations: number; seed: number },
    onProgress?: (gen: number, of: number) => void): PlotResult {
    return runPlot(spec, where, brief, opts, onProgress);
  },
};

export type PlotWorker = typeof api;
if (typeof self !== "undefined" && "postMessage" in self && typeof (self as unknown as { document?: unknown }).document === "undefined") Comlink.expose(api);
