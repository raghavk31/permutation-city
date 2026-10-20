"""McHarg layers. Each layer adds columns to the cell grid (hex or quad, pc/grid.py).

    elev        surface height (m above sea level), includes buildings
    ground      bare-earth height (m above sea level)
    bldg_h      approximate building height (m) = surface - bare earth
    built       share of the cell covered by building footprints
    trees, green, bare, wl_built, wl_water, mangrove   land-cover shares (ESA WorldCover)
    water       the cell is water (sea, river, pond, dock)
    sea         the cell is sea (coastal flooding starts here)
    edge_dist   distance to the nearest water edge (m)
    flood_*     coastal flood depth (m), one column per sea level in site.yaml
    pool        rainwater pooling depth (m): water that would sit in hollows
    upstream    how many cells drain through this one (drainage lines)
    catchment_ha  the area that drains through this cell (ha): `upstream` in hectares, so
                rules mean the same on any grid and cell size
    industrial  on industrial or rail land (a stand-in for contaminated land)
    in_design   inside the site's design area (everywhere, if none is given)
    flow_acc_ha, mapped_channel, valley_order, valley_buffer, catchment_id, ridge
                landform: valleys, catchments and ridges (pc/landform.py)
    lst         hot-season land surface temperature, °C (pc/lst.py), when fetched

With a boundary polygon (site.yaml), layers are worked out on the polygon plus a context
margin, then cropped to the polygon.
"""

import heapq
from collections import deque

import geopandas as gpd
import numpy as np
import pandas as pd
import rasterio
from rasterio.features import rasterize
from rasterio.windows import from_bounds

from pc import grid as cellgrid
from pc import landform, lst
from pc.site import Site, read_polygon


def _overture(site: Site, theme: str) -> gpd.GeoDataFrame:
    path = site.overture(theme)
    if not path.exists():  # no features of this theme in the box (or not fetched)
        print(f"  (no Overture {theme} for this site)")
        return gpd.GeoDataFrame({"subtype": [], "class": []}, geometry=[], crs=site.crs)
    g = gpd.read_parquet(path).to_crs(site.crs)
    return g[~g.geometry.is_empty]


def _polygons(g):
    return g[g.geom_type.isin(["Polygon", "MultiPolygon"])]


def _sample(path, grid):
    with rasterio.open(path) as src:
        pts = grid.centroid.to_crs(src.crs)
        return np.array([v[0] for v in src.sample(zip(pts.x, pts.y))], dtype=float)


def _covers(grid, shapes) -> np.ndarray:
    """Whether each cell centre falls inside any of the shapes."""
    if shapes.empty:
        return np.zeros(len(grid), dtype=bool)
    pts = gpd.GeoDataFrame(geometry=grid.centroid, crs=grid.crs)
    hit = gpd.sjoin(pts, shapes[["geometry"]], predicate="within").index
    return grid.index.isin(hit)


# --- ground, cover, buildings -------------------------------------------------------

def add_ground(site, grid):
    grid["elev"] = _sample(site.dem, grid).round(1)
    grid["ground"] = _sample(site.terrain, grid).round(1)
    grid["bldg_h"] = (grid["elev"] - grid["ground"]).clip(lower=0).round(1)
    return grid


WORLDCOVER = {10: "trees", 20: "green", 30: "green", 40: "green", 50: "wl_built",
              60: "bare", 80: "wl_water", 90: "green", 95: "mangrove"}


def add_landcover(site, grid):
    """Share of each cell in each land-cover class, from 10 m pixels."""
    with rasterio.open(site.landcover) as src:
        cells = grid.to_crs(src.crs)
        win = from_bounds(*cells.total_bounds, src.transform).round_offsets().round_lengths()
        lc = src.read(1, window=win)
        tf = src.window_transform(win)
    ids = rasterize(zip(cells.geometry, range(1, len(cells) + 1)), out_shape=lc.shape,
                    transform=tf, fill=0, dtype="int32")
    m = ids > 0
    table = pd.crosstab(ids[m] - 1, pd.Series(lc[m]).map(WORLDCOVER).fillna("other").values,
                        normalize="index")
    table = table.reindex(index=range(len(grid)), columns=sorted(set(WORLDCOVER.values())),
                          fill_value=0)
    for col in table.columns:
        grid[col] = table[col].round(2).values
    return grid


def add_water(site, grid):
    """Water from Overture polygons or WorldCover; sea = ocean polygon or sea-level ground."""
    water = _polygons(_overture(site, "water"))
    ocean = water[water["subtype"].isin(["ocean", "sea"])]
    in_water = _covers(grid, water)
    grid["water"] = in_water | (grid["wl_water"] >= 0.5)
    grid["sea"] = grid["water"] & (_covers(grid, ocean) | (grid["elev"] <= 0.5))
    grid.loc[grid["water"], "ground"] = grid.loc[grid["water"], "ground"].clip(upper=0)
    return grid


def add_buildings(site, grid):
    b = _polygons(_overture(site, "building"))
    pieces = gpd.overlay(grid.reset_index()[["cell", "geometry"]], b[["geometry"]],
                         how="intersection")
    covered = pieces.dissolve(by="cell").area
    grid["built"] = (covered / grid.area).reindex(grid.index).fillna(0).clip(0, 1).round(2)
    return grid


def add_edge_distance(site, grid):
    """Metres from each cell centre to the nearest land-water edge."""
    if not grid["water"].any():
        grid["edge_dist"] = 1e6
        return grid
    edge = grid[grid["water"]].union_all().boundary
    grid["edge_dist"] = grid.centroid.distance(edge).round(0)
    grid.loc[grid["water"], "edge_dist"] = 0
    return grid


