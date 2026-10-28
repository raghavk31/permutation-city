"""Export a built site for the browser (the web app in app/).

    uv run pc export <site> [--fixture]   → app/public/sites/<site>.json
                                            (+ test/parity/fixtures/<site>.json)

One JSON file per site, in local metres around an origin (lon, lat), with:
    meta      format (3), name, brief, storm, sea levels, the grid (type, size, spacing,
              degree, edge; from format 3), cell area, credits. Hex sites also keep
              `hex_radius`, which is all format 1 and 2 had.
    grid      every cell (after cropping): position, water, rule state, the McHarg layers
              the page draws (ground, flood, pool, green, built, industrial), and from
              format 2: neighbours (n × degree), rule memberships, and every layer column
              as built
    rules     the site's rules, structured (pc.rules.compile_rules), with the defaults
    design    the design ground the engine grows on: positions, neighbours, what each cell
              allows, height caps, permeable minimums, trees, the site's own water score
    context   major roads and rail (polylines), place names
    syntax    existing streets to 1 km round the site, as segments (space syntax; pc/syntax.py)

The browser engine (app/engine/) reads `design` exactly as pc.genome.Ground holds it;
`ground_from_export` rebuilds that Ground in Python so both engines can be compared on
identical inputs (test/parity/parity.test.ts). With the layers and rules, the browser can
also re-run edited rules and rebuild `design` itself (app/engine/rules.ts, ground.ts);
the fixture checks that against Python on the site's rules and on an edited set.
"""

import copy
import json

import geopandas as gpd
import numpy as np

from pc import elites, evolve, fitness, genome, landform, lst, metrics, rules, skeleton, syntax, wind
from pc import grid as cellgrid
from pc.rng import Rng
from pc.site import ROOT, Site, utc_offset_of

SITES_OUT = ROOT / "app" / "public" / "sites"
FIXTURES = ROOT / "test" / "parity" / "fixtures"
FORMAT = 4  # 4: landform columns on the design ground, the street skeleton, LST
STATE_CODE = {"forbidden": 0, "retained": 1, "constrained": 2, "open": 3}
NOT_LAYERS = {"geometry", "cell", "row", "col"}
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


def _design(ground: genome.Ground, ox: float, oy: float) -> dict:
    """The design ground as exported: engine order, local metres, rounded."""
    gc = ground.cells.centroid
    return {
        "x": _r(gc.x - ox, 2), "y": _r(gc.y - oy, 2),
        "nbr": [int(v) for v in ground.nbr.ravel()],
        "can": [int(b) | int(g) << 1 | int(w) << 2
                for b, g, w in zip(ground.can_build, ground.can_green, ground.can_water)],
        "cap": [int(v) for v in ground.cap],
        "min_perm": _r(ground.min_perm, 3),
        "trees": _r(ground.trees, 3),
        "site_water": _r(ground.site_water, 6),
        **_landform_columns(ground.cells),
    }


def _landform_columns(cells) -> dict:
    """Per design cell: ground height, valley order, valley channel or buffer, the cell it
    drains to (design index, -1 if it drains off the design ground or is an outlet), hot-season
    LST (null where none) and ridge strength. Empty for layers built before format 4."""
    if cells is None or "valley_order" not in cells:
        return {}
    pos = {(int(r), int(c)): k for k, (r, c) in enumerate(zip(cells["row"], cells["col"]))}
    out = {
        "z": _r(cells["ground"], 1),
        "valley": [int(v) for v in cells["valley_order"]],
        "vbuf": [int(bool(b) or o >= 1) for b, o in zip(cells["valley_buffer"], cells["valley_order"])],
        "down": [pos.get((int(r), int(c)), -1) for r, c in zip(cells["flow_to_row"], cells["flow_to_col"])],
        "ridge": _r(cells["ridge"], 2),
    }
    if "lst" in cells:
        out["lst"] = [None if v != v else round(float(v), 1) for v in cells["lst"]]
    return out


