// The street network as a planar graph: lines noded where they meet, checked against named
// rules and repaired, and its faces taken as blocks (docs/streets.md; architecture-v3 5.3).
//
// Classes: 3 primary (the skeleton), 2 secondary (Otto routes), 1 local (the infill), 0 the
// edge of the design ground (not a street; it closes the blocks along the boundary).
import type { Design, Ground } from "../types.js";
import {
  area, centroid, cross, dist, length, lineAngle, obb, radii, resample, SegIndex, simplify, spline, toSegment, type Line, type Pt,
} from "./geom.js";
import { locator, outline } from "./ground.js";

/** The rules, each a named setting (docs/streets.md gives the source of every number, and
 *  marks those still to check). Indexed by class: [edge, local, secondary, primary]. */
export const RULES = {
  NODE_SNAP_M: 8,                        // an end this close to another street meets it
  MERGE_M: 1.5,                          // vertices closer than this are one
  DEAD_END_MAX_M: 60,                    // a designated dead end (local, ending at open ground) is at most this long
  EXTEND_MAX_M: 120,                     // a loose end may be carried this far to meet a street
  JUNCTION_ANGLE_MIN_DEG: 60,            // streets meet at 60 to 120 degrees
  JUNCTION_MERGE_M: 20,                  // junctions closer than this on one street are merged
  JUNCTION_SPACING_M: [0, 25, 40, 60],   // the least distance between junctions on a street of each class (flagged)
  CURVE_RADIUS_MIN_M: [0, 15, 30, 60],   // tightest bend by class
  GRADIENT_MAX: [1, 0.10, 0.08, 0.06],   // steepest grade by class (flagged)
  SKELETON_FOLD_M: 25,                   // a route this close to the skeleton is the skeleton
  SLIVER_M2: 400,                        // a block smaller than this is merged into a neighbour
};

export interface Edge { u: number; v: number; pts: Line; cls: number }
export interface Repair { kind: "extended" | "deleted dead end" | "kept dead end" | "straightened junction" | "merged junctions"
  | "smoothed bend" | "removed orphan" | "split long block" | "merged sliver" | "folded onto skeleton"; at: Pt }
export interface Flag { rule: "junction spacing" | "curve radius" | "gradient" | "block perimeter"; at: Pt; value: number; limit: number }
export interface Face { ring: Line; edges: number[]; area: number; street: boolean[] }  // street: per ring edge, on a street
export interface Network { vx: number[]; vy: number[]; edges: Edge[]; faces: Face[]; repairs: Repair[]; flags: Flag[] }

/** Cut routes where they run along the skeleton (within SKELETON_FOLD_M), joining what's left
 *  onto it, so a route doesn't double a street that is already there. */
export function foldOntoSkeleton(routes: Line[], skeleton: Line[], repairs: Repair[]): Line[] {
  const idx = new SegIndex(40);
  for (const l of skeleton) idx.addLine(l, 0);
  const out: Line[] = [];
  for (const r of routes) {
    const pts = resample(r, 6);
    let run: Line = [];
    const flush = () => {
      if (run.length >= 2 && length(run) > 15) out.push(run);
      run = [];
    };
    for (const p of pts) {
      const near = idx.nearest(p, RULES.SKELETON_FOLD_M);
      if (near) {
        if (run.length) { run.push(near.at); flush(); repairs.push({ kind: "folded onto skeleton", at: near.at }); }
      } else {
        if (!run.length && out.length + 1 && idx.nearest(p, RULES.SKELETON_FOLD_M * 2)) {
          const n2 = idx.nearest(p, RULES.SKELETON_FOLD_M * 2)!;
          run.push(n2.at);
        }
        run.push(p);
      }
    }
    flush();
  }
  return out.map((l) => spline(simplify(l, 2), 8));
}

/** Node lines (with their classes) into a planar graph: split where they cross, ends within
 *  NODE_SNAP_M of another line moved onto it, vertices within MERGE_M merged. */
