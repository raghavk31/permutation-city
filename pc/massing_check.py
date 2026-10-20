"""Check a building-scale massing from its bench file (app/engine/massing/bench.ts).

Phase 7 geometry is TS only (decision D4). This module is the research bench's check on it:
it reads a massing the browser built, recomputes every score with the same arithmetic, and
checks the massing stands inside its envelope. It never grows or breeds a massing.

    uv run python -m pc.massing_check bench.json

Checks:
  envelope   every voxel on a buildable column, under the cap, with a voxel under it, and each
             plot within its coverage limit
  suns       the sun vectors match the dates, hours and site (Spencer declination; the hot
             season's local clock hours through the longitude, UTC offset and equation of time)
  scores     sun, shade, sky, wind, neighbours and gap recomputed from the voxels, the sample
             points and the sun vectors in the file: equal to the browser's, to the last digit
Heights are float32, as in the browser (Float32Array), so comparisons see the same numbers.
"""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import numpy as np


def unrle(r: list) -> list:
    out = []
    for k in range(0, len(r), 2):
        out.extend([r[k]] * r[k + 1])
    return out


# --- sun (app/engine/massing/sun.ts) -------------------------------------------------------

STARTS = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334]


def declination(doy: int) -> float:
    g = 2 * math.pi * (doy - 1) / 365
    return (0.006918 - 0.399912 * math.cos(g) + 0.070257 * math.sin(g) - 0.006758 * math.cos(2 * g)
            + 0.000907 * math.sin(2 * g) - 0.002697 * math.cos(3 * g) + 0.00148 * math.sin(3 * g))


def sun_dir(lat_deg: float, doy: int, hour: float) -> tuple:
    lat, dec, h = math.radians(lat_deg), declination(doy), math.radians((hour - 12) * 15)
    sin_alt = math.sin(lat) * math.sin(dec) + math.cos(lat) * math.cos(dec) * math.cos(h)
    e = -math.cos(dec) * math.sin(h)
    n = math.cos(lat) * math.sin(dec) - math.sin(lat) * math.cos(dec) * math.cos(h)
    ln = math.hypot(e, n, sin_alt) or 1
    return math.asin(max(-1, min(1, sin_alt))), (e / ln, n / ln, sin_alt / ln)


def equation_of_time(doy: int) -> float:
    """Hours, Spencer's series."""
    g = 2 * math.pi * (doy - 1) / 365
    minutes = 229.18 * (0.000075 + 0.001868 * math.cos(g) - 0.032077 * math.sin(g)
                        - 0.014615 * math.cos(2 * g) - 0.040849 * math.sin(2 * g))
    return minutes / 60


def solar_hour(clock, lon, utc, doy) -> float:
    return clock + (lon - 15 * utc) / 15 + equation_of_time(doy)


def _path(lat, doy, start, end, step, min_alt=5) -> list:
    out, k = [], 0
    while start + k * step <= end + 1e-9:
        alt, d = sun_dir(lat, doy, start + k * step)
        if alt >= math.radians(min_alt):
            out.append(d)
        k += 1
    return out


def sun_path(lat: float, when: dict) -> list:
    """WINTER: one date in solar hours."""
    return _path(lat, STARTS[when["month"] - 1] + when["day"], when["from"], when["to"], when["step"])


def hot_suns(lat, lon, utc, hot: dict) -> list:
    """HOT: local clock hours on each date, in solar time."""
    out = []
    for month, day in hot["dates"]:
        doy = STARTS[month - 1] + day
        out += _path(lat, doy, solar_hour(hot["from"], lon, utc, doy), solar_hour(hot["to"], lon, utc, doy), hot["step"])
    return out


# --- the massing ---------------------------------------------------------------------------

