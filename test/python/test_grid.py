"""The cell grids (pc/grid.py): shapes, neighbours, and reaches in metres."""

import math

import numpy as np
import pytest
from shapely.geometry import box

from pc import grid as cellgrid

SQUARE = box(0, 0, 400, 300)


@pytest.fixture(params=["hex", "quad"])
def graph(request):
    return cellgrid.make(request.param, 20)


def test_cells_match_the_grid(graph):
    cells = graph.cover(SQUARE, "EPSG:32643")
    assert len(cells) > 100
    assert np.allclose(cells.area, graph.cell_area)
    c = cells.geometry.iloc[0].centroid
    assert graph.polygon(c.x, c.y).equals_exact(cells.geometry.iloc[0], 1e-6)


def test_neighbours_share_an_edge_and_are_symmetric(graph):
    cells = graph.cover(SQUARE, "EPSG:32643")
    nbrs = graph.neighbours(cells)
    assert max(len(n) for n in nbrs) == graph.degree
    cen = cells.centroid
    for i, row in enumerate(nbrs):
        for j in row:
            assert i in nbrs[j]
            assert math.isclose(cen.iloc[i].distance(cen.iloc[j]), graph.spacing, rel_tol=1e-9)
            # the overlap of one cell, grown 1 cm, with its neighbour: edge length × 1 cm
            shared = cells.geometry.iloc[i].buffer(0.01).intersection(cells.geometry.iloc[j]).area / 0.01
            assert math.isclose(shared, graph.edge, rel_tol=1e-3)


def test_interior_and_edge_cells(graph):
    cells = graph.cover(SQUARE, "EPSG:32643")
    degree = np.array([len(n) for n in graph.neighbours(cells)])
    assert (degree == graph.degree).sum() > len(cells) / 2
    assert (degree < graph.degree).any()  # the edge of the box: drainage outlets


def test_quad_has_no_diagonal_neighbours():
    q = cellgrid.make("quad", 20)
    assert q._touching(5, 5) == [(5, 4), (5, 6), (4, 5), (6, 5)]


def test_padded():
    q = cellgrid.make("quad", 20)
    assert q.padded([[1, 2], [0]]).tolist() == [[1, 2, -1, -1], [0, -1, -1, -1]]


def test_reaches_in_metres():
    hex20, quad20, quad30 = cellgrid.make("hex", 20), cellgrid.make("quad", 20), cellgrid.make("quad", 30)
    # 20 m hexes keep the original step counts: 3 for 100 m, 1 for 35 m
    assert cellgrid.passes(100, hex20.spacing) == 3
    assert cellgrid.passes(35, hex20.spacing) == 1
    assert cellgrid.passes(100, quad20.spacing) == 5
    assert cellgrid.passes(35, quad20.spacing) == 2
    assert cellgrid.passes(100, quad30.spacing) == 3
    assert cellgrid.passes(5, quad30.spacing) == 1  # at least one step


def test_older_exports_read_as_hex():
    g = cellgrid.from_meta({"hex_radius": 20.0})
    assert (g.type, g.size, g.degree) == ("hex", 20.0, 6)
    assert cellgrid.from_meta({"grid": {"type": "quad", "size": 25}}).cell_area == 625


def test_unknown_grid():
    with pytest.raises(ValueError, match="hex, quad"):
        cellgrid.make("voronoi", 20)
