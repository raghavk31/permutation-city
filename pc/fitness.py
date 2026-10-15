"""Fitness: what makes a design good. Scores are kept separate so trade-offs stay visible.

The brief (a requirement, not a score):
    gap        distance from the floor-area target (site.yaml: target_far or
               target_floor_area_ha). Designs within `target_tolerance` (default 10%) are
               "on brief" and always beat designs that aren't; among those that aren't,
               the closer one wins.

Five scores (on the Pareto front):
    storage    share of the design storm held on site (higher is better)
               water bodies ~1 m, landscape ~0.1 m, unsealed plot ground ~0.05 m;
               storm depth from site.yaml (design_storm_mm)
    heat       surface heat index, °C above fully green ground (lower is better)
               paving +5, roofs +4, grass +1, landscape +0.5, water -2, +0.1 per storey;
               spread to neighbours so parks and water cool their surroundings
    carbon     embodied carbon, kgCO2e per m² of floor area (lower is better)
               ~400 for mid-rise reinforced concrete, +2% per storey above 6
               (heavier structure, lifts, cores)
    daylight   share of floor area that is well lit (higher is better)
               a floor is well lit if no building within ~100 m rises above a 25° line
               from it (the usual rule of thumb), checked in every direction
    human      human scale (higher is better): the average of
               - share of floor area in buildings of 8 storeys or fewer
               - share of building cells that front a park or water

All values are indicative and comparable between designs, not simulations.

Ranking (Sem 06's Pareto fronts): a design is on the front if no other design is at least
as good on all five scores and better on one. Near-identical designs (fewer than 5% of
cells different) are treated as copies and pushed back, so distinct families survive.
"""

import numpy as np

from pc.genome import Design, Ground, smooth

STORAGE_DEPTH = {"water": 1.0, "landscape": 0.10}  # metres of water held
PLOT_STORAGE = 0.05                                  # unsealed ground in building plots
HEAT = {"sealed": 5.0, "roof": 4.0, "unsealed": 1.0, "landscape": 0.5, "water": -2.0}
HEAT_PER_LEVEL = 0.1
CARBON_BASE, CARBON_FREE_LEVELS, CARBON_PER_LEVEL = 400.0, 6, 0.02
STOREY_M = 3.2
DAYLIGHT_ANGLE, DAYLIGHT_RINGS = 25.0, 3       # 3 rings of hexes ≈ 100 m at 20 m hexes
HUMAN_MAX_LEVELS = 8
TARGET_TOLERANCE = 0.10
DUPLICATE = 0.05                               # share of cells that must differ

# name: (label, unit format, higher is better)
SCORES = {
    "storage": ("flood storage", "{:.0%}", True),
    "heat": ("heat", "+{:.1f}°C", False),
    "carbon": ("embodied carbon", "{:.0f} kg/m²", False),
    "daylight": ("daylight", "{:.0%}", True),
    "human": ("human scale", "{:.0%}", True),
}


def floor_area_target(site, ground: Ground) -> float:
    """Target floor area in m², from site.yaml."""
    if site.target_floor_area_ha:
        return site.target_floor_area_ha * 1e4
    return site.target_far * ground.area.sum()


def _dilate_max(v, nbr):
    """Each cell takes the largest value among itself and its neighbours."""
    has = nbr >= 0
    vals = np.where(has, v[np.where(has, nbr, 0)], -np.inf)
    return np.maximum(v, vals.max(axis=1))


