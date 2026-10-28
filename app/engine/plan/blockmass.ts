// Default massing of every typed block (architecture-v3 12.12, decision 1): a block's buildings
// laid out by its type's own rules, so a courtyard block reads as courtyards and a row block as
// rows, never as plot extrusions. The same geometry the type's density was counted from
// (blocktypes.ts courtyardGsi, perimeterGsi, rowGsi, the towers' fit), laid in the oriented
// bounding box of the block's building plots, shrunk to the land's area as the arithmetic
// assumed (blocktypes.ts shapeOf), and clipped to the plots.
//
// The consistency check (same decision): what the massing delivers, coverage and floor area over
// the block's land, against what the type promised. A gap over GAP_FLAG is flagged; the gap is
// where a block's real shape (not a rectangle, cut by shared ground) loses what the arithmetic
// on its bounding box assumed.
import { STOREY_M } from "../config.js";
import { BLOCK_TYPES, BREAKS, COURT_MIN_M, COURT_OF_HEIGHT, GAP_M, PODIUM_STOREYS, ROW_GAP_OF_HEIGHT } from "./blocktypes.js";
import { area, convexHull, obb, offsetRing, type Line, type Pt } from "./geom.js";

/** A building of the default massing: a footprint (anticlockwise, world metres), its base and
 *  its storeys. */
export interface Mass { ring: Line; z: number; storeys: number; block: number }

/** Flag a type whose massing misses its promised floor area by more than this share. */
export const GAP_FLAG = 0.1;
/** A row or a perimeter wing is broken into pieces of at most this length (m), BREAKS of it open. */
const PIECE_M = 40;

/** Pieces of a building smaller than this after clipping are dropped (m²). */
const MIN_PIECE_M2 = 25;

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

/** What every layout of one block's land reads, worked out once per land. */
const PREPARED = new WeakMap<Line[], { box: ReturnType<typeof obb>; hull: Line; boxes: number[][]; own: number }>();
function prepared(land: Line[]) {
  let p = PREPARED.get(land);
  if (!p) {
    let hull = convexHull(land.flat());
    if (area(hull) < 0) hull = [...hull].reverse();
    p = { box: obb(hull), hull, boxes: land.map(bb), own: land.reduce((a, r) => a + Math.abs(area(r)), 0) };
    PREPARED.set(land, p);
  }
  return p;
}

export interface Typed { block: number; type: number; gsi: number; storeys: number; fsi: number; depth: number; towers: number; land: number }

