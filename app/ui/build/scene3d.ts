// The /build page's 3D view (loaded with the viewer, never up front): one plot's design as
// meshes for ui/mass/viewer.ts. The masses are extruded from their outlines with their courts
// as holes (three's ShapeUtils triangulates them); the trees are crowns on trunks; the ground is
// the envelope's raster with the plot, the street, the buildable land and the ponds.
import * as THREE from "three";
import type { Envelope } from "../../engine/massing/envelope";
import type { Mesh } from "../../engine/massing/mesh";
import type { Mass } from "../../engine/plan/blockmass";
import type { PlotNature } from "../../engine/massing/plotnature";
import type { Palette } from "../draw";

const STOREY = 3.2;
type Pt = [number, number];
const ccw = (r: Pt[]) => r.reduce((t, [x, y], i) => { const [u, v] = r[(i + 1) % r.length]; return t + x * v - u * y; }, 0) > 0;

class Builder {
  p: number[] = []; i: number[] = []; groups: Mesh["groups"] = [];
  v(x: number, y: number, z: number) { this.p.push(x, y, z); return this.p.length / 3 - 1; }
  t(a: number, b: number, c: number) { this.i.push(a, b, c); }
  done(name: string): Mesh { return { positions: Float32Array.from(this.p), indices: Uint32Array.from(this.i), groups: this.i.length ? [{ name, start: 0, count: this.i.length }] : [] }; }
}

function wall(b: Builder, ring: Pt[], z0: number, z1: number) {
  for (let k = 0; k < ring.length; k++) {
    const [ax, ay] = ring[k], [bx, by] = ring[(k + 1) % ring.length];
    const a = b.v(ax, ay, z0), c = b.v(bx, by, z0), d = b.v(bx, by, z1), e = b.v(ax, ay, z1);
    b.t(a, c, d); b.t(a, d, e);
  }
}

/** The masses as one mesh (group "plot 0", so the viewer keeps faces flat). */
export function massesMesh(masses: Mass[]): Mesh {
  const b = new Builder();
  for (const m of masses) {
    const outer = (ccw(m.ring as Pt[]) ? m.ring : [...m.ring].reverse()) as Pt[];
    const holes = (m.holes ?? []).map((h) => (ccw(h as Pt[]) ? [...h].reverse() : h) as Pt[]);
    const z0 = m.z, z1 = m.z + m.storeys * STOREY;
    wall(b, outer, z0, z1);
    for (const h of holes) wall(b, h, z0, z1);
    const contour = outer.map(([x, y]) => new THREE.Vector2(x, y)), hs = holes.map((h) => h.map(([x, y]) => new THREE.Vector2(x, y)));
    const all = [...outer, ...holes.flat()];
    for (const [i, j, k] of THREE.ShapeUtils.triangulateShape(contour, hs)) {
      const [p, q, r] = [all[i], all[j], all[k]];
      b.t(b.v(p[0], p[1], z1), b.v(q[0], q[1], z1), b.v(r[0], r[1], z1));
      b.t(b.v(p[0], p[1], z0), b.v(r[0], r[1], z0), b.v(q[0], q[1], z0));
    }
  }
  return b.done("plot 0");
}

/** Trees: a crown (an octahedron, 8 m up) on a thin trunk, one in three of the canopy columns. */
export function treesMesh(E: Envelope, n: PlotNature | undefined): Mesh {
  const b = new Builder();
  n?.trees.forEach((q, i) => {
    if (i % 3) return;
    const x = E.ox + ((q % E.nx) + 0.5) * E.res, y = E.oy + (Math.floor(q / E.nx) + 0.5) * E.res, r = 2.6, zc = 6.5;
    wall(b, [[x - 0.2, y - 0.2], [x + 0.2, y - 0.2], [x + 0.2, y + 0.2], [x - 0.2, y + 0.2]], 0, zc - 2);
    const top = b.v(x, y, zc + r), bot = b.v(x, y, zc - r), ring = [[r, 0], [0, r], [-r, 0], [0, -r]].map(([dx, dy]) => b.v(x + dx, y + dy, zc));
    for (let k = 0; k < 4; k++) { const a = ring[k], c = ring[(k + 1) % 4]; b.t(a, c, top); b.t(c, a, bot); }
  });
  return b.done("trees");
}

export const emptyMesh = (): Mesh => ({ positions: new Float32Array(0), indices: new Uint32Array(0), groups: [] });

/** The ground: the plot, its street, the buildable land and the ponds, at RES_M a pixel. */
export function plotGround(E: Envelope, n: PlotNature | undefined, P: Palette): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = E.nx; c.height = E.ny;
  const ctx = c.getContext("2d")!, img = ctx.createImageData(E.nx, E.ny);
  const rgb = (s: string) => { const v = parseInt(s.slice(1), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; };
  const t = P.t, wet = new Set(n?.water ?? []);
  const paper = rgb(t.paper), street = rgb(t.street.onGround), plot = rgb(t.building[0]), setback = rgb(t.paper2), water = rgb(t.water.storage);
  for (let r = 0; r < E.ny; r++) for (let col = 0; col < E.nx; col++) {
    const q = r * E.nx + col;
    const c3 = wet.has(q) ? water : E.street[q] ? street : E.plotOf[q] >= 0 ? plot : E.inPlot[q] >= 0 ? setback : paper;
    const k = ((E.ny - 1 - r) * E.nx + col) * 4;  // canvas rows run down; the frame's rows run north
    img.data[k] = c3[0]; img.data[k + 1] = c3[1]; img.data[k + 2] = c3[2]; img.data[k + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}