def engine_ground(suit: gpd.GeoDataFrame, graph: cellgrid.CellGraph, origin=None) -> tuple[genome.Ground, dict]:
    """The Ground every engine grows on: the design ground exactly as exported (local
    metres, rounded, one cell area), so `pc grow` / `pc evolve` and the browser give the
    same run for the same seed. Keeps the cells (for drawing) and the origin (to put
    attractors back in map coordinates). The origin is the centre of the design ground,
    unless given (edited rules keep the export's origin, as the browser does)."""
    g = genome.prepare(suit, graph)
    xmin, ymin, xmax, ymax = g.bounds
    ox, oy = origin if origin is not None else ((xmin + xmax) / 2, (ymin + ymax) / 2)
    design = _design(g, ox, oy)
    ground = ground_from_export({"design": design, "meta": {"cell_area": round(float(g.area[0]), 3),
                                                            "grid": graph.describe()}})
    ground.cells = g.cells
    ground.cells, ground.origin = g.cells, (ox, oy)
    return ground, design


def _value(v):
    v = v.item() if hasattr(v, "item") else v
    if isinstance(v, bool):
        return int(v)
    if isinstance(v, float) and np.isnan(v):
        return None  # JSON has no NaN; the browser reads null as "no value"
    return v


def layer_table(grid: gpd.GeoDataFrame) -> dict:
    """Every layer column as built (already rounded by pc.layers), yes/no as 1/0."""
    return {c: [_value(v) for v in grid[c].to_numpy()] for c in grid.columns if c not in NOT_LAYERS}


def rule_table(r: dict) -> dict:
    """The rules as the browser runs them."""
    return {"defaults": r["defaults"], "list": rules.compile_rules(r)}


def site_ground(site: Site, suit: gpd.GeoDataFrame, origin=None) -> tuple[genome.Ground, dict]:
    """engine_ground on the site's own grid, with the site's major roads (for the metrics)
    exported as the browser gets them."""
    from pc.maps import context

    ground, design = engine_ground(suit, cellgrid.for_site(site), origin)
    ground.roads = _lines(context(site)["roads"], *ground.origin)
    ground.activities = _activities(site, *ground.origin)
    ground.skeleton = skeleton.build(site, ground, ground.cells, suit) if "valley_order" in suit else None
    ground.syntax_streets = (syntax.buffer_streets(site, ground.origin) or {}).get("segments")
    summary = landform.load(site)
    ground.relief_class = summary["relief"]["class"] if summary else None
    return ground, design


def _activities(site: Site, ox: float, oy: float) -> dict:
    """Shops, schools and transit points in local metres (1 m), for semilattice richness."""
    from pc.maps import activities

    return {k: [[round(p.x - ox, 1), round(p.y - oy, 1)] for p in g.geometry] for k, g in activities(site).items()}


NEIGHBOURS_M = 100.0   # existing buildings kept within this of the design ground (building-scale shade)
NEARBY_M = 300.0       # a building of unknown height takes the median of known ones this close ...
NEARBY_MIN = 5         # ... when at least this many are known
DEFAULT_STOREYS = 2    # ... else this many storeys
OB_MIN_M = 2.5         # an Open Buildings reading lower than this counts as no reading
# "user" is never written here: the massing view sets it when someone types a height.
HEIGHT_SOURCES = ["height", "floors", "open_buildings", "nearby", "default", "user"]


