"""One job: a polygon in, a site export (the JSON `pc export` writes) out.

The steps are the CLI's own (`pc new`, `pc fetch`, `pc build`, `pc rules`, `pc export`),
run on a throwaway site folder. Only the export is kept, in the cache, under a key made of
everything that changes it (see `cache_key`).
"""

import hashlib
import json
import re
import shutil
import time
from dataclasses import dataclass, field
from pathlib import Path

import geopandas as gpd
import yaml
from shapely.geometry import mapping, shape
from shapely.geometry.base import BaseGeometry

from pc import export, fetch, layers, rules
from pc import grid as cellgrid
from pc.site import DATA, ROOT, SITES, load, utm_crs

LAYERS_VERSION = 4   # bump when pc/layers.py changes what it computes (3: landform, LST; 4: flow lines over the catchment)
MAX_KM2 = 16.0       # design polygon, before the context margin (MAX_CELLS still binds: about 37 m cells at 16 km²)
MAX_CELLS = 4500     # the browser engine's budget (about 5 s for a full run)
GRID_TYPES = set(cellgrid.GRID_TYPES)


class Rejected(ValueError):
    """A request the service won't run, with a message a person can act on."""


@dataclass
class Request:
    boundary: BaseGeometry          # degrees
    grid_type: str = "hex"
    cell_size: float = 20.0         # metres: hex centre to corner, quad side
    context_m: float = 250.0
    sea_levels: dict = field(default_factory=dict)
    rules: dict | None = None       # structured rules; None: the template
    name: str = "New site"


def polygon_from_geojson(g: dict) -> BaseGeometry:
    if g.get("type") == "FeatureCollection":
        feats = g.get("features") or []
        if len(feats) != 1:
            raise Rejected("send one polygon")
        g = feats[0]
    if g.get("type") == "Feature":
        g = g.get("geometry") or {}
    if g.get("type") not in ("Polygon", "MultiPolygon"):
        raise Rejected("the site must be a polygon")
    try:
        poly = shape(g)
    except Exception as e:  # malformed coordinates
        raise Rejected(f"can't read the polygon: {e}") from None
    if poly.is_empty or not poly.is_valid:
        raise Rejected("the polygon is empty or crosses itself")
    w, s, e, n = poly.bounds
    if not (-180 <= w <= e <= 180 and -85 <= s <= n <= 85):
        raise Rejected("coordinates must be longitude, latitude in degrees")
    return poly


def area_km2(poly: BaseGeometry) -> float:
    return float(gpd.GeoSeries([poly], crs=4326).to_crs(utm_crs(poly.bounds)).area.iloc[0]) / 1e6


def estimated_cells(km2: float, cell_size: float, grid_type: str = "hex") -> int:
    return int(km2 * 1e6 / cellgrid.make(grid_type, cell_size).cell_area)


def check(req: Request) -> dict:
    """Refuse what the service can't or won't run; otherwise the size of the job."""
    if req.grid_type not in GRID_TYPES:
        raise Rejected(f"grid type {req.grid_type!r} isn't available; use {' or '.join(sorted(GRID_TYPES))}")
    if not 10 <= req.cell_size <= 50:
        raise Rejected("cell size must be between 10 and 50 m")
    if not 100 <= req.context_m <= 500:
        raise Rejected("context margin must be between 100 and 500 m")
    if len(req.sea_levels) > 4 or any(not -2 <= float(v) <= 10 for v in req.sea_levels.values()):
        raise Rejected("give up to 4 sea levels, each between -2 and 10 m")
    if any(not str(k).replace("_", "").isalnum() for k in req.sea_levels):
        raise Rejected("sea level names may use letters, digits and _ only")
    if req.rules is not None:
        _check_rules(req.rules)
    km2 = area_km2(req.boundary)
    cells = estimated_cells(km2, req.cell_size, req.grid_type)
    if km2 > MAX_KM2:
        raise Rejected(f"the site is {km2:.1f} km²; the limit is {MAX_KM2:g} km². Draw a smaller polygon.")
    if cells > MAX_CELLS:
        raise Rejected(f"about {cells:,} cells at {req.cell_size:g} m; the limit is {MAX_CELLS:,}. "
                       f"Use bigger cells or a smaller polygon.")
    return {"km2": round(km2, 3), "cells": cells}


