"""The genome, and how a design grows from it.

A genome is a list of numbers between 0 and 1 (so crossover and mutation stay simple).
The body plan, read in order:

    8 attractor slots, 5 genes each:
        x, y      position across the design ground
        radius    reach, 4% to 30% of the design ground's diagonal (scales with the site)
        weight    strength
        kind      core (pulls building density) / green (pulls open space) /
                  water (pulls storage)
    7 site-wide genes:
        water_share   share of design ground given to water and wetland (5-30%)
        green_share   share given to landscape (10-45%)
        follow_water  how much water follows the site's own drainage and flood lines
        coverage      ground coverage of building cells (35-80%, within the permeable rule)
        peak          how sharply heights rise towards cores (spread out ... towers)
        intensity     overall height (low-rise ... up to each cell's height cap)
        base          background density away from the cores (0-60% of the peak)

Positions and reach are relative to the design ground, so a genome can be regrown on
any site.

Growth (Sem 06 attractor fields + Eco-machine streams as attractors):
    1. each attractor spreads a field that fades with distance
    2. water claims its share first, on the cells scoring highest for water
    3. green claims its share next
    4. the rest is building, with heights falling off from the cores
    Every step respects the rules: allowed uses, height cap, permeable minimum.

Nothing here assumes a cell shape: neighbours come from the grid (pc/grid.py), and the
smoothing is set in metres and turned into neighbour steps for the grid in use.
"""

from dataclasses import dataclass, field

import geopandas as gpd
import numpy as np

from pc.grid import CellGraph, passes

N_ATTRACTORS = 8
ATTRACTOR_GENES = 5
# The four street genes come last (genome version 2, Phase 6b), so the first 47 numbers of a
# genome mean what they always did. A 47-number genome is a "pre-street genome": it grows with
# the default street genes.
GLOBAL_GENES = ["water_share", "green_share", "follow_water", "coverage", "peak", "intensity",
                "base", "street_spacing", "street_orientation", "street_pattern", "street_hierarchy"]
STREET_GENES = 4
LENGTH = N_ATTRACTORS * ATTRACTOR_GENES + len(GLOBAL_GENES)
PRE_STREET_LENGTH = LENGTH - STREET_GENES
GENOME_VERSION = 2
STREET_GENE_DEFAULT = 0.5  # what a pre-street genome's street genes are read as
KINDS = ["core", "green", "water"]
USES = ["building", "landscape", "water"]

# How far the smoothing reaches, in metres. On 20 m hexes (35 m between centres) these are
# the original 3 passes and 1 pass.
SITE_WATER_REACH_M = 100.0   # the site's own water gathers into bodies
WATER_FIELD_REACH_M = 35.0   # the water attractors' field

# How each gene (0..1) is read: the run config's gene ranges. A brief may narrow or move
# these; it never adds genes. Attractor radius is a share of the design ground's diagonal.
RANGES = {
    "radius": (0.04, 0.30),
    "weight": (0.2, 1.0),
    "water_share": (0.05, 0.30),
    "green_share": (0.10, 0.45),
    "follow_water": (0.0, 1.0),
    "coverage": (0.35, 0.90),   # widened in Phase 6b: streets take part of each cell
    "peak": (0.5, 3.0),         # exponent on the core field
    "intensity": (0.25, 1.0),
    "base": (0.0, 0.6),
    "street_spacing": (70, 180),     # metres between secondary streets
    "street_orientation": (0, 1),    # 0..1/3 contours, 1/3..2/3 parallel to the valleys, 2/3..1 a bearing
    "street_pattern": (0, 1),        # 0..1/3 grid, 1/3..2/3 loops, 2/3..1 branching (dead ends)
    "street_hierarchy": (0, 1),      # narrow to wide secondary streets and lanes
}


@dataclass
class Attractor:
    x: float
    y: float
    radius: float
    weight: float
    kind: str


