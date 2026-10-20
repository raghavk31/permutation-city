"""Harmony and variety, proportion and coherence (app/engine/metrics/harmony.ts; docs/metrics.md)."""

import math

from pc.metrics.network import BUILDING, LANDSCAPE, STOREY_M, Net


def entropy(counts, k) -> float:
    """Shannon entropy of counts (in the order given), over ln(k)."""
    if k < 2:
        return 0
    total = 0
    for c in counts:
        total += c
    if not total:
        return 0
    h = 0
    for c in counts:
        if c > 0:
            p = c / total
            h -= p * math.log(p)
    return h / math.log(k)


def height_entropy(net: Net) -> float:
    top = max(net.S.cap) if net.S.cap else 0
    counts = [0] * max(top, 1)
    for i in range(net.S.n):
        if net.use[i] == BUILDING:
            counts[net.levels[i] - 1] += 1
    return entropy(counts, top)


def use_entropy(net: Net) -> float:
    counts = [0, 0, 0]
    for u in net.use:
        counts[u - 1] += 1
    return entropy(counts, 3)


def type_entropy(net: Net) -> float:
    counts = [0, 0, 0, 0, 0]
    for i in range(net.S.n):
        u, lv = net.use[i], net.levels[i]
        if u == BUILDING:
            counts[0 if lv <= 4 else 1 if lv <= 8 else 2] += 1
        else:
            counts[3 if u == LANDSCAPE else 4] += 1
    return entropy(counts, 5)


def coherence(net: Net) -> float:
    """A small palette of reused proportions of plan and massing across blocks."""
    S, keys = net.S, []
    for cells in net.blocks:
        if len(cells) < 3:
            continue
        mx = my = lv = 0
        for i in cells:
            mx += S.x[i]
            my += S.y[i]
            lv += net.levels[i]
        n = len(cells)
        mx /= n
        my /= n
        lv /= n
        sxx = syy = sxy = 0
        for i in cells:
            x, y = S.x[i] - mx, S.y[i] - my
            sxx += x * x
            syy += y * y
            sxy += x * y
        sxx /= n
        syy /= n
        sxy /= n
        t, det = sxx + syy, sxx * syy - sxy * sxy
        root = math.sqrt(max((t * t) / 4 - det, 0))
        big, small = t / 2 + root, t / 2 - root
        aspect = min(math.sqrt(big / small), 8) if small > 0 else 8
        massing = (lv * STOREY_M) / math.sqrt(n * S.cell_area)
        ia = min(math.floor(math.log2(aspect) * 2), 5)
        im = min(max(math.floor(math.log2(massing) * 2), -8), 4)
        keys.append(ia * 100 + im)
    if len(keys) < 2:
        return 1
    tally = {}
    for k in keys:
        tally[k] = tally.get(k, 0) + 1
    return 1 - entropy([tally[k] for k in sorted(tally)], len(keys))
