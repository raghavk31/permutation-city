"""Permutation City layer service: draw a site in the web app, get its layers back.

    POST /sites            {boundary: GeoJSON polygon, grid: {type, size}, ...}
                           → 200 {status: "done", result} if cached, else 202 {job, ...}
    GET  /jobs/{job}       status, current step, place in the queue
    GET  /results/{key}.json   the site export (what `pc export` writes)
    GET  /limits           the caps, for the app to show before anyone draws
    GET  /health

Jobs run one at a time in a background thread (fetching is network-bound and building is
memory-hungry; one at a time keeps a small machine safe). Results are cached on disk by a
hash of everything that changes them, so a polygon drawn twice is built once. Jobs live in
memory: a restart forgets queued jobs, not finished results.

Run locally:  uv run uvicorn service.main:app --reload
Settings (environment):
    PC_CACHE          where results are kept (default data/service-cache)
    ALLOWED_ORIGINS   comma-separated origins for CORS (default: the app and localhost)
    ALLOWED_ORIGIN_REGEX  e.g. Vercel preview URLs
    JOBS_PER_HOUR     new builds per client address per hour (default 6)
"""

import os
import queue
import threading
import time
import traceback
import uuid
from collections import defaultdict, deque
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request as HttpRequest
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field

from pc.site import ROOT
from service import pipeline

CACHE = Path(os.environ.get("PC_CACHE", ROOT / "data" / "service-cache"))
ORIGINS = [o.strip() for o in os.environ.get(
    "ALLOWED_ORIGINS", "https://permutationcity.vercel.app,http://localhost:5173,http://127.0.0.1:5173").split(",") if o.strip()]
ORIGIN_REGEX = os.environ.get("ALLOWED_ORIGIN_REGEX",
                              r"https://permutation-city-[a-z0-9]+-raghav-6207s-projects\.vercel\.app")
JOBS_PER_HOUR = int(os.environ.get("JOBS_PER_HOUR", "6"))
RELEASE_TTL = 3600

app = FastAPI(title="Permutation City layer service")
app.add_middleware(GZipMiddleware, minimum_size=1000)
app.add_middleware(CORSMiddleware, allow_origins=ORIGINS, allow_origin_regex=ORIGIN_REGEX or None,
                   allow_methods=["GET", "POST"], allow_headers=["Content-Type"])


class Grid(BaseModel):
    type: str = "hex"
    size: float = 20.0


class SiteIn(BaseModel):
    boundary: dict
    grid: Grid = Grid()
    name: str = Field("New site", max_length=80)
    context_m: float = 250.0
    sea_levels: dict[str, float] = {}
    rules: dict | None = None


# --- jobs -----------------------------------------------------------------------------

jobs: dict[str, dict] = {}
by_key: dict[str, str] = {}      # cache key → the job building it
work: "queue.Queue[str]" = queue.Queue()
lock = threading.Lock()
recent: dict[str, deque] = defaultdict(deque)  # client → start times of its builds
_release = {"id": None, "at": 0.0}


def overture_release() -> str | None:
    """The latest Overture release, checked at most once an hour. Overture's catalogue
    server drops connections now and then: retry, then keep the last known release. With
    none known, return None: the job fetches the latest unpinned (see `cache_key`)."""
    if _release["id"] is None or time.time() - _release["at"] > RELEASE_TTL:
        from overturemaps.core import get_latest_release
        for attempt in range(3):
            try:
                _release["id"], _release["at"] = get_latest_release(), time.time()
                break
            except Exception:
                time.sleep(1 + attempt)
    return _release["id"]


def _public(job: dict) -> dict:
    out = {k: job.get(k) for k in ("job", "status", "key", "step", "detail", "steps", "error", "size")}
    if job["status"] == "queued":
        out["position"] = sum(1 for j in jobs.values() if j["status"] == "queued" and j["created"] <= job["created"])
    if job["status"] == "done":
        out["result"] = f"/results/{job['key']}.json"
    out["seconds"] = round((job.get("finished") or time.time()) - job["created"])
    return out


def _worker():
    while True:
        job_id = work.get()
        job = jobs[job_id]
        job["status"] = "running"

        def progress(k, detail=None, job=job):
            job["step"], job["detail"] = pipeline.STEPS[k], detail

        try:
            pipeline.run(job["request"], job["key"], job["release"], CACHE, progress)
            job["status"] = "done"
        except Exception as e:  # report it; keep serving
            traceback.print_exc()
            job["status"], job["error"] = "failed", f"{type(e).__name__}: {e}"[:400]
        finally:
            job["finished"] = time.time()
            job.pop("request", None)
            with lock:
                by_key.pop(job["key"], None)


threading.Thread(target=_worker, daemon=True, name="jobs").start()


def _allow(client: str) -> bool:
    now, q = time.time(), recent[client]
    while q and now - q[0] > 3600:
        q.popleft()
    if len(q) >= JOBS_PER_HOUR:
        return False
    q.append(now)
    return True


# --- routes ---------------------------------------------------------------------------

@app.get("/health")
def health():
    return {"ok": True, "queued": work.qsize(), "cached": len(list(CACHE.glob("*.json"))) if CACHE.exists() else 0}


@app.get("/limits")
def limits():
    return {"max_km2": pipeline.MAX_KM2, "max_cells": pipeline.MAX_CELLS, "grid_types": sorted(pipeline.GRID_TYPES),
            "cell_size": [10, 50], "context_m": [100, 500], "jobs_per_hour": JOBS_PER_HOUR, "steps": pipeline.STEPS}


@app.post("/sites")
def create_site(body: SiteIn, http: HttpRequest):
    try:
        req = pipeline.Request(
            boundary=pipeline.polygon_from_geojson(body.boundary), grid_type=body.grid.type,
            cell_size=body.grid.size, context_m=body.context_m, sea_levels=body.sea_levels,
            rules=body.rules, name=body.name.strip() or "New site")
        size = pipeline.check(req)
    except pipeline.Rejected as e:
        raise HTTPException(422, str(e)) from None

    release = overture_release()
    key = pipeline.cache_key(req, release)
    if (CACHE / f"{key}.json").exists():
        return {"status": "done", "key": key, "result": f"/results/{key}.json", "size": size}
    with lock:
        if key in by_key:  # someone is already building this exact site
            return JSONResponse(_public(jobs[by_key[key]]), status_code=202)
        if not _allow(http.client.host if http.client else "unknown"):
            raise HTTPException(429, f"at most {JOBS_PER_HOUR} new sites an hour; try again later")
        job_id = uuid.uuid4().hex[:12]
        jobs[job_id] = {"job": job_id, "status": "queued", "key": key, "step": None, "steps": pipeline.STEPS,
                        "error": None, "size": size, "created": time.time(), "finished": None,
                        "request": req, "release": release}
        by_key[key] = job_id
    work.put(job_id)
    return JSONResponse(_public(jobs[job_id]), status_code=202)


@app.get("/jobs/{job_id}")
def job_status(job_id: str):
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(404, "no such job (the service may have restarted; submit the site again)")
    return _public(job)


@app.get("/results/{key}.json")
def result(key: str):
    if not key.isalnum() or len(key) != 24:
        raise HTTPException(404, "no such result")
    path = CACHE / f"{key}.json"
    if not path.exists():
        raise HTTPException(404, "no such result")
    return FileResponse(path, media_type="application/json",
                        headers={"Cache-Control": "public, max-age=86400, immutable"})
