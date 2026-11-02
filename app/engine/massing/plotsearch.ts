// One plot's search (architecture-v3 section 13, B3): the candidates by the climate's
// challenges, a run of single precedents, and hybrids only when none reaches the floor wanted.
// Apart from precedent.ts so that file and evolve.ts don't import each other.
import { TARGET_TOLERANCE } from "../config.js";
import type { Need } from "../typology/challenges.js";
import { massContext, type MassContext } from "./context.js";
import type { Envelope } from "./envelope.js";
import { evolveMassing, type MassOptions, type MassRun } from "./evolve.js";
import { frontOf, plotChoices, type PlotBrief, type PlotCandidate } from "./precedent.js";
import type { Where } from "./scores.js";
import type { Objective } from "../rank.js";
import { PLOT_SCORES, plotScores, type PlotScoreKey } from "./plotnature.js";

export interface PlotSearch { needs: Need[]; candidates: PlotCandidate[]; run: MassRun; hybrids: boolean; note: string[]; objectives: Objective[] }

/** One plot's search: the candidates, a run of single precedents, and, when none reaches the
 *  floor wanted within TARGET_TOLERANCE, a second run that allows hybrids, started from the
 *  first run's population. */
export function searchPlot(E: Envelope, where: Where, brief: PlotBrief, opts: Omit<MassOptions, "kind"> = {}): PlotSearch {
  const { needs: ns, candidates } = plotChoices(brief, E.land ?? [], E.plots[0]?.capLevels ?? 1);
  const note: string[] = [];
  // ranked on street shade, sky, wind and the plot's own scores; winter sun only where cold
  // matters, sun taken only when there are neighbours (eight objectives make nearly every
  // design "best at something")
  const cold = ns.find((n) => n.key === "cold")?.weight ?? 0;
  const objectives: Objective[] = [["shade", true], ["sky", true], ["wind", false], ...(Object.keys(PLOT_SCORES) as PlotScoreKey[]).map((k): Objective => [k, true]),
    ...(cold > 0.3 ? [["sun", true] as Objective] : []), ...(E.neighbours.length ? [["neighbours", false] as Objective] : [])];
  const ctx: MassContext = {
    ...massContext(E, where), candidates, front: frontOf(E), needs: ns, objectives,
    extra: (m) => (m.source?.nature ? plotScores(E, m.occ, m.source.nature, ns, where) : {}),
  };
  if (!candidates.length) note.push("no precedent for this programme fits the plot");
  let run = evolveMassing(ctx, { ...opts, kind: "precedent" });
  const reached = run.pop.some((p) => !p.massing.rejected && p.scores.gap <= TARGET_TOLERANCE);
  let hybrids = false;
  if (!reached && candidates.length > 1) {
    hybrids = true;
    note.push(`no single precedent came within ${Math.round(TARGET_TOLERANCE * 100)}% of the floor wanted: hybrids allowed`);
    const start = run.pop.map((p) => p.genome as number[]);
    run = evolveMassing({ ...ctx, hybrids: true, start }, { ...opts, kind: "precedent", seed: (opts.seed ?? 1) + 1 });
  }
  return { needs: ns, candidates, run, hybrids, note, objectives };
}
