"""Export a built site for the browser (the static page on raghavkohli.xyz).

    uv run pc export <site> [--fixture]      → web/dist/<site>.json (+ web/test/fixture-<site>.json)

One JSON file per site, in local metres around an origin (lon, lat), with:
    meta      name, brief, storm, sea levels, hex size, cell area, credits
    grid      every cell (after cropping): position, water, rule state, and the McHarg
              layers the page draws (ground, flood, pool, green, built, industrial)
    design    the design ground the engine grows on: positions, neighbours, what each cell
              allows, height caps, permeable minimums, trees, the site's own water score
    context   major roads and rail (polylines), place names

The browser engine (web/engine.js) reads `design` exactly as pc.genome.Ground holds it;
`ground_from_export` rebuilds that Ground in Python so both engines can be compared on
identical inputs (web/test/parity.mjs).
"""

import json

import geopandas as gpd
import numpy as np

from pc import fitness, genome
from pc.site import ROOT, Site

WEB = ROOT / "web"
STATE_CODE = {"forbidden": 0, "retained": 1, "constrained": 2, "open": 3}
CREDITS = [
    "Copernicus DEM GLO-30 © DLR e.V. 2010–2014 and © Airbus Defence and Space GmbH 2014–2018, "
    "provided under COPERNICUS by the European Union and ESA",
    "FABDEM, Hawker et al. 2022, University of Bristol (CC BY-NC-SA 4.0)",
    "ESA WorldCover 2021 (CC BY 4.0)",
    "Overture Maps Foundation: OpenStreetMap contributors (ODbL), Google Open Buildings (CC BY 4.0), "
    "Microsoft building footprints (ODbL)",
]


def _r(a, nd):
    return [round(float(v), nd) for v in np.asarray(a)]


def _lines(gdf, ox, oy, tol=3.0):
    out = []
    for geom in gdf.geometry.simplify(tol):
        parts = getattr(geom, "geoms", [geom])
        for p in parts:
            xy = np.asarray(p.coords)
            out.append([[round(x - ox, 1), round(y - oy, 1)] for x, y in xy])
    return out


def export(site: Site) -> dict:
    from pc.maps import context

    suit = gpd.read_file(site.layers / "suitability.gpkg", layer="cells")
    ground = genome.prepare(suit)

    # Local origin: the centre of the design ground.
    xmin, ymin, xmax, ymax = ground.bounds
    ox, oy = (xmin + xmax) / 2, (ymin + ymax) / 2
    lon, lat = gpd.GeoSeries(gpd.points_from_xy([ox], [oy]), crs=site.crs).to_crs(4326).iloc[0].coords[0]

    c = suit.centroid
    floods = suit.filter(like="flood_")
    flood = floods.max(axis=1) if floods.shape[1] else np.zeros(len(suit))
    grid = {
        "x": _r(c.x - ox, 2), "y": _r(c.y - oy, 2),
        "water": [int(v) for v in suit["water"]],
        "state": [STATE_CODE[s] for s in suit["state"]],
        "ground": _r(suit["ground"], 1),
        "flood": _r(flood, 2),
        "pool": _r(suit["pool"], 2),
        "green": _r(suit["trees"] + suit["green"] + suit["mangrove"], 2),
        "built": _r(suit["built"], 2),
        "industrial": [int(v) for v in suit["industrial"]],
        "reasons": list(suit["reasons"].fillna("")),
    }

    # Design ground, in the engine's order. Positions: local metres.
    gc = ground.cells.centroid
    design = {
        "x": _r(gc.x - ox, 2), "y": _r(gc.y - oy, 2),
        "nbr": [int(v) for v in ground.nbr.ravel()],
        "can": [int(b) | int(g) << 1 | int(w) << 2
                for b, g, w in zip(ground.can_build, ground.can_green, ground.can_water)],
        "cap": [int(v) for v in ground.cap],
        "min_perm": _r(ground.min_perm, 3),
        "trees": _r(ground.trees, 3),
        "site_water": _r(ground.site_water, 6),
    }

    ctx = context(site)
    places = ctx["places"]
    out = {
        "meta": {
            "id": site.id, "name": site.name, "origin": [round(lon, 6), round(lat, 6)],
            "hex_radius": site.hex_radius, "cell_area": round(float(ground.area[0]), 3),
            "design_storm_mm": site.design_storm_mm, "target_far": site.target_far,
            "target_floor_area_ha": site.target_floor_area_ha,
            "target_ha": round(fitness.floor_area_target(site, ground) / 1e4, 1),
            "design_ha": round(float(ground.area.sum()) / 1e4, 1),
            "sea_levels": site.sea_levels, "states": list(STATE_CODE),
            "credits": CREDITS,
        },
        "grid": grid,
        "design": design,
        "context": {
            "roads": _lines(ctx["roads"], ox, oy),
            "rail": _lines(ctx["rail"], ox, oy),
            "boundary": _lines(ctx["boundary"].boundary, ox, oy, 1.0) if len(ctx["boundary"]) else [],
            "places": [{"name": p["label"], "x": round(p.geometry.x - ox, 1), "y": round(p.geometry.y - oy, 1)}
                       for _, p in places.iterrows()],
        },
    }
    return out


