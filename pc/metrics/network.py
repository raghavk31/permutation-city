"""The streets and blocks a design implies (app/engine/metrics/network.ts; R5 in
docs/architecture-v2.md).

The genome places building, landscape and water, never streets. So they are derived:
    blocks    connected building cells; an existing major road between two cells cuts them
    patches   connected open cells (landscape or water), cut the same way
    frontage  a building cell's links to anything that is not the same block
    centres   the cells nearest the core attractors (the design's own local centres)
Phase 8 reuses this for space syntax.

Plain Python numbers, in the browser's order, so both engines give the same values.
"""

import math
from dataclasses import dataclass

BUILDING, LANDSCAPE, WATER = 1, 2, 3
USE_CODE = {"building": BUILDING, "landscape": LANDSCAPE, "water": WATER}

# The metrics' constants (app/engine/config.ts; docs/metrics.md).
STOREY_M = 3.2
STREET_W_M = 12.0          # assumed width where an existing road runs between two cells
ENCLOSED_MAX_M = 120.0     # an open run longer than this encloses nothing
DH_BAND = (1.0, 3.0)       # street width over building height that feels enclosed
BLOCK_PERIMETER_M = 400.0  # a walkable block's perimeter
LOW_FRONTAGE_LEVELS = 6    # storeys you still read as a street face
GREEN_MIN_HA, NATURE_WALK_M, CATCHMENT_M = 0.5, 300.0, 400.0
ACTIVE_REACH_M, NEAR_NODE_M, LEGIBLE_M, CENTRE_REACH_M = 200.0, 100.0, 300.0, 300.0
RHYTHM_MIN_RUN = 16        # cells: shorter runs along a row are too short for a rhythm


@dataclass
class Site:
    """What the metrics read from a Ground, as plain lists (built once per ground)."""
    n: int
    deg: int
    x: list
    y: list
    nbr: list          # flat, n × deg, -1 where there is no neighbour
    cap: list
    cell_area: float
    spacing: float
    edge: float
    grid_type: str
    size: float
    bounds: tuple
    dir: list          # each link's direction, 0 = east, counter-clockwise in equal steps
    cut: list          # 1 where an existing road crosses the link
    row_step: float
    activities: dict | None = None  # shops, schools, transit: points in the same frame


def _orient(px, py, qx, qy, rx, ry):
    return (qx - px) * (ry - py) - (qy - py) * (rx - px)


def crosses(ax, ay, bx, by, cx, cy, dx, dy) -> bool:
    """Do segments ab and cd cross (touching doesn't count)?"""
    d1, d2 = _orient(cx, cy, dx, dy, ax, ay), _orient(cx, cy, dx, dy, bx, by)
    d3, d4 = _orient(ax, ay, bx, by, cx, cy), _orient(ax, ay, bx, by, dx, dy)
    return ((d1 > 0 and d2 < 0) or (d1 < 0 and d2 > 0)) and ((d3 > 0 and d4 < 0) or (d3 < 0 and d4 > 0))


def site_of(ground) -> Site:
    """The metrics' view of a ground: links, their directions and road cuts. Cached on it."""
    hit = getattr(ground, "_metric_site", None)
    if hit is not None:
        return hit
    g = ground.graph
    n, D = len(ground.xy), ground.nbr.shape[1]
    x, y = [float(v) for v in ground.xy[:, 0]], [float(v) for v in ground.xy[:, 1]]
    nbr = [int(v) for v in ground.nbr.ravel()]
    step = 2 * math.pi / D
    B = 100.0
    buckets, segs = {}, []
    for line in ground.roads or []:
        for k in range(1, len(line)):
            s = (float(line[k - 1][0]), float(line[k - 1][1]), float(line[k][0]), float(line[k][1]))
            sid = len(segs)
            segs.append(s)
            for bx in range(math.floor(min(s[0], s[2]) / B), math.floor(max(s[0], s[2]) / B) + 1):
                for by in range(math.floor(min(s[1], s[3]) / B), math.floor(max(s[1], s[3]) / B) + 1):
                    buckets.setdefault((bx, by), []).append(sid)
    dirs, cut = [-1] * (n * D), [0] * (n * D)
    for i in range(n):
        for k in range(D):
            j = nbr[i * D + k]
            if j < 0:
                continue
            a = math.floor(math.atan2(y[j] - y[i], x[j] - x[i]) / step + 0.5)
            dirs[i * D + k] = a % D
            if not segs:
                continue
            seen = set()
            for bx in range(math.floor(min(x[i], x[j]) / B), math.floor(max(x[i], x[j]) / B) + 1):
                for by in range(math.floor(min(y[i], y[j]) / B), math.floor(max(y[i], y[j]) / B) + 1):
                    for sid in buckets.get((bx, by), ()):
                        if sid in seen:
                            continue
                        seen.add(sid)
                        s = segs[sid]
                        if crosses(x[i], y[i], x[j], y[j], *s):
                            cut[i * D + k] = 1
                            break
                    if cut[i * D + k]:
                        break
                if cut[i * D + k]:
                    break
    site = Site(n=n, deg=D, x=x, y=y, nbr=nbr, cap=[int(v) for v in ground.cap],
                cell_area=float(ground.area[0]), spacing=float(g.spacing), edge=float(g.edge),
                grid_type=g.type, size=float(g.size), bounds=tuple(float(v) for v in ground.bounds),
                dir=dirs, cut=cut, row_step=g.size if g.type == "quad" else 1.5 * g.size,
                activities=getattr(ground, "activities", None))
    ground._metric_site = site
    return site


