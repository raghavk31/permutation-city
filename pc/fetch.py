"""Download everything a site needs, for any bounding box on Earth. No logins.

    dem.tif        Copernicus GLO-30 surface model (30 m, metres above sea level)
    terrain.tif    FABDEM bare earth (30 m; free for non-commercial research)
    landcover.tif  ESA WorldCover 2021 (10 m)
    overture/      Overture Maps: buildings (Google Open Buildings + OSM + Microsoft),
                   roads and rail, land use, water, place names

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
OVERTURE_THEMES = ["building", "segment", "land_use", "water", "division"]


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


def fetch_terrain(site: Site):
    import fabdem

    w, s, e, n = site.bbox
    site.raw.mkdir(parents=True, exist_ok=True)
    fabdem.download((w - BUFFER, s - BUFFER, e + BUFFER, n + BUFFER), str(site.terrain),
                    show_progress=False)


def fetch_overture(site: Site, tries=5):
    """Overture's catalogue server sometimes drops connections: retry with pauses, and
    from the third try skip the catalogue (--no-stac; slower but independent of it).
    Themes already downloaded are kept, so a re-run resumes."""
    cli = shutil.which("overturemaps") or str(sys.executable).replace("python", "overturemaps")
    bbox = ",".join(str(v) for v in site.bbox)
    for theme in OVERTURE_THEMES:
        out = site.overture(theme)
        if out.exists():
            continue
        out.parent.mkdir(parents=True, exist_ok=True)
        for attempt in range(tries):
            cmd = [cli, "download", f"--bbox={bbox}", "-f", "geoparquet", f"--type={theme}",
                   "-o", str(out)] + (["--no-stac"] if attempt >= 2 else [])
            r = subprocess.run(cmd, capture_output=True, text=True)
            if r.returncode == 0:
                break
            time.sleep(5 * (attempt + 1))
        else:
            raise RuntimeError(f"Overture {theme} failed: {r.stderr[-300:]}")


STEPS = {"dem": fetch_dem, "terrain": fetch_terrain, "landcover": fetch_landcover,
         "overture": fetch_overture}


def fetch(site: Site, only=None):
    for name, step in STEPS.items():
        if only and name not in only:
            continue
        print(f"  fetching {name} ...", flush=True)
        step(site)
