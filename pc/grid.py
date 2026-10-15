"""The hex grid. Each hex cell is the 'primitive unit' of a design."""

import math

import geopandas as gpd
import numpy as np
from shapely.geometry import Point, Polygon, box

from pc.site import Site


def boundary(site: Site) -> gpd.GeoDataFrame:
    """The site box as one polygon, in metres."""
    return gpd.GeoDataFrame(geometry=[box(*site.bbox)], crs="EPSG:4326").to_crs(site.crs)


def hexagon(cx: float, cy: float, r: float) -> Polygon:
    """Pointy-top hexagon centred on (cx, cy) with radius r."""
    return Polygon([(cx + r * math.cos(math.radians(a)), cy + r * math.sin(math.radians(a)))
                    for a in range(30, 390, 60)])


def hex_grid(site: Site) -> gpd.GeoDataFrame:
    """Cover the site with hexagons; keep those whose centre falls inside.
    Odd rows sit half a cell to the right (pc.layers.neighbours relies on this)."""
    b = boundary(site)
    r = site.hex_radius
    xmin, ymin, xmax, ymax = b.total_bounds
    w, h = math.sqrt(3) * r, 1.5 * r  # column spacing, row spacing
    shape = b.geometry.iloc[0]

    cells, rows, cols = [], [], []
    for row, y in enumerate(np.arange(ymin, ymax + h, h)):
        offset = w / 2 if row % 2 else 0
        for col, x in enumerate(np.arange(xmin + offset, xmax + w, w)):
            if shape.contains(Point(x, y)):
                cells.append(hexagon(x, y, r))
                rows.append(row)
                cols.append(col)

    grid = gpd.GeoDataFrame({"row": rows, "col": cols}, geometry=cells, crs=site.crs)
    grid.index.name = "cell"
    return grid
