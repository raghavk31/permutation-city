"""Download everything a site needs, for any bounding box on Earth. No logins.

    dem.tif        Copernicus GLO-30 surface model (30 m, metres above sea level)
    terrain.tif    FABDEM bare earth (30 m; free for non-commercial research)
    landcover.tif  ESA WorldCover 2021 (10 m)
    lst.tif        hot-season land surface temperature (Landsat 8/9, Planetary Computer; pc/lst.py)
    wind.json      regional wind, ERA5 via Open-Meteo, seasons and the hot-afternoon axis (pc/wind.py)
    heights.tif    building heights (Google Open Buildings 2.5D Temporal, 2023, 2 m; where covered)
    overture/      Overture Maps: buildings (Google Open Buildings + OSM + Microsoft),
                   roads and rail, land use, water, place names,
                   places (shops, schools, transit: where activities are today),
                   and streets to SYNTAX_BUFFER_M round the box (space syntax only)

Rasters are read straight from the cloud copies, so only the site's window is downloaded.
"""

import math
import shutil
import subprocess
import sys
import time

import rasterio
from rasterio.merge import merge

from pc.site import Site

BUFFER = 0.005  # degrees (~500 m) around the box, so edge cells have data
OVERTURE_THEMES = ["building", "segment", "land_use", "water", "division", "place"]
# Space syntax needs the street network well past the site, or segments near its edge look
# less integrated than they are (edge effect). Streets are fetched this far beyond the site's
# box (which already has its 250 m context margin), so the buffer is at least 1 km.
SYNTAX_BUFFER_M = 1000.0


def _tiles(bbox, step=1):
    """South-west corners of the step-degree tiles covering the box."""
    w, s, e, n = bbox
    for lat in range(math.floor(s / step) * step, math.ceil(n / step) * step, step):
        for lon in range(math.floor(w / step) * step, math.ceil(e / step) * step, step):
            yield lat, lon


def _ns(lat, width=2):
    return f"{'N' if lat >= 0 else 'S'}{abs(lat):0{width}d}"


def _ew(lon, width=3):
    return f"{'E' if lon >= 0 else 'W'}{abs(lon):0{width}d}"


def _clip(urls, bbox, out):
    """Mosaic remote tiles and keep only the box."""
    w, s, e, n = bbox
    srcs = [rasterio.open(u) for u in urls]
    data, transform = merge(srcs, bounds=(w - BUFFER, s - BUFFER, e + BUFFER, n + BUFFER))
    meta = srcs[0].meta | {"height": data.shape[1], "width": data.shape[2],
                           "transform": transform, "driver": "GTiff", "compress": "deflate"}
    for src in srcs:
        src.close()
    out.parent.mkdir(parents=True, exist_ok=True)
    with rasterio.open(out, "w", **meta) as dst:
        dst.write(data)


def fetch_dem(site: Site):
    base = "https://copernicus-dem-30m.s3.amazonaws.com"
    urls = []
    for lat, lon in _tiles(site.bbox):
        name = f"Copernicus_DSM_COG_10_{_ns(lat)}_00_{_ew(lon)}_00_DEM"
        urls.append(f"{base}/{name}/{name}.tif")
    _clip(urls, site.bbox, site.dem)


def fetch_landcover(site: Site):
    base = "https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map"
    urls = [f"{base}/ESA_WorldCover_10m_2021_v200_{_ns(lat)}{_ew(lon)}_Map.tif"
            for lat, lon in _tiles(site.bbox, step=3)]
    _clip(urls, site.bbox, site.landcover)


class TerrainUnavailable(RuntimeError):
    pass


def fetch_terrain(site: Site, tries: int = 4, fallback: bool = False) -> str:
    """FABDEM bare earth for the box. Its only host (data.bris.ac.uk) drops connections now
    and then, so it is tried a few times, waiting longer each time. If it still fails:
    with `fallback`, the Copernicus surface model stands in (heights then include buildings
    and trees, so building heights read as zero and built-up land looks higher than it is);
    without, it raises. Returns which source was used: "fabdem" or "copernicus-surface"."""
    import fabdem

    w, s, e, n = site.bbox
    site.raw.mkdir(parents=True, exist_ok=True)
    for attempt in range(tries):
        try:
            fabdem.download((w - BUFFER, s - BUFFER, e + BUFFER, n + BUFFER), str(site.terrain),
                            show_progress=False)
            return "fabdem"
        except Exception as err:  # connection dropped, server error
            last = err
            if attempt < tries - 1:
                wait = 15 * 2 ** attempt
                print(f"  FABDEM didn't answer ({type(err).__name__}); trying again in {wait} s", flush=True)
                time.sleep(wait)
    if not fallback:
        raise TerrainUnavailable(f"FABDEM (data.bris.ac.uk) didn't answer after {tries} tries: {last}")
    if not site.dem.exists():
        fetch_dem(site)
    shutil.copyfile(site.dem, site.terrain)
    print("  FABDEM unavailable: using the Copernicus surface model as the ground", flush=True)
    return "copernicus-surface"


