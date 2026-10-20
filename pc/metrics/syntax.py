"""Space syntax readouts and legibility (app/engine/metrics/syntax.ts; docs/metrics.md,
"Space syntax"). Line for line as the TS file."""

import math

from pc.metrics.network import BUILDING, LEGIBLE_M, NEAR_NODE_M, STOREY_M, Net, landmarks, pearson
from pc.syntax import cell_at, syntax_of

CORE_SHARE = 0.1
EYE_M = 1.6
CORE_STEP_M = 20.0


def site_mean(S, v) -> float:
    """Length-weighted mean of a per-segment measure over the site (skipping missing values)."""
    N, s, w = S["N"], 0.0, 0.0
    for k in range(N.site):
        if v[k] is None or not math.isfinite(v[k]):
            continue
        s += v[k] * N.len[k]
        w += N.len[k]
    return s / w if w else 0


def _at(S, r):
    return S["rn"] if r == math.inf else next(m for m in S["local"] if m["radius"] == r)


def nain_mean(r):
    return lambda net, estimate=False: site_mean(syntax_of(net, estimate), _at(syntax_of(net, estimate), r)["nain"])


def nach_mean(r):
    return lambda net, estimate=False: site_mean(syntax_of(net, estimate), _at(syntax_of(net, estimate), r)["nach"])


def _rn_segments(S) -> list:
    return [k for k in range(S["N"].site) if math.isfinite(S["rn"]["nain"][k])]


def intelligibility(net: Net, estimate=False) -> float:
    S = syntax_of(net, estimate)
    segs, local = _rn_segments(S), _at(S, 400.0)
    return pearson([local["nain"][k] for k in segs], [S["rn"]["nain"][k] for k in segs])


def core(S) -> list:
    """The integration core: site segments in order of Rn NAIN until CORE_SHARE of the length."""
    N, v = S["N"], S["rn"]["nain"]
    segs = sorted(_rn_segments(S), key=lambda k: (-v[k], k))
    total = 0.0
    for k in segs:
        total += N.len[k]
    out, acc = [], 0.0
    for k in segs:
        if out and acc >= CORE_SHARE * total:
            break
        out.append(k)
        acc += N.len[k]
    return out


def _seg_dist(px, py, ax, ay, bx, by) -> float:
    dx, dy = bx - ax, by - ay
    L2 = dx * dx + dy * dy
    t = max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / L2)) if L2 else 0
    ex, ey = px - ax - t * dx, py - ay - t * dy
    return math.sqrt(ex * ex + ey * ey)


def centres_on_core(net: Net, S, c) -> float:
    if not net.centres:
        return 0
    N, on = S["N"], 0
    for i in net.centres:
        if any(_seg_dist(net.S.x[i], net.S.y[i], N.vx[N.a[s]], N.vy[N.a[s]], N.vx[N.b[s]], N.vy[N.b[s]]) <= NEAR_NODE_M
               for s in c):
            on += 1
    return on / len(net.centres)


def viewpoints(S, c) -> list:
    N, out = S["N"], []
    for s in c:
        m = max(1, math.ceil(N.len[s] / CORE_STEP_M))
        for j in range(m):
            t = (j + 0.5) / m
            out.append((N.vx[N.a[s]] + t * (N.vx[N.b[s]] - N.vx[N.a[s]]), N.vy[N.a[s]] + t * (N.vy[N.b[s]] - N.vy[N.a[s]])))
    return out


def sees(net: Net, px, py, L) -> bool:
    S = net.S
    dx, dy = S.x[L] - px, S.y[L] - py
    dist = math.sqrt(dx * dx + dy * dy)
    if dist > LEGIBLE_M:
        return False
    top, step = net.levels[L] * STOREY_M, S.spacing / 2
    m = math.floor(dist / step)
    for j in range(1, m):
        t = (j * step) / dist
        c = cell_at(net.ground, px + t * dx, py + t * dy)
        if c < 0 or c == L or net.use[c] != BUILDING:
            continue
        if net.levels[c] * STOREY_M > EYE_M + t * (top - EYE_M):
            return False
    return True


def landmarks_seen(net: Net, S, c) -> float:
    marks = landmarks(net)
    if not marks:
        return 0
    pts = viewpoints(S, c)
    seen = sum(1 for L in marks if any(sees(net, x, y, L) for x, y in pts))
    return seen / len(marks)


def legibility_parts(net: Net, estimate=False) -> dict:
    S = syntax_of(net, estimate)
    c = core(S)
    intel = intelligibility(net, estimate)
    centres, seen = centres_on_core(net, S, c), landmarks_seen(net, S, c)
    return {"intelligibility": intel, "centres": centres, "landmarks": seen, "core": c,
            "legibility": (max(0, intel) + centres + seen) / 3}


def legibility(net: Net, estimate=False) -> float:
    return legibility_parts(net, estimate)["legibility"]
