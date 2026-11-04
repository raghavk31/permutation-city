"""A real place and its focused brief, for the browser and the agents' tools.

    uv run pc place <site>   → app/public/sites/<site>.place.json

Where `pc export` prepares ground for growing a whole city, this keeps what is there, in full:
each building (footprint, height and where the height came from, name), each street and path
(line, class, name), water and land use as polygons, and per cell the ground, river bands, the
satellite's wet record, trees and hot-season surface temperature. The brief (sites/<id>/brief.yaml)
comes along, its stays resolved to real geometry. See docs/architecture-v3.md section 15.

Local metres around the study box's centre.
"""
from __future__ import annotations

import json

import geopandas as gpd
import numpy as np
import yaml
from shapely.geometry import LineString, MultiPolygon, Polygon
from shapely.ops import nearest_points, substring, unary_union

from pc import grid as cellgrid
from pc import landform, riveryear
from pc.export import CREDITS, HEIGHT_SOURCES, SITES_OUT, _open_buildings_heights, height_picker
from pc.maps import _name
from pc.metrics.network import STOREY_M
from pc.site import Site, read_polygon

CLOSE_M = 30.0      # outlines of cell regions are rounded by these, so they don't read as hexagons
SMOOTH_M = 20.0
SIMPLIFY_M = 2.0
LINE_M = 1.0        # streets and footprints simplified to this
NOT_WALKED = {"rail"}


def _round(pts, ox, oy):
    return [v for x, y in pts for v in (round(x - ox, 1), round(y - oy, 1))]


def _polys(geom):
    if geom is None or geom.is_empty:
        return []
    if isinstance(geom, Polygon):
        return [geom]
    if isinstance(geom, MultiPolygon):
        return list(geom.geoms)
    return [g for g in getattr(geom, "geoms", []) if isinstance(g, Polygon)]


def _rings(geom, ox, oy, tol=SIMPLIFY_M):
    """Polygons as [outer, hole, hole...], each ring flat [x0, y0, x1, y1, ...]."""
    out = []
    for p in _polys(geom.simplify(tol) if tol else geom):
        out.append([_round(list(r.coords)[:-1], ox, oy) for r in (p.exterior, *p.interiors)])
    return out


def _smooth(geom):
    """A region made of cells, rounded so it doesn't read as hexagons."""
    closed = geom.buffer(CLOSE_M).buffer(-CLOSE_M)   # fills the notches between cells
    return closed.buffer(-SMOOTH_M).buffer(SMOOTH_M)  # takes off the bumps


def river_cells(g, nbr) -> np.ndarray:
    """The river: the largest connected body of water cells, not the tanks in the gardens."""
    water = (g["water"] > 0).to_numpy()
    label, best, best_n, n = np.full(len(g), -1), -1, 0, 0
    for s in np.nonzero(water)[0]:
        if label[s] >= 0:
            continue
        stack, size = [s], 0
        label[s] = n
        while stack:
            i = stack.pop()
            size += 1
            for j in nbr[i]:
                if j >= 0 and water[j] and label[j] < 0:
                    label[j] = n
                    stack.append(j)
        if size > best_n:
            best, best_n = n, size
        n += 1
    return label == best


def bands(g, nbr, river, marks) -> np.ndarray:
    """Per cell: 0 the river; k (1-based) the lowest mark whose water reaches it, spreading over
    land from the river only (ground behind higher ground isn't flooded by it); len(marks) + 1
    for the rest. Tanks and ponds away from the river have no ground height, and stay out."""
    z = g["ground"].to_numpy()
    land = z > 0
    out = np.full(len(g), len(marks) + 1)
    for k, m in reversed(list(enumerate(marks))):
        seen = river.copy()
        stack = list(np.nonzero(river)[0])
        while stack:
            i = stack.pop()
            for j in nbr[i]:
                if j >= 0 and not seen[j] and land[j] and z[j] <= m["m"]:
                    seen[j] = True
                    stack.append(j)
        out[seen] = k + 1
    out[river] = 0
    return out


