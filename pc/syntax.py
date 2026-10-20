"""Space syntax: angular segment analysis of each design's streets inside the existing street
network to 1 km round the site (app/engine/syntax.ts; docs/metrics.md, "Space syntax").

The export side: the existing streets for the analysis, fetched to SYNTAX_BUFFER_M round the
site's box (pc.fetch.fetch_streets), simplified and cut into straight segments. They are
exported whole; each engine drops those over its own design ground, so a ground rebuilt from
edited rules in the browser gets the same treatment.

The analysis side, line for line as the TS file (same arithmetic, same order, so both engines
give the same numbers):
  network    the design's streets as straightened strokes (street_strokes), the existing
             major roads over the design ground (landform skeletons only), the buffer streets
             off it, and links where a buffer street dangles at the ground's edge
  dual       segments as nodes; the turn between two, in units of 90°, as TURN_UNITS integers
  analyse    least-angle paths (ties by length) within a metric radius: reach, depth, choice
  depths     depths with no radius, by a bucket queue (Rn integration)
  condensed  Rn integration with the buffer reduced to its gateways (a run's estimate)
"""
from __future__ import annotations

import heapq
import math

SIMPLIFY_M = 3.0       # Douglas-Peucker tolerance for existing streets (export)
STROKE_DIR_M = 30.0    # a street's direction at a junction, read over this length
STROKE_MAX_DEG = 45    # pieces meeting more steeply than this don't carry on as one street
STROKE_SIMPLIFY = 0.75  # × cell size: straightens zigzags along cell edges
LINK_M = 40.0          # a dangling buffer street joins a site vertex this close
TURN_UNITS = 256       # per 90° of turn
RADII = (400.0, 800.0, math.inf)


def buffer_streets(site, origin) -> dict | None:
    """Existing streets (roads, not footpaths) as straight segments [x0, y0, x1, y1] in the
    site's local metres, 0.1 m precision. None when they were never fetched."""
    import geopandas as gpd

    from pc.fetch import SYNTAX_BUFFER_M
    from pc.skeleton import PEDESTRIAN  # here, not at the top: pc.skeleton imports the metrics, which import this
    p = site.raw / "overture" / "segment_syntax.parquet"
    if not p.exists():
        return None
    seg = gpd.read_parquet(p).to_crs(site.crs)
    roads = seg[(seg["subtype"] == "road") & ~seg["class"].isin(PEDESTRIAN)]
    ox, oy = origin
    out, seen = [], set()
    for geom in roads.geometry:
        for part in getattr(geom, "geoms", [geom]):
            pts = [(round(x - ox, 1), round(y - oy, 1)) for x, y in part.simplify(SIMPLIFY_M).coords]
            for a, b in zip(pts, pts[1:]):
                if a == b:
                    continue
                key = (a, b) if a <= b else (b, a)
                if key in seen:  # the same piece twice (a dual carriageway drawn once each way)
                    continue
                seen.add(key)
                out.append([a[0], a[1], b[0], b[1]])
    return {"buffer_m": SYNTAX_BUFFER_M, "simplify_m": SIMPLIFY_M, "segments": out}


# --- geometry -------------------------------------------------------------------------------

def simplify(xs, ys, tol) -> list:
    """Douglas-Peucker on a polyline (indices kept, ends always)."""
    n = len(xs)
    keep = [False] * n
    keep[0] = keep[n - 1] = True
    stack = [(0, n - 1)]
    while stack:
        i, j = stack.pop()
        dx, dy = xs[j] - xs[i], ys[j] - ys[i]
        L = math.sqrt(dx * dx + dy * dy)
        best, bd = -1, tol
        for k in range(i + 1, j):
            d = (abs(dx * (ys[k] - ys[i]) - dy * (xs[k] - xs[i])) / L if L > 0
                 else math.sqrt((xs[k] - xs[i]) ** 2 + (ys[k] - ys[i]) ** 2))
            if d > bd:
                bd, best = d, k
        if best >= 0:
            keep[best] = True
            stack.append((best, j))
            stack.append((i, best))
    return [k for k in range(n) if keep[k]]


