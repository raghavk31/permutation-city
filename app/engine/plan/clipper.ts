// Polygon union, intersection and difference with holes, for joining a precedent's units into
// buildings and trimming them to a lot (blockmass.ts). Clipper (Johnson 2014) on whole
// millimetres, so near-coincident edges (units sharing a wall, a unit on the lot's outline)
// are exact.
import ClipperLib from "clipper-lib";
import { area, type Line } from "./geom.js";

/** A polygon: its outline anticlockwise, its holes clockwise (metres). */
export interface Poly { outer: Line; holes: Line[] }

const MM = 1000;
const path = (r: Line, ccw: boolean) => {
  const p = r.map(([x, y]) => ({ X: Math.round(x * MM), Y: Math.round(y * MM) }));
  return (area(r) > 0) === ccw ? p : p.reverse();
};
const paths = (ps: Poly[]) => ps.flatMap((p) => [path(p.outer, true), ...p.holes.map((h) => path(h, false))]);
const line = (p: ClipperLib.IntPoint[]): Line => p.map((q) => [q.X / MM, q.Y / MM]);

function run(kind: ClipperLib.ClipType, a: Poly[], b: Poly[]): Poly[] {
  const c = new ClipperLib.Clipper(), tree = new ClipperLib.PolyTree();
  c.StrictlySimple = true;  // a court a hole, not an outline that touches itself
  c.AddPaths(paths(a), ClipperLib.PolyType.ptSubject, true);
  if (b.length) c.AddPaths(paths(b), ClipperLib.PolyType.ptClip, true);
  c.Execute(kind, tree, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
  const out: Poly[] = [];
  const walk = (n: ClipperLib.PolyNode) => {
    for (const o of n.Childs()) {
      const outer = line(o.Contour());
      if (outer.length < 3) continue;
      const holes: Line[] = [];
      for (const h of o.Childs()) {
        const r = line(h.Contour());
        if (r.length >= 3) holes.push(area(r) < 0 ? r : r.reverse());
        walk(h);  // islands inside a hole
      }
      out.push({ outer: area(outer) > 0 ? outer : outer.reverse(), holes });
    }
  };
  walk(tree);
  return out;
}

export const unite = (ps: Poly[]) => (ps.length ? run(ClipperLib.ClipType.ctUnion, ps, []) : []);
export const intersect = (a: Poly[], b: Poly[]) => (a.length && b.length ? run(ClipperLib.ClipType.ctIntersection, a, b) : []);
export const subtract = (a: Poly[], b: Poly[]) => (a.length ? run(ClipperLib.ClipType.ctDifference, a, b) : []);
/** Area of polygons with holes (m²). */
export const polysArea = (ps: Poly[]) => ps.reduce((s, p) => s + Math.abs(area(p.outer)) - p.holes.reduce((t, h) => t + Math.abs(area(h)), 0), 0);