@dataclass
class Ground:
    """A site's design ground, prepared once and shared by every genome."""
    cells: gpd.GeoDataFrame
    xy: np.ndarray
    area: np.ndarray
    nbr: np.ndarray          # (n, degree) neighbour positions, -1 where there is none
    can_build: np.ndarray
    can_green: np.ndarray
    can_water: np.ndarray
    cap: np.ndarray          # height cap (levels)
    min_perm: np.ndarray     # minimum permeable share
    trees: np.ndarray
    site_water: np.ndarray   # the site's own water: hollows, drainage, flooding (smoothed)
    spacing: float           # metres between neighbouring cell centres (pc.grid)
    bounds: tuple
    origin: tuple = (0.0, 0.0)  # where local (0, 0) sits in map coordinates (see pc.export)
    graph: CellGraph | None = None  # the cell grid (shape, spacing), for the form metrics
    roads: list | None = None       # existing major roads in the same frame as xy (pc.metrics)
    activities: dict | None = None  # shops, schools, transit: points in the same frame (pc.metrics)
    # Landform (pc/landform.py; export format 4): per cell, and the street skeleton (pc/skeleton.py)
    z: np.ndarray | None = None       # ground height (m)
    valley: np.ndarray | None = None  # valley order (0: none)
    vbuf: np.ndarray | None = None    # 1: valley channel or its buffer
    down: np.ndarray | None = None    # the design cell it drains to (-1: off the design ground)
    lst: np.ndarray | None = None     # hot-season land surface temperature (°C; NaN: none)
    ridge: np.ndarray | None = None   # strength of the strongest divide on its edges (ha)
    skeleton: dict | None = None
    relief_class: str | None = None   # pronounced, gentle or flat (pc.landform); flat if unknown


@dataclass
class Design:
    genome: np.ndarray
    use: np.ndarray
    levels: np.ndarray
    coverage: np.ndarray
    floor_area: np.ndarray      # net: after streets
    attractors: list
    settings: dict
    scores: dict = field(default_factory=dict)
    gross_floor_area: float = 0.0   # m², as if streets took nothing (what streets cost: gross - net)
    street: list | None = None      # per side (pc.streets): 0 none, 1 lane, 2 secondary, 3 primary
    street_widths: list | None = None
    pre_street: bool = False        # grown from a 47-gene genome, with default street genes


def _lerp(g, lo, hi):
    return lo + g * (hi - lo)


def _norm(v):
    top = v.max() if len(v) else 0
    return v / top if top > 0 else v


def smooth(v, nbr, passes=2):
    """Average each cell with its neighbours, a few times over."""
    has = nbr >= 0
    for _ in range(passes):
        vals = np.where(has, v[np.where(has, nbr, 0)], 0.0)
        v = (v + vals.sum(axis=1)) / (1 + has.sum(axis=1))
    return v


def prepare(suit: gpd.GeoDataFrame, graph: CellGraph) -> Ground:
    cells = suit[(~suit["water"]) & suit["state"].isin(["constrained", "open"])].reset_index(drop=True)
    nbr = graph.padded(graph.neighbours(cells))
    uses = cells["uses"]
    floods = cells.filter(like="flood_")
    flood = floods.max(axis=1).to_numpy() if floods.shape[1] else np.zeros(len(cells))
    raw_water = (_norm(cells["pool"].to_numpy()) + _norm(np.log1p(cells["upstream"].to_numpy()))
                 + _norm(flood))
    c = cells.centroid
    return Ground(
        cells=cells, xy=np.column_stack([c.x, c.y]), area=cells.area.to_numpy(), nbr=nbr,
        can_build=uses.str.contains("building").to_numpy(),
        can_green=uses.str.contains("landscape").to_numpy(),
        can_water=(uses.str.contains("water") | uses.str.contains("wetland")).to_numpy(),
        cap=cells["max_levels"].to_numpy(), min_perm=cells["min_permeable"].to_numpy(),
        trees=cells["trees"].to_numpy(),
        # Smoothed, so water gathers into bodies instead of one-cell drainage chains.
        site_water=_norm(smooth(raw_water, nbr, passes=passes(SITE_WATER_REACH_M, graph.spacing))),
        spacing=graph.spacing,
        bounds=(float(c.x.min()), float(c.y.min()), float(c.x.max()), float(c.y.max())),  # cell centres
        graph=graph,
    )


