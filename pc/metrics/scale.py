"""Human scale, and permeability and active edges (app/engine/metrics/scale.ts; docs/metrics.md)."""

from pc.metrics.network import (
    BLOCK_PERIMETER_M, BUILDING, DH_BAND, ENCLOSED_MAX_M, LOW_FRONTAGE_LEVELS, STOREY_M, STREET_W_M, Net,
    is_open, step_to,
)


def _frontage(net: Net):
    """Each frontage link (i, slot, j): a building cell's link to a cell inside the design that
    isn't building, or that a road crosses. Links off the design are skipped."""
    S, D = net.S, net.S.deg
    for i in range(S.n):
        if net.use[i] != BUILDING:
            continue
        for k in range(D):
            s = i * D + k
            j = S.nbr[s]
            if j >= 0 and (net.cut[s] or net.use[j] != BUILDING):
                yield i, s, j


def dh_enclosure(net: Net) -> float:
    """Share of street faces whose width over height (D/H) is between 1 and 3."""
    S = net.S
    total = good = 0
    for i, slot, j in _frontage(net):
        total += 1
        a, H = S.dir[slot], net.levels[i] * STOREY_M
        D, s, nxt, enclosed = 0, slot, j, False
        while True:
            if net.cut[s]:
                D += net.wide[s] if net.wide[s] > 0 else STREET_W_M
            if net.use[nxt] == BUILDING:
                enclosed = True
                break
            D += S.spacing
            if D > ENCLOSED_MAX_M:
                break
            nxt, s = step_to(net, nxt, a)
            if nxt < 0:
                break
        if enclosed and DH_BAND[0] <= D / H <= DH_BAND[1]:
            good += 1
    return good / total if total else 0


def perimeters(net: Net) -> list:
    """Each block's perimeter in metres: its cells' links to anything outside the block."""
    S, D, out = net.S, net.S.deg, []
    for b, cells in enumerate(net.blocks):
        edges = 0
        for i in cells:
            for k in range(D):
                j = S.nbr[i * D + k]
                if j < 0 or net.cut[i * D + k] or net.block[j] != b:
                    edges += 1
        out.append(edges * S.edge)
    return out


def block_size(net: Net) -> float:
    """Share of building cells in blocks with a perimeter of 400 m or less."""
    per = perimeters(net)
    every = small = 0
    for b, cells in enumerate(net.blocks):
        every += len(cells)
        if per[b] <= BLOCK_PERIMETER_M:
            small += len(cells)
    return small / every if every else 0


def low_frontage(net: Net) -> float:
    """Share of street faces on buildings of six storeys or fewer."""
    total = low = 0
    for i, _, _ in _frontage(net):
        total += 1
        if net.levels[i] <= LOW_FRONTAGE_LEVELS:
            low += 1
    return low / total if total else 0


def connections(net: Net) -> float:
    """How many different spaces each block opens onto, averaged over building cells."""
    S, D = net.S, net.S.deg
    every = total = 0
    for cells in net.blocks:
        spaces, road, edge = [], 0, 0
        for i in cells:
            for k in range(D):
                j = S.nbr[i * D + k]
                if j < 0:
                    edge = 1
                    continue
                if net.cut[i * D + k]:
                    road = 1
                elif is_open(net.use[j]) and net.patch[j] not in spaces:
                    spaces.append(net.patch[j])
        every += len(cells)
        total += len(cells) * (len(spaces) + road + edge)
    return total / every if every else 0


def active_frontage(net: Net) -> float:
    """Of the building faces on the design's streets, the share on primary and secondary
    streets (through routes)."""
    if not net.street:
        return 0
    from pc.streets import sides
    sd, S = sides(net.ground), net.S
    total = active = 0
    for i in range(S.n):
        if net.use[i] != BUILDING:
            continue
        for a in range(S.deg):
            sid = sd.at[i * S.deg + a]
            if sid < 0 or not net.street[sid]:
                continue
            total += 1
            if net.street[sid] >= 2:
                active += 1
    return active / total if total else 0