export function node(lines: { pts: Line; cls: number }[]): { vx: number[]; vy: number[]; edges: Edge[] } {
  const idx = new SegIndex(40);
  lines.forEach((l, k) => idx.addLine(l.pts, k));
  // Which segment of which line each indexed segment is.
  const segOf: [number, number][] = [];
  lines.forEach((l, k) => { for (let s = 1; s < l.pts.length; s++) segOf.push([k, s - 1]); });
  const cuts = lines.map((l) => l.pts.map(() => [] as { t: number; p: Pt }[]));
  const addCut = (k: number, s: number, t: number, p: Pt) => cuts[k][s].push({ t, p });
  // Ends snap onto nearby lines (not their own).
  lines.forEach((l, k) => {
    for (const end of [0, l.pts.length - 1]) {
      const p = l.pts[end];
      const hit = idx.nearest(p, RULES.NODE_SNAP_M, (id) => idx.tag[id] === k);
      if (!hit) continue;
      const [kk, ss] = segOf[hit.id];
      addCut(kk, ss, hit.t, hit.at);
      l.pts[end] = hit.at;
    }
  });
  // Crossings.
  for (let id = 0; id < idx.a.length; id++) {
    const [k, s] = segOf[id];
    for (const o of idx.near([(idx.a[id][0] + idx.b[id][0]) / 2, (idx.a[id][1] + idx.b[id][1]) / 2], dist(idx.a[id], idx.b[id]) / 2 + 1)) {
      if (o <= id) continue;
      const [k2, s2] = segOf[o];
      if (k2 === k && Math.abs(s2 - s) <= 1) continue;
      const c = cross(lines[k].pts[s], lines[k].pts[s + 1], lines[k2].pts[s2], lines[k2].pts[s2 + 1]);
      if (!c) continue;
      addCut(k, s, c.s, c.at); addCut(k2, s2, c.t, c.at);
    }
  }
  // Vertices, merged within MERGE_M.
  const vx: number[] = [], vy: number[] = [], bk = new Map<string, number[]>();
  const vertex = (p: Pt) => {
    const bx = Math.round(p[0] / 2), by = Math.round(p[1] / 2);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (const v of bk.get(`${bx + dx},${by + dy}`) ?? []) {
      if (Math.hypot(vx[v] - p[0], vy[v] - p[1]) <= RULES.MERGE_M) return v;
    }
    const v = vx.length;
    vx.push(p[0]); vy.push(p[1]);
    const key = `${bx},${by}`, b = bk.get(key);
    if (b) b.push(v); else bk.set(key, [v]);
    return v;
  };
  const edges: Edge[] = [], seen = new Map<string, number>();
  const emit = (piece: Line, cls: number) => {
    if (piece.length < 2 || length(piece) < 0.5) return;
    const u = vertex(piece[0]), v = vertex(piece[piece.length - 1]);
    if (u === v) return;
    const pts = piece.slice();
    pts[0] = [vx[u], vy[u]]; pts[pts.length - 1] = [vx[v], vy[v]];
    // The same stretch twice (two lines on one street): keep the higher class.
    const key = `${u < v ? `${u},${v}` : `${v},${u}`},${Math.round(length(pts))}`, prev = seen.get(key);
    if (prev !== undefined) { edges[prev].cls = Math.max(edges[prev].cls, cls); return; }
    seen.set(key, edges.length);
    edges.push({ u, v, pts, cls });
  };
  lines.forEach((l, k) => {
    // The line's points with the cuts put in, each marked where the line is to be split.
    const seq: { p: Pt; split: boolean }[] = [{ p: l.pts[0], split: true }];
    for (let s = 0; s < l.pts.length - 1; s++) {
      let endSplit = s + 1 === l.pts.length - 1;
      for (const c of cuts[k][s].sort((x, y) => x.t - y.t)) {
        if (c.t <= 1e-6) seq[seq.length - 1].split = true;
        else if (c.t >= 1 - 1e-6) endSplit = true;
        else seq.push({ p: c.p, split: true });
      }
      seq.push({ p: l.pts[s + 1], split: endSplit });
    }
    let piece: Line = [seq[0].p];
    for (let i = 1; i < seq.length; i++) {
      piece.push(seq[i].p);
      if (seq[i].split) { emit(piece, l.cls); piece = [seq[i].p]; }
    }
  });
  return { vx, vy, edges };
}

/** Split edge k at a point on its segment s; returns the new vertex (or an end, if the point is
 *  at one). The first part keeps index k; the second is appended. */
function splitEdge(net: { vx: number[]; vy: number[]; edges: Edge[] }, k: number, s: number, at: Pt): number {
  const e = net.edges[k];
  if (dist(at, e.pts[0]) <= RULES.MERGE_M) return e.u;
  if (dist(at, e.pts[e.pts.length - 1]) <= RULES.MERGE_M) return e.v;
  const v = net.vx.length;
  net.vx.push(at[0]); net.vy.push(at[1]);
  const first = [...e.pts.slice(0, s + 1), at], second = [at, ...e.pts.slice(s + 1)];
  net.edges.push({ u: v, v: e.v, pts: second, cls: e.cls });
  e.v = v; e.pts = first;
  return v;
}

