# Permutation City v2: architecture

Phase 0 audit and plan. Written 2026-10-16 against commit `c6335e6`.

---

## 1. How the engine connects today

```
site.yaml + rules.yaml
        │
pc fetch ──► data/<site>/raw/        dem.tif, terrain.tif, landcover.tif, overture/*.parquet
        │
pc build ──► pc/grid.py   hex_grid(site)            hexes over the bbox (+ context margin)
        │    pc/layers.py neighbours(grid)          6 neighbours from row/col parity
        │                 add_ground … add_design_area   columns per cell
        │                 add_flood (BFS), add_drainage (priority-flood)
        │                 crop_to_boundary
        │    → data/<site>/layers/grid.gpkg
        │
pc rules ──► pc/rules.py  apply(grid, rules)        pandas eval of each `when`
        │    → data/<site>/layers/suitability.gpkg  state, max_levels, min_permeable, uses …
        │
        ├──► pc/genome.py prepare(suit) → Ground    design cells only, nbr (n×6),
        │                                           can_*, cap, min_perm, trees, site_water
        │                 decode(genome) → 8 attractors + 7 site-wide settings
        │                 grow(genome, Ground) → Design (use, levels, coverage, floor_area)
        │    pc/fitness.py evaluate → storage, heat, carbon, daylight, human, gap
        │                 pareto_ranks (gap as a constraint), crowding, families
        │    pc/evolve.py  evolve: tournament, 60/40 crossover, mutation, 10% immigrants,
        │                 duplicate push-back; Run.everyone holds lineage
        │
pc export ─► pc/export.py → web/dist/<site>.json   meta, grid (layers for drawing),
                                                   design (= Ground, flattened), context
             --fixture   → web/test/fixture-<site>.json (40 genomes grown and scored in Python)

web/engine.js   prepare(export) ≡ ground_from_export; grow, evaluate, paretoRanks,
                crowding, families, evolve (mulberry32 RNG), breed
web/worker.js   evolve off the main thread; returns family leads as genomes
web/app.js, draw.js   six chapters on canvas; hex drawing; oblique 3D prisms
app/app.py      Streamlit: Site / Evolve / Families / Breed, new-site drawing (folium)
```

The Python/JS boundary is the export file. Everything up to and including `genome.prepare`
runs only in Python. Everything after it runs in both.

### Baseline (measured today)

| | design cells | parity | 1,860 designs (JS, Node 24) |
|---|---|---|---|
| mumbai-docks | 661 | exact (0 differences) | 2.0 s |
| mumbai-ewf | 1,623 | exact | 4.7 s |
| ahmedabad-wadaj | 3,607 | exact | 6.8 s |

Time scales roughly with cell count. Ahmedabad is already over the 5 s budget.

### What parity covers, and what it doesn't

Parity covers `grow`, `evaluate` and `paretoRanks` on fixed genomes. It does **not** cover
evolution. Python uses numpy's PCG64 and `rng.choice`; JS uses mulberry32 and its own pick.
The same seed gives different runs in each engine. "Seeded RNG everywhere so runs are
reproducible" holds within an engine, not across them. See decision D3.

---

## 2. Hex-grid assumptions

Every place that would break or change meaning on a quad grid or an irregular graph.

