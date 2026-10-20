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
