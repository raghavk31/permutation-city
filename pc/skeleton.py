"""The primary street skeleton, fixed per site (docs/landform.md). Worked out at export, on
the design ground as the site's rules leave it; the browser can switch ridges off.

    landform  the strong ridges (pc.landform: divides of 5 ha or more on the smaller side,
              at least half their edges touching a headwater cell), on the sides of design
              cells, joined to the existing roads
    roads     on flat land with no mapped drains (or no usable ridges): the existing roads,
              every class but footpaths, including port and service roads: "skeleton from
              existing roads, not landform". Major roads (motorway to tertiary) are primary
              streets, residential roads secondary, service and port roads lanes

A site can choose (site.yaml `skeleton`): `auto` as above, `roads` always (a built-up site
whose existing streets carry the city, such as Guwahati's Bharalu basin), or `landform`.

Joining: each part of the skeleton that no existing road reaches is linked to the nearest
road side by the shortest path along cell sides. A side between two valley cells (channel
or buffer) is a crossing, a bridge or causeway: it costs CROSSING_COST sides' length, so
paths cross valleys only where they must, and every crossing is counted.

The skeleton never runs between two forbidden cells: those aren't design ground, so no
side between them exists here.
"""

import heapq
import math

import geopandas as gpd

from pc import landform as lf
from pc.metrics.network import crosses, site_of
from pc.streets import direction_to, side_between, sides

CROSSING_COST = 6.0           # a valley crossing costs as much as six ordinary sides
CROSSING_PER_M = 300.0        # allowed crossings: one per 300 m of valley of order 2 or more ...
MIN_CROSSINGS = 1             # ... and at least one
PEDESTRIAN = {"footway", "path", "steps", "cycleway", "bridleway", "pedestrian", "corridor", "sidewalk", "crossing"}
MAJOR = {"motorway", "trunk", "primary", "secondary", "tertiary"}   # existing roads kept as primary streets
LOCAL = {"residential", "unclassified", "living_street"}           # ... as secondary streets; the rest
PRIMARY, SECONDARY, LANE = 3, 2, 1  # (service, track, unknown) as lanes. app/engine/streets.ts


def road_lines(site, origin) -> list:
    """Every road (all classes but footpaths) as (class, points), in the design ground's
    local metres: major roads primary, residential secondary, service and port roads lanes."""
    p = site.overture("segment")
    if not p.exists():
        return []
    seg = gpd.read_parquet(p).to_crs(site.crs)
    roads = seg[(seg["subtype"] == "road") & ~seg["class"].isin(PEDESTRIAN)]
    ox, oy = origin
    out = []
    for cls, geom in zip(roads["class"], roads.geometry):
        for part in getattr(geom, "geoms", [geom]):
            out.append((PRIMARY if cls in MAJOR else SECONDARY if cls in LOCAL else LANE,
                        [(x - ox, y - oy) for x, y in part.coords]))
    return out


def road_sides(ground, lines) -> dict:
    """Sides that a road crosses, with the highest class crossing them: the line from the
    cell's centre to the neighbour's (or to where a neighbour would be, at the edge of the
    design ground) meets a road."""
    S, sd = site_of(ground), sides(ground)
    segs, cls = [], []
    for c, line in lines:
        for a, b in zip(line, line[1:]):
            segs.append((a[0], a[1], b[0], b[1]))
            cls.append(c)
    B, buckets = 100.0, {}
    for k, s in enumerate(segs):
        for bx in range(math.floor(min(s[0], s[2]) / B), math.floor(max(s[0], s[2]) / B) + 1):
            for by in range(math.floor(min(s[1], s[3]) / B), math.floor(max(s[1], s[3]) / B) + 1):
                buckets.setdefault((bx, by), []).append(k)
    step = 2 * math.pi / S.deg
    out = {}
    for sid in range(len(sd.cell)):
        i, a, j = sd.cell[sid], sd.dir[sid], sd.other[sid]
        x0, y0 = S.x[i], S.y[i]
        x1, y1 = (S.x[j], S.y[j]) if j >= 0 else (x0 + S.spacing * math.cos(a * step), y0 + S.spacing * math.sin(a * step))
        seen = set()
        for bx in range(math.floor(min(x0, x1) / B), math.floor(max(x0, x1) / B) + 1):
            for by in range(math.floor(min(y0, y1) / B), math.floor(max(y0, y1) / B) + 1):
                for k in buckets.get((bx, by), ()):
                    if k not in seen and crosses(x0, y0, x1, y1, *segs[k]):
                        out[sid] = max(out.get(sid, 0), cls[k])
                    seen.add(k)
    return out


def _paths_to(sd, starts: set, goals: set, cost) -> list:
    """Shortest path (Dijkstra over vertices) from any start vertex to any goal vertex; the
    sides on it, or [] if none. Ties go to the lower vertex, then the lower side."""
    adj = {}
    for sid in range(len(sd.cell)):
        adj.setdefault(sd.v0[sid], []).append((sd.v1[sid], sid))
        adj.setdefault(sd.v1[sid], []).append((sd.v0[sid], sid))
    dist, prev, heap = {}, {}, []
    for v in sorted(starts):
        dist[v] = 0.0
        heap.append((0.0, v))
    heapq.heapify(heap)
    while heap:
        d, v = heapq.heappop(heap)
        if d > dist.get(v, math.inf):
            continue
        if v in goals:
            out = []
            while v in prev:
                v, sid = prev[v]
                out.append(sid)
            return out
        for w, sid in sorted(adj.get(v, ())):
            nd = d + cost(sid)
            if nd < dist.get(w, math.inf):
                dist[w], prev[w] = nd, (v, sid)
                heapq.heappush(heap, (nd, w))
    return []