def _corners(grid_type, size):
    if grid_type == "quad":
        h = size / 2
        return [(h, h), (-h, h), (-h, -h), (h, -h)]
    return [(size * math.cos(math.radians(d)), size * math.sin(math.radians(d))) for d in (30, 90, 150, 210, 270, 330)]


class GroundIndex:
    """Which design cell a point lies in: the nearest design centre's, if inside its outline."""

    def __init__(self, S):
        self.S = S
        self.B = 2 * S.spacing
        self.shape = _corners(S.grid_type, S.size)
        self.buckets = {}
        for i in range(S.n):
            self.buckets.setdefault((math.floor(S.x[i] / self.B), math.floor(S.y[i] / self.B)), []).append(i)

    def nearest(self, x, y, r) -> int:
        S, B = self.S, self.B
        best, bd = -1, r * r
        bx, by, reach = math.floor(x / B), math.floor(y / B), math.ceil(r / B)
        for i in range(bx - reach, bx + reach + 1):
            for j in range(by - reach, by + reach + 1):
                for c in self.buckets.get((i, j), ()):
                    dd = (S.x[c] - x) ** 2 + (S.y[c] - y) ** 2
                    if dd < bd or (dd == bd and c < best):
                        bd, best = dd, c
        return best

    def cell(self, x, y) -> int:
        S = self.S
        c = self.nearest(x, y, S.size * 1.01)
        if c < 0:
            return -1
        shape = self.shape
        for k in range(len(shape)):
            ax, ay = shape[k]
            bx, by = shape[(k + 1) % len(shape)]
            if (bx - ax) * (y - S.y[c] - ay) - (by - ay) * (x - S.x[c] - ax) < -1e-9:
                return -1
        return c

    def has(self, x, y) -> bool:
        return self.cell(x, y) >= 0

    def near(self, x, y, r) -> bool:
        return self.nearest(x, y, r) >= 0


def ground_index(ground) -> GroundIndex:
    from pc.metrics.network import site_of
    hit = getattr(ground, "_syntax_index", None)
    if hit is None:
        hit = ground._syntax_index = GroundIndex(site_of(ground))
    return hit


def cell_at(ground, x, y) -> int:
    return ground_index(ground).cell(x, y)


# --- the network ----------------------------------------------------------------------------

class Builder:
    """Vertices keyed at 0.1 m, so the same point from two sources is one vertex."""

    def __init__(self):
        self.vx, self.vy, self.a, self.b, self.ids = [], [], [], [], {}

    def vertex(self, x, y) -> int:
        k = (math.floor(x * 10 + 0.5), math.floor(y * 10 + 0.5))
        v = self.ids.get(k)
        if v is None:
            v = self.ids[k] = len(self.vx)
            self.vx.append(x)
            self.vy.append(y)
        return v

    def segment(self, p, q):
        if p != q:
            self.a.append(p)
            self.b.append(q)


class Network:
    def __init__(self, vx, vy, a, b, site, links):
        self.vx, self.vy, self.a, self.b, self.site, self.links = vx, vy, a, b, site, links
        self.len = [math.sqrt((vx[b[s]] - vx[a[s]]) ** 2 + (vy[b[s]] - vy[a[s]]) ** 2) for s in range(len(a))]


def _project(xs, ys, x, y):
    """Nearest point on a polyline to (x, y): its position, and its distance along the line."""
    best, bx, by, bt, run = math.inf, xs[0], ys[0], 0.0, 0.0
    for k in range(1, len(xs)):
        dx, dy = xs[k] - xs[k - 1], ys[k] - ys[k - 1]
        L2 = dx * dx + dy * dy
        L = math.sqrt(L2)
        t = max(0, min(1, ((x - xs[k - 1]) * dx + (y - ys[k - 1]) * dy) / L2)) if L2 else 0
        px, py = xs[k - 1] + t * dx, ys[k - 1] + t * dy
        d = (px - x) * (px - x) + (py - y) * (py - y)
        if d < best:
            best, bx, by, bt = d, px, py, run + t * L
        run += L
    return bx, by, bt


