"""Flow lines on the terrain's own pixels, over the site's whole upstream catchment.

The way a GIS flow tool does it (GRASS r.watershed, SAGA channel network, TauDEM): on the
elevation raster (FABDEM bare earth, 30 m), over a window well beyond the site, so water that
gathers on hills outside the site arrives with its true upstream area:

  1. burn the mapped channels (Overture water lines, from OSM) BURN_M into the ground
  2. fill depressions from the window's edge (priority-flood), remembering how deep each
     depression was (`sink_m`: where water would stand; ponds and tanks show here when the
     terrain resolves them)
  3. each pixel drains to its steepest lower neighbour of eight on the filled surface; on
     flats, away from higher ground and towards the flat's outlets (Barnes et al. 2014)
  4. upstream area accumulated down the receivers
  5. a stream wherever at least `valley_ha` drains (site.yaml), with Strahler order; segments
     run from a head or confluence to the next confluence, as lines in the site's CRS

Flat land is kept, not dropped: a segment whose ground falls less than FALL_MIN_M over the
next REACH_M of flow (the terrain model's own error) is marked low confidence: there the line follows differences
smaller than the model can resolve, and may not be where water runs on the ground.

pc/landform.py reads these lines for the cells' valley orders; the export carries them as
lines for the map.
"""

import heapq
import math

import geopandas as gpd
import numpy as np
import rasterio
from shapely.geometry import LineString, box

from pc.site import Site

CATCHMENT_M = 5000.0    # window beyond the site's box (site.yaml `catchment_m`)
BURN_M = 3.0            # mapped channels are lowered this much before filling
REACH_M = 1000.0        # fall is measured over this much flow path from a segment's start
FALL_MIN_M = 1.0        # a line falling less than this over REACH_M: low confidence (about FABDEM's
                        # vertical error on open land, Hawker et al. 2022)
SINK_MIN_M = 0.3        # depressions shallower than this are terrain noise
D8 = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]


def window(site: Site) -> tuple:
    """The site's box grown by the catchment margin, in degrees."""
    w, s, e, n = site.bbox
    m = getattr(site, "catchment_m", CATCHMENT_M)
    dlat = m / 111_320.0
    dlon = m / (111_320.0 * math.cos(math.radians((s + n) / 2)))
    return (w - dlon, s - dlat, e + dlon, n + dlat)


def catchment_path(site: Site):
    return site.raw / "terrain-catchment.tif"


def fetch(site: Site, tries: int = 4) -> str:
    """The terrain over the catchment window: FABDEM bare earth, else the Copernicus surface
    model. Returns the source."""
    import time

    from pc import fetch as F
    out = catchment_path(site)
    out.parent.mkdir(parents=True, exist_ok=True)
    win = window(site)
    try:
        import fabdem
        for attempt in range(tries):
            try:
                fabdem.download(win, str(out), show_progress=False)
                return "fabdem"
            except Exception:  # FABDEM's host drops connections now and then
                if attempt < tries - 1:
                    time.sleep(15 * 2 ** attempt)
    except ImportError:
        pass
    base = "https://copernicus-dem-30m.s3.amazonaws.com"
    urls = []
    for lat, lon in F._tiles(win):
        name = f"Copernicus_DSM_COG_10_{F._ns(lat)}_00_{F._ew(lon)}_00_DEM"
        urls.append(f"{base}/{name}/{name}.tif")
    F._clip(urls, win, out)
    return "copernicus-surface"


def fill(z: np.ndarray, outlet: np.ndarray) -> np.ndarray:
    """Priority-flood from the outlets (Barnes et al. 2014): every depression filled to its
    spill height, exactly level (flats are resolved afterwards, `flats`)."""
    ny, nx = z.shape
    filled = np.full(z.shape, np.inf)
    heap = []
    for i, j in zip(*np.nonzero(outlet)):
        filled[i, j] = z[i, j]
        heap.append((float(z[i, j]), int(i), int(j)))
    heapq.heapify(heap)
    while heap:
        h, i, j = heapq.heappop(heap)
        for di, dj in D8:
            a, b = i + di, j + dj
            if 0 <= a < ny and 0 <= b < nx and filled[a, b] == np.inf:
                filled[a, b] = max(z[a, b], h)
                heapq.heappush(heap, (filled[a, b], a, b))
    return filled


