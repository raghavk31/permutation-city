// Where sites come from, and how edited rules travel with them.
//
// A site is either precomputed (public/sites/<id>.json, from `pc export`) or built by the
// layer service (a 24-character key; <service>/results/<key>.json). Edited rules go in the
// URL as their changes from the site's own rules (?site=<id or key>&rules=<base64url JSON>),
// so a link reproduces the same ground and stays short.
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

/** The rules as their changes from `base` (each changed rule's id, condition and limits). */
export function encodeRules(rules: E.RuleSet, base: E.RuleSet): string {
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  const patch: Patch = rules.list
    .filter((r, k) => !same(r.when, base.list[k]?.when) || !same(r.limits, base.list[k]?.limits))
    .map((r) => [r.id, r.when, r.limits]);
  const bytes = new TextEncoder().encode(JSON.stringify(patch));
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** `base` with the changes from a link applied. */
export function decodeRules(text: string, base: E.RuleSet): E.RuleSet {
  let patch: Patch;
  try {
    const s = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
    patch = JSON.parse(new TextDecoder().decode(Uint8Array.from(s, (c) => c.charCodeAt(0))));
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

/** Site id and edited rules (still encoded: they need the site's own rules) from the URL. */
export function fromUrl(): { id: string | null; rules: string | null } {
  const q = new URLSearchParams(location.search);
  const id = q.get("site");
  // Only names a site can have: the id goes into the page.
  return { id: id && /^[a-z0-9-]{1,64}$/.test(id) ? id : null, rules: q.get("rules") };
}

/** The query string for a site with its rules (no rules if they are the site's own). */
export function query(id: string, rules: E.RuleSet | null, base: E.RuleSet | undefined): string {
  const q = new URLSearchParams({ site: id });
  if (rules && base) {
    const text = encodeRules(rules, base);
    if (text !== encodeRules(base, base)) q.set("rules", text);
  }
  return `?${q}`;
}

export function evolveLink(id: string, rules: E.RuleSet | null, base: E.RuleSet | undefined): string {
  return `${import.meta.env.BASE_URL}${query(id, rules, base)}#pc-evolve`;
}
