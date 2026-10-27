"""Seasonal water: ponds and tanks that hold water through the monsoon and are farmed or dry
the rest of the year (south Bihar's ahars, Bengaluru's tanks in a dry year). Sentinel-2
Level-2A from Microsoft Planetary Computer (no key). docs/landform.md.

Single snapshots miss them: ESA WorldCover 2021 reads a dry ahar as cropland, JRC Global
Surface Water's 30 m Landsat misses most of them, and OSM maps few. So for each year in
`site.wet_years`, the scenes of the months `site.wet_months` (the end of the monsoon, when
they are full) are read over the site's box at 10 m:

  - a pixel is looked at when the scene classification (SCL) says it isn't cloud, cloud
    shadow, cirrus, snow, saturated or missing
  - it is wet when the green-NIR water index (McFeeters' NDWI) is over WET_NDWI, or SCL calls
    it water
  - its frequency is wet looks over clear looks, kept where it was seen at least MIN_LOOKS
    times

A cell's `seasonal_water` is the share of its pixels wet in at least WET_FREQ of the looks.
Permanent water is in it too: rules read it beside `water`.
"""

import json

import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.transform import from_origin
from rasterio.vrt import WarpedVRT

from pc.lst import BUFFER, STAC, _json, _signed
from pc.site import Site

PIXEL_M = 10.0
MAX_SCENE_CLOUD = 60      # % of the whole scene; monsoon skies are rarely clearer
MIN_CLEAR_SHARE = 0.3     # of the box, or the scene is skipped
WET_NDWI = 0.1            # (green - NIR) / (green + NIR) over this: open water or flooded ground
MIN_LOOKS = 3             # clear looks a pixel needs before its frequency counts
WET_FREQ = 0.1            # wet in at least a tenth of the clear looks (six or more of about sixty): monsoon
                          # cloud, turbid and weedy water keep real ponds from reading wet every time
CLOUDY_SCL = {0, 1, 3, 8, 9, 10, 11}   # no data, saturated, cloud shadow, cloud (medium, high), cirrus, snow
WATER_SCL = 6
CREDIT = "Seasonal water: contains modified Copernicus Sentinel data (Sentinel-2 Level-2A), via Microsoft Planetary Computer"


def scenes(site: Site) -> list[dict]:
    w, s, e, n = site.bbox
    m0, m1 = site.wet_months
    out = []
    for year in range(site.wet_years[0], site.wet_years[1] + 1):
        last = [31, 28 + (year % 4 == 0), 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m1 - 1]
        body = {"collections": ["sentinel-2-l2a"], "bbox": [w, s, e, n],
                "datetime": f"{year}-{m0:02d}-01T00:00:00Z/{year}-{m1:02d}-{last}T23:59:59Z",
                "query": {"eo:cloud_cover": {"lt": MAX_SCENE_CLOUD}}, "limit": 200}
        out += _json(STAC, body)["features"]
    return sorted(out, key=lambda f: f["properties"]["datetime"])