def _check_rules(r: dict):
    """Structured rules only: every `when` must already be a structure, never a string."""
    if not isinstance(r, dict) or "defaults" not in r:
        raise Rejected("rules need defaults")
    for kind in rules.KINDS:
        for rule in r.get(kind) or []:
            if isinstance(rule.get("when"), str):
                raise Rejected(f"rule {rule.get('name')!r}: send `when` in the structured form")
    try:
        rules.compile_rules(r)
    except (ValueError, KeyError, TypeError) as e:
        raise Rejected(f"bad rules: {e}") from None


def cache_key(req: Request, overture_release: str | None) -> str:
    """Everything that changes the export: the polygon, the grid, the layer settings, the
    rules, the Overture release, and the versions of the layer and export code. Without a
    known release (the catalogue was down), the month stands in for it, so an unpinned
    result is reused for at most a month."""
    if overture_release is None:
        overture_release = "unpinned-" + time.strftime("%Y-%m")
    poly = json.loads(json.dumps(mapping(req.boundary)), parse_float=lambda v: round(float(v), 6))
    parts = {
        "polygon": poly, "grid": [req.grid_type, req.cell_size], "context_m": req.context_m,
        "sea_levels": dict(sorted(req.sea_levels.items())), "rules": req.rules or "template",
        "overture": overture_release, "layers": LAYERS_VERSION, "export": export.FORMAT,
    }
    return hashlib.sha256(json.dumps(parts, sort_keys=True).encode()).hexdigest()[:24]


STEPS = ["setting up", "elevation", "bare earth", "land cover", "Overture map data", "layers",
         "rules and export"]


THEMES = {"building": "buildings", "segment": "roads and rail", "land_use": "land use",
          "water": "water", "division": "place names", "place": "places"}
KEY_RE = re.compile(r"^[0-9a-f]{24}$")


def request_from_json(body) -> Request:
    """A request as the app sends it ({boundary, grid: {type, size}, name, context_m,
    sea_levels, rules}), checked for shape. `check` then checks the values."""
    if not isinstance(body, dict):
        raise Rejected("send a JSON object")
    grid = body.get("grid") or {}
    try:
        return Request(
            boundary=polygon_from_geojson(body.get("boundary") or {}),
            grid_type=str(grid.get("type", "hex")), cell_size=float(grid.get("size", 20)),
            context_m=float(body.get("context_m", 250)),
            sea_levels={str(k): float(v) for k, v in (body.get("sea_levels") or {}).items()},
            rules=body.get("rules"), name=(str(body.get("name") or "").strip() or "New site")[:80])
    except (TypeError, ValueError, AttributeError) as e:
        raise Rejected(f"can't read the request: {e}") from None


# --- the stages of a build (run below, and one per workflow step in service/actions.py) --

def site_id_for(key: str) -> str:
    return f"svc-{key}"


def write_site(req: Request, key: str):
    """Stage 0: the throwaway site folder (site.yaml, boundary, rules)."""
    folder = SITES / site_id_for(key)
    folder.mkdir(parents=True, exist_ok=True)
    (folder / "boundary.geojson").write_text(json.dumps(
        {"type": "FeatureCollection", "features": [{"type": "Feature", "properties": {},
                                                    "geometry": mapping(req.boundary)}]}), encoding="utf-8")
    cfg = {"name": req.name, "boundary": "boundary.geojson", "context_m": req.context_m,
           "grid": {"type": req.grid_type, "size": req.cell_size}, "sea_levels": req.sea_levels or None}
    (folder / "site.yaml").write_text(yaml.safe_dump(cfg, sort_keys=False), encoding="utf-8")
    r = req.rules or yaml.safe_load((ROOT / "rules.template.yaml").read_text(encoding="utf-8"))
    (folder / "rules.yaml").write_text(yaml.safe_dump(r, sort_keys=False), encoding="utf-8")
    return load(site_id_for(key))


# Stages 1 to 3. A web build falls back to the surface model if FABDEM is down, and says so
# (export_site records it; the layer cake shows it).
FETCHES = [fetch.fetch_dem, lambda site: fetch.fetch_terrain(site, fallback=True), fetch.fetch_landcover]