def banks(g, nbr, river, anchors) -> tuple[np.ndarray, np.ndarray]:
    """Land cells touching the river, and each land cell's side: 1 the side of anchors[0], 2 of
    anchors[1], 0 islands and anything else."""
    bank = np.array([not river[i] and any(j >= 0 and river[j] for j in nbr[i]) for i in range(len(g))])
    side = np.zeros(len(g), dtype=int)
    for s, start in enumerate(anchors, 1):
        stack = [start]
        side[start] = s
        while stack:
            i = stack.pop()
            for j in nbr[i]:
                if j >= 0 and not river[j] and side[j] == 0:
                    side[j] = s
                    stack.append(j)
    return bank, side


def _at_junctions(geom: LineString, connectors) -> list[LineString]:
    """A street cut at the junctions the map records on it, so that simplifying can't lose one.
    A bridge has none where it passes over a road, so the two stay apart."""
    ats = sorted({float(c["at"]) for c in (connectors if connectors is not None else []) if 0 < float(c["at"]) < 1})
    if not ats:
        return [geom]
    cuts = [0.0, *ats, 1.0]
    out = [substring(geom, a, b, normalized=True) for a, b in zip(cuts, cuts[1:])]
    return [p for p in out if isinstance(p, LineString) and not p.is_empty]


def _themes(site: Site) -> dict:
    return {t: gpd.read_parquet(site.overture(t)).to_crs(site.crs) for t in ("building", "segment", "water", "land_use")}


def _named(t: dict) -> dict:
    """Every named footprint and land use by name; a name can have several."""
    out: dict[str, list] = {}
    for theme in ("building", "land_use"):
        for n, geom in zip(t[theme]["names"].map(_name), t[theme].geometry):
            if n:
                out.setdefault(n, []).append(geom)
    return out


def _stay_geometry(stay, named):
    if not stay.get("features"):
        return None
    missing = [n for n in stay["features"] if n not in named]
    if missing:
        raise ValueError(f"stay {stay['id']}: no feature named {missing}")
    parts = [g for n in stay["features"] for g in named[n]]
    return unary_union(parts).convex_hull.buffer(float(stay.get("buffer_m", 0))) if len(parts) > 1 or stay.get("buffer_m") \
        else parts[0]


def _rule(rule, stay_geoms, cover_geom, box, c, ox, oy):
    """A rule on the map: its rings, and which cells are in it. `from` measures out from what stays;
    `mark` is a mark's reach; `whole` is everywhere."""
    rec = {k: rule.get(k) for k in ("id", "words", "effect", "kind", "source", "status")}
    if rule.get("whole"):
        return rec | {"whole": True}, np.ones(len(c), bool)
    if "mark" in rule:
        geom = cover_geom[rule["mark"]]
    else:
        base = unary_union([stay_geoms[s] for s in rule["from"]])
        geom = base.buffer(float(rule["reach_m"]))
        if rule.get("inner_m"):
            geom = geom.difference(base.buffer(float(rule["inner_m"])))
    if geom.contains(box):
        return rec | {"whole": True}, np.ones(len(c), bool)
    geom = geom.intersection(box)
    return rec | {"rings": _rings(geom, ox, oy)}, np.array(c.within(geom))


def _edge_toward(place, target):
    """Where a straight line from a place's centre toward a target leaves it: on the axis between
    them, where the nearest point would slip to a corner of a slightly turned footprint."""
    hit = LineString([place.centroid, target]).intersection(place.boundary)
    return nearest_points(hit, target)[0] if not hit.is_empty else nearest_points(place, target)[0]


