// Saving and reloading runs.
//
// A link (?site=…&rules=…&brief=… plus the run's settings below) holds what a run needs to be
// grown again: the engine is deterministic, so the same site, rules, brief, settings, locks,
// skeleton and seed breed the same designs. The link also names the genome version and the
// build it was made with, so a link from an older engine says it may not match.
//
//   seed  gens  pop  search  obj (promoted metrics, comma)  ax ay bins (MAP-Elites)
//   shock (generation x factor, e.g. 15x1.3)  off (ridges switched off, comma)
//   locks (locked cells, run-length: "<use><count base 36>" joined by "-")
//   pen (how many designs from the pen started Generation 0: a link can't carry them)
//   growth=piecemeal, ssp (piecemeal growth and its climate scenario)
//   gv (genome version)  b (build)
//
// The file (download and upload) holds the full state: the same settings, the run's result
// and lineage, the pen and the children bred by hand, locks with their notes, and heights set
// on existing buildings. Loading it shows the run as it was, without running it again.
import * as E from "../engine";
import type { ArchiveInfo } from "../engine";
import type { FamilyLead, IncrementSummary, Kept } from "../engine/worker";

export const RUN_FORMAT = "permutation-city run";
export const RUN_VERSION = 1;
export const BUILD: string = (import.meta.env?.VITE_BUILD as string | undefined) || "dev";

export type SearchSetting = "auto" | "nsga2" | "nsga3" | "map-elites";
export interface RunSettings {
  search: SearchSetting; gens: number; pop: number; seed: number;
  objectives: string[];               // promoted metrics (not with MAP-Elites)
  axes: [string, string] | null; bins: number | null;   // MAP-Elites
  shock: [number, number] | null;
  growth?: "piecemeal"; scenario?: "ssp245" | "ssp585";   // piecemeal growth (engine/piecemeal.ts)
}
export interface RunLink {
  settings: RunSettings; off: number[]; locks: Int8Array | null; pen: number;
  genomeVersion: number; build: string | null;
}

const SEARCHES: SearchSetting[] = ["auto", "nsga2", "nsga3", "map-elites"];
const KEYS = ["seed", "gens", "pop", "search", "obj", "ax", "ay", "bins", "shock", "off", "locks", "pen", "growth", "ssp", "gv", "b"];

/** Locked cells as runs of the same code: "<code><count in base 36>", joined by "-". */
export function encodeLocks(locks: ArrayLike<number>): string {
  const out: string[] = [];
  for (let i = 0; i < locks.length;) {
    let j = i;
    while (j < locks.length && locks[j] === locks[i]) j++;
    out.push(`${locks[i]}${(j - i).toString(36)}`);
    i = j;
  }
  return out.join("-");
}

export function decodeLocks(text: string, n: number): Int8Array {
  const out = new Int8Array(n);
  let at = 0;
  for (const run of text.split("-")) {
    const m = /^([0-3])([0-9a-z]+)$/.exec(run);
    if (!m) throw new Error("The locks in this link can't be read.");
    const count = parseInt(m[2], 36);
    if (at + count > n) throw new Error("The locks in this link are for a different site.");
    out.fill(+m[1], at, at + count);
    at += count;
  }
  if (at !== n) throw new Error("The locks in this link are for a different site.");
  return out;
}

/** The run's settings and state in a query string (added to `q`, which keeps site, rules, brief). */
export function writeLink(q: URLSearchParams, link: RunLink): URLSearchParams {
  for (const k of KEYS) q.delete(k);
  const s = link.settings;
  q.set("seed", String(s.seed));
  q.set("gens", String(s.gens));
  q.set("pop", String(s.pop));
  q.set("search", s.search);
  if (s.objectives.length) q.set("obj", s.objectives.join(","));
  if (s.axes) { q.set("ax", s.axes[0]); q.set("ay", s.axes[1]); }
  if (s.bins) q.set("bins", String(s.bins));
  if (s.shock) q.set("shock", `${s.shock[0]}x${s.shock[1]}`);
  if (s.growth === "piecemeal") { q.set("growth", "piecemeal"); q.set("ssp", s.scenario ?? "ssp245"); }
  if (link.off.length) q.set("off", link.off.join(","));
  if (link.locks && link.locks.some((v) => v !== 0)) q.set("locks", encodeLocks(link.locks));
  if (link.pen) q.set("pen", String(link.pen));
  q.set("gv", String(link.genomeVersion));
  if (link.build) q.set("b", link.build);
  return q;
}