def add_industrial(site, grid):
    lu = _polygons(_overture(site, "land_use"))
    heavy = lu[lu["class"].isin(["industrial", "railway", "port", "harbour", "quarry",
                                 "landfill", "brownfield"])]
    hit = gpd.sjoin(grid[["geometry"]], heavy[["geometry"]], predicate="intersects").index
    grid["industrial"] = grid.index.isin(hit)
    return grid


def add_design_area(site, grid):
    if site.design_area and site.design_area.exists():
        area = gpd.read_file(site.design_area).to_crs(grid.crs)
        grid["in_design"] = _covers(grid, area)
    else:
        grid["in_design"] = True
    return grid


# --- water movement -----------------------------------------------------------------

def add_flood(site, grid, nbrs):
    """'Connected bathtub': land floods if it is below the sea level AND the sea can
    reach it through other cells that are also below that level."""
    ground = grid["ground"].to_numpy()
    land = ~grid["water"].to_numpy()
    for name, level in site.sea_levels.items():
        wet = grid["sea"].to_numpy().copy()
        queue = deque(np.flatnonzero(wet))
        while queue:
            i = queue.popleft()
            for j in nbrs[i]:
                if not wet[j] and ground[j] < level:
                    wet[j] = True
                    queue.append(j)
        grid[f"flood_{name}"] = np.where(wet & land, level - ground, 0.0).round(2)
    return grid


def add_drainage(site, grid, nbrs, degree):
    """Rainwater pooling and drainage lines.

    1. 'Fill' the ground from the outlets (water + site edge) upwards, so every hollow
       fills until it spills (priority-flood). pool = filled level - ground.
    2. Each cell drains to its lowest neighbour; count how many cells drain through it.

    Cells with fewer neighbours than the grid's `degree` sit on the edge and are outlets.
    Neighbours share an edge (no diagonals on quad), so every step is one spacing long and
    the lowest neighbour is also the steepest.
    """
    ground = grid["ground"].to_numpy()
    n = len(grid)
    outlet = grid["water"].to_numpy() | np.array([len(nb) < degree for nb in nbrs])

    filled = np.full(n, np.inf)
    heap = [(ground[i], i) for i in np.flatnonzero(outlet)]
    for h, i in heap:
        filled[i] = h
    heapq.heapify(heap)
    eps = 1e-4  # tiny slope so flat filled areas still drain somewhere
    while heap:
        h, i = heapq.heappop(heap)
        for j in nbrs[i]:
            if filled[j] == np.inf:
                filled[j] = max(ground[j], h + eps)
                heapq.heappush(heap, (filled[j], j))
    grid["pool"] = np.where(outlet, 0, filled - ground).clip(0).round(2)

    upstream = np.ones(n)
    for i in np.argsort(-filled):  # highest first pass their count downhill
        if outlet[i]:
            continue
        j = min(nbrs[i], key=lambda k: filled[k])
        if filled[j] < filled[i]:
            upstream[j] += upstream[i]
    grid["upstream"] = upstream.astype(int)
    grid["catchment_ha"] = (upstream * grid.area.to_numpy() / 1e4).round(2)
    return grid


def crop_to_boundary(site: Site, grid):
    """Keep the cells whose centre is inside the site's boundary polygon. The layers were
    worked out on the polygon plus its context margin, so edges stay correct."""
    if not site.boundary:
        return grid
    poly = gpd.GeoDataFrame(geometry=[read_polygon(site.boundary)], crs=4326).to_crs(grid.crs)
    inside = _covers(grid, poly)
    out = grid[inside].reset_index(drop=True)
    out.index.name = "cell"
    return out


def build(site: Site) -> gpd.GeoDataFrame:
    graph = cellgrid.for_site(site)
    grid = graph.cover(cellgrid.boundary(site).geometry.iloc[0], site.crs)
    nbrs = graph.neighbours(grid)
    for step in (add_ground, add_landcover, add_water, add_buildings, add_edge_distance,
                 add_industrial, add_design_area):
        grid = step(site, grid)
    grid = add_flood(site, grid, nbrs)
    grid = add_drainage(site, grid, nbrs, graph.degree)
    grid, summary = landform.analyse(site, grid, nbrs, graph)
    landform.save(site, summary)
    grid = lst.add_lst(site, grid)
    return crop_to_boundary(site, grid)


def summary(site: Site, grid) -> str:
    land = grid[~grid["water"]]
    ha = lambda m: land.loc[m].area.sum() / 1e4
    lines = [f"{site.name}: {len(grid):,} cells, {len(land):,} on land ({ha(land.index == land.index):.0f} ha)",
             f"  ground {land.ground.min():.1f} to {land.ground.max():.1f} m, median {land.ground.median():.1f} m",
             f"  buildings cover {land.built.mean():.0%}; trees {land.trees.mean():.0%}, "
             f"other green {land.green.mean():.0%}"]
    for name, level in site.sea_levels.items():
        f = land[f"flood_{name}"]
        lines.append(f"  flood at +{level} m ({name}): {ha(f > 0):.0f} ha, max {f.max():.1f} m")
    lines += [f"  rain pooling (>0.2 m): {ha(land.pool > 0.2):.0f} ha",
              f"  industrial / rail land: {ha(land.industrial):.0f} ha",
              f"  in design area: {ha(land.in_design):.0f} ha"]
    summary = landform.load(site)
    if summary:
        lines.append(landform.describe(summary))
    if "lst" in land:
        lines.append(f"  land surface temperature (hot season): {land.lst.min():.1f} to {land.lst.max():.1f} °C")
    return "\n".join(lines)