def _open_buildings_heights(site: Site, geoms) -> np.ndarray:
    """The 90th percentile of Open Buildings heights inside each footprint (NaN without a
    reading). Fetches raw/heights.tif if missing; all NaN where the dataset doesn't reach."""
    import rasterio
    from rasterio.features import rasterize

    from pc.fetch import fetch_heights
    out = np.full(len(geoms), np.nan)
    if not site.heights.exists():
        try:
            fetch_heights(site)
        except Exception as err:  # outside coverage, or the bucket didn't answer
            print(f"  Open Buildings heights unavailable ({type(err).__name__}: {err}); estimating", flush=True)
            return out
    with rasterio.open(site.heights) as src:
        hv = src.read(1)
        ids = rasterize(((g, k + 1) for k, g in enumerate(geoms)), out_shape=hv.shape, transform=src.transform,
                        fill=0, dtype="int32", all_touched=True)
    flat = ids.ravel()
    order = np.argsort(flat, kind="stable")
    fs, hs = flat[order], hv.ravel()[order]
    starts = np.searchsorted(fs, np.arange(1, len(geoms) + 2))
    for k in range(len(geoms)):
        v = hs[starts[k]:starts[k + 1]]
        v = v[np.isfinite(v)]
        if len(v):
            out[k] = np.percentile(v, 90)
    return out


def existing_buildings(site: Site, ground) -> dict | None:
    """Existing buildings near the design ground, for building-scale massing (shade on and from
    neighbours; app/engine/massing). Footprints (outer rings, 0.5 m simplified, local metres)
    with a height and where it came from:
      height          Overture's `height`
      floors          Overture's `num_floors` × STOREY_M
      open_buildings  Google Open Buildings 2.5D Temporal (2023): the 90th percentile of its
                      heights inside the footprint, when at least OB_MIN_M
      nearby          the median of known heights within NEARBY_M (at least NEARBY_MIN known)
      default         DEFAULT_STOREYS × STOREY_M
    Buildings on the design ground are listed apart, under "ground": the design replaces them,
    unless a person keeps one (a drawn constraint; app/engine/moves.ts)."""
    from pc import syntax as sx
    from pc.metrics.network import STOREY_M
    p = site.overture("building")
    if not p.exists():
        return None
    b = gpd.read_parquet(p).to_crs(site.crs)
    ox, oy = ground.origin
    idx = sx.ground_index(ground)
    reach = NEIGHBOURS_M + float(ground.graph.size)
    c = b.geometry.centroid
    cx, cy = (c.x - ox).to_numpy(), (c.y - oy).to_numpy()
    h = b["height"].to_numpy(float) if "height" in b else np.full(len(b), np.nan)
    f = b["num_floors"].to_numpy(float) if "num_floors" in b else np.full(len(b), np.nan)
    known_h = np.where(np.isfinite(h) & (h > 2) & (h < 300), h, np.where(np.isfinite(f) & (f > 0), f * STOREY_M, np.nan))
    kx, ky, kh = cx[np.isfinite(known_h)], cy[np.isfinite(known_h)], known_h[np.isfinite(known_h)]
    on = [k for k in range(len(b)) if idx.has(float(cx[k]), float(cy[k]))]
    keep = [k for k in range(len(b)) if not idx.has(float(cx[k]), float(cy[k])) and idx.near(float(cx[k]), float(cy[k]), reach)]
    # Looked up apart: the lookup over a list isn't independent per building, and the
    # neighbours' heights stay as they were before the ground's were added.
    ob = {}
    for which in (keep, on):
        if which:
            ob.update(zip(which, _open_buildings_heights(site, b.geometry.iloc[which].tolist())))

    def footprints(which):
        rings, heights, src = [], [], []
        for k in which:
            geom, x, y = b.geometry.iloc[k], float(cx[k]), float(cy[k])
            if np.isfinite(h[k]) and 2 < h[k] < 300:
                hk, sk = float(h[k]), 0
            elif np.isfinite(f[k]) and f[k] > 0:
                hk, sk = float(f[k]) * STOREY_M, 1
            elif np.isfinite(ob[k]) and ob[k] >= OB_MIN_M:
                hk, sk = float(ob[k]), 2
            else:
                near = kh[(kx - x) ** 2 + (ky - y) ** 2 <= NEARBY_M ** 2]
                hk, sk = (float(np.median(near)), 3) if len(near) >= NEARBY_MIN else (DEFAULT_STOREYS * STOREY_M, 4)
            poly = max(getattr(geom, "geoms", [geom]), key=lambda g: g.area).simplify(0.5)
            pts = [(round(px - ox, 1), round(py - oy, 1)) for px, py in poly.exterior.coords][:-1]
            if len(pts) < 3:
                continue
            rings.append([v for pt in pts for v in pt])
            heights.append(round(hk, 1))
            src.append(sk)
        return rings, heights, src

    rings, heights, src = footprints(keep)
    counts = {name: src.count(i) for i, name in enumerate(HEIGHT_SOURCES)}
    g_rings, g_heights, g_src = footprints(on)
    return {"within_m": NEIGHBOURS_M, "rings": rings, "h": heights, "src": src, "sources": HEIGHT_SOURCES, "counts": counts,
            "ground": {"rings": g_rings, "h": g_heights, "src": g_src}}