def _components(sd, chosen: set) -> list:
    parent = {}

    def find(v):
        while parent.get(v, v) != v:
            parent[v] = parent.get(parent[v], parent[v])
            v = parent[v]
        return v
    for sid in sorted(chosen):
        a, b = find(sd.v0[sid]), find(sd.v1[sid])
        if a != b:
            parent[max(a, b)] = min(a, b)
    groups = {}
    for sid in sorted(chosen):
        groups.setdefault(find(sd.v0[sid]), set()).update((sd.v0[sid], sd.v1[sid]))
    return [groups[k] for k in sorted(groups)]


def build(site, ground, cells, grid) -> dict:
    """The skeleton for the design ground. `cells`: the design cells (rows of the rules
    result, in design order, with row and col); `grid`: every cell of the site, for the
    landform columns and the centres of cells outside the design ground."""
    summary = lf.load(site)
    S, sd = site_of(ground), sides(ground)
    pos = {(int(r), int(c)): k for k, (r, c) in enumerate(zip(cells["row"], cells["col"]))}
    centre = {(int(r), int(c)): (p.x - ground.origin[0], p.y - ground.origin[1])
              for r, c, p in zip(grid["row"], grid["col"], grid.centroid)}
    rc = list(zip(cells["row"], cells["col"]))

    def centre_of(i: int, far: tuple) -> tuple:
        """Centre of the cell at `far`, a neighbour of design cell i. Landform runs on the whole
        box, so on a drawn polygon the neighbour can lie outside the cells kept: place it from
        rows and columns (pc.grid layouts)."""
        if far in centre:
            return centre[far]
        (r1, c1), (r2, c2) = (int(rc[i][0]), int(rc[i][1])), far
        if site.grid_type == "quad":
            dx, dy = (c2 - c1) * site.cell_size, (r2 - r1) * site.cell_size
        else:
            w = math.sqrt(3) * site.cell_size
            dx = (c2 - c1) * w + ((r2 % 2) - (r1 % 2)) * w / 2
            dy = (r2 - r1) * 1.5 * site.cell_size
        return S.x[i] + dx, S.y[i] + dy
    vb = [bool(v) for v in (cells["valley_buffer"] | (cells["valley_order"] >= 1))] if "valley_order" in cells else [False] * S.n
    crossing = lambda sid: sd.other[sid] >= 0 and vb[sd.cell[sid]] and vb[sd.other[sid]]
    roads = road_sides(ground, road_lines(site, ground.origin))
    rel = summary["relief"] if summary else {"class": "flat", "confidence": "low", "source": "none"}

    # Ridge sides on the design ground.
    ridges = []
    for r in (summary or {}).get("ridges", []):
        if r["strength_ha"] < lf.RIDGE_MIN_HA or r["consistency"] < lf.RIDGE_MIN_CONSISTENCY:
            continue
        on = []
        for r1, c1, r2, c2 in r["edges"]:
            p, q = pos.get((r1, c1)), pos.get((r2, c2))
            if p is not None and q is not None:
                sid = side_between(sd, p, q, S)
            elif p is not None or q is not None:
                i, far = (p, (r2, c2)) if p is not None else (q, (r1, c1))
                sid = sd.at[i * S.deg + direction_to(S, i, *centre_of(i, far))]
                sid = sid if sd.other[sid] < 0 else -1
            else:
                sid = -1
            if sid >= 0 and not crossing(sid):
                on.append(sid)
        if on:
            ridges.append({"id": r["id"], "strength_ha": r["strength_ha"], "consistency": r["consistency"],
                           "sides": sorted(set(on))})

    if site.skeleton not in ("auto", "roads", "landform"):
        raise ValueError(f"site.yaml skeleton: {site.skeleton!r} (auto, roads or landform)")
    chosen_by_site = site.skeleton == "roads" and bool(ridges)
    if ridges and site.skeleton != "roads":
        source = "landform"
        chosen = {sid for r in ridges for sid in r["sides"]}
        level = {sid: PRIMARY for sid in chosen}
    else:
        source = "roads" if roads else "none"
        chosen = set(roads)
        level = dict(roads)
    ridge_of = {sid: r["id"] for r in ridges for sid in r["sides"]}

    # Join every part to an existing road.
    goals = {v for sid in roads for v in (sd.v0[sid], sd.v1[sid])}
    connectors, connected = set(), True
    if source == "landform":
        cost = lambda sid: (CROSSING_COST if crossing(sid) else 1.0)
        for comp in _components(sd, chosen):
            if comp & goals:
                continue
            path = _paths_to(sd, comp, goals, cost) if goals else []
            if not path:
                connected = False
                continue
            connectors.update(path)
        chosen |= connectors
        level.update({sid: PRIMARY for sid in connectors})
    cross = sorted(sid for sid in chosen if crossing(sid))
    valley2 = int((cells["valley_order"] >= 2).sum()) if "valley_order" in cells else 0
    cap = max(MIN_CROSSINGS, round(valley2 * S.spacing / CROSSING_PER_M))
    note = {"landform": "primary streets on the strong ridges, joined to the existing roads",
            "roads": "skeleton from existing roads, not landform" + (" (the site's choice)" if chosen_by_site else ""),
            "none": "no ridges and no roads reach the design ground: no skeleton"}[source]
    return {
        "source": source, "note": note, "relief": rel,
        "sides": [[sd.cell[sid], sd.dir[sid], ridge_of.get(sid, -1), level[sid]] for sid in sorted(chosen)],
        "crossings": [[sd.cell[sid], sd.dir[sid]] for sid in cross],
        "crossing_cap": cap, "connected": connected,
        "ridges": [{k: r[k] for k in ("id", "strength_ha", "consistency")} for r in ridges],
        "road_sides": [[sd.cell[sid], sd.dir[sid]] for sid in sorted(roads)],
    }