/** Which segment of which edge an index id is (the index is built edge by edge). */
function indexEdges(edges: Edge[], keep: (e: Edge) => boolean) {
  const idx = new SegIndex(40), seg: [number, number][] = [];
  edges.forEach((e, k) => { if (!keep(e)) return; for (let s = 1; s < e.pts.length; s++) { idx.add(e.pts[s - 1], e.pts[s], k); seg.push([k, s - 1]); } });
  return { idx, seg };
}

/** Street degree of each vertex (edges of class ≥ 1), and whether it's on the ground's edge. */
function degrees(n: number, edges: Edge[]) {
  const deg = new Int32Array(n), edge = new Uint8Array(n);
  for (const e of edges) {
    if (e.cls === 0) { edge[e.u] = 1; edge[e.v] = 1; continue; }
    deg[e.u]++; deg[e.v]++;
  }
  return { deg, edge };
}

/** Check the network against the rules and repair it (in place), recording what was done. */
export function repair(G: Ground, d: Design, net: { vx: number[]; vy: number[]; edges: Edge[] }, repairs: Repair[], flags: Flag[]) {
  const loc = locator(G), onGround = (p: Pt) => loc.cell(p) >= 0;
  let { edges } = net;
  const { vx, vy } = net;
  const P = (v: number): Pt => [vx[v], vy[v]];

  // 1. Loose ends: carry them on to a street, keep a short designated dead end, or delete.
  for (let pass = 0; pass < 6; pass++) {
    const { deg, edge } = degrees(vx.length, edges);
    const { idx: streetIdx, seg } = indexEdges(edges, (e) => e.cls > 0);
    let changed = false;
    const drop = new Set<number>(), split = new Set<number>();  // split: streets cut this pass (the index is stale for them)
    const n0 = edges.length;
    for (let k = 0; k < n0; k++) {
      const e = edges[k];
      if (e.cls === 0 || drop.has(k) || split.has(k)) continue;
      for (const atEnd of [true, false]) {
        const end = atEnd ? e.v : e.u;
        if (deg[end] !== 1 || edge[end]) continue;
        const pts = atEnd ? e.pts : [...e.pts].reverse();
        const a = pts[pts.length - 2], b = pts[pts.length - 1];
        const l = dist(a, b) || 1, dx = (b[0] - a[0]) / l, dy = (b[1] - a[1]) / l;
        const far: Pt = [b[0] + dx * RULES.EXTEND_MAX_M, b[1] + dy * RULES.EXTEND_MAX_M];
        const hit = streetIdx.firstCross(b, far, (id) => seg[id][0] === k);
        let clear = !!hit;
        if (hit) for (let t = 6, reach = dist(b, hit.at); t < reach; t += 6) if (!onGround([b[0] + dx * t, b[1] + dy * t])) { clear = false; break; }
        if (hit && clear) {
          const [hk, hs] = seg[hit.id];
          if (drop.has(hk) || hk >= n0 || split.has(hk) || hk === k) continue;  // the next pass sees it afresh
          split.add(hk);
          const v = splitEdge({ vx, vy, edges }, hk, hs, hit.at);
          if (atEnd) { e.pts.push(hit.at); e.v = v; } else { e.pts.unshift(hit.at); e.u = v; }
          deg[end] = 2;
          repairs.push({ kind: "extended", at: hit.at });
          changed = true;
          continue;
        }
        const cell = loc.cell(b), open = cell >= 0 && d.use[cell] !== 1;
        if (e.cls === 1 && length(e.pts) <= RULES.DEAD_END_MAX_M && open) {
          repairs.push({ kind: "kept dead end", at: b });
          continue;
        }
        drop.add(k); repairs.push({ kind: "deleted dead end", at: b }); changed = true;
      }
    }
    if (drop.size) edges = edges.filter((_, k) => !drop.has(k));
    if (!changed) break;
  }

  // 2. Junction angles: a local street meeting another at under 60° has its last stretch
  //    turned to meet it square.
  {
    const byV = new Map<number, number[]>();
    edges.forEach((e, k) => { for (const v of [e.u, e.v]) { const l = byV.get(v); if (l) l.push(k); else byV.set(v, [k]); } });
    const min = RULES.JUNCTION_ANGLE_MIN_DEG * Math.PI / 180;
    for (const [v, ks] of byV) {
      if (ks.length < 3) continue;
      const dirOf = (k: number): [number, number] => {
        const e = edges[k], pts = e.u === v ? e.pts : [...e.pts].reverse();
        const far = pts.find((p) => dist(p, pts[0]) >= 15) ?? pts[pts.length - 1];
        return [far[0] - pts[0][0], far[1] - pts[0][1]];
      };
      for (const k of ks) {
        if (edges[k].cls !== 1) continue;
        const [ax, ay] = dirOf(k), la = Math.hypot(ax, ay) || 1;
        // Measured against the other streets here, not this street's own continuation (the
        // edge leaving almost straight on, over 150° round from this one).
        const others = ks.filter((o) => {
          if (o === k || edges[o].cls < edges[k].cls) return false;
          const [bx, by] = dirOf(o), lb = Math.hypot(bx, by) || 1;
          return (ax * bx + ay * by) / (la * lb) > Math.cos(150 * Math.PI / 180);
        });
        if (!others.length) continue;
        const worst = Math.min(...others.map((o) => { const [bx, by] = dirOf(o); return lineAngle(ax, ay, bx, by); }));
        if (!(worst < min)) continue;
        const e = edges[k], pts = e.u === v ? [...e.pts].reverse() : e.pts.slice();  // ends at v
        // Cut back 20 m and meet the through street square from there.
        let cutAt = pts.length - 1;
        while (cutAt > 0 && dist(pts[cutAt], pts[pts.length - 1]) < 20) cutAt--;
        const from = pts[cutAt];
        let best: Pt | null = null, bd = Infinity;
        for (const o of ks) {
          if (o === k) continue;
          for (let s = 1; s < edges[o].pts.length; s++) {
            const h = toSegment(from, edges[o].pts[s - 1], edges[o].pts[s]);
            if (h.d < bd) { bd = h.d; best = h.at; }
          }
        }
        if (!best) continue;
        // Split the through street at the new meeting point.
        let bestK = -1, bestS = -1, bd2 = Infinity;
        for (const o of ks) {
          if (o === k) continue;
          for (let s2 = 1; s2 < edges[o].pts.length; s2++) {
            const h = toSegment(best, edges[o].pts[s2 - 1], edges[o].pts[s2]);
            if (h.d < bd2) { bd2 = h.d; bestK = o; bestS = s2 - 1; }
          }
        }
        const nv = splitEdge({ vx, vy, edges }, bestK, bestS, best);
        const np = [...pts.slice(0, cutAt + 1), best];
        if (e.u === v) { e.pts = np.reverse(); e.u = nv; } else { e.pts = np; e.v = nv; }
        repairs.push({ kind: "straightened junction", at: best });
      }
    }
  }

  // 3. Junctions too close together on one street: merge them (flag the class spacing).
  {
    const { deg } = degrees(vx.length, edges);
    const parent = vx.map((_, k) => k);
    const find = (v: number): number => (parent[v] === v ? v : (parent[v] = find(parent[v])));
    for (const e of edges) {
      if (e.cls === 0 || deg[e.u] < 3 || deg[e.v] < 3) continue;
      const len = length(e.pts);
      if (len < RULES.JUNCTION_MERGE_M) { parent[find(e.v)] = find(e.u); repairs.push({ kind: "merged junctions", at: P(e.u) }); }
      else if (len < RULES.JUNCTION_SPACING_M[e.cls]) flags.push({ rule: "junction spacing", at: P(e.u), value: len, limit: RULES.JUNCTION_SPACING_M[e.cls] });
    }
    for (const e of edges) {
      e.u = find(e.u); e.v = find(e.v);
      e.pts[0] = P(e.u); e.pts[e.pts.length - 1] = P(e.v);
    }
    edges = edges.filter((e) => e.u !== e.v);
  }

  // 4. Bends and gradients.
  for (const e of edges) {
    if (e.cls === 0) continue;
    const minR = RULES.CURVE_RADIUS_MIN_M[e.cls];
    for (let pass = 0; pass < 2; pass++) {
      const r = radii(resample(e.pts, 8));
      const tight = Math.min(...r);
      if (tight >= minR) break;
      if (pass === 1) { const k = r.indexOf(tight); flags.push({ rule: "curve radius", at: resample(e.pts, 8)[k], value: tight, limit: minR }); break; }
      e.pts = spline(simplify(e.pts, 4), 8);
      e.pts[0] = P(e.u); e.pts[e.pts.length - 1] = P(e.v);
      repairs.push({ kind: "smoothed bend", at: e.pts[Math.floor(e.pts.length / 2)] });
    }
    // Gradients only where the land has relief: on flat land the heights are DEM noise.
    if (G.z && (G.meta.landform?.relief.class ?? "flat") !== "flat") {
      const pts = resample(e.pts, 10);
      let worst = 0, at = pts[0];
      for (let k = 1; k < pts.length; k++) {
        const a = loc.cell(pts[k - 1]), b = loc.cell(pts[k]);
        if (a < 0 || b < 0) continue;
        const grade = Math.abs(G.z[b] - G.z[a]) / Math.max(dist(pts[k - 1], pts[k]), 1);
        if (grade > worst) { worst = grade; at = pts[k]; }
      }
      if (worst > RULES.GRADIENT_MAX[e.cls]) flags.push({ rule: "gradient", at, value: worst, limit: RULES.GRADIENT_MAX[e.cls] });
    }
  }

  // 5. Hierarchy: a part of the network that reaches neither a primary or secondary street nor
  //    the edge of the ground is an orphan, and goes.
  {
    const parent = vx.map((_, k) => k);
    const find = (v: number): number => (parent[v] === v ? v : (parent[v] = find(parent[v])));
    for (const e of edges) if (e.cls > 0) parent[find(e.v)] = find(e.u);
    const rooted = new Set<number>();
    const { edge } = degrees(vx.length, edges);
    for (const e of edges) if (e.cls >= 2 || (e.cls === 1 && (edge[e.u] || edge[e.v]))) rooted.add(find(e.u));
    const before = edges.length;
    edges = edges.filter((e) => e.cls === 0 || rooted.has(find(e.u)));
    if (edges.length < before) repairs.push({ kind: "removed orphan", at: [0, 0] });
  }
  net.edges = edges;
}

