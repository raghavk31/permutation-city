"""The cell grid. Each cell is the 'primitive unit' of a design.

Everything after this file reads the grid through a CellGraph, so the layers, rules,
growth and fitness don't care which shape the cells are:

    cover(shape)     cells over a shape (centre inside), with row and col
    neighbours(df)   for each cell, the cells it shares an edge with (from row and col)
    polygon(cx, cy)  one cell's outline
    cell_area        m² per cell (every cell of a regular grid is the same)
    degree           neighbours of an interior cell; fewer means the cell is on the edge
    spacing          centre-to-centre distance between neighbours (m)
    edge             length of the edge two neighbours share (m): the adjacency weight

Two grids:
    hex   pointy-top hexagons, size = centre to corner (Eco-machine's 20 m), 6 neighbours
    quad  squares on the UTM axes, size = side, 4 neighbours (edges only, not corners)

Every pair of neighbours on these grids shares one whole edge at one spacing, so the
adjacency weights are all equal and smoothing stays a plain mean. An irregular graph
(Voronoi cells, parcels) would carry its own weights per pair; it isn't built yet.
"""

import math
from abc import ABC, abstractmethod

import geopandas as gpd
import numpy as np
from shapely.geometry import Point, Polygon, box

from pc.site import Site

GRID_TYPES = ("hex", "quad")


class CellGraph(ABC):
    type: str
    degree: int

    def __init__(self, size: float):
        self.size = float(size)

    @property
    @abstractmethod
    def spacing(self) -> float: ...

    @property
    @abstractmethod
    def edge(self) -> float: ...

    @property
    @abstractmethod
    def cell_area(self) -> float: ...

    @abstractmethod
    def polygon(self, cx: float, cy: float) -> Polygon: ...

    @abstractmethod
    def _centres(self, xmin, ymin, xmax, ymax):
        """(row, col, x, y) for every cell position over a box, row by row."""

    @abstractmethod
    def _touching(self, r: int, c: int) -> list[tuple[int, int]]:
        """(row, col) of the cells sharing an edge with (r, c), in a fixed order."""

    def cover(self, shape, crs) -> gpd.GeoDataFrame:
        """Cells whose centre falls inside the shape."""
        cells, rows, cols = [], [], []
        for row, col, x, y in self._centres(*shape.bounds):
            if shape.contains(Point(x, y)):
                cells.append(self.polygon(x, y))
                rows.append(row)
                cols.append(col)
        grid = gpd.GeoDataFrame({"row": rows, "col": cols}, geometry=cells, crs=crs)
        grid.index.name = "cell"
        return grid

    def neighbours(self, grid) -> list[list[int]]:
        """For each cell (row order), the positions of its neighbours that are in `grid`."""
        pos = {(r, c): i for i, (r, c) in enumerate(zip(grid["row"], grid["col"]))}
        return [[pos[k] for k in self._touching(r, c) if k in pos]
                for r, c in zip(grid["row"], grid["col"])]

    def padded(self, nbrs: list[list[int]]) -> np.ndarray:
        """Neighbours as an (n, degree) array, -1 where there is none."""
        out = np.full((len(nbrs), self.degree), -1)
        for i, row in enumerate(nbrs):
            out[i, :len(row)] = row
        return out


    def describe(self) -> dict:
        """The grid as the export carries it (meta.grid)."""
        return {"type": self.type, "size": self.size, "spacing": self.spacing,
                "degree": self.degree, "edge": self.edge}

    def label(self) -> str:
        return f"{self.size:g} m {'hexes' if self.type == 'hex' else 'squares'}"


class HexGrid(CellGraph):
    """Pointy-top hexagons; odd rows sit half a cell to the right."""
    type, degree = "hex", 6

    @property
    def spacing(self):
        return math.sqrt(3) * self.size

    @property
    def edge(self):
        return self.size

    @property
    def cell_area(self):
        return 1.5 * math.sqrt(3) * self.size ** 2

    def polygon(self, cx, cy):
        r = self.size
        return Polygon([(cx + r * math.cos(math.radians(a)), cy + r * math.sin(math.radians(a)))
                        for a in range(30, 390, 60)])

    def _centres(self, xmin, ymin, xmax, ymax):
        w, h = math.sqrt(3) * self.size, 1.5 * self.size  # column spacing, row spacing
        for row, y in enumerate(np.arange(ymin, ymax + h, h)):
            offset = w / 2 if row % 2 else 0
            for col, x in enumerate(np.arange(xmin + offset, xmax + w, w)):
                yield row, col, x, y

    def _touching(self, r, c):
        dc = (0, 1) if r % 2 else (-1, 0)  # columns touched in the rows above and below
        return [(r, c - 1), (r, c + 1)] + [(r + dr, c + d) for dr in (-1, 1) for d in dc]


class QuadGrid(CellGraph):
    """Squares on the UTM axes. Neighbours share an edge (west, east, south, north);
    cells that only touch at a corner are not neighbours, so water can't leak through
    a diagonal and 'fronting a park' means a shared edge, as it does on hexes."""
    type, degree = "quad", 4

    @property
    def spacing(self):
        return self.size

    @property
    def edge(self):
        return self.size

    @property
    def cell_area(self):
        return self.size ** 2

    def polygon(self, cx, cy):
        h = self.size / 2
        return box(cx - h, cy - h, cx + h, cy + h)

    def _centres(self, xmin, ymin, xmax, ymax):
        s = self.size
        for row, y in enumerate(np.arange(ymin + s / 2, ymax + s, s)):
            for col, x in enumerate(np.arange(xmin + s / 2, xmax + s, s)):
                yield row, col, x, y

    def _touching(self, r, c):
        return [(r, c - 1), (r, c + 1), (r - 1, c), (r + 1, c)]


def passes(reach_m: float, spacing: float) -> int:
    """How many neighbour steps cover `reach_m` metres (at least one; ties round to even,
    as the browser engine does). Smoothing and the daylight search are set in metres, so
    they reach about as far on any grid."""
    return max(1, round(reach_m / spacing))


def make(grid_type: str, size: float) -> CellGraph:
    if grid_type == "hex":
        return HexGrid(size)
    if grid_type == "quad":
        return QuadGrid(size)
    raise ValueError(f"unknown grid type {grid_type!r}; use one of {', '.join(GRID_TYPES)}")


def for_site(site: Site) -> CellGraph:
    return make(site.grid_type, site.cell_size)


def from_meta(meta: dict) -> CellGraph:
    """The grid of an export; files from before format 3 are 20 m-style hexes."""
    g = meta.get("grid") or {"type": "hex", "size": meta["hex_radius"]}
    return make(g["type"], g["size"])


def boundary(site: Site) -> gpd.GeoDataFrame:
    """The site box as one polygon, in metres."""
    return gpd.GeoDataFrame(geometry=[box(*site.bbox)], crs="EPSG:4326").to_crs(site.crs)


def cell_grid(site: Site) -> gpd.GeoDataFrame:
    """Cover the site's box with its grid."""
    b = boundary(site)
    return for_site(site).cover(b.geometry.iloc[0], site.crs)