def receivers(filled: np.ndarray, dx: float, dy: float, outlet: np.ndarray) -> np.ndarray:
    """Each pixel's steepest lower neighbour (flat index); -1 at outlets and on flats (no lower
    neighbour), which `flats` then resolves."""
    ny, nx = filled.shape
    pad = np.pad(filled, 1, constant_values=np.inf)
    best = np.zeros(filled.shape)
    rec = np.full(filled.shape, -1, dtype=np.int64)
    rows, cols = np.mgrid[0:ny, 0:nx]
    for di, dj in D8:
        nb = pad[1 + di:1 + di + ny, 1 + dj:1 + dj + nx]
        drop = (filled - nb) / math.hypot(di * dy, dj * dx)
        better = drop > best
        best[better] = drop[better]
        rec[better] = ((rows + di) * nx + (cols + dj))[better]
    rec[outlet] = -1
    return rec.ravel()


def flats(filled: np.ndarray, rec: np.ndarray, outlet: np.ndarray) -> int:
    """Drainage across flats, in place on `rec` (Barnes, Lehman and Mulla 2014, "An efficient
    assignment of drainage direction over flat surfaces"): on each flat, flow runs away from
    higher ground and towards the flat's outlets, so lines on a plain follow its shape instead
    of running straight at the spill point. Returns the number of flat pixels resolved."""
    from collections import deque
    ny, nx = filled.shape
    F = filled.ravel()
    out = outlet.ravel()
    n = F.size

    def nbrs(p):
        i, j = divmod(p, nx)
        for di, dj in D8:
            a, b = i + di, j + dj
            if 0 <= a < ny and 0 <= b < nx:
                yield a * nx + b

    flat = (rec < 0) & ~out
    if not flat.any():
        return 0
    low, high = deque(), deque()
    for p in np.flatnonzero(flat):
        for q in nbrs(p):
            if F[q] > F[p] and p not in high:
                high.append(p)
                break
    seen_low = set()
    for p in np.flatnonzero(flat):
        for q in nbrs(p):  # a low edge: drains already, beside a flat pixel of its height
            if not flat[q] and F[q] == F[p] and q not in seen_low and (rec[q] >= 0 or out[q]):
                seen_low.add(q)
                low.append(q)
    high = deque(dict.fromkeys(high))
    # label each flat from its low edges
    label = np.zeros(n, dtype=np.int64)
    k = 0
    for s in low:
        if label[s]:
            continue
        k += 1
        label[s] = k
        q = deque([s])
        while q:
            p = q.popleft()
            for r in nbrs(p):
                if not label[r] and F[r] == F[p] and flat[r]:
                    label[r] = k
                    q.append(r)
    # distance from higher ground (within each flat), and from the low edges
    def bfs(starts):
        d = np.full(n, -1, dtype=np.int64)
        q = deque()
        for s in starts:
            if label[s]:
                d[s] = 0
                q.append(s)
        while q:
            p = q.popleft()
            for r in nbrs(p):
                if d[r] < 0 and flat[r] and label[r] == label[p]:
                    d[r] = d[p] + 1
                    q.append(r)
        return d
    away = bfs(high)      # steps from higher ground
    toward = bfs(low)     # steps from the flat's outlets
    top = np.zeros(k + 1, dtype=np.int64)
    np.maximum.at(top, label[away >= 0], away[away >= 0])
    # mask: lower is nearer the outlets and farther from higher ground (Barnes' 2 x toward + ...)
    mask = np.where(toward >= 0, 2 * toward, 0) + np.where(away >= 0, top[label] - away, 0)
    resolved = 0
    for p in np.flatnonzero(flat & (label > 0)):
        best, to = None, -1
        for r in nbrs(p):
            if label[r] != label[p]:
                continue
            m = mask[r] if flat[r] else -1   # a low edge beats any flat pixel
            if m < mask[p] and (best is None or m < best):
                best, to = m, r
        if to >= 0:
            rec[p] = to
            resolved += 1
    return resolved