class Bench:
    def __init__(self, b: dict):
        self.b = b
        self.nx, self.ny, self.nz, self.res = b["nx"], b["ny"], b["nz"], b["res"]
        self.N = self.nx * self.ny
        c = b["constants"]
        self.storey, self.point_z, self.roof_z = c["STOREY_M"], c["POINT_Z"], c["ROOF_Z"]
        self.sky_reach = c["SKY_REACH_M"]
        self.plot_of = np.array(unrle(b["plotOf"]), dtype=np.int32)
        self.in_plot = np.array(unrle(b["inPlot"]), dtype=np.int32)
        self.cap_z = np.array(unrle(b["capZ"]), dtype=np.int32)
        self.public = np.array(unrle(b["publicGround"]), dtype=np.uint8)
        self.context = np.array(unrle(b["context"]), dtype=np.float32)
        self.existing = np.array(unrle(b["existing"]), dtype=np.float32)
        self.occ = np.array(unrle(b["occ"]), dtype=np.uint8).reshape(self.nz, self.N)

    def heights(self) -> np.ndarray:
        """As voxels.heights: the massing's top, or the context, per column (float32)."""
        h = self.context.copy()
        for q in range(self.N):
            col = self.occ[:, q]
            if col.any():
                top = int(np.nonzero(col)[0].max())
                h[q] = max(h[q], np.float32((top + 1) * self.storey))
        return h

    def envelope_problems(self) -> list:
        out = []
        for z in range(self.nz):
            on = np.nonzero(self.occ[z])[0]
            bad = on[(self.plot_of[on] < 0) | (z >= self.cap_z[on])]
            if len(bad):
                out.append(f"storey {z + 1}: {len(bad)} voxels outside the envelope")
            if z:
                floating = on[self.occ[z - 1, on] == 0]
                if len(floating):
                    out.append(f"storey {z + 1}: {len(floating)} voxels with nothing under them")
        foot = np.zeros(len(self.b["plots"]))
        for q in np.nonzero(self.occ[0])[0]:
            if self.plot_of[q] >= 0:
                foot[self.plot_of[q]] += self.res * self.res
        for k, p in enumerate(self.b["plots"]):
            if foot[k] > p["maxCover"] * p["area"] + 1e-9:
                out.append(f"plot {k + 1}: covers {foot[k]:.0f} m², limit {p['maxCover'] * p['area']:.0f} m²")
        return out

    # The same walks as scores.ts, in the same order.
    def blocked(self, h, hmax: float, q: int, d, z0=None) -> bool:
        res, nx, ny = self.res, self.nx, self.ny
        c, r = q % nx, q // nx
        x, y = (c + 0.5) * res, (r + 0.5) * res
        dx, dy, dz = d
        if dz <= 0:
            return True
        step_c, step_r = (1 if dx > 0 else -1), (1 if dy > 0 else -1)
        tdx = res / abs(dx) if dx != 0 else math.inf
        tdy = res / abs(dy) if dy != 0 else math.inf
        tx = (((c + 1) * res if dx > 0 else c * res) - x) / dx if dx != 0 else math.inf
        ty = (((r + 1) * res if dy > 0 else r * res) - y) / dy if dy != 0 else math.inf
        while True:
            if tx < ty:
                t = tx
                tx += tdx
                c += step_c
            else:
                t = ty
                ty += tdy
                r += step_r
            if c < 0 or r < 0 or c >= nx or r >= ny:
                return False
            z = (self.point_z if z0 is None else z0) + t * dz
            if z >= hmax:
                return False
            if float(h[r * nx + c]) > z:
                return True

    def sky_view(self, h, q: int) -> float:
        nx, ny = self.nx, self.ny
        c0, r0, steps = q % nx, q // nx, math.floor(self.sky_reach / self.res)
        s = 0.0
        for ux, uy in self.b["sky"]:
            best = 0.0
            for m in range(1, steps + 1):
                c, r = math.floor(c0 + 0.5 + ux * m), math.floor(r0 + 0.5 + uy * m)
                if c < 0 or r < 0 or c >= nx or r >= ny:
                    break
                t = (float(h[r * nx + c]) - self.point_z) / (m * self.res)
                if t > best:
                    best = t
            s += best * best / (1 + best * best)
        return 1 - s / len(self.b["sky"])

    def frontal(self) -> float:
        area = sum(p["area"] for p in self.b["plots"])
        if not area:
            return 0.0
        total = 0.0
        for px, py in self.b["wind"]:
            seen = set()
            for z in range(self.nz):
                for q in np.nonzero(self.occ[z])[0]:
                    q = int(q)
                    s = math.floor((q % self.nx) * px + (q // self.nx) * py + 1e6)
                    seen.add(z * 4194304 + s)
            total += len(seen) * self.res * self.storey
        return total / len(self.b["wind"]) / area

    def scores(self) -> dict:
        b, h, flat = self.b, self.heights(), self.occ[0]
        winter_step = b["constants"]["WINTER"]["step"]
        lit = n_g = 0
        for q in b["ground"]:
            if flat[q]:
                continue
            n_g += 1
            for d in b["winter"]:
                if not self.blocked(h, b["hmax"], q, d):
                    lit += 1
        shaded = n_p = 0
        sky = 0.0
        for q in b["public"]:
            if flat[q % self.N]:
                continue
            n_p += 1
            for d in b["hot"]:
                if self.blocked(h, b["hmax"], q, d):
                    shaded += 1
            sky += self.sky_view(h, q)
        taken = 0
        for q in b["roofs"]:
            z0 = float(self.existing[q]) + self.roof_z
            before = sum(1 for d in b["winter"] if not self.blocked(self.context, b["hmax"], q, d, z0))
            after = sum(1 for d in b["winter"] if not self.blocked(h, b["hmax"], q, d, z0))
            taken += before - after
        floor = float(self.occ.sum()) * self.res * self.res
        return {
            "sun": lit * winter_step / n_g if n_g else 0,
            "shade": shaded / (n_p * len(b["hot"])) if n_p and b["hot"] else 0,
            "sky": sky / n_p if n_p else 1,
            "wind": self.frontal(),
            "neighbours": taken * winter_step / len(b["roofs"]) if b["roofs"] else 0,
            "gap": abs(floor - b["target"]) / b["target"] if b["target"] > 0 else 0,
        }


def check(b: dict) -> dict:
    """Problems found (empty lists when the massing passes), and the recomputed scores."""
    m = Bench(b)
    c = b["constants"]
    sun_problems = []
    for name, mine in (("winter", sun_path(b["lat"], c["WINTER"])), ("hot", hot_suns(b["lat"], b["lon"], b["utc"], c["HOT"]))):
        if len(mine) != len(b[name]) or any(abs(u - v) > 1e-12 for p, q in zip(mine, b[name]) for u, v in zip(p, q)):
            sun_problems.append(f"{name} suns differ from the dates and the latitude")
    scores = m.scores()
    score_problems = [f"{k}: browser {b['scores'][k]!r}, here {v!r}" for k, v in scores.items() if v != b["scores"][k]]
    floor = float(m.occ.sum()) * m.res * m.res
    if floor != b["floor"]:
        score_problems.append(f"floor area: browser {b['floor']}, here {floor}")
    return {"envelope": m.envelope_problems(), "suns": sun_problems, "scores": score_problems, "recomputed": scores}


def main(argv: list[str]) -> int:
    bad = 0
    for path in argv:
        r = check(json.loads(Path(path).read_text(encoding="utf-8")))
        problems = r["envelope"] + r["suns"] + r["scores"]
        print(f"{path}: {'ok' if not problems else f'{len(problems)} problems'}")
        for p in problems:
            print(f"  {p}")
        bad += bool(problems)
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
