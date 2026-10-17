// The brief panel's logic: asking the compiler, choosing which upload snippets to send, and
// editing a brief by hand. A value changed by hand loses its citations (the snippet no
// longer says it) and says so in its note.
import type { Snippet } from "../../brief/chunk";
import { uploadSnippets } from "../../brief/chunk";
import type { BriefResponse } from "../../brief/compile";
import { retrieve } from "../../brief/retrieve";
import type { SiteSummary } from "../../brief/summary";
import * as E from "../../engine";

export const BY_HAND = "Changed by hand.";
const MAX_SENT = 150;

/** The upload snippets worth sending: all of them if few, otherwise the best for the
 *  description and for each part of the brief (the same retrieval the compiler runs). */
export function uploadsToSend(docs: { name: string; pages: string[] }[], description: string): { snippets: Snippet[]; of: number } {
  const all = docs.flatMap((d) => uploadSnippets(d.name, d.pages));
  if (all.length <= MAX_SENT) return { snippets: all, of: all.length };
  const picked = retrieve(all, description, "upload", { perTopic: 12, forDescription: 40, max: MAX_SENT, maxChars: 1_000_000 }).snippets;
  return { snippets: picked, of: all.length };
}

export async function askCompiler(site: SiteSummary, description: string, uploads: Snippet[],
  quality: "standard" | "careful", signal?: AbortSignal): Promise<BriefResponse> {
  let r: Response;
  try {
    r = await fetch(`${import.meta.env.BASE_URL}api/brief`, {
      method: "POST", headers: { "Content-Type": "application/json" }, signal,
      body: JSON.stringify({ site, description, uploads, quality }),
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new Error("Can't reach the brief compiler. Check the connection and try again.");
  }
  if (r.status === 404) throw new Error("The brief compiler runs on Vercel. Locally, use `npx vercel dev` from the repo root, or write the brief yourself.");
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.error ?? `The brief compiler said ${r.status}.`);
  return body as BriefResponse;
}

export const emptyBrief = (rules: E.RuleSet): E.Brief => E.validateBrief({}, {
  rules: rules.list.map((r) => ({ name: r.name, kind: r.kind })), snippets: [], patterns: [],
}).brief;

type CitedKey = { [K in keyof E.Brief]: E.Brief[K] extends E.Cited<unknown> | null ? K : never }[keyof E.Brief];

/** Set (or clear, with null) a cited field by hand. */
export function setCited<K extends CitedKey>(b: E.Brief, key: K, value: NonNullable<E.Brief[K]>["value"] | null): E.Brief {
  if (value === null) return { ...b, [key]: null };
  const old = b[key] as E.Cited<unknown> | null;
  if (old && JSON.stringify(old.value) === JSON.stringify(value)) return b;
  return { ...b, [key]: { value, sources: [], note: BY_HAND } };
}

/** A number from an input: null when empty or not a number. */
export const numberOf = (raw: string, scale = 1): number | null => {
  if (raw.trim() === "") return null;
  const v = Number(raw);
  return Number.isFinite(v) ? v / scale : null;
};

/** One key of a weights field (programme mix, objective weights) set or cleared. */
export function setWeight<K extends "programme_mix" | "objective_weights">(b: E.Brief, key: K, k: string, w: number | null): E.Brief {
  const next = { ...(b[key]?.value ?? {}) } as Record<string, number>;
  if (w === null) delete next[k]; else next[k] = Math.min(Math.max(w, 0), 1);
  return setCited(b, key, Object.keys(next).length ? next as never : null);
}

export function setRange(b: E.Brief, k: E.RangeKey, lo: number | null, hi: number | null): E.Brief {
  const next = { ...(b.gene_ranges?.value ?? {}) };
  const [dlo, dhi] = E.DEFAULT_RANGES[k];
  if (lo === null && hi === null) delete next[k];
  else {
    const a = Math.min(Math.max(lo ?? dlo, dlo), dhi), z = Math.min(Math.max(hi ?? dhi, dlo), dhi);
    next[k] = [Math.min(a, z), Math.max(a, z)];
  }
  return setCited(b, "gene_ranges", Object.keys(next).length ? next : null);
}

/** Add, reweight or remove (weight null) an item of a ranked list (typologies, aesthetics). */
export function setRanked<K extends "typology_priors" | "aesthetic_priorities">(b: E.Brief, key: K,
  field: "type" | "metric", name: string, w: number | null): E.Brief {
  const list = [...((b[key]?.value ?? []) as { weight: number }[])] as ({ weight: number } & Record<string, unknown>)[];
  const k = list.findIndex((x) => x[field] === name);
  if (w === null) { if (k >= 0) list.splice(k, 1); }
  else if (k >= 0) list[k] = { ...list[k], weight: Math.min(Math.max(w, 0), 1) };
  else list.push({ [field]: name, weight: Math.min(Math.max(w, 0), 1) });
  return setCited(b, key, list.length ? list as never : null);
}

export function setRuleChange(b: E.Brief, rule: string, change: Partial<Omit<E.RuleChange, "rule">> | null): E.Brief {
  const list = b.rule_changes.filter((c) => c.rule !== rule);
  if (change === null) return { ...b, rule_changes: list };
  const old = b.rule_changes.find((c) => c.rule === rule);
  const next: E.RuleChange = { ...(old ?? { rule, sources: [], note: "" }), ...change, rule, sources: [], note: BY_HAND };
  for (const k of ["enabled", "max_levels", "min_permeable"] as const) if (next[k] === undefined || next[k] === null) delete next[k];
  const at = b.rule_changes.findIndex((c) => c.rule === rule);
  if (at < 0) list.push(next); else list.splice(at, 0, next);
  return { ...b, rule_changes: list };
}

export function togglePattern(b: E.Brief, id: number, on: boolean): E.Brief {
  const list = b.patterns.filter((p) => p.id !== id);
  if (on) list.push({ id, sources: [], note: BY_HAND });
  return { ...b, patterns: list.sort((x, y) => x.id - y.id) };
}

export const setTags = (b: E.Brief, text: string): E.Brief =>
  ({ ...b, tags: [...new Set(text.split(",").map((t) => t.trim()).filter((t) => t && t.length <= 40))].slice(0, 8) });

/** A brief file to download: the brief and the snippets it cites (pc brief <site> <file>). */
export function briefFile(site: string, brief: E.Brief, snippets: Snippet[]) {
  const cited = new Set<string>();
  for (const v of Object.values(brief)) if (v && typeof v === "object" && "sources" in v) for (const s of (v as E.Cited<unknown>).sources) cited.add(s);
  for (const x of [...brief.rule_changes, ...brief.patterns]) for (const s of x.sources) cited.add(s);
  return { format: "permutation-city-brief", version: brief.version, site, brief, snippets: snippets.filter((s) => cited.has(s.id)) };
}

/** A short, readable line for each value a brief sets (for the chapters and the summary). */
export function describe(b: E.Brief): string[] {
  const out: string[] = [];
  const tag = (c: { sources: string[] }) => (c.sources.length ? "" : " (assumed)");
  if (b.floor_area_ha) out.push(`${b.floor_area_ha.value.toLocaleString("en-IN")} ha of floor area${tag(b.floor_area_ha)}`);
  else if (b.fsi) out.push(`FSI ${b.fsi.value}${tag(b.fsi)}`);
  const h = E.heightLimit(b);
  if (h !== null) out.push(`up to ${h} storeys${b.height_limit_levels ? tag(b.height_limit_levels) : " (pattern 21)"}`);
  if (b.ground_coverage_max) out.push(`coverage up to ${Math.round(b.ground_coverage_max.value * 100)}%${tag(b.ground_coverage_max)}`);
  if (b.design_storm_mm) out.push(`${b.design_storm_mm.value} mm storm${tag(b.design_storm_mm)}`);
  if (b.gene_ranges) out.push(`${Object.keys(b.gene_ranges.value).length} gene ranges narrowed`);
  if (b.rule_changes.length) out.push(`${b.rule_changes.length} rule change${b.rule_changes.length > 1 ? "s" : ""}`);
  if (b.patterns.length) out.push(`patterns ${b.patterns.map((p) => p.id).join(", ")}`);
  return out;
}
