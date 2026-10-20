"""Form metrics (pc/metrics): the hand-worked cases shared with the browser engine
(test/metrics/cases.json). Parity on real designs is in test/parity."""

import json
from pathlib import Path
from types import SimpleNamespace

import numpy as np
import pytest

from pc import grid as cellgrid
from pc import metrics
from pc.metrics.order import hull_area, periodicity

CASES = json.loads((Path(__file__).parents[1] / "metrics" / "cases.json").read_text(encoding="utf-8"))
USE = {"L": "landscape", "W": "water"}


def from_rows(rows, size):
    h, w = len(rows), len(rows[0])
    n = w * h
    xy, nbr = np.zeros((n, 2)), np.full((n, 4), -1)
    use, levels, fa = [], np.zeros(n, dtype=int), np.zeros(n)
    for r in range(h):
        for c in range(w):
            i, ch = r * w + c, rows[r][c]
            xy[i] = (c * size, r * size)
            for k, (dc, dr) in enumerate([(1, 0), (0, 1), (-1, 0), (0, -1)]):
                if 0 <= c + dc < w and 0 <= r + dr < h:
                    nbr[i, k] = (r + dr) * w + c + dc
            use.append(USE.get(ch, "building"))
            if ch not in USE:
                levels[i] = int(ch)
                fa[i] = size * size * 0.5 * levels[i]
    ground = SimpleNamespace(xy=xy, nbr=nbr, cap=np.full(n, 9), area=np.full(n, size * size),
                             bounds=(0.0, 0.0, (w - 1) * size, (h - 1) * size),
                             graph=cellgrid.make("quad", size), roads=[])
    design = SimpleNamespace(use=np.array(use), levels=levels, floor_area=fa, attractors=[])
    return ground, design


@pytest.mark.parametrize("case", CASES["cases"], ids=lambda c: c["name"].split(":")[0])
def test_hand_worked(case):
    ground, design = from_rows(case["rows"], CASES["grid"]["size"])
    got = metrics.measure(design, ground, list(case["expect"]))
    for k, v in case["expect"].items():
        assert got[k] == pytest.approx(v, abs=1e-12), k


def test_pieces():
    assert periodicity([1, 0, 1, 0, 1, 0, 1, 0]) == pytest.approx(1)
    assert periodicity([2, 2, 2, 2]) == 0
    assert hull_area([(0, 0), (2, 0), (2, 2), (0, 2), (1, 1)]) == 4


def test_objectives_need_a_better_end():
    from pc.evolve import objectives_of
    assert [k for k, _ in objectives_of(["dh_enclosure"])][-1] == "dh_enclosure"
    with pytest.raises(ValueError, match="better end"):
        objectives_of(["roughness"])
    with pytest.raises(ValueError, match="two"):
        objectives_of(["dh_enclosure", "the_void", "contrast"])