def evaluate(d: Design, ground: Ground, site, storm_factor: float = 1.0) -> dict:
    """Score a design. storm_factor > 1 is a climate shock: a heavier design storm."""
    a = ground.area
    b = d.use == "building"
    fa = d.floor_area
    total_fa = fa.sum()

    # Storage (m³) against the storm falling on the design ground.
    held = np.where(d.use == "water", STORAGE_DEPTH["water"],
                    np.where(d.use == "landscape", STORAGE_DEPTH["landscape"],
                             ground.min_perm * PLOT_STORAGE)) * a
    storage = held.sum() / (site.design_storm_mm * storm_factor / 1000 * a.sum())

    # Heat per cell, then spread.
    sealed = np.clip(1 - d.coverage - ground.min_perm, 0, 1)
    dt = np.where(b, d.coverage * HEAT["roof"] + ground.min_perm * HEAT["unsealed"]
                  + sealed * HEAT["sealed"] + HEAT_PER_LEVEL * d.levels,
                  np.where(d.use == "water", HEAT["water"], HEAT["landscape"]))
    heat = float(np.average(smooth(dt, ground.nbr, passes=3), weights=a))

    # Embodied carbon per m² of floor area.
    per_m2 = CARBON_BASE * (1 + CARBON_PER_LEVEL * np.clip(d.levels - CARBON_FREE_LEVELS, 0, None))
    carbon = float((per_m2 * fa).sum() / total_fa) if total_fa else CARBON_BASE

    # Daylight: floors below z_min sit under a 25° line from some building within ~100 m.
    h = d.levels * STOREY_M
    spacing = np.sqrt(3) * site.hex_radius
    z_min = np.zeros(len(h))
    hmax = h.copy()
    for k in range(1, DAYLIGHT_RINGS + 1):
        hmax = _dilate_max(hmax, ground.nbr)           # tallest within k rings
        z_min = np.maximum(z_min, hmax - k * spacing * np.tan(np.radians(DAYLIGHT_ANGLE)))
    lit_levels = np.clip(d.levels - np.ceil(z_min / STOREY_M), 0, d.levels)
    lit_fa = a * d.coverage * lit_levels
    daylight = float(lit_fa.sum() / total_fa) if total_fa else 1.0

    # Human scale: mid-rise share of floor area, and building cells fronting open space.
    midrise = float(fa[d.levels <= HUMAN_MAX_LEVELS].sum() / total_fa) if total_fa else 1.0
    open_ = (d.use == "landscape") | (d.use == "water")
    has = ground.nbr >= 0
    fronts = (np.where(has, open_[np.where(has, ground.nbr, 0)], False)).any(axis=1)
    frontage = float(fronts[b].mean()) if b.any() else 1.0
    human = (midrise + frontage) / 2

    target = floor_area_target(site, ground)
    gap = abs(total_fa - target) / target

    d.scores = {"storage": round(float(storage), 3), "heat": round(heat, 2),
                "carbon": round(carbon, 0), "daylight": round(daylight, 3),
                "human": round(human, 3), "gap": round(float(gap), 3)}
    return d.scores


def _as_min(scores: list[dict]) -> np.ndarray:
    """All five scores as 'lower is better'."""
    return np.array([[-s[k] if up else s[k] for k, (_, _, up) in SCORES.items()] for s in scores])


def _fronts(f):
    n = len(f)
    le = (f[:, None, :] <= f[None, :, :]).all(axis=2)
    lt = (f[:, None, :] < f[None, :, :]).any(axis=2)
    dominates = le & lt
    rank = np.zeros(n, dtype=int)
    remaining = np.ones(n, dtype=bool)
    r = 1
    while remaining.any():
        beaten = dominates[remaining][:, remaining].any(axis=0)
        idx = np.flatnonzero(remaining)[~beaten]
        rank[idx] = r
        remaining[idx] = False
        r += 1
    return rank


def pareto_ranks(scores: list[dict], tol=TARGET_TOLERANCE) -> np.ndarray:
    """Rank 1 = the Pareto front of on-brief designs; then the next fronts; designs off
    the brief come after all on-brief ones, ordered by how close they are."""
    gap = np.array([s["gap"] for s in scores])
    ok = gap <= tol
    rank = np.zeros(len(scores), dtype=int)
    if ok.any():
        rank[ok] = _fronts(_as_min([s for s, k in zip(scores, ok) if k]))
    top = rank.max() if ok.any() else 0
    off = np.flatnonzero(~ok)
    rank[off[np.argsort(gap[off])]] = top + 1 + np.arange(len(off))
    return rank


def crowding(scores: list[dict], idx) -> np.ndarray:
    """How spread out a design is from its neighbours on the front (NSGA-II)."""
    f = _as_min(scores)[idx]
    n = len(idx)
    dist = np.zeros(n)
    if n <= 2:
        return np.full(n, np.inf)
    for k in range(f.shape[1]):
        order = np.argsort(f[:, k])
        span = f[order[-1], k] - f[order[0], k] or 1
        dist[order[0]] = dist[order[-1]] = np.inf
        dist[order[1:-1]] += (f[order[2:], k] - f[order[:-2], k]) / span
    return dist


def difference(uses: np.ndarray) -> np.ndarray:
    """Pairwise share of cells with a different use. uses: (designs, cells) codes."""
    return (uses[:, None, :] != uses[None, :, :]).mean(axis=2)


def families(uses: np.ndarray, order, threshold=0.15) -> list[list[int]]:
    """Group designs into families: walk the designs best first; each one not within
    `threshold` of an existing family's founder starts a new family."""
    diff = difference(uses)
    fams = []
    for i in order:
        for fam in fams:
            if diff[fam[0], i] < threshold:
                fam.append(i)
                break
        else:
            fams.append([i])
    return fams
