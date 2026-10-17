// The brief (pc/brief.py): a fixed schema the brief compiler fills, the validator that
// checks it before anyone sees it, and how a confirmed brief becomes a run's settings.
//
// The compiler (app/api/brief.ts) may only choose values from this vocabulary, within these
// limits, and must cite a retrieved snippet for each value or leave it "assumed" (no
// sources). It can't add fields, genes, rules or patterns: the validator drops anything
// else, with a warning. The genome schema never changes; a brief only changes how genes are
// read (gene ranges), the rules' limits, and the targets the designs are judged against.
import { DEFAULT_RANGES, GLOBAL_GENES, LENGTH, N_ATTRACTORS, ATTRACTOR_GENES, type Ranges } from "./config.js";
import { SCORE_KEYS } from "./fitness.js";
import { roundHalfEven } from "./num.js";
import { makeRng } from "./rng.js";
import type { Condition, Rule, RuleSet, ScoreKey } from "./types.js";

export const BRIEF_VERSION = 1;

/** A value with where it came from: snippet ids, or none ("assumed"). */
export interface Cited<T> { value: T; sources: string[]; note: string }

export const PROGRAMMES = ["residential", "commercial", "civic", "industrial", "open_space"] as const;
export const TYPOLOGIES = ["courtyard", "l_shape", "u_shape", "tower", "slab", "podium_tower"] as const;
// Phase 6 readouts (docs/architecture-v2.md 6.4): the computable fifteen properties, and the
// urban-design metrics kept beside them.
export const AESTHETICS = [
  "levels_of_scale", "strong_centres", "boundaries", "alternating_repetition", "positive_space",
  "local_symmetries", "contrast", "gradients", "roughness", "echoes", "the_void", "not_separateness",
  "human_scale", "permeability", "connection_to_nature", "harmony_variety", "semilattice_richness", "legibility",
] as const;
export const RANGE_KEYS = GLOBAL_GENES; // the site-wide genes a brief may narrow

export type Programme = (typeof PROGRAMMES)[number];
export type Typology = (typeof TYPOLOGIES)[number];
export type Aesthetic = (typeof AESTHETICS)[number];
export type RangeKey = (typeof RANGE_KEYS)[number];

export interface RuleChange {
  rule: string; enabled?: boolean; max_levels?: number; min_permeable?: number; sources: string[]; note: string;
}
export interface PatternUse { id: number; sources: string[]; note: string }

export interface Brief {
  version: number;
  summary: string;
  fsi: Cited<number> | null;
  floor_area_ha: Cited<number> | null;
  height_limit_levels: Cited<number> | null;
  ground_coverage_max: Cited<number> | null;
  design_storm_mm: Cited<number> | null;
  setbacks_m: Cited<{ front: number; side: number; rear: number }> | null;
  programme_mix: Cited<Partial<Record<Programme, number>>> | null;
  objective_weights: Cited<Partial<Record<ScoreKey, number>>> | null;
  gene_ranges: Cited<Partial<Record<RangeKey, [number, number]>>> | null;
  typology_priors: Cited<{ type: Typology; weight: number }[]> | null;
  aesthetic_priorities: Cited<{ metric: Aesthetic; weight: number }[]> | null;
  rule_changes: RuleChange[];
  patterns: PatternUse[];
  tags: string[];
}

/** What the validator checks a brief against. */
export interface BriefContext {
  rules: { name: string; kind: Rule["kind"] }[];
  snippets: string[];
  patterns: number[];
}

/** Which phase uses each field (shown in the brief panel). */
export const APPLIES: Record<keyof Omit<Brief, "version" | "summary">, string> = {
  fsi: "the floor-area target", floor_area_ha: "the floor-area target (wins over FSI)",
  height_limit_levels: "the height cap on all design ground", ground_coverage_max: "the coverage gene's upper end",
  design_storm_mm: "flood storage", setbacks_m: "recorded; used by building-scale massing (Phase 7)",
  programme_mix: "recorded; used by the urban metrics (Phase 6)", objective_weights: "the order of families on the front",
  gene_ranges: "how genes are read", typology_priors: "optional starting designs; building scale in Phase 7",
  aesthetic_priorities: "recorded; used by the aesthetic metrics (Phase 6)", rule_changes: "the site's rules",
  patterns: "see each pattern card", tags: "recorded only (materials and texture are not measured)",
};