/** One block's buildings. land: the block's building plots. */
export function massBlock(t: Typed, land: Line[]): { masses: Mass[]; gsi: number; fsi: number } {
  if (t.type < 0 || !land.length) return { masses: [], gsi: 0, fsi: 0 };
  const pre = prepared(land), box = pre.box;
  const L = 2 * box.hl, W = 2 * box.hw, hl = L / 2, hw = W / 2;
  // local (u along the length, v across) to world, the box's corner at (0, 0)
  const at = (u: number, v: number): Pt => [box.c[0] + (u - hl) * box.ux - (v - hw) * box.uy, box.c[1] + (u - hl) * box.uy + (v - hw) * box.ux];
  const rects: { u: number; v: number; du: number; dv: number; z: number; storeys: number }[] = [];
  // convex windows in world coordinates, for wings that follow the block's outline
  const wins: { ring: Line; z: number; storeys: number }[] = [];
  const key = BLOCK_TYPES[t.type].key, d = t.depth, n = t.storeys, H = n * STOREY_M;
  const pieces = (u0: number, len: number, v: number, dv: number, z = 0, st = n) => {
    // a run broken into pieces with BREAKS of its length left open between them
    const k = Math.max(1, Math.ceil(len / PIECE_M)), open = k > 1 ? (BREAKS * len) / (k - 1) : 0, pl = (len - open * (k - 1)) / k;
    for (let j = 0; j < k; j++) rects.push({ u: u0 + j * (pl + open), v, du: pl, dv, z, storeys: st });
  };
  if (key === "courtyard") {
    const c = Math.max(COURT_MIN_M, COURT_OF_HEIGHT * H), side = c + 2 * d;
    const nW = Math.floor((W + GAP_M) / (side + GAP_M)), nL = Math.floor((L + GAP_M) / (side + GAP_M));
    const Lu = nL ? (L - (nL - 1) * GAP_M) / nL : 0;
    for (let i = 0; i < nL; i++) for (let j = 0; j < nW; j++) {
      const u = i * (Lu + GAP_M), v = j * (side + GAP_M);
      rects.push({ u, v, du: Lu, dv: d, z: 0, storeys: n }, { u, v: v + side - d, du: Lu, dv: d, z: 0, storeys: n },
        { u, v: v + d, du: d, dv: side - 2 * d, z: 0, storeys: n }, { u: u + Lu - d, v: v + d, du: d, dv: side - 2 * d, z: 0, storeys: n });
    }
  } else if (key === "perimeter") {
    // one ring of depth d along the outline of the land (its convex hull), each side broken
    // for passages
    const hull = pre.hull, inner = offsetRing(hull, d);
    if (inner) for (let i = 0; i < hull.length; i++) {
      const j = (i + 1) % hull.length, a = hull[i], b = hull[j], ai = inner[i], bi = inner[j];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const k = Math.max(1, Math.ceil(len / PIECE_M)), open = k > 1 ? BREAKS / (k - 1) : 0, pl = (1 - open * (k - 1)) / k;
      const mix = (p: Pt, q: Pt, f: number): Pt => [p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f];
      for (let m = 0; m < k; m++) {
        const f0 = m * (pl + open), f1 = f0 + pl;
        // the inner edge's ends, between the corner mitres, at the same fractions
        wins.push({ ring: [mix(a, b, f0), mix(a, b, f1), mix(ai, bi, f1), mix(ai, bi, f0)], z: 0, storeys: n });
      }
    }
  } else if (key === "row") {
    const gap = Math.max(ROW_GAP_OF_HEIGHT * H, GAP_M), r = Math.floor((W - d) / (d + gap)) + 1;
    const used = r * d + (r - 1) * gap, v0 = (W - used) / 2;
    for (let j = 0; j < r; j++) pieces(0, L, v0 + j * (d + gap), d);
  } else {
    // podium with towers: the podium at the type's coverage, centred; towers along its length
    const pod = Math.min(PODIUM_STOREYS, n), a = Math.sqrt(Math.max(t.gsi, 0) * t.land / (L * W || 1));
    const pu = L * a, pv = W * a;
    rects.push({ u: (L - pu) / 2, v: (W - pv) / 2, du: pu, dv: pv, z: 0, storeys: pod });
    for (let k = 0; k < t.towers; k++) {
      const cu = (L * (k + 1)) / (t.towers + 1);
      rects.push({ u: cu - d / 2, v: (W - d) / 2, du: d, dv: d, z: pod * STOREY_M, storeys: n - pod });
    }
  }
  // each building clipped to the block's building plots; slivers dropped
  const masses: Mass[] = [];
  let foot = 0, floor = 0;
  for (const q of rects) if (q.du > 0.5 && q.dv > 0.5) wins.push({ ring: [at(q.u, q.v), at(q.u + q.du, q.v), at(q.u + q.du, q.v + q.dv), at(q.u, q.v + q.dv)], z: q.z, storeys: q.storeys });
  const boxes = pre.boxes;
  for (const q of wins) {
    if (q.storeys <= 0) continue;
    const rect = q.ring, [qa, qb, qc, qe] = bb(rect);
    for (let li = 0; li < land.length; li++) {
      const r = land[li], [ra, rb, rc, re] = boxes[li];
      if (ra > qc || rc < qa || rb > qe || re < qb) continue;
      const piece = clip(r, area(rect) > 0 ? rect : [...rect].reverse());
      const a = piece.length >= 3 ? Math.abs(area(piece)) : 0;
      if (a < MIN_PIECE_M2) continue;
      masses.push({ ring: area(piece) > 0 ? piece : [...piece].reverse(), z: q.z, storeys: q.storeys, block: t.block });
      if (q.z === 0) foot += a;
      floor += a * q.storeys;
    }
  }
  // over the plots' own area, so a type's promise and its check count the same land
  const own = pre.own;
  return { masses, gsi: own ? foot / own : 0, fsi: own ? floor / own : 0 };
}

export interface MassCheck { block: number; type: number; promised: number; massed: number; gap: number; flagged: boolean }

/** Every typed block massed, and the consistency check per block and per type. */
export function massPlan(types: readonly Typed[], landOf: (block: number) => Line[]) {
  const masses: Mass[] = [], checks: MassCheck[] = [];
  for (const t of types) {
    if (t.type < 0) continue;
    const m = massBlock(t, landOf(t.block));
    masses.push(...m.masses);
    const gap = t.fsi > 0 ? (t.fsi - m.fsi) / t.fsi : 0;
    checks.push({ block: t.block, type: t.type, promised: t.fsi, massed: m.fsi, gap, flagged: Math.abs(gap) > GAP_FLAG });
  }
  // per type: floor area promised and massed over all its blocks
  const byType = BLOCK_TYPES.map((_, k) => {
    const cs = checks.filter((c) => c.type === k), ts = types.filter((t) => t.type === k);
    const promised = ts.reduce((s, t) => s + t.fsi * t.land, 0), massed = cs.reduce((s, c, i) => s + c.massed * ts[i].land, 0);
    const gap = promised > 0 ? (promised - massed) / promised : 0;
    return { type: k, blocks: cs.length, promised, massed, gap, flagged: Math.abs(gap) > GAP_FLAG };
  });
  return { masses, checks, byType };
}
