// Plane geometry for the vector design (docs/architecture-v3.md section 3). Local metres, y up.
// No polygon library: every operation here is written out, so the Python port (Milestone B)
// can follow the same steps. Coordinates are quantised to millimetres where stages meet.
export type Pt = [number, number];
export type Line = Pt[];

/** Millimetres: where stages hand geometry on, so two runs agree to the last digit. */
export const q = (v: number) => Math.round(v * 1000) / 1000;
export const qp = (p: Pt): Pt => [q(p[0]), q(p[1])];

export const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);

export function length(l: Line): number {
  let s = 0;
  for (let k = 1; k < l.length; k++) s += dist(l[k - 1], l[k]);
  return s;
}

/** Signed area (anticlockwise positive). */
export function area(r: Line): number {
  let s = 0;
  for (let k = 0; k < r.length; k++) { const a = r[k], b = r[(k + 1) % r.length]; s += a[0] * b[1] - b[0] * a[1]; }
  return s / 2;
}

export function centroid(r: Line): Pt {
  let cx = 0, cy = 0, a = 0;
  for (let k = 0; k < r.length; k++) {
    const p = r[k], n = r[(k + 1) % r.length], c = p[0] * n[1] - n[0] * p[1];
    a += c; cx += (p[0] + n[0]) * c; cy += (p[1] + n[1]) * c;
  }
  if (Math.abs(a) < 1e-9) {
    let x = 0, y = 0;
    for (const p of r) { x += p[0]; y += p[1]; }
    return [x / r.length, y / r.length];
  }
  return [cx / (3 * a), cy / (3 * a)];
}

export function inside(r: Line, [x, y]: Pt): boolean {
  let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

/** Distance from p to segment ab, and the parameter of the nearest point on it. */
export function toSegment(p: Pt, a: Pt, b: Pt): { d: number; t: number; at: Pt } {
  const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? Math.min(Math.max(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2, 0), 1) : 0;
  const at: Pt = [a[0] + t * dx, a[1] + t * dy];
  return { d: dist(p, at), t, at };
}

/** Where segments ab and cd cross: parameters on each (0..1 inclusive), or null. */
export function cross(a: Pt, b: Pt, c: Pt, d: Pt): { s: number; t: number; at: Pt } | null {
  const rx = b[0] - a[0], ry = b[1] - a[1], sx = d[0] - c[0], sy = d[1] - c[1];
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-12) return null;
  const qx = c[0] - a[0], qy = c[1] - a[1];
  const s = (qx * sy - qy * sx) / den, t = (qx * ry - qy * rx) / den;
  if (s < -1e-9 || s > 1 + 1e-9 || t < -1e-9 || t > 1 + 1e-9) return null;
  return { s, t, at: [a[0] + s * rx, a[1] + s * ry] };
}

/** Douglas-Peucker simplification to a tolerance in metres (ends kept). */
export function simplify(l: Line, tol: number): Line {
  if (l.length < 3) return l.slice();
  const keep = new Uint8Array(l.length);
  keep[0] = keep[l.length - 1] = 1;
  const stack: [number, number][] = [[0, l.length - 1]];
  while (stack.length) {
    const [i, j] = stack.pop()!;
    let best = -1, bd = tol;
    for (let k = i + 1; k < j; k++) { const d = toSegment(l[k], l[i], l[j]).d; if (d > bd) { bd = d; best = k; } }
    if (best >= 0) { keep[best] = 1; stack.push([i, best], [best, j]); }
  }
  return l.filter((_, k) => keep[k]);
}

/** A line traced through cells (hex sides, lattice nodes) made into a street centreline. It is
 *  resampled, smoothed with a Gaussian along its length (`sigma` m), then simplified and
 *  splined. The ends stay put: the line is mirrored through each end point before smoothing,
 *  which keeps the end's direction too. Simplifying and splining alone keeps the cell
 *  zigzag's corners, and the spline swings through them, so the street snakes. Every
 *  cell-traced street goes through here; test/ui/smoothness.test.ts holds them to it. */