// --- limits ------------------------------------------------------------------------------

const NUMBERS = {
  fsi: [0.1, 8], floor_area_ha: [0.1, 10000], height_limit_levels: [1, 60], ground_coverage_max: [0.2, 0.9],
  design_storm_mm: [10, 1500],
} as const;
const SETBACK_MAX = 30;
const MAX_TEXT = { summary: 800, note: 300, tag: 40 };
const MAX_TAGS = 8;
const EPS = 1e-9;

const FIELDS = ["version", "summary", "fsi", "floor_area_ha", "height_limit_levels", "ground_coverage_max",
  "design_storm_mm", "setbacks_m", "programme_mix", "objective_weights", "gene_ranges", "typology_priors",
  "aesthetic_priorities", "rule_changes", "patterns", "tags"] as const;

// --- validation (pc.brief.validate: same checks, same warnings) ----------------------------

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const inRange = (v: unknown, lo: number, hi: number): v is number => isNum(v) && v >= lo && v <= hi;
const share = (v: unknown): v is number => inRange(v, 0, 1);

function text(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function sourcesOf(v: unknown, where: string, ctx: BriefContext, warn: (s: string) => void): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const s of v) {
    if (typeof s === "string" && ctx.snippets.includes(s)) { if (!out.includes(s)) out.push(s); }
    else warn(`${where}: a source that wasn't among the snippets was dropped`);
  }
  return out;
}

/** A Cited field: null if absent; dropped (null, with a warning) if its value fails `check`. */
function cited<T>(raw: Record<string, unknown>, key: string, ctx: BriefContext, warn: (s: string) => void,
  check: (v: unknown) => T | string): Cited<T> | null {
  const v = raw[key];
  if (v === undefined || v === null) return null;
  if (!isObj(v) || !("value" in v)) { warn(`${key}: not in the form {value, sources, note}; left out`); return null; }
  const value = check(v.value);
  if (typeof value === "string") { warn(`${key}: ${value}; left out`); return null; }
  return { value, sources: sourcesOf(v.sources, key, ctx, warn), note: text(v.note, MAX_TEXT.note) };
}

const numberIn = (lo: number, hi: number, int = false) => (v: unknown): number | string =>
  !inRange(v, lo, hi) ? "outside the allowed range" : int && !Number.isInteger(v) ? "not a whole number" : v;

function weights<K extends string>(keys: readonly K[], warn: (s: string) => void, key: string) {
  return (v: unknown): Partial<Record<K, number>> | string => {
    if (!isObj(v)) return "not an object";
    const out: Partial<Record<K, number>> = {};
    for (const [k, w] of Object.entries(v)) {
      if (!(keys as readonly string[]).includes(k)) { warn(`${key}: unknown key ${k} dropped`); continue; }
      if (!share(w)) { warn(`${key}: ${k} outside 0 to 1, dropped`); continue; }
      out[k as K] = w;
    }
    return Object.keys(out).length ? out : "nothing valid";
  };
}

function ranked<K extends string, F extends string>(keys: readonly K[], field: F, max: number,
  warn: (s: string) => void, key: string) {
  return (v: unknown): ({ [P in F]: K } & { weight: number })[] | string => {
    if (!Array.isArray(v)) return "not a list";
    const out: ({ [P in F]: K } & { weight: number })[] = [];
    for (const item of v) {
      const name = isObj(item) ? item[field] : undefined;
      if (typeof name !== "string" || !(keys as readonly string[]).includes(name)) { warn(`${key}: unknown ${field} dropped`); continue; }
      if (!share(item!.weight)) { warn(`${key}: ${name} weight outside 0 to 1, dropped`); continue; }
      if (out.some((o) => o[field] === name)) { warn(`${key}: ${name} given twice; the first kept`); continue; }
      out.push({ [field]: name, weight: item!.weight } as { [P in F]: K } & { weight: number });
    }
    if (out.length > max) { warn(`${key}: more than ${max}; the rest dropped`); out.length = max; }
    return out.length ? out : "nothing valid";
  };
}

/** Check a brief from the compiler (or a file). Never throws: what fails is left out, and
 *  each thing left out gets a warning. */
