// The story page's prepared run (scripts/story-prepare.ts): loaded once, and the designs the
// page shows regrown from their genomes on the site's ground. Nothing here evolves.
import * as E from "../../engine";

export interface StoryRun {
  site: string; seed: number; generations: number; pop: number; version: 3; made: string;
  everyone: number[][];   // [generation, storage, heat, carbon, daylight, human, gap]
  front: { name: string; genome: number[]; scores: E.Scores }[];
  chosen: string;
  growth: { year: number; share: number; genome: number[]; scores: E.Scores; wholeness: { before: number; after: number };
    penalty: number; conditions: E.Conditions }[];
}

export interface Prepared {
  run: StoryRun; site: E.SiteExport; G: E.Ground;
  chosen: E.Design;                       // the design built from the run (piecemeal.chooseBuilt)
}

/** The growth section's three plans: per step, the step's design with the fabric after it. */
export interface GrowthStep { year: number; design: E.Design; after: E.Fabric }

const pause = () => new Promise((r) => setTimeout(r, 0));

export async function load(id = "mumbai-ewf"): Promise<Prepared> {
  const [run, site] = await Promise.all([
    fetch(`${import.meta.env.BASE_URL}story/${id}.json`).then((r) => r.json() as Promise<StoryRun>),
    fetch(`${import.meta.env.BASE_URL}sites/${id}.json`).then((r) => r.json() as Promise<E.SiteExport>),
  ]);
  await pause();
  const G = E.prepare(site);
  await pause();   // let the page scroll between the long steps
  const pick = run.front.find((f) => f.name === run.chosen) ?? run.front[0];
  const chosen = E.grow(pick.genome, G);
  E.evaluate(chosen, G);
  return { run, site, G, chosen };
}

export function growth(p: Prepared): GrowthStep[] {
  const genomes = p.run.growth.map((x) => x.genome), shares = p.run.growth.map((x) => x.share);
  const fabrics = E.replayFabric(p.G, genomes, shares);
  return p.run.growth.map((x, k) => {
    const d = E.growIncrement(x.genome, p.G, fabrics[k], 0, false);
    const after = fabrics[k + 1];
    for (let i = 0; i < p.G.n; i++) if (after.built[i]) { d.use[i] = after.use[i]; d.levels[i] = after.levels[i]; d.coverage[i] = after.coverage[i]; }
    return { year: x.year, design: d, after };
  });
}
