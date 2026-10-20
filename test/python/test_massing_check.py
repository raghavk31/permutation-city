"""The building-scale bench (pc/massing_check.py): massings the browser bred, rechecked here.
Fixtures come from `npm run massing-bench` (app/scripts/massing-bench.ts)."""

import copy
import json
from pathlib import Path

import pytest

from pc import massing_check as mc

FIXTURES = sorted((Path(__file__).parents[1] / "massing" / "fixtures").glob("*.json"))


def _load(path):
    return json.loads(path.read_text(encoding="utf-8"))


@pytest.mark.parametrize("path", FIXTURES, ids=[p.stem for p in FIXTURES])
def test_fixture_passes(path):
    r = mc.check(_load(path))
    assert r["envelope"] == [] and r["suns"] == [] and r["scores"] == []


def test_there_are_fixtures_for_every_representation():
    kinds = {p.stem.rsplit("-", 1)[1] for p in FIXTURES}
    assert kinds == {"typology", "field", "cppn"}


def _occ(b):
    return mc.unrle(b["occ"])


def _set_occ(b, occ):
    out = []
    for v in occ:
        if out and out[-2] == v:
            out[-1] += 1
        else:
            out += [v, 1]
    b["occ"] = out


def test_catches_a_floating_voxel_and_a_wrong_score():
    b = copy.deepcopy(_load(FIXTURES[0]))
    occ, N = _occ(b), b["nx"] * b["ny"]
    # An empty buildable column: put a voxel on its second storey only.
    plot_of, cap = mc.unrle(b["plotOf"]), mc.unrle(b["capZ"])
    q = next(q for q in range(N) if plot_of[q] >= 0 and cap[q] >= 2 and not occ[q] and not occ[N + q])
    occ[N + q] = 1
    _set_occ(b, occ)
    r = mc.check(b)
    assert any("nothing under them" in p for p in r["envelope"])
    assert any(p.startswith("gap") for p in r["scores"])  # floor area changed, so the gap did


def test_catches_a_voxel_outside_the_plot():
    b = copy.deepcopy(_load(FIXTURES[0]))
    occ, N = _occ(b), b["nx"] * b["ny"]
    plot_of = mc.unrle(b["plotOf"])
    occ[next(q for q in range(N) if plot_of[q] < 0)] = 1
    _set_occ(b, occ)
    assert any("outside the envelope" in p for p in mc.check(b)["envelope"])


def test_suns_follow_the_dates():
    b = copy.deepcopy(_load(FIXTURES[0]))
    b["lat"] += 1.0
    assert mc.check(b)["suns"]
    # Winter at 23° N: noon sun about 43.5° up, due south.
    alt, d = mc.sun_dir(23.0, 355, 12.0)
    assert abs(alt * 180 / 3.141592653589793 - 43.5) < 0.3 and d[1] < 0 and abs(d[0]) < 1e-9
