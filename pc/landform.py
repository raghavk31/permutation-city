"""Landform: relief, valleys, catchments and ridges on the cell grid (docs/landform.md).

McHarg's reading: valleys carry water, ridges carry movement. This works out, for a
site's whole grid (design area plus its context margin):

    relief          how much the ground varies: pronounced, gentle or flat (with confidence)
    mapped_channel  cells a mapped stream, drain, canal or river runs through (Overture water)
    flow_acc_ha     upstream area draining through each cell (ha), on the conditioned ground
    flow_to_row/col the cell it drains to (-1: an outlet)
    valley_order    Strahler order of drainage lines (0: not a valley)
    valley_buffer   1 within the buffer of a valley (width by order; provisional)
    catchment_id    the valley segment (or outlet) each cell drains to
    ridge           strength of the strongest divide on the cell's edges (ha; 0: none)

and the divides between catchments as cell edges, ranked, which the street skeleton follows.

Hydrology runs on the cells themselves, not a raster: rules, streets and metrics all live on
cells and their shared edges, it works on hex and square grids alike, and the cells are
about the DEM's own grain (35 m between hex centres, 30 m FABDEM). Steps:
  1. condition the ground: lower cells on mapped channels by BURN_M ("stream burning"),
     then fill depressions from the outlets up (priority-flood with a tiny slope, as
     pc.layers.add_drainage does for pooling)
  2. each cell drains to its lowest neighbour (six directions on hexes, four on squares)
  3. accumulate upstream area; valleys start at `valley_ha` (site.yaml, default 10 ha)
  4. on flat land the elevation is mostly noise: valleys come only from mapped water, and
     catchments from the nearest drain, not from flow
"""

import hashlib
import heapq
import json
import math

import geopandas as gpd
import numpy as np

from pc.site import Site

# Relief classes, on the design ground's land (docs/landform.md)
RELIEF_FLAT_M, SLOPE_FLAT = 5.0, 0.005             # flat: relief under 5 m or median slope under 0.5%
RELIEF_PRONOUNCED_M, SLOPE_PRONOUNCED = 20.0, 0.02  # pronounced: 20 m or more and 2% or more
STEEP, STEEP_SHARE = 0.08, 0.15  # ... or 20 m or more with 15% of the land steeper than 8% (hills over a valley floor)
BURN_M = 3.0                  # mapped channels are lowered this much before filling
VALLEY_BUFFER_M = {1: 0.0, 2: 20.0, 3: 40.0}        # each side, by stream order (3: 3 and up); provisional
MAPPED_RIVER_ORDER = 3        # a mapped river or canal is at least order 3
RIDGE_MIN_HA = 5.0            # a primary ridge divides at least this much on its smaller side
RIDGE_MIN_CONSISTENCY = 0.5   # and at least half its edges touch a headwater cell
CHANNEL_CLASSES = {"stream", "drain", "canal", "river", "ditch", "brook"}
EPS = 1e-4                    # the fill's tiny slope, so filled flats still drain


def terrain_source(site: Site) -> str:
    """'fabdem' or 'copernicus-surface' (the fallback copies the surface model; see pc.fetch)."""
    if not site.terrain.exists():
        return "none"
    if site.dem.exists() and site.dem.stat().st_size == site.terrain.stat().st_size:
        h = lambda p: hashlib.md5(p.read_bytes()).hexdigest()
        if h(site.dem) == h(site.terrain):
            return "copernicus-surface"
    return "fabdem"


