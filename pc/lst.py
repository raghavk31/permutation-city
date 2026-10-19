"""Land surface temperature (LST), hot season: Landsat 8/9 Collection 2 Level-2 surface
temperature from Microsoft Planetary Computer (no key). docs/landform.md.

For each year in `site.lst_years`, scenes from the months `site.lst_months` (both ends
included) are read over the site's box. Pixels flagged as fill, cloud, dilated cloud,
cirrus, cloud shadow or snow (QA_PIXEL bits 0 to 5), or with a surface-temperature
uncertainty over 5 K (ST_QA), are dropped. The rest are converted to °C
(scale 0.00341802, offset 149 K) and the median of the clear scenes is kept, per 30 m pixel.

It is surface temperature, not air temperature, and Landsat's thermal band is about 100 m
across before USGS resamples it to 30 m. It shows where surfaces get hot, not street-level
detail.
"""

import json
import urllib.error
import urllib.parse
import urllib.request

import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.transform import from_origin
from rasterio.vrt import WarpedVRT

from pc.site import Site

STAC = "https://planetarycomputer.microsoft.com/api/stac/v1/search"
TOKEN = "https://planetarycomputer.microsoft.com/api/sas/v1/token"
SCALE, OFFSET = 0.00341802, 149.0       # ST_B10 digital number -> kelvin (USGS C2 L2)
QA_SCALE = 0.01                          # ST_QA -> kelvin
MAX_UNCERTAINTY_K = 5.0             # humid coastal air puts clear-sky Mumbai at 3.4-4 K; cloud edges run 6-7 K
MAX_SCENE_CLOUD = 40                     # skip scenes cloudier than this (% of the whole scene)
MIN_CLEAR_SHARE = 0.5                    # and scenes where less than half the box is clear
MASK_BITS = 0b111111                     # QA_PIXEL bits 0-5: fill, dilated cloud, cirrus, cloud, shadow, snow
PIXEL_M = 30.0
BUFFER = 0.005                           # degrees around the box, as pc.fetch


def _json(url, body=None, tries=6):
    """GET or POST JSON; on 429 (Planetary Computer's rate limit) wait and try again."""
    import time
    for attempt in range(tries):
        req = urllib.request.Request(url, data=json.dumps(body).encode() if body else None,
                                     headers={"Content-Type": "application/json"} if body else {})
        try:
            return json.load(urllib.request.urlopen(req, timeout=120))
        except urllib.error.HTTPError as err:
            if err.code != 429 or attempt == tries - 1:
                raise
            time.sleep(10 * (attempt + 1))


def scenes(site: Site) -> list[dict]:
    w, s, e, n = site.bbox
    out = []
    m0, m1 = site.lst_months
    for year in range(site.lst_years[0], site.lst_years[1] + 1):
        last = [31, 28 + (year % 4 == 0), 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m1 - 1]
        body = {"collections": ["landsat-c2-l2"], "bbox": [w, s, e, n],
                "datetime": f"{year}-{m0:02d}-01T00:00:00Z/{year}-{m1:02d}-{last}T23:59:59Z",
                "query": {"platform": {"in": ["landsat-8", "landsat-9"]}, "eo:cloud_cover": {"lt": MAX_SCENE_CLOUD}},
                "limit": 100}
        out += _json(STAC, body)["features"]
    return sorted(out, key=lambda f: f["properties"]["datetime"])


_TOKENS = {}


def _signed(href: str) -> str:
    """The asset's URL with a read token: one token per storage account and container (from
    the token endpoint, no key), kept for the run, so the rate limit isn't hit per asset."""
    host = urllib.parse.urlparse(href)
    account, container = host.netloc.split(".")[0], host.path.lstrip("/").split("/")[0]
    key = (account, container)
    if key not in _TOKENS:
        _TOKENS[key] = _json(f"{TOKEN}/{account}/{container}")["token"]
    return f"{href}?{_TOKENS[key]}"


def fetch_lst(site: Site, log=print) -> dict:
    """Median hot-season LST over the box → raw/lst.tif, and the scenes used → raw/lst.json."""
    import geopandas as gpd
    from shapely.geometry import box

    w, s, e, n = site.bbox
    frame = gpd.GeoSeries([box(w - BUFFER, s - BUFFER, e + BUFFER, n + BUFFER)], crs=4326).to_crs(site.crs)
    x0, y0, x1, y1 = frame.total_bounds
    width, height = int(np.ceil((x1 - x0) / PIXEL_M)), int(np.ceil((y1 - y0) / PIXEL_M))
    transform = from_origin(x0, y1, PIXEL_M, PIXEL_M)
    stack, used = [], []
    for f in scenes(site):
        a = f["assets"]
        try:
            layers = {}
            for key in ("lwir11", "qa_pixel", "qa"):
                with rasterio.open(_signed(a[key]["href"])) as src, WarpedVRT(
                        src, crs=site.crs, transform=transform, width=width, height=height,
                        resampling=Resampling.nearest) as vrt:
                    layers[key] = vrt.read(1).astype(np.float64)
        except Exception as err:  # a scene that won't read is skipped, not fatal
            log(f"  LST: skipped {f['id']} ({type(err).__name__})")
            continue
        ok = ((layers["qa_pixel"].astype(np.int64) & MASK_BITS) == 0) & (layers["lwir11"] > 0) \
            & (layers["qa"] * QA_SCALE <= MAX_UNCERTAINTY_K) & (layers["qa"] >= 0)
        share = float(ok.mean())
        if share < MIN_CLEAR_SHARE:
            continue
        stack.append(np.where(ok, layers["lwir11"] * SCALE + OFFSET - 273.15, np.nan))
        used.append({"id": f["id"], "date": f["properties"]["datetime"][:10], "clear": round(share, 2)})
    if not stack:
        raise RuntimeError("no clear hot-season Landsat scenes for this box")
    data = np.stack(stack)
    with np.errstate(all="ignore"):
        import warnings
        warnings.simplefilter("ignore", RuntimeWarning)  # pixels never clear stay NaN
        median = np.nanmedian(data, axis=0).astype(np.float32)
    count = np.isfinite(data).sum(axis=0)
    site.raw.mkdir(parents=True, exist_ok=True)
    with rasterio.open(site.raw / "lst.tif", "w", driver="GTiff", width=width, height=height, count=1,
                       dtype="float32", crs=site.crs, transform=transform, nodata=np.nan, compress="deflate") as dst:
        dst.write(median, 1)
    meta = {"source": "Landsat 8/9 Collection 2 Level-2 ST_B10, Microsoft Planetary Computer",
            "months": list(site.lst_months), "years": list(site.lst_years), "scenes": used,
            "median_clear_scenes_per_pixel": int(np.median(count)),
            "note": "surface temperature, not air; thermal band about 100 m, resampled to 30 m"}
    (site.raw / "lst.json").write_text(json.dumps(meta, indent=1), encoding="utf-8")
    log(f"  LST: median of {len(used)} clear scenes ({used[0]['date']} to {used[-1]['date']}), "
        f"{np.nanmin(median):.1f} to {np.nanmax(median):.1f} °C")
    return meta


def add_lst(site: Site, grid):
    """Sample the median LST at each cell centre (no column without a fetched lst.tif)."""
    p = site.raw / "lst.tif"
    if not p.exists():
        return grid
    with rasterio.open(p) as src:
        pts = grid.centroid.to_crs(src.crs)
        v = np.array([x[0] for x in src.sample(zip(pts.x, pts.y))], dtype=float)
    grid["lst"] = np.round(v, 1)
    return grid


def meta(site: Site) -> dict | None:
    p = site.raw / "lst.json"
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else None
