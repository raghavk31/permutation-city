// Plots: blocks split by their oriented bounding boxes (Vanegas, Kelly, Weber, Halatsch,
// Aliaga and Müller 2012, "Procedural generation of parcels in urban modeling"; architecture-v3
// 5.4). A block is inset by half the width of the streets round it, then split at the middle
// of its oriented bounding box: across its long side until a part is no wider than the
// family's frontage, and along it when a part is deep enough for two rows of plots back to
// back. A split that leaves a part with no street frontage is refused and the other axis tried.
import { BUILDING, type Family } from "../config.js";
import type { Design, Ground } from "../types.js";
import { area, centroid, dist, obb, offsetRing, splitFlagged, type FlaggedRing, type Line, type Pt } from "./geom.js";
import { locator } from "./ground.js";
import type { Edge, Face } from "./network.js";
import type { Rng } from "../types.js";

export interface Plot { ring: Line; block: number; use: number; frontage: number }

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
    const ring: FlaggedRing = { pts: ring0, flag: f.street.slice() };  // the inset keeps one point per point
    const frontage = (r: FlaggedRing) => {
      let s2 = 0;
      for (let k = 0; k < r.pts.length; k++) if (r.flag[k]) s2 += dist(r.pts[k], r.pts[(k + 1) % r.pts.length]);
      return s2;
    };
    // A block that is mostly open ground (water or green) stays one piece.
    const first = classify(ring.pts, bi, frontage(ring));
    if (first.use !== BUILDING) { out.push(first); return; }
    /** The direction of a piece's street frontage (length-weighted, mod 180°), or null. */
    const frontDir = (r: FlaggedRing): [number, number] | null => {
      let c = 0, sn = 0;
      for (let k = 0; k < r.pts.length; k++) {
        if (!r.flag[k]) continue;
        const a2 = r.pts[k], b2 = r.pts[(k + 1) % r.pts.length];
        const l = dist(a2, b2), th = Math.atan2(b2[1] - a2[1], b2[0] - a2[0]);
        c += l * Math.cos(2 * th); sn += l * Math.sin(2 * th);
      }
      if (!c && !sn) return null;
      const th = Math.atan2(sn, c) / 2;
      return [Math.cos(th), Math.sin(th)];
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
      if ((!wantDeep && !wantWide) || a < minFront * depth) { out.push(classify(r.pts, bi, frontage(r))); continue; }
      const jitter = (rng.random() - 0.5) * 0.2;
      // Splits: across the frontage (a cut running back from the street) to narrow a wide
      // piece; along it (parallel to the street) to make two rows of a deep one.
      const across = { p: [c[0] + fd[0] * ((u0 + u1) / 2 + jitter * wide), c[1] + fd[1] * ((u0 + u1) / 2 + jitter * wide)] as Pt, d: [-fd[1], fd[0]] as [number, number] };
      const along = { p: [c[0] - fd[1] * ((v0 + v1) / 2 + jitter * deep), c[1] + fd[0] * ((v0 + v1) / 2 + jitter * deep)] as Pt, d: fd };
      const tries = wantDeep && (!wantWide || deep / (2.3 * depth) > wide / maxFront) ? [along, across] : [across, along];
      let done = false;
      for (const t of tries) {
        const parts = splitFlagged(r, t.p, t.d[0], t.d[1]);
        if (parts.length < 2) continue;
        if (parts.some((q2) => frontage(q2) < Math.min(minFront * 0.5, 4))) continue;
        queue.push(...parts); done = true; break;
      }
      if (!done) out.push(classify(r.pts, bi, frontage(r)));
    }
    function classify(r: Line, block: number, front: number): Plot {
      // The use most of the plot stands on: its centre and points just inside its corners.
      const c = centroid(r), votes = new Map<number, number>();
      for (const p of [c, ...r.map((q): Pt => [q[0] + (c[0] - q[0]) * 0.25, q[1] + (c[1] - q[1]) * 0.25])]) {
        const cell = loc.cell(p), u = cell >= 0 ? d.use[cell] : 0;
        votes.set(u, (votes.get(u) ?? 0) + 1);
      }
      let use = 0, best = -1;
      for (const [u, n] of votes) if (n > best || (n === best && u === BUILDING)) { best = n; use = u; }
      return { ring: r, block, use, frontage: front };
    }
  });
  return out;
}

const lengthOf = (l: Line) => { let s = 0; for (let k = 1; k < l.length; k++) s += dist(l[k - 1], l[k]); return s; };
