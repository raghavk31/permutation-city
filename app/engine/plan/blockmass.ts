// Default massing of every typed lot (architecture-v3 12.12, decision 1; docs/built-form.md,
// "Precedents as types"): a lot's buildings are its precedent's, the seed built at the lot's
// storeys (precedents.ts) and tiled over the oriented bounding box of the lot's plots, each
// solid clipped to the plots. The same layout the lot's density was measured on when its type
// was chosen (blocktypes.ts), so the two agree.
//
// The consistency check (same decision): what the massing delivers, floor area over the lot's
// land, against what the type promised. A gap over GAP_FLAG is flagged.
//
// A lot the rules cap below its precedent's layout (coverage, or FAR) is thinned to the cap:
// whole tiles left out, spread evenly over the lot by error diffusion, so a pol stays a pol with
// fewer houses rather than thinner ones.
import type { Roof } from "../typology/grammar.js";
import { area, convexHull, obb, type Line, type Pt } from "./geom.js";
import { built, PRECEDENT } from "./precedents.js";

/** A building of the default massing: a footprint (anticlockwise, world metres), its base (m)
 *  and its storeys; a whole building (not cut by the land's edge) keeps its precedent's roof. */
export interface Mass { ring: Line; z: number; storeys: number; block: number; roof?: { kind: Roof; pitch?: number; ridgeShort?: boolean; rise?: number } }

/** Flag a lot whose massing misses its promised floor area by more than this share. */
export const GAP_FLAG = 0.1;

/** Buildings with less than this on the land are dropped, and pieces of a kept building
 *  smaller than SLIVER_M2 (m²). */
const MIN_PIECE_M2 = 25, SLIVER_M2 = 2;
/** A building is drawn only where at least this share of its footprint is on the lot's land
 *  (all its plots together), so the land's edge leaves buildings out rather than cutting them
 *  to slivers (design). */
const KEEP_OF_BUILDING = 0.6;

/** Thin a layout only where it covers more than its cap by this share. */
const THIN_OVER = 0.02;

/** A polygon clipped by a convex, anticlockwise window (Sutherland and Hodgman 1974). */
export function clip(subject: Line, win: Line): Line {
  let out = subject;
  for (let i = 0; i < win.length && out.length; i++) {
    const a = win[i], b = win[(i + 1) % win.length];
    const side = (p: Pt) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
    const inp = out; out = [];
    for (let j = 0; j < inp.length; j++) {
      const p = inp[j], q = inp[(j + 1) % inp.length], sp = side(p), sq = side(q);
      if (sp >= 0) out.push(p);
      if ((sp >= 0) !== (sq >= 0)) { const t = sp / (sp - sq); out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); }
    }
  }
  return out;
}

const bb = (r: Line) => { let a = Infinity, b = Infinity, c = -Infinity, e = -Infinity; for (const [x, y] of r) { a = Math.min(a, x); b = Math.min(b, y); c = Math.max(c, x); e = Math.max(e, y); } return [a, b, c, e]; };

/** What every layout of one lot's land reads, worked out once per land. */
const PREPARED = new WeakMap<Line[], { box: ReturnType<typeof obb>; boxes: number[][]; own: number }>();
function prepared(land: Line[]) {
  let p = PREPARED.get(land);
  if (!p) {
    let hull = convexHull(land.flat());
    if (area(hull) < 0) hull = [...hull].reverse();
    p = { box: obb(hull), boxes: land.map(bb), own: land.reduce((a, r) => a + Math.abs(area(r)), 0) };
    PREPARED.set(land, p);
  }
  return p;
}

/** A lot's typing as massing reads it: its block, precedent, storeys, the coverage and FSI it
 *  gives, and the caps it was thinned to (coverage, FSI; 0 for none; without them, its own
 *  coverage and FSI). */
export interface Typed { block: number; type: number; precedent: string; storeys: number; gsi: number; fsi: number; land: number; cap?: [number, number] }

/** A piece of a laid-out precedent: g is its tile, the unit thinning leaves out whole; whole
 *  where the land didn't cut it. */
interface Piece { ring: Line; z: number; storeys: number; g: number; a: number; ground: boolean; whole: boolean; roof?: Mass["roof"] }

