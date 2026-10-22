"""Prevailing wind: ERA5 hourly 10 m wind (Hersbach et al. 2023) through Open-Meteo's
historical weather API (no key; free for non-commercial use; data CC BY 4.0). docs/streets.md.

ERA5 is a 0.25° reanalysis (about 25 km), so this is the regional wind, not the wind in the
site's streets: buildings, sea breezes at the shore and hills change it locally. The API
returns the nearest grid point, which can be over 15 km away; its position is kept.

For each season the hours with wind (at least CALM_MS) are summed into a 16-sector rose of
where the wind blows from. The prevailing axis is the length-weighted circular mean of the
doubled bearings (a street on it serves wind from either end), with its consistency
(0: no preferred axis, 1: always on it). Streets read the hot-season afternoon (the months of
`site.lst_months`, 14:00-17:00 local, the hours the shade score uses).
"""

import json
import math
import urllib.parse
import urllib.request
from pathlib import Path

import numpy as np

from pc.site import ROOT, Site, utc_offset_of

API = "https://archive-api.open-meteo.com/v1/archive"
YEARS = (2015, 2024)
CALM_MS = 0.5
SECTORS = 16
AFTERNOON = (14, 17)  # local hours, both included (as the shade score)
CREDIT = ("Wind: ERA5 hourly 10 m wind, Hersbach et al. 2023, Copernicus Climate Change Service, "
          "via Open-Meteo.com (CC BY 4.0; free API for non-commercial use)")


def fetch_wind(site: Site):
    w, s, e, n = site.bbox
    lat, lon = (s + n) / 2, (w + e) / 2
    q = urllib.parse.urlencode({
        "latitude": round(lat, 4), "longitude": round(lon, 4),
        "start_date": f"{YEARS[0]}-01-01", "end_date": f"{YEARS[1]}-12-31",
        "hourly": "wind_speed_10m,wind_direction_10m", "models": "era5",
        "wind_speed_unit": "ms", "timezone": "GMT",
    })
    d = json.load(urllib.request.urlopen(f"{API}?{q}", timeout=300))
    out = summarise(d, lat, lon, site.lst_months, utc_offset_of(site, lon, lat)[0])
    site.raw.mkdir(parents=True, exist_ok=True)
    (site.raw / "wind.json").write_text(json.dumps(out, indent=1), encoding="utf-8")
    print(f"  wind: from ERA5 at {out['grid_point']} ({out['grid_point_km']} km away); "
          f"hot afternoons {out['bearing_deg']}° (consistency {out['seasons']['hot_afternoon']['consistency']})")


def summarise(d: dict, lat: float, lon: float, hot: tuple, offset_h: float) -> dict:
    h = d["hourly"]
    speed = np.array([np.nan if v is None else v for v in h["wind_speed_10m"]], dtype=float)
    frm = np.array([np.nan if v is None else v for v in h["wind_direction_10m"]], dtype=float)
    hours = np.array([int(t[11:13]) for t in h["time"]])
    months = np.array([int(t[5:7]) for t in h["time"]])
    local = (hours + offset_h) % 24
    local_month = months  # an hour's month shifts only across midnight on the last day; ignored
    ok = np.isfinite(speed) & np.isfinite(frm)
    m0, m1 = hot
    seasons = {
        "year": ok,
        "hot": ok & (local_month >= m0) & (local_month <= m1),
        "hot_afternoon": ok & (local_month >= m0) & (local_month <= m1)
                         & (local >= AFTERNOON[0]) & (local < AFTERNOON[1] + 1),
        "monsoon": ok & (local_month >= 6) & (local_month <= 9),
        "winter": ok & ((local_month == 12) | (local_month <= 2)),
    }
    out_s = {k: season(speed[m], frm[m]) for k, m in seasons.items()}
    glat, glon = d["latitude"], d["longitude"]
    km = 6371 * math.hypot(math.radians(glat - lat), math.radians(glon - lon) * math.cos(math.radians(lat)))
    return {
        "source": "ERA5 (0.25°) via Open-Meteo historical weather API", "years": list(YEARS),
        "grid_point": [glon, glat], "grid_point_km": round(km, 1), "regional": True,
        "hot_months": [m0, m1], "afternoon_local_h": list(AFTERNOON), "utc_offset_h": offset_h,
        "calm_ms": CALM_MS, "bearing_deg": out_s["hot_afternoon"].get("axis_deg"), "bearing_from": "hot_afternoon",
        "seasons": out_s, "credit": CREDIT,
    }


def season(speed: np.ndarray, frm: np.ndarray) -> dict:
    windy = speed >= CALM_MS
    s, f = speed[windy], frm[windy]
    if not len(s):
        return {"hours": int(len(speed)), "calm": 1.0}
    sector = np.round(f / (360 / SECTORS)).astype(int) % SECTORS
    rose = np.bincount(sector, minlength=SECTORS) / len(speed)
    th = np.radians(2 * f)
    c, sn = np.cos(th).mean(), np.sin(th).mean()
    axis = (math.degrees(math.atan2(sn, c)) / 2) % 180
    return {
        "hours": int(len(speed)), "calm": round(float(1 - windy.mean()), 3),
        "mean_ms": round(float(s.mean()), 2),
        "prevailing_from_deg": round(int(np.argmax(rose)) * 360 / SECTORS, 1),
        "rose": [round(float(x), 4) for x in rose],
        "axis_deg": round(axis, 1), "consistency": round(float(math.hypot(c, sn)), 2),
    }


def meta(site: Site) -> dict | None:
    p = site.raw / "wind.json"
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else None


def patch_export(site: Site, path: Path | None = None):
    """Add the wind to an exported site file without a full export."""
    path = path or ROOT / "app" / "public" / "sites" / f"{site.id}.json"
    w = meta(site)
    if not w or not path.exists():
        return False
    d = json.loads(path.read_text(encoding="utf-8"))
    d["meta"]["wind"] = w
    if w["credit"] not in d["meta"]["credits"]:
        d["meta"]["credits"].append(w["credit"])
    path.write_text(json.dumps(d, separators=(",", ":")), encoding="utf-8")
    return True


if __name__ == "__main__":
    import sys

    from pc.site import load
    for sid in sys.argv[1:]:
        st = load(sid)
        if not meta(st):
            fetch_wind(st)
        print(sid, "patched" if patch_export(st) else "not exported")
