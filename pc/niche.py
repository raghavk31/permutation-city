"""NSGA-III survival: reference directions and niching (Deb and Jain 2014).

Two simplifications from the paper, both so Python and the browser (app/engine/niche.ts)
pick the same designs bit for bit: scores are normalised between the ideal and the worst
point of the candidates (no hyperplane intercepts, which need a linear solve), and ties go
to the lower index, not a random draw. Distances are compared squared, so there is no sqrt.
The arithmetic is plain Python floats in the browser's order (numpy's pairwise sums and
Python's compensated sum() would round differently).
"""

from math import comb

from pc.fitness import _as_min


def reference_points(m: int, p: int) -> list[list[float]]:
    """Das-Dennis points: every way to split 1 into `p` equal parts over `m` objectives."""
    out = []

    def rec(left, cur):
        if len(cur) == m - 1:
            out.append(cur + [left / p])
            return
        for i in range(left + 1):
            rec(left - i, cur + [i / p])

    rec(p, [])
    return out


def divisions_for(m: int, pop: int) -> int:
    """The fewest divisions that give at least one reference direction per design."""
    p = 1
    while comb(p + m - 1, m - 1) < pop:
        p += 1
    return p


def niche_select(chosen: list[dict], last: list[dict], need: int, refs: list[list[float]], obj=None) -> list[int]:
    """Which of `last` (the split front) survive: `need` indices into it, in the order
    picked. `chosen` are the designs already in (whole fronts); they fill the niches first."""
    f = [[float(v) for v in row] for row in _as_min(chosen + last, obj)]
    m, n, c = len(refs[0]), len(f), len(chosen)
    ideal, worst = list(f[0]), list(f[0])
    for row in f:
        for k in range(m):
            if row[k] < ideal[k]:
                ideal[k] = row[k]
            if row[k] > worst[k]:
                worst[k] = row[k]
    span = [(worst[k] - ideal[k]) or 1 for k in range(m)]
    ww = []
    for w in refs:
        s = 0.0
        for k in range(m):
            s += w[k] * w[k]
        ww.append(s)
    ref, dist = [0] * n, [0.0] * n
    for i in range(n):
        x = [(f[i][k] - ideal[k]) / span[k] for k in range(m)]
        xx = 0.0
        for k in range(m):
            xx += x[k] * x[k]
        best, best_d = -1, float("inf")
        for j, w in enumerate(refs):
            dot = 0.0
            for k in range(m):
                dot += x[k] * w[k]
            d = xx - (dot * dot) / ww[j]
            if d < best_d:
                best_d, best = d, j
        ref[i], dist[i] = best, best_d
    count = [0] * len(refs)
    for i in range(c):
        count[ref[i]] += 1
    open_, taken, out = [True] * len(refs), [False] * len(last), []
    while len(out) < need:
        j = -1
        for r in range(len(refs)):
            if open_[r] and (j < 0 or count[r] < count[j]):
                j = r
        pick = -1
        for i in range(len(last)):
            if not taken[i] and ref[c + i] == j and (pick < 0 or dist[c + i] < dist[c + pick]):
                pick = i
        if pick < 0:
            open_[j] = False
            continue
        taken[pick] = True
        out.append(pick)
        count[j] += 1
    return out