/** The faces of the planar graph that lie on the design ground: the blocks. */
export function faces(G: Ground, vx: number[], vy: number[], edges: Edge[]): Face[] {
  const loc = locator(G);
  // Half-edges 2k (u→v) and 2k+1 (v→u); outgoing lists sorted by angle.
  const out = new Map<number, number[]>();
  const tail = (h: number) => (h % 2 ? edges[h >> 1].v : edges[h >> 1].u);
  const head = (h: number) => (h % 2 ? edges[h >> 1].u : edges[h >> 1].v);
  const pts = (h: number) => (h % 2 ? [...edges[h >> 1].pts].reverse() : edges[h >> 1].pts);
  const angle = (h: number) => { const p = pts(h), q2 = p[1] ?? p[p.length - 1]; return Math.atan2(q2[1] - p[0][1], q2[0] - p[0][0]); };
  edges.forEach((_, k) => { for (const h of [2 * k, 2 * k + 1]) { const t = tail(h), l = out.get(t); if (l) l.push(h); else out.set(t, [h]); } });
  for (const l of out.values()) l.sort((a, b) => angle(a) - angle(b));
  const used = new Uint8Array(edges.length * 2), result: Face[] = [];
  for (let h0 = 0; h0 < edges.length * 2; h0++) {
    if (used[h0]) continue;
    const ring: Line = [], es: number[] = [], street: boolean[] = [];
    let h = h0;
    for (let guard = 0; guard < 100000; guard++) {
      used[h] = 1; es.push(h >> 1);
      const p = pts(h), onStreet = edges[h >> 1].cls > 0;
      for (let k = 0; k < p.length - 1; k++) { ring.push(p[k]); street.push(onStreet); }
      // Next: at the head, the outgoing half-edge just clockwise of the way back (face on the left).
      const v = head(h), l = out.get(v)!, back = h ^ 1;
      const i = l.indexOf(back);
      h = l[(i - 1 + l.length) % l.length];
      if (h === h0) break;
    }
    const a = area(ring);
    if (a <= 1) continue;
    // On the ground: most of a few points just inside its edges are on design cells.
    const c = centroid(ring);
    let on = loc.cell(c) >= 0 ? 2 : 0, all = 2;
    for (let k = 0; k < ring.length; k += Math.max(1, Math.floor(ring.length / 8))) {
      const p = ring[k], q2 = ring[(k + 1) % ring.length], l = dist(p, q2) || 1;
      const m: Pt = [(p[0] + q2[0]) / 2 - (q2[1] - p[1]) / l * 3, (p[1] + q2[1]) / 2 + (q2[0] - p[0]) / l * 3];
      all++; if (loc.cell(m) >= 0) on++;
    }
    if (on / all < 0.5) continue;
    result.push({ ring, edges: [...new Set(es)], area: a, street });
  }
  return result;
}