| Where | Assumption | Phase 3 fix |
|---|---|---|
| `pc/grid.py` `hex_grid` | pointy-top hexes, odd rows offset by half a cell | `HexGrid` implements `CellGraph` |
| `pc/layers.py` `neighbours` | neighbours from (row, col) parity, max 6 | `CellGraph.neighbours()` |
| `pc/layers.py` `add_drainage` | `len(nb) < 6` marks an edge cell (outlet) | `CellGraph.is_edge` (fewer neighbours than the interior degree) |
| `pc/layers.py` `add_drainage` | steepest descent picks the lowest of up to 6 neighbours, with no distance weighting | slope = Δh / centre distance (matters for quad diagonals) |
| `pc/genome.py` `Ground.nbr` | fixed `(n, 6)` array padded with -1 | `(n, maxDegree)` padded, plus `degree` |
| `pc/genome.py` `smooth` | unweighted mean of self and neighbours | adjacency weights from `CellGraph`; same result on hex |
| `pc/genome.py` `claim` | `share × n` cells (assumes every cell has the same area) | claim by area, not count |
| `pc/fitness.py` daylight | ring k is `k × √3 × hex_radius` away; `DAYLIGHT_RINGS = 3` ≈ 100 m | rings from a distance band (cells within 100 m), not k hops |
| `pc/fitness.py` heat | 3 smoothing passes over 6 neighbours | weighted smoothing with a set radius in metres |
| `pc/fitness.py` human | "fronts open space" means any of the 6 neighbours | edge-sharing neighbours only (quad: 4, not 8) |
| `pc/fitness.py` `evaluate` | `site.hex_radius` read directly | `CellGraph.spacing` |
| `pc/export.py` | `nbr` flattened at width 6; `cell_area = area[0]`; `hex_radius` in meta | export `degree`, per-cell `area`, `grid: {type, size}` |
| `web/engine.js` | `k < 6` loops in `smooth`, `dilateMax`, human; `Math.sqrt(3) * hex_radius`; one scalar `cellArea`; `floorAreaTarget = target_far × cellArea × n` | as above |
| `web/draw.js` | `hexPath`, `cellAt(radius)`, `solid` draws hex prisms, `SQ3` | draw from per-cell polygons in the export |
| `pc/maps.py` | label text only ("hex cells"); drawing uses geometry | text |
| `app/app.py` | "Hex radius" input on the new-site page | grid type + size |
| `site.yaml`, `pc new --hex` | key `hex_radius` | add `grid: {type: hex, size: 20}`; read `hex_radius` as a fallback |
| `web/index.html`, `rules.template.yaml` | copy: "Each hex is 20 m", "Every hex" | copy |

The rest is already grid-free: attractor fields (plain distances), rule evaluation,
flooding BFS, landcover rasterising (cell polygons), building overlay, Pareto ranking.

**Note on grid invariance.** On the same site, heat and human scale will give different
numbers on hex and on quad. Quad has 4 or 8 neighbours, not 6, so both smoothing and
"fronts open space" change. Weighting by metres (not hops) shrinks the gap but won't close
it. The UI should say that scores compare across designs on one grid, not across grids.

---

## 3. What we reuse, what moves, what gets refactored

### Reused as is
- `pc/fetch.py`, `pc/layers.py` (once the grid is abstracted), `pc/rules.py` and `pc/maps.py`.
- `pc/genome.py`, `pc/fitness.py` and `pc/evolve.py` stay the reference implementation.
- `web/engine.js` logic, ported to TypeScript line for line.
- The export JSON format, extended with versioned additions (`format: 2`).
- The parity fixtures and the approach behind them.

### Moves
| From | To | Why |
|---|---|---|
| `app/app.py` (Streamlit) | `sandbox/app.py` | `/app` becomes the Vite app. `pc app` follows the new path. |
| `web/engine.js` | `app/engine/*.ts` | TS port, split by concern (see below) |
| `web/worker.js` | `app/engine/worker.ts` | Comlink |
| `web/app.js`, `draw.js`, `style.css`, `index.html` | `app/ui/…` | Vite app, same six chapters first |
| `web/dist/*.json` | `app/public/sites/*.json` | precomputed sites, served static |
| `web/test/*` | `test/parity/*` | one place for Python ↔ TS checks |
| (new) | `service/` | FastAPI wrapper around `pc` |
| (new) | `app/api/` | Vercel functions: brief compiler, retrieval |
| (new) | `corpus/` | RAG documents with sources |

`web/` stays until the Vite app reaches parity with it, then gets deleted in one commit.

### TS engine layout
```
app/engine/
  graph.ts      CellGraph (Phase 3), built from the export
  ground.ts     prepare()
  genome.ts     decode, grow, randomGenome
  fitness.ts    evaluate, floorAreaTarget
  rank.ts       paretoRanks, crowding, families, difference
  evolve.ts     NSGA-II loop (NSGA-III and MAP-Elites join it in Phase 5)
  rng.ts        seeded RNG (shared algorithm with Python, see D3)
  metrics/      Phase 6, one file per metric family
  worker.ts     Comlink API
```