/** How many tiles of a w x d plot fit an L x W box, either way round. */
export function tiles(w: number, d: number, L: number, W: number): { nU: number; nV: number; turned: boolean } | null {
  const a = { nU: Math.floor(L / w), nV: Math.floor(W / d), turned: false };
  const b = { nU: Math.floor(L / d), nV: Math.floor(W / w), turned: true };
  const best = b.nU * b.nV > a.nU * a.nV ? b : a;
  return best.nU * best.nV > 0 ? best : null;
}

/** A layout's geometry, shared by every storey count that leaves the precedent's plan as it
 *  is: pieces with the index of the solid each was cut from. */
interface Shape { pieces: (Omit<Piece, "storeys" | "z" | "ground" | "roof"> & { si: number })[] }
const LAID = new WeakMap<Line[], Map<string, { pieces: Piece[]; foot: number; floor: number } | null>>();
const SHAPES = new WeakMap<Line[], Map<string, Shape | null>>();

/** A precedent at n storeys laid over a lot, unthinned: its pieces, ground coverage and floor
 *  area (m²); null where not one tile fits. Cached per land. */
export function layLot(id: string, n: number, land: Line[]) {
  let per = LAID.get(land), shapes = SHAPES.get(land);
  if (!per) LAID.set(land, (per = new Map()));
  if (!shapes) SHAPES.set(land, (shapes = new Map()));
  const key = `${id}:${n}`;
  if (per.has(key)) return per.get(key)!;
  const p = PRECEDENT.get(id), pre = prepared(land);
  const b = p && land.length ? built(p, n) : null;
  const solids = b ? b.solids.filter((s) => s.use === "built" && (s.storeys ?? 0) > 0 && s.ring.length >= 3) : [];
  // storey counts that change only the floors share one geometry
  let sig = `${id}|${b?.plot.w}|${b?.plot.d}|${solids.length}`;
  for (const s of solids) sig += `|${s.ring[0][0].toFixed(2)},${s.ring[0][1].toFixed(2)},${s.z.toFixed(2)}`;
  let shape = shapes.get(sig);
  if (shape === undefined) shapes.set(sig, (shape = b && solids.length ? shapeOf(b.plot.w, b.plot.d, solids.map((s) => s.ring), land) : null));
  if (!shape) { per.set(key, null); return null; }
  const zBase = Math.min(...solids.map((s) => s.z));
  const pieces: Piece[] = [];
  let foot = 0, floor = 0;
  for (const q of shape.pieces) {
    const s = solids[q.si], ground = s.z <= zBase + 0.01;
    const roof = q.whole && s.roof && s.roof !== "flat" ? { kind: s.roof, pitch: s.pitch, ridgeShort: s.ridgeShort, rise: s.rise } : undefined;
    pieces.push({ ring: q.ring, z: s.z, storeys: s.storeys!, g: q.g, a: q.a, ground, whole: q.whole, roof });
    if (ground) foot += q.a;
    floor += q.a * s.storeys!;
  }
  const out = { pieces, foot, floor };
  per.set(key, out);
  return out;
}

/** A tile of w x d holding these footprints, repeated over the oriented bounding box of the
 *  land and clipped to it; null where not one tile fits. */
function shapeOf(w: number, d: number, rings: [number, number][][], land: Line[]): Shape | null {
  const pre = prepared(land), box = pre.box, L = 2 * box.hl, W = 2 * box.hw;
  const fit = tiles(w, d, L, W);
  if (!fit) return null;
  const { nU, nV, turned } = fit, tu = turned ? d : w, tv = turned ? w : d;
  const u0 = (L - nU * tu) / 2, v0 = (W - nV * tv) / 2, hl = L / 2, hw = W / 2;
  // local (u along the box's length, v across) to world, the box's corner at (0, 0)
  const at = (u: number, v: number): Pt => [box.c[0] + (u - hl) * box.ux - (v - hw) * box.uy, box.c[1] + (u - hl) * box.uy + (v - hw) * box.ux];
  const pieces: Shape["pieces"] = [];
  for (let i = 0; i < nU; i++) for (let j = 0; j < nV; j++) {
    const g = i * nV + j;
    rings.forEach((r, si) => {
      let win = r.map(([x, y]) => at(u0 + i * tu + (turned ? y : x), v0 + j * tv + (turned ? x : y)));
      if (area(win) < 0) win = win.reverse();
      const [qa, qb, qc, qe] = bb(win), mine: Shape["pieces"] = [], own = Math.abs(area(win));
      let held = 0;
      for (let li = 0; li < land.length; li++) {
        const [ra, rb, rc, re] = pre.boxes[li];
        if (ra > qc || rc < qa || rb > qe || re < qb) continue;
        const piece = clip(land[li], win);
        const a = piece.length >= 3 ? Math.abs(area(piece)) : 0;
        if (a < 1e-6) continue;
        held += a;
        mine.push({ ring: area(piece) > 0 ? piece : [...piece].reverse(), g, a, si, whole: false });
      }
      // one piece holding all of the building: it keeps its own outline, and its roof
      if (mine.length === 1 && mine[0].a >= 0.99 * own) { mine[0].ring = win; mine[0].whole = true; }
      // a building mostly off the land is left out, not cut to a sliver
      // (a building kept keeps every piece the plot lines cut it into, bar slivers)
      if (held >= KEEP_OF_BUILDING * own && held >= MIN_PIECE_M2) pieces.push(...mine.filter((q) => q.a >= SLIVER_M2));
    });
  }
  return pieces.length ? { pieces } : null;
}

