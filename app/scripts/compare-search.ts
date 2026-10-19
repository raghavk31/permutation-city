// NSGA-II, NSGA-III and MAP-Elites on the same site, seeds and budget: front quality,
// diversity and run time. Feeds docs/experiments/search-comparison.md.
//   npm run compare -- [site] [seeds]        (in app/; default mumbai-ewf, 5 seeds)
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  binOf, DESCRIPTORS, evolve, frontFamilies, mapElites, paretoRanks, prepare, QUALITY_RANGE, SCORES, SCORE_KEYS,
  TARGET_TOLERANCE, makeRng, type Design, type Ground, type Individual, type Run, type SiteExport,
} from "../engine";

const [siteId = "mumbai-ewf", nSeeds = "5"] = process.argv.slice(2);
const site: SiteExport = JSON.parse(readFileSync(join(import.meta.dirname, "..", "public", "sites", `${siteId}.json`), "utf8"));
const G = prepare(site);
const SEARCHES = ["nsga2", "nsga3", "map-elites"] as const;
type Search = (typeof SEARCHES)[number];

/** Scores scaled 0..1 with 1 the good end (the MAP-Elites quality ranges), for hypervolume. */
const unit = (d: Design) => SCORE_KEYS.map((k) => {
  const [lo, hi] = QUALITY_RANGE[k];
  const t = Math.min(Math.max((d.scores![k] - lo) / (hi - lo), 0), 1);
  return SCORES[k][2] ? t : 1 - t;
});

// Hypervolume by Monte Carlo: the share of the unit box (worst corner at 0) that some design
// on the front dominates. The same sample points for every run, so runs compare fairly.
const SAMPLES = (() => {
  const r = makeRng(2024);
  return Array.from({ length: 100_000 }, () => SCORE_KEYS.map(() => r.random()));
})();
function hypervolume(pts: number[][]): number {
  let hit = 0;
  for (const s of SAMPLES) if (pts.some((p) => p.every((v, k) => v >= s[k]))) hit++;
  return hit / SAMPLES.length;
}

/** Cells of a 10 × 10 grid over two traits that on-brief designs reach. */
function coverage(ds: Design[], x: string, y: string, bins = 10): number {
  const [ax, ay] = [DESCRIPTORS[x], DESCRIPTORS[y]];
  return new Set(ds.map((d) => binOf(ay.value(d, G), ay.range, bins) * bins + binOf(ax.value(d, G), ax.range, bins))).size;
}

/** Mean distance between genomes (0..1 per gene, averaged over genes). */
function spread(ds: Design[]): number {
  let s = 0, n = 0;
  for (let i = 0; i < ds.length; i++) for (let j = i + 1; j < ds.length; j++) {
    const a = ds[i].genome, b = ds[j].genome;
    let d = 0;
    for (let k = 0; k < a.length; k++) d += Math.abs(a[k] - b[k]);
    s += d / a.length; n++;
  }
  return n ? s / n : 0;
}

const nondominated = (inds: Individual[]) => {
  const on = inds.filter((i) => i.design.scores!.gap <= TARGET_TOLERANCE);
  const r = paretoRanks(on.map((i) => i.design.scores!));
  return on.filter((_, k) => r[k] === 1);
};

interface Row { search: Search; seed: number; secs: number; grown: number; onBrief: number; front: number; families: number;
  hv: number; share: number; levelsOpen: number; storageVariety: number; spread: number; best: Record<string, number> }

const rows: Row[] = [];
for (let seed = 1; seed <= +nSeeds; seed++) {
  const fronts = new Map<Search, Individual[]>();
  for (const search of SEARCHES) {
    const t = performance.now();
    const run: Run = search === "map-elites" ? mapElites(G, { seed }) : evolve(G, { seed, search });
    const secs = (performance.now() - t) / 1000;
    const front = nondominated(run.pop);
    const on = run.pop.filter((i) => i.design.scores!.gap <= TARGET_TOLERANCE).map((i) => i.design);
    fronts.set(search, front);
    rows.push({
      search, seed, secs, grown: run.everyone, onBrief: on.length, front: front.length,
      families: frontFamilies({ ...run, pop: run.pop.map((i) => ({ ...i, rank: front.includes(i) ? 1 : 2 })) }).length,
      hv: hypervolume(front.map((i) => unit(i.design))), share: 0,
      levelsOpen: coverage(on, "mean_levels", "open_share"), storageVariety: coverage(on, "storage", "height_variety"),
      spread: spread(on),
      best: Object.fromEntries(SCORE_KEYS.map((k) => {
        const v = front.map((i) => i.design.scores![k]);
        return [k, SCORES[k][2] ? Math.max(...v) : Math.min(...v)];
      })),
    });
    process.stderr.write(`seed ${seed} ${search}: ${secs.toFixed(1)} s\n`);
  }
  // Pool the three fronts: what share of the joint front does each search supply?
  const all = SEARCHES.flatMap((s) => fronts.get(s)!.map((i) => ({ s, i })));
  const r = paretoRanks(all.map((x) => x.i.design.scores!));
  const joint = all.filter((_, k) => r[k] === 1);
  for (const row of rows.filter((x) => x.seed === seed)) row.share = joint.filter((x) => x.s === row.search).length / joint.length;
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sd = (xs: number[]) => { const m = mean(xs); return Math.sqrt(mean(xs.map((x) => (x - m) ** 2))); };
const cols: [string, (r: Row) => number, number][] = [
  ["run time (s)", (r) => r.secs, 1], ["designs grown", (r) => r.grown, 0], ["kept, on brief", (r) => r.onBrief, 0],
  ["on the front", (r) => r.front, 0], ["families on the front", (r) => r.families, 0],
  ["hypervolume (%)", (r) => r.hv * 100, 1], ["share of the joint front (%)", (r) => r.share * 100, 0],
  ["cells: storeys × open ground", (r) => r.levelsOpen, 0], ["cells: storage × height variety", (r) => r.storageVariety, 0],
  ["genome spread", (r) => r.spread, 3],
  ...SCORE_KEYS.map((k): [string, (r: Row) => number, number] => [`best ${SCORES[k][0]}`, (r) => r.best[k], k === "carbon" ? 1 : 3]),
];
console.log(`${site.meta.name}, ${nSeeds} seeds, 30 generations of 60 (MAP-Elites: storeys × open ground, 10 × 10)\n`);
console.log(`| | ${SEARCHES.join(" | ")} |\n|---|${SEARCHES.map(() => "---:").join("|")}|`);
for (const [label, f, dp] of cols) {
  const cells = SEARCHES.map((s) => {
    const xs = rows.filter((r) => r.search === s).map(f);
    return `${mean(xs).toFixed(dp)} ± ${sd(xs).toFixed(dp)}`;
  });
  console.log(`| ${label} | ${cells.join(" | ")} |`);
}
