"""Connection to nature, semilattice richness and legibility (app/engine/metrics/nature.ts;
docs/metrics.md)."""

from pc.metrics.network import (
    BUILDING, CATCHMENT_M, GREEN_MIN_HA, LANDSCAPE, LEGIBLE_M, NATURE_WALK_M, WATER, Net, is_open, landmarks, near,
    walk,
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
    """Share of cells in more than one 400 m catchment (parks, water, centres, roads), weighted."""
    S, D, steps = net.S, net.S.deg, CATCHMENT_M / net.S.spacing
    roadside = [i for i in range(S.n) if any(S.cut[i * D + k] for k in range(D))]
    kinds = [_parks(net), _cells_of(net, WATER), net.centres, roadside]
    count = [0] * S.n
    for src in kinds:
        if not src:
            continue
        dist = walk(S, src)
        for i in range(S.n):
            if 0 <= dist[i] <= steps:
                count[i] += 1
    total = 0
    for i in range(S.n):
        total += max(count[i] - 1, 0) / (len(kinds) - 1)
    return total / S.n


def legibility(net: Net) -> float:
    """Placeholder until Phase 8: cells within 300 m of a landmark or a centre."""
    return near(net.S, list(range(net.S.n)), landmarks(net) + net.centres, LEGIBLE_M)