### Refactors, in the order they're needed
1. **Run config object (Phase 1, no behaviour change).** Gene ranges (`water_share`
   0.05–0.30, etc.), score constants and the brief move out of module constants into one
   `RunConfig` with today's values as defaults. The LLM brief (Phase 4) can only configure
   what lives here. The genome schema stays fixed: the config changes how genes are read,
   never how many there are.
2. **`prepare` in TS (Phase 2).** If rule thresholds can be edited in the browser, the
   browser has to rebuild `Ground` (design-cell filter, neighbour remap, `site_water`
   smoothing). That needs the export to carry per-cell layer columns plus the rules, and
   `prepare` ported with a parity test.
3. **Structured rules (Phase 2).** `when: "flood_surge_2050 > 1.5"` is run through pandas
   `eval`. The browser can't run it, and the service must never run user strings through it
   (see risk R2). Rules become `{layer, op, value}` clauses joined with `all`/`any`/`not`.
   The existing string form is parsed into that structure for back-compat.
4. **CellGraph (Phase 3).** As in section 2.
5. **Derived street and block network (Phase 6, not 8).** See risk R5.
6. **Lineage in JS (Phase 9 or earlier).** `run.everyone` in JS is only a count. Keep
   `{name, parents, scores}` per individual so the family tree can be drawn.

---

## 4. Decisions I propose (challenge any of them)

**D1. Front end: Vite + TypeScript + Svelte 5.** Plain TS would be enough for six
chapters. It won't be enough for a brief editor with citations, a scatter matrix, an
archive grid and a 3D compare view. Svelte keeps the bundle small and stays close to the
current vanilla style. React plus react-three-fiber is the alternative if you'd rather work
in the bigger ecosystem.

**D2. Map stack.**
- MapLibre GL.
- Basemap from **OpenFreeMap** (free, no key). Imagery for drawing boundaries comes from
  **Esri World Imagery** with attribution, behind a toggle.
- **terra-draw** for the polygon tool.
- **Photon** (komoot) for search-as-you-type. Nominatim's usage policy forbids autocomplete
  on the public server; Photon is built on OSM data and allows it.

**D3. Cross-engine RNG.** Port mulberry32 plus the Box-Muller normal to Python
(`pc/rng.py`) and use it in `pc/evolve.py` behind a flag. Then one seed gives the same run
in both engines, and parity can cover a whole evolution, not just one generation. The
default stays numpy until you agree, because switching changes every past Python run's
results (only the seeds, not the method).

**D4. What "every engine change ships in both" covers.** Growth, fitness, all Phase 6
metrics, ranking and the search loops (NSGA-II, NSGA-III, MAP-Elites) ship in both, with
parity tests. The Phase 7 building-scale geometry (marching cubes, CPPN, sun study) I
propose as **TS only**, with Python covering just the scores on exported meshes, if you
want a bench for them. Porting a mesher and a NEAT implementation twice is a lot of work
for little research gain. Your call: question Q7.

**D5. Space syntax: segment analysis on a derived network** (justified in Phase 8).
Angular segment integration and choice are less sensitive to how the axial map is drawn,
and a cell-derived network has no hand-drawn axial lines to begin with.

**D6. Retrieval.**
- The `/corpus` BM25 index (and optional small embeddings) is built at deploy time into a
  JSON file the Vercel function loads.
- Uploaded documents are parsed and chunked **in the browser** (pdf.js). Only the chunks go
  to the function, in the request. Nothing is stored server-side, which fits "no
  server-side run storage". It also stays under Vercel's 4.5 MB request body limit,
  because text is far smaller than the PDF.

**D7. Brief compiler model.**
- `claude-sonnet-5-5` by default, with `claude-opus-5-5` as an option.
- Output goes through tool use with a strict JSON schema. A validator rejects any key or
  value outside the vocabulary before the UI sees it.

**D8. Python tests.** Add `pytest` as a dev dependency. Metric unit tests live in
`test/metrics/` for both engines and read the same JSON cases.

