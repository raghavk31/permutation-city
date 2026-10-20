// Meshes for the viewer and the exports (docs/massing.md). Plain arrays, no three.js, so the
// engine keeps no dependencies.
//
//   boxes    the typology grammar's solids, exact
//   skin     the fields' smooth skin: surface nets (Gibson 1998) on the voxel field, with the
//            field forced to agree with the voxels after repairs, then SMOOTH rounds of
//            Taubin smoothing. Heights are clamped to the ground and the cap, so the skin
//            stays inside the envelope up to half a column in plan.
//   context  the design's other buildings near the block, as cell prisms
//
// Coordinates: x east, y north, z up, metres in the site frame.
import { BUILDING, STOREY_M } from "../config.js";
import { corners } from "../graph.js";
import type { Design, Ground } from "../types.js";
import type { Envelope } from "./envelope.js";
import type { Box, Massing } from "./voxels.js";

export interface Mesh { positions: Float32Array; indices: Uint32Array; groups: { name: string; start: number; count: number }[] }

export const SMOOTH = 3;
export const TAUBIN = [0.5, -0.53];  // Taubin (1995): smooth, then push back out, so the skin doesn't shrink
const FORCE = 0.05;  // how far past the threshold a repaired voxel's field is set

class Builder {
  p: number[] = []; i: number[] = []; groups: Mesh["groups"] = [];
  vertex(x: number, y: number, z: number) { this.p.push(x, y, z); return this.p.length / 3 - 1; }
  tri(a: number, b: number, c: number) { this.i.push(a, b, c); }
  group(name: string, from: number) { if (this.i.length > from) this.groups.push({ name, start: from, count: this.i.length - from }); }
  done(): Mesh { return { positions: Float32Array.from(this.p), indices: Uint32Array.from(this.i), groups: this.groups }; }
}

/** Triangles of a simple polygon (ear clipping), as index triples into a counter-clockwise ring. */
export function triangulate(ring: [number, number][]): [number, number, number][] {
  const idx = ring.map((_, k) => k), out: [number, number, number][] = [];
  const cross = (a: number, b: number, c: number) =>
    (ring[b][0] - ring[a][0]) * (ring[c][1] - ring[a][1]) - (ring[b][1] - ring[a][1]) * (ring[c][0] - ring[a][0]);
  const inside = (p: number, a: number, b: number, c: number) =>
    cross(a, b, p) >= 0 && cross(b, c, p) >= 0 && cross(c, a, p) >= 0;
  let guard = 0;
  while (idx.length > 3 && guard++ < 10000) {
    let cut = false;
    for (let k = 0; k < idx.length; k++) {
      const a = idx[(k + idx.length - 1) % idx.length], b = idx[k], c = idx[(k + 1) % idx.length];
      if (cross(a, b, c) <= 0) continue;  // a reflex corner is no ear
      if (idx.some((p) => p !== a && p !== b && p !== c && inside(p, a, b, c))) continue;
      out.push([a, b, c]); idx.splice(k, 1); cut = true;
      break;
    }
    if (!cut) break;  // a self-touching outline: fan the rest
  }
  for (let k = 1; k < idx.length - 1; k++) out.push([idx[0], idx[k], idx[k + 1]]);
  return out;
}

/** A prism: an outline extruded from z0 to z1 (own vertices per face, so normals stay flat). */
function prism(b: Builder, ring: [number, number][], z0: number, z1: number) {
  let area = 0;
  for (let k = 0; k < ring.length; k++) { const [ax, ay] = ring[k], [bx, by] = ring[(k + 1) % ring.length]; area += ax * by - bx * ay; }
  if (area < 0) ring = [...ring].reverse();  // counter-clockwise
  const n = ring.length;
  for (let k = 0; k < n; k++) {
    const [ax, ay] = ring[k], [bx, by] = ring[(k + 1) % n];
    const v0 = b.vertex(ax, ay, z0), v1 = b.vertex(bx, by, z0), v2 = b.vertex(bx, by, z1), v3 = b.vertex(ax, ay, z1);
    b.tri(v0, v1, v2); b.tri(v0, v2, v3);
  }
  const top = ring.map(([x, y]) => b.vertex(x, y, z1)), bot = ring.map(([x, y]) => b.vertex(x, y, z0));
  for (const [i, j, k] of triangulate(ring)) { b.tri(top[i], top[j], top[k]); b.tri(bot[i], bot[k], bot[j]); }
}