def suitability(site: Site) -> tuple[gpd.GeoDataFrame, gpd.GeoDataFrame, dict]:
    """The built layers, and the site's current rules applied to them."""
    grid = gpd.read_file(site.layers / "grid.gpkg", layer="cells")
    r = rules.load_rules(site.rules)
    suit, _ = rules.apply(grid, r)
    return grid, suit, r


def export(site: Site) -> dict:
    from pc.maps import context

    grid_layers, suit, r = suitability(site)
    graph = cellgrid.for_site(site)
    ground, design = engine_ground(suit, graph)
    ox, oy = ground.origin
    skel = skeleton.build(site, ground, ground.cells, suit) if "valley_order" in suit else None
    lf_summary = landform.load(site)
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
        "nbr": [int(v) for v in graph.padded(graph.neighbours(suit)).ravel()],
        "memberships": [int(v) for v in suit["memberships"]],
        "layers": layer_table(grid_layers),
    }
    if "flow_to_row" in suit:  # the cell each drains to, as a grid index (-1: an outlet or off the grid)
        gpos = {(int(r_), int(c_)): k for k, (r_, c_) in enumerate(zip(suit["row"], suit["col"]))}
        grid["down"] = [gpos.get((int(r_), int(c_)), -1) for r_, c_ in zip(suit["flow_to_row"], suit["flow_to_col"])]
        if skel:  # the skeleton on grid cells too, so edited rules in the browser can map it again
            dpos = [gpos[(int(r_), int(c_))] for r_, c_ in zip(ground.cells["row"], ground.cells["col"])]
            skel["grid_sides"] = [[dpos[i], a, rid, lv] for i, a, rid, lv in skel["sides"]]
            skel["grid_crossings"] = [[dpos[i], a] for i, a in skel["crossings"]]
            skel["grid_road_sides"] = [[dpos[i], a] for i, a in skel["road_sides"]]

    ctx = context(site)
    places = ctx["places"]
    out = {
        "meta": {
            "format": FORMAT, "id": site.id, "name": site.name, "origin": [round(lon, 6), round(lat, 6)],
            **({"hex_radius": graph.size} if graph.type == "hex" else {}),
            "grid": graph.describe(), "cell_area": round(float(ground.area[0]), 3),
            "design_storm_mm": site.design_storm_mm, "target_far": site.target_far,
            "target_floor_area_ha": site.target_floor_area_ha,
            "target_ha": round(fitness.floor_area_target(site, ground) / 1e4, 1),
            "design_ha": round(float(ground.area.sum()) / 1e4, 1),
            "sea_levels": site.sea_levels, "states": list(STATE_CODE),
            "credits": CREDITS + ([wind.CREDIT] if wind.meta(site) else []),
            **({"landform": {k: v for k, v in lf_summary.items() if k != "ridges"}} if lf_summary else {}),
            **({"lst": lst.meta(site)} if lst.meta(site) else {}),
            **({"wind": wind.meta(site)} if wind.meta(site) else {}),
        },
        "grid": grid,
        "rules": rule_table(r),
        "design": design,
        "context": {
            "roads": _lines(ctx["roads"], ox, oy),
            "rail": _lines(ctx["rail"], ox, oy),
            "boundary": _lines(ctx["boundary"].boundary, ox, oy, 1.0) if len(ctx["boundary"]) else [],
            "places": [{"name": p["label"], "x": round(p.geometry.x - ox, 1), "y": round(p.geometry.y - oy, 1)}
                       for _, p in places.iterrows()],
            "activities": _activities(site, ox, oy),
        },
        **({"skeleton": skel} if skel else {}),
    }
    sx = syntax.buffer_streets(site, (ox, oy))
    if sx:
        out["syntax"] = sx
    ground.origin = (ox, oy)
    nb = existing_buildings(site, ground)
    if nb:
        out["context"]["buildings"] = nb
    off, off_src = utc_offset_of(site, lon, lat)
    out["meta"]["utc_offset_h"], out["meta"]["utc_offset_source"] = off, off_src
    return out


