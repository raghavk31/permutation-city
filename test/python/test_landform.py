"""Landform (pc/landform.py) and genome versions: relief classes, fill and flow, the flat
fallback, Copernicus sites, and pre-street genomes. Streets themselves are checked in both
engines by the parity fixtures and test/ui/streets.test.ts."""

import numpy as np
import pandas as pd
import pytest

from pc import genome, landform


def _line(z, water_end=True):
    """Cells in a row (each the next one's neighbour), with ground heights z."""
    n = len(z)
    nbrs = [[j for j in (i - 1, i + 1) if 0 <= j < n] for i in range(n)]
    grid = pd.DataFrame({"ground": z, "water": [False] * (n - 1) + [water_end], "in_design": True})
    return grid, nbrs


def test_relief_classes():
    grid, nbrs = _line(list(np.linspace(0, 2, 30)))
    assert landform.relief(grid, nbrs, 35.0, "fabdem")["class"] == "flat"           # 2 m of relief
    grid, nbrs = _line(list(np.linspace(0, 12, 30)))
    assert landform.relief(grid, nbrs, 35.0, "fabdem")["class"] == "gentle"         # 12 m, ~1.2% slope
    grid, nbrs = _line(list(np.linspace(0, 60, 30)))
    assert landform.relief(grid, nbrs, 35.0, "fabdem")["class"] == "pronounced"     # 60 m, ~6% slope


def test_hills_beside_a_valley_floor_are_pronounced():
    # 70 flat cells and 30 climbing 120 m (12%): the median slope is ~0, but 30% of the land is steep.
    grid, nbrs = _line([0.0] * 70 + list(np.linspace(4, 120, 30)))
    r = landform.relief(grid, nbrs, 35.0, "fabdem")
    assert r["median_slope"] < landform.SLOPE_FLAT and r["class"] == "pronounced"


def test_a_surface_model_is_flat_by_rule_and_marked_to_rebuild():
    grid, nbrs = _line(list(np.linspace(0, 60, 30)))
    r = landform.relief(grid, nbrs, 35.0, "copernicus-surface")
    assert (r["class"], r["confidence"], r["rebuild"]) == ("flat", "low", True)


def test_fill_lets_a_hollow_drain_and_flow_goes_downhill():
    # 5 4 [1] 3 2 0(water): the hollow at index 2 fills to just above 3 and drains on.
    z = np.array([5.0, 4.0, 1.0, 3.0, 2.0, 0.0])
    outlet = np.array([False] * 5 + [True])
    nbrs = [[j for j in (i - 1, i + 1) if 0 <= j < 6] for i in range(6)]
    filled, recv = landform.flow(z, outlet, nbrs)
    assert filled[2] > 3.0 and filled[2] < 3.001
    assert list(recv) == [1, 2, 3, 4, 5, -1]


def test_pre_street_genomes_take_the_default_street_genes():
    g = np.arange(genome.PRE_STREET_LENGTH) / 100
    full, old = genome.upgrade(g)
    assert old and len(full) == genome.LENGTH and list(full[-4:]) == [0.5] * 4
    same, old2 = genome.upgrade(full)
    assert not old2 and same is not None
    with pytest.raises(ValueError, match="numbers"):
        genome.upgrade(g[:20])


def test_cell_slope_reads_a_plane():
    import geopandas as gpd
    from shapely.geometry import Point
    # a 5 x 5 square of points 30 m apart on a 10% slope rising to the east
    pts = [(i * 30.0, j * 30.0) for j in range(5) for i in range(5)]
    grid = gpd.GeoDataFrame({"ground": [0.1 * x for x, _ in pts]},
                            geometry=[Point(x, y).buffer(1) for x, y in pts], crs=32643)
    idx = {p: k for k, p in enumerate(pts)}
    nbrs = [[idx[(x + dx, y + dy)] for dx, dy in ((30, 0), (-30, 0), (0, 30), (0, -30)) if (x + dx, y + dy) in idx]
            for x, y in pts]
    s = landform.slope(grid, nbrs)
    assert np.allclose(s, 0.1, atol=1e-6)


def test_a_site_can_choose_its_skeleton(tmp_path, monkeypatch):
    from pc import site as site_mod
    monkeypatch.setattr(site_mod, "SITES", tmp_path)
    (tmp_path / "x").mkdir()
    box = "name: x\nbbox: [91.7, 26.1, 91.8, 26.2]\n"
    (tmp_path / "x" / "site.yaml").write_text(box + "skeleton: roads\n")
    assert site_mod.load("x").skeleton == "roads"
    (tmp_path / "x" / "site.yaml").write_text(box)
    assert site_mod.load("x").skeleton == "auto"
