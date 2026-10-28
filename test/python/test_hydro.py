"""Flow lines on the terrain's pixels (pc/hydro.py): fill, flats, accumulation, Strahler order."""

import numpy as np

from pc import hydro


def _edge(shape):
    e = np.zeros(shape, dtype=bool)
    e[0, :] = e[-1, :] = e[:, 0] = e[:, -1] = True
    return e


def _flow(z):
    outlet = _edge(z.shape)
    filled = hydro.fill(z, outlet)
    rec = hydro.receivers(filled, 30.0, 30.0, outlet)
    hydro.flats(filled, rec, outlet)
    acc, order = hydro.accumulate(rec, np.ones(z.shape))
    return filled, rec, acc.reshape(z.shape), order


def test_a_v_valley_drains_along_its_axis_to_the_low_end():
    ny, nx = 21, 41
    rows, cols = np.mgrid[0:ny, 0:nx]
    z = 10.0 + 0.5 * np.abs(rows - 10) + 0.05 * cols       # a valley along row 10, falling to col 0
    _, _, acc, _ = _flow(z)
    axis = acc[10, 1:-1]
    assert (np.diff(axis[::-1]) >= 0).all()                 # grows downstream (towards col 0)
    assert acc[10, 1] > 0.8 * (ny - 2) * (nx - 2)          # nearly all the interior arrives there


def test_a_pit_is_filled_and_its_depth_kept():
    z = np.full((9, 9), 10.0)
    z[4, 4] = 7.0                                           # a 3 m hollow
    z[:, 0] = 9.0                                           # the left edge is lowest
    filled = hydro.fill(z, _edge(z.shape))
    assert filled[4, 4] == 10.0 and filled[4, 4] - z[4, 4] == 3.0


def test_every_pixel_on_a_flat_reaches_an_outlet():
    z = np.full((15, 15), 5.0)
    z[7, 0] = 4.0                                           # one way out, on the left edge
    outlet = np.zeros(z.shape, dtype=bool)
    outlet[7, 0] = True
    z[0, :] = z[-1, :] = z[:, -1] = 9.0                     # the other edges are walls
    z[:, 0] = np.where(np.arange(15) == 7, 4.0, 9.0)
    filled = hydro.fill(z, outlet)
    rec = hydro.receivers(filled, 30.0, 30.0, outlet)
    resolved = hydro.flats(filled, rec, outlet)
    assert resolved > 0
    interior = [r * 15 + c for r in range(1, 14) for c in range(1, 14)]
    for p in interior:                                      # follow each pixel down: no loops, ends at the outlet
        seen, q = set(), p
        while rec[q] >= 0:
            assert q not in seen
            seen.add(q)
            q = rec[q]
        assert q == 7 * 15
    acc, order = hydro.accumulate(rec, np.ones(z.shape))
    assert acc[7 * 15] >= len(interior)


def test_strahler_orders_two_heads_meeting():
    # a Y: two first-order streams joining make a second-order one
    stream = np.array([1, 1, 1, 1, 1], dtype=bool)
    rec = np.array([2, 2, 3, 4, -1])
    order = np.array([0, 1, 2, 3, 4])
    so, n_up = hydro.strahler(stream, rec, order)
    assert list(so) == [1, 1, 2, 2, 2]
    assert list(n_up) == [0, 0, 2, 1, 1]


def test_seasonal_water_is_the_share_of_a_cell_wet_often_enough(tmp_path):
    # two 20 m squares over a 10 m frequency raster: the left one half wet, the right one dry
    import geopandas as gpd
    import rasterio
    from rasterio.transform import from_origin
    from shapely.geometry import box

    from pc import seasonal

    class S:
        raw = tmp_path
    crs = "EPSG:32645"
    f = np.array([[0.5, 0.0, 0.0, 0.0], [0.5, 0.05, 0.0, np.nan]], dtype=np.float32)
    with rasterio.open(tmp_path / "seasonal-water.tif", "w", driver="GTiff", width=4, height=2, count=1,
                       dtype="float32", crs=crs, transform=from_origin(0, 20, 10, 10), nodata=np.nan) as dst:
        dst.write(f, 1)
    grid = gpd.GeoDataFrame(geometry=[box(0, 0, 20, 20), box(20, 0, 40, 20)], crs=crs)
    out = seasonal.add_seasonal(S, grid)
    assert list(out["seasonal_water"]) == [0.5, 0.0]
