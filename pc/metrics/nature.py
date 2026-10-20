"""Connection to nature and semilattice richness (app/engine/metrics/nature.ts;
docs/metrics.md)."""

import math

from pc.metrics.network import (
    BUILDING, CATCHMENT_M, GREEN_MIN_HA, LANDSCAPE, NATURE_WALK_M, WATER, Net, activity_starts, is_open, walk,
    walk_from,
)


def _parks(net: Net) -> list:
    """Cells of landscape patches of half a hectare or more."""
    out = []
    for cells in net.greens:
        if len(cells) * net.S.cell_area >= GREEN_MIN_HA * 1e4:
            out.extend(cells)
    return out


def _cells_of(net: Net, use: int) -> list:
    return [i for i in range(net.S.n) if net.use[i] == use]


def _within(net: Net, sources, reach) -> float:
    """Share of building cells within `reach` metres' walk of `sources`."""
    homes = _cells_of(net, BUILDING)
    if not homes or not sources:
        return 0
    dist, steps = walk(net.S, sources), reach / net.S.spacing
    return sum(1 for i in homes if 0 <= dist[i] <= steps) / len(homes)


def green_walk(net: Net) -> float:
    return _within(net, _parks(net), NATURE_WALK_M)


def water_walk(net: Net) -> float:
    return _within(net, _cells_of(net, WATER), NATURE_WALK_M)


def green_cover(net: Net) -> float:
    return len(_cells_of(net, LANDSCAPE)) / net.S.n


def green_view(net: Net) -> float:
    """The share of open cells within two steps, averaged over buildings."""
    S, D = net.S, net.S.deg
    total, nb = 0, 0
    for i in range(S.n):
        if net.use[i] != BUILDING:
            continue
        seen = [i]

        def grow(c):
            for k in range(D):
                j = S.nbr[c * D + k]
                if j >= 0 and j not in seen:
                    seen.append(j)
        grow(i)
        ring = len(seen)
        for h in range(1, ring):
            grow(seen[h])
        opened = sum(1 for t in range(1, len(seen)) if is_open(net.use[seen[t]]))
        total += opened / (len(seen) - 1) if len(seen) > 1 else 0
        nb += 1
    return total / nb if nb else 0


def semilattice(net: Net) -> float:
    """Share of cells in more than one 400 m catchment, weighted: parks, water, shops (with
    the design's centres), schools and transit; without places, parks, water, centres, roads."""
    S, D, steps = net.S, net.S.deg, CATCHMENT_M / net.S.spacing
    limit = math.floor(steps)
    kinds = [[(i, 0) for i in _parks(net)], [(i, 0) for i in _cells_of(net, WATER)]]
    centres = [(i, 0) for i in net.centres]
    if S.activities is not None:
        kinds += [activity_starts(S, "shops", CATCHMENT_M) + centres, activity_starts(S, "schools", CATCHMENT_M),
                  activity_starts(S, "transit", CATCHMENT_M)]
    else:
        kinds += [centres, [(i, 0) for i in range(S.n) if any(S.cut[i * D + k] for k in range(D))]]
    count = [0] * S.n
    for src in kinds:
        if not src:
            continue
        dist = walk_from(S, src, limit)
        for i in range(S.n):
            if 0 <= dist[i] <= steps:
                count[i] += 1
    total = 0
    for i in range(S.n):
        total += max(count[i] - 1, 0) / (len(kinds) - 1)
    return total / S.n