/** Long blocks get a local street across the middle of their long side; slivers are merged
 *  into a neighbour by removing the local street between them. Returns lines to add and edges
 *  to remove (then the network is noded again). */
export function blockRepairs(fs: Face[], edges: Edge[], perimeter: readonly [number, number], repairs: Repair[], flags: Flag[]):
  { add: Line[]; remove: Set<number> } {
  const add: Line[] = [], remove = new Set<number>();
  for (const f of fs) {
    const per = length([...f.ring, f.ring[0]]);
    if (f.area < RULES.SLIVER_M2) {
      // the shortest local street on its edge goes
      const k = f.edges.filter((e) => edges[e].cls === 1).sort((a, b) => length(edges[a].pts) - length(edges[b].pts))[0];
      if (k !== undefined) { remove.add(k); repairs.push({ kind: "merged sliver", at: centroid(f.ring) }); }
      continue;
    }
    if (per > perimeter[1] * 1.15) {
      const b = obb(f.ring);
      // A line across the long axis through the centre, clipped to the face.
      const p: Pt = b.c, nx = -b.uy, ny = b.ux, far = b.hw + 50;
      const a0: Pt = [p[0] - nx * far, p[1] - ny * far], a1: Pt = [p[0] + nx * far, p[1] + ny * far];
      const hits: Pt[] = [];
      for (let k = 0; k < f.ring.length; k++) { const c = cross(a0, a1, f.ring[k], f.ring[(k + 1) % f.ring.length]); if (c) hits.push(c.at); }
      hits.sort((x, y) => dist(a0, x) - dist(a0, y));
      if (hits.length >= 2) {
        // the stretch of the cut that passes through the centre
        let seg: Line | null = null;
        for (let k = 0; k + 1 < hits.length; k++) if (dist(hits[k], p) + dist(p, hits[k + 1]) <= dist(hits[k], hits[k + 1]) + 1) seg = [hits[k], hits[k + 1]];
        if (seg && dist(seg[0], seg[1]) > 20) { add.push(seg); repairs.push({ kind: "split long block", at: p }); continue; }
      }
      flags.push({ rule: "block perimeter", at: centroid(f.ring), value: per, limit: perimeter[1] });
    }
  }
  return { add, remove };
}