def accumulate(rec: np.ndarray, px_ha: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Upstream area (ha) per pixel, and the pixels upstream first (topological order of the
    receivers, so ties on flats are handled)."""
    from collections import deque
    n = rec.size
    donors = np.zeros(n, dtype=np.int64)
    np.add.at(donors, rec[rec >= 0], 1)
    acc = px_ha.ravel().astype(float).copy()
    q = deque(np.flatnonzero(donors == 0).tolist())
    order = []
    while q:
        p = q.popleft()
        order.append(p)
        r = rec[p]
        if r >= 0:
            acc[r] += acc[p]
            donors[r] -= 1
            if donors[r] == 0:
                q.append(r)
    return acc, np.array(order, dtype=np.int64)


def strahler(stream: np.ndarray, rec: np.ndarray, order: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Strahler order per stream pixel, and how many stream pixels drain into each."""
    n = stream.size
    so = np.zeros(n, dtype=np.int32)
    top = np.zeros(n, dtype=np.int32)    # highest order arriving
    ties = np.zeros(n, dtype=np.int32)   # how many arrive at that order
    n_up = np.zeros(n, dtype=np.int32)
    for p in order:
        if not stream[p]:
            continue
        so[p] = 1 if n_up[p] == 0 else top[p] + (1 if ties[p] >= 2 else 0)
        r = rec[p]
        if r >= 0 and stream[r]:
            n_up[r] += 1
            if so[p] > top[r]:
                top[r], ties[r] = so[p], 1
            elif so[p] == top[r]:
                ties[r] += 1
    return so, n_up


def _chaikin(xy: np.ndarray, rounds: int = 2) -> np.ndarray:
    """Corner cutting, ends kept: takes the stair steps out of a pixel path."""
    for _ in range(rounds):
        if len(xy) < 3:
            return xy
        q = 0.75 * xy[:-1] + 0.25 * xy[1:]
        r = 0.25 * xy[:-1] + 0.75 * xy[1:]
        mid = np.empty((2 * (len(xy) - 1), 2))
        mid[0::2], mid[1::2] = q, r
        xy = np.vstack([xy[:1], mid[1:-1], xy[-1:]])
    return xy


def analyse(site: Site, valley_ha: float | None = None) -> dict:
    """Flow over the catchment window. Returns the lines (GeoDataFrame in the site's CRS, with
    order, upstream area, fall and confidence) and the rasters other steps sample."""
    valley_ha = site.valley_ha if valley_ha is None else valley_ha
    with rasterio.open(catchment_path(site)) as src:
        z = src.read(1).astype(float)
        tf, crs, nodata = src.transform, src.crs, src.nodata
    ny, nx = z.shape
    bad = ~np.isfinite(z) | ((z == nodata) if nodata is not None else False) | (z < -100)
    z[bad] = np.nan
    # pixel size in metres (degrees on the ground at this latitude)
    lat0 = tf.f + tf.e * ny / 2
    dy = abs(tf.e) * 111_320.0
    dx = abs(tf.a) * 111_320.0 * math.cos(math.radians(lat0))
    px_ha = np.full(z.shape, dx * dy / 1e4)

    # mapped channels, burned in
    burn = np.zeros(z.shape, dtype=bool)
    p = site.overture("water")
    if p.exists():
        from rasterio.features import rasterize
        from pc.landform import CHANNEL_CLASSES
        w = gpd.read_parquet(p)
        lines = w[w.geom_type.str.contains("Line") & w["class"].isin(CHANNEL_CLASSES)]
        if not lines.empty:
            burn = rasterize(((g, 1) for g in lines.to_crs(crs).geometry), out_shape=z.shape, transform=tf,
                             fill=0, all_touched=True, dtype="uint8").astype(bool)
    ground = np.where(burn, z - BURN_M, z)
    edge = np.zeros(z.shape, dtype=bool)
    edge[0, :] = edge[-1, :] = edge[:, 0] = edge[:, -1] = True
    outlet = edge | bad | (ground <= 0)
    ground = np.where(bad, np.nanmin(np.where(bad, np.inf, ground)) - 1, ground)

    filled = fill(ground, outlet)
    sink = np.where(bad, 0.0, filled - ground)
    rec = receivers(filled, dx, dy, outlet)
    n_flat = flats(filled, rec, outlet)
    acc, order = accumulate(rec, px_ha)
    stream = acc >= valley_ha
    so, n_up = strahler(stream, rec, order)

    # segments: from each head or confluence, down to the next confluence (included)
    xs = tf.c + (np.arange(nx) + 0.5) * tf.a
    ys = tf.f + (np.arange(ny) + 0.5) * tf.e
    starts = [p for p in order if stream[p] and n_up[p] != 1]
    segs = []
    for p in starts:
        path = [p]
        q = rec[p]
        while q >= 0 and stream[q]:
            path.append(q)
            if n_up[q] >= 2:
                break
            q = rec[q]
        if len(path) < 2:
            continue
        rr, cc = np.divmod(np.array(path), nx)
        # fall over the next REACH_M of flow from the segment's start (a short segment between
        # two confluences says little on its own)
        reach, q, run = [p], rec[p], 0.0
        while q >= 0 and run < REACH_M:
            a0, b0 = divmod(reach[-1], nx)
            a1, b1 = divmod(q, nx)
            run += math.hypot((a1 - a0) * dy, (b1 - b0) * dx)
            reach.append(q)
            q = rec[q]
        zz = z.ravel()[reach]
        # its order is its own, not the confluence's it ends at
        own = path[:-1] if n_up[path[-1]] >= 2 else path
        segs.append({"xy": np.column_stack([xs[cc], ys[rr]]), "order": int(so[own].max()),
                     "upstream_ha": round(float(acc[path[-1]]), 1),
                     "mapped": bool(burn.ravel()[path].mean() >= 0.5),
                     "fall_m": float(np.nanmax(zz) - np.nanmin(zz)) if np.isfinite(zz).any() else 0.0})
    g = gpd.GeoDataFrame({k: [s[k] for s in segs] for k in ("order", "upstream_ha", "mapped", "fall_m")},
                         geometry=[LineString(s["xy"]) for s in segs], crs=crs).to_crs(site.crs)
    # smooth in metres, then keep what reaches the site's box (with its context margin)
    g["geometry"] = [LineString(_chaikin(np.asarray(l.coords))) for l in g.geometry]
    g["slope"] = (g["fall_m"] / REACH_M).round(4)
    g["confidence"] = np.where(g["mapped"], "mapped", np.where(g["fall_m"] < FALL_MIN_M, "low", "high"))
    site_box = gpd.GeoSeries([box(*site.bbox)], crs=4326).to_crs(site.crs).iloc[0]
    g = g[g.intersects(site_box)].reset_index(drop=True)
    return {"lines": g, "acc": acc.reshape(z.shape), "sink": sink, "order": so.reshape(z.shape),
            "transform": tf, "crs": crs, "valley_ha": valley_ha,
            "summary": {"window": [round(v, 5) for v in window(site)], "catchment_m": site.catchment_m, "pixels": int(z.size),
                        "pixel_m": [round(dx, 1), round(dy, 1)], "flat_pixels": int(n_flat), "segments": int(len(g)),
                        "low_confidence": int((g["confidence"] == "low").sum()),
                        "max_upstream_ha": round(float(g["upstream_ha"].max()), 1) if len(g) else 0.0,
                        "edge_inflow": _edge_inflow(acc.reshape(z.shape), stream.reshape(z.shape))}}


def _edge_inflow(acc: np.ndarray, stream: np.ndarray) -> float:
    """The most area draining off the window's edge: if a big stream leaves through the edge
    the window held its catchment; this is reported, so a cut-off upstream can be seen."""
    e = np.concatenate([acc[0], acc[-1], acc[:, 0], acc[:, -1]])
    return round(float(e.max()), 1)


def onto_cells(grid: gpd.GeoDataFrame, h: dict) -> dict:
    """Per cell: the highest stream order of the lines crossing it, the most upstream area of
    its pixels, and its deepest depression."""
    n = len(grid)
    order = np.zeros(n, dtype=int)
    lines = h["lines"]
    if len(lines):
        hit = gpd.sjoin(grid[["geometry"]], lines[["geometry", "order"]], predicate="intersects")
        best = hit.groupby(level=0)["order"].max()
        order[grid.index.get_indexer(best.index)] = best.to_numpy()
    tf = h["transform"]
    pts = grid.to_crs(h["crs"])
    acc = np.zeros(n)
    sink = np.zeros(n)
    from rasterio.features import rasterize
    ids = rasterize(zip(pts.geometry, range(1, n + 1)), out_shape=h["acc"].shape, transform=tf, fill=0,
                    all_touched=True, dtype="int32").ravel()
    m = ids > 0
    np.maximum.at(acc, ids[m] - 1, h["acc"].ravel()[m])
    np.maximum.at(sink, ids[m] - 1, h["sink"].ravel()[m])
    return {"order": order, "acc_ha": acc, "sink_m": sink}