export function validateBrief(raw: unknown, ctx: BriefContext): { brief: Brief; warnings: string[] } {
  const warnings: string[] = [];
  const warn = (s: string) => { warnings.push(s); };
  const r = isObj(raw) ? raw : (warn("the brief is not an object"), {});
  for (const k of Object.keys(r)) if (!(FIELDS as readonly string[]).includes(k)) warn(`unknown field ${k} dropped`);

  const summary = text(r.summary, MAX_TEXT.summary);
  if (typeof r.summary === "string" && r.summary.trim().length > MAX_TEXT.summary) warn("summary: shortened");

  const ruleChanges: RuleChange[] = [];
  if (Array.isArray(r.rule_changes)) {
    for (const c of r.rule_changes) {
      const name = isObj(c) ? c.rule : undefined;
      const rule = ctx.rules.find((x) => x.name === name);
      if (!rule) { warn("rule_changes: a rule that isn't in the site's rules was dropped"); continue; }
      if (rule.kind !== "constrained") { warn(`rule_changes: ${rule.name} is ${rule.kind} and can't be changed; dropped`); continue; }
      const ch: RuleChange = { rule: rule.name, sources: [], note: "" };
      if (typeof c!.enabled === "boolean") ch.enabled = c!.enabled;
      else if (c!.enabled !== undefined) warn(`rule_changes: ${rule.name} enabled is not true or false; ignored`);
      if (c!.max_levels !== undefined) {
        if (inRange(c!.max_levels, 1, 60) && Number.isInteger(c!.max_levels)) ch.max_levels = c!.max_levels;
        else warn(`rule_changes: ${rule.name} max_levels outside 1 to 60; ignored`);
      }
      if (c!.min_permeable !== undefined) {
        if (share(c!.min_permeable)) ch.min_permeable = c!.min_permeable;
        else warn(`rule_changes: ${rule.name} min_permeable outside 0 to 1; ignored`);
      }
      if (ch.enabled === undefined && ch.max_levels === undefined && ch.min_permeable === undefined) {
        warn(`rule_changes: ${rule.name} changes nothing; dropped`); continue;
      }
      if (ruleChanges.some((x) => x.rule === rule.name)) { warn(`rule_changes: ${rule.name} given twice; the first kept`); continue; }
      ch.sources = sourcesOf(c!.sources, `rule_changes ${rule.name}`, ctx, warn);
      ch.note = text(c!.note, MAX_TEXT.note);
      ruleChanges.push(ch);
    }
  } else if (r.rule_changes !== undefined && r.rule_changes !== null) warn("rule_changes: not a list; left out");

  const patterns: PatternUse[] = [];
  if (Array.isArray(r.patterns)) {
    for (const p of r.patterns) {
      const id = isObj(p) ? p.id : undefined;
      if (!isNum(id) || !ctx.patterns.includes(id)) { warn("patterns: a pattern without a card was dropped"); continue; }
      if (patterns.some((x) => x.id === id)) { warn(`patterns: ${id} given twice; the first kept`); continue; }
      patterns.push({ id, sources: sourcesOf(p!.sources, `patterns ${id}`, ctx, warn), note: text(p!.note, MAX_TEXT.note) });
    }
  } else if (r.patterns !== undefined && r.patterns !== null) warn("patterns: not a list; left out");

  const tags: string[] = [];
  if (Array.isArray(r.tags)) {
    for (const t of r.tags) {
      const s = typeof t === "string" ? t.trim() : "";
      if (!s || s.length > MAX_TEXT.tag) { warn("tags: an empty or long tag was dropped"); continue; }
      if (tags.length >= MAX_TAGS) { warn(`tags: more than ${MAX_TAGS}; the rest dropped`); break; }
      if (!tags.includes(s)) tags.push(s);
    }
  } else if (r.tags !== undefined && r.tags !== null) warn("tags: not a list; left out");

  const brief: Brief = {
    version: BRIEF_VERSION,
    summary,
    fsi: cited(r, "fsi", ctx, warn, numberIn(...NUMBERS.fsi)),
    floor_area_ha: cited(r, "floor_area_ha", ctx, warn, numberIn(...NUMBERS.floor_area_ha)),
    height_limit_levels: cited(r, "height_limit_levels", ctx, warn, numberIn(...NUMBERS.height_limit_levels, true)),
    ground_coverage_max: cited(r, "ground_coverage_max", ctx, warn, numberIn(...NUMBERS.ground_coverage_max)),
    design_storm_mm: cited(r, "design_storm_mm", ctx, warn, numberIn(...NUMBERS.design_storm_mm)),
    setbacks_m: cited(r, "setbacks_m", ctx, warn, (v) => {
      if (!isObj(v)) return "not an object";
      const out = { front: v.front, side: v.side, rear: v.rear };
      return Object.values(out).every((x) => inRange(x, 0, SETBACK_MAX))
        ? out as { front: number; side: number; rear: number } : "front, side and rear must each be 0 to 30 m";
    }),
    programme_mix: cited(r, "programme_mix", ctx, warn, weights(PROGRAMMES, warn, "programme_mix")),
    objective_weights: cited(r, "objective_weights", ctx, warn, weights(SCORE_KEYS, warn, "objective_weights")),
    gene_ranges: cited(r, "gene_ranges", ctx, warn, (v) => {
      if (!isObj(v)) return "not an object";
      const out: Partial<Record<RangeKey, [number, number]>> = {};
      for (const [k, pair] of Object.entries(v)) {
        if (!(RANGE_KEYS as readonly string[]).includes(k)) { warn(`gene_ranges: unknown gene ${k} dropped`); continue; }
        const [dlo, dhi] = DEFAULT_RANGES[k as RangeKey];
        if (!Array.isArray(pair) || pair.length !== 2 || !isNum(pair[0]) || !isNum(pair[1]) || pair[0] > pair[1]
          || pair[0] < dlo - EPS || pair[1] > dhi + EPS) {
          warn(`gene_ranges: ${k} must be [low, high] within its default range; dropped`); continue;
        }
        out[k as RangeKey] = [pair[0], pair[1]];
      }
      return Object.keys(out).length ? out : "nothing valid";
    }),
    typology_priors: cited(r, "typology_priors", ctx, warn, ranked(TYPOLOGIES, "type", TYPOLOGIES.length, warn, "typology_priors")),
    aesthetic_priorities: cited(r, "aesthetic_priorities", ctx, warn, ranked(AESTHETICS, "metric", 12, warn, "aesthetic_priorities")),
    rule_changes: ruleChanges,
    patterns,
    tags,
  };
  return { brief, warnings };
}

