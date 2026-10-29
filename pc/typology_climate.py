"""Climate normals for the typology library (docs/typologies.md, "Climate match").

For every precedent's location (`at` in app/engine/typology/library/*.ts) and every site in
app/public/sites/sites.json, monthly normals from NASA POWER's climatology API (MERRA-2
reanalysis, about 0.5° × 0.625°, so a region's climate, not a street's; January 2001 to
December 2025): mean temperature and mean daily range (giving the mean daily maximum and
minimum as mean ± range / 2), rain (mm a day, times the days in the month) and relative
humidity. One request per place, so the whole library can be fetched in a few minutes.

Every place, sites included, comes from this one source, so a site and a precedent are
compared like with like. (The sites' wind, pc/wind.py, is ERA5 through Open-Meteo; that is a
different question and stays as it is.)

Writes app/engine/typology/climate.json:
  { "sources": ..., "years": [2001, 2025],
    "places": { "<precedent id>" | "site:<site id>": {
        "at": [lon, lat], "elev": m (the cell's), "name": site name,
        "tmax": [12 monthly means of the daily maximum, °C], "tmin": [...],
        "rain": [12 monthly totals, mm], "rh": [12 monthly means, %] } } }

Places already fetched are kept; run again after adding precedents. Usage:
  uv run python -m pc.typology_climate [--refetch]
"""

import json
import re
import subprocess
import sys
import time
import urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LIB = ROOT / "app" / "engine" / "typology" / "library"
SITES = ROOT / "app" / "public" / "sites" / "sites.json"
OUT = ROOT / "app" / "engine" / "typology" / "climate.json"
API = "https://power.larc.nasa.gov/api/temporal/climatology/point"
MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]
DAYS = [31, 28.25, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
SOURCE = ("NASA POWER climatology (MERRA-2 reanalysis, about 0.5° × 0.625°), monthly normals; "
          "data from the NASA Langley Research Center POWER Project")

ENTRY = re.compile(r'id: "([^"]+)",[^\n]*?at: \[(-?[\d.]+), (-?[\d.]+)\]')


def places():
    out = {}
    for f in sorted(LIB.glob("*.ts")):
        for m in ENTRY.finditer(f.read_text(encoding="utf-8")):
            out[m.group(1)] = (float(m.group(2)), float(m.group(3)))
    for sid, s in json.loads(SITES.read_text(encoding="utf-8")).items():
        out[f"site:{sid}"] = (s["origin"][0], s["origin"][1])
    return out


def fetch(lon: float, lat: float):
    # through curl: on some machines Python's TLS handshake with this host is reset while curl's
    # is not
    q = urllib.parse.urlencode({
        "parameters": "T2M,T2M_RANGE,PRECTOTCORR,RH2M", "community": "AG",
        "longitude": round(lon, 4), "latitude": round(lat, 4), "format": "JSON",
    })
    for attempt in range(6):
        try:
            out = subprocess.run(["curl", "-s", "--max-time", "90", f"{API}?{q}"], capture_output=True, check=True).stdout
            return json.loads(out)
        except Exception as e:  # rate limits, timeouts, the odd empty answer: back off and retry
            wait = 10 * (attempt + 1)
            print(f"  retry in {wait}s ({e})", file=sys.stderr)
            time.sleep(wait)
    raise RuntimeError(f"NASA POWER did not answer for {lon}, {lat}")


def normals(d):
    p = d["properties"]["parameter"]
    t, r = p["T2M"], p["T2M_RANGE"]
    ok = lambda v: v is not None and v > -900
    return {
        "tmax": [round(t[m] + r[m] / 2, 1) if ok(t[m]) and ok(r[m]) else None for m in MONTHS],
        "tmin": [round(t[m] - r[m] / 2, 1) if ok(t[m]) and ok(r[m]) else None for m in MONTHS],
        "rain": [round(p["PRECTOTCORR"][m] * DAYS[i], 1) if ok(p["PRECTOTCORR"][m]) else None for i, m in enumerate(MONTHS)],
        "rh": [round(p["RH2M"][m], 1) if ok(p["RH2M"][m]) else None for m in MONTHS],
        "elev": round(d["geometry"]["coordinates"][2]),
    }


def main():
    refetch = "--refetch" in sys.argv
    data = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() and not refetch else {"places": {}}
    if data.get("sources") != SOURCE:  # a different source: start again, never mix them
        data = {"places": {}}
    data["sources"], data["years"] = SOURCE, [2001, 2025]
    todo = {k: v for k, v in places().items() if k not in data["places"] or data["places"][k].get("at") != list(v)}
    print(f"{len(todo)} places to fetch", flush=True)
    failed = []
    for k, (lon, lat) in todo.items():
        try:
            data["places"][k] = {"at": [lon, lat], **normals(fetch(lon, lat))}
        except RuntimeError as e:  # skip it; a later run fills it in
            failed.append(k)
            print(f"  skipped {k}: {e}", file=sys.stderr)
            continue
        print(k, data["places"][k]["tmax"][:3], flush=True)
        OUT.write_text(json.dumps(data, separators=(",", ":")), encoding="utf-8")
        time.sleep(0.5)
    for sid, s in json.loads(SITES.read_text(encoding="utf-8")).items():
        if f"site:{sid}" in data["places"]:
            data["places"][f"site:{sid}"]["name"] = s["name"]
    OUT.write_text(json.dumps(data, separators=(",", ":")), encoding="utf-8")
    print("done", len(data["places"]), "failed", failed, flush=True)


if __name__ == "__main__":
    main()
