// Saving and opening the workbench's runs. A link holds a run's inputs: the engine is
// deterministic, so the same site, rules, brief, ridges, locked genes, settings and run number
// breed the same designs again. A file holds the result as well, so it opens as it was, with
// no wait. Both use the classic page's format (ui/runs.ts), so links and files move between
// the two pages; the workbench adds its own keys (step, genes, sel, keep) that the classic
// page ignores.
import * as E from "../../engine";
import type { EvolveResult } from "../../engine/worker";
import * as Runs from "../runs";
import * as Sites from "../sites";

export type Search = "auto" | "map-elites";
export interface Settings { search: Search; generations: number; pop: number; seed: number }

/** What a run was bred from (rules null: the site's own; brief null: none confirmed). */
export interface RunInputs {
  settings: Settings; rules: E.RuleSet | null; brief: E.Brief | null;
  off: number[]; geneLocks: Record<string, number>;
}

/** Everything a link or file restores. */
export interface Restore {
  rules: E.RuleSet | null; brief: E.Brief | null; run: RunInputs | null;
  step: string | null; sel: string | null; keep: string[]; notes: string[];
}

const GENES = new Set<string>(E.GENES_V3);
const WB_KEYS = ["step", "genes", "sel", "keep"];

export function encodeGenes(locks: Record<string, number>): string {
  return Object.entries(locks).map(([g, v]) => `${g}:${v}`).join(",");
}

export function decodeGenes(text: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const pair of text.split(",").filter(Boolean)) {
    const [g, v] = pair.split(":");
    if (!GENES.has(g)) throw new Error(`The gene "${g}" in this link isn't one this page knows.`);
    const n = Number(v);
    if (!Number.isFinite(n)) throw new Error(`The locked value of "${g}" in this link can't be read.`);
    out[g] = n;
  }
  return out;
}

const classicSettings = (s: Settings): Runs.RunSettings =>
  ({ search: s.search, gens: s.generations, pop: s.pop, seed: s.seed, objectives: [], axes: null, bins: null, shock: null });

/** The query string for the workbench as it stands: the site, step, rules and brief; and when
 *  a run is done, the inputs it was bred from, the design open and the pen's designs. */
export function writeLink(o: {
  site: string; base: E.RuleSet | undefined; step: string; rules: E.RuleSet | null; brief: E.Brief | null;
  run: RunInputs | null; sel: string | null; keep: string[];
}): string {
  const rules = o.run ? o.run.rules : o.rules, brief = o.run ? o.run.brief : o.brief;
  const q = new URLSearchParams(Sites.query(o.site, rules, o.base, brief ? { brief, seeds: false } : null).slice(1));
  if (o.step !== "site") q.set("step", o.step);
  if (o.run) {
    Runs.writeLink(q, { settings: classicSettings(o.run.settings), off: o.run.off, locks: null, pen: 0,
      genomeVersion: E.GENOME_VERSION, build: Runs.BUILD });
    if (Object.keys(o.run.geneLocks).length) q.set("genes", encodeGenes(o.run.geneLocks));
    if (o.sel) q.set("sel", o.sel);
    if (o.keep.length) q.set("keep", o.keep.join(","));
  }
  return `?${q}`;
}

/** What a link asks for, on its site (whose own rules decode the edits). Throws with a
 *  sentence people can act on. */
export function readLink(q: URLSearchParams, site: E.SiteExport): Restore {
  const own = site.rules ?? null;
  const text = q.get("rules");
  const rules = text && own ? Sites.decodeRules(text, own) : null;
  const b = q.get("brief");
  const base = rules ?? own;
  const brief = b && base ? Sites.recheck(Sites.decodeBrief(b).brief, base).brief : null;
  const link = Runs.readLink(q, site.design.x.length);
  const notes: string[] = [];
  let run: RunInputs | null = null;
  if (link) {
    if (link.genomeVersion !== E.GENOME_VERSION) {
      throw new Error(`This run was bred with genome version ${link.genomeVersion}; open it on the classic page (/classic).`);
    }
    notes.push(...Runs.versionNotes(link.genomeVersion, link.build));
    const s = link.settings;
    // COPY: a classic search the workbench doesn't offer
    if (s.search === "nsga2" || s.search === "nsga3") notes.push("This link asked for a search the workbench doesn't offer; it runs as Best trade-offs.");
    if (s.objectives.length || s.shock || s.growth) notes.push("Promoted metrics, climate shocks and growth over time aren't in the workbench yet; the run is bred without them.");
    run = {
      settings: { search: s.search === "map-elites" ? "map-elites" : "auto", generations: s.gens, pop: s.pop, seed: s.seed },
      rules, brief, off: link.off, geneLocks: q.get("genes") ? decodeGenes(q.get("genes")!) : {},
    };
  }
  return {
    rules, brief, run, step: q.get("step"), sel: run ? q.get("sel") : null,
    keep: run ? (q.get("keep") ?? "").split(",").filter(Boolean) : [], notes,
  };
}