**D9. Site export versioning.** The precomputed site files get `format: 2` (grid type,
per-cell area, degree, polygons, layer columns, rules). The TS loader reads format 1 too
until the old files are regenerated.

---

## 5. Risks

**R1. Performance on bigger or finer grids.**
- A 4 km² site at 20 m hexes is about 3,850 cells, already 6.8 s on Ahmedabad.
- A 10 m quad grid on the same site is 40,000 cells, roughly 10× slower.
- The cap should be on **cell count** (start at about 4,000 design cells), with area as the
  user-facing message.
- Hot paths to optimise in TS without changing results:
  - the `fronts()` sort, which uses `Set`s and is O(n²) per front
  - `rank()` running twice per generation
  - per-call allocations in `claim`

**R2. Code injection through rules.** `rules.apply` runs `g.eval(rule["when"])`. Feeding
user-edited rule strings into it on the public service would be a code-execution hole.
Structured rules (refactor 3) remove it, and the service only accepts the structured form.

**R3. Fetch time and fragility.**
- `pc fetch` pulls COGs from S3, FABDEM, and five Overture themes through the
  `overturemaps` CLI, with retries.
- A new site takes minutes, and Overture's catalogue server drops connections (already
  handled with retries).
- Jobs need a queue, a progress reporter per step, and a cache keyed on the polygon hash
  **plus the Overture release and data versions**, so cached results don't silently mix
  releases.

**R4. Licences on a public app.** FABDEM is CC BY-NC-SA. A public, free, non-commercial app
serving derived layers (not the raster) is fine. A paid tier or commercial use would not
be. Cartosat stays local, as now. Credits must show in the app, as they do on the page.

**R5. Phase 6 metrics need streets, and designs have none.**
- The genome places building, landscape and water. "street" is an allowed use in the
  rules, but nothing ever places it.
- D/H ratio, block perimeter, intersection density, active frontage and permeability all
  need streets and blocks.
- Proposal: in Phase 6, derive them from each design. Blocks are connected groups of
  building cells. The street network is the shared edges between blocks and open cells,
  plus the existing Overture roads.
- Phase 8 reuses the same network for space syntax.
- The alternative is a street gene, which changes the genome schema. That would be a v3
  conversation.

**R6. Gene-range config vs reproducibility.** Once the LLM can set ranges, two runs with
the same seed and genome but different briefs give different designs. The frozen run
config (site, brief, seed, settings) has to travel with every saved run and every shared
URL. This is Phase 9's job, but the shape is set in Phase 1.

**R7. NSGA-III and MAP-Elites in both engines.** Both double the porting and parity work.
NSGA-III's reference-point association has floating-point edge cases (ties in
perpendicular distance), so its parity tolerance must be on ranks, not exact niche counts.
MAP-Elites archive insertion order depends on the RNG, so it needs D3 first.

**R8. Repository layout clash.** The brief puts Vite at `/app`, where Streamlit lives
today. It moves to `/sandbox` in Phase 1 (section 3), with `pc app` updated in the same
commit.

**R9. The v1 static-page plan.** Phase 8 of v1 planned a page inside raghavkohli.xyz plus
`scripts/sync-permutation-city.py`. If v2 replaces that with a link to the Vercel app, the
sync script is dropped and `web/` retires. See Q1.

---

## 6. Phase plan, adjusted

No changes to your order except:
- Phase 1 adds the `RunConfig` extraction and the Streamlit move.
- Phase 2 adds structured rules and `prepare` in TS (needed for browser rule edits).
- Phase 6 builds the derived street/block network that Phase 8 reuses (R5).
- D3 (shared RNG) lands in Phase 1 if you approve it, since every later search method
  depends on it.

Data backlog items I'll touch as I go: sea levels (Phase 4, when the brief can cite
MCGM/INCOIS), river flooding for inland sites (Phase 2, Ahmedabad is inland), drain
networks (Phase 3, alongside drainage on `CellGraph`).

---

## 7. Open questions

See the Phase 0 checkpoint in the conversation. The answers get recorded here once given.
