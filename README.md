# Permutation City

A sandbox for generative design *with* nature, on any site.

Pick a site anywhere on Earth. The sandbox fetches its climate and landscape layers and stacks them McHarg-style (*Design with Nature*, 1969). The layers become **rules** for what can be built where. The rules define a **gene pool** of possible designs, and designs are bred across **generations**. You play as the urban designer: you set the rules, watch lineages evolve, breed the ones you like, and throw climate shocks at them. Then you do the same on the next site.

Sibling to [Climate Code](https://raghavkohli.xyz/work/climate-code/). Climate Code asks *what is here?*; Permutation City asks *what could be here?*

The method comes from two CEPT studios. See **[docs/generative-method.md](docs/generative-method.md)**.

---

## Quick start

```bash
uv sync                                    # once

# a new site: any box, in degrees (west south east north)
uv run pc new my-site --name "My site" --bbox 72.570 23.052 72.592 23.070
uv run pc new my-coast --bbox ... --sea    # coastal: adds sea levels to edit

uv run pc fetch my-site                    # download data (1-5 min; resumes if interrupted)
uv run pc build my-site                    # grid + layers + rules + maps (~1 min)

# then play with sites/my-site/rules.yaml and redraw (seconds):
uv run pc rules my-site

uv run pc grow my-site --n 60 --seed 1     # Generation 0: 60 random designs, scored; best 10 drawn
uv run pc evolve my-site --gens 30         # breed 30 generations; final front + progress chart

uv run pc app                              # the designer's sandbox at http://localhost:8501
uv run pc sites                            # list sites
uv run pc export my-site --fixture         # for the web app: app/public/sites/ + a parity fixture
```

The web app (v2, Vite + TypeScript, deployed on Vercel):

```bash
cd app && npm install                      # once
npm run dev                                # http://localhost:5173
npm test                                   # parity: the TS engine against Python fixtures
npm run speed                              # 1,860 designs per site, timed
```

Plan and decisions for v2: [docs/architecture-v2.md](docs/architecture-v2.md). Deploying: [docs/deploy.md](docs/deploy.md).

## Sites

| Site | Folder | Notes |
|---|---|---|
| **Mumbai Eastern Waterfront** | `sites/mumbai-ewf` | Eco-machine (CEPT Sem 07, 2020). Coastal; design area is Port Trust land east of P D'Mello Road. 169 ha design ground. |
| **Ahmedabad: Gandhi Ashram and Wadaj** | `sites/ahmedabad-wadaj` | CEPT Sem 06 Generative Techniques site, on the Sabarmati. Inland. 375 ha design ground. The rain layer finds the retention basin the studio identified. |

Each site is a folder:

```
sites/<id>/
  site.yaml            name, box, hex size, sea levels (coastal), design area (optional)
  rules.yaml           the McHarg rules; copied from rules.template.yaml, then edited per site
  design_area.geojson  optional: the ground to design (draw it in QGIS or geojson.io)
  maps/                01-layers.png, 02-rules.png
data/<id>/             downloaded and built data (git-ignored)
```

---

## The pipeline

```
 1 SITE        any box: pc new
      │
 2 DATA        global, no logins: pc fetch
      │
 3 LAYERS      ground · water · flooding · rain · green · buildings · industry
      │
 4 RULES       overlay → per cell:  forbidden · retained · constrained · open
      │
 5 GENE POOL   each design = a genome; rules limit allowed values
      │
 6 GENERATIONS select → cross → mutate → repeat
      │
 7 FITNESS     score each design on climate and social metrics
      │
 8 PLAY        designer breeds, shocks, compares, exports
```

### 2 · Data (`pc/fetch.py`)

All global, all without accounts. Rasters are read from cloud copies, so only the site's window is downloaded (kilobytes, not whole tiles).

| Data | Source | Notes |
|---|---|---|
| Surface height | Copernicus GLO-30 (30 m) | metres above sea level; includes buildings; sea = 0 m |
| Bare-earth ground | FABDEM (30 m) | Copernicus with buildings and trees removed; free for non-commercial research |
| Land cover | ESA WorldCover 2021 (10 m) | trees, grass, built, water, mangrove |
| Buildings, roads, rail, land use, water, place names | Overture Maps | footprints from Google Open Buildings (traced from satellite imagery), Microsoft and OSM |

Optional local extras go in `data/<id>/raw/local/` (e.g. Mumbai's Cartosat DEM; NRSC licence, never hosted).

### 3 · Layers (`pc/layers.py`)

| Column | Meaning |
|---|---|
| `ground`, `elev`, `bldg_h` | bare-earth height, surface height, approximate building height (m) |
| `water`, `sea`, `edge_dist` | water cell, sea cell, metres to the water's edge |
| `flood_<level>` | coastal flood depth per sea level in `site.yaml` ("connected bathtub": below the level *and* reachable from the sea) |
| `pool`, `upstream` | rainwater pooling depth in hollows; number of cells draining through (drainage lines) |
| `trees`, `green`, `bare`, `mangrove`, … | land-cover shares |
| `built` | building footprint share |
| `industrial` | industrial or rail land (stand-in for contaminated land) |
| `in_design` | inside the site's design area |

Heights carry ±2–3 m error, so flood and pooling depths are indicative.

### 4 · Rules (`pc/rules.py`, `sites/<id>/rules.yaml`)

Each rule is a plain test on the layer columns, e.g. `when: flood_surge_2050 > 1.5`.

- **Forbidden:** water, deep flooding, the water's edge. Never built on.
- **Retained:** existing city outside the design area. Context only (Sem 06's "retained areas").
- **Constrained:** buildable with limits: height cap, minimum permeable ground, allowed uses, raised ground floor, clean-up first. Limits from several rules combine; the strictest wins.
- **Open:** the genes decide.

Rules naming a layer a site lacks (sea flooding inland) are skipped and reported.

### 5 · Gene pool and growth (`pc/genome.py`)

A genome is **47 numbers between 0 and 1**. The body plan:

- **8 attractor slots** × (x, y, radius, weight, kind). Kinds: **core** pulls building density, **green** pulls open space, **water** pulls storage. Positions are fractions of the design ground and radius is a fraction of its diagonal, so **a genome can be regrown on any site**.
- **7 site-wide genes:** water share (5–30%), green share (10–45%), *follow water* (how much water follows the site's own drainage and flood lines: Eco-machine's streams as attractors), building coverage, peak (spread out ↔ towers), intensity, base (background density away from cores).

Growth: water claims its share on the best water cells, then green, then the rest is building, with heights rising towards the cores. All of it stays inside each cell's rules (allowed uses, height cap, permeable minimum). Output per cell: `use`, `levels`, `coverage`, `floor_area`.

`pc grow` saves the genomes (`data/<id>/runs/seq<n>/gen0.npy`), their stats (`gen0.json`) and a sheet (`maps/03-seq<n>-gen0.png`).

### 7 · Fitness (`pc/fitness.py`)

**The brief** is a requirement, not a score: floor area within ±10% of the target (`target_far` or `target_floor_area_ha` in `site.yaml`). Designs on brief always beat designs off it; off-brief designs are ordered by how close they are.

**Five scores**, kept separate so the trade-offs stay visible (Sem 06's lesson: an averaged score hides them):

| Score | Meaning | Better |
|---|---|---|
| **storage** | share of the design storm held on site (water ~1 m, landscape ~0.1 m, unsealed plot ground ~0.05 m); storm from `design_storm_mm` | higher |
| **heat** | surface heat index, °C above fully green ground (paving +5, roof +4, grass +1, landscape +0.5, water −2, +0.1/storey; spread to neighbours) | lower |
| **carbon** | embodied carbon, kgCO₂e/m²: ~400 for mid-rise concrete, +2% per storey above 6 | lower |
| **daylight** | share of floor area well lit: no building within ~100 m above a 25° line | higher |
| **human** | human scale: average of floor area in ≤8 storeys and building cells fronting a park or water | higher |

Values are indicative and comparable between designs, not simulations.

**Families:** designs that differ in fewer than 5% of cells are treated as copies and pushed back, so distinct strategies survive. The final front is grouped into families (founders more than 15% different); the sheet shows one per family.

### 6, 8 · Generations and play (to build)

- Program: the three uses (building, landscape, water) become the Eco-machine programs (flood reservoir, treatment, waste-to-energy, farms, markets, …) in a later step.
- **Population about 60** with elitism, mutation and immigration (the Sem 06 workshop collapsed at 10).
- **Fitness kept separate**, shown as Pareto fronts: flood storage, heat, program delivered; then proximity, solar and wind, remediation.
- **Time steps** 2025 → 2035 → 2050, with climate shocks arriving at set years.
- **Play:** edit rules, breed by hand, lock zones, shock, compare, export (GeoJSON, Rhino).
- Naming as in the studios: individuals `G{gen}.{nn}`, runs `Seq{n}`.

---

## Data and licences

Downloaded data is not in this repo (`data/` is git-ignored); `pc fetch` gets it. Maps and exports made from it carry these credits:

- **Copernicus DEM GLO-30:** © DLR e.V. 2010–2014 and © Airbus Defence and Space GmbH 2014–2018, provided under COPERNICUS by the European Union and ESA.
- **FABDEM:** Hawker et al. (2022), University of Bristol; CC BY-NC-SA 4.0, so derived layers are for non-commercial use and shared alike.
- **ESA WorldCover 2021:** © ESA WorldCover project, CC BY 4.0.
- **Overture Maps:** buildings, transportation, land use, water and divisions, under ODbL (OpenStreetMap-derived) and CDLA-Permissive-2.0; building footprints include Google Open Buildings (CC BY 4.0) and Microsoft ML footprints (ODbL).
- **Cartosat-1 DEM (NRSC/ISRO)** is used only locally as a cross-check; its licence forbids hosting, so it is never committed or published.

## Code

```
pc/
  site.py      Site: loads sites/<id>/site.yaml; paths; UTM projection
  fetch.py     downloads for any box
  grid.py      hex grid
  layers.py    McHarg layers
  rules.py     rules → forbidden / retained / constrained / open
  maps.py      map sheets
  genome.py    genome → design (attractor growth); RANGES: how genes are read
  fitness.py   scores, Pareto ranks, families
  evolve.py    NSGA-II-style evolution
  export.py    sites for the web app, parity fixtures
  __main__.py  the `pc` command
sandbox/app.py        the Streamlit sandbox (`pc app`)
app/
  engine/      the TypeScript engine (port of pc/genome, fitness, evolve); worker.ts via Comlink
  ui/          the page: six chapters on canvas
  api/         Vercel functions (health now; brief compiler in Phase 4)
  public/sites/  exported sites
test/parity/   Python fixtures + Vitest parity test; speed.ts
rules.template.yaml   starting rules for new sites
```

---

## Roadmap

- [x] **Phase 0: Data and grid.** Hex grid at 20 m (Eco-machine's size)
- [x] **Phase 1: Layers.** Ground, sea flooding, rain, green, buildings, industry
- [x] **Phase 2: Rules.** `rules.yaml` and the suitability map
- [x] **Sandbox.** Any site: `pc new / fetch / build / rules`; tested on Mumbai and Ahmedabad
- [x] **Phase 3: Genome and growth.** Attractor genes grow a design on the allowed cells; `pc grow` draws Generation 0 (both sites)
- [x] **Phase 4: Fitness.** Flood storage, heat, floor area against a target (`pc/fitness.py`); Pareto ranks; trade-off chart `maps/04-seq<n>-gen0-tradeoffs.png`. Water-chain artifact fixed (smoothed water score).
- [x] **Phase 5: Evolution.** `pc evolve`: NSGA-II-style loop with the Sem 06 breeding rules (60/40 crossover, attractors inherited whole, mutation, ~10% immigrants); saves `final.npy`, `history.json`, `lineage.json`; sheets `05-…-front.png`, `06-…-evolution.png`. 1,860 designs in ~5 s.
  - First Mumbai run with three scores converged on near-identical "towers in a park" (mean 12 levels). Fixed by adding carbon, daylight and human scale, making floor area the brief, and keeping families.
  - Mumbai Seq1 now (30 × 60): 41 designs on the front in 17 families, 4.5–7.5 storeys on average. Main trade-off: **storage vs daylight** (Family D: 169% storage, 62% daylight; Family B: 106% and 100%).
- [x] **Phase 6: Play.** `uv run pc app` (Streamlit, `sandbox/app.py`): Site (maps, edit and apply rules), Evolve (brief, storm, climate shock mid-run, locks, start from the pen; progress charts), Families (gallery, 3D view on a basemap, lock water / landscape / buildings, GeoJSON export), Breed (pick two parents, six children, keep, repeat)
  - [ ] Family tree view (lineage is saved, not drawn yet)
  - [ ] Save session brief changes back to `site.yaml`; save and reload runs in the app
- [x] **Site boundaries as polygons.** `pc new <site> --boundary site.geojson`, or draw one in the app (*New site* mode: search, draw, fetch and build). Layers are worked out on the polygon plus a 250 m context margin (`context_m`), then cropped to the polygon. The design area can be drawn in the app's Site tab. Test site: `sites/mumbai-docks` (an approximate outline, not the studio boundary).
- [ ] **Phase 7: 3D massing studies.** A second, nested gene pool at block scale (Sem 06's method):
  - each building cell (or a block of cells) gets a **typology genome**: primitive (single courtyard, L, U, tower, slab), grid size (3–7.5 m), depth (12–18 m), height profile, voids (position and number), non-uniform scaling, as in the Sem 06 pseudocode
  - the site genome sets the envelope (use, height cap, coverage); the block genome fills it with real 3D volumes
  - 3D fitness from the volumes: sun on roofs and facades, shade in courts and streets, sky view, wind permeability (frontal area), plus the site scores recomputed from actual floor area
  - explore it as a massing study: evolve one block, a street, or the whole site; view and compare in 3D; export to Rhino (`.3dm`) and glTF
- [x] **Phase 8: On the web.** `pc export`, the engine in JavaScript with exact parity, the six-chapter page. Superseded by v2: a Vercel app at permutation.raghavkohli.xyz that the main site links to.
- [ ] **v2** ([brief](docs/permutation-city-v2-prompt.md), [plan](docs/architecture-v2.md))
  - [x] Phase 0: audit and plan
  - [x] Phase 1: new layout, TypeScript engine (`app/engine`), Vite app, Vercel preview
  - [ ] Phase 2: layer service and site picker
  - [ ] Phase 3: hex or quad grids
  - [ ] Phase 4: context and the brief compiler
  - [ ] Phase 5: NSGA-II, NSGA-III, MAP-Elites
  - [ ] Phase 6: urban and aesthetic metrics (Alexander's fifteen properties)
  - [ ] Phase 7: 3D massing at building scale
  - [ ] Phase 8: space syntax and legibility
  - [ ] Phase 9: runs, lineage, piecemeal growth
- [ ] **Beyond.** Networks and space syntax (Sem 06's foreground/background networks), Eco-machine programs, time steps (2025 → 2035 → 2050)

### Data to improve

- [ ] Mumbai: check sea levels in `site.yaml` against MCGM / INCOIS figures
- [ ] Mumbai: georeference the studio DWG site plan as the exact base for the core site
- [ ] Real contaminated-land mapping instead of the industrial stand-in (studio maps or AlphaEarth, which needs an Earth Engine account)
- [ ] Drainage on flat land: add drain networks where available
- [ ] River flooding for inland sites (e.g. Sabarmati flood levels)
