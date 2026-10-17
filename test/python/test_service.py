"""The layer service: validation, caps, the cache key, jobs and CORS. The pipeline itself
(downloads and builds) is replaced by a stub here; `uv run python -m service.smoke`
runs it for real."""

import json
import time

import pytest
from fastapi.testclient import TestClient

from service import main, pipeline

# About 0.25 km² in Mumbai's docks.
SQUARE = {"type": "Polygon", "coordinates": [[[72.840, 18.950], [72.845, 18.950], [72.845, 18.9545],
                                              [72.840, 18.9545], [72.840, 18.950]]]}


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "CACHE", tmp_path)
    monkeypatch.setattr(main, "overture_release", lambda: "2026-09-17.0")
    monkeypatch.setattr(main, "JOBS_PER_HOUR", 3)
    main.recent.clear()

    def fake_run(req, key, release, cache, progress):
        for k in range(len(pipeline.STEPS)):
            progress(k, "detail" if k == 4 else None)
        (cache / f"{key}.json").write_text(json.dumps({"meta": {"id": key, "format": 2}}))
        return cache / f"{key}.json"

    monkeypatch.setattr(pipeline, "run", fake_run)
    return TestClient(main.app)


def wait(client, job):
    for _ in range(100):
        s = client.get(f"/jobs/{job}").json()
        if s["status"] in ("done", "failed"):
            return s
        time.sleep(0.02)
    raise AssertionError("job never finished")


def test_build_then_cache(client):
    r = client.post("/sites", json={"boundary": SQUARE})
    assert r.status_code == 202
    s = wait(client, r.json()["job"])
    assert s["status"] == "done" and s["step"] == pipeline.STEPS[-1]
    assert client.get(s["result"]).json()["meta"]["format"] == 2
    again = client.post("/sites", json={"boundary": {"type": "Feature", "geometry": SQUARE}})
    assert again.status_code == 200 and again.json()["key"] == s["key"]  # same site: cached


def test_key_changes_with_what_changes_the_result():
    base = pipeline.Request(boundary=pipeline.polygon_from_geojson(SQUARE))
    k = pipeline.cache_key(base, "r1")
    assert pipeline.cache_key(base, "r2") != k
    assert pipeline.cache_key(pipeline.Request(boundary=base.boundary, cell_size=25), "r1") != k
    assert pipeline.cache_key(pipeline.Request(boundary=base.boundary, sea_levels={"surge_2050": 3.8}), "r1") != k
    assert pipeline.cache_key(pipeline.Request(boundary=base.boundary, name="Other name"), "r1") == k


@pytest.mark.parametrize("body, message", [
    ({"boundary": {"type": "Point", "coordinates": [72.84, 18.95]}}, "polygon"),
    ({"boundary": SQUARE, "grid": {"type": "quad"}}, "isn't available yet"),
    ({"boundary": SQUARE, "grid": {"size": 5}}, "between 10 and 50"),
    ({"boundary": SQUARE, "sea_levels": {"a b": 1}}, "letters"),
    ({"boundary": {"type": "Polygon", "coordinates": [[[72.80, 18.90], [72.86, 18.90], [72.86, 18.96],
                                                       [72.80, 18.96], [72.80, 18.90]]]}}, "the limit is 4 km²"),
    ({"boundary": SQUARE, "rules": {"defaults": {}, "forbidden": [{"name": "x", "when": "water"}]}}, "structured"),
])
def test_rejects_with_a_clear_message(client, body, message):
    r = client.post("/sites", json=body)
    assert r.status_code == 422
    assert message in r.json()["detail"]


def test_cell_cap():
    req = pipeline.Request(boundary=pipeline.polygon_from_geojson(SQUARE), cell_size=10)
    assert pipeline.check(req)["cells"] < pipeline.MAX_CELLS
    big = {"type": "Polygon", "coordinates": [[[72.840, 18.950], [72.855, 18.950], [72.855, 18.962],
                                               [72.840, 18.962], [72.840, 18.950]]]}  # ~2 km²
    with pytest.raises(pipeline.Rejected, match="cells"):
        pipeline.check(pipeline.Request(boundary=pipeline.polygon_from_geojson(big), cell_size=10))


def test_rate_limit_counts_new_builds_only(client):
    shifted = lambda d: {"type": "Polygon", "coordinates": [[[x + d, y] for x, y in SQUARE["coordinates"][0]]]}
    codes = [client.post("/sites", json={"boundary": shifted(i * 0.01)}).status_code for i in range(4)]
    assert codes == [202, 202, 202, 429]


def test_cors_only_for_the_app(client):
    ok = client.get("/limits", headers={"Origin": "https://permutationcity.vercel.app"})
    assert ok.headers.get("access-control-allow-origin") == "https://permutationcity.vercel.app"
    preview = "https://permutation-city-z1pdijibn-raghav-6207s-projects.vercel.app"
    assert client.get("/limits", headers={"Origin": preview}).headers.get("access-control-allow-origin") == preview
    assert "access-control-allow-origin" not in client.get("/limits", headers={"Origin": "https://evil.example"}).headers


def test_result_names_are_checked(client):
    assert client.get("/results/..%2F..%2Fpyproject.json").status_code == 404
    assert client.get("/results/abc.json").status_code == 404


def test_without_a_release_the_month_stands_in():
    req = pipeline.Request(boundary=pipeline.polygon_from_geojson(SQUARE))
    assert pipeline.cache_key(req, None) == pipeline.cache_key(req, "unpinned-" + time.strftime("%Y-%m"))