// --- a confirmed brief → a run's settings (pc.brief.apply) --------------------------------

export interface BriefBase {
  rules: RuleSet;
  meta: { target_far: number; target_floor_area_ha: number | null; design_storm_mm: number };
}

/** What a run takes from a brief. The genome schema is untouched. */
export interface RunConfig {
  target_far: number;
  target_floor_area_ha: number | null;
  design_storm_mm: number;
  ranges: Ranges;
  rules: RuleSet;
}

/** Pattern 21 (Four-Story Limit) caps heights at 4 storeys when the brief sets no cap. */
export const FOUR_STORY_PATTERN = 21, FOUR_STORIES = 4;

/** A rule switched off matches nothing: all of itself and its negation (as the cake does). */
export const isOff = (r: Rule) => "all" in r.when && r.when.all.length === 2
  && JSON.stringify(r.when.all[1]) === JSON.stringify({ not: r.when.all[0] });
export function switched(r: Rule, on: boolean): Rule {
  if (isOff(r) === !on) return r;
  const when: Condition = on ? (r.when as { all: Condition[] }).all[0] : { all: [r.when, { not: r.when }] };
  return { ...r, when };
}

export function heightLimit(brief: Brief): number | null {
  if (brief.height_limit_levels) return brief.height_limit_levels.value;
  return brief.patterns.some((p) => p.id === FOUR_STORY_PATTERN) ? FOUR_STORIES : null;
}