def ground_from_export(data: dict) -> genome.Ground:
    """The engine's Ground, rebuilt from an export (identical inputs for both engines)."""
    d = data["design"]
    n = len(d["x"])
    can = np.array(d["can"])
    graph = cellgrid.from_meta(data["meta"])
    area = np.full(n, data["meta"]["cell_area"])
    xy = np.column_stack([d["x"], d["y"]])
    return genome.Ground(
        cells=None, xy=xy, area=area, nbr=np.array(d["nbr"]).reshape(n, graph.degree),
        can_build=(can & 1) > 0, can_green=(can & 2) > 0, can_water=(can & 4) > 0,
        cap=np.array(d["cap"]), min_perm=np.array(d["min_perm"]), trees=np.array(d["trees"]),
        site_water=np.array(d["site_water"]), spacing=graph.spacing,
        bounds=(xy[:, 0].min(), xy[:, 1].min(), xy[:, 0].max(), xy[:, 1].max()),
        graph=graph, roads=data.get("context", {}).get("roads"),
        activities=data.get("context", {}).get("activities"),
        z=np.array(d["z"]) if "z" in d else None, valley=np.array(d["valley"]) if "valley" in d else None,
        vbuf=np.array(d["vbuf"]) if "vbuf" in d else None, down=np.array(d["down"]) if "down" in d else None,
        lst=np.array([np.nan if v is None else v for v in d["lst"]]) if "lst" in d else None,
        ridge=np.array(d["ridge"]) if "ridge" in d else None, skeleton=data.get("skeleton"),
        syntax_streets=(data.get("syntax") or {}).get("segments"),
        relief_class=(data.get("meta", {}).get("landform") or {}).get("relief", {}).get("class"),
    )


class _Brief:
    """Just what fitness.evaluate reads from a site."""
    def __init__(self, meta):
        self.design_storm_mm = meta["design_storm_mm"]
        self.target_far = meta["target_far"]
        self.target_floor_area_ha = meta["target_floor_area_ha"]


# Whole evolutions for the fixture: plain, with a mid-run shock, and with locked cells,
# start genomes and a different population; then NSGA-III and MAP-Elites runs the same
# ways, and runs on form metrics. Small, so the fixture stays quick to check.
EVOLUTIONS = [
    {"seed": 1, "generations": 8, "pop": 30},
    {"seed": 7, "generations": 8, "pop": 30, "shock": [4, 1.4]},
    {"seed": 3, "generations": 6, "pop": 24, "immigrants": 0.2, "locked": "every7", "start": 2},
    {"search": "nsga3", "seed": 5, "generations": 8, "pop": 30},
    {"search": "nsga3", "seed": 11, "generations": 6, "pop": 24, "shock": [3, 1.5], "locked": "every7"},
    {"search": "map-elites", "seed": 2, "generations": 8, "pop": 30},
    {"search": "map-elites", "seed": 4, "generations": 6, "pop": 24, "axes": ["storage", "height_variety"], "bins": 6,
     "shock": [3, 1.4], "start": 2, "weights": {"storage": 2, "daylight": 1}},
    # Form metrics promoted to objectives (NSGA-III with seven), and as MAP-Elites traits.
    {"seed": 9, "generations": 5, "pop": 24, "objectives": ["dh_enclosure", "green_view"]},
    {"search": "nsga3", "seed": 13, "generations": 5, "pop": 24, "objectives": ["semilattice", "positive_space"],
     "shock": [3, 1.3]},
    {"search": "map-elites", "seed": 6, "generations": 5, "pop": 20, "axes": ["positive_space", "rhythm_built"],
     "bins": 5},
]