export function smoothTrace(l: Line, sigma: number, step = 6): Line {
  if (l.length < 3 || length(l) < 2 * sigma) return spline(simplify(l, 1), step);
  const h = Math.max(1, sigma / 4), r = resample(l, h), n = r.length;
  const k = Math.ceil((2.5 * sigma) / h), w = Array.from({ length: k + 1 }, (_, j) => Math.exp(-((j * h) ** 2) / (2 * sigma * sigma)));
  // Index i outside 0..n-1 reflects through the end point: p(-j) = 2 p(0) - p(j).
  const at = (i: number, c: number) => i < 0 ? 2 * r[0][c] - r[Math.min(-i, n - 1)][c]
    : i >= n ? 2 * r[n - 1][c] - r[Math.max(2 * (n - 1) - i, 0)][c] : r[i][c];
  const out: Line = r.map((p, i) => {
    if (i === 0 || i === n - 1) return p;
    let sx = 0, sy = 0, sw = 0;
    for (let j = -k; j <= k; j++) { const g = w[Math.abs(j)]; sx += g * at(i + j, 0); sy += g * at(i + j, 1); sw += g; }
    return [sx / sw, sy / sw];
  });
  return spline(simplify(out, Math.max(1, sigma / 8)), step);
}

/** How much a line snakes: short bends one way then the other, per km. The line is read
 *  every 10 m and turns in one direction are summed into a bend. A snake is a pair of
 *  neighbouring opposite bends, each at least 15° and no longer than 60 m. A real road's long,
 *  gentle S-bend doesn't count; the swing of a spline through a cell zigzag does. */
export function snakesPerKm(l: Line): number {
  const len = length(l);
  if (len < 50) return 0;
  const r = resample(l, 10), bends: { a: number; n: number }[] = [];
  let a = 0, n = 0;
  for (let i = 1; i < r.length - 1; i++) {
    const h0 = Math.atan2(r[i][1] - r[i - 1][1], r[i][0] - r[i - 1][0]);
    const h1 = Math.atan2(r[i + 1][1] - r[i][1], r[i + 1][0] - r[i][0]);
    const turn = Math.atan2(Math.sin(h1 - h0), Math.cos(h1 - h0));
    if (a && turn && Math.sign(turn) !== Math.sign(a)) { bends.push({ a, n }); a = 0; n = 0; }
    a += turn; n++;
  }
  bends.push({ a, n });
  const sharp = (b: { a: number; n: number }) => Math.abs(b.a) >= (15 * Math.PI) / 180 && b.n * 10 <= 60;
  let s = 0;
  for (let k = 1; k < bends.length; k++) if (sharp(bends[k]) && sharp(bends[k - 1])) s++;
  return (s / len) * 1000;
}

/** A centripetal Catmull-Rom spline through the points, `step` metres between samples (ends kept). */
export function spline(l: Line, step = 6): Line {
  if (l.length < 3) return l.slice();
  const p = [l[0], ...l, l[l.length - 1]], out: Line = [l[0]];
  for (let k = 1; k < p.length - 2; k++) {
    const [p0, p1, p2, p3] = [p[k - 1], p[k], p[k + 1], p[k + 2]];
    const t01 = Math.sqrt(dist(p0, p1)) || 1e-6, t12 = Math.sqrt(dist(p1, p2)) || 1e-6, t23 = Math.sqrt(dist(p2, p3)) || 1e-6;
    const m1 = [0, 1].map((c) => p2[c] - p1[c] + t12 * ((p1[c] - p0[c]) / t01 - (p2[c] - p0[c]) / (t01 + t12)));
    const m2 = [0, 1].map((c) => p2[c] - p1[c] + t12 * ((p3[c] - p2[c]) / t23 - (p3[c] - p1[c]) / (t12 + t23)));
    const n = Math.max(1, Math.ceil(dist(p1, p2) / step));
    for (let s = 1; s <= n; s++) {
      const t = s / n, t2 = t * t, t3 = t2 * t;
      const h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t, h01 = -2 * t3 + 3 * t2, h11 = t3 - t2;
      out.push([h00 * p1[0] + h10 * m1[0] + h01 * p2[0] + h11 * m2[0], h00 * p1[1] + h10 * m1[1] + h01 * p2[1] + h11 * m2[1]]);
    }
  }
  return out;
}