def ground_from_export(data: dict) -> genome.Ground:
    """The engine's Ground, rebuilt from an export (identical inputs for both engines)."""
    d = data["design"]
    n = len(d["x"])
    can = np.array(d["can"])
    area = np.full(n, data["meta"]["cell_area"])
    xy = np.column_stack([d["x"], d["y"]])
    return genome.Ground(
        cells=None, xy=xy, area=area, nbr=np.array(d["nbr"]).reshape(n, 6),
        can_build=(can & 1) > 0, can_green=(can & 2) > 0, can_water=(can & 4) > 0,
        cap=np.array(d["cap"]), min_perm=np.array(d["min_perm"]), trees=np.array(d["trees"]),
        site_water=np.array(d["site_water"]),
        bounds=(xy[:, 0].min(), xy[:, 1].min(), xy[:, 0].max(), xy[:, 1].max()),
    )


class _Brief:
    """Just what fitness.evaluate reads from a site."""
    def __init__(self, meta):
        self.design_storm_mm = meta["design_storm_mm"]
        self.target_far = meta["target_far"]
        self.target_floor_area_ha = meta["target_floor_area_ha"]
        self.hex_radius = meta["hex_radius"]


def fixture(data: dict, n=40, seed=7) -> dict:
    """Random genomes with their designs and scores, grown by the Python engine."""
    ground = ground_from_export(data)
    brief = _Brief(data["meta"])
    rng = np.random.default_rng(seed)
    cases = []
    for _ in range(n):
        g = genome.random_genome(rng)
        d = genome.grow(g, ground)
        s = fitness.evaluate(d, ground, brief)
        cases.append({"genome": [float(v) for v in g], "use": genome.use_codes(d).tolist(),
                      "levels": d.levels.tolist(), "scores": s})
    ranks = fitness.pareto_ranks([c["scores"] for c in cases])
    for c, r in zip(cases, ranks):
        c["rank"] = int(r)
    return {"site": data["meta"]["id"], "cases": cases}


def write(site: Site, with_fixture=False):
    data = export(site)
    (WEB / "dist").mkdir(parents=True, exist_ok=True)
    out = WEB / "dist" / f"{site.id}.json"
    out.write_text(json.dumps(data, separators=(",", ":")), encoding="utf-8")
    print(f"  {out.relative_to(ROOT)}  {out.stat().st_size / 1e3:.0f} KB  "
          f"({len(data['grid']['x']):,} cells, {len(data['design']['x']):,} design cells)")
    if with_fixture:
        (WEB / "test").mkdir(parents=True, exist_ok=True)
        fx = WEB / "test" / f"fixture-{site.id}.json"
        fx.write_text(json.dumps(fixture(data)), encoding="utf-8")
        print(f"  {fx.relative_to(ROOT)}")
    index = WEB / "dist" / "sites.json"
    sites = json.loads(index.read_text(encoding="utf-8")) if index.exists() else {}
    sites[site.id] = {"name": site.name, "design_ha": data["meta"]["design_ha"],
                      "target_ha": data["meta"]["target_ha"]}
    index.write_text(json.dumps(sites, indent=1), encoding="utf-8")
