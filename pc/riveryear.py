"""The river through its year, as the satellite saw it: how often each cell was wet, month by month.

    uv run pc river-year <site>   → raw/river-year.npz (per cell, per month) and raw/river-year.json

No public daily gauge series could be read for Agra (docs/architecture-v3.md section 15.8), so this
measures extent, not level: Sentinel-2 Level-2A, the same water test as pc/seasonal.py, for every
month of YEARS. Monsoon months have few clear looks, and each month says how many it had.
"""
from __future__ import annotations

import json
from concurrent.futures import ThreadPoolExecutor

import numpy as np
from rasterio.features import rasterize
from rasterio.transform import from_origin

from pc.lst import BUFFER, STAC, _json
from pc.seasonal import MAX_SCENE_CLOUD, MIN_LOOKS, PIXEL_M, scene_water
from pc.site import Site

YEARS = (2022, 2025)
PIXEL_OUT = "river-year"
DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]


def _month_scenes(site: Site, month: int) -> list[dict]:
    w, s, e, n = site.bbox
    out = []
    for year in range(YEARS[0], YEARS[1] + 1):
        last = DAYS[month - 1] + (month == 2 and year % 4 == 0)
        body = {"collections": ["sentinel-2-l2a"], "bbox": [w, s, e, n],
                "datetime": f"{year}-{month:02d}-01T00:00:00Z/{year}-{month:02d}-{last}T23:59:59Z",
                "query": {"eo:cloud_cover": {"lt": MAX_SCENE_CLOUD}}, "limit": 200}
        out += _json(STAC, body)["features"]
    return out


def per_cell(wet: np.ndarray, looks: np.ndarray, ids: np.ndarray, n: int) -> np.ndarray:
    """A month's wet looks and clear looks per pixel → the share of looks wet per cell, 0-100, from
    the pixels seen at least MIN_LOOKS times; -1 where the cell has none."""
    seen = (ids > 0) & (looks >= MIN_LOOKS)
    idx = ids[seen] - 1
    tot = np.bincount(idx, minlength=n).astype(float)
    freq = np.bincount(idx, weights=wet[seen] / looks[seen], minlength=n)
    return np.where(tot > 0, np.round(100 * freq / np.maximum(tot, 1)), -1).astype(np.int16)


def fetch_river_year(site: Site, grid, log=print) -> dict:
    import geopandas as gpd
    from shapely.geometry import box

    w, s, e, n = site.bbox
    frame = gpd.GeoSeries([box(w - BUFFER, s - BUFFER, e + BUFFER, n + BUFFER)], crs=4326).to_crs(site.crs)
    x0, y0, x1, y1 = frame.total_bounds
    width, height = int(np.ceil((x1 - x0) / PIXEL_M)), int(np.ceil((y1 - y0) / PIXEL_M))
    transform = from_origin(x0, y1, PIXEL_M, PIXEL_M)
    cells = grid.to_crs(site.crs)
    ids = rasterize(zip(cells.geometry, range(1, len(cells) + 1)), out_shape=(height, width),
                    transform=transform, fill=0, dtype="int32")
    wet_share = np.zeros((12, len(cells)), dtype=np.int16)
    months = []
    with ThreadPoolExecutor(max_workers=8) as pool:   # the reads wait on the network
        for m in range(1, 13):
            looks = np.zeros((height, width), dtype=np.int32)
            wet = np.zeros((height, width), dtype=np.int32)
            used = []
            for r in pool.map(lambda f: scene_water(f, site.crs, transform, width, height, log), _month_scenes(site, m)):
                if r is None:
                    continue
                f, share, clear, is_wet = r
                looks += clear
                wet += is_wet
                used.append(f["properties"]["datetime"][:10])
            wet_share[m - 1] = per_cell(wet, looks, ids, len(cells))
            inside = looks[ids > 0]
            months.append({"month": m, "scenes": len(used), "median_looks": int(np.median(inside)) if inside.size else 0})
            log(f"  month {m:2d}: {len(used)} clear scenes, median {months[-1]['median_looks']} clear looks a pixel")
    site.raw.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(site.raw / f"{PIXEL_OUT}.npz", wet=wet_share)
    meta = {"source": "Sentinel-2 Level-2A (SCL cloud mask, NDWI), Microsoft Planetary Computer",
            "years": list(YEARS), "months": months, "min_looks": MIN_LOOKS}
    (site.raw / f"{PIXEL_OUT}.json").write_text(json.dumps(meta, indent=1), encoding="utf-8")
    return meta


def load(site: Site) -> tuple[np.ndarray, dict] | None:
    p = site.raw / f"{PIXEL_OUT}.npz"
    if not p.exists():
        return None
    return np.load(p)["wet"], json.loads((site.raw / f"{PIXEL_OUT}.json").read_text(encoding="utf-8"))