/** The outline rings as class-0 lines (closed). */
export const outlineLines = (G: Ground): { pts: Line; cls: number }[] =>
  outline(G).map((r) => ({ pts: [...r, r[0]], cls: 0 }));

/** Apply block repairs to a noded network in place: remove edges, and add each new street,
 *  splitting the streets its ends land on. */
export function applyBlockRepairs(net: { vx: number[]; vy: number[]; edges: Edge[] }, add: Line[], remove: Set<number>) {
  if (remove.size) net.edges = net.edges.filter((_, k) => !remove.has(k));
  if (!add.length) return;
  // Where each new street's ends land, found on the network as it stands; then each street
  // split at all its landings at once, from its far end back, so earlier positions hold.
  const { idx, seg: segOf } = indexEdges(net.edges, () => true);
  const landings = new Map<number, { s: number; t: number; at: Pt; add: number; end: number }[]>();
  add.forEach((seg, a) => seg.forEach((p, end) => {
    const h = idx.nearest(p, 2);
    if (!h) return;
    const [k, s2] = segOf[h.id], l = landings.get(k);
    const item = { s: s2, t: h.t, at: h.at, add: a, end };
    if (l) l.push(item); else landings.set(k, [item]);
  }));
  const endV = add.map(() => [-1, -1]);
  for (const [k, list] of landings) {
    list.sort((x, y) => y.s - x.s || y.t - x.t);
    for (const it of list) endV[it.add][it.end] = splitEdge(net, k, it.s, it.at);
  }
  endV.forEach(([u, v]) => {
    if (u < 0 || v < 0 || u === v) return;
    net.edges.push({ u, v, pts: [[net.vx[u], net.vy[u]], [net.vx[v], net.vy[v]]], cls: 1 });
  });
}
