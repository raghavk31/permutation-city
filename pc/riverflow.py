"""How high the river stands through the year: modelled daily flow tied to reported levels.

    uv run pc river-flow <site>   → raw/river-flow.json

The gauge's own record couldn't be read (docs/architecture-v3.md section 15.9), and the satellite can't
see the monsoon. So this takes GloFAS's modelled daily flow and fits level = a + b ln(flow) through the
reported levels in the brief. The model doesn't know about barrage releases: it put the same flow on
two days whose reported levels differ by 2.4 m. So it gives a rough number of days a year above a
level, never what happened on a given day, and each anchor says how far the fit misses it.
"""
from __future__ import annotations

import json
import urllib.request
from datetime import date

import numpy as np

from pc.site import Site

FLOOD_API = "https://flood-api.open-meteo.com/v1/flood"
START = "2003-01-01"
FULL_YEARS_TO = 2025     # the last whole year counted, so a part year doesn't skew days a year
LEVEL_RANGE = (140.0, 160.0, 0.25)
CREDIT = "River flow: GloFAS, Copernicus Emergency Management Service, through Open-Meteo (CC BY 4.0)"


def _raw(site: Site):
    return site.raw / "river-flow.json"


def fetch_river_flow(site: Site, log=print) -> dict:
    """Daily flow at the site, kept as it came."""
    w, s, e, n = site.bbox
    lat, lon = (s + n) / 2, (w + e) / 2
    url = f"{FLOOD_API}?latitude={lat:.4f}&longitude={lon:.4f}&daily=river_discharge&start_date={START}&end_date={date.today().isoformat()}"
    with urllib.request.urlopen(url, timeout=120) as r:
        got = json.load(r)
    out = {"source": FLOOD_API, "latitude": got["latitude"], "longitude": got["longitude"],
           "time": got["daily"]["time"], "flow": got["daily"]["river_discharge"]}
    _raw(site).write_text(json.dumps(out))
    known = [v for v in out["flow"] if v is not None]
    log(f"  {len(known)} days of flow, median {np.median(known):.0f} m3/s, largest {max(known):.0f} m3/s, -> {_raw(site).name}")
    return out


def rating(flow: dict, anchors: list[dict]) -> dict:
    """Fit level to flow through the anchors, then days a year above each level.

    An anchor gives a level, and either a date (the flow that day) or `flow: median` (an ordinary day)."""
    by_day = {t: v for t, v in zip(flow["time"], flow["flow"]) if v is not None}
    whole = [(t, v) for t, v in by_day.items() if t[:4] <= str(FULL_YEARS_TO)]
    q = np.array([v for _, v in whole])
    points = []
    for a in anchors:
        at = float(np.median(q)) if a.get("flow") == "median" else by_day.get(a["date"])
        if at is None:
            raise ValueError(f"no modelled flow on {a.get('date')}")
        points.append((at, float(a["m"]), a["words"]))
    x = np.log([p[0] for p in points])
    y = np.array([p[1] for p in points])
    b, c = np.polyfit(x, y, 1)
    level = c + b * np.log(np.maximum(q, 1.0))
    years = len(q) / 365.25
    lo, hi, step = LEVEL_RANGE
    months = np.array([int(t[5:7]) for t, _ in whole])
    return {
        "source": CREDIT, "years": [int(whole[0][0][:4]), FULL_YEARS_TO], "a": round(float(c), 3), "b": round(float(b), 3),
        "anchors": [{"words": w, "flow": round(f, 1), "m": m, "miss": round(float(m - (c + b * np.log(f))), 2)} for f, m, w in points],
        "days": [{"z": float(z), "days": round(float((level > z).sum() / years), 1)} for z in np.arange(lo, hi + step / 2, step)],
        "months": [round(float(np.median(level[months == k])), 1) for k in range(1, 13)],
    }


def load(site: Site) -> dict | None:
    return json.loads(_raw(site).read_text()) if _raw(site).exists() else None