def fetch_seasonal(site: Site, log=print) -> dict:
    """Water frequency at the end of the monsoon → raw/seasonal-water.tif (0-1, NaN where never
    seen clear often enough), and the scenes used → raw/seasonal-water.json."""
    import geopandas as gpd
    from shapely.geometry import box

    w, s, e, n = site.bbox
    frame = gpd.GeoSeries([box(w - BUFFER, s - BUFFER, e + BUFFER, n + BUFFER)], crs=4326).to_crs(site.crs)
    x0, y0, x1, y1 = frame.total_bounds
    width, height = int(np.ceil((x1 - x0) / PIXEL_M)), int(np.ceil((y1 - y0) / PIXEL_M))
    transform = from_origin(x0, y1, PIXEL_M, PIXEL_M)
    looks = np.zeros((height, width), dtype=np.int32)
    wet = np.zeros((height, width), dtype=np.int32)
    def read(href, rs):
        with rasterio.open(_signed(href)) as src, WarpedVRT(
                src, crs=site.crs, transform=transform, width=width, height=height, resampling=rs) as vrt:
            return vrt.read(1).astype(np.float64)

    def look(f):
        """One scene: the cloud mask first (20 m, small), the two bands only if enough is clear."""
        a = f["assets"]
        try:
            scl = read(a["SCL"]["href"], Resampling.nearest).astype(np.int64)
            clear = ~np.isin(scl, list(CLOUDY_SCL))
            share = float(clear.mean())
            if share < MIN_CLEAR_SHARE:
                return None
            g, nir = read(a["B03"]["href"], Resampling.average), read(a["B08"]["href"], Resampling.average)
        except Exception as err:  # a scene that won't read is skipped, not fatal
            log(f"  seasonal water: skipped {f['id']} ({type(err).__name__})")
            return None
        ndwi = (g - nir) / np.maximum(g + nir, 1.0)
        return f, share, clear, clear & ((ndwi > WET_NDWI) | (scl == WATER_SCL))

    from concurrent.futures import ThreadPoolExecutor
    used = []
    with ThreadPoolExecutor(max_workers=8) as pool:   # the reads wait on the network
        for r in pool.map(look, scenes(site)):
            if r is None:
                continue
            f, share, clear, is_wet = r
            looks += clear
            wet += is_wet
            used.append({"id": f["id"], "date": f["properties"]["datetime"][:10], "clear": round(share, 2),
                         "wet": round(float(is_wet.sum() / max(1, clear.sum())), 4)})
    if not used:
        raise RuntimeError("no clear end-of-monsoon Sentinel-2 scenes for this box")
    freq = np.where(looks >= MIN_LOOKS, wet / np.maximum(looks, 1), np.nan).astype(np.float32)
    site.raw.mkdir(parents=True, exist_ok=True)
    with rasterio.open(site.raw / "seasonal-water.tif", "w", driver="GTiff", width=width, height=height, count=1,
                       dtype="float32", crs=site.crs, transform=transform, nodata=np.nan, compress="deflate") as dst:
        dst.write(freq, 1)
    seen = looks >= MIN_LOOKS
    meta = {"source": "Sentinel-2 Level-2A (SCL cloud mask, NDWI), Microsoft Planetary Computer",
            "months": list(site.wet_months), "years": list(site.wet_years), "scenes": used,
            "median_clear_looks_per_pixel": int(np.median(looks)), "seen_share": round(float(seen.mean()), 3),
            "wet_ndwi": WET_NDWI, "wet_freq": WET_FREQ, "min_looks": MIN_LOOKS,
            "wet_ha": round(float((np.nan_to_num(freq) >= WET_FREQ).sum() * PIXEL_M ** 2 / 1e4), 1)}
    (site.raw / "seasonal-water.json").write_text(json.dumps(meta, indent=1), encoding="utf-8")
    log(f"  seasonal water: {len(used)} clear scenes ({used[0]['date']} to {used[-1]['date']}), "
        f"median {meta['median_clear_looks_per_pixel']} clear looks a pixel; {meta['wet_ha']} ha wet in "
        f"at least {WET_FREQ:.0%} of them")
    return meta


def add_seasonal(site: Site, grid):
    """Per cell: the share of its 10 m pixels wet in at least WET_FREQ of the clear looks (no
    column without a fetched raster)."""
    p = site.raw / "seasonal-water.tif"
    if not p.exists():
        return grid
    from rasterio.features import rasterize
    with rasterio.open(p) as src:
        freq = src.read(1)
        cells = grid.to_crs(src.crs)
        ids = rasterize(zip(cells.geometry, range(1, len(cells) + 1)), out_shape=freq.shape,
                        transform=src.transform, fill=0, dtype="int32")
    m = ids > 0
    n = len(grid)
    tot = np.bincount(ids[m] - 1, minlength=n)
    hit = np.bincount(ids[m] - 1, weights=(np.nan_to_num(freq[m]) >= WET_FREQ).astype(float), minlength=n)
    grid["seasonal_water"] = np.round(np.where(tot > 0, hit / np.maximum(tot, 1), 0.0), 3)
    return grid


def meta(site: Site) -> dict | None:
    p = site.raw / "seasonal-water.json"
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else None