def is_open(u) -> bool:
    return u == LANDSCAPE or u == WATER


@dataclass
class Net:
    S: Site
    ground: object   # the Ground (landform columns, sides)
    street: list     # per side (pc.streets): the design's street class, or empty
    cut: list        # per link: a street of the design or an existing road
    wide: list       # per link: the design's street width there (0: none)
    use: list
    levels: list
    floor_area: list
    block: list
    blocks: list
    patch: list
    patches: list
    green: list
    greens: list
    centres: list
    mean: float
    sd: float


def components(S: Site, member, cut=None) -> tuple[list, list]:
    """Connected groups of cells that pass `member`, not across cut links (road cuts by
    default); numbered in order of their lowest cell, each listed in breadth-first order."""
    cut = S.cut if cut is None else cut
    D, label, groups = S.deg, [-1] * S.n, []
    for s in range(S.n):
        if label[s] >= 0 or not member(s):
            continue
        gid, cells = len(groups), [s]
        label[s] = gid
        h = 0
        while h < len(cells):
            i = cells[h]
            for k in range(D):
                j = S.nbr[i * D + k]
                if j >= 0 and label[j] < 0 and not cut[i * D + k] and member(j):
                    label[j] = gid
                    cells.append(j)
            h += 1
        groups.append(cells)
    return label, groups


def walk(S: Site, sources) -> list:
    """Steps from the nearest source over every link (people cross roads), -1 if unreachable."""
    D, dist, queue = S.deg, [-1] * S.n, []
    for s in sources:
        if dist[s] < 0:
            dist[s] = 0
            queue.append(s)
    h = 0
    while h < len(queue):
        i = queue[h]
        for k in range(D):
            j = S.nbr[i * D + k]
            if j >= 0 and dist[j] < 0:
                dist[j] = dist[i] + 1
                queue.append(j)
        h += 1
    return dist


def walk_from(S: Site, starts, limit: int) -> list:
    """Steps from the nearest start (cell, steps already walked to reach it); -1 beyond
    `limit` or unreachable. Buckets by step, as app/engine/metrics/network.ts."""
    D, dist, buckets = S.deg, [-1] * S.n, {}
    for c, s in starts:
        if s > limit or (0 <= dist[c] <= s):
            continue
        dist[c] = s
        buckets.setdefault(s, []).append(c)
    for s in range(limit + 1):
        for i in buckets.get(s, ()):
            if dist[i] != s:
                continue
            for k in range(D):
                j = S.nbr[i * D + k]
                if j >= 0 and s + 1 <= limit and (dist[j] < 0 or dist[j] > s + 1):
                    dist[j] = s + 1
                    buckets.setdefault(s + 1, []).append(j)
    return dist


def activity_starts(S: Site, kind: str, reach: float) -> list:
    """Each point of a kind of activity: its nearest cell and the straight-line distance to it
    in steps (rounded); points beyond `reach` metres are left out. Cached on the site."""
    cache = S.__dict__.setdefault("_starts", {})
    if kind in cache:
        return cache[kind]
    out = []
    for px, py in (S.activities or {}).get(kind, []):
        best, bd = -1, math.inf
        for i in range(S.n):
            dx, dy = S.x[i] - px, S.y[i] - py
            dd = dx * dx + dy * dy
            if dd < bd:
                bd, best = dd, i
        d = math.sqrt(bd)
        if best >= 0 and d <= reach:
            out.append((best, math.floor(d / S.spacing + 0.5)))
    cache[kind] = out
    return out


