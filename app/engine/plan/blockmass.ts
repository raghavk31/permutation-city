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
import { intersect, type Poly, polysArea, subtract, unite } from "./clipper.js";
import type { Built, Roof } from "../typology/grammar.js";
import { area, centroid, convexHull, inside, obb, type Line, type Pt } from "./geom.js";
import { built, PRECEDENT } from "./precedents.js";

/** A building of the default massing: a footprint (anticlockwise, world metres) with its courts
 *  and wells as holes (clockwise), its base (m) and its storeys; a whole building (not trimmed
 *  by the land's edge) keeps its precedent's roof, one over each unit or wing (roofs). */
export interface Mass { ring: Line; holes?: Line[]; z: number; storeys: number; block: number; roof?: { kind: Roof; pitch?: number; ridgeShort?: boolean; rise?: number }; roofs?: Line[] }

/** Flag a lot whose massing misses its promised floor area by more than this share. */
export const GAP_FLAG = 0.1;

/** Buildings, or what the land's edge leaves of them, under this (m²) are dropped. */
const MIN_PIECE_M2 = 25;
/** At the land's edge a unit or wing is kept where at least this share of it is on the lot's
 *  land (all its plots together), so the edge trims a building by whole units rather than
 *  slicing it (design). */
const KEEP_OF_UNIT = 0.85;

/** A house narrower than this (m) doesn't stand alone where the land's edge trims its terrace
 *  to it (design). */
const NARROW_M = 6;
const narrowest = (r: Line) => Math.min(...r.map((p, i) => Math.hypot(r[(i + 1) % r.length][0] - p[0], r[(i + 1) % r.length][1] - p[1])));

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


/** What every layout of one lot's land reads, worked out once per land: the box tiles are laid
 *  in, the plots joined into the lot's outline (the lines between its plots never cut a
 *  building), and its area. */
interface Prepared { box: ReturnType<typeof obb>; land: Poly[]; parts: { outer: Line; holes: Line[]; bb: number[] }[]; bounds: number[]; own: number; mask: Mask }
/** The lot's land on a grid of CELL_M cells: 0 off, 1 on, 2 at the edge (tested exactly). */
interface Mask { x0: number; y0: number; nx: number; ny: number; v: Uint8Array }
const CELL_M = 2;
function maskOf(rings: Line[], [a, b, c, e]: number[]): Mask {
  const x0 = a - CELL_M, y0 = b - CELL_M, nx = Math.ceil((c - a) / CELL_M) + 3, ny = Math.ceil((e - b) / CELL_M) + 3, v = new Uint8Array(nx * ny);
  // rows by scanline, even-odd over every ring (the joined land's rings don't overlap)
  for (let j = 0; j < ny; j++) {
    const y = y0 + (j + 0.5) * CELL_M, xs: number[] = [];
    for (const r of rings) for (let k = 0; k < r.length; k++) {
      const [px, py] = r[k], [qx, qy] = r[(k + 1) % r.length];
      if ((py > y) !== (qy > y)) xs.push(px + ((y - py) / (qy - py)) * (qx - px));
    }
    xs.sort((m, n) => m - n);
    for (let k = 0; k + 1 < xs.length; k += 2)
      for (let i = Math.max(0, Math.ceil((xs[k] - x0) / CELL_M - 0.5)); i < nx && x0 + (i + 0.5) * CELL_M < xs[k + 1]; i++) v[j * nx + i] = 1;
  }
  // cells an edge passes through are tested exactly (walked in steps of a tenth of a cell)
  for (const r of rings) for (let k = 0; k < r.length; k++) {
    const [px, py] = r[k], [qx, qy] = r[(k + 1) % r.length], n = Math.ceil(Math.hypot(qx - px, qy - py) / (CELL_M / 10)) + 1;
    for (let t = 0; t <= n; t++) {
      const i = Math.floor((px + ((qx - px) * t) / n - x0) / CELL_M), j = Math.floor((py + ((qy - py) * t) / n - y0) / CELL_M);
      if (i >= 0 && j >= 0 && i < nx && j < ny) v[j * nx + i] = 2;
    }
  }
  return { x0, y0, nx, ny, v };
}
const PREPARED = new WeakMap<Line[], Prepared>();
function prepared(land: Line[]): Prepared {
  let p = PREPARED.get(land);
  if (!p) {
    let hull = convexHull(land.flat());
    if (area(hull) < 0) hull = [...hull].reverse();
    const lot = unite(land.map((r) => ({ outer: r, holes: [] })));
    const parts = lot.map((pg) => ({ ...pg, bb: bb(pg.outer) }));
    const bounds = bb(land.flat());
    p = { box: obb(hull), land: lot, parts, bounds, own: land.reduce((a, r) => a + Math.abs(area(r)), 0), mask: maskOf(lot.flatMap((q) => [q.outer, ...q.holes]), bounds) };
    PREPARED.set(land, p);
  }
  return p;
}
function onLand(pre: Prepared, q: Pt): boolean {
  const m = pre.mask, i = Math.floor((q[0] - m.x0) / CELL_M), j = Math.floor((q[1] - m.y0) / CELL_M);
  if (i < 0 || j < 0 || i >= m.nx || j >= m.ny) return false;
  const c = m.v[j * m.nx + i];
  return c === 2 ? onLandExact(pre, q) : c === 1;
}
const onLandExact = (pre: Prepared, q: Pt) => pre.parts.some((t) => q[0] >= t.bb[0] - 1e-6 && q[0] <= t.bb[2] + 1e-6 && q[1] >= t.bb[1] - 1e-6 && q[1] <= t.bb[3] + 1e-6
  && (inside(t.outer, q) || nearRing(t.outer, q)) && !t.holes.some((h) => inside(h, q) && !nearRing(h, q)));