def relief(grid, nbrs, spacing: float, source: str) -> dict:
    """Relief class of the design ground's land: the 5th to 95th percentile of ground height,
    the median slope between neighbouring cells, and the share of cells steeper than 8% (a
    cell's steepest slope to a neighbour). The steep share catches hills beside a valley
    floor, where the flat half holds the median slope down."""
    z = grid["ground"].to_numpy()
    on = (~grid["water"].to_numpy()) & grid["in_design"].to_numpy()
    zs = z[on]
    cell_slopes = [[abs(z[i] - z[j]) / spacing for j in nbrs[i] if on[j]] for i in np.flatnonzero(on)]
    slopes = [v for row in cell_slopes for v in row]
    r = float(np.percentile(zs, 95) - np.percentile(zs, 5)) if len(zs) else 0.0
    s = float(np.median(slopes)) if slopes else 0.0
    steep = float(np.mean([max(row, default=0.0) > STEEP for row in cell_slopes])) if cell_slopes else 0.0
    hilly = r >= RELIEF_PRONOUNCED_M and (s >= SLOPE_PRONOUNCED or steep >= STEEP_SHARE)
    cls = "pronounced" if hilly else "flat" if r < RELIEF_FLAT_M or s < SLOPE_FLAT else "gentle"
    # Low confidence: a surface model (heights include buildings and trees), or within a
    # quarter of a class boundary (for a pronounced site, only the boundaries that made it so).
    near_pronounced = (abs(r - RELIEF_PRONOUNCED_M) < 0.25 * RELIEF_PRONOUNCED_M
                       or (r >= RELIEF_PRONOUNCED_M and abs(steep - STEEP_SHARE) < 0.25 * STEEP_SHARE))
    near = near_pronounced if cls == "pronounced" else (
        near_pronounced or abs(r - RELIEF_FLAT_M) < 0.25 * RELIEF_FLAT_M or abs(s - SLOPE_FLAT) < 0.25 * SLOPE_FLAT)
    out = {"class": cls, "relief_m": round(r, 1), "median_slope": round(s, 4),
           "steep_share": round(steep, 3), "source": source,
           "confidence": "low" if near else "high", "rebuild": False}
    if source != "fabdem":
        out.update({"class": "flat", "confidence": "low", "rebuild": True,
                    "note": "terrain is a surface model (Copernicus): flat by rule, rebuild once FABDEM is back"})
    return out


def mapped_channels(site: Site, grid) -> np.ndarray:
    """Cells that a mapped stream, drain, canal or river line runs through (Overture water,
    from OSM). Mapped water wins where it disagrees with the DEM."""
    p = site.overture("water")
    if not p.exists():
        return np.zeros(len(grid), dtype=bool)
    w = gpd.read_parquet(p).to_crs(grid.crs)
    lines = w[w.geom_type.str.contains("Line") & w["class"].isin(CHANNEL_CLASSES)]
    if lines.empty:
        return np.zeros(len(grid), dtype=bool)
    hit = gpd.sjoin(grid[["geometry"]], lines[["geometry", "class"]], predicate="intersects")
    out = np.zeros(len(grid), dtype=bool)
    out[grid.index.get_indexer(hit.index.unique())] = True
    return out


def _river_cells(site: Site, grid) -> np.ndarray:
    p = site.overture("water")
    if not p.exists():
        return np.zeros(len(grid), dtype=bool)
    w = gpd.read_parquet(p).to_crs(grid.crs)
    big = w[w.geom_type.str.contains("Line") & w["class"].isin({"river", "canal"})]
    if big.empty:
        return np.zeros(len(grid), dtype=bool)
    hit = gpd.sjoin(grid[["geometry"]], big[["geometry"]], predicate="intersects")
    out = np.zeros(len(grid), dtype=bool)
    out[grid.index.get_indexer(hit.index.unique())] = True
    return out


def flow(ground: np.ndarray, outlet: np.ndarray, nbrs: list) -> tuple[np.ndarray, np.ndarray]:
    """Fill from the outlets up (priority-flood + epsilon), then each cell's receiver: its lowest
    filled neighbour lower than itself (-1 at outlets). Ties go to the first neighbour."""
    n = len(ground)
    filled = np.full(n, np.inf)
    heap = [(float(ground[i]), int(i)) for i in np.flatnonzero(outlet)]
    for h, i in heap:
        filled[i] = h
    heapq.heapify(heap)
    while heap:
        h, i = heapq.heappop(heap)
        for j in nbrs[i]:
            if filled[j] == np.inf:
                filled[j] = max(ground[j], h + EPS)
                heapq.heappush(heap, (filled[j], j))
    recv = np.full(n, -1)
    for i in range(n):
        if outlet[i] or not nbrs[i]:
            continue
        j = min(nbrs[i], key=lambda k: filled[k])
        if filled[j] < filled[i]:
            recv[i] = j
    return filled, recv