def decode(genome: np.ndarray, bounds, ranges: dict = RANGES) -> tuple[list[Attractor], dict]:
    """Numbers → attractors (in metres) and site-wide settings."""
    xmin, ymin, xmax, ymax = bounds
    diag = np.sqrt((xmax - xmin) ** 2 + (ymax - ymin) ** 2)
    att = []
    for k in range(N_ATTRACTORS):
        x, y, r, w, kind = genome[k * ATTRACTOR_GENES:(k + 1) * ATTRACTOR_GENES]
        att.append(Attractor(x=_lerp(x, xmin, xmax), y=_lerp(y, ymin, ymax),
                             radius=_lerp(r, *ranges["radius"]) * diag,
                             weight=_lerp(w, *ranges["weight"]),
                             kind=KINDS[min(int(kind * len(KINDS)), len(KINDS) - 1)]))
    g = dict(zip(GLOBAL_GENES, genome[N_ATTRACTORS * ATTRACTOR_GENES:]))
    settings = {name: _lerp(g[name], *ranges[name]) for name in GLOBAL_GENES}
    return att, settings


def random_genome(rng) -> np.ndarray:
    """rng: a pc.rng.Rng (one draw per gene, in order, as the browser engine does)."""
    return np.array([rng.random() for _ in range(LENGTH)])


def _field(xy, attractors, kind):
    """Sum of attractor fields of one kind: weight × (1 - d/r)² inside the radius."""
    f = np.zeros(len(xy))
    for a in attractors:
        if a.kind != kind:
            continue
        dx, dy = xy[:, 0] - a.x, xy[:, 1] - a.y
        d = np.sqrt(dx * dx + dy * dy)  # not hypot: identical in the browser engine
        f += a.weight * np.clip(1 - d / a.radius, 0, None) ** 2
    return f


def upgrade(genome) -> tuple[np.ndarray, bool]:
    """A genome at the current length: a pre-street genome (47 numbers) gets the default
    street genes. Says which it was."""
    g = np.asarray(genome, dtype=float)
    if len(g) >= LENGTH:
        return g, False
    if len(g) != PRE_STREET_LENGTH:
        raise ValueError(f"a genome has {LENGTH} numbers (this one has {len(g)})")
    return np.concatenate([g, np.full(LENGTH - PRE_STREET_LENGTH, STREET_GENE_DEFAULT)]), True


