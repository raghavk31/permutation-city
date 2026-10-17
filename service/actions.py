"""One site build as GitHub Actions steps (.github/workflows/build-site.yml).

The app's /api/sites (app/sites/) starts the workflow with a cache key and the request; each
stage of the pipeline is its own workflow step, so the page can show which one is running
from the run's own step list. The steps share the runner's disk:

    uv run python -m service.actions setup        check the request, write the site folder
    uv run python -m service.actions elevation    (and: bare-earth, land-cover, overture,
                                                   layers, export)

Environment:
    KEY       the cache key (24 hex characters); empty for the smoke test
    REQUEST   the request as JSON (as the app sends it to the layer service)
    WORK      a folder for this build: site folders, downloads, release.txt, and
              out/site.json or out/error.json for the upload step

Without KEY, the steps build a tiny test site (2 ha in Mumbai): the smoke test the
workflow runs when it changes.
"""

import json
import os
import sys
import time
import traceback
from pathlib import Path

WORK = Path(os.environ.get("WORK", "build")).resolve()
os.environ.setdefault("PC_SITES", str(WORK / "sites"))
os.environ.setdefault("PC_DATA", str(WORK / "data"))

from service import pipeline  # noqa: E402  (after PC_SITES / PC_DATA are set)
from pc.site import load  # noqa: E402

SMOKE_KEY = "0" * 24
SMOKE_REQUEST = {
    "name": "Smoke test",
    "boundary": {"type": "Polygon", "coordinates": [[[72.8400, 18.9500], [72.8415, 18.9500], [72.8415, 18.9512],
                                                      [72.8400, 18.9512], [72.8400, 18.9500]]]},
    "grid": {"type": "hex", "size": 20},
}
OUT = WORK / "out"


def key() -> str:
    k = os.environ.get("KEY", "").strip()
    if not k:
        return SMOKE_KEY
    if not pipeline.KEY_RE.match(k):
        raise pipeline.Rejected("the key must be 24 hex characters")
    return k


def request() -> pipeline.Request:
    raw = os.environ.get("REQUEST", "").strip()
    return pipeline.request_from_json(json.loads(raw) if raw else SMOKE_REQUEST)


def site():
    return load(pipeline.site_id_for(key()))


def latest_release() -> str | None:
    """The latest Overture release (the catalogue drops connections now and then)."""
    from overturemaps.core import get_latest_release
    for attempt in range(4):
        try:
            return get_latest_release()
        except Exception:
            time.sleep(2 + 2 * attempt)
    return None


def setup():
    req = request()
    size = pipeline.check(req)
    pipeline.write_site(req, key())
    print(f"site {key()}: {size['km2']} km², about {size['cells']:,} cells")


def overture():
    release = latest_release()
    (WORK / "release.txt").write_text(release or "", encoding="utf-8")
    print(f"Overture release: {release or 'latest (unpinned)'}")
    pipeline.fetch_overture(site(), release, lambda step, detail=None: print(f"  {detail or ''}", flush=True))


def bare_earth():
    (WORK / "terrain.txt").write_text(pipeline.FETCHES[1](site()), encoding="utf-8")


def export():
    release = (WORK / "release.txt").read_text(encoding="utf-8").strip() or None
    terrain_file = WORK / "terrain.txt"
    terrain = terrain_file.read_text(encoding="utf-8").strip() if terrain_file.exists() else "fabdem"
    out = pipeline.export_site(site(), key(), release, OUT / "site.json", terrain)
    print(f"wrote {out} ({out.stat().st_size / 1e3:.0f} KB)")


STEPS = {
    "setup": setup,
    "elevation": lambda: pipeline.FETCHES[0](site()),
    "bare-earth": bare_earth,
    "land-cover": lambda: pipeline.FETCHES[2](site()),
    "overture": overture,
    "layers": lambda: pipeline.build_layers(site()),
    "export": export,
}


def fail(message: str):
    """Leave the reason for the app (the upload step sends out/error.json), and fail."""
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "error.json").write_text(json.dumps({"error": message[:400]}), encoding="utf-8")
    print(f"::error::{message}")
    sys.exit(1)


def main(argv):
    if len(argv) != 2 or argv[1] not in STEPS:
        sys.exit(f"usage: python -m service.actions {{{'|'.join(STEPS)}}}")
    WORK.mkdir(parents=True, exist_ok=True)
    try:
        STEPS[argv[1]]()
    except pipeline.Rejected as e:
        fail(str(e))
    except Exception as e:
        traceback.print_exc()
        fail(f"{argv[1]} failed: {type(e).__name__}: {e}")


if __name__ == "__main__":
    main(sys.argv)