def _evolution(ground, brief, case: dict) -> dict:
    opts = {k: v for k, v in case.items() if k not in ("locked", "start", "shock")}
    locked = None
    if case.get("locked") == "every7":
        locked = np.zeros(len(ground.xy), dtype=np.int8)
        locked[::7] = 1 + (np.arange(0, len(ground.xy), 7) % 3)
    start = None
    if case.get("start"):
        r = Rng(99)
        start = [genome.random_genome(r) for _ in range(case["start"])]
    shock = tuple(case["shock"]) if "shock" in case else None
    if opts.get("search") == "map-elites":
        opts.pop("search")
        run = elites.map_elites(brief, ground, locked=locked, shock=shock, start=start, log=None, **opts)
    else:
        run = evolve.evolve(brief, ground, locked=locked, shock=shock, start=start, log=None, **opts)
    inf = lambda v: None if np.isinf(v) else float(v)  # JSON has no Infinity
    archive = lambda i: {"cell": i.cell, "quality": i.quality} if case.get("search") == "map-elites" else {}
    return {
        "case": case,
        "history": [{k: (float(v) if isinstance(v, (float, np.floating)) else v) for k, v in h.items()}
                    for h in run.history],
        "pop": [{"name": i.name, "rank": i.rank, "crowd": inf(i.crowd), "parents": list(i.parents),
                 "genome": [float(v) for v in i.design.genome], "scores": i.scores, **archive(i)} for i in run.pop],
    }


def _scaled(c, f):
    """A condition with every threshold multiplied by f."""
    if "all" in c or "any" in c:
        key = "all" if "all" in c else "any"
        return {key: [_scaled(p, f) for p in c[key]]}
    if "not" in c:
        return {"not": _scaled(c["not"], f)}
    return {**c, "value": c["value"] * f} if "op" in c else dict(c)


def edited_rules(r: dict) -> dict:
    """The site's rules as a person might edit them in the browser: every constrained
    threshold halved, and a new rule for yards whose uses clash with the rain hollows
    (so some cells become conflicts)."""
    e = copy.deepcopy(r)
    for rule in e.get("constrained") or []:
        rule["when"] = _scaled(rules.condition(rule["when"]), 0.5)
    e.setdefault("constrained", []).append({
        "name": "yards", "roles": ["work"],
        "when": {"any": [{"layer": "industrial"}, {"layer": "built", "op": ">=", "value": 0.3}]},
        "limits": {"uses": ["building", "street"], "max_levels": 8}})
    return e


def _rule_case(site, name, grid, r, origin) -> dict:
    suit, skipped = rules.apply(grid, r)
    _, design = site_ground(site, suit, origin)
    return {"name": name, "rules": rule_table(r), "skipped": skipped,
            "state": [STATE_CODE[v] for v in suit["state"]],
            "memberships": [int(v) for v in suit["memberships"]],
            "max_levels": [int(v) for v in suit["max_levels"]],
            "min_permeable": [float(v) for v in suit["min_permeable"]],
            "uses": list(suit["uses"]), "conflict": [int(v) for v in suit["conflict"]],
            "roles": list(suit["roles"]), "reasons": list(suit["reasons"]),
            "raised_ground": [int(v) for v in suit["raised_ground"]],
            "remediate": [int(v) for v in suit["remediate"]],
            "design": design}


