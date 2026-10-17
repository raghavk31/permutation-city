// Polygon area on the sphere (the same formula turf.js uses), for checking a drawn site
// against the service's limits before sending it.
import { cellAreaOf } from "../../engine/graph";

const R = 6378137;
const rad = (d: number) => (d * Math.PI) / 180;

function ringArea(ring: number[][]): number {
  let total = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [l1, p1] = ring[i], [l2, p2] = ring[i + 1];
    total += rad(l2 - l1) * (2 + Math.sin(rad(p1)) + Math.sin(rad(p2)));
  }
  return Math.abs((total * R * R) / 2);
}

/** Area in km² of a GeoJSON Polygon's coordinates (outer ring minus holes). */
export function polygonKm2(coords: number[][][]): number {
  const [outer, ...holes] = coords;
  return (ringArea(outer) - holes.reduce((s, h) => s + ringArea(h), 0)) / 1e6;
}

/** Cells of a grid over that area (the service's estimate, service/pipeline.py). */
export const estimatedCells = (km2: number, type: "hex" | "quad", size: number) =>
  Math.floor((km2 * 1e6) / cellAreaOf({ type, size }));
