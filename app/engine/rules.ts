// The McHarg rules, run in the browser exactly as pc/rules.py runs them, so a person can
// edit a threshold and see the map change without the layer service. Rules overlap: a cell
// keeps every rule it matches (a bitmask), and their limits combine.
import type { Condition, LayerTable, Rule, RuleSet } from "./types.js";

export const STATES = ["forbidden", "retained", "constrained", "open"] as const;
export const FORBIDDEN = 0, RETAINED = 1, CONSTRAINED = 2, OPEN = 3;

export class MissingLayer extends Error {
  constructor(public layer: string) { super(`no layer ${layer}`); }
}

const OPS: Record<string, (a: number, b: number) => boolean> = {
  ">": (a, b) => a > b, ">=": (a, b) => a >= b, "<": (a, b) => a < b, "<=": (a, b) => a <= b,
  "==": (a, b) => a === b, "!=": (a, b) => a !== b,
};

/** Where a condition holds (1) on every cell. */
export function evaluate(c: Condition, layers: LayerTable, n: number): Uint8Array {
  if ("all" in c) {
    const out = evaluate(c.all[0], layers, n);
    for (const p of c.all.slice(1)) { const m = evaluate(p, layers, n); for (let i = 0; i < n; i++) out[i] &= m[i]; }
    return out;
  }
  if ("any" in c) {
    const out = evaluate(c.any[0], layers, n);
    for (const p of c.any.slice(1)) { const m = evaluate(p, layers, n); for (let i = 0; i < n; i++) out[i] |= m[i]; }
    return out;
  }
  if ("not" in c) {
    const m = evaluate(c.not, layers, n);
    for (let i = 0; i < n; i++) m[i] = m[i] ? 0 : 1;
    return m;
  }
  const col = layers[c.layer];
  if (!col) throw new MissingLayer(c.layer);
  const out = new Uint8Array(n);
  if (c.op !== undefined) {
    const f = OPS[c.op], v = c.value as number;
    for (let i = 0; i < n; i++) out[i] = f(col[i] ?? NaN, v) ? 1 : 0;
  } else {
    for (let i = 0; i < n; i++) out[i] = (col[i] ?? NaN) !== 0 ? 1 : 0;
  }
  return out;
}

export function layersUsed(c: Condition): Set<string> {
  if ("all" in c) return new Set(c.all.flatMap((p) => [...layersUsed(p)]));
  if ("any" in c) return new Set(c.any.flatMap((p) => [...layersUsed(p)]));
  if ("not" in c) return layersUsed(c.not);
  return new Set([c.layer]);
}

/** Per-cell results of a rule set (pc.rules.combine). */
export interface RuleResult {
  n: number;
  state: Uint8Array;            // FORBIDDEN, RETAINED, CONSTRAINED, OPEN
  memberships: Uint32Array;     // bit k: rule k
  maxLevels: Int32Array;
  minPermeable: Float64Array;
  uses: string[];               // comma-separated, in the defaults' order
  conflict: Uint8Array;         // its rules' uses don't overlap
  roles: string[];              // comma-separated, sorted
  reasons: string[];
  raisedGround: Uint8Array;
  remediate: Uint8Array;
  skipped: string[];            // rules naming a layer this site doesn't have
  hits: Uint8Array[];           // each rule's cells
}

export function applyRules(rules: RuleSet, layers: LayerTable, n: number): RuleResult {
  const list = rules.list, d = rules.defaults;
  const skipped: string[] = [];
  const hits = list.map((r) => {
    try { return evaluate(r.when, layers, n); }
    catch (e) {
      if (!(e instanceof MissingLayer)) throw e;
      skipped.push(r.name);
      return new Uint8Array(n);
    }
  });

  const member = new Uint32Array(n);
  const maxLevels = new Int32Array(n).fill(d.max_levels);
  const minPermeable = new Float64Array(n).fill(d.min_permeable);
  const raisedGround = new Uint8Array(n), remediate = new Uint8Array(n);
  const forbidden = new Uint8Array(n), retained = new Uint8Array(n), constrained = new Uint8Array(n);
  list.forEach((r, k) => {
    const m = hits[k], bit = (1 << r.id) >>> 0, lim = r.limits;
    const flag = r.kind === "forbidden" ? forbidden : r.kind === "retained" ? retained : constrained;
    for (let i = 0; i < n; i++) {
      if (!m[i]) continue;
      member[i] = (member[i] | bit) >>> 0;
      flag[i] = 1;
      if (r.kind !== "constrained") continue;
      if (lim.max_levels !== undefined) maxLevels[i] = Math.min(maxLevels[i], lim.max_levels);
      if (lim.min_permeable !== undefined) minPermeable[i] = Math.max(minPermeable[i], lim.min_permeable);
      if (lim.raised_ground) raisedGround[i] = 1;
      if (lim.remediate) remediate[i] = 1;
    }
  });

  const state = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    state[i] = forbidden[i] ? FORBIDDEN : retained[i] ? RETAINED : constrained[i] ? CONSTRAINED : OPEN;
  }

  const order = [...list.filter((r) => r.kind === "constrained"), ...list.filter((r) => r.kind === "retained"),
    ...list.filter((r) => r.kind === "forbidden")];
  const useRules = list.filter((r) => r.kind === "constrained" && r.limits.uses !== undefined);
  const has = (bits: number, r: Rule) => ((bits >>> r.id) & 1) === 1;
  const reasons: string[] = [], uses: string[] = [], roles: string[] = [];
  const conflict = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const bits = member[i];
    reasons.push(order.filter((r) => has(bits, r)).map((r) => r.name).join("; "));
    const rs = new Set<string>();
    for (const r of list) if (has(bits, r)) for (const x of r.roles) rs.add(x);
    roles.push([...rs].sort().join(","));
    const sets = useRules.filter((r) => has(bits, r)).map((r) => new Set(r.limits.uses));
    let keep = d.uses.filter((u) => sets.every((s) => s.has(u)));
    if (sets.length && !keep.length) {
      keep = d.uses.filter((u) => sets.some((s) => s.has(u)));
      conflict[i] = 1;
    }
    uses.push(keep.join(","));
  }

  // Forbidden and retained cells are fixed: nothing is built there.
  for (let i = 0; i < n; i++) {
    if (state[i] === FORBIDDEN || state[i] === RETAINED) {
      maxLevels[i] = 0;
      minPermeable[i] = 1.0;
      uses[i] = state[i] === FORBIDDEN ? "water,wetland,landscape" : "";
      conflict[i] = 0;
    }
  }
  return { n, state, memberships: member, maxLevels, minPermeable, uses, conflict, roles, reasons,
    raisedGround, remediate, skipped, hits };
}
