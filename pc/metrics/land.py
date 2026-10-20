"""The street network, and how the design fits the land (app/engine/metrics/land.ts;
docs/metrics.md). On hexes, three sides meet at a corner, so every junction is a T or a Y:
junction density and meshedness compare only between designs on the same kind of grid."""

import math

from pc.metrics.network import BUILDING, LANDSCAPE, WATER, Net

RIDGE_MIN_HA = 5.0  # a strong ridge (pc.landform.RIDGE_MIN_HA): streets "on a ridge" run beside one


def _sides(net: Net):
    from pc.streets import sides
    return sides(net.ground)


def _graph(net: Net):
    sd = _sides(net)
    nv = len(sd.vx)
    deg, edge, count = [0] * nv, [0] * nv, 0
    street = net.street or []
    for s in range(len(sd.cell)):
        if sd.other[s] < 0:
            edge[sd.v0[s]] = edge[sd.v1[s]] = 1
        if not (street and street[s]):
            continue
        deg[sd.v0[s]] += 1
        deg[sd.v1[s]] += 1
        count += 1
    return deg, edge, count


def junction_density(net: Net) -> float:
    """Corners where three or more street sides meet, per km² of design ground."""
    deg, _, _ = _graph(net)
    return sum(1 for d in deg if d >= 3) / ((net.S.n * net.S.cell_area) / 1e6)


def _parts(net: Net) -> int:
    sd = _sides(net)
    parent = list(range(len(sd.vx)))
    used = [0] * len(sd.vx)

    def find(v):
        while parent[v] != v:
            parent[v] = parent[parent[v]]
            v = parent[v]
        return v
    for s in range(len(sd.cell)):
        if not (net.street and net.street[s]):
            continue
        used[sd.v0[s]] = used[sd.v1[s]] = 1
        a, b = find(sd.v0[s]), find(sd.v1[s])
        if a != b:
            parent[max(a, b)] = min(a, b)
    return sum(1 for v in range(len(used)) if used[v] and find(v) == v)


def meshedness(net: Net) -> float:
    """(E - V + C) / (2V - 5) on junctions and ends (Buhl et al. 2006)."""
    deg, _, e = _graph(net)
    v = sum(1 for d in deg if d > 0 and d != 2)
    through = sum(1 for d in deg if d == 2)
    if v < 3:
        return 0
    return min(max((e - through - v + _parts(net)) / (2 * v - 5), 0), 1)


def dead_ends(net: Net) -> float:
    deg, edge, _ = _graph(net)
    nodes = dead = 0
    for v in range(len(deg)):
        if deg[v] == 0 or deg[v] == 2:
            continue
        nodes += 1
        if deg[v] == 1 and not edge[v]:
            dead += 1
    return dead / nodes if nodes else 0


def valley_free(net: Net) -> float:
    vb = net.ground.vbuf
    if vb is None:
        return 1
    every = free = 0
    for i in range(net.S.n):
        if vb[i]:
            every += 1
            if net.use[i] != BUILDING:
                free += 1
    return free / every if every else 1


def _quartiles(net: Net):
    g = net.ground
    hit = getattr(g, "_z_quartiles", None)
    if hit is None:
        z = sorted(float(v) for v in g.z)
        at = lambda p: z[math.floor(p * (len(z) - 1))]
        g._z_quartiles = hit = (at(0.25), at(0.75))
    return hit


def _street_share(net: Net, on) -> float:
    g = net.ground
    if not net.street or g.z is None:
        return 0
    sd = _sides(net)
    every = hit = 0
    for s in range(len(sd.cell)):
        if not net.street[s] or sd.other[s] < 0:
            continue
        every += 1
        if on(sd.cell[s], sd.other[s]):
            hit += 1
    return hit / every if every else 0


def ridge_streets(net: Net) -> float:
    g = net.ground
    q3 = _quartiles(net)[1] if g.z is not None else 0
    r = g.ridge
    z = g.z
    return _street_share(net, lambda i, j: (r is not None and (r[i] >= RIDGE_MIN_HA or r[j] >= RIDGE_MIN_HA))
                         or (z[i] >= q3 and z[j] >= q3))


def low_streets(net: Net) -> float:
    g = net.ground
    q1 = _quartiles(net)[0] if g.z is not None else 0
    vb, z = g.vbuf, g.z
    return _street_share(net, lambda i, j: (vb is not None and bool(vb[i]) and bool(vb[j])) or (z[i] <= q1 and z[j] <= q1))


def runoff_path(net: Net) -> float:
    g = net.ground
    if g.down is None:
        return 0
    down = [int(v) for v in g.down]
    total = nb = 0
    for i in range(net.S.n):
        if net.use[i] != BUILDING:
            continue
        c, steps = i, 0
        while steps < net.S.n:
            nxt = down[c]
            if nxt < 0:
                break
            steps += 1
            c = nxt
            if net.use[c] in (LANDSCAPE, WATER):
                break
        total += steps * net.S.spacing
        nb += 1
    return total / nb if nb else 0


def heat_fit(net: Net) -> float:
    g = net.ground
    if g.lst is None:
        return 0
    every = na = opened = no = 0
    for i in range(net.S.n):
        t = float(g.lst[i])
        if t != t:
            continue
        every += t
        na += 1
        if net.use[i] in (LANDSCAPE, WATER):
            opened += t
            no += 1
    return opened / no - every / na if na and no else 0
