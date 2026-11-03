// Each public space's form, evolved (architecture-v3 section 14.6, step P5): placement is by rule
// (shared.ts), the shape is searched within its family's genes (typology/openshape.ts). A small
// search per space, on the measures alone (no drawing): it starts from every library precedent
// of the family, read into the genes, keeps the best, then mutates one or two genes at a time
// within their limits. Deterministic: the space's index seeds it.
//
// What a space is asked, by its jobs:
//   water        hold what it was placed for (need), twice the weight of anything else; then
//                stay usable when full
//   seats        steps and banks low enough to sit on, up to SEAT_FULL m per 100 m²
//   shade        its share of shaded ground, weighted up where heat matters
//   enclosure    a doorstep space between ENCLOSE (a pol's chowk to Paley Park), not a shaft
// A school's field is held to Japan's 30 cm (children's safety); other fields and basins to
// their family's limits.
import { needs } from "../typology/challenges.js";
import { CLIMATE } from "../typology/climate.js";
import { LIBRARY } from "../typology/library.js";
import { clampShape, familySpread, measureShape, OPEN_GENES, shapeOf, type OpenMeasures, type Shape, type ShapedFamily } from "../typology/openshape.js";
import type { Ground } from "../types.js";
import { climateWeights } from "./lotnature.js";
import type { PublicSpace } from "./shared.js";

export const FORM_STEPS = 40;
export const SEAT_FULL = 10;                       // m of seat per 100 m² that counts as full (assumed)
export const ENCLOSE: [number, number] = [0.8, 2]; // a doorstep space's edge height ÷ width, well liked (assumed from the library's spread)
export const SCHOOL_SUNK_M = 0.3;                  // Sapporo's schoolyards: 30 cm at most

let starts: Map<ShapedFamily, { id: string; s: Shape }[]> | null = null;
function startsOf(f: ShapedFamily) {
  if (!starts) {
    starts = new Map();
    for (const p of LIBRARY) {
      const fam = p.open?.family as ShapedFamily | undefined, s = fam && fam !== ("street" as string) ? shapeOf(p) : undefined;
      if (!fam || !s) continue;
      const l = starts.get(fam) ?? [];
      l.push({ id: p.id, s });
      starts.set(fam, l);
    }
  }
  return starts.get(f) ?? [];
}

/** How well a shape does a space's jobs (higher is better). */
export function formScore(f: ShapedFamily, m: OpenMeasures, need: number, hot: number): number {
  let v = 0.5 * Math.min(1, m.seats / SEAT_FULL) + (0.5 + hot) * m.shade;
  if (need > 0) v += 2 * Math.min(1, m.storage / need) + m.wetUse;
  if (f === "doorstep") {
    const e = m.enclosure, [lo, hi] = ENCLOSE;
    v += e < lo ? e / lo : e > hi ? Math.max(0, 1 - (e - hi) / hi) : 1;
  }
  return v;
}

/** A tiny seeded generator (mulberry32). */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** The shape for one space: its genes, the precedent it started from, what the shape gives. */
export function formOf(space: PublicSpace, hot: number, seed: number): { shape: Shape; like: string; m: OpenMeasures } | null {
  const f = space.family as ShapedFamily;
  if (!(f in OPEN_GENES) || space.area <= 0) return null;
  const genes = OPEN_GENES[f], need = space.need ?? 0, area = space.area;
  const limit = (s: Shape): Shape => {
    const c = clampShape(f, s);
    if (f === "field" && space.rule === "field") c.sunk = Math.min(c.sunk, SCHOOL_SUNK_M);
    if (f === "field" && space.rule !== "field" && need <= 0) c.sunk = 0;   // a dry park field isn't lowered
    if (f === "basin" && need <= 0) c.water = genes.find((g) => g.key === "water")!.lo;
    return c;
  };
  const score = (s: Shape) => formScore(f, measureShape(f, s, area, need), need, hot);
  let best: { s: Shape; v: number; like: string } | null = null;
  for (const st of startsOf(f)) {
    const s = limit(st.s), v = score(s);
    if (!best || v > best.v) best = { s, v, like: st.id };
  }
  if (!best) { const s = limit({}); best = { s, v: score(s), like: "" }; }
  const r = rng(seed * 2654435761 + 1);
  for (let k = 0; k < FORM_STEPS; k++) {
    const child: Shape = { ...best.s };
    for (let t = 0, n = r() < 0.5 ? 1 : 2; t < n; t++) {
      const g = genes[Math.floor(r() * genes.length)];
      child[g.key] = child[g.key] + (r() * 2 - 1) * 0.25 * (g.hi - g.lo);
    }
    const s = limit(child), v = score(s);
    if (v > best.v) best = { s, v, like: best.like };
  }
  return { shape: best.s, like: best.like, m: measureShape(f, best.s, area, need) };
}

/** Every space's form, in place: its shape, the precedent it grew from, its measures; water
 *  spaces then hold what their shape holds (up to what they were placed for). */
export function formSpaces(G: Ground, spaces: PublicSpace[], water: { need: number; held: number }): void {
  const n0 = CLIMATE.places[`site:${G.meta.id}`], { hot } = climateWeights(n0 ? needs(n0) : []);
  let held = 0, need = 0;
  spaces.forEach((sp, k) => {
    const out = formOf(sp, hot, k + 1);
    if (!out) return;
    sp.shape = Object.fromEntries(Object.entries(out.shape).map(([g, v]) => [g, +v.toFixed(3)]));
    sp.like = out.like;
    sp.measures = { storage: Math.round(out.m.storage), wetUse: +out.m.wetUse.toFixed(3), seats: +out.m.seats.toFixed(2), shade: +out.m.shade.toFixed(3), enclosure: +out.m.enclosure.toFixed(2) };
    if (sp.need) { sp.storage = Math.round(Math.min(sp.need, out.m.storage)); held += sp.storage; need += sp.need; }
  });
  water.held = Math.round(held); water.need = Math.round(need);
}

/** For the page: a family's spread over the library, cached. */
export const spreadOf = (() => { let c: ReturnType<typeof familySpread> | null = null; return () => (c ??= familySpread(LIBRARY)); })();