/** True when a query string carries anything beyond the site and step. */
export const hasState = (q: URLSearchParams) => ["rules", "brief", "seed", ...WB_KEYS.slice(1)].some((k) => q.has(k));

// --- the file ---------------------------------------------------------------------------

/** The workbench's own fields in a saved file (the classic page ignores them). */
interface WbFields { geneLocks?: Record<string, number>; step?: string }

export function toFile(o: {
  site: { id: string; name: string }; base: E.RuleSet | undefined; run: RunInputs; ranges: E.Ranges;
  result: EvolveResult; pen: { name: string; genome: number[]; title: string }[]; sel: string | null; step: string;
}): string {
  const r = o.result;
  const enc = new URLSearchParams(Sites.query(o.site.id, o.run.rules, o.base, o.run.brief ? { brief: o.run.brief, seeds: false } : null).slice(1));
  const saved: Runs.SavedRun & WbFields = {
    format: Runs.RUN_FORMAT, version: Runs.RUN_VERSION, build: Runs.BUILD, genomeVersion: E.GENOME_VERSION,
    saved: new Date().toISOString(),
    site: { id: o.site.id, name: o.site.name, rules: enc.get("rules"), brief: enc.get("brief") },
    off: o.run.off, locks: null, lockNote: [], pen: o.pen, children: [], brood: 0,
    settings: classicSettings(o.run.settings), start: null, typologySeeds: 0, ranges: o.ranges,
    result: {
      history: r.history, everyone: r.everyone, frontSize: r.frontSize, seconds: null,
      families: r.families.map(({ design: _, ...f }) => f), kept: r.kept, archive: r.archive, lineage: r.lineage,
      genomes: Runs.f64ToBase64(r.genomes), genomeLength: r.lineage.length ? r.genomes.length / r.lineage.length : E.LENGTH_V3,
    },
    selected: o.sel, heights: null, geneLocks: o.run.geneLocks, step: o.step,
  };
  return JSON.stringify(saved);
}

/** A saved file, read and checked; its result has no grown designs yet (the page grows the
 *  families' leads). */
export function readFile(text: string): {
  siteId: string; rulesText: string | null; briefText: string | null; run: Omit<RunInputs, "rules" | "brief">; ranges: E.Ranges | null;
  result: EvolveResult | null; pen: Runs.PenEntry[]; sel: string | null; step: string | null; notes: string[];
} {
  const s = Runs.readSaved(text) as Runs.SavedRun & WbFields;
  if (s.genomeVersion !== E.GENOME_VERSION) {
    throw new Error(`This run was bred with genome version ${s.genomeVersion}; open it on the classic page (/classic).`);
  }
  const st = s.settings;
  const r = s.result;
  return {
    siteId: s.site.id, rulesText: s.site.rules, briefText: s.site.brief,
    run: {
      settings: { search: st?.search === "map-elites" ? "map-elites" : "auto", generations: st?.gens ?? 15, pop: st?.pop ?? 30, seed: st?.seed ?? 1 },
      off: s.off, geneLocks: s.geneLocks && typeof s.geneLocks === "object" ? decodeGenes(encodeGenes(s.geneLocks)) : {},
    },
    ranges: s.ranges,
    result: r ? {
      history: r.history, everyone: r.everyone, frontSize: r.frontSize, families: r.families, kept: r.kept,
      archive: r.archive, lineage: r.lineage, genomes: Runs.base64ToF64(r.genomes),
    } : null,
    pen: s.pen, sel: s.selected, step: typeof s.step === "string" ? s.step : null,
    notes: Runs.versionNotes(s.genomeVersion, s.build),
  };
}
