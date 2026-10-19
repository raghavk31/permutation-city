"""Alexander's fifteen properties, those with an urban-scale proxy (app/engine/metrics/order.ts;
docs/metrics.md, docs/architecture-v2.md 6.4). Salingaros is the reference for the formulas;
applying them at urban scale, on a cell grid, is our choice."""

import math

from pc.metrics.harmony import entropy
from pc.metrics.network import (
    BUILDING, CENTRE_REACH_M, NEAR_NODE_M, RHYTHM_MIN_RUN, Net, Site, code, junctions, landmarks, near, pearson,
)


def levels_of_scale(net: Net) -> float:
    """How evenly the ground is shared among e-fold size rungs of blocks and open spaces."""
    sizes = [len(c) for c in net.blocks] + [len(c) for c in net.patches]
    if not sizes:
        return 0
    top = 0
    for s in sizes:
        top = max(top, math.floor(math.log(s)))
    area = [0] * (top + 1)
    for s in sizes:
        area[math.floor(math.log(s))] += s
    return entropy(area, top + 1)


def boundaries(net: Net) -> float:
    """Of the edges of open spaces (three cells or more), the share that buildings define."""
    S, D = net.S, net.S.deg
    edges = built = 0
    for p, cells in enumerate(net.patches):
        if len(cells) < 3:
            continue
        for i in cells:
            for k in range(D):
                j = S.nbr[i * D + k]
                if j >= 0 and not S.cut[i * D + k] and net.patch[j] == p:
                    continue
                edges += 1
                if j >= 0 and net.use[j] == BUILDING:
                    built += 1
    return built / edges if edges else 0


def _rows(S: Site) -> list:
    """Runs of cells along each row (left to right), at least 16 long. Cached on the site."""
    hit = getattr(S, "_rows", None)
    if hit is not None:
        return hit
    by_row = {}
    for i in range(S.n):
        by_row.setdefault(math.floor(S.y[i] / S.row_step + 0.5), []).append(i)
    out, gap = [], S.spacing * 1.01
    for r in sorted(by_row):
        cells = sorted(by_row[r], key=lambda i: (S.x[i], i))
        run = [cells[0]]
        for t in range(1, len(cells) + 1):
            if t < len(cells) and S.x[cells[t]] - S.x[cells[t - 1]] <= gap:
                run.append(cells[t])
                continue
            if len(run) >= RHYTHM_MIN_RUN:
                out.append(run)
            if t < len(cells):
                run = [cells[t]]
    S._rows = out
    return out


_WAVES = {}


def _wave(n):
    """Cosine and sine tables for a transform of length n."""
    w = _WAVES.get(n)
    if w is None:
        half = n // 2
        c, s = [0.0] * ((half + 1) * n), [0.0] * ((half + 1) * n)
        for k in range(1, half + 1):
            for t in range(n):
                a = (2 * math.pi * k * t) / n
                c[k * n + t], s[k * n + t] = math.cos(a), math.sin(a)
        w = _WAVES[n] = (c, s)
    return w


def periodicity(v) -> float:
    """How much of a sequence's variation sits in its strongest repeat (one frequency of
    its discrete Fourier transform)."""
    n = len(v)
    cs, sn = _wave(n)
    m = 0
    for x in v:
        m += x
    m /= n
    total = best = 0
    for k in range(1, n // 2 + 1):
        re = im = 0
        for t in range(n):
            re += (v[t] - m) * cs[k * n + t]
            im += (v[t] - m) * sn[k * n + t]
        p = re * re + im * im
        total += p
        if p > best:
            best = p
    return best / total if total > 0 else 0


def _rhythm(net: Net, value) -> float:
    total = length = 0
    for run in _rows(net.S):
        total += len(run) * periodicity([value(i) for i in run])
        length += len(run)
    return total / length if length else 0


def rhythm_built(net: Net) -> float:
    return _rhythm(net, lambda i: 1 if net.use[i] == BUILDING else 0)


def rhythm_skyline(net: Net) -> float:
    return _rhythm(net, lambda i: net.levels[i] if net.use[i] == BUILDING else 0)


def hull_area(pts) -> float:
    """Area of a convex hull (Andrew's monotone chain)."""
    p = sorted(pts)
    if len(p) < 3:
        return 0

    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    lower, upper = [], []
    for q in p:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], q) <= 0:
            lower.pop()
        lower.append(q)
    for q in reversed(p):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], q) <= 0:
            upper.pop()
        upper.append(q)
    hull = lower[:-1] + upper[:-1]
    a = 0
    for t in range(len(hull)):
        (x1, y1), (x2, y2) = hull[t], hull[(t + 1) % len(hull)]
        a += x1 * y2 - x2 * y1
    return abs(a) / 2


