// A design a person holds (docs/architecture-v3.md section 15.11, step I1). An option is what the search
// found; a design is what someone keeps working on. It says only what was chosen on each stretch: fits and
// scores are always worked out from it, so every limit is checked on every change and nothing goes stale.
import type { Shape } from "../typology/openshape.js";
import type { EdgeRead } from "./edge.js";
import { fitStretch, type StretchFit, type Works } from "./edgeform.js";
import { pathJoins, type Score, WHEELCHAIR_SLOPE } from "./edgescore.js";
import { type EdgeOption, type Values, valuesOf } from "./edgesearch.js";
import type { Place } from "./place.js";

export interface StretchChoice {
  shape: Shape; works: Works; keepGround: boolean; pathD: number | undefined;
  /** Where it came from: an option's id, a precedent's id, or "kept" for the ground left alone by hand. */
  from: string;
}

export interface EdgeDesign {
  /** The option it started from, if any. */
  basedOn: string | null;
  stretches: Record<string, StretchChoice>;
  /** What the search that last made it valued, and what it held still, so that can be questioned. */
  searched?: { values: Values; locked: string[]; works: Works; seed: number };
}

/** A design that starts as an option exactly. */
export function designOf(o: EdgeOption): EdgeDesign {
  const stretches: Record<string, StretchChoice> = {};
  for (const s of o.stretches) stretches[s.id] = { shape: s.shape, works: o.works, keepGround: s.keepGround, pathD: s.pathD, from: o.id };
  return { basedOn: o.id, stretches, searched: { values: valuesOf(o.direction), locked: [], works: o.works, seed: 1 } };
}

/** Change one stretch, or with null leave it as it is today. Everything else stays the same object. */
export function withStretch(d: EdgeDesign, id: string, choice: StretchChoice | null): EdgeDesign {
  const { [id]: _, ...rest } = d.stretches;
  return { ...d, stretches: choice ? { ...rest, [id]: choice } : rest };
}

const fitted = new WeakMap<EdgeRead, WeakMap<StretchChoice, StretchFit>>();

/** Every chosen stretch fitted, in order along the banks. A choice is only fitted once on a given reading of the banks. */
export function fitDesign(place: Place, read: EdgeRead, d: EdgeDesign): StretchFit[] {
  let memo = fitted.get(read);
  if (!memo) { memo = new WeakMap(); fitted.set(read, memo); }
  const out: StretchFit[] = [];
  for (const b of read.banks) for (const s of b.stretches) {
    const c = d.stretches[s.id];
    if (!c) continue;
    let f = memo.get(c);
    if (!f) { f = fitStretch(place, read, b.id, s.id, c.shape, c.works, { keepGround: c.keepGround, pathD: c.pathD }); memo.set(c, f); }
    out.push(f);
  }
  return out;
}

/** Whether a fitted stretch goes beyond the rules as reported: judged from what's in it, not how it was asked for. */
export function goesBeyond(f: StretchFit): boolean {
  if (f.sections.some((s) => s.elements.some((e) => e.works === "hard"))) return true;
  return f.stretch.law === "prohibited" && (f.cut + f.fill > 0 || f.sections.some((s) => s.path));
}

/** What makes a design a what-if: one such stretch makes the whole of it one (section 15.11, Q3). */
export function whatIfStretches(fits: StretchFit[]): string[] {
  return fits.filter(goesBeyond).map((f) => f.stretch.id);
}

export interface DesignChange {
  /** Stretches that differ from the option, or that it no longer has. */
  stretches: string[];
  /** Each measure that moved, from the option's value to the design's. */
  measures: { key: string; words: string; unit: string; from: number | null; to: number | null; better: boolean | null }[];
  /** Lengths of path steeper for a wheelchair than the option's, by the stretches they join. */
  steeper: string[];
}

const steepJoins = (read: EdgeRead, fits: StretchFit[]) => new Set(pathJoins(read, fits).filter((j) => j.slope > WHEELCHAIR_SLOPE).map((j) => (j.stretches[0] === j.stretches[1] ? j.stretches[0] : j.stretches.join(" to "))));

/** What a design has changed against the option it came from. */
export function changesFrom(read: EdgeRead, o: EdgeOption, d: EdgeDesign, scores: Score[], fits: StretchFit[]): DesignChange {
  const base = designOf(o);
  const same = (a: StretchChoice | undefined, b: StretchChoice | undefined) => !!a && !!b && a.works === b.works && a.keepGround === b.keepGround && a.pathD === b.pathD && JSON.stringify(a.shape) === JSON.stringify(b.shape);
  const ids = [...new Set([...Object.keys(base.stretches), ...Object.keys(d.stretches)])];
  const stretches = ids.filter((id) => !same(base.stretches[id], d.stretches[id]));
  const measures = scores.flatMap((s) => {
    const was = o.scores.find((x) => x.key === s.key);
    if (!was || was.design === s.design) return [];
    const up = s.design !== null && was.design !== null ? s.design > was.design : null;
    return [{ key: s.key, words: s.words, unit: s.unit, from: was.design, to: s.design, better: up === null || s.better === null ? null : s.better === "up" ? up : !up }];
  });
  const before = steepJoins(read, o.fits), now = steepJoins(read, fits);
  return { stretches, measures, steeper: [...now].filter((j) => !before.has(j)) };
}