/** The share of a unit on the land, from a grid of points over its outline read off the
 *  land's grid, a point in an edge cell counting half (a unit is small beside a lot, so a 6 x 6
 *  grid reads it to a few percent, enough to judge KEEP_OF_UNIT). */
/** What the land's grid holds under a box: 0 off the land, 1 all on it, 2 some of each. */
function under(m: Mask, [a, b, c, e]: number[]): number {
  const i0 = Math.max(0, Math.floor((a - m.x0) / CELL_M)), i1 = Math.min(m.nx - 1, Math.floor((c - m.x0) / CELL_M));
  const j0 = Math.max(0, Math.floor((b - m.y0) / CELL_M)), j1 = Math.min(m.ny - 1, Math.floor((e - m.y0) / CELL_M));
  if (i0 > i1 || j0 > j1) return 0;
  const first = m.v[j0 * m.nx + i0];
  if (first === 2) return 2;
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (m.v[j * m.nx + i] !== first) return 2;
  return first;
}
function shareOnLand(pre: Prepared, r: Line): number {
  const [a, b, c, e] = bb(r), N = 6, m = pre.mask, all = under(m, [a, b, c, e]);
  if (all !== 2) return all;
  if (r.length === 4) {
    // a rectangle (a unit, a wing): points spread over it in its own frame
    const [o, p1, , p3] = r;
    let on = 0;
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const s = (i + 0.5) / N, t = (j + 0.5) / N, x = o[0] + s * (p1[0] - o[0]) + t * (p3[0] - o[0]), y = o[1] + s * (p1[1] - o[1]) + t * (p3[1] - o[1]);
      const ci = Math.floor((x - m.x0) / CELL_M), cj = Math.floor((y - m.y0) / CELL_M);
      if (ci >= 0 && cj >= 0 && ci < m.nx && cj < m.ny) on += [0, 1, 0.5][m.v[cj * m.nx + ci]];
    }
    return on / (N * N);
  }
  let n = 0, on = 0;
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const p: Pt = [a + ((i + 0.5) / N) * (c - a), b + ((j + 0.5) / N) * (e - b)];
    if (!inside(r, p)) continue;
    n++;
    const ci = Math.floor((p[0] - m.x0) / CELL_M), cj = Math.floor((p[1] - m.y0) / CELL_M);
    if (ci >= 0 && cj >= 0 && ci < m.nx && cj < m.ny) on += [0, 1, 0.5][m.v[cj * m.nx + ci]];
  }
  return n ? on / n : 0;
}
/** On a ring's edge, within a millimetre (a unit's corner on the lot's outline counts as on it). */
function nearRing(r: Line, [x, y]: Pt) {
  for (let i = 0; i < r.length; i++) {
    const [ax, ay] = r[i], [bx, by] = r[(i + 1) % r.length], dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2)) : 0;
    if (Math.hypot(ax + t * dx - x, ay + t * dy - y) < 1e-3) return true;
  }
  return false;
}

/** A lot's typing as massing reads it: its block, precedent, storeys, the coverage and FSI it
 *  gives, and the caps it was thinned to (coverage, FSI; 0 for none; without them, its own
 *  coverage and FSI). */
export interface Typed { block: number; type: number; precedent: string; storeys: number; gsi: number; fsi: number; land: number; cap?: [number, number] }

