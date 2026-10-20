"""Space syntax (pc/syntax.py): cases a person can check by hand. The parity fixtures check
the Python and TypeScript engines agree segment by segment on every site."""

import math

from pc import syntax as sx


def _net(pts, segs):
    return sx.Network([p[0] for p in pts], [p[1] for p in pts], [s[0] for s in segs], [s[1] for s in segs],
                      len(segs), 0)


def test_turn_costs():
    N = _net([(0, 0), (10, 0), (20, 0), (10, 10)], [(0, 1), (1, 2), (1, 3)])
    D = sx.dual(N)

    def cost(s, t):
        return next(D.cost[e] for e in range(D.start[s], D.start[s + 1]) if D.to[e] == t)
    assert cost(0, 1) == 0
    assert cost(0, 2) == sx.TURN_UNITS
    assert cost(1, 2) == sx.TURN_UNITS


def test_cross_depth_and_choice():
    N = _net([(0, 0), (50, 0), (-50, 0), (0, 50), (0, -50)], [(0, 1), (0, 2), (0, 3), (0, 4)])
    nc, td, ch = sx.analyse(N, sx.dual(N), math.inf, [0, 1, 2, 3])
    assert (nc[0], td[0]) == (3, 2)
    assert ch == [0, 0, 0, 0]


def test_line_choice_and_radius():
    N = _net([(0, 0), (100, 0), (200, 0), (300, 0)], [(0, 1), (1, 2), (2, 3)])
    D = sx.dual(N)
    assert sx.analyse(N, D, math.inf, [0, 1, 2])[2][1] == 2
    assert sx.analyse(N, D, 150, [0])[0][0] == 1
    assert sx.analyse(N, D, 200, [0])[0][0] == 2


def test_bucket_queue_matches_the_heap():
    pts = [(x * 30.0, y * 30.0) for y in range(4) for x in range(4)]
    segs = [(y * 4 + x, y * 4 + x + 1) for y in range(4) for x in range(3)] + \
           [(y * 4 + x, (y + 1) * 4 + x) for y in range(3) for x in range(4)]
    N = _net(pts, segs)
    D = sx.dual(N)
    origins = list(range(len(segs)))
    nc, td, _ = sx.analyse(N, D, math.inf, origins)
    nc2, td2 = sx.integration_rn(N, D, origins)
    assert nc == nc2 and td == td2


def test_simplify_straightens_a_zigzag():
    xs, ys = [0, 17.3, 34.6, 52, 69.3, 69.3, 69.3], [0, 10, 0, 10, 0, 40, 80]
    assert sx.simplify(xs, ys, 15) == [0, 4, 6]
