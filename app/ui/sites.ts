// Where sites come from, and how edited rules travel with them.
//
// A site is either precomputed (public/sites/<id>.json, from `pc export`) or built by the
// layer service (a 24-character key; <service>/results/<key>.json). Edited rules go in the
// URL as their changes from the site's own rules (?site=<id or key>&rules=<base64url JSON>),
// so a link reproduces the same ground and stays short. A confirmed brief travels the same
// way (&brief=<base64url JSON>), and is checked and applied again when the link is opened.
import * as E from "../engine";

export const DATA = `${import.meta.env.BASE_URL}sites/`;
export const SERVICE: string | null = (import.meta.env.VITE_SERVICE_URL as string | undefined)?.replace(/\/$/, "")
  || (import.meta.env.DEV ? "http://localhost:8765" : null);

export const isServiceKey = (id: string) => /^[0-9a-f]{24}$/.test(id);

export function siteUrl(id: string): string {
  if (isServiceKey(id)) {
    if (!SERVICE) throw new Error("This site was built by the layer service, which isn't set up for this copy of the app.");
    return `${SERVICE}/results/${id}.json`;
  }
  if (!/^[a-z0-9-]+$/.test(id)) throw new Error(`No site called ${id}`);
  return `${DATA}${id}.json`;
}

export async function fetchSite(id: string): Promise<E.SiteExport> {
  const r = await fetch(siteUrl(id));
  if (!r.ok) throw new Error(r.status === 404 ? "That site isn't there any more. Draw it again." : `Couldn't load the site (${r.status}).`);
  return r.json();
}

type Patch = [number, E.Condition, E.RuleLimits][];

function toBase64Url(text: string): string {
  let s = "";
  for (const b of new TextEncoder().encode(text)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): string {
  const s = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  return new TextDecoder().decode(Uint8Array.from(s, (c) => c.charCodeAt(0)));
}

/** The rules as their changes from `base` (each changed rule's id, condition and limits). */
export function encodeRules(rules: E.RuleSet, base: E.RuleSet): string {
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  const patch: Patch = rules.list
    .filter((r, k) => !same(r.when, base.list[k]?.when) || !same(r.limits, base.list[k]?.limits))
    .map((r) => [r.id, r.when, r.limits]);
  return toBase64Url(JSON.stringify(patch));
}

/** `base` with the changes from a link applied. */
export function decodeRules(text: string, base: E.RuleSet): E.RuleSet {
  let patch: Patch;
  try {
    patch = JSON.parse(fromBase64Url(text));
    if (!Array.isArray(patch)) throw new Error();
  } catch {
    throw new Error("The rules in this link can't be read.");
  }
  const byId = new Map(patch.map(([id, when, limits]) => [id, { when, limits }]));
  return { ...base, list: base.list.map((r) => (byId.has(r.id) ? { ...r, ...byId.get(r.id)! } : r)) };
}

/** The site as these rules leave it: rule states and reasons on the grid, and the design
 *  ground rebuilt (what the engine grows on). The site file itself is not changed. */
export function withRules(site: E.SiteExport, rules: E.RuleSet): { site: E.SiteExport; result: E.RuleResult } {
  const result = E.applyRules(rules, site.grid.layers!, site.grid.x.length);
  const design = E.designFromRules(site, result);
  const n = design.x.length, cellArea = site.meta.cell_area;
  const next: E.SiteExport = {
    ...site,
    rules,
    grid: { ...site.grid, state: Array.from(result.state), reasons: result.reasons, memberships: Array.from(result.memberships) },
    design,
    meta: { ...site.meta, design_ha: Math.round(n * cellArea / 1e3) / 10 },
  };
  const G = E.prepare(next);
  next.meta.target_ha = Math.round(E.floorAreaTarget(G) / 1e3) / 10;
  return { site: next, result };
}

/** Site id, edited rules and brief (still encoded) from the URL. */
export function fromUrl(): { id: string | null; rules: string | null; brief: string | null } {
  const q = new URLSearchParams(location.search);
  const id = q.get("site");
  // Only names a site can have: the id goes into the page.
  return { id: id && /^[a-z0-9-]{1,64}$/.test(id) ? id : null, rules: q.get("rules"), brief: q.get("brief") };
}

/** A confirmed brief in a link: the brief, and whether to start from its typology seeds. */
export interface LinkedBrief { brief: E.Brief; seeds: boolean }

export const encodeBrief = (b: LinkedBrief) => toBase64Url(JSON.stringify(b));

export function decodeBrief(text: string): LinkedBrief {
  try {
    const v = JSON.parse(fromBase64Url(text));
    if (typeof v !== "object" || v === null || !("brief" in v)) throw new Error();
    return { brief: v.brief, seeds: v.seeds === true };
  } catch {
    throw new Error("The brief in this link can't be read.");
  }
}

/** Check a brief again against a site's rules. It keeps the citations and patterns it
 *  already had (they were checked when it was made). */
export function recheck(brief: unknown, rules: E.RuleSet): { brief: E.Brief; warnings: string[] } {
  const b = (typeof brief === "object" && brief ? brief : {}) as Partial<E.Brief>;
  const ids = new Set<string>();
  const add = (s: unknown) => { if (Array.isArray(s)) for (const x of s) if (typeof x === "string") ids.add(x); };
  for (const v of Object.values(b)) if (v && typeof v === "object" && "sources" in v) add((v as { sources: unknown }).sources);
  for (const v of [...(Array.isArray(b.rule_changes) ? b.rule_changes : []), ...(Array.isArray(b.patterns) ? b.patterns : [])]) add(v?.sources);
  const patterns = Array.isArray(b.patterns) ? b.patterns.map((p) => p?.id).filter((x): x is number => typeof x === "number") : [];
  return E.validateBrief(brief, {
    rules: rules.list.map((r) => ({ name: r.name, kind: r.kind })), snippets: [...ids], patterns,
  });
}

/** A site under a brief: its targets and storm set, and the brief's rule changes applied
 *  on top of `rules` (the site's own, or as edited). Returns the run config too. */
export function withBrief(site: E.SiteExport, rules: E.RuleSet, brief: E.Brief) {
  const m = site.meta;
  const config = E.applyBrief(brief, {
    rules, meta: { target_far: m.target_far, target_floor_area_ha: m.target_floor_area_ha, design_storm_mm: m.design_storm_mm },
  });
  const targeted: E.SiteExport = { ...site, meta: { ...m, target_far: config.target_far,
    target_floor_area_ha: config.target_floor_area_ha, design_storm_mm: config.design_storm_mm } };
  return { ...withRules(targeted, config.rules), config };
}

/** The query string for a site with its rules (no rules if they are the site's own) and brief. */
export function query(id: string, rules: E.RuleSet | null, base: E.RuleSet | undefined, brief: LinkedBrief | null = null): string {
  const q = new URLSearchParams({ site: id });
  if (rules && base) {
    const text = encodeRules(rules, base);
    if (text !== encodeRules(base, base)) q.set("rules", text);
  }
  if (brief) q.set("brief", encodeBrief(brief));
  return `?${q}`;
}

export function evolveLink(id: string, rules: E.RuleSet | null, base: E.RuleSet | undefined,
  brief: LinkedBrief | null = null): string {
  return `${import.meta.env.BASE_URL}${query(id, rules, base, brief)}#pc-evolve`;
}