/** The line rebuilt as straights and circular arcs of radius `r`: simplified to its corners,
 *  then each corner cut back along both legs and joined by an arc (`step` m between points).
 *  A corner whose legs are too short for the arc gets the largest that fits (half of each
 *  leg, all of an end leg), so its radius may stay under `r`. Ends are kept. */
export function fillet(l: Line, r: number, step = 4): Line {
  const s = simplify(l, Math.min(0.25 * r, 8));  // coarse enough that a tight curve becomes one corner
  if (s.length < 3) return s;
  const out: Line = [s[0]];
  for (let k = 1; k < s.length - 1; k++) {
    const a = s[k - 1], b = s[k], c = s[k + 1], la = dist(a, b), lc = dist(b, c);
    const ux = (a[0] - b[0]) / la, uy = (a[1] - b[1]) / la, vx = (c[0] - b[0]) / lc, vy = (c[1] - b[1]) / lc;
    const half = Math.acos(Math.max(-1, Math.min(1, ux * vx + uy * vy))) / 2;  // half the angle at the corner
    const turn = Math.PI - 2 * half;
    if (turn < 1e-3 || half < 1e-3) { out.push(b); continue; }
    const t = Math.min(r / Math.tan(half), (k === 1 ? 1 : 0.5) * la, (k === s.length - 2 ? 1 : 0.5) * lc);
    const rr = t * Math.tan(half), bl = Math.hypot(ux + vx, uy + vy);
    const cx = b[0] + (ux + vx) / bl * (t / Math.cos(half)), cy = b[1] + (uy + vy) / bl * (t / Math.cos(half));
    const p1: Pt = [b[0] + ux * t, b[1] + uy * t], p2: Pt = [b[0] + vx * t, b[1] + vy * t];
    const a1 = Math.atan2(p1[1] - cy, p1[0] - cx);
    let sweep = Math.atan2(p2[1] - cy, p2[0] - cx) - a1;
    if (sweep > Math.PI) sweep -= 2 * Math.PI;
    if (sweep < -Math.PI) sweep += 2 * Math.PI;
    const n = Math.max(1, Math.ceil(Math.abs(sweep) * rr / step));
    for (let j = 0; j <= n; j++) out.push([cx + rr * Math.cos(a1 + sweep * j / n), cy + rr * Math.sin(a1 + sweep * j / n)]);
  }
  out.push(s[s.length - 1]);
  return out.filter((p, k) => k === 0 || dist(p, out[k - 1]) > 1e-6);
}

/** Points every `step` metres along a line (ends included). */
export function resample(l: Line, step: number): Line {
  const out: Line = [l[0]];
  let carry = 0;
  for (let k = 1; k < l.length; k++) {
    const a = l[k - 1], b = l[k], seg = dist(a, b);
    let at = step - carry;
    while (at <= seg) { const t = at / seg; out.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]); at += step; }
    carry = (carry + seg) % step;
  }
  const last = l[l.length - 1];
  if (dist(out[out.length - 1], last) > 1e-6) out.push(last);
  return out;
}

/** The turning radius at each interior point (m; Infinity on a straight run), from the
 *  circle through it and its neighbours. */
export function radii(l: Line): number[] {
  const out = [Infinity];
  for (let k = 1; k < l.length - 1; k++) {
    const [a, b, c] = [l[k - 1], l[k], l[k + 1]];
    const ab = dist(a, b), bc = dist(b, c), ca = dist(c, a), ar = Math.abs(area([a, b, c]));
    out.push(ar < 1e-9 ? Infinity : (ab * bc * ca) / (4 * ar));
  }
  out.push(Infinity);
  return out;
}