def step_to(net: Net, i: int, a: int) -> tuple[int, int]:
    """The neighbour of `i` in direction `a`, or -1; and the link slot, for the cut."""
    S = net.S
    for k in range(S.deg):
        if S.dir[i * S.deg + k] == a:
            return S.nbr[i * S.deg + k], i * S.deg + k
    return -1, -1


def network(design, ground) -> Net:
    """A design's blocks, open patches and centres. Cached on the design."""
    hit = getattr(design, "_net", None)
    if hit is not None and hit.S is getattr(ground, "_metric_site", None):
        return hit
    S = site_of(ground)
    use = [USE_CODE.get(u, 0) for u in design.use]
    levels = [int(v) for v in design.levels]
    D = S.deg
    cut, wide = list(S.cut), [0.0] * (S.n * D)
    street = list(getattr(design, "street", None) or [])
    if street and getattr(design, "street_widths", None):
        from pc.streets import sides
        sd = sides(ground)
        for i in range(S.n):
            for k in range(D):
                if S.nbr[i * D + k] < 0:
                    continue
                c = street[sd.at[i * D + S.dir[i * D + k]]]
                if c:
                    cut[i * D + k] = 1
                    wide[i * D + k] = design.street_widths[c]
    block, blocks = components(S, lambda i: use[i] == BUILDING, cut)
    patch, patches = components(S, lambda i: is_open(use[i]), cut)
    green, greens = components(S, lambda i: use[i] == LANDSCAPE, cut)
    centres = []
    for a in design.attractors:
        if a.kind != "core":
            continue
        best, bd = 0, math.inf
        for i in range(S.n):
            dx, dy = S.x[i] - a.x, S.y[i] - a.y
            dd = dx * dx + dy * dy
            if dd < bd:
                bd, best = dd, i
        if best not in centres:
            centres.append(best)
    nb, s1, s2 = 0, 0, 0
    for i in range(S.n):
        if use[i] == BUILDING:
            nb += 1
            s1 += levels[i]
            s2 += levels[i] * levels[i]
    mean = s1 / nb if nb else 0
    net = Net(S=S, ground=ground, street=street, cut=cut, wide=wide, use=use, levels=levels, floor_area=[float(v) for v in design.floor_area],
              block=block, blocks=blocks, patch=patch, patches=patches, green=green, greens=greens,
              centres=centres, mean=mean, sd=math.sqrt(max(s2 / nb - mean * mean, 0)) if nb else 0)
    design._net = net
    return net


def junctions(net: Net) -> list:
    """Open cells touching three or more different blocks: where routes between blocks meet."""
    S, out = net.S, []
    for i in range(S.n):
        if not is_open(net.use[i]):
            continue
        seen = []
        for k in range(S.deg):
            j = S.nbr[i * S.deg + k]
            if j >= 0 and not net.cut[i * S.deg + k] and net.block[j] >= 0 and net.block[j] not in seen:
                seen.append(net.block[j])
        if len(seen) >= 3:
            out.append(i)
    return out


def landmarks(net: Net) -> list:
    """Building cells that stand out: at least two standard deviations and two storeys above the mean."""
    if not net.sd > 0:
        return []
    return [i for i in range(net.S.n) if net.use[i] == BUILDING
            and net.levels[i] >= net.mean + 2 * net.sd and net.levels[i] >= net.mean + 2]


def pearson(a, b) -> float:
    """Pearson correlation; 0 when either side doesn't vary."""
    n = len(a)
    if n < 2:
        return 0
    ma, mb = 0, 0
    for t in range(n):
        ma += a[t]
        mb += b[t]
    ma /= n
    mb /= n
    sab = saa = sbb = 0
    for t in range(n):
        x, y = a[t] - ma, b[t] - mb
        sab += x * y
        saa += x * x
        sbb += y * y
    return sab / math.sqrt(saa * sbb) if saa > 0 and sbb > 0 else 0


def near(S: Site, cells, targets, reach) -> float:
    """Share of `cells` within `reach` metres (straight line) of any of `targets`."""
    if not cells or not targets:
        return 0
    r2, c = reach * reach, 0
    for i in cells:
        for t in targets:
            dx, dy = S.x[i] - S.x[t], S.y[i] - S.y[t]
            if dx * dx + dy * dy <= r2:
                c += 1
                break
    return c / len(cells)


def code(net: Net, i: int) -> int:
    """Each cell's use and height band: 0 open, 1 up to 4 storeys, 2 up to 8, 3 taller (+ 4 × use)."""
    u, lv = net.use[i], net.levels[i]
    return u * 4 + ((1 if lv <= 4 else 2 if lv <= 8 else 3) if u == BUILDING else 0)
