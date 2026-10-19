"""Streets on cell edges (app/engine/streets.ts; docs/landform.md).

Streets run along the sides of cells, never through them: a street on a 20 m hex would be
35 m wide. Each street side takes half its width from the cell on either side, which comes
out of that cell's buildable area.

    sides       every side of every design cell, listed once: (cell, direction, neighbour or
                -1 at the edge of the design ground), with its two end vertices
    skeleton    the primary streets, fixed per site (pc.skeleton): strong ridges, joined to
                the existing roads; or the existing roads themselves on flat land
    generate    the secondary streets and lanes a genome asks for (street genes), grown
                inside the skeleton

The same arithmetic, in the same order, as the browser, so both engines give the same
streets for the same genome.
"""

import math
from dataclasses import dataclass

from pc.metrics.network import site_of


@dataclass
class Sides:
    n: int
    D: int
    cell: list      # per side: the cell it is listed under
    dir: list       # per side: direction from that cell (0 = east, counter-clockwise)
    other: list     # per side: the neighbour across it, or -1 (edge of the design ground)
    v0: list        # per side: end vertices
    v1: list
    vx: list        # per vertex: position
    vy: list
    at: list        # per cell and direction (n * D): the side there


def _corners(S):
    if S.grid_type == "quad":
        h = S.size / 2
        return [(h, h), (-h, h), (-h, -h), (h, -h)]
    return [(S.size * math.cos((d * math.pi) / 180), S.size * math.sin((d * math.pi) / 180))
            for d in (30, 90, 150, 210, 270, 330)]