/** A piece of a laid-out precedent: g is its tile, the unit thinning leaves out whole; a
 *  building's outline with its courts and wells as holes; whole where the land left all of it. */
interface Piece { ring: Line; holes: Line[]; z: number; storeys: number; g: number; a: number; ground: boolean; whole: boolean; roof?: Mass["roof"]; roofs?: Line[] }

/** How many tiles of a w x d plot fit an L x W box, either way round. */
export function tiles(w: number, d: number, L: number, W: number): { nU: number; nV: number; turned: boolean } | null {
  const a = { nU: Math.floor(L / w), nV: Math.floor(W / d), turned: false };
  const b = { nU: Math.floor(L / d), nV: Math.floor(W / w), turned: true };
  const best = b.nU * b.nV > a.nU * a.nV ? b : a;
  return best.nU * best.nV > 0 ? best : null;
}

/** A precedent's buildings in its own plan: the solids of one base and height that touch,
 *  joined into one outline (a row of shared-wall houses one terrace, a court's wings one ring,
 *  a well a hole), each with the solids (units, wings) it was joined from. */
interface Building { outer: Line; holes: Line[]; members: number[]; z: number }
const BUILDINGS = new Map<string, Building[]>();
function buildingsOf(key: string, solids: Built["solids"]): Building[] {
  let out = BUILDINGS.get(key);
  if (out) return out;
  out = [];
  const groups = new Map<string, number[]>();
  solids.forEach((s, i) => { const k = `${s.z.toFixed(2)}|${s.storeys}`; groups.set(k, [...(groups.get(k) ?? []), i]); });
  for (const idx of groups.values()) {
    const u = unite(idx.map((i) => ({ outer: solids[i].ring, holes: [] })));
    const parts = u.map((pg) => ({ ...pg, members: [] as number[], z: solids[idx[0]].z }));
    for (const i of idx) {
      const c = centroid(solids[i].ring);
      (parts.find((b) => inside(b.outer, c)) ?? parts.reduce((m, b) => (Math.abs(area(b.outer)) > Math.abs(area(m.outer)) ? b : m))).members.push(i);
    }
    out.push(...parts.filter((b) => b.members.length));
  }
  BUILDINGS.set(key, out);
  return out;
}

/** A layout's geometry, shared by every storey count that leaves the precedent's plan as it
 *  is: pieces with the index of the building each is. */
interface Shape { pieces: (Pick<Piece, "ring" | "holes" | "g" | "a" | "whole" | "roofs"> & { bi: number })[] }
const LAID = new WeakMap<Line[], Map<string, { pieces: Piece[]; foot: number; floor: number } | null>>();
const SHAPES = new WeakMap<Line[], Map<string, Shape | null>>();

/** A precedent at n storeys laid over a lot, unthinned: its pieces, ground coverage and floor
 *  area (m²); null where not one tile fits. Cached per land. */
export function layLot(id: string, n: number, land: Line[], exact = true) {
  let per = LAID.get(land), shapes = SHAPES.get(land);
  if (!per) LAID.set(land, (per = new Map()));
  if (!shapes) SHAPES.set(land, (shapes = new Map()));
  const key = `${id}:${n}:${exact}`;
  if (per.has(key)) return per.get(key)!;
  const p = PRECEDENT.get(id);
  const b = p && land.length ? built(p, n) : null;
  const solids = b ? b.solids.filter((s) => s.use === "built" && (s.storeys ?? 0) > 0 && s.ring.length >= 3) : [];
  // storey counts that change only the floors share one geometry
  let sig = `${id}|${b?.plot.w}|${b?.plot.d}|${solids.length}|${exact}`;
  for (const s of solids) sig += `|${s.ring[0][0].toFixed(2)},${s.ring[0][1].toFixed(2)},${s.z.toFixed(2)}`;
  const bs = b ? buildingsOf(sig, solids) : [];
  let shape = shapes.get(sig);
  if (shape === undefined) shapes.set(sig, (shape = b && solids.length ? shapeOf(b.plot.w, b.plot.d, bs, solids, land, exact) : null));
  if (!shape) { per.set(key, null); return null; }
  const zBase = Math.min(...solids.map((s) => s.z));
  const pieces: Piece[] = [];
  let foot = 0, floor = 0;
  for (const q of shape.pieces) {
    // (the joined outlines are shared by every height of this plan: storeys from the solids)
    const B = bs[q.bi], s = solids[B.members[0]], storeys = s.storeys!, ground = B.z <= zBase + 0.01;
    const roof = q.roofs && s.roof && s.roof !== "flat" ? { kind: s.roof, pitch: s.pitch, ridgeShort: s.ridgeShort, rise: s.rise } : undefined;
    pieces.push({ ring: q.ring, holes: q.holes, z: B.z, storeys, g: q.g, a: q.a, ground, whole: q.whole, ...(roof ? { roof, roofs: q.roofs } : {}) });
    if (ground) foot += q.a;
    floor += q.a * storeys;
  }
  const out = { pieces, foot, floor };
  per.set(key, out);
  return out;
}