def street_strokes(ground, cls) -> list:
    """The design's streets as straightened strokes (see the TS file): chains between junctions,
    paired at each junction by the straightest continuation, joined, simplified, and the
    junctions moved onto the strokes through them. Polylines ([xs], [ys])."""
    from pc.streets import sides
    sd = sides(ground)
    nv = len(sd.vx)
    deg = [0] * nv
    at = [[] for _ in range(nv)]
    for s in range(len(cls)):
        if not cls[s]:
            continue
        deg[sd.v0[s]] += 1
        deg[sd.v1[s]] += 1
        at[sd.v0[s]].append(s)
        at[sd.v1[s]].append(s)
    used = [False] * len(cls)
    chains = []

    def walk(start, s0):
        vs = [start]
        v, s = start, s0
        while True:
            used[s] = True
            v = sd.v1[s] if sd.v0[s] == v else sd.v0[s]
            vs.append(v)
            if deg[v] != 2:
                break
            nxt = at[v][1] if at[v][0] == s else at[v][0]
            if used[nxt]:
                break
            s = nxt
        chains.append(vs)
    for v in range(nv):
        if deg[v] and deg[v] != 2:
            for s in at[v]:
                if not used[s]:
                    walk(v, s)
    for s in range(len(cls)):
        if cls[s] and not used[s]:
            walk(sd.v0[s], s)

    def dir_of(vs, from_end):
        k0 = len(vs) - 1 if from_end else 0
        step = -1 if from_end else 1
        run, k = 0.0, k0
        while 0 <= k + step < len(vs) and run < STROKE_DIR_M:
            run += math.sqrt((sd.vx[vs[k + step]] - sd.vx[vs[k]]) ** 2 + (sd.vy[vs[k + step]] - sd.vy[vs[k]]) ** 2)
            k += step
        return sd.vx[vs[k]] - sd.vx[vs[k0]], sd.vy[vs[k]] - sd.vy[vs[k0]]

    ends_at = {}
    for c, vs in enumerate(chains):
        for e in (0, 1):
            v = vs[-1] if e else vs[0]
            if deg[v] >= 3:
                ends_at.setdefault(v, []).append(2 * c + e)
    partner = [-1] * (2 * len(chains))
    max_turn = STROKE_MAX_DEG * math.pi / 180
    for v in sorted(ends_at):
        ends = ends_at[v]
        dirs = [dir_of(chains[x >> 1], (x & 1) == 1) for x in ends]
        pairs = []
        for i in range(len(ends)):
            for j in range(i + 1, len(ends)):
                (ux, uy), (wx, wy) = dirs[i], dirs[j]
                deflect = math.pi - math.atan2(abs(ux * wy - uy * wx), ux * wx + uy * wy)
                if deflect <= max_turn:
                    pairs.append((deflect, i, j))
        pairs.sort()
        for _, i, j in pairs:
            if partner[ends[i]] >= 0 or partner[ends[j]] >= 0:
                continue
            partner[ends[i]], partner[ends[j]] = ends[j], ends[i]

    in_stroke = [False] * len(chains)
    strokes = []
    for c0 in range(len(chains)):
        if in_stroke[c0]:
            continue
        in_stroke[c0] = True
        vs = list(chains[c0])
        joints = []
        for fwd in (True, False):
            end = 2 * c0 + 1 if fwd else 2 * c0
            while True:
                p = partner[end]
                if p < 0 or in_stroke[p >> 1]:
                    break
                c, cv, enter_at_start = p >> 1, chains[p >> 1], (p & 1) == 0
                in_stroke[c] = True
                add = cv[1:] if enter_at_start else list(reversed(cv[:-1]))
                if fwd:
                    joints.append(vs[-1])
                    vs = vs + add
                else:
                    joints.append(vs[0])
                    vs = list(reversed(add)) + vs
                end = 2 * c + 1 if enter_at_start else 2 * c
        strokes.append((vs, joints))

    tol = STROKE_SIMPLIFY * float(ground.graph.size)
    lines = []
    for vs, _ in strokes:
        xs, ys = [sd.vx[v] for v in vs], [sd.vy[v] for v in vs]
        keep = simplify(xs, ys, tol)
        lines.append(([vs[k] for k in keep], [xs[k] for k in keep], [ys[k] for k in keep]))
    sum_x, sum_y, count = {}, {}, {}
    for k, (_, joints) in enumerate(strokes):
        for v in joints:
            px, py, _ = _project(lines[k][1], lines[k][2], sd.vx[v], sd.vy[v])
            sum_x[v] = sum_x.get(v, 0.0) + px
            sum_y[v] = sum_y.get(v, 0.0) + py
            count[v] = count.get(v, 0) + 1

    def pos_x(v):
        return sum_x[v] / count[v] if v in count else sd.vx[v]

    def pos_y(v):
        return sum_y[v] / count[v] if v in count else sd.vy[v]
    out = []
    for k, (vs, joints) in enumerate(strokes):
        keep, lx, ly = lines[k]
        is_joint = set(joints)
        mid = []
        for i in range(1, len(keep) - 1):
            if keep[i] in is_joint:
                continue
            mid.append((_project(lx, ly, lx[i], ly[i])[2], 0, lx[i], ly[i]))
        for v in joints:
            mid.append((_project(lx, ly, sd.vx[v], sd.vy[v])[2], 1, pos_x(v), pos_y(v)))
        mid.sort()
        out.append(([pos_x(vs[0])] + [m[2] for m in mid] + [pos_x(vs[-1])],
                    [pos_y(vs[0])] + [m[3] for m in mid] + [pos_y(vs[-1])]))
    return out