/** The angle (radians, 0..π) between two directions taken as undirected lines: 0 parallel. */
export function lineAngle(ax: number, ay: number, bx: number, by: number): number {
  const a = Math.atan2(ay, ax), b = Math.atan2(by, bx);
  let d = Math.abs(a - b) % Math.PI;
  if (d > Math.PI / 2) d = Math.PI - d;
  return d;
}

/** A grid index of segments for nearest and crossing queries. */
export class SegIndex {
  private cells = new Map<number, number[]>();
  readonly a: Pt[] = []; readonly b: Pt[] = []; readonly tag: number[] = [];
  constructor(readonly size = 40) {}
  private key(i: number, j: number) { return (i + 32768) * 65536 + (j + 32768); }
  add(a: Pt, b: Pt, tag: number) {
    const id = this.a.length;
    this.a.push(a); this.b.push(b); this.tag.push(tag);
    const s = this.size;
    const i0 = Math.floor(Math.min(a[0], b[0]) / s), i1 = Math.floor(Math.max(a[0], b[0]) / s);
    const j0 = Math.floor(Math.min(a[1], b[1]) / s), j1 = Math.floor(Math.max(a[1], b[1]) / s);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const k = this.key(i, j), c = this.cells.get(k);
      if (c) c.push(id); else this.cells.set(k, [id]);
    }
    return id;
  }
  addLine(l: Line, tag: number) { for (let k = 1; k < l.length; k++) this.add(l[k - 1], l[k], tag); }
  private stamp = new Int32Array(64); private now = 0;
  /** Segment ids whose boxes touch a box round p of half-size r (each once, in the order the
   *  grid holds them, which is the same on every run). */
  near(p: Pt, r: number): number[] {
    if (this.stamp.length < this.a.length) { const t = new Int32Array(this.a.length * 2); t.set(this.stamp); this.stamp = t; }
    const s = this.size, out: number[] = [], now = ++this.now;
    for (let i = Math.floor((p[0] - r) / s); i <= Math.floor((p[0] + r) / s); i++)
      for (let j = Math.floor((p[1] - r) / s); j <= Math.floor((p[1] + r) / s); j++) {
        const c = this.cells.get(this.key(i, j));
        if (c) for (const id of c) if (this.stamp[id] !== now) { this.stamp[id] = now; out.push(id); }
      }
    return out;
  }
  nearest(p: Pt, r: number, skip?: (id: number) => boolean): { id: number; d: number; at: Pt; t: number } | null {
    let best: { id: number; d: number; at: Pt; t: number } | null = null;
    for (const id of this.near(p, r)) {
      if (skip?.(id)) continue;
      const h = toSegment(p, this.a[id], this.b[id]);
      if (h.d <= r && (!best || h.d < best.d || (h.d === best.d && id < best.id))) best = { id, ...h };
    }
    return best;
  }
  /** The first crossing of segment pq with an indexed segment (nearest to p), skipping some. */
  firstCross(p: Pt, q2: Pt, skip?: (id: number) => boolean): { id: number; s: number; at: Pt } | null {
    const r = dist(p, q2) / 2 + 1, mid: Pt = [(p[0] + q2[0]) / 2, (p[1] + q2[1]) / 2];
    let best: { id: number; s: number; at: Pt } | null = null;
    for (const id of this.near(mid, r)) {
      if (skip?.(id)) continue;
      const c = cross(p, q2, this.a[id], this.b[id]);
      if (c && c.s > 1e-6 && (!best || c.s < best.s || (c.s === best.s && id < best.id))) best = { id, s: c.s, at: c.at };
    }
    return best;
  }
}

/** Oriented bounding box by rotating calipers over the convex hull: centre, unit axis along
 *  the long side, half-lengths. */