export function boxRing(x: Box): [number, number][] {
  const ux = Math.cos(x.axis), uy = Math.sin(x.axis);
  return ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as const).map(([su, sv]) => {
    const u = su * x.hu, v = sv * x.hv;
    return [x.cx + u * ux - v * uy, x.cy + u * uy + v * ux] as [number, number];
  });
}

export function boxesMesh(boxes: Box[], plots: number): Mesh {
  const b = new Builder();
  for (let k = 0; k < plots; k++) {
    const from = b.i.length;
    for (const x of boxes) if (x.plot === k) prism(b, boxRing(x), x.z0 * STOREY_M, x.z1 * STOREY_M);
    b.group(`plot ${k + 1}`, from);
  }
  return b.done();
}

/** The smooth skin of a field massing. */
export function skinMesh(E: Envelope, m: Massing, smooth = SMOOTH): Mesh {
  const N = E.nx * E.ny, nzp = E.nz + 2;  // one empty layer below the ground and one above the top
  // Field on the samples (column centres; storey middles), agreeing with the voxels.
  const F = new Float32Array(N * nzp).fill(-1);
  let c0 = E.nx, c1 = -1, r0 = E.ny, r1 = -1;
  for (let z = 0; z < E.nz; z++) for (let q = 0; q < N; q++) {
    const v = z * N + q, f = m.field ? m.field[v] : m.occ[v] ? 1 : -1;
    F[(z + 1) * N + q] = m.occ[v] ? Math.max(f, FORCE) : Math.min(f, -FORCE);
    if (m.occ[v]) { const c = q % E.nx, r = Math.floor(q / E.nx); c0 = Math.min(c0, c); c1 = Math.max(c1, c); r0 = Math.min(r0, r); r1 = Math.max(r1, r); }
  }
  const b = new Builder();
  if (c1 < 0) return b.done();
  // Two empty samples on the low side (an edge belongs to its lower sample), one on the high.
  c0 = Math.max(0, c0 - 2); r0 = Math.max(0, r0 - 2); c1 = Math.min(E.nx - 2, c1 + 1); r1 = Math.min(E.ny - 2, r1 + 1);
  const at = (c: number, r: number, z: number) => F[z * N + r * E.nx + c];
  const pos = (c: number, r: number, z: number): [number, number, number] =>
    [E.ox + (c + 0.5) * E.res, E.oy + (r + 0.5) * E.res, (z - 0.5) * STOREY_M];
  // One vertex per cube (between eight samples) that the surface crosses.
  const W = c1 - c0 + 1, Hh = r1 - r0 + 1, vid = new Int32Array(W * Hh * (nzp - 1)).fill(-1);
  const cube = (c: number, r: number, z: number) => ((z * Hh) + (r - r0)) * W + (c - c0);
  const EDGES: [number, number, number, number, number, number][] = [];
  for (const [a, bb] of [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]]) {
    EDGES.push([a & 1, (a >> 1) & 1, a >> 2, bb & 1, (bb >> 1) & 1, bb >> 2]);
  }
  for (let z = 0; z < nzp - 1; z++) for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const [ac, ar, az, bc, br, bz] of EDGES) {
      const fa = at(c + ac, r + ar, z + az), fb = at(c + bc, r + br, z + bz);
      if ((fa > 0) === (fb > 0)) continue;
      const t = fa / (fa - fb);
      sx += ac + (bc - ac) * t; sy += ar + (br - ar) * t; sz += az + (bz - az) * t; n++;
    }
    if (!n) continue;
    const [x, y, zz] = pos(c + sx / n, r + sy / n, z + sz / n);
    vid[cube(c, r, z)] = b.vertex(x, y, zz);
  }
  // A quad round every sample edge the surface crosses, wound so it faces outwards.
  const quad = (a: number, bq: number, cq: number, d: number, flip: boolean) => {
    if (a < 0 || bq < 0 || cq < 0 || d < 0) return;
    if (flip) { b.tri(a, cq, bq); b.tri(a, d, cq); } else { b.tri(a, bq, cq); b.tri(a, cq, d); }
  };
  for (let z = 0; z < nzp - 1; z++) for (let r = r0 + 1; r <= r1; r++) for (let c = c0 + 1; c <= c1; c++) {
    const f0 = at(c, r, z) > 0;
    // The layer under the ground is all outside: only its upward edges can cross.
    if (z > 0 && (at(c + 1, r, z) > 0) !== f0)
      quad(vid[cube(c, r - 1, z - 1)], vid[cube(c, r, z - 1)], vid[cube(c, r, z)], vid[cube(c, r - 1, z)], !f0);
    if (z > 0 && (at(c, r + 1, z) > 0) !== f0)
      quad(vid[cube(c - 1, r, z - 1)], vid[cube(c - 1, r, z)], vid[cube(c, r, z)], vid[cube(c, r, z - 1)], !f0);
    if ((at(c, r, z + 1) > 0) !== f0)
      quad(vid[cube(c - 1, r - 1, z)], vid[cube(c, r - 1, z)], vid[cube(c, r, z)], vid[cube(c - 1, r, z)], !f0);
  }
  const P = b.p, nv = P.length / 3;
  // Taubin smoothing over the mesh's edges; heights clamped to the ground and the top.
  const nbr: number[][] = Array.from({ length: nv }, () => []);
  for (let k = 0; k < b.i.length; k += 3) {
    const t = [b.i[k], b.i[k + 1], b.i[k + 2]];
    for (let e = 0; e < 3; e++) { const u = t[e], v = t[(e + 1) % 3]; if (!nbr[u].includes(v)) { nbr[u].push(v); nbr[v].push(u); } }
  }
  const top = E.nz * STOREY_M;
  for (let s = 0; s < 2 * smooth; s++) {
    const w = s % 2 ? TAUBIN[1] : TAUBIN[0], Q = P.slice();
    for (let v = 0; v < nv; v++) {
      if (!nbr[v].length) continue;
      let x = 0, y = 0, z = 0;
      for (const u of nbr[v]) { x += Q[3 * u]; y += Q[3 * u + 1]; z += Q[3 * u + 2]; }
      const k = nbr[v].length;
      P[3 * v] += w * (x / k - Q[3 * v]); P[3 * v + 1] += w * (y / k - Q[3 * v + 1]); P[3 * v + 2] += w * (z / k - Q[3 * v + 2]);
    }
  }
  for (let v = 0; v < nv; v++) P[3 * v + 2] = Math.min(top, Math.max(0, P[3 * v + 2]));
  b.group("skin", 0);
  return b.done();
}

