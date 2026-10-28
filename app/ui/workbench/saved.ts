// Saving and opening the workbench's runs. A link holds a run's inputs: the engine is
// deterministic, so the same site, rules, brief, ridges, locked genes, settings and run number
// breed the same designs again (moves drawn on the map included). A file holds the result as well, so it opens as it was, with
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
  off: number[]; geneLocks: Record<string, number>; moves: E.Move[];
  /** The genome version bred: this page's unless a link or file from before asks for 3. */
  version?: E.GenomeVersion;
}

/** Genome versions the workbench breeds: its own, and 3 (before building types) so links and
 *  files from before grow as they did. */
const BREEDS: number[] = [3, E.GENOME_VERSION];

/** Everything a link or file restores. */
export interface Restore {
  rules: E.RuleSet | null; brief: E.Brief | null; moves: E.Move[]; run: RunInputs | null;
  step: string | null; sel: string | null; keep: string[]; notes: string[];
}

const GENES = new Set<string>(E.GENES_V3);
const WB_KEYS = ["step", "genes", "sel", "keep", "moves"];

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

// Moves in a link or file: [kind, points flat in metres to a decimetre, its parameter], as
// base64url JSON. A kept building is its index; its footprint comes from the site file.
const KINDS: E.MoveKind[] = ["spine", "street", "plaza", "nobuild", "keep"];
const dm = (v: number) => Math.round(v * 10) / 10;

export function encodeMoves(moves: E.Move[]): string {
  return Sites.toBase64Url(JSON.stringify(moves.map((m) => [KINDS.indexOf(m.kind),
    m.kind === "keep" ? [] : m.pts.flatMap(([x, y]) => [dm(x), dm(y)]),
    m.kind === "spine" ? m.width ?? E.SPINE_WIDTH_M.default : m.kind === "street" ? m.cls ?? 3 : m.kind === "keep" ? m.building ?? -1 : 0])));
}

export function decodeMoves(text: string, site: E.SiteExport): E.Move[] {
  // COPY: a link's moves can't be read
  const bad = () => new Error("The moves drawn in this link can't be read.");
  let raw: unknown;
  try { raw = JSON.parse(Sites.fromBase64Url(text)); } catch { throw bad(); }
  if (!Array.isArray(raw)) throw bad();
  const ground = site.context.buildings?.ground;
  return raw.map((r, k): E.Move => {
    if (!Array.isArray(r) || r.length !== 3 || !Array.isArray(r[1])) throw bad();
    const kind = KINDS[r[0]], flat = r[1] as unknown[], p = Number(r[2]);
    if (!kind || flat.some((v) => typeof v !== "number" || !Number.isFinite(v)) || flat.length % 2) throw bad();
    const pts = Array.from({ length: flat.length / 2 }, (_, i): [number, number] => [flat[2 * i] as number, flat[2 * i + 1] as number]);
    if (kind === "keep") {
      const ring = ground?.rings[p];
      if (!ring) throw new Error("A building kept in this link isn't in this site's file.");
      return { id: k + 1, kind, building: p, pts: Array.from({ length: ring.length / 2 }, (_, i): [number, number] => [ring[2 * i], ring[2 * i + 1]]) };
    }
    if (pts.length < 2 || (kind !== "street" && kind !== "spine" && pts.length < 3)) throw bad();
    if (kind === "spine") return { id: k + 1, kind, pts, width: Math.min(Math.max(p || E.SPINE_WIDTH_M.default, E.SPINE_WIDTH_M.min), E.SPINE_WIDTH_M.max) };
    if (kind === "street") return { id: k + 1, kind, pts, cls: p === 2 ? 2 : 3 };
    return { id: k + 1, kind, pts };
  });
}

const classicSettings = (s: Settings): Runs.RunSettings =>
  ({ search: s.search, gens: s.generations, pop: s.pop, seed: s.seed, objectives: [], axes: null, bins: null, shock: null });

/** The query string for the workbench as it stands: the site, step, rules and brief; and when
 *  a run is done, the inputs it was bred from, the design open and the pen's designs. */