def _view(v, named, ox, oy):
    """A view's eye and what it looks at, on the map."""
    def union(n):
        if n not in named:
            raise ValueError(f"view {v['id']}: no feature named {n}")
        return unary_union(named[n])

    def pt(p):
        return [round(p.x - ox, 1), round(p.y - oy, 1)]

    place = union(v["eye"]["feature"])
    near = v["eye"].get("nearest_to")
    eye = _edge_toward(place, union(near).centroid) if near else place.centroid
    rec = {k: v.get(k) for k in ("id", "words", "why", "status")} | {"eye": pt(eye), "eye_m": v["eye_m"], "on_high": bool(v.get("on_high")), "feature": v["eye"]["feature"]}
    if "target" in v:
        t = union(v["target"]["feature"])
        rec["target"] = {"at": pt(t.centroid), "half_m": round(float(np.sqrt(t.area)) / 2, 1), "foot_m": v["target"]["foot_m"], "name": v["target"]["feature"]}
    else:
        rec["looks"] = {"at": pt(union(v["looks"]["feature"]).centroid), "fan_deg": v["looks"]["fan_deg"]}
    return rec


def build_place(site: Site) -> dict:
    brief = yaml.safe_load((site.folder / "brief.yaml").read_text(encoding="utf-8"))
    marks = brief["marks"]
    g = gpd.read_file(site.layers / "grid.gpkg", layer="cells")
    graph = cellgrid.for_site(site)
    nbr = graph.neighbours(g)
    box = gpd.GeoSeries([read_polygon(site.boundary)], crs=4326).to_crs(site.crs).iloc[0]
    x0, y0, x1, y1 = box.bounds
    ox, oy = round((x0 + x1) / 2, 1), round((y0 + y1) / 2, 1)
    lon, lat = gpd.GeoSeries(gpd.points_from_xy([ox], [oy]), crs=site.crs).to_crs(4326).iloc[0].coords[0]
    t = _themes(site)
    named = _named(t)

    # What the data gets wrong here, dropped and reported: a land use bigger than the study box
    # by far (a Pacific marine monument's polygon reaches Agra in Overture).
    lu = t["land_use"]
    huge = lu.area > box.area * 10
    dropped = sorted({_name(n) or "unnamed" for n in lu[huge]["names"]})
    lu = lu[~huge]
    named = {k: [g_ for g_ in v if g_.area <= box.area * 10] for k, v in named.items()}

    river = river_cells(g, nbr)
    band = bands(g, nbr, river, marks)
    c = g.centroid
    stays, stay_union, stay_geoms = [], [], {}
    for s in brief["stays"]:
        geom = _stay_geometry(s, named)
        rec = {k: s.get(k) for k in ("id", "words", "why", "applies", "outline", "source", "status")}
        rec |= {"decided_by": None, "decision": None}   # a stakeholder fills these (step F3)
        if geom is not None:
            rec["rings"] = _rings(geom, ox, oy)
            stay_union.append(geom)
            stay_geoms[s["id"]] = geom
        stays.append(rec)
    stay_geom = unary_union(stay_union) if stay_union else None
    inside = np.array(c.within(stay_geom)) if stay_geom is not None else np.zeros(len(g), bool)

    def nearest_cell(geom):
        return int(c.distance(geom.centroid).to_numpy().argmin())

    anchors = [nearest_cell(unary_union(named["Taj Mahal"])), nearest_cell(unary_union(named["Mehtab Bagh"]))]
    bank, side = banks(g, nbr, river, anchors)

    # Buildings: whatever the study box and its margin hold, each with its height.
    b = t["building"]
    bc = b.geometry.centroid
    cx, cy = (bc.x - ox).to_numpy(), (bc.y - oy).to_numpy()
    h = b["height"].to_numpy(float) if "height" in b else np.full(len(b), np.nan)
    f = b["num_floors"].to_numpy(float) if "num_floors" in b else np.full(len(b), np.nan)
    known = np.where(np.isfinite(h) & (h > 2) & (h < 300), h, np.where(np.isfinite(f) & (f > 0), f * STOREY_M, np.nan))
    ok = np.isfinite(known)
    ob = dict(zip(range(len(b)), _open_buildings_heights(site, b.geometry.tolist())))
    pick = height_picker(h, f, ob, cx, cy, cx[ok], cy[ok], known[ok])
    hit = gpd.sjoin(gpd.GeoDataFrame(geometry=bc), g[["geometry"]].reset_index(drop=True), predicate="within", how="left")
    hit = hit[~hit.index.duplicated()]
    cell_of = hit["index_right"].fillna(-1).astype(int).to_numpy()
    names = b["names"].map(_name)
    buildings = {"rings": [], "h": [], "src": [], "cell": [], "names": {}, "sources": HEIGHT_SOURCES}
    for k in range(len(b)):
        poly = max(getattr(b.geometry.iloc[k], "geoms", [b.geometry.iloc[k]]), key=lambda p: p.area).simplify(0.5)
        pts = list(poly.exterior.coords)[:-1]
        if len(pts) < 3:
            continue
        hk, sk = pick(k)
        if isinstance(names.iloc[k], str):
            buildings["names"][str(len(buildings["rings"]))] = names.iloc[k]
        buildings["rings"].append(_round(pts, ox, oy))
        buildings["h"].append(round(hk, 1))
        buildings["src"].append(sk)
        buildings["cell"].append(int(cell_of[k]))

    # Streets and paths: the box's own, and the roads to 1 km beyond it (bridges often lie out there).
    seg = t["segment"]
    syn = site.overture("segment_syntax")
    if syn.exists():
        more = gpd.read_parquet(syn).to_crs(site.crs)
        seg = gpd.pd.concat([seg, more[~more["id"].isin(seg["id"])]], ignore_index=True)
    streets, rail = [], []
    for geom, sub, cls, nm, conn in zip(seg.geometry, seg["subtype"], seg["class"], seg["names"].map(_name), seg["connectors"]):
        if not isinstance(geom, LineString) or geom.is_empty:
            continue
        for piece in _at_junctions(geom, conn):
            line = _round(list(piece.simplify(LINE_M).coords), ox, oy)
            (rail if sub in NOT_WALKED else streets).append({"pts": line, "class": str(cls), **({"name": nm} if isinstance(nm, str) else {})})

    water = t["water"]
    water = water[water.geom_type.isin(["Polygon", "MultiPolygon"])]
    area = float(g.area.iloc[0])

    # The can-change zone and every line's outline, rounded and clipped to the study box.
    outlines, cover = [], {}
    geoms = g.geometry
    for k, m in enumerate(marks):
        reach = (band >= 1) & (band <= k + 1)
        whole = _smooth(unary_union(geoms[reach].tolist())).intersection(box)
        cover[m["id"]] = whole
        zone = whole.difference(stay_geom) if stay_geom is not None else whole
        outlines.append({"mark": m["id"], "rings": _rings(zone, ox, oy), "reach_ha": round(float(reach.sum()) * area / 1e4, 1),
                         "zone_ha": round(float((reach & ~inside).sum()) * area / 1e4, 1)})

    # Rules on the map; per cell, a bit for each rule it falls in.
    rules, rule_bits = [], np.zeros(len(g), dtype=int)
    for k, r in enumerate(brief.get("rules", [])):
        rec, hit = _rule(r, stay_geoms, cover, box, c, ox, oy)
        rules.append(rec)
        rule_bits[hit] |= 1 << k
    views = [_view(v, named, ox, oy) for v in brief.get("views", [])]

    # The river through its year (pc/riveryear.py), when it has been fetched.
    fetched = riveryear.load(site)
    year = None
    if fetched is not None:
        wet, info = fetched
        if wet.shape[1] != len(g):
            raise ValueError("river-year was fetched on another grid: run `pc river-year` again")
        year = {"years": info["years"], "source": info["source"], "months": info["months"], "wet": [[int(v) for v in row] for row in wet]}

    return {
        "meta": {"id": site.id, "name": site.name, "origin": [round(lon, 6), round(lat, 6)], "crs": site.crs,
                 "grid": graph.describe(), "cell_size": graph.size, "cell_area": round(area, 3), "box": [round(x0 - ox, 1), round(y0 - oy, 1), round(x1 - ox, 1), round(y1 - oy, 1)],
                 "credits": CREDITS, "dropped": dropped, "storey_m": STOREY_M},
        "brief": {k: brief.get(k) for k in ("title", "kind", "makes", "detail", "marks", "mark_source", "records", "line", "can_change", "affects", "reads", "links", "open_checks")} | {"stays": stays, "rules": rules, "views": views},
        "year": year,
        "cells": {
            "x": [round(float(v) - ox, 1) for v in c.x], "y": [round(float(v) - oy, 1) for v in c.y],
            "z": [round(float(v), 1) for v in g["ground"]],
            "band": [int(v) for v in band], "rule": [int(v) for v in rule_bits], "stay": [int(v) for v in inside], "bank": [int(v) for v in bank], "side": [int(v) for v in side],
            "tank": [int(w and not r) for w, r in zip((g["water"] > 0).to_numpy(), river)],
            "seasonal": [round(float(v), 3) for v in g["seasonal_water"]],
            "lst": [None if v != v else round(float(v), 1) for v in g["lst"]],
            "trees": [round(float(v), 3) for v in g["trees"]], "green": [round(float(v), 3) for v in g["green"]],
        },
        "buildings": buildings, "streets": streets, "rail": rail,
        "water": [{"subtype": str(s), "rings": _rings(geom, ox, oy, 1.0)} for s, geom in zip(water["subtype"], water.geometry)],
        "land_use": [{"class": str(cl), **({"name": _name(n)} if _name(n) else {}), "rings": _rings(geom, ox, oy, 1.0)}
                     for cl, n, geom in zip(lu["class"], lu["names"], lu.geometry) if geom.geom_type in ("Polygon", "MultiPolygon")],
        "landmarks": {n: [round(float(u.centroid.x) - ox, 1), round(float(u.centroid.y) - oy, 1)]
                      for n, u in ((n, unary_union(v)) for n, v in named.items() if v) if n in {e for l in brief["links"] for e in (l["from"], l["to"])}},
        "outlines": outlines,
    }


