"""One-day rainfall return levels at each site from IMD 0.25 deg gridded daily rainfall
(Pai et al. 2014): annual maxima, GEV by L-moments (Hosking 1990; Hosking and Wallis 1997).
Not a project dependency: run with
    uvx --with imdlib --from imdlib python -I pc/imd_rain.py <folder for the IMD files>
The first run downloads 1951-2024 (74 files, 1.9 GB). The result (imd_rain.json) is copied
by hand into app/engine/scenarios.ts RAIN; see docs/shocks.md."""
import json
import math
import sys

import imdlib as imd
import numpy as np

SITES = {  # site origin (lat, lon), from the exports' meta.origin
    "mumbai": (18.9549, 72.8443),
    "ahmedabad": (23.0610, 72.5811),
    "bengaluru": (12.9070, 77.6709),
    "guwahati": (26.1590, 91.7800),
}
RPS = [10, 25, 50, 100]


def lmoments(x):
    x = np.sort(np.asarray(x, float))
    n = len(x)
    j = np.arange(1, n + 1)
    b0 = x.mean()
    b1 = np.sum((j - 1) / (n - 1) * x) / n
    b2 = np.sum((j - 1) * (j - 2) / ((n - 1) * (n - 2)) * x) / n
    l1, l2, l3 = b0, 2 * b1 - b0, 6 * b2 - 6 * b1 + b0
    return l1, l2, l3 / l2


def gev_fit(x):
    """Hosking's approximation: k from t3, then alpha and xi."""
    l1, l2, t3 = lmoments(x)
    c = 2 / (3 + t3) - math.log(2) / math.log(3)
    k = 7.8590 * c + 2.9554 * c * c
    g = math.gamma(1 + k)
    alpha = l2 * k / ((1 - 2 ** (-k)) * g)
    xi = l1 - alpha * (1 - g) / k
    return xi, alpha, k


def gev_quantile(xi, alpha, k, T):
    F = 1 - 1 / T
    return xi + alpha / k * (1 - (-math.log(F)) ** k)


def main(folder):
    import os
    if len([f for f in os.listdir(os.path.join(folder, "rain")) if f.endswith(".grd")]) < 74:
        imd.get_data("rain", 1951, 2024, fn_format="yearwise", file_dir=folder)
    data = imd.open_data("rain", 1951, 2024, "yearwise", folder)
    ds = data.get_xarray()
    rain = ds["rain"]
    out = {}
    for name, (lat, lon) in SITES.items():
        # nearest cell with data (coastal cells are ocean, -999)
        lats, lons = rain["lat"].values, rain["lon"].values
        best = None
        for la in lats[np.abs(lats - lat) <= 0.5]:
            for lo in lons[np.abs(lons - lon) <= 0.5]:
                s = rain.sel(lat=la, lon=lo).values
                if np.nanmax(np.where(s < 0, np.nan, s)) > 0:
                    d = math.hypot(la - lat, (lo - lon) * math.cos(math.radians(lat)))
                    if best is None or d < best[0]:
                        best = (d, float(la), float(lo))
        _, la, lo = best
        s = rain.sel(lat=la, lon=lo).to_series()
        s = s.where(s >= 0)
        am = s.groupby(s.index.year).max().dropna()
        xi, alpha, k = gev_fit(am.values)
        wettest = s.idxmax()
        out[name] = {
            "cell": [la, lo], "years": [int(am.index.min()), int(am.index.max())], "n": int(len(am)),
            "gev": {"xi": round(xi, 2), "alpha": round(alpha, 2), "k": round(k, 4)},
            "levels": [{"years": T, "mm": round(gev_quantile(xi, alpha, k, T))} for T in RPS],
            "record": {"mm": round(float(s.max()), 1), "date": str(wettest.date())},
            "annual_max_median": round(float(am.median()), 1),
        }
        print(name, json.dumps(out[name]), flush=True)
    json.dump(out, open("imd_rain.json", "w"), indent=1)


if __name__ == "__main__":
    main(sys.argv[1])