def sides(ground) -> Sides:
    """Every side of every design cell once, in order: cells in turn, directions in turn; a
    side already listed under its neighbour is skipped. Vertices are the cell corners,
    matched at 0.1 m, numbered as first met. Cached on the ground."""
    hit = getattr(ground, "_sides", None)
    if hit is not None:
        return hit
    S = site_of(ground)
    n, D = S.n, S.deg
    nbr_in = [-1] * (n * D)  # neighbour by direction
    for i in range(n):
        for k in range(D):
            j = S.nbr[i * D + k]
            if j >= 0:
                nbr_in[i * D + S.dir[i * D + k]] = j
    shape = _corners(S)
    vid, vx, vy = {}, [], []

    def vertex(x, y):
        key = (math.floor(x * 10 + 0.5), math.floor(y * 10 + 0.5))
        v = vid.get(key)
        if v is None:
            v = vid[key] = len(vx)
            vx.append(x)
            vy.append(y)
        return v
    cell, dirs, other, v0, v1, at = [], [], [], [], [], [-1] * (n * D)
    for i in range(n):
        for a in range(D):
            j = nbr_in[i * D + a]
            if j >= 0 and j < i:
                continue
            c0, c1 = shape[(a - 1) % D], shape[a]
            sid = len(cell)
            cell.append(i)
            dirs.append(a)
            other.append(j)
            v0.append(vertex(S.x[i] + c0[0], S.y[i] + c0[1]))
            v1.append(vertex(S.x[i] + c1[0], S.y[i] + c1[1]))
            at[i * D + a] = sid
            if j >= 0:
                at[j * D + (a + D // 2) % D] = sid
    out = Sides(n=n, D=D, cell=cell, dir=dirs, other=other, v0=v0, v1=v1, vx=vx, vy=vy, at=at)
    ground._sides = out
    return out


def side_between(sd: Sides, i: int, j: int, S) -> int:
    """The side between design cells i and j (neighbours), or -1."""
    D = sd.D
    for k in range(D):
        if S.nbr[i * D + k] == j:
            return sd.at[i * D + S.dir[i * D + k]]
    return -1


def direction_to(S, i: int, x: float, y: float) -> int:
    """The direction from cell i towards a point (nearest of the grid's directions)."""
    step = 2 * math.pi / S.deg
    return math.floor(math.atan2(y - S.y[i], x - S.x[i]) / step + 0.5) % S.deg


# --- street generation (app/engine/streets.ts) ----------------------------------------------

LANE, SECONDARY, PRIMARY = 1, 2, 3
PRIMARY_W_M = 18.0                  # primary streets
STREET_SECONDARY_W = (9.0, 15.0)    # secondary, by the hierarchy gene
STREET_LANE_W = (6.0, 9.0)          # lanes, by the hierarchy gene
STREET_SHARE_MAX = 0.6              # streets take at most this much of a cell
MIN_STREET_SLOPE = 0.003            # contour streets on flatter ground use this slope
STREET_FRONT_RISE = 1.1             # buildings on a street rise a little higher (capped)


def adjacency(sd: Sides) -> list:
    """Each vertex's sides (other vertex, side), in side order. Cached."""
    adj = getattr(sd, "_adj", None)
    if adj is None:
        adj = [[] for _ in sd.vx]
        for s in range(len(sd.cell)):
            adj[sd.v0[s]].append((sd.v1[s], s))
            adj[sd.v1[s]].append((sd.v0[s], s))
        sd._adj = adj
    return adj


def _median_slope(ground, S) -> float:
    hit = getattr(ground, "_median_slope", None)
    if hit is None:
        z = [float(v) for v in ground.z]
        s = sorted(abs(z[i] - z[j]) / S.spacing for i in range(S.n) for k in range(S.deg)
                   for j in [S.nbr[i * S.deg + k]] if j > i)
        m = len(s)
        hit = (s[(m - 1) // 2] if m % 2 else (s[m // 2 - 1] + s[m // 2]) / 2) if m else 0
        ground._median_slope = hit
    return hit


def _valley_distance(ground, S):
    if hasattr(ground, "_valley_distance"):
        return ground._valley_distance
    out = None
    if ground.valley is not None and any(int(v) > 0 for v in ground.valley):
        dist, q = [-1] * S.n, []
        for i in range(S.n):
            if int(ground.valley[i]) > 0:
                dist[i] = 0
                q.append(i)
        h = 0
        while h < len(q):
            i = q[h]
            for k in range(S.deg):
                j = S.nbr[i * S.deg + k]
                if j >= 0 and dist[j] < 0:
                    dist[j] = dist[i] + 1
                    q.append(j)
            h += 1
        top = max(dist)
        out = [(top + 1 if d < 0 else d) * S.spacing for d in dist]
    ground._valley_distance = out
    return out


def _field(ground, S, orientation: float) -> list:
    """First-family street field (as app/engine/streets.ts `field`)."""
    mode = min(math.floor(orientation * 3), 2)
    t = orientation * 3 - mode
    flat = (getattr(ground, "relief_class", None) or "flat") == "flat"
    if mode == 0 and ground.z is not None and not flat:
        s = max(_median_slope(ground, S), MIN_STREET_SLOPE)
        return [float(z) / s for z in ground.z]
    if mode == 1:
        v = _valley_distance(ground, S)
        if v is not None:
            return v
    th = t * math.pi
    c, sn = math.cos(th), math.sin(th)
    return [S.x[i] * c + S.y[i] * sn for i in range(S.n)]


def _cross_field(S, f) -> list:
    n = S.n
    mx = my = mf = 0
    for i in range(n):
        mx += S.x[i]
        my += S.y[i]
        mf += f[i]
    mx /= n
    my /= n
    mf /= n
    sxx = sxy = syy = sxf = syf = 0
    for i in range(n):
        x, y, v = S.x[i] - mx, S.y[i] - my, f[i] - mf
        sxx += x * x
        sxy += x * y
        syy += y * y
        sxf += x * v
        syf += y * v
    det = sxx * syy - sxy * sxy
    a = (sxf * syy - syf * sxy) / det if det != 0 else 0
    b = (syf * sxx - sxf * sxy) / det if det != 0 else 0
    g = 0 if a == 0 and b == 0 else math.atan2(b, a)
    th = g + math.pi / 2
    c, sn = math.cos(th), math.sin(th)
    return [S.x[i] * c + S.y[i] * sn for i in range(n)]


def _tree(sd, start, ok):
    adj, nv = adjacency(sd), len(sd.vx)
    dist, via, q = [-1] * nv, [-1] * nv, []
    for v in range(nv):
        if start[v]:
            dist[v] = 0
            q.append(v)
    h = 0
    while h < len(q):
        v = q[h]
        for w, s in adj[v]:
            if dist[w] < 0 and ok(s):
                dist[w] = dist[v] + 1
                via[w] = s
                q.append(w)
        h += 1
    return dist, via


def _back(sd, t, v) -> list:
    dist, via = t
    out = []
    while dist[v] > 0:
        s = via[v]
        out.append(s)
        v = sd.v1[s] if sd.v0[s] == v else sd.v0[s]
    return out


def _nearest(t, vs) -> int:
    dist = t[0]
    best = -1
    for v in vs:
        if dist[v] >= 0 and (best < 0 or dist[v] < dist[best] or (dist[v] == dist[best] and v < best)):
            best = v
    return best


def _parts(sd, cls) -> list:
    adj, seen, out = adjacency(sd), [False] * len(sd.cell), []
    for s0 in range(len(cls)):
        if not cls[s0] or seen[s0]:
            continue
        part, vq = [s0], [sd.v0[s0], sd.v1[s0]]
        seen[s0] = True
        h = 0
        while h < len(vq):
            for w, s in adj[vq[h]]:
                if cls[s] and not seen[s]:
                    seen[s] = True
                    part.append(s)
                    vq.append(w)
            h += 1
        out.append(sorted(part))
    return out


def skeleton_of(ground):
    """The skeleton as side ids (cached on the ground): (sides, levels)."""
    hit = getattr(ground, "_skeleton_sides", None)
    if hit is None:
        sd, sk = sides(ground), ground.skeleton
        out = ([], [])
        if sk:
            for i, a, _rid, lv in sk["sides"]:
                if 0 <= i < sd.n and sd.at[i * sd.D + a] >= 0:
                    out[0].append(sd.at[i * sd.D + a])
                    out[1].append(lv)
        ground._skeleton_sides = hit = out
    return hit


def streets(ground, s: dict) -> dict:
    """The streets of a design (as app/engine/streets.ts `streets`): per side its class
    (0 none, 1 lane, 2 secondary, 3 primary), per cell the share streets take, the widths."""
    S, sd = site_of(ground), sides(ground)
    ns, D = len(sd.cell), sd.D
    cls = [0] * ns
    vbuf = [int(v) for v in ground.vbuf] if ground.vbuf is not None else None

    def corridor(sid):
        return vbuf is not None and sd.other[sid] >= 0 and bool(vbuf[sd.cell[sid]]) and bool(vbuf[sd.other[sid]])
    sk_sides, sk_levels = skeleton_of(ground)

    f1 = _field(ground, S, s["street_orientation"])
    f2 = _cross_field(S, f1)
    sp = s["street_spacing"]
    regime = min(math.floor(s["street_pattern"] * 3), 2)
    for sid in range(ns):
        i, j = sd.cell[sid], sd.other[sid]
        if j < 0 or corridor(sid):
            continue
        a1, b1 = math.floor(f1[i] / sp), math.floor(f1[j] / sp)
        a2, b2 = math.floor(f2[i] / sp), math.floor(f2[j] / sp)
        if a1 != b1:
            if regime < 2 or max(a1, b1) % 2 == 0:
                cls[sid] = SECONDARY
        elif a2 != b2:
            boundary, along = max(a2, b2), a1
            if regime == 0 or ((boundary + along) % 2 == 0 if regime == 1 else boundary % 2 == 0):
                cls[sid] = LANE
    for sid, lv in zip(sk_sides, sk_levels):
        cls[sid] = max(cls[sid], lv)

    nv = len(sd.vx)
    main, edge_v, is_sk = [0] * nv, [0] * nv, [0] * ns
    for sid in range(ns):
        if sd.other[sid] < 0:
            edge_v[sd.v0[sid]] = edge_v[sd.v1[sid]] = 1
    for sid in sk_sides:
        is_sk[sid] = 1
    groups = _parts(sd, cls)
    has_sk = len(sk_sides) > 0

    def rooted(p):
        return any(is_sk[x] for x in p) if has_sk else any(edge_v[sd.v0[x]] or edge_v[sd.v1[x]] for x in p)
    any_main = False
    for p in groups:
        if rooted(p):
            for x in p:
                main[sd.v0[x]] = main[sd.v1[x]] = 1
                any_main = True
    join = _tree(sd, main, lambda sid: not corridor(sid)) if any_main else None
    added = []
    for p in groups:
        if rooted(p):
            continue
        v = _nearest(join, sorted({w for x in p for w in (sd.v0[x], sd.v1[x])})) if join else -1
        if v < 0:
            for x in p:
                if not is_sk[x]:
                    cls[x] = 0
            continue
        for x in _back(sd, join, v):
            if not cls[x]:
                cls[x] = SECONDARY
                added.append(x)
        for x in p:
            main[sd.v0[x]] = main[sd.v1[x]] = 1
    for x in added:
        main[sd.v0[x]] = main[sd.v1[x]] = 1

    if any_main:
        region = [-1] * S.n
        reach = None
        for s0 in range(S.n):
            if region[s0] >= 0:
                continue
            cells, reached = [s0], False
            region[s0] = s0
            h = 0
            while h < len(cells):
                i = cells[h]
                for a in range(D):
                    sid = sd.at[i * D + a]
                    if sid < 0:
                        continue
                    j = sd.cell[sid] if sd.other[sid] == i else sd.other[sid]
                    if j < 0 or (cls[sid] and main[sd.v0[sid]]):
                        reached = True
                        continue
                    if not cls[sid] and region[j] < 0:
                        region[j] = s0
                        cells.append(j)
                h += 1
            if reached:
                continue
            if reach is None:
                reach = _tree(sd, main, lambda sid: True)
            vs = set()
            for i in cells:
                for a in range(D):
                    sid = sd.at[i * D + a]
                    if sid >= 0:
                        vs.update((sd.v0[sid], sd.v1[sid]))
            v = _nearest(reach, sorted(vs))
            if v >= 0:
                for x in _back(sd, reach, v):
                    if not cls[x]:
                        cls[x] = SECONDARY

    hg = s["street_hierarchy"]
    widths = [0.0, STREET_LANE_W[0] + (STREET_LANE_W[1] - STREET_LANE_W[0]) * hg,
              STREET_SECONDARY_W[0] + (STREET_SECONDARY_W[1] - STREET_SECONDARY_W[0]) * hg, PRIMARY_W_M]
    share = [0.0] * S.n
    crossings = 0
    for sid in range(ns):
        if not cls[sid]:
            continue
        if corridor(sid):
            crossings += 1
        take = (widths[cls[sid]] / 2) * S.edge / S.cell_area
        share[sd.cell[sid]] += take
        if sd.other[sid] >= 0:
            share[sd.other[sid]] += take
    share = [min(v, STREET_SHARE_MAX) for v in share]
    return {"cls": cls, "share": share, "widths": widths, "crossings": crossings}