def fetch_overture(site: Site, tries=5, release: str | None = None, on_theme=lambda k, theme: None):
    """Overture's catalogue server sometimes drops connections: retry with pauses, and
    from the third try skip the catalogue (--no-stac; slower but independent of it).
    Themes already downloaded are kept, so a re-run resumes. `release` pins the Overture
    release (default: the latest). `on_theme(k, theme)` reports progress."""
    cli = shutil.which("overturemaps") or str(sys.executable).replace("python", "overturemaps")
    bbox = ",".join(str(v) for v in site.bbox)
    for k, theme in enumerate(OVERTURE_THEMES):
        on_theme(k, theme)
        out = site.overture(theme)
        if out.exists():
            continue
        out.parent.mkdir(parents=True, exist_ok=True)
        for attempt in range(tries):
            # Without the catalogue the tool can't find the latest release either, so from the
            # third try the release is pinned from the bucket's own listing.
            rel = release or (latest_release() if attempt >= 2 else None)
            cmd = [cli, "download", f"--bbox={bbox}", "-f", "geoparquet", f"--type={theme}",
                   "-o", str(out)] + (["-r", rel] if rel else []) + (["--no-stac"] if attempt >= 2 else [])
            r = subprocess.run(cmd, capture_output=True, text=True)
            if r.returncode == 0:
                break
            # The CLI checks any release against the catalogue; the library reads the bucket
            # directly once it has one.
            if rel and _overture_direct(theme, site.bbox, rel, out):
                break
            time.sleep(5 * (attempt + 1))
        else:
            raise RuntimeError(f"Overture {theme} failed: {r.stderr[-300:]}")


def _overture_direct(theme: str, bbox: tuple, release: str, out) -> bool:
    """One theme straight from the release's files on S3 (no catalogue)."""
    try:
        from overturemaps import core
        core.geodataframe(theme, bbox=tuple(bbox), release=release, stac=False).set_crs(4326, allow_override=True).to_parquet(out)
        return True
    except Exception as err:
        print(f"  Overture {theme} from the bucket failed: {type(err).__name__}: {str(err)[:200]}", flush=True)
        return False


def latest_release() -> str | None:
    """The newest Overture release, from the public bucket's listing (no catalogue needed)."""
    import re
    import urllib.request
    try:
        xml = urllib.request.urlopen("https://overturemaps-us-west-2.s3.amazonaws.com/?list-type=2&prefix=release/&delimiter=/",
                                     timeout=60).read().decode()
    except Exception:
        return None
    found = sorted(re.findall(r"release/(\d{4}-\d{2}-\d{2}\.\d+)/", xml))
    return found[-1] if found else None


def syntax_bbox(site: Site) -> tuple:
    w, s, e, n = site.bbox
    dlat = SYNTAX_BUFFER_M / 111_320
    dlon = dlat / math.cos(math.radians((s + n) / 2))
    return (w - dlon, s - dlat, e + dlon, n + dlat)


def fetch_streets(site: Site, tries=5, release: str | None = None):
    """Overture road segments over the box plus SYNTAX_BUFFER_M, for space syntax
    (pc/syntax.py). Kept apart from the site's own `segment` theme, which covers the box."""
    out = site.raw / "overture" / "segment_syntax.parquet"
    if out.exists():
        return
    out.parent.mkdir(parents=True, exist_ok=True)
    cli = shutil.which("overturemaps") or str(sys.executable).replace("python", "overturemaps")
    bbox = ",".join(f"{v:.6f}" for v in syntax_bbox(site))
    for attempt in range(tries):
        cmd = [cli, "download", f"--bbox={bbox}", "-f", "geoparquet", "--type=segment", "-o", str(out)]             + (["-r", release] if release else []) + (["--no-stac"] if attempt >= 2 else [])
        r = subprocess.run(cmd, capture_output=True, text=True)
        if r.returncode == 0:
            return
        time.sleep(5 * (attempt + 1))
    raise RuntimeError(f"Overture streets for space syntax failed: {r.stderr[-300:]}")


def fetch_wind(site: Site):
    from pc.wind import fetch_wind as run
    run(site)


def fetch_lst(site: Site):
    from pc.lst import fetch_lst as run
    run(site)


# Google Open Buildings 2.5D Temporal (Sirko et al. 2023; CC BY 4.0 or ODbL 1.0): building
# height in metres above the ground, from Sentinel-2 at an effective 4 m, yearly 2016-2023,
# for Africa, South and South-East Asia, Latin America and the Caribbean. Public bucket.
OB_BUCKET = "open-buildings-temporal-data"
OB_YEAR = 2023
OB_RES = 2.0  # metres; the model resolves about 4 m