export function writeLink(o: {
  site: string; base: E.RuleSet | undefined; step: string; rules: E.RuleSet | null; brief: E.Brief | null; moves: E.Move[];
  run: RunInputs | null; sel: string | null; keep: string[];
}): string {
  const rules = o.run ? o.run.rules : o.rules, brief = o.run ? o.run.brief : o.brief, moves = o.run ? o.run.moves : o.moves;
  const q = new URLSearchParams(Sites.query(o.site, rules, o.base, brief ? { brief, seeds: false } : null).slice(1));
  if (o.step !== "site") q.set("step", o.step);
  if (moves.length) q.set("moves", encodeMoves(moves));
  if (o.run) {
    Runs.writeLink(q, { settings: classicSettings(o.run.settings), off: o.run.off, locks: null, pen: 0,
      genomeVersion: o.run.version ?? E.GENOME_VERSION, build: Runs.BUILD });
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
  const moves = q.get("moves") ? decodeMoves(q.get("moves")!, site) : [];
  const link = Runs.readLink(q, site.design.x.length);
  const notes: string[] = [];
  let run: RunInputs | null = null;
  if (link) {
    if (!BREEDS.includes(link.genomeVersion)) {
      throw new Error(`This run was bred with genome version ${link.genomeVersion}; open it on the classic page (/classic).`);
    }
    notes.push(...Runs.versionNotes(link.genomeVersion, link.build));
    const s = link.settings;
    // COPY: a classic search the workbench doesn't offer
    if (s.search === "nsga2" || s.search === "nsga3") notes.push("This link asked for a search the workbench doesn't offer; it runs as Best trade-offs.");
    if (s.objectives.length || s.shock || s.growth) notes.push("Promoted metrics, climate shocks and growth over time aren't in the workbench yet; the run is bred without them.");
    run = {
      settings: { search: s.search === "map-elites" ? "map-elites" : "auto", generations: s.gens, pop: s.pop, seed: s.seed },
      rules, brief, off: link.off, geneLocks: q.get("genes") ? decodeGenes(q.get("genes")!) : {}, moves,
      ...(link.genomeVersion !== E.GENOME_VERSION ? { version: link.genomeVersion as E.GenomeVersion } : {}),
    };
  }
  return {
    rules, brief, moves, run, step: q.get("step"), sel: run ? q.get("sel") : null,
    keep: run ? (q.get("keep") ?? "").split(",").filter(Boolean) : [], notes,
  };
}

/** True when a query string carries anything beyond the site and step. */
export const hasState = (q: URLSearchParams) => ["rules", "brief", "seed", ...WB_KEYS.slice(1)].some((k) => q.has(k));

// --- the file ---------------------------------------------------------------------------

/** The workbench's own fields in a saved file (the classic page ignores them). */
interface WbFields { geneLocks?: Record<string, number>; step?: string; moves?: string }

export function toFile(o: {
  site: { id: string; name: string }; base: E.RuleSet | undefined; run: RunInputs; ranges: E.Ranges;
  result: EvolveResult; pen: { name: string; genome: number[]; title: string }[]; sel: string | null; step: string;
}): string {
  const r = o.result;
  const enc = new URLSearchParams(Sites.query(o.site.id, o.run.rules, o.base, o.run.brief ? { brief: o.run.brief, seeds: false } : null).slice(1));
  const saved: Runs.SavedRun & WbFields = {
    format: Runs.RUN_FORMAT, version: Runs.RUN_VERSION, build: Runs.BUILD, genomeVersion: o.run.version ?? E.GENOME_VERSION,
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
    ...(o.run.moves.length ? { moves: encodeMoves(o.run.moves) } : {}),
  };
  return JSON.stringify(saved);
}

/** A saved file, read and checked; its result has no grown designs yet (the page grows the
 *  families' leads). */
export function readFile(text: string): {
  siteId: string; rulesText: string | null; briefText: string | null; movesText: string | null;
  run: Omit<RunInputs, "rules" | "brief" | "moves">; ranges: E.Ranges | null;
  result: EvolveResult | null; pen: Runs.PenEntry[]; sel: string | null; step: string | null; notes: string[];
} {
  const s = Runs.readSaved(text) as Runs.SavedRun & WbFields;
  if (!BREEDS.includes(s.genomeVersion)) {
    throw new Error(`This run was bred with genome version ${s.genomeVersion}; open it on the classic page (/classic).`);
  }
  const st = s.settings;
  const r = s.result;
  return {
    siteId: s.site.id, rulesText: s.site.rules, briefText: s.site.brief, movesText: typeof s.moves === "string" ? s.moves : null,
    run: {
      settings: { search: st?.search === "map-elites" ? "map-elites" : "auto", generations: st?.gens ?? 15, pop: st?.pop ?? 30, seed: st?.seed ?? 1 },
      off: s.off, geneLocks: s.geneLocks && typeof s.geneLocks === "object" ? decodeGenes(encodeGenes(s.geneLocks)) : {},
      ...(s.genomeVersion !== E.GENOME_VERSION ? { version: s.genomeVersion as E.GenomeVersion } : {}),
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
