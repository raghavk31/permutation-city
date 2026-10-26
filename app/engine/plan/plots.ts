// Plots: blocks split by their oriented bounding boxes (Vanegas, Kelly, Weber, Halatsch,
// Aliaga and Müller 2012, "Procedural generation of parcels in urban modeling"; architecture-v3
// 5.4). A block is inset by half the width of the streets round it, then split at the middle
// of its oriented bounding box: across its long side until a part is no wider than the
// family's frontage, and along it when a part is deep enough for two rows of plots back to
// back. A split that leaves a part with no street frontage, or a sliver or wedge, is refused and
// the other axis tried (shape rules: architecture-v3 5.4, step 5).
import { BUILDING, type Family } from "../config.js";
import type { Design, Ground } from "../types.js";
import { area, centroid, dist, obb, offsetRing, splitFlagged, type FlaggedRing, type Line, type Pt } from "./geom.js";
import { locator, type Locator } from "./ground.js";
import type { Edge, Face } from "./network.js";
import type { Rng } from "../types.js";

/** A plot should fill this share of its oriented bounding box (a triangle fills 0.5) ... */
const MIN_FILL = 0.6;
/** ... and be at least this share of the family's least frontage across its narrow side. */
const MIN_WIDTH = 0.6;
/** A piece this many times a full plot (widest frontage by depth) is split even into poor shapes. */
const OVERSIZE = 3;
/** Street edges within 25° of the longest set a piece's frontage direction (sin 25°). */
const SAME_LINE = Math.sin(25 * Math.PI / 180);
/** Corner splays: block corners under 30° are cut back to a 4 m chord. */
const SPLAY_BELOW = 30 * Math.PI / 180, SPLAY_M = 4;

/** road: the width of the widest street the plot fronts (m; 0: none), which sets its FAR
 *  under the site's plot rules (engine/regs.ts). */
export interface Plot { ring: Line; block: number; use: number; frontage: number; road: number }

export function plots(G: Ground, d: Design, faces: Face[], edges: Edge[], widthOf: (cls: number) => number,
  fam: Family, depthGene: number, rng: Rng): Plot[] {
  const loc = locator(G), out: Plot[] = [];
  const depth = fam.depth[0] + (fam.depth[1] - fam.depth[0]) * depthGene;
  const maxFront = fam.frontage[1], minFront = fam.frontage[0];
  faces.forEach((f, bi) => {
    // Inset by the street widths round the block, weighted by length (the edge of the ground: none).
    let wsum = 0, lsum = 0;
    for (const k of f.edges) {
      const e = edges[k], l = lengthOf(e.pts);
      lsum += l;
      if (e.cls > 0) wsum += l * widthOf(e.cls) / 2;
    }
    const inset = lsum ? wsum / lsum : 0;
    const ring0 = inset > 0.1 ? offsetRing(f.ring, inset) : f.ring;
    if (!ring0 || area(ring0) < minFront * depth * 0.5) return;
    // The inset keeps one point per point, so the street flags carry over; acute corners are splayed.
    const ring = splay({ pts: ring0, flag: f.cls.slice() });
    const frontage = (r: FlaggedRing) => {
      let s2 = 0;
      for (let k = 0; k < r.pts.length; k++) if (r.flag[k]) s2 += dist(r.pts[k], r.pts[(k + 1) % r.pts.length]);
      return s2;
    };
    // A block that is mostly open ground (water or green) stays one piece.
    const first = classify(ring);
    if (first.use !== BUILDING) { out.push(first); return; }
    /** The direction of a piece's main street frontage (mod 180°), or null: the longest street
     *  edge, averaged with the street edges within 25° of it. A corner piece takes one street's
     *  line, not the mean of both (which would cut it on the diagonal, into triangles). */
    const frontDir = (r: FlaggedRing): [number, number] | null => {
      const segs: [number, number][] = [];
      let top = -1;
      for (let k = 0; k < r.pts.length; k++) {
        if (!r.flag[k]) continue;
        const a2 = r.pts[k], b2 = r.pts[(k + 1) % r.pts.length];
        segs.push([dist(a2, b2), Math.atan2(b2[1] - a2[1], b2[0] - a2[0])]);
        if (top < 0 || segs[segs.length - 1][0] > segs[top][0]) top = segs.length - 1;
      }
      if (top < 0 || !segs[top][0]) return null;
      let c = 0, sn = 0;
      for (const [l, th] of segs) {
        if (Math.abs(Math.sin(th - segs[top][1])) > SAME_LINE) continue;
        c += l * Math.cos(2 * th); sn += l * Math.sin(2 * th);
      }
      const th = Math.atan2(sn, c) / 2;
      return [Math.cos(th), Math.sin(th)];
    };
    /** How well a piece holds a building, 1 or more when fine: its fill of its bounding box in
     *  the frame it was cut in (a triangle fills half) and its narrow side against the family's
     *  frontage. */
    const shape = (pts: Line, fd: [number, number]) => {
      let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
      for (const p of pts) {
        const u = p[0] * fd[0] + p[1] * fd[1], v = -p[0] * fd[1] + p[1] * fd[0];
        u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v);
      }
      const fill = Math.abs(area(pts)) / Math.max((u1 - u0) * (v1 - v0), 1e-9);
      return Math.min(fill / MIN_FILL, Math.min(u1 - u0, v1 - v0) / (MIN_WIDTH * minFront));
    };
    const queue: FlaggedRing[] = [ring];
    for (let guard = 0; queue.length && guard < 4000; guard++) {
      const r = queue.pop()!;
      const a = Math.abs(area(r.pts)), c = centroid(r.pts);
      // The piece's frame: along its street frontage (else its long axis) and across it.
      let fd = frontDir(r);
      if (!fd) { const b = obb(r.pts); fd = [b.ux, b.uy]; }
      let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
      for (const p of r.pts) {
        const u = (p[0] - c[0]) * fd[0] + (p[1] - c[1]) * fd[1], v = -(p[0] - c[0]) * fd[1] + (p[1] - c[1]) * fd[0];
        u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v);
      }
      const wide = u1 - u0, deep = v1 - v0;
      const wantDeep = deep > 2.3 * depth, wantWide = wide > maxFront;
      if ((!wantDeep && !wantWide) || a < minFront * depth) { out.push(classify(r)); continue; }
      const jitter = (rng.random() - 0.5) * 0.2;
      // Splits: across the frontage (a cut running back from the street) to narrow a wide
      // piece; along it (parallel to the street) to make two rows of a deep one. Each is tried
      // at the jittered middle, then nearer each end; the first whose parts all keep a street
      // and a usable shape is taken. Failing that, the split with the best worst part, but only
      // when the piece is far too big to stay one plot (else it stays whole).
      const across = (o: number) => ({ p: [c[0] + fd[0] * ((u0 + u1) / 2 + o * wide), c[1] + fd[1] * ((u0 + u1) / 2 + o * wide)] as Pt, d: [-fd[1], fd[0]] as [number, number] });
      const along = (o: number) => ({ p: [c[0] - fd[1] * ((v0 + v1) / 2 + o * deep), c[1] + fd[0] * ((v0 + v1) / 2 + o * deep)] as Pt, d: fd });
      const ways = wantDeep && (!wantWide || deep / (2.3 * depth) > wide / maxFront) ? [along, across] : [across, along];
      let done = false, best: FlaggedRing[] | null = null, bestQ = -Infinity;
      for (const way of ways) {
        for (const o of [jitter, jitter - 0.15, jitter + 0.15]) {
          const t = way(o), parts = splitFlagged(r, t.p, t.d[0], t.d[1]);
          if (parts.length < 2) continue;
          if (parts.some((q2) => frontage(q2) < Math.min(minFront * 0.5, 4))) continue;
          const q = Math.min(...parts.map((q2) => shape(q2.pts, fd)));
          if (q >= 1) { queue.push(...parts); done = true; break; }
          if (q > bestQ) { bestQ = q; best = parts; }
        }
        if (done) break;
      }
      if (!done && best && a > OVERSIZE * maxFront * depth) { queue.push(...best); done = true; }
      if (!done) out.push(classify(r));
    }
    function classify(r: FlaggedRing): Plot {
      let road = 0;
      for (const c of r.flag) if (c > 0) road = Math.max(road, widthOf(c));
      return { ring: r.pts, block: bi, use: plotUse(loc, d.use, r.pts), frontage: frontage(r), road };
    }
  });
  return out;
}