const int = (v: string | null, lo: number, hi: number, what: string): number => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < lo || n > hi) throw new Error(`The ${what} in this link isn't a whole number from ${lo} to ${hi}.`);
  return n;
};

/** A run from the query string, or null when the link has none (no seed). `n`: the site's
 *  cell count, for the locks. Unknown metrics and traits are refused, not guessed. */
export function readLink(q: URLSearchParams, n: number): RunLink | null {
  if (!q.has("seed")) return null;
  const search = (q.get("search") ?? "auto") as SearchSetting;
  if (!SEARCHES.includes(search)) throw new Error(`The search "${search}" in this link isn't one this page knows.`);
  const objectives = (q.get("obj") ?? "").split(",").filter(Boolean);
  for (const k of objectives) if (!E.OBJECTIVE_KEYS.includes(k as E.MetricKey)) throw new Error(`The metric "${k}" in this link isn't one this page knows.`);
  if (objectives.length > 2) throw new Error("A run promotes at most two metrics.");
  const ax = q.get("ax"), ay = q.get("ay");
  for (const k of [ax, ay]) if (k && !E.DESCRIPTOR_KEYS.includes(k)) throw new Error(`The trait "${k}" in this link isn't one this page knows.`);
  let shock: [number, number] | null = null;
  const sh = q.get("shock");
  if (sh) {
    const m = /^(\d+)x(\d+(?:\.\d+)?)$/.exec(sh);
    if (!m) throw new Error("The climate shock in this link can't be read.");
    shock = [+m[1], +m[2]];
  }
  const off = (q.get("off") ?? "").split(",").filter(Boolean).map((v) => int(v, 0, 1e7, "ridge"));
  const locks = q.get("locks") ? decodeLocks(q.get("locks")!, n) : null;
  const growth = q.get("growth");
  if (growth && growth !== "piecemeal") throw new Error(`The growth "${growth}" in this link isn't one this page knows.`);
  const ssp = q.get("ssp") ?? "ssp245";
  if (ssp !== "ssp245" && ssp !== "ssp585") throw new Error(`The climate scenario "${ssp}" in this link isn't one this page knows.`);
  return {
    settings: {
      search, seed: int(q.get("seed"), 0, 2 ** 31, "seed"), gens: int(q.get("gens") ?? "30", 1, 200, "generations"),
      pop: int(q.get("pop") ?? "60", 4, 500, "population"), objectives,
      axes: ax && ay ? [ax, ay] : null, bins: q.get("bins") ? int(q.get("bins"), 2, 30, "bins") : null, shock,
      ...(growth === "piecemeal" ? { growth: "piecemeal" as const, scenario: ssp as "ssp245" | "ssp585" } : {}),
    },
    off, locks, pen: q.get("pen") ? int(q.get("pen"), 0, 500, "pen count") : 0,
    genomeVersion: q.get("gv") ? int(q.get("gv"), 1, 99, "genome version") : E.GENOME_VERSION, build: q.get("b"),
  };
}

/** What to tell people about a link or file made with another engine. */
export function versionNotes(genomeVersion: number, build: string | null): string[] {
  const out: string[] = [];
  // COPY: the note on runs saved with an older genome.
  if (genomeVersion < E.GENOME_VERSION) {
    out.push(`Saved with genome version ${genomeVersion} (${genomeVersion === 1 ? `${E.PRE_STREET_LENGTH} numbers, before streets`
      : `${E.LENGTH} numbers, streets on the cells' edges`}). It grows as it did then; this page breeds version ${E.GENOME_VERSION}`
      + ` (${E.LENGTH_V3} numbers, vector streets and plots), and the two can't be bred together.`);
  } else if (genomeVersion > E.GENOME_VERSION) {
    out.push(`Saved with genome version ${genomeVersion}, newer than this page's (${E.GENOME_VERSION}).`);
  }
  if (build && build !== "dev" && BUILD !== "dev" && build !== BUILD) {
    out.push(`Saved with build ${build}; this is build ${BUILD}. If the engine changed in between, the run may differ.`);
  }
  return out;
}

// --- the file ---------------------------------------------------------------------------

/** A design kept by hand (the pen, or children bred by hand). */
export interface PenEntry { name: string; genome: number[]; title?: string; parents?: string[] }