def buffer_of(ground) -> list:
    """The existing streets of the buffer, those off this ground (cached on it)."""
    hit = getattr(ground, "_syntax_buffer", None)
    if hit is None:
        idx = ground_index(ground)
        hit = ground._syntax_buffer = [s for s in (getattr(ground, "syntax_streets", None) or [])
                                       if not idx.has((s[0] + s[2]) / 2, (s[1] + s[3]) / 2)]
    return hit


def roads_on(ground) -> list:
    """The existing major roads over the design ground (landform skeletons only)."""
    hit = getattr(ground, "_syntax_roads", None)
    if hit is None:
        hit = []
        sk = getattr(ground, "skeleton", None)
        if (sk or {}).get("source") != "roads":
            idx = ground_index(ground)
            for line in ground.roads or []:
                for k in range(1, len(line)):
                    x0, y0 = line[k - 1][0], line[k - 1][1]
                    x1, y1 = line[k][0], line[k][1]
                    if idx.has((x0 + x1) / 2, (y0 + y1) / 2):
                        hit.append([x0, y0, x1, y1])
        ground._syntax_roads = hit
    return hit


def network(net) -> Network:
    """The network of a design (net: pc.metrics.network.Net)."""
    from pc.metrics.network import site_of
    ground, S = net.ground, site_of(net.ground)
    B = Builder()
    for xs, ys in (street_strokes(ground, net.street) if net.street else []):
        for k in range(1, len(xs)):
            B.segment(B.vertex(xs[k - 1], ys[k - 1]), B.vertex(xs[k], ys[k]))
    for x0, y0, x1, y1 in roads_on(ground):
        B.segment(B.vertex(x0, y0), B.vertex(x1, y1))
    site, site_verts = len(B.a), len(B.vx)
    for x0, y0, x1, y1 in buffer_of(ground):
        B.segment(B.vertex(x0, y0), B.vertex(x1, y1))
    deg = [0] * len(B.vx)
    for s in range(len(B.a)):
        deg[B.a[s]] += 1
        deg[B.b[s]] += 1
    idx, reach = ground_index(ground), S.size + LINK_M
    links, nb = 0, len(B.a)
    for s in range(site, nb):
        for v in (B.a[s], B.b[s]):
            if v < site_verts or deg[v] != 1 or not idx.near(B.vx[v], B.vy[v], reach):
                continue
            best, bd = -1, LINK_M * LINK_M
            for u in range(site_verts):
                dd = (B.vx[u] - B.vx[v]) ** 2 + (B.vy[u] - B.vy[v]) ** 2
                if dd < bd:
                    bd, best = dd, u
            if best >= 0:
                B.segment(best, v)
                deg[v] += 1
                links += 1
    return Network(B.vx, B.vy, B.a, B.b, site, links)


# --- the segment graph ------------------------------------------------------------------------

class Dual:
    def __init__(self, start, to, cost):
        self.start, self.to, self.cost = start, to, cost