def _corners(S: Site):
    if S.grid_type == "quad":
        h = S.size / 2
        return [(h, h), (-h, h), (-h, -h), (h, -h)]
    return [(S.size * math.cos((d * math.pi) / 180), S.size * math.sin((d * math.pi) / 180))
            for d in (30, 90, 150, 210, 270, 330)]  # as app/engine/graph.ts computes them


def positive_space(net: Net) -> float:
    """How convex the open spaces are (area over convex-hull area), weighted by area."""
    S, shape = net.S, _corners(net.S)
    total = every = 0
    for cells in net.patches:
        if len(cells) < 3:
            continue
        pts = [(S.x[i] + dx, S.y[i] + dy) for i in cells for dx, dy in shape]
        ratio = min((len(cells) * S.cell_area) / hull_area(pts), 1)
        total += len(cells) * ratio
        every += len(cells)
    return total / every if every else 0


def local_symmetry(net: Net) -> float:
    """Of mixed full rings of neighbours, the share that are mirror-symmetric about some axis."""
    S, D = net.S, net.S.deg
    ring = [0] * D
    mixed = sym = 0
    for i in range(S.n):
        full = True
        for k in range(D):
            j = S.nbr[i * D + k]
            if j < 0:
                full = False
                break
            ring[S.dir[i * D + k]] = code(net, j)
        if not full:
            continue
        if max(ring.count(c) for c in ring) >= D - 1:
            continue
        mixed += 1
        for m in range(D):
            if all(ring[a] == ring[(m - a) % D] for a in range(D)):
                sym += 1
                break
    return sym / mixed if mixed else 0


def mirrors(S: Site) -> list:
    """Each cell's mirror image (nearest cell within half a spacing, or -1) about axes through
    the design's centre every 15°. Cached on the site."""
    hit = getattr(S, "_mirrors", None)
    if hit is not None:
        return hit
    s, n = S.spacing, S.n
    cx = cy = 0
    for i in range(n):
        cx += S.x[i]
        cy += S.y[i]
    cx /= n
    cy /= n
    buckets = {}
    for i in range(n):
        buckets.setdefault((math.floor(S.x[i] / s), math.floor(S.y[i] / s)), []).append(i)
    lim, out = (s * 0.5) * (s * 0.5), []
    for t in range(12):
        th = (t * 15 * math.pi) / 180
        c, sn = math.cos(2 * th), math.sin(2 * th)
        m = [-1] * n
        for i in range(n):
            dx, dy = S.x[i] - cx, S.y[i] - cy
            rx, ry = cx + dx * c + dy * sn, cy + dx * sn - dy * c
            bx, by = math.floor(rx / s), math.floor(ry / s)
            hit, hd = -1, lim
            for ox in (-1, 0, 1):
                for oy in (-1, 0, 1):
                    for j in buckets.get((bx + ox, by + oy), ()):
                        ex, ey = S.x[j] - rx, S.y[j] - ry
                        dd = ex * ex + ey * ey
                        if dd < hd or (dd == hd and hit >= 0 and j < hit):
                            hd, hit = dd, j
            m[i] = hit
        out.append(m)
    S._mirrors = out
    return out