export interface SavedResult {
  history: E.HistoryRow[]; everyone: number; frontSize: number; seconds: number | null;
  families: FamilyLead[]; kept: Kept[]; archive: ArchiveInfo | null;
  lineage: E.LineageNode[];
  genomes: string;        // every design's genome: Float64 little-endian, base64
  genomeLength: number;
  increments?: IncrementSummary[];   // piecemeal growth: each increment, with the genome it built
}

export interface SavedRun {
  format: typeof RUN_FORMAT; version: number; build: string; genomeVersion: number; saved: string;
  site: { id: string; name: string; rules: string | null; brief: string | null };
  off: number[]; locks: string | null; lockNote: string[]; pen: PenEntry[]; children: PenEntry[]; brood: number;
  settings: RunSettings | null;
  /** The run's engine options as sent: start genomes (from the pen or typology seeds), ranges. */
  start: number[][] | null; typologySeeds: number; ranges: E.Ranges | null;
  result: SavedResult | null;
  selected: string | null;
  heights: Record<number, number> | null;   // set on existing buildings, this site
}

export function f64ToBase64(a: Float64Array): string {
  const bytes = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function base64ToF64(text: string): Float64Array {
  const s = atob(text), bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  if (bytes.length % 8) throw new Error("The saved genomes are cut short.");
  return new Float64Array(bytes.buffer);
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const genomeOk = (g: unknown): g is number[] =>
  Array.isArray(g) && [E.LENGTH, E.PRE_STREET_LENGTH, E.LENGTH_V3].includes(g.length) && g.every((v) => typeof v === "number" && v >= 0 && v <= 1);

/** JSON writes NaN as null: put NaN back in a kept design's metrics and scores. */
function revive(k: Kept): Kept {
  const back = <T extends object>(o: T) => {
    for (const [key, v] of Object.entries(o)) if (v === null) (o as Record<string, unknown>)[key] = NaN;
    return o;
  };
  return { ...k, metrics: back({ ...k.metrics }), scores: back({ ...k.scores }) };
}

/** Read a saved file: checked enough that nothing in it can break the page. Throws with a
 *  sentence people can act on. */
export function readSaved(text: string): SavedRun {
  let v: unknown;
  try { v = JSON.parse(text); } catch { throw new Error("That file isn't JSON."); }
  if (!isObj(v) || v.format !== RUN_FORMAT) throw new Error("That file isn't a saved Permutation City run.");
  if (typeof v.version !== "number" || v.version > RUN_VERSION) throw new Error("That file was saved by a newer version of this page.");
  if (!isObj(v.site) || typeof v.site.id !== "string" || !/^[a-z0-9-]{1,64}$/.test(v.site.id)) throw new Error("The file doesn't say which site it's for.");
  const s = v as unknown as SavedRun;
  for (const p of [...(s.pen ?? []), ...(s.children ?? [])]) {
    if (!isObj(p) || typeof p.name !== "string" || !genomeOk(p.genome)) throw new Error("A design in the file's pen can't be read.");
  }
  if (s.start && (!Array.isArray(s.start) || !s.start.every(genomeOk))) throw new Error("The run's starting designs can't be read.");
  if (s.result) {
    const r = s.result;
    if (!Array.isArray(r.kept) || !r.kept.every((k) => isObj(k) && typeof k.name === "string" && genomeOk(k.genome))) {
      throw new Error("The run's designs can't be read.");
    }
    if (!Array.isArray(r.families) || !r.families.every((f) => isObj(f) && genomeOk(f.genome))) throw new Error("The run's families can't be read.");
    if (!Array.isArray(r.history) || !Array.isArray(r.lineage)) throw new Error("The run's history can't be read.");
    if (r.increments && (!Array.isArray(r.increments) || !r.increments.every((x) => isObj(x) && isObj(x.chosen) && genomeOk(x.chosen.genome)))) {
      throw new Error("The run's increments can't be read.");
    }
    const g = base64ToF64(r.genomes ?? "");
    if (g.length !== r.lineage.length * r.genomeLength) throw new Error("The run's family tree doesn't match its designs.");
    r.kept = r.kept.map(revive);
  }
  return {
    ...s, off: (s.off ?? []).filter((x) => Number.isInteger(x)), lockNote: s.lockNote ?? [], pen: s.pen ?? [],
    children: s.children ?? [], brood: s.brood ?? 0, heights: isObj(s.heights) ? s.heights : null,
  };
}

/** The genome of the k-th design in a saved lineage. */
export function lineageGenome(genomes: Float64Array, length: number, k: number): number[] {
  return Array.from(genomes.subarray(k * length, (k + 1) * length));
}