def rule_cases(site: Site) -> list[dict]:
    """The site's rules and an edited set, applied in Python, with the design ground each
    gives (on the export's origin, as the browser rebuilds it)."""
    grid, suit, r = suitability(site)
    base, _ = site_ground(site, suit)
    return [_rule_case(site, "site", grid, r, base.origin),
            _rule_case(site, "edited", grid, edited_rules(r), base.origin)]


BRIEF_CASES = ROOT / "test" / "parity" / "brief-cases.json"


def brief_cases(data: dict) -> dict:
    """The hand-written briefs in test/parity/brief-cases.json, validated and applied on
    this site's rules (pc/brief.py), and the typology seeds."""
    from pc import brief

    spec = json.loads(BRIEF_CASES.read_text(encoding="utf-8"))
    ctx = brief.context_for(data["rules"], spec["snippets"], brief.pattern_numbers())
    meta = {k: data["meta"][k] for k in ("target_far", "target_floor_area_ha", "design_storm_mm")}
    cases = []
    for c in spec["cases"]:
        b, warnings = brief.validate(c["input"], ctx)
        cases.append({"name": c["name"], "brief": b, "warnings": warnings, "config": brief.apply(b, data["rules"], meta)})
    seeds = [brief.typology_seeds(s["priors"], s["count"], s["seed"]) for s in spec["seeds"]]
    return {"context": ctx, "cases": cases, "seeds": seeds}


METRIC_CASES = 12  # of the random genomes, how many carry their form metrics
SYNTAX_CASES = 2   # ... of those, how many include space syntax (seconds each in Python)
# On the smallest network only: exact Rn choice, and a run with legibility promoted.
SYNTAX_FULL_SITE = "mumbai-docks"
SYNTAX_EVOLUTION = {"seed": 21, "generations": 3, "pop": 12, "objectives": ["legibility"]}


def _syntax_case(d, ground, choice: bool) -> dict:
    """Space syntax of one design, segment by segment (pc/syntax.py)."""
    from pc import syntax as sx
    net = metrics.network(d, ground)
    S = sx.syntax_of(net)
    N = S["N"]
    inf = lambda vs: [None if v is None or not np.isfinite(v) else float(v) for v in vs]
    out = {"segments": len(N.a), "site": N.site, "links": N.links,
           "local": [{"radius": m["radius"], "nain": inf(m["nain"]), "nach": inf(m["nach"])} for m in S["local"]],
           "rn": inf(S["rn"]["nain"])}
    if choice:
        c = sx.choice_rn(net)
        out["choice_rn"] = {"nach": inf(c["nach"]), "nain": inf(c["nain"])}
    return out


def fixture(data: dict, n=40, seed=7, site: Site | None = None) -> dict:
    """Random genomes with their designs and scores, grown by the Python engine, a few
    whole evolutions, and (with the site) the rules applied to its layers."""
    ground = ground_from_export(data)
    brief = _Brief(data["meta"])
    rng = Rng(seed)
    cases = []
    for k in range(n):
        g = genome.random_genome(rng)
        d = genome.grow(g, ground)
        s = fitness.evaluate(d, ground, brief)
        keys = [m for m in metrics.METRICS if k < SYNTAX_CASES or m not in metrics.SYNTAX_KEYS]
        cases.append({"genome": [float(v) for v in g], "use": genome.use_codes(d).tolist(),
                      "levels": d.levels.tolist(), "scores": s,
                      **({"metrics": metrics.measure(d, ground, keys)} if k < METRIC_CASES else {}),
                      **({"syntax": _syntax_case(d, ground, data["meta"]["id"] == SYNTAX_FULL_SITE)} if k == 0 else {})})
    ranks = fitness.pareto_ranks([c["scores"] for c in cases])
    for c, r in zip(cases, ranks):
        c["rank"] = int(r)
    r = Rng(12345)
    stream = {"seed": 12345, "random": [r.random() for _ in range(200)], "normal": [r.normal(0, 0.12) for _ in range(50)]}
    return {"site": data["meta"]["id"], "cases": cases, "rng": stream,
            "evolutions": [_evolution(ground, brief, c) for c in EVOLUTIONS
                           + ([SYNTAX_EVOLUTION] if data["meta"]["id"] == SYNTAX_FULL_SITE else [])],
            "rule_cases": rule_cases(site) if site else [],
            "briefs": brief_cases(data)}