/** The share of a layout's tiles kept to hold it to a coverage and an FSI over its land. */
export const keepShare = (foot: number, floor: number, own: number, gsi: number, fsi: number) =>
  Math.min(1, gsi > 0 && foot > 0 ? (gsi * own) / foot : 1, fsi > 0 && floor > 0 ? (fsi * own) / floor : 1);

/** One lot's buildings. land: the lot's building plots. */
export function massLot(t: Typed, land: Line[]): { masses: Mass[]; gsi: number; fsi: number; tiles: number } {
  const lay = t.type >= 0 && land.length ? layLot(t.precedent, t.storeys, land) : null;
  if (!lay) return { masses: [], gsi: 0, fsi: 0, tiles: 0 };
  const own = prepared(land).own, [cg, cf] = t.cap ?? [t.gsi, t.fsi], f = keepShare(lay.foot, lay.floor, own, cg, cf);
  let keep = (_: number) => true;
  if (f < 1 / (1 + THIN_OVER)) {
    // tiles kept in their order while the floor kept stays under the share of the floor passed
    // (error diffusion), so the ones left out are spread evenly
    const by = new Map<number, number>();
    for (const p of lay.pieces) by.set(p.g, (by.get(p.g) ?? 0) + p.a * p.storeys);
    const kept = new Set<number>();
    let passed = 0, held = 0;
    for (const [g, a] of by) { passed += a; if (held + a <= f * passed + a / 2) { kept.add(g); held += a; } }
    keep = (g) => kept.has(g);
  }
  const masses: Mass[] = [];
  let foot = 0, floor = 0;
  const drawn = new Set<number>();
  for (const p of lay.pieces) if (keep(p.g)) {
    drawn.add(p.g);
    masses.push({ ring: p.ring, z: p.z, storeys: p.storeys, block: t.block, ...(p.roof ? { roof: p.roof } : {}) });
    if (p.ground) foot += p.a;
    floor += p.a * p.storeys;
  }
  // over the plots' own area, so a type's promise and its check count the same land
  return { masses, gsi: own ? foot / own : 0, fsi: own ? floor / own : 0, tiles: drawn.size };
}

export interface MassCheck { block: number; type: number; promised: number; massed: number; gap: number; flagged: boolean }

/** Every typed lot massed, and the consistency check per lot and per family. landOf: the lot's
 *  building plots. */
export function massPlan<T extends Typed>(types: readonly T[], landOf: (t: T) => Line[], families = 4) {
  const masses: Mass[] = [], checks: MassCheck[] = [];
  for (const t of types) {
    if (t.type < 0) continue;
    const m = massLot(t, landOf(t));
    masses.push(...m.masses);
    const gap = t.fsi > 0 ? (t.fsi - m.fsi) / t.fsi : 0;
    checks.push({ block: t.block, type: t.type, promised: t.fsi, massed: m.fsi, gap, flagged: Math.abs(gap) > GAP_FLAG });
  }
  const byType = Array.from({ length: families }, (_, k) => {
    const cs = checks.filter((c) => c.type === k), ts = types.filter((t) => t.type === k);
    const promised = ts.reduce((s, t) => s + t.fsi * t.land, 0), massed = cs.reduce((s, c, i) => s + c.massed * ts[i].land, 0);
    const gap = promised > 0 ? (promised - massed) / promised : 0;
    return { type: k, blocks: cs.length, promised, massed, gap, flagged: Math.abs(gap) > GAP_FLAG };
  });
  return { masses, checks, byType };
}