/** A block's corners sharper than 30° cut back to a 4 m chord (a corner splay), so no plot
 *  starts from a spike. The cut runs along neither street, so it isn't frontage. */
function splay(r: FlaggedRing): FlaggedRing {
  const n = r.pts.length, pts: Line = [], flag: number[] = [];
  for (let k = 0; k < n; k++) {
    const a = r.pts[(k - 1 + n) % n], b = r.pts[k], c = r.pts[(k + 1) % n];
    const la = dist(a, b), lc = dist(b, c);
    const cos = la && lc ? ((a[0] - b[0]) * (c[0] - b[0]) + (a[1] - b[1]) * (c[1] - b[1])) / la / lc : -1;
    const th = Math.acos(Math.max(-1, Math.min(1, cos)));
    if (th >= SPLAY_BELOW || n < 4) { pts.push(b); flag.push(r.flag[k]); continue; }
    const t = Math.min(SPLAY_M / (2 * Math.sin(th / 2)), 0.45 * Math.min(la, lc));
    pts.push([b[0] + (a[0] - b[0]) * t / la, b[1] + (a[1] - b[1]) * t / la]); flag.push(0);
    pts.push([b[0] + (c[0] - b[0]) * t / lc, b[1] + (c[1] - b[1]) * t / lc]); flag.push(r.flag[k]);
  }
  return { pts, flag };
}

/** The use most of a plot stands on: its centre and points just inside its corners (ties go
 *  to building). */
export function plotUse(loc: Locator, use: ArrayLike<number>, r: Line): number {
  const c = centroid(r), votes = new Map<number, number>();
  for (const p of [c, ...r.map((q): Pt => [q[0] + (c[0] - q[0]) * 0.25, q[1] + (c[1] - q[1]) * 0.25])]) {
    const cell = loc.cell(p), u = cell >= 0 ? use[cell] : 0;
    votes.set(u, (votes.get(u) ?? 0) + 1);
  }
  let out = 0, best = -1;
  for (const [u, n] of votes) if (n > best || (n === best && u === BUILDING)) { best = n; out = u; }
  return out;
}

const lengthOf = (l: Line) => { let s = 0; for (let k = 1; k < l.length; k++) s += dist(l[k - 1], l[k]); return s; };