class HeightsUnavailable(RuntimeError):
    pass


def _ob_tiles(epsg: int) -> list:
    """(url, box) for every Open Buildings temporal tile in one UTM zone, OB_YEAR."""
    import json
    import urllib.parse
    import urllib.request

    from shapely.geometry import box

    api = f"https://storage.googleapis.com/storage/v1/b/{OB_BUCKET}/o"
    glob = f"v1/manifests/*_EPSG_{epsg}_{OB_YEAR}_06_30.json"
    q = urllib.parse.urlencode({"prefix": "v1/manifests/", "matchGlob": glob, "fields": "items(name)"})
    names = [it["name"] for it in json.load(urllib.request.urlopen(f"{api}?{q}", timeout=60)).get("items", [])]
    tiles = []
    for name in names:
        m = json.load(urllib.request.urlopen(f"https://storage.googleapis.com/{OB_BUCKET}/{name}", timeout=120))
        pre = m["uriPrefix"].replace("gs://", "https://storage.googleapis.com/")
        for ts in m["tilesets"]:
            for s in ts["sources"]:
                a, d = s["affineTransform"], s["dimensions"]
                x0, y1 = a["translateX"], a["translateY"]
                tiles.append((pre + s["uris"][0], box(x0, y1 + d["height"] * a["scaleY"], x0 + d["width"] * a["scaleX"], y1)))
    return tiles


def fetch_heights(site: Site):
    """Open Buildings building heights over the box, at OB_RES, in the site's UTM zone
    (raw/heights.tif, NaN where there is no reading). Raises HeightsUnavailable outside
    the dataset's coverage."""
    import geopandas as gpd
    import numpy as np
    from rasterio.transform import from_origin
    from rasterio.windows import from_bounds
    from shapely.geometry import box

    epsg = int(site.crs.split(":")[1])
    x0, y0, x1, y1 = gpd.GeoSeries([box(*site.bbox)], crs=4326).to_crs(site.crs).total_bounds
    x0, y0 = math.floor(x0 / OB_RES) * OB_RES, math.floor(y0 / OB_RES) * OB_RES
    x1, y1 = math.ceil(x1 / OB_RES) * OB_RES, math.ceil(y1 / OB_RES) * OB_RES
    want = box(x0, y0, x1, y1)
    tiles = [(u, b) for u, b in _ob_tiles(epsg) if b.intersects(want)]
    if not tiles:
        raise HeightsUnavailable(f"no Open Buildings {OB_YEAR} tiles cover this site")
    w, h = int(round((x1 - x0) / OB_RES)), int(round((y1 - y0) / OB_RES))
    out = np.full((h, w), np.nan, np.float32)
    for url, b in tiles:
        ib = b.intersection(want).bounds
        c0, r0 = int(round((ib[0] - x0) / OB_RES)), int(round((y1 - ib[3]) / OB_RES))
        ow, oh = int(round((ib[2] - ib[0]) / OB_RES)), int(round((ib[3] - ib[1]) / OB_RES))
        if ow <= 0 or oh <= 0:
            continue
        with rasterio.open("/vsicurl/" + url) as src:
            v = src.read(2, window=from_bounds(*ib, src.transform), out_shape=(oh, ow)).astype(np.float32)
        v[v < 0] = np.nan  # nodata is -99
        out[r0:r0 + oh, c0:c0 + ow] = v[: h - r0, : w - c0]
    site.heights.parent.mkdir(parents=True, exist_ok=True)
    meta = {"driver": "GTiff", "dtype": "float32", "count": 1, "width": w, "height": h, "crs": site.crs,
            "transform": from_origin(x0, y1, OB_RES, OB_RES), "nodata": float("nan"), "compress": "deflate", "predictor": 3}
    with rasterio.open(site.heights, "w", **meta) as dst:
        dst.write(out, 1)
        dst.update_tags(source=f"Google Open Buildings 2.5D Temporal v1, {OB_YEAR}", licence="CC BY 4.0")


def fetch_catchment(site: Site):
    """The terrain over the site's upstream catchment window, for flow lines (pc/hydro.py)."""
    from pc import hydro
    print(f"  catchment terrain: {hydro.fetch(site)}", flush=True)


def fetch_seasonal(site: Site):
    """End-of-monsoon water frequency from Sentinel-2 (pc/seasonal.py)."""
    from pc import seasonal
    seasonal.fetch_seasonal(site)


STEPS = {"dem": fetch_dem, "terrain": fetch_terrain, "catchment": fetch_catchment, "landcover": fetch_landcover,
         "overture": fetch_overture, "streets": fetch_streets, "lst": fetch_lst, "seasonal": fetch_seasonal, "heights": fetch_heights,
         "wind": fetch_wind}


def fetch(site: Site, only=None):
    for name, step in STEPS.items():
        if only and name not in only:
            continue
        print(f"  fetching {name} ...", flush=True)
        step(site)