def dual(N) -> Dual:
    n, nv = len(N.a), len(N.vx)
    at = [[] for _ in range(nv)]
    for s in range(n):
        at[N.a[s]].append(s)
        at[N.b[s]].append(s)
    start, to, cost = [0] * (n + 1), [], []
    for s in range(n):
        start[s] = len(to)
        for v in (N.a[s], N.b[s]):
            p = N.b[s] if N.a[s] == v else N.a[s]
            ux, uy = N.vx[v] - N.vx[p], N.vy[v] - N.vy[p]
            for t in at[v]:
                if t == s:
                    continue
                q = N.b[t] if N.a[t] == v else N.a[t]
                wx, wy = N.vx[q] - N.vx[v], N.vy[q] - N.vy[v]
                turn = math.atan2(abs(ux * wy - uy * wx), ux * wx + uy * wy)
                to.append(t)
                cost.append(math.floor((turn / (math.pi / 2)) * TURN_UNITS + 0.5))
    start[n] = len(to)
    return Dual(start, to, cost)


# --- analysis ---------------------------------------------------------------------------------

def analyse(N, D, radius, origins) -> tuple[list, list, list]:
    """Least-angle paths (ties by length) within a metric radius from each origin: reach (nc),
    total depth in units of 90° (td), and choice (ch, summed over origins; Brandes 2001)."""
    n = len(N.a)
    length, start, to, cost = N.len, D.start, D.to, D.cost
    nc, td, ch = [0.0] * n, [0.0] * n, [0.0] * n
    for o in origins:
        dist, metric, sigma, preds = {o: 0}, {o: 0.0}, {o: 1.0}, {o: []}
        done, order, heap = set(), [], [(0, 0.0, o)]
        reached = depth = 0
        while heap:
            c, m, s = heapq.heappop(heap)
            if s in done or c != dist[s] or m != metric[s]:
                continue
            done.add(s)
            order.append(s)
            if s != o:
                reached += 1
                depth += c
            half = length[s] / 2
            for e in range(start[s], start[s + 1]):
                t = to[e]
                if t in done:
                    continue
                c2, m2 = c + cost[e], m + half + length[t] / 2
                if m2 > radius:
                    continue
                dt = dist.get(t)
                if dt is None or c2 < dt or (c2 == dt and m2 < metric[t]):
                    dist[t], metric[t], sigma[t], preds[t] = c2, m2, sigma[s], [s]
                    heapq.heappush(heap, (c2, m2, t))
                elif c2 == dt and m2 == metric[t]:
                    sigma[t] += sigma[s]
                    preds[t].append(s)
        nc[o], td[o] = float(reached), depth / TURN_UNITS
        delta = {}
        for i in range(len(order) - 1, 0, -1):
            w = order[i]
            dw = delta.get(w, 0.0)
            f = (1 + dw) / sigma[w]
            for p in preds[w]:
                delta[p] = delta.get(p, 0.0) + sigma[p] * f
            ch[w] += dw
    return nc, td, ch


def depths(n, start, to, cost, origins, weight=None, offset=None) -> tuple[list, list]:
    """Depths with no radius, by a bucket queue on the integer costs (Dial 1969); each node
    counts weight[s] times at its depth, plus offset[s] (defaults 1 and 0)."""
    nc, td = [0.0] * n, [0.0] * n
    W = (max(cost) if cost else 0) + 1
    for o in origins:
        buckets = [[] for _ in range(W)]
        dist, done = {o: 0}, set()
        buckets[0].append(o)
        pending, cur, reached, depth = 1, 0, 0.0, 0.0
        while pending:
            b = buckets[cur % W]
            if not b:
                cur += 1
                continue
            s = b.pop()
            pending -= 1
            if s in done or dist[s] != cur:
                continue
            done.add(s)
            if s != o:
                w = weight[s] if weight is not None else 1
                reached += w
                depth += w * cur + (offset[s] if offset is not None else 0)
            for e in range(start[s], start[s + 1]):
                t = to[e]
                if t in done:
                    continue
                c2 = cur + cost[e]
                dt = dist.get(t)
                if dt is None or c2 < dt:
                    dist[t] = c2
                    buckets[c2 % W].append(t)
                    pending += 1
        nc[o], td[o] = reached, depth / TURN_UNITS
    return nc, td