export function obb(r: Line): { c: Pt; ux: number; uy: number; hl: number; hw: number } {
  const hull = convexHull(r);
  let best = { a: Infinity, c: [0, 0] as Pt, ux: 1, uy: 0, hl: 0, hw: 0 };
  for (let k = 0; k < hull.length; k++) {
    const a = hull[k], b = hull[(k + 1) % hull.length], l = dist(a, b);
    if (l < 1e-9) continue;
    const ux = (b[0] - a[0]) / l, uy = (b[1] - a[1]) / l;
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const p of hull) {
      const u = p[0] * ux + p[1] * uy, v = -p[0] * uy + p[1] * ux;
      u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v);
    }
    const ar = (u1 - u0) * (v1 - v0);
    if (ar < best.a - 1e-9) {
      const cu = (u0 + u1) / 2, cv = (v0 + v1) / 2;
      const c: Pt = [cu * ux - cv * uy, cu * uy + cv * ux];
      const long = u1 - u0 >= v1 - v0;
      best = long ? { a: ar, c, ux, uy, hl: (u1 - u0) / 2, hw: (v1 - v0) / 2 }
        : { a: ar, c, ux: -uy, uy: ux, hl: (v1 - v0) / 2, hw: (u1 - u0) / 2 };
    }
  }
  return { c: best.c, ux: best.ux, uy: best.uy, hl: best.hl, hw: best.hw };
}

export function convexHull(pts: Line): Line {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const crossZ = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Line = [], upper: Line = [];
  for (const pt of p) { while (lower.length >= 2 && crossZ(lower[lower.length - 2], lower[lower.length - 1], pt) <= 0) lower.pop(); lower.push(pt); }
  for (let k = p.length - 1; k >= 0; k--) { const pt = p[k]; while (upper.length >= 2 && crossZ(upper[upper.length - 2], upper[upper.length - 1], pt) <= 0) upper.pop(); upper.push(pt); }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

/** Split a simple polygon by the infinite line through p with direction (dx, dy): the pieces
 *  on each side (a concave polygon can give more than one piece per side). */
export function splitPolygon(r: Line, p: Pt, dx: number, dy: number): Line[] {
  const side = (v: Pt) => (v[0] - p[0]) * dy - (v[1] - p[1]) * dx;
  const n = r.length, pts: { p: Pt; s: number; cut: boolean }[] = [];
  for (let k = 0; k < n; k++) {
    const a = r[k], b = r[(k + 1) % n], sa = side(a), sb = side(b);
    pts.push({ p: a, s: sa, cut: false });
    if ((sa > 0 && sb < 0) || (sa < 0 && sb > 0)) {
      const t = sa / (sa - sb);
      pts.push({ p: [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])], s: 0, cut: true });
    }
  }
  const cuts = pts.map((x, k) => (x.cut || x.s === 0 ? k : -1)).filter((k) => k >= 0);
  if (cuts.length < 2) return [r];
  // Order the cut points along the line; pair them (entering, leaving) to make the bridges.
  const along = (k: number) => (pts[k].p[0] - p[0]) * dx + (pts[k].p[1] - p[1]) * dy;
  const sorted = [...cuts].sort((a, b) => along(a) - along(b));
  const bridge = new Map<number, number>();
  for (let k = 0; k + 1 < sorted.length; k += 2) { bridge.set(sorted[k], sorted[k + 1]); bridge.set(sorted[k + 1], sorted[k]); }
  // Walk: at a cut point that has a bridge, jump across it.
  const used = new Uint8Array(pts.length), out: Line[] = [];
  for (let start = 0; start < pts.length; start++) {
    if (used[start] || pts[start].s === 0) continue;
    const ring: Line = [];
    let k = start;
    for (let guard = 0; guard < 4 * pts.length; guard++) {
      if (used[k] && k === start) break;
      used[k] = 1;
      ring.push(pts[k].p);
      if ((pts[k].cut || pts[k].s === 0) && bridge.has(k) && ring.length > 1) {
        const j = bridge.get(k)!;
        ring.push(pts[j].p); used[j] = 1;
        k = (j + 1) % pts.length;
      } else k = (k + 1) % pts.length;
      if (k === start) break;
    }
    if (ring.length >= 3 && Math.abs(area(ring)) > 1e-6) out.push(ring);
  }
  return out.length ? out : [r];
}