def index_entry(site: Site, data: dict) -> dict:
    """The site's line in sites.json, for the workbench's site cards and map: its size, how
    hilly it is and how sure, where it is, its outline (degrees) and a tiny map of its cells
    (rows of characters: "." nothing, "w" water, "d" design ground, "c" context)."""
    from shapely.geometry import box as sbox

    from pc.site import read_polygon

    meta = data["meta"]
    relief = (meta.get("landform") or {}).get("relief") or {}
    shape = (read_polygon(site.design_area) if site.design_area else
             read_polygon(site.boundary) if site.boundary else sbox(*site.bbox))
    shape = shape.simplify(0.0002)
    geom = shape if shape.geom_type == "Polygon" else max(shape.geoms, key=lambda g: g.area)
    outline = [[round(x, 5), round(y, 5)] for x, y in list(geom.exterior.coords)[:80]]
    # the thumbnail: 36 columns, rows to keep the aspect
    g, d = data["grid"], data["design"]
    xs, ys = np.array(g["x"]), np.array(g["y"])
    x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
    cols = 36
    rows = max(8, min(48, round(cols * (y1 - y0) / max(x1 - x0, 1))))
    cell = [["." for _ in range(cols)] for _ in range(rows)]
    water = g.get("layers", {}).get("water") or [0] * len(xs)
    design = set(zip(np.round(d["x"], 1), np.round(d["y"], 1)))
    for x, y, w in zip(xs, ys, water):
        c = min(cols - 1, int((x - x0) / (x1 - x0 + 1e-9) * cols))
        r = min(rows - 1, int((y1 - y) / (y1 - y0 + 1e-9) * rows))
        k = "w" if w else "d" if (round(x, 1), round(y, 1)) in design else "c"
        if cell[r][c] != "w":
            cell[r][c] = k if cell[r][c] in ".c" or k == "w" else cell[r][c]
    return {
        "name": site.name, "design_ha": meta["design_ha"], "target_ha": meta["target_ha"],
        "origin": meta["origin"], "cells": len(d["x"]),
        "relief": relief.get("class"), "relief_m": relief.get("relief_m"), "confidence": relief.get("confidence"),
        "terrain": relief.get("source"), "outline": outline, "thumb": ["".join(r) for r in cell],
    }


def write(site: Site, with_fixture=False):
    data = export(site)
    SITES_OUT.mkdir(parents=True, exist_ok=True)
    out = SITES_OUT / f"{site.id}.json"
    out.write_text(json.dumps(data, separators=(",", ":")), encoding="utf-8")
    print(f"  {out.relative_to(ROOT)}  {out.stat().st_size / 1e3:.0f} KB  "
          f"({len(data['grid']['x']):,} cells, {len(data['design']['x']):,} design cells)")
    if with_fixture:
        FIXTURES.mkdir(parents=True, exist_ok=True)
        fx = FIXTURES / f"{site.id}.json"
        fx.write_text(json.dumps(fixture(data, site=site)), encoding="utf-8")
        print(f"  {fx.relative_to(ROOT)}")
    index = SITES_OUT / "sites.json"
    sites = json.loads(index.read_text(encoding="utf-8")) if index.exists() else {}
    sites[site.id] = index_entry(site, data)
    index.write_text(json.dumps(sites, indent=1), encoding="utf-8")