def grow(genome: np.ndarray, ground: Ground, locked: np.ndarray | None = None, ranges: dict = RANGES) -> Design:
    """Grow a design. `locked` (optional): a use code per cell (see use_codes; 0 = free).
    Locked cells keep their use and count towards that use's share. Streets (pc.streets)
    come first, on cell edges; they take part of each cell they run beside."""
    from pc import streets as st_mod

    genome, pre_street = upgrade(genome)
    att, s = decode(genome, ground.bounds, ranges)
    st = st_mod.streets(ground, s)
    xy = ground.xy
    core = _norm(_field(xy, att, "core"))
    green = _norm(_field(xy, att, "green")) + 0.3 * ground.trees  # keep canopy
    water_passes = passes(WATER_FIELD_REACH_M, ground.spacing)
    water = ((1 - s["follow_water"]) * _norm(smooth(_field(xy, att, "water"), ground.nbr, water_passes))
             + s["follow_water"] * ground.site_water)

    n = len(xy)
    use = np.full(n, "", dtype=object)
    free = np.ones(n, dtype=bool)
    if locked is not None:
        for code, name in enumerate(USES, start=1):
            use[locked == code] = name
        free[locked > 0] = False

    def claim(score, eligible, share, name):
        k = max(int(round(share * n)) - int((use == name).sum()), 0)
        idx = np.flatnonzero(eligible & free)
        pick = idx[np.argsort(-score[idx], kind="stable")][:k]  # stable: same ties as the browser engine
        use[pick] = name
        free[pick] = False

    claim(water, ground.can_water, s["water_share"], "water")
    claim(green - 0.5 * core, ground.can_green, s["green_share"], "landscape")
    use[free & ground.can_build] = "building"
    left = free & ~ground.can_build
    use[left] = np.where(ground.can_green[left], "landscape", "water")

    # No street between two water cells the genes made (a causeway to nowhere).
    sd = st_mod.sides(ground)
    cls, share = st["cls"], st["share"]
    for sid in range(len(cls)):
        j = sd.other[sid]
        if cls[sid] and cls[sid] < 3 and j >= 0 and use[sd.cell[sid]] == "water" and use[j] == "water":
            take = (st["widths"][cls[sid]] / 2) * sd_edge(ground) / float(ground.area[0])
            share[sd.cell[sid]] = max(share[sd.cell[sid]] - take, 0)
            share[j] = max(share[j] - take, 0)
            cls[sid] = 0
    fronts = np.zeros(n, dtype=bool)
    for sid in range(len(cls)):
        if cls[sid]:
            fronts[sd.cell[sid]] = True
            if sd.other[sid] >= 0:
                fronts[sd.other[sid]] = True
    share = np.array(share)

    # Heights: peak < 1 spreads height out, > 1 concentrates it in towers; base lifts all.
    # Buildings on a street rise a little higher. Coverage applies to the plot the streets
    # leave; gross floor area is what it would be if they took nothing.
    rise = s["base"] + (1 - s["base"]) * core ** s["peak"]
    rise = np.where(fronts, np.minimum(rise * st_mod.STREET_FRONT_RISE, 1), rise)
    is_b = use == "building"
    levels = np.where(is_b, np.clip(np.round(1 + (ground.cap - 1) * s["intensity"] * rise), 1, ground.cap), 0)
    open_cov = np.where(is_b, np.minimum(s["coverage"], 1 - ground.min_perm), 0.0)
    cov = np.where(is_b, np.maximum(np.minimum(s["coverage"] * (1 - share), (1 - ground.min_perm) - share), 0), 0.0)
    gross = float(sum(float(a) * float(c) * int(lv) for a, c, lv in zip(ground.area, open_cov, levels)))
    return Design(genome=genome, use=use, levels=levels.astype(int), coverage=cov,
                  floor_area=ground.area * cov * levels, attractors=att, settings=s,
                  gross_floor_area=gross, street=cls, street_widths=st["widths"], pre_street=pre_street)


def sd_edge(ground) -> float:
    return float(ground.graph.edge) if ground.graph is not None else float(np.sqrt(ground.area[0]))


def use_codes(d: Design) -> np.ndarray:
    """Uses as small integers (for comparing designs cell by cell)."""
    return np.select([d.use == u for u in USES], range(1, len(USES) + 1), 0).astype(np.int8)


def to_frame(d: Design, ground: Ground) -> gpd.GeoDataFrame:
    """A design as map cells (for drawing and export)."""
    f = ground.cells[["geometry"]].copy()
    f["use"], f["levels"] = d.use, d.levels
    f["coverage"], f["floor_area"] = d.coverage.round(2), d.floor_area.round(0)
    ox, oy = ground.origin
    f.attrs["attractors"] = [Attractor(a.x + ox, a.y + oy, a.radius, a.weight, a.kind) for a in d.attractors]
    return f


def stats(d: Design, ground: Ground) -> dict:
    total = ground.area.sum()
    share = lambda u: ground.area[d.use == u].sum() / total
    b = d.use == "building"
    out = {
        "floor_area_ha": d.floor_area.sum() / 1e4,
        "gross_floor_area_ha": d.gross_floor_area / 1e4,
        "far": d.floor_area.sum() / total,
        "building": share("building"),
        "landscape": share("landscape"),
        "water": share("water"),
        "mean_levels": d.levels[b].mean() if b.any() else 0,
        "max_levels": d.levels[b].max() if b.any() else 0,
    }
    return {k: round(float(v), 3) for k, v in out.items()}