/** Offset a closed ring by d (positive moves towards the enclosed side for an anticlockwise
 *  ring), with miters capped at 2d. A ring that turns inside out comes back null. */
export function offsetRing(r: Line, d: number): Line | null {
  const n = r.length, out: Line = [];
  for (let k = 0; k < n; k++) {
    const p = r[(k - 1 + n) % n], c = r[k], nx2 = r[(k + 1) % n];
    let ax = c[0] - p[0], ay = c[1] - p[1], bx = nx2[0] - c[0], by = nx2[1] - c[1];
    const la = Math.hypot(ax, ay) || 1, lb = Math.hypot(bx, by) || 1;
    ax /= la; ay /= la; bx /= lb; by /= lb;
    let nx = -(ay + by), ny = ax + bx;
    const ln = Math.hypot(nx, ny);
    if (ln < 1e-9) { nx = -ay; ny = ax; } else { nx /= ln; ny /= ln; }
    const cos = nx * -ay + ny * ax, k2 = 1 / Math.max(cos, 0.5);
    out.push([c[0] + nx * d * k2, c[1] + ny * d * k2]);
  }
  const a0 = area(r), a1 = area(out);
  return Math.sign(a0) === Math.sign(a1) && Math.abs(a1) > 1 ? out : null;
}

/** A ring with a flag per edge (edge k runs from point k to point k + 1). */
export interface FlaggedRing { pts: Line; flag: boolean[] }

/** splitPolygon for a flagged ring: pieces keep their edges' flags; the cut edges are false. */
export function splitFlagged(r: FlaggedRing, p: Pt, dx: number, dy: number): FlaggedRing[] {
  const side = (v: Pt) => (v[0] - p[0]) * dy - (v[1] - p[1]) * dx;
  const n = r.pts.length, pts: { p: Pt; s: number; cut: boolean; flag: boolean }[] = [];
  for (let k = 0; k < n; k++) {
    const a = r.pts[k], b = r.pts[(k + 1) % n], sa = side(a), sb = side(b);
    pts.push({ p: a, s: sa, cut: false, flag: r.flag[k] });
    if ((sa > 0 && sb < 0) || (sa < 0 && sb > 0)) {
      const t = sa / (sa - sb);
      pts.push({ p: [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])], s: 0, cut: true, flag: r.flag[k] });
    }
  }
  const cuts = pts.map((x, k) => (x.cut || x.s === 0 ? k : -1)).filter((k) => k >= 0);
  if (cuts.length < 2) return [r];
  const along = (k: number) => (pts[k].p[0] - p[0]) * dx + (pts[k].p[1] - p[1]) * dy;
  const sorted = [...cuts].sort((a, b) => along(a) - along(b));
  const bridge = new Map<number, number>();
  for (let k = 0; k + 1 < sorted.length; k += 2) { bridge.set(sorted[k], sorted[k + 1]); bridge.set(sorted[k + 1], sorted[k]); }
  const used = new Uint8Array(pts.length), out: FlaggedRing[] = [];
  for (let start = 0; start < pts.length; start++) {
    if (used[start] || pts[start].s === 0) continue;
    const ring: Line = [], flag: boolean[] = [];
    let k = start;
    for (let guard = 0; guard < 4 * pts.length; guard++) {
      if (used[k] && k === start) break;
      used[k] = 1;
      ring.push(pts[k].p);
      if ((pts[k].cut || pts[k].s === 0) && bridge.has(k) && ring.length > 1) {
        const j = bridge.get(k)!;
        flag.push(false);                    // along the cut
        ring.push(pts[j].p); flag.push(pts[j].flag); used[j] = 1;
        k = (j + 1) % pts.length;
      } else { flag.push(pts[k].flag); k = (k + 1) % pts.length; }
      if (k === start) break;
    }
    if (ring.length >= 3 && Math.abs(area(ring)) > 1e-6) out.push({ pts: ring, flag });
  }
  return out.length ? out : [r];
}