def costs_from(n, start, to, cost, src) -> list:
    """Least-angle cost from one node to every other (-1: unreached)."""
    W = (max(cost) if cost else 0) + 1
    buckets = [[] for _ in range(W)]
    dist, done = [-1] * n, [False] * n
    dist[src] = 0
    buckets[0].append(src)
    pending, cur = 1, 0
    while pending:
        b = buckets[cur % W]
        if not b:
            cur += 1
            continue
        s = b.pop()
        pending -= 1
        if done[s] or dist[s] != cur:
            continue
        done[s] = True
        for e in range(start[s], start[s + 1]):
            t, c2 = to[e], cur + cost[e]
            if not done[t] and (dist[t] < 0 or c2 < dist[t]):
                dist[t] = c2
                buckets[c2 % W].append(t)
                pending += 1
    return dist


def integration_rn(N, D, origins) -> tuple[list, list]:
    """Exact Rn integration for some origins."""
    return depths(len(N.a), D.start, D.to, D.cost, origins)


# --- condensed Rn: the buffer reduced to its gateways (see the TS file) --------------------------

def buffer_net(ground):
    hit = getattr(ground, "_syntax_buffer_net", None)
    if hit is None:
        B = Builder()
        for x0, y0, x1, y1 in buffer_of(ground):
            B.segment(B.vertex(x0, y0), B.vertex(x1, y1))
        N = Network(B.vx, B.vy, B.a, B.b, 0, 0)
        hit = ground._syntax_buffer_net = {"n": len(B.a), "dual": dual(N), "from": {}}
    return hit


def integration_rn_condensed(N, D, ground) -> tuple[list, list]:
    n, bn = len(N.a), buffer_net(ground)
    first, last = N.site, n - N.links
    if last - first != bn["n"]:
        raise RuntimeError("the buffer network is out of step with the design's")

    def is_buf(s):
        return first <= s < last
    gate, is_gate = [], [False] * n
    for s in range(n):
        if is_buf(s):
            continue
        for e in range(D.start[s], D.start[s + 1]):
            t = D.to[e]
            if is_buf(t) and not is_gate[t]:
                is_gate[t] = True
                gate.append(t)
    gate.sort()
    bd = bn["dual"]
    costs = []
    for g in gate:
        c = bn["from"].get(g - first)
        if c is None:
            c = bn["from"][g - first] = costs_from(bn["n"], bd.start, bd.to, bd.cost, g - first)
        costs.append(c)
    keep, nodes = [-1] * n, []
    for s in range(n):
        if not is_buf(s):
            keep[s] = len(nodes)
            nodes.append(s)
    for g in gate:
        keep[g] = len(nodes)
        nodes.append(g)
    m = len(nodes)
    weight, offset = [1.0] * m, [0.0] * m
    for g in gate:
        weight[keep[g]] = 0.0
    for b in range(bn["n"]):
        best, bc = -1, 0
        for k in range(len(gate)):
            c = costs[k][b]
            if c >= 0 and (best < 0 or c < bc):
                best, bc = k, c
        if best >= 0:
            weight[keep[gate[best]]] += 1
            offset[keep[gate[best]]] += bc
    start, to, cost = [0] * (m + 1), [], []
    gi = {g: k for k, g in enumerate(gate)}
    for k in range(m):
        start[k] = len(to)
        s = nodes[k]
        for e in range(D.start[s], D.start[s + 1]):
            t = D.to[e]
            if keep[t] >= 0 and not (is_buf(s) and is_buf(t)):
                to.append(keep[t])
                cost.append(D.cost[e])
        if is_gate[s]:
            k1 = gi[s]
            c = costs[k1]
            for k2, g2 in enumerate(gate):
                c12 = c[g2 - first]
                if k2 == k1 or c12 < 0:
                    continue
                beaten = False
                for k3 in range(len(gate)):
                    if k3 in (k1, k2):
                        continue
                    c13, c32 = c[gate[k3] - first], costs[k3][g2 - first]
                    if c13 >= 0 and c32 >= 0 and c13 + c32 < c12:
                        beaten = True
                        break
                if not beaten:
                    to.append(keep[g2])
                    cost.append(c12)
    start[m] = len(to)
    origins = list(range(N.site))
    r_nc, r_td = depths(m, start, to, cost, origins, weight, offset)
    nc, td = [0.0] * n, [0.0] * n
    for s in origins:
        nc[s], td[s] = r_nc[s], r_td[s]
    return nc, td


