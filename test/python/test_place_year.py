"""A real place's river year and view eyes (pc/riveryear.py, pc/place.py)."""
import numpy as np
from shapely.geometry import Point, box

from pc.place import _edge_toward
from pc.riveryear import per_cell


def test_a_cell_averages_the_pixels_seen_often_enough():
    ids = np.array([[1, 1, 2, 0]])
    looks = np.array([[10, 10, 2, 10]])
    wet = np.array([[10, 0, 2, 10]])
    out = per_cell(wet, looks, ids, 3)
    assert out[0] == 50     # one pixel always wet, one never
    assert out[1] == -1     # seen too seldom to say
    assert out[2] == -1     # no pixels at all


def test_an_eye_stays_on_the_axis_of_a_footprint():
    eye = _edge_toward(box(-50, -50, 50, 50), Point(0, 500))
    assert abs(eye.x) < 1e-6 and abs(eye.y - 50) < 1e-6
