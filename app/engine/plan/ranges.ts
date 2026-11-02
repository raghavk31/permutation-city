// Ranges for a precedent's settings (architecture-v3 section 13, B3 and B7), shared by one
// plot's search (massing/precedent.ts) and the urban scale's lot typing (blocktypes.ts). User,
// 30 October: typologies as parameter ranges, from case studies too. Each setting starts from
// the precedent's own value and may move between RANGE[0] and RANGE[1] times it, held inside the
// spread of its family in the library but always including its own; units in a row down to
// one, rows by one either way, the gap from shared walls to twice its own.
import type { Params } from "../typology/grammar.js";
import { LIBRARY } from "../typology/library.js";
import { familyOf } from "./precedents.js";

/** A setting may move from RANGE[0] to RANGE[1] times its own value (assumed). */
export const RANGE: [number, number] = [0.6, 1.6];

export const SETTINGS = ["width", "depth", "count", "rows", "court", "street", "gap"] as const;
export type Setting = (typeof SETTINGS)[number];
export const SETTING_WORDS: Record<Setting, string> = {
  width: "unit width", depth: "unit depth", count: "units in a row", rows: "rows", court: "court", street: "street or lane", gap: "gap between units",
};
/** Which settings an arrangement uses. */
export const USES: Partial<Record<Params["arrangement"], Setting[]>> = {
  row: ["width", "depth", "count", "rows", "street", "gap"],
  cluster: ["width", "depth", "count", "rows", "court", "street", "gap"],
  ring: ["width", "depth", "count", "court"],
  court: ["width", "depth", "court"],
  slab: ["width", "depth", "street"],
  tower: ["width", "depth", "street"],
  shed: ["width", "depth", "count", "street"],
};
export const INTEGER = new Set<Setting>(["count", "rows"]);
/** A setting's value in a seed when it doesn't say (grammar.ts defaults). */
const DEFAULT: Record<Setting, number> = { width: 8, depth: 10, count: 6, rows: 1, court: 10, street: 4, gap: 0 };
export const valueOf = (s: Params, k: Setting) => (s[k] as number | undefined) ?? DEFAULT[k];

/** The spread of each setting over the building precedents of each family (from the library). */
const SPREAD = (() => {
  const out = new Map<number, Record<Setting, [number, number]>>();
  for (const p of LIBRARY) {
    const f = familyOf(p.seed.arrangement);
    if (f < 0) continue;
    const r = out.get(f) ?? (Object.fromEntries(SETTINGS.map((k) => [k, [Infinity, -Infinity]])) as Record<Setting, [number, number]>);
    for (const k of SETTINGS) if (p.seed[k] != null) { const v = valueOf(p.seed, k); r[k] = [Math.min(r[k][0], v), Math.max(r[k][1], v)]; }
    out.set(f, r);
  }
  return out;
})();

/** A setting's range for a seed (its own value, or a donor's, as the centre). */
export function rangeOf(seed: Params, k: Setting, centre = valueOf(seed, k)): [number, number] {
  const v = centre, fam = SPREAD.get(familyOf(seed.arrangement))?.[k] ?? [v, v];
  if (k === "count") return [1, Math.max(v, Math.round(v * RANGE[1]))];
  if (k === "rows") return [1, v + 1];
  if (k === "gap") return [0, Math.max(3, v * 2)];
  const lo = Math.max(Number.isFinite(fam[0]) ? Math.min(fam[0], v) : 0, v * RANGE[0], k === "street" ? 2 : k === "court" ? 3 : 2.5);
  const hi = Math.min(Number.isFinite(fam[1]) ? Math.max(fam[1], v) : Infinity, v * RANGE[1]);
  return [Math.min(lo, v), Math.max(hi, v)];
}

/** The seed at its smallest: every setting at the bottom of its range (whether it can fit at all). */
export const smallest = (s: Params): Params => {
  const q: Params = { ...s };
  for (const k of USES[s.arrangement] ?? []) if (k !== "court" && k !== "gap") (q as unknown as Record<string, number>)[k] = rangeOf(s, k)[0];
  if (q.count !== s.count || q.rows !== s.rows) delete q.omit;
  return q;
};
