# The layer service

**How the live app builds sites (since 2026-10-17): GitHub Actions, no server of our own.**
`/api/sites` (a Vercel function, `app/sites/build.ts`) checks a drawn site with the checks
below, returns a cached build from Vercel Blob at once, or starts
`.github/workflows/build-site.yml` with the site's cache key. The workflow runs this same
pipeline on a GitHub runner (free for this public repo), one workflow step per stage
(`service/actions.py`), so the page shows progress from the run's step list. It saves the
site to Blob as `sites/<key>/site.json` (or the reason it failed as `error.json`). The
answers keep this service's shapes, so the picker works with either. See "Building on
GitHub Actions" at the end.

`service/` is a small FastAPI app around the `pc` pipeline, kept for local development
(`npm run dev` uses it) and for anyone who wants to host it. The web app sends it a polygon
and gets back the same site file `pc export` writes (format 2: layers, rules, design
ground). Everything after that, including editing rules and evolving designs, runs in the
browser.

## API

| | |
|---|---|
| `POST /sites` | `{boundary, grid: {type: "hex" | "quad", size: 20}, name, context_m: 250, sea_levels: {}, rules: null}`. `boundary` is a GeoJSON Polygon (or a Feature or a one-feature FeatureCollection) in degrees. Returns `200 {status: "done", result}` when the site is cached, otherwise `202 {job, status: "queued", position, size}`. |
| `GET /jobs/{job}` | `{status: queued / running / done / failed, step, detail, steps, position, seconds, result, error}` |
| `GET /results/{key}.json` | the site file (gzipped on the wire, cached for a day) |
| `GET /limits` | the caps below, so the app can check a polygon before sending it |
| `GET /health` | `{ok, queued, cached}` |

`sea_levels` turns on coastal flooding: `{high_tide: 2.5, surge_today: 3.5, surge_2050: 3.8}`
are the Mumbai working figures. The template rules look for `flood_surge_2050`, so keep that
name. Inland sites leave it empty.

`rules` is optional. Without it the site gets `rules.template.yaml`. If sent, every `when`
must be structured (`{layer, op, value}`, `all`, `any`, `not`). Strings are refused, so no
user text is ever parsed on the server, although the parser never evaluates code anyway.

## Limits

- Design polygon at most **4 km²** (before the 250 m context margin).
- At most **4,500 cells** (the browser engine's budget: about 5 s for a full run). At 20 m
  hexes that is the 4 km² limit; 20 m squares (400 m² each) reach it at 1.8 km².
- Grid `hex` (size = centre to corner) or `quad` (size = side). Cell size 10 to 50 m;
  context margin 100 to 500 m.
- **6 new builds per client address per hour** (`JOBS_PER_HOUR`). Cached sites don't
  count.
- One job runs at a time; the rest queue.

Every refusal is a `422` with a sentence a person can act on ("the site is 6.1 km²; the
limit is 4 km². Draw a smaller polygon.").

## Cache

Results are kept under a key hashed from everything that changes them:

- the polygon (rounded to 6 decimals, about 0.1 m)
- grid type and size, context margin, sea levels, rules
- the **Overture release** (looked up once an hour, and passed to the download so the data
  matches the key)
- `LAYERS_VERSION` in `service/pipeline.py` (bump it when `pc/layers.py` changes what it
  computes) and the export format

If Overture's catalogue is down, the job downloads the latest data unpinned and the key
uses the month instead of the release, so that result is reused for a month at most.

The work folders (downloads, geopackages) are deleted after each job; only the JSON is
kept. A site is usually 0.2 to 1.5 MB.

## Timing

A 0.26 km² test site in Mumbai's docks (252 cells) took 7.5 minutes on a home connection:
about 25 s for the rasters and about 7 minutes for Overture's six map themes. The
progress shows which theme is downloading.

## Run it locally

```bash
uv run uvicorn service.main:app --port 8765 --reload
# then, in app/: VITE_SERVICE_URL=http://localhost:8765 npm run dev
```

Results go to `data/service-cache/` (ignored by git). Tests: `uv run pytest test/python`
(the pipeline is stubbed). To check a real result in the browser engine:

```bash
cd app && npx vite-node ../test/parity/service-check.ts ../data/service-cache/<key>.json
```

## Deploy on Railway

The repo has `railway.json` (Dockerfile build, `/health` check) and `service/Dockerfile`.

1. `railway login`, then from the repo root `railway init` (new project
   `permutation-city-service`), or link an existing one with `railway link`.
2. Add a **volume** mounted at `/data` (results survive redeploys).
3. Variables:
   - `ALLOWED_ORIGINS=https://permutationcity.vercel.app` (add the custom domain later)
   - `ALLOWED_ORIGIN_REGEX` is already set for this Vercel team's preview URLs; override if
     the team name changes
   - optional `JOBS_PER_HOUR`
4. `railway up` to build and deploy, then **Settings → Networking → Generate Domain**.
5. Set the app's `VITE_SERVICE_URL` on Vercel to that domain (Production and Preview) and
   redeploy the app.

Memory: I haven't measured a 4 km² build yet. Building rasterises land cover and overlays
every building footprint, so start with 2 GB and watch Railway's metrics on the first big
site.

## Building on GitHub Actions

What it needs (set once):

| Where | Name | What |
|---|---|---|
| Vercel (Production, Preview) | `BLOB_READ_WRITE_TOKEN` | set by connecting the Blob store `permutation-city-sites` (bom1, public) |
| Vercel (Production, Preview) | `GITHUB_DISPATCH_TOKEN` | a fine-grained GitHub token for this repo only, with **Actions: read and write**; it starts runs and reads their steps |
| GitHub (repo secret) | `BLOB_READ_WRITE_TOKEN` | the same Blob token, for the workflow's upload step |
| Vercel (optional) | `BUILD_REF` | the branch whose workflow runs (default: the deployment's branch, else `main`) |

GitHub only starts `workflow_dispatch` workflows that exist on the default branch, so builds
from the app work once `build-site.yml` is on `main`. Until then, `/api/sites` answers but
starting a build fails with GitHub's 404.

How a build goes:
- **Key:** a hash of the polygon (to 6 decimals), grid, context margin, sea levels, rules,
  `LAYERS_VERSION`, the export format and the month. The month stands in for the Overture
  release (the build fetches the latest), so a cached site is reused for at most a month.
- **Limits:** the ones above, plus at most 3 builds queued or running at once, and 6 new
  builds per address per hour (per function instance).
- **Steps:** installing (uv, about 30 s with its cache), setting up (the checks again, in
  Python), elevation, bare earth, land cover, Overture map data, layers, rules and export,
  saving. A runner takes 20 to 60 s to start.
- **FABDEM** (bare earth) has one host, data.bris.ac.uk, which drops connections now and
  then. Each build tries four times over about two minutes; if it still fails, the build
  uses the Copernicus surface model instead and the site carries a warning, shown on the
  layer cake and in the chapters. `pc fetch` on the command line still fails instead.
- **Smoke test:** pushing a change to the workflow, `service/` or `pc/` on any branch but
  `main` builds a 2 ha site in Mumbai (not uploaded).

Inputs reach the workflow's scripts only through environment variables, never through
the shell, and the request is checked again in Python before anything runs.
