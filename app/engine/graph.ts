// The cell grid (pc/grid.py). Everything that needs a cell's shape or its neighbours goes
// through here, so the engine and the drawing work on hexes and squares alike.
//
//   hex   pointy-top hexagons, size = centre to corner, 6 neighbours
//   quad  squares on the map axes, size = side, 4 neighbours (edges only, not corners)
//
// Every pair of neighbours on these grids shares one whole edge at one spacing, so the
// adjacency weights are all equal and smoothing stays a plain mean. An irregular graph
// (Voronoi cells, parcels) would carry its own weight per pair; it isn't built yet.
import { roundHalfEven } from "./num";
import type { GridInfo, Ground, SiteExport, SiteMeta } from "./types";

/** The grid of a site. Files before format 3 have only `hex_radius`. */
export function gridOf(meta: SiteMeta): GridInfo {
  if (meta.grid) return meta.grid;
  const r = meta.hex_radius ?? 20;
  return { type: "hex", size: r, spacing: Math.sqrt(3) * r, degree: 6, edge: r };
}

/** How many neighbour steps cover `reachM` metres (at least one), as pc.grid.passes. */
export const passes = (reachM: number, spacing: number) => Math.max(1, roundHalfEven(reachM / spacing));

/** A cell's outline as offsets (metres) from its centre, y up. */
export function corners(g: Pick<GridInfo, "type" | "size">): [number, number][] {
  if (g.type === "quad") {
    const h = g.size / 2;
    return [[h, h], [-h, h], [-h, -h], [h, -h]];
  }
  return [30, 90, 150, 210, 270, 330].map((deg) => {
    const a = (deg * Math.PI) / 180;
    return [g.size * Math.cos(a), g.size * Math.sin(a)];
  });
}

/** Centre to corner (m): the radius of the smallest circle round a cell. */
export const circumradius = (g: Pick<GridInfo, "type" | "size">) => (g.type === "quad" ? g.size * Math.SQRT1_2 : g.size);

/** m² per cell, from the grid alone (the export's `cell_area` is the measured one). */
export const cellAreaOf = (g: Pick<GridInfo, "type" | "size">) =>
  (g.type === "quad" ? g.size * g.size : 1.5 * Math.sqrt(3) * g.size * g.size);

/** "20 m hexes", "25 m squares". */
export const gridLabel = (g: Pick<GridInfo, "type" | "size">) => `${g.size} m ${g.type === "quad" ? "squares" : "hexes"}`;

/** Cells, their neighbours, centroids, areas, outlines and adjacency weights. */
export interface CellGraph {
  readonly grid: GridInfo;
  readonly n: number;
  neighbours(i: number): number[];
  centroid(i: number): [number, number];
  area(i: number): number;
  polygon(i: number): [number, number][];
  /** Adjacency weight between neighbours: the length of the edge they share (m). */
  weight(i: number, j: number): number;
}

function graphOf(grid: GridInfo, x: ArrayLike<number>, y: ArrayLike<number>, nbr: ArrayLike<number>,
  cellArea: number): CellGraph {
  const d = grid.degree, shape = corners(grid);
  return {
    grid, n: x.length,
    neighbours(i) {
      const out: number[] = [];
      for (let k = 0; k < d; k++) { const j = nbr[i * d + k]; if (j >= 0) out.push(j); }
      return out;
    },
    centroid: (i) => [x[i], y[i]],
    area: () => cellArea,
    polygon: (i) => shape.map(([dx, dy]) => [x[i] + dx, y[i] + dy] as [number, number]),
    weight(i, j) {
      for (let k = 0; k < d; k++) if (nbr[i * d + k] === j) return grid.edge;
      return 0;
    },
  };
}

/** The whole grid of a site (format 2 and later carry its neighbours). */
export function siteGraph(site: SiteExport): CellGraph {
  const g = site.grid;
  if (!g.nbr) throw new Error("this site file is format 1: re-export it to read its grid");
  return graphOf(gridOf(site.meta), g.x, g.y, g.nbr, site.meta.cell_area);
}

/** The design ground the engine grows on. */
export const designGraph = (G: Ground): CellGraph => graphOf(G.grid, G.x, G.y, G.nbr, G.cellArea);