def fetch_catchment(site) -> list:
    """Stage 2, after the site's terrain: the terrain over its upstream catchment, for flow lines
    (pc/hydro.py). Optional: without it the site's valleys come from its own cells, as before."""
    try:
        fetch.fetch_catchment(site)
        return []
    except Exception as err:  # noqa: BLE001 - only the wider flow lines are lost
        return [f"The terrain beyond the site couldn't be downloaded ({type(err).__name__}): flow lines are traced "
                "on the site's own cells, so water from upstream is missing and flat land shows none."]
FALLBACK_NOTES = {
    "copernicus-surface": "Bare-earth heights (FABDEM) couldn't be downloaded, so ground heights come from the "
                          "Copernicus surface model and include buildings and trees: flooding and rain pooling in "
                          "built-up areas are underestimated, and building heights read as zero. It is unsuitable "
                          "for urban hydrology, so the landform is treated as flat (low confidence): rebuild this "
                          "site once FABDEM is back.",
}


def fetch_overture(site, release: str | None, progress=lambda step, detail=None: None):
    """Stage 4."""
    fetch.fetch_overture(site, release=release, on_theme=lambda k, t: progress(
        4, f"{THEMES.get(t, t)} ({k + 1} of {len(fetch.OVERTURE_THEMES)})"))


def fetch_lst(site) -> list:
    """Stage 4, after Overture: hot-season surface temperature. Optional: if Planetary Computer
    can't be reached or no scene is clear, the site builds without it and says so."""
    try:
        fetch.fetch_lst(site)
        return []
    except Exception as err:  # noqa: BLE001 - any failure here only loses one layer
        return [f"No land surface temperature for this site ({type(err).__name__}): the surface heat "
                "layer and the 'cooling where it's hot' metric are missing."]


def fetch_seasonal(site) -> list:
    """Stage 4, after LST: end-of-monsoon water frequency (pc/seasonal.py). Optional: without
    it the site builds with no seasonal ponds layer, and says so."""
    try:
        fetch.fetch_seasonal(site)
        return []
    except Exception as err:  # noqa: BLE001 - any failure here only loses one layer
        return [f"No seasonal water for this site ({type(err).__name__}): ponds and tanks that fill in the "
                "monsoon and dry out after are not mapped unless OSM or WorldCover has them."]


def build_layers(site):
    """Stage 5."""
    grid = layers.build(site)
    site.layers.mkdir(parents=True, exist_ok=True)
    grid.to_file(site.layers / "grid.gpkg", layer="cells", driver="GPKG")


def export_site(site, key: str, release: str | None, out: Path, terrain: str = "fabdem", notes=()) -> Path:
    """Stage 6: the export, written atomically to `out`. `terrain`: what stage 2 used."""
    data_out = export.export(site)
    data_out["meta"]["id"] = key
    data_out["meta"]["service"] = {"overture": release, "layers": LAYERS_VERSION, "terrain": terrain,
                                   "warnings": ([FALLBACK_NOTES[terrain]] if terrain in FALLBACK_NOTES else []) + list(notes)}
    out.parent.mkdir(parents=True, exist_ok=True)
    tmp = out.with_suffix(".tmp")
    tmp.write_text(json.dumps(data_out, separators=(",", ":")), encoding="utf-8")
    tmp.replace(out)
    return out


def clean(key: str):
    shutil.rmtree(SITES / site_id_for(key), ignore_errors=True)
    shutil.rmtree(DATA / site_id_for(key), ignore_errors=True)


def run(req: Request, key: str, overture_release: str | None, cache: Path, progress=lambda step, detail=None: None) -> Path:
    """Build the site and write <cache>/<key>.json. The work folders are removed after."""
    try:
        progress(0)
        site = write_site(req, key)
        used = [None, None, None]
        for k, step in enumerate(FETCHES):
            progress(1 + k)
            used[k] = step(site)
        notes = fetch_catchment(site)
        progress(4)
        fetch_overture(site, overture_release, progress)
        notes += fetch_lst(site)
        notes += fetch_seasonal(site)
        progress(5)
        build_layers(site)
        progress(6)
        return export_site(site, key, overture_release, cache / f"{key}.json", used[1] or "fabdem", notes)
    finally:
        clean(key)