/** The mesh of any massing: boxes when it has them, else the skin. */
export const massingMesh = (E: Envelope, m: Massing): Mesh => (m.boxes ? boxesMesh(m.boxes, E.plots.length) : skinMesh(E, m));

/** The design's other buildings in the envelope's frame, as cell prisms (a little inset, so
 *  the streets between them read). */
export function contextMesh(E: Envelope, G: Ground, d: Design): Mesh {
  const b = new Builder(), shape = corners(G.grid), inBlock = new Set(E.cells), R = G.grid.size;
  const x0 = E.ox, y0 = E.oy, x1 = E.ox + E.nx * E.res, y1 = E.oy + E.ny * E.res;
  for (let i = 0; i < G.n; i++) {
    if (d.use[i] !== BUILDING || inBlock.has(i) || G.x[i] < x0 - R || G.x[i] > x1 + R || G.y[i] < y0 - R || G.y[i] > y1 + R) continue;
    const s = Math.sqrt(Math.max(0.2, d.coverage[i]));
    prism(b, shape.map(([dx, dy]) => [G.x[i] + dx * s, G.y[i] + dy * s] as [number, number]), 0, d.levels[i] * STOREY_M);
  }
  b.group("context", 0);
  return b.done();
}

/** The existing buildings in the frame (off the design ground), as prisms at their heights. */
export function existingMesh(E: Envelope, G: Ground): Mesh {
  const b = new Builder(), B = G.buildings;
  if (B) for (const k of E.neighbours) {
    const r = B.rings[k], ring: [number, number][] = [];
    for (let j = 0; j < r.length; j += 2) ring.push([r[j], r[j + 1]]);
    prism(b, ring, 0, B.h[k]);
  }
  b.group("existing", 0);
  return b.done();
}
