"""Seeded random numbers, identical in Python and the browser (app/engine/rng.ts).

mulberry32: a small 32-bit generator, written here with integer arithmetic so every draw
matches the JavaScript one bit for bit. Normal draws use the Irwin-Hall sum of 12 uniforms
(mean 0, variance 1, bounded at ±6σ) instead of Box-Muller: it needs only additions, so
there is no log or cos whose last digit could differ between the two languages' maths
libraries. Mutation noise is clipped to 0..1 anyway, so the bounded tails don't matter.

With one generator in both engines, the same seed gives the same run in Python and in the
browser, and parity can cover whole evolutions (test/parity).
"""

M32 = 0xFFFFFFFF


def _imul(a: int, b: int) -> int:
    return (a * b) & M32


class Rng:
    def __init__(self, seed: int = 1):
        self.t = seed & M32

    def random(self) -> float:
        """A uniform draw in [0, 1)."""
        self.t = (self.t + 0x6D2B79F5) & M32
        t = self.t
        r = _imul(t ^ (t >> 15), 1 | t)
        r ^= (r + _imul(r ^ (r >> 7), 61 | r)) & M32
        return ((r ^ (r >> 14)) & M32) / 4294967296

    def normal(self, mu: float = 0.0, sigma: float = 1.0) -> float:
        s = 0.0
        for _ in range(12):
            s += self.random()
        return mu + sigma * (s - 6.0)

    def integer(self, n: int) -> int:
        """A uniform integer in [0, n)."""
        return int(self.random() * n)