def analyse(site: Site, grid, nbrs: list, graph) -> tuple[gpd.GeoDataFrame, dict]:
    """Add the landform columns to `grid` (the whole grid, before cropping) and return the
    site-level summary: relief, ridges as cell edges, and the settings used."""
    n = len(grid)
    area = grid.area.to_numpy() / 1e4
    water = grid["water"].to_numpy()
    edge = np.array([len(nb) < graph.degree for nb in nbrs])
    outlet = water | edge
    source = terrain_source(site)
    rel = relief(grid, nbrs, graph.spacing, source)
    flat = rel["class"] == "flat"

    channel = mapped_channels(site, grid) & ~water
    z = grid["ground"].to_numpy().astype(float)
    filled, recv = flow(np.where(channel, z - BURN_M, z), outlet, nbrs)
    order_down = np.argsort(-filled, kind="stable")  # upstream first
    acc = area.copy()
    for i in order_down:
        if recv[i] >= 0:
            acc[recv[i]] += acc[i]
    grid["flow_acc_ha"] = acc.round(2)
    rows, cols = grid["row"].to_numpy(), grid["col"].to_numpy()
    grid["flow_to_row"] = np.where(recv >= 0, rows[recv], -1)  # the receiver, by row and col, so it
    grid["flow_to_col"] = np.where(recv >= 0, cols[recv], -1)  # survives cropping

    # Valleys: mapped channels always; on land with relief, also where enough area drains.
    valley = channel | ((acc >= site.valley_ha) & ~water & (not flat))
    contrib = [[] for _ in range(n)]
    for i in range(n):
        if valley[i] and recv[i] >= 0 and valley[recv[i]]:
            contrib[recv[i]].append(i)
    order = np.zeros(n, dtype=int)
    seg = np.full(n, -1)
    segments = 0
    for i in order_down:  # Strahler order, and segments split at heads and confluences
        if not valley[i]:
            continue
        ups = [order[j] for j in contrib[i]]
        top = max(ups, default=0)
        order[i] = 1 if not ups else top + (1 if ups.count(top) >= 2 else 0)
        if len(contrib[i]) == 1:
            seg[i] = seg[contrib[i][0]]
        else:
            seg[i] = segments
            segments += 1
    rivers = _river_cells(site, grid) & valley
    order[rivers] = np.maximum(order[rivers], MAPPED_RIVER_ORDER)
    grid["mapped_channel"] = channel
    grid["valley_order"] = order

    # Buffers: cells within the order's width of a valley cell (neighbour steps, as pc.grid.passes).
    from pc.grid import passes
    buffer = valley.copy()
    for o, metres in VALLEY_BUFFER_M.items():
        rings = passes(metres, graph.spacing) if metres > 0 else 0
        frontier = list(np.flatnonzero((order >= o) if o == 3 else (order == o)))
        seen = set(frontier)
        for _ in range(rings):
            nxt = []
            for i in frontier:
                for j in nbrs[i]:
                    if j not in seen and not water[j]:
                        seen.add(j)
                        nxt.append(j)
            frontier = nxt
        buffer[list(seen)] = True
    grid["valley_buffer"] = buffer & ~water

    # Catchments: the valley segment (or outlet) each cell drains to. On flat land, the nearest
    # mapped drain by steps, since flow there follows noise.
    cid = np.full(n, -1)
    if flat:
        from collections import deque
        q = deque()
        for i in np.flatnonzero(valley):
            cid[i] = seg[i]
            q.append(i)
        while q:
            i = q.popleft()
            for j in nbrs[i]:
                if cid[j] < 0 and not water[j]:
                    cid[j] = cid[i]
                    q.append(j)
    else:
        nxt_id = segments
        for i in order_down[::-1]:  # downstream first
            if water[i]:
                continue
            if valley[i]:
                cid[i] = seg[i]
            elif recv[i] >= 0 and not water[recv[i]] and cid[recv[i]] >= 0:
                cid[i] = cid[recv[i]]
            else:
                cid[i] = nxt_id  # drains straight to an outlet: its own small catchment
                nxt_id += 1
    grid["catchment_id"] = cid

    # The catchment each catchment drains into (its outlet cell's receiver), and each one's
    # whole upstream basin (itself and everything draining into it).
    carea, down = {}, {}
    for i in range(n):
        if cid[i] >= 0:
            carea[cid[i]] = carea.get(cid[i], 0.0) + area[i]
    for i in order_down[::-1]:
        r = recv[i]
        if cid[i] >= 0 and r >= 0 and cid[r] >= 0 and cid[r] != cid[i]:
            down.setdefault(cid[i], cid[r])

    def chain(c):  # c and every catchment below it
        out, seen = [c], {c}
        while c in down and down[c] not in seen:
            c = down[c]
            out.append(c)
            seen.add(c)
        return out
    below = {c: set(chain(c)) for c in carea}
    basin = dict(carea)
    for c in carea:
        for d in chain(c)[1:]:
            basin[d] += carea[c]

    # Ridges: edges between land cells in catchments where neither drains into the other
    # (an edge between a stream's upper and lower reach crosses the valley; it is no divide).
    pairs = {}
    rc = list(zip(grid["row"], grid["col"]))
    for i in range(n):
        for j in nbrs[i]:
            a, b = cid[i], cid[j]
            if j <= i or a < 0 or b < 0 or a == b or a in below[b] or b in below[a]:
                continue
            pairs.setdefault((min(a, b), max(a, b)), []).append((i, j))
    ridges, strength_cell = [], np.zeros(n)
    head = acc <= area * 2.0  # headwater cells: at most one cell's worth drains into them
    for rid, (key, edges) in enumerate(sorted(pairs.items(), key=lambda kv: kv[0])):
        strength = round(min(basin[key[0]], basin[key[1]]), 2)
        consistency = round(sum(1 for i, j in edges if head[i] or head[j]) / len(edges), 2)
        ridges.append({"id": rid, "catchments": [int(key[0]), int(key[1])], "strength_ha": strength,
                       "consistency": consistency,
                       "edges": [[int(rc[i][0]), int(rc[i][1]), int(rc[j][0]), int(rc[j][1])] for i, j in edges]})
        for i, j in edges:
            strength_cell[i] = max(strength_cell[i], strength)
            strength_cell[j] = max(strength_cell[j], strength)
    grid["ridge"] = strength_cell.round(2)

    summary = {
        "relief": rel,
        "valley_ha": site.valley_ha, "burn_m": BURN_M, "valley_buffer_m": VALLEY_BUFFER_M,
        "buffers_provisional": True,
        "mapped_channel_cells": int(channel.sum()),
        "valley_cells": int(valley.sum()), "max_order": int(order[valley].max()) if valley.any() else 0,
        "catchments": int(len(carea)),
        "ridges": ridges,
        "ridge_min_ha": RIDGE_MIN_HA, "ridge_min_consistency": RIDGE_MIN_CONSISTENCY,
    }
    return grid, summary


def save(site: Site, summary: dict):
    site.layers.mkdir(parents=True, exist_ok=True)
    (site.layers / "landform.json").write_text(json.dumps(summary), encoding="utf-8")


def load(site: Site) -> dict | None:
    p = site.layers / "landform.json"
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else None


def describe(summary: dict) -> str:
    r = summary["relief"]
    strong = [x for x in summary["ridges"] if x["strength_ha"] >= RIDGE_MIN_HA and x["consistency"] >= RIDGE_MIN_CONSISTENCY]
    return (f"  landform: {r['class']} ({r['confidence']} confidence; relief {r['relief_m']} m, median slope "
            f"{r['median_slope'] * 100:.2f}%, {r['source']}); {summary['valley_cells']} valley cells "
            f"(max order {summary['max_order']}, {summary['mapped_channel_cells']} on mapped channels); "
            f"{summary['catchments']} catchments; {len(strong)} strong ridges of {len(summary['ridges'])}")
