"""Existing buildings' heights from Google Open Buildings (pc/export.py): the 90th percentile of
the raster inside each footprint, NaN where there is no reading."""

from types import SimpleNamespace

import numpy as np
import rasterio
from rasterio.transform import from_origin
from shapely.geometry import box

from pc.export import _open_buildings_heights


def test_footprint_heights(tmp_path):
    a = np.full((20, 20), np.nan, np.float32)  # 2 m pixels over (0, 0)-(40, 40)
    a[0:5, 0:5] = 12.0     # a building at the top left, 12 m
    a[4, 4] = 30.0         # one tall pixel: p90 of 25 pixels stays 12
    a[10:15, 10:15] = 6.0  # another, 6 m
    path = tmp_path / "heights.tif"
    with rasterio.open(path, "w", driver="GTiff", width=20, height=20, count=1, dtype="float32",
                       crs="EPSG:32643", transform=from_origin(0, 40, 2, 2), nodata=float("nan")) as d:
        d.write(a, 1)
    site = SimpleNamespace(heights=path)
    h = _open_buildings_heights(site, [box(0.5, 30.5, 9.5, 39.5), box(20.5, 10.5, 29.5, 19.5), box(32, 0, 38, 6)])
    assert h[0] == 12.0
    assert h[1] == 6.0
    assert np.isnan(h[2])  # no reading