export function applyBrief(brief: Brief, base: BriefBase): RunConfig {
  const m = base.meta;
  let target_far = m.target_far, target_floor_area_ha = m.target_floor_area_ha;
  if (brief.floor_area_ha) target_floor_area_ha = brief.floor_area_ha.value;
  else if (brief.fsi) { target_far = brief.fsi.value; target_floor_area_ha = null; }

  const ranges = { ...DEFAULT_RANGES } as Ranges;
  for (const k of RANGE_KEYS) {
    const v = brief.gene_ranges?.value[k];
    if (v) ranges[k] = [v[0], v[1]];
  }
  if (brief.ground_coverage_max) {
    const c = brief.ground_coverage_max.value, [lo, hi] = ranges.coverage;
    ranges.coverage = [Math.min(lo, c), Math.min(hi, c)];
  }

  const h = heightLimit(brief);
  const defaults = { ...base.rules.defaults };
  if (h !== null) defaults.max_levels = Math.min(defaults.max_levels, h);
  const list = base.rules.list.map((rule) => {
    const ch = brief.rule_changes.find((c) => c.rule === rule.name);
    if (!ch || rule.kind !== "constrained") return rule;
    let next = ch.enabled === undefined ? rule : switched(rule, ch.enabled);
    const limits = { ...next.limits };
    if (ch.max_levels !== undefined) limits.max_levels = ch.max_levels;
    if (ch.min_permeable !== undefined) limits.min_permeable = ch.min_permeable;
    next = { ...next, limits };
    return next;
  });
  return {
    target_far, target_floor_area_ha,
    design_storm_mm: brief.design_storm_mm ? brief.design_storm_mm.value : m.design_storm_mm,
    ranges, rules: { ...base.rules, defaults, list },
  };
}

// --- typology priors → starting genomes (pc.brief.typology_seeds) --------------------------

/** Each typology as a site-scale density pattern: the site-wide genes it leans to (0..1,
 *  read through the run's ranges). Author's reading of corpus/typologies/library.md. */
export const TYPOLOGY_GENES: Record<Typology, Partial<Record<RangeKey, number>>> = {
  courtyard: { coverage: 0.8, peak: 0.15, intensity: 0.45, base: 0.8 },
  l_shape: { coverage: 0.6, peak: 0.2, intensity: 0.45, base: 0.65 },
  u_shape: { coverage: 0.7, peak: 0.2, intensity: 0.45, base: 0.7 },
  tower: { coverage: 0.15, peak: 0.9, intensity: 0.9, base: 0.1 },
  slab: { coverage: 0.5, peak: 0.45, intensity: 0.65, base: 0.5 },
  podium_tower: { coverage: 0.9, peak: 0.85, intensity: 0.8, base: 0.2 },
};
const SEED_JITTER = 0.05;

/** Up to `count` starting genomes, shared out by weight: random attractors, site-wide genes
 *  near each typology's pattern. Labelled as typology seeds wherever they are used. */
export function typologySeeds(priors: { type: Typology; weight: number }[], count: number, seed: number): number[][] {
  const total = priors.reduce((s, p) => s + p.weight, 0);
  if (!(total > 0) || count < 1) return [];
  const rng = makeRng(seed);
  const out: number[][] = [];
  for (const p of priors) {
    const k = Math.min(roundHalfEven((count * p.weight) / total), count - out.length);
    for (let j = 0; j < k; j++) {
      const g = Array.from({ length: LENGTH }, () => rng.random());
      GLOBAL_GENES.forEach((name, i) => {
        const target = TYPOLOGY_GENES[p.type][name];
        if (target === undefined) return;
        g[N_ATTRACTORS * ATTRACTOR_GENES + i] = Math.min(Math.max(target + rng.normal(0, SEED_JITTER), 0), 1);
      });
      out.push(g);
    }
  }
  return out;
}

/** Families ordered by the brief's objective weights: each score normalised over the front
 *  (best = 1), weighted, summed. Ties keep their order. */
export function weightedOrder(scores: Record<ScoreKey, number>[], w: Partial<Record<ScoreKey, number>>,
  higherIsBetter: Record<ScoreKey, boolean>): number[] {
  const keys = SCORE_KEYS.filter((k) => (w[k] ?? 0) > 0);
  const value = scores.map((s) => keys.reduce((sum, k) => {
    const vals = scores.map((x) => x[k]);
    const lo = Math.min(...vals), hi = Math.max(...vals), span = hi - lo || 1;
    const t = higherIsBetter[k] ? (s[k] - lo) / span : (hi - s[k]) / span;
    return sum + (w[k] ?? 0) * t;
  }, 0));
  return [...scores.keys()].sort((a, b) => value[b] - value[a] || a - b);
}