# --- per design ---------------------------------------------------------------------------------

def nain(nc, td) -> float:
    return nc ** 1.2 / (td + 2)


def nach(ch, td) -> float:
    return math.log(ch + 1) / math.log(td + 3)


def reach(N, radius) -> list:
    """Segments whose middle is within `radius` of a site segment's middle (every origin
    whose paths can reach a site segment within the radius)."""
    n, B = len(N.a), radius
    mx = [(N.vx[N.a[s]] + N.vx[N.b[s]]) / 2 for s in range(n)]
    my = [(N.vy[N.a[s]] + N.vy[N.b[s]]) / 2 for s in range(n)]
    buckets, out = {}, []
    for s in range(N.site):
        buckets.setdefault((math.floor(mx[s] / B), math.floor(my[s] / B)), []).append(s)
    r2 = radius * radius
    for s in range(n):
        if s < N.site:
            out.append(s)
            continue
        x, y = mx[s], my[s]
        i0, j0 = math.floor(x / B), math.floor(y / B)
        near = False
        for i in range(i0 - 1, i0 + 2):
            for j in range(j0 - 1, j0 + 2):
                for t in buckets.get((i, j), ()):
                    if (mx[t] - x) ** 2 + (my[t] - y) ** 2 <= r2:
                        near = True
                        break
                if near:
                    break
            if near:
                break
        if near:
            out.append(s)
    return out


def measures(radius, site, nc, td, ch) -> dict:
    out = {"radius": radius, "nc": [nc[s] for s in range(site)], "td": [td[s] for s in range(site)],
           "nain": [nain(nc[s], td[s]) for s in range(site)], "ch": None, "nach": None}
    if ch is not None:  # each pair was counted from both ends
        out["ch"] = [ch[s] / 2 for s in range(site)]
        out["nach"] = [nach(ch[s] / 2, td[s]) for s in range(site)]
    return out


def syntax_of(net, estimate=False) -> dict:
    """A design's space syntax (net: pc.metrics.network.Net), cached on the net: exact, or the
    run's estimate (integration only; Rn on the condensed network)."""
    cache = net.__dict__.setdefault("_syntax", {})
    hit = cache.get("estimate", cache.get("exact")) if estimate else cache.get("exact")
    if hit is not None:
        return hit
    base = cache.get("exact") or cache.get("estimate")
    N = base["N"] if base else network(net)
    D = base["D"] if base else dual(N)
    site = list(range(N.site))
    local = []
    for r in RADII[:2]:
        nc, td, ch = analyse(N, D, r, site if estimate else reach(N, r))
        local.append(measures(r, N.site, nc, td, None if estimate else ch))
    if estimate and getattr(net.ground, "syntax_streets", None):
        nc, td = integration_rn_condensed(N, D, net.ground)
    else:
        nc, td = integration_rn(N, D, site)
    out = {"N": N, "D": D, "local": local, "rn": measures(math.inf, N.site, nc, td, None), "estimate": estimate}
    cache["estimate" if estimate else "exact"] = out
    return out


def choice_rn(net) -> dict:
    """Exact Rn choice: least-angle paths from every segment of the network."""
    cache = net.__dict__.setdefault("_syntax", {})
    if "choice" not in cache:
        S = syntax_of(net)
        N, D = S["N"], S["D"]
        n = len(N.a)
        ch, td, nc = [0.0] * n, [0.0] * n, [0.0] * n
        step = 256
        for k in range(0, n, step):
            part = list(range(k, min(n, k + step)))
            r_nc, r_td, r_ch = analyse(N, D, math.inf, part)
            for s in range(n):
                ch[s] += r_ch[s]
            for s in part:
                nc[s], td[s] = r_nc[s], r_td[s]
        cache["choice"] = measures(math.inf, N.site, nc, td, ch)
    return cache["choice"]