def symmetry(net: Net) -> float:
    """Mirror correlation of the skyline about the best axis, times the share mirrored."""
    S = net.S

    def v(i):
        return net.levels[i] if net.use[i] == BUILDING else 0
    best = 0
    for m in mirrors(S):
        a, b = [], []
        for i in range(S.n):
            if m[i] >= 0:
                a.append(v(i))
                b.append(v(m[i]))
        score = max(pearson(a, b), 0) * (len(a) / S.n)
        if score > best:
            best = score
    return best


def balance(net: Net) -> float:
    """1 when the floor area's centre sits on the ground's centre, 0 a quarter-diagonal away."""
    S = net.S
    cx = cy = fx = fy = fa = 0
    for i in range(S.n):
        cx += S.x[i]
        cy += S.y[i]
        fx += net.floor_area[i] * S.x[i]
        fy += net.floor_area[i] * S.y[i]
        fa += net.floor_area[i]
    if not fa:
        return 0
    cx /= S.n
    cy /= S.n
    fx /= fa
    fy /= fa
    x0, y0, x1, y1 = S.bounds
    diag = math.sqrt((x1 - x0) * (x1 - x0) + (y1 - y0) * (y1 - y0))
    off = math.sqrt((fx - cx) * (fx - cx) + (fy - cy) * (fy - cy))
    return max(1 - (4 * off) / diag, 0)


def contrast(net: Net) -> float:
    """The share of neighbouring cells that differ in use or height band."""
    S, D = net.S, net.S.deg
    links = differ = 0
    for i in range(S.n):
        for k in range(D):
            j = S.nbr[i * D + k]
            if j <= i:
                continue
            links += 1
            if code(net, i) != code(net, j):
                differ += 1
    return differ / links if links else 0


def gradients(net: Net) -> float:
    """Where neighbouring buildings differ in height, the share that step by one storey."""
    S, D = net.S, net.S.deg
    links = gentle = 0
    for i in range(S.n):
        if net.use[i] != BUILDING:
            continue
        for k in range(D):
            j = S.nbr[i * D + k]
            if j <= i or net.use[j] != BUILDING or net.levels[i] == net.levels[j]:
                continue
            links += 1
            if abs(net.levels[i] - net.levels[j]) == 1:
                gentle += 1
    return gentle / links if links else 0


def roughness(net: Net) -> float:
    """Variation of storeys within blocks (sd over mean), blocks of 3+ cells, weighted by size."""
    total = every = 0
    for cells in net.blocks:
        if len(cells) < 3:
            continue
        s1 = s2 = 0
        for i in cells:
            s1 += net.levels[i]
            s2 += net.levels[i] * net.levels[i]
        m = s1 / len(cells)
        sd = math.sqrt(max(s2 / len(cells) - m * m, 0))
        total += len(cells) * (sd / m if m > 0 else 0)
        every += len(cells)
    return total / every if every else 0


def the_void(net: Net) -> float:
    """The largest open space as a share of the design ground."""
    return max((len(c) for c in net.patches), default=0) / net.S.n


def strong_centres(net: Net) -> float:
    """Around each core centre, how strongly storeys fall away with distance; the mean."""
    S = net.S
    if not net.centres:
        return 0
    total = 0
    for c in net.centres:
        nearness, lv = [], []
        for i in range(S.n):
            if net.use[i] != BUILDING:
                continue
            dx, dy = S.x[i] - S.x[c], S.y[i] - S.y[c]
            r = math.sqrt(dx * dx + dy * dy)
            if r <= CENTRE_REACH_M:
                nearness.append(-r)
                lv.append(net.levels[i])
        total += max(pearson(nearness, lv), 0)
    return total / len(net.centres)


def landmark_placement(net: Net) -> float:
    """Of the landmarks, the share within 100 m of a node (a junction or a centre)."""
    return near(net.S, landmarks(net), junctions(net) + net.centres, NEAR_NODE_M)