/** A tile of w x d holding these buildings, repeated over the oriented bounding box of the
 *  land. At the land's edge a building is trimmed by whole units or wings, never sliced: a
 *  unit stays where KEEP_OF_UNIT of it is on the land (the sliver it overhangs cut off), the
 *  rest are left out; null where not one tile fits. */
function shapeOf(w: number, d: number, bs: Building[], solids: Built["solids"], land: Line[], exact: boolean): Shape | null {
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
    const to = (r: Line, ccw: boolean): Line => {
      const o = r.map(([x, y]) => at(u0 + i * tu + (turned ? y : x), v0 + j * tv + (turned ? x : y)));
      return (area(o) > 0) === ccw ? o : o.reverse();
    };
    bs.forEach((B, bi) => {
      const outer = to(B.outer, true), holes = B.holes.map((h) => to(h, false)), own = Math.abs(area(outer)) - holes.reduce((s, h) => s + Math.abs(area(h)), 0);
      const box = bb(outer), here = under(pre.mask, box);
      if (here === 0) return;
      // whole on the land: as drawn, with its roofs
      if (here === 1 || outer.every((p) => onLand(pre, p))) {
        pieces.push({ ring: outer, holes, g, a: own, whole: true, bi, roofs: B.members.map((m) => to(solids[m].ring, true)) });
        return;
      }
      // at the edge: the units or wings mostly on the land, joined, the overhang cut off
      const kept: Poly[] = [];
      let held = 0, all = 0, over = false;
      for (const m of B.members) {
        const r = to(solids[m].ring, true), a = Math.abs(area(r));
        const share = shareOnLand(pre, r);
        all += a;
        if (share >= KEEP_OF_UNIT) { kept.push({ outer: r, holes: [] }); held += share * a; over ||= share < 1; }
      }
      // (units may overlap, a vault over a hall: the joined outline's area, in the share kept)
      held *= own / all;
      if (held < MIN_PIECE_M2) return;
      // a terrace of narrow houses trimmed to one house would stand as a fin: left out
      if (B.members.length > 1 && kept.length === 1 && narrowest(kept[0].outer) < NARROW_M) return;
      // to measure (choosing a type), its area from its units; the outline only to draw
      if (!exact) { pieces.push({ ring: outer, holes, g, a: held, whole: false, bi }); return; }
      // all its units kept: the building as joined; else what is left of it joined again
      let body: Poly[] = kept.length === B.members.length ? [{ outer, holes }] : unite(kept);
      if (kept.length < B.members.length && holes.length) body = subtract(body, holes.map((h) => ({ outer: h, holes: [] })));
      // the overhang of a unit kept at the edge cut off; units wholly on the land need no cut
      for (const pg of over ? intersect(body, pre.land) : body) {
        const a = polysArea([pg]);
        if (a >= MIN_PIECE_M2) pieces.push({ ring: pg.outer, holes: pg.holes, g, a, whole: false, bi });
      }
    });
  }
  return pieces.length ? { pieces } : null;
}

/** The share of a layout's tiles kept to hold it to a coverage and an FSI over its land. */
export const keepShare = (foot: number, floor: number, own: number, gsi: number, fsi: number) =>
  Math.min(1, gsi > 0 && foot > 0 ? (gsi * own) / foot : 1, fsi > 0 && floor > 0 ? (fsi * own) / floor : 1);

/** One lot's buildings. land: the lot's building plots. */
export function massLot(t: Typed, land: Line[], exact = true): { masses: Mass[]; gsi: number; fsi: number; tiles: number } {
  const lay = t.type >= 0 && land.length ? layLot(t.precedent, t.storeys, land, exact) : null;
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
    masses.push({ ring: p.ring, ...(p.holes.length ? { holes: p.holes } : {}), z: p.z, storeys: p.storeys, block: t.block, ...(p.roof ? { roof: p.roof, roofs: p.roofs } : {}) });
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