def index_entry(site: Site, data: dict) -> dict:
    """What the workbench's Site step lists for a place (places.json)."""
    relief = (landform.load(site) or {}).get("relief") or {}
    line = next(o for o in data["outlines"] if o["mark"] == data["brief"]["line"])
    edge = read_polygon(site.boundary)
    return {"name": site.name, "kind": data["brief"]["kind"], "origin": data["meta"]["origin"],
            "design_ha": line["zone_ha"], "target_ha": 0, "cells": len(data["cells"]["x"]),
            "relief": relief.get("class"), "relief_m": relief.get("relief_m"), "confidence": relief.get("confidence"),
            "terrain": relief.get("source"), "outline": [[round(x, 5), round(y, 5)] for x, y in edge.exterior.coords]}


def write(site: Site) -> None:
    out = SITES_OUT / f"{site.id}.place.json"
    data = build_place(site)
    out.write_text(json.dumps(data, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
    listed = SITES_OUT / "places.json"
    places = json.loads(listed.read_text(encoding="utf-8")) if listed.exists() else {}
    places[site.id] = index_entry(site, data)
    listed.write_text(json.dumps(places, indent=1, ensure_ascii=False), encoding="utf-8")
    c = data["cells"]
    print(f"  {len(data['buildings']['rings'])} buildings, {len(data['streets'])} streets and paths, {len(c['x'])} cells; "
          f"{out.stat().st_size / 1e6:.1f} MB -> {out.name}")
    for o in data["outlines"]:
        print(f"  up to {o['mark']}: {o['reach_ha']} ha of land reached")
    if data["meta"]["dropped"]:
        print(f"  dropped from land use (far bigger than the box): {data['meta']['dropped']}")
