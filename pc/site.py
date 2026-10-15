"""A site: one folder in sites/<id>/ with site.yaml and rules.yaml.

site.yaml
    name:        display name
    boundary:    optional GeoJSON polygon (in the site folder): the site's exact edge.
                 The analysis runs on the polygon plus a context margin, so water, flooding
                 and drainage behave at the edge, then everything is cropped to the polygon.
    context_m:   context margin around the boundary, metres (default 250)
    bbox:        [west, south, east, north] in degrees. Needed without a boundary; with one,
                 it is worked out from the polygon and the margin.
    hex_radius:  hex size in metres, centre to corner (default 20)
    sea_levels:  optional, coastal sites only: {name: metres above mean sea level}
    design_area: optional GeoJSON (in the site folder) of the ground to design;
                 everything outside it can be retained as context by the rules
    design_storm_mm:       rain in the design storm (default 100)
    target_far:            floor-area target as FAR over the design ground (default 1.5)
    target_floor_area_ha:  or an absolute floor-area target (wins if set)
"""

from dataclasses import dataclass, field
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
SITES = ROOT / "sites"
DATA = ROOT / "data"


def utm_crs(bbox) -> str:
    """The UTM zone (metres) for the centre of a bounding box."""
    lon = (bbox[0] + bbox[2]) / 2
    lat = (bbox[1] + bbox[3]) / 2
    zone = int((lon + 180) // 6) + 1
    return f"EPSG:{32600 + zone if lat >= 0 else 32700 + zone}"


def read_polygon(path: Path):
    """A GeoJSON file as one polygon (in degrees)."""
    import geopandas as gpd

    return gpd.read_file(path).to_crs(4326).union_all()


def bbox_around(polygon, margin_m: float) -> tuple:
    """Bounding box (degrees) of a polygon plus a margin in metres."""
    import geopandas as gpd

    crs = utm_crs(polygon.bounds)
    grown = gpd.GeoSeries([polygon], crs=4326).to_crs(crs).buffer(margin_m).to_crs(4326)
    return tuple(round(float(v), 5) for v in grown.total_bounds)


@dataclass
class Site:
    id: str
    name: str
    bbox: tuple
    hex_radius: float = 20.0
    sea_levels: dict = field(default_factory=dict)
    boundary: Path | None = None
    context_m: float = 250.0
    design_area: Path | None = None
    design_storm_mm: float = 100.0         # rain in the design storm (fitness: storage)
    target_far: float = 1.5                # floor-area target as FAR over design ground ...
    target_floor_area_ha: float | None = None  # ... or as an absolute area (wins if set)

    @property
    def crs(self) -> str:
        return utm_crs(self.bbox)

    @property
    def folder(self) -> Path:
        return SITES / self.id

    @property
    def rules(self) -> Path:
        return self.folder / "rules.yaml"

    @property
    def maps(self) -> Path:
        return self.folder / "maps"

    @property
    def raw(self) -> Path:
        return DATA / self.id / "raw"

    @property
    def layers(self) -> Path:
        return DATA / self.id / "layers"

    # Downloaded inputs (see pc/fetch.py)
    @property
    def dem(self) -> Path:        # Copernicus GLO-30 surface model (includes buildings)
        return self.raw / "dem.tif"

    @property
    def terrain(self) -> Path:    # FABDEM bare earth (buildings and trees removed)
        return self.raw / "terrain.tif"

    @property
    def landcover(self) -> Path:  # ESA WorldCover 2021, 10 m
        return self.raw / "landcover.tif"

    def overture(self, theme: str) -> Path:
        return self.raw / "overture" / f"{theme}.parquet"


def load(site_id: str) -> Site:
    folder = SITES / site_id
    cfg = yaml.safe_load((folder / "site.yaml").read_text(encoding="utf-8"))
    boundary = folder / cfg["boundary"] if cfg.get("boundary") else None
    context = float(cfg.get("context_m", 250))
    bbox = cfg.get("bbox")
    if bbox is None:
        if boundary is None:
            raise ValueError(f"sites/{site_id}/site.yaml needs a bbox or a boundary")
        bbox = bbox_around(read_polygon(boundary), context)
    area = cfg.get("design_area")
    return Site(
        id=site_id,
        name=cfg["name"],
        bbox=tuple(bbox),
        hex_radius=float(cfg.get("hex_radius", 20)),
        sea_levels=cfg.get("sea_levels") or {},
        boundary=boundary,
        context_m=context,
        design_area=(folder / area) if area else None,
        design_storm_mm=float(cfg.get("design_storm_mm", 100)),
        target_far=float(cfg.get("target_far", 1.5)),
        target_floor_area_ha=cfg.get("target_floor_area_ha"),
    )


def set_value(site_id: str, key: str, value) -> None:
    """Set one top-level key in site.yaml, keeping the file's comments."""
    path = SITES / site_id / "site.yaml"
    lines = path.read_text(encoding="utf-8").splitlines()
    new = f"{key}: {value}"
    for k, line in enumerate(lines):
        if line.split(":")[0].strip() == key and not line.startswith((" ", "#")):
            end = k + 1  # the key's nested block (indented lines) goes too
            while end < len(lines) and lines[end].startswith((" ", "\t")):
                end += 1
            lines[k:end] = [new]
            break
    else:
        lines.append(new)
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
