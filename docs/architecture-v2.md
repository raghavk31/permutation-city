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
3. **Structured rules with overlapping memberships (Phase 2, rasterised in Phase 3).**
   `when: "flood_surge_2050 > 1.5"` is run through pandas `eval`. The browser can't run it,
   and the service must never run user strings through it (see risk R2). Rules become
   `{layer, op, value}` clauses joined with `all`/`any`/`not`. The existing string form is
   parsed into that structure for back-compat. The same refactor replaces the single class
   per cell with overlapping memberships (section 6.2).
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

**R5. Phase 6 metrics need streets and activities, and designs have neither.**
- The genome places building, landscape and water. "street" is an allowed use in the
  rules, but nothing ever places it.
- D/H ratio, block perimeter, intersection density, active frontage, permeability, strong
  centres, boundaries and positive space all need streets and blocks.
- Proposal: in Phase 6, derive them from each design. Blocks are connected groups of
  building cells. The street network is the shared edges between blocks and open cells,
  plus the existing Overture roads.
- Phase 8 reuses the same network for space syntax.
- Semilattice richness needs the locations of activities (transit, market, school), not
  just green and water. Buildings carry no programme today. The proposal (section 6.4):
  - existing activities come from Overture `place` points, a new fetch theme
  - new ones come from the design: the peaks of core attractors are local centres
  - the brief's programme mix (Phase 4) shares out building floor area among centres
  This is derived, so the genome schema stays fixed.
- The alternative is a street gene and a programme gene, which change the genome schema.
  That would be a v3 conversation.

**R10. Copyright on Alexander's books.** Pattern cards and metric notes paraphrase and give
page references. No verbatim text goes into `/corpus`, the prompt or the UI. Dimensions
are checked against the book before they become code (section 6.3).

**R11. Metrics an architect can attack.** Several of the fifteen properties (good shape,
deep interlock, inner calm) have no proxy a jury would accept on a 20 m cell grid. These
are documented as not measured rather than given weak scores. Salingaros's formulas were
written for facades and plans at building scale. Applying them at urban scale is our
choice, and `docs/metrics.md` says so.

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

## 6. Christopher Alexander (brief section 5b)

Alexander shapes four layers of the tool: the rules model, the brief vocabulary, the
aesthetic metrics and a second growth mode. He is cited as a critic as well as a source.
After *Notes on the Synthesis of Form* he disowned the design-methods movement that the
book helped start (preface to the 1971 paperback edition), and later turned to unfolding,
step-by-step processes. A tool that breeds whole designs at once is exactly what he
argued against. The piecemeal mode (6.6) is the tool's answer to that, and
`docs/alexander.md` says so plainly.

New docs: `docs/alexander.md` (how each work is used), a note in `generative-method.md`
(his scepticism, and fitness as misfit reduction), and the Alexander and Salingaros
sources in `docs/metrics.md`.

### 6.1 Notes on the Synthesis of Form: fitness as misfit

No engine change. The scores are already minimised internally (`_as_min`), and `gap` is
already a misfit. What changes is the framing:
- each score is described as a misfit variable (a way the form fails its context)
- the UI groups requirements by how they interact: water (storage, flooding), climate
  (heat, daylight), material (carbon, floor area), scale (human scale, Phase 6 metrics)
- the grouping is checked against each run. Requirements whose scores are strongly
  correlated across the population interact. Showing that matrix is cheap and is the
  book's own method (decomposing requirements by their interactions).

### 6.2 A City is Not a Tree: overlapping rules (decide in Phase 2, rasterise in Phase 3)

Today `rules.apply` gives each cell one state, and later rules overwrite earlier ones. That
is a tree: every cell belongs to exactly one class. The new model:

```
rule        {id, name, kind: forbidden | retained | membership, when: <structured>,
             limits: {max_levels, min_permeable, uses, raised_ground, remediate},
             roles: [flood_storage, public_open_space, breeze_corridor, …], why, source}
cell        memberships: bitmask of rule ids (≤ 32 per site; 64 with two words)
            limits: combined from all memberships (strictest wins, as now)
            roles: union of the memberships' roles
            state: derived, kept for drawing and back-compat
                   forbidden if any forbidden rule matches   (absolute, as the brief requires)
                   retained  if any retained rule matches    (existing city, not design ground)
                   constrained if it has any membership
                   open otherwise
```

- **Forbidden stays absolute.** Nothing overrides it, and nothing can be built there.
- **Limits are safety constraints**, so they still combine by taking the strictest.
- **Allowed uses** are where overlap bites. Today the allowed uses are intersected
  (rain hollows ∩ drainage lines). If two memberships share no use, the intersection is
  empty and the cell becomes unusable without anyone deciding that. The new rule:
  intersect; if the intersection is empty, take the union and flag the cell as a conflict
  on the rules map. A person resolves it.
- **Roles** are what makes this a semilattice rather than a relabelled tree. A landscape
  cell in both `flood_storage` and `public_open_space` serves both. In Phase 6:
  - storage counts a cell's storage only if the cell is in the storage role or holds water
  - semilattice richness counts role overlap
- **Export:** `memberships` (bitmask per cell) plus a rules table. `state` is still
  exported, so format-1 readers keep working.
- **Parity:** rule evaluation moves into both engines (browser rule edits need it), with
  fixtures on all three sites.

### 6.3 A Pattern Language: the fixed vocabulary (Phase 4)

```
corpus/patterns/021-four-story-limit.md
  number, name, scale (town | neighbourhood | building),
  intent (paraphrased), page, use: constraint | metric | prior,
  maps_to: the RunConfig keys, rules or metric it drives, with the allowed range,
  checked: who checked the dimensions against the book, and when
```

- The brief schema's vocabulary is the set of pattern ids plus the `RunConfig` keys they
  map to. The compiler can switch patterns on, set values within a card's range, and cite.
  It can't add patterns, keys or genes.
- **constraint:** becomes a rule membership or a config limit (e.g. 21 Four-Story Limit
  sets a height cap over most of the design ground).
- **metric:** becomes a Phase 6 readout (e.g. 60 Accessible Green becomes walking distance
  to green of a minimum size).
- **prior:** biases the initial population or building-scale typologies (e.g. 107 Wings
  of Light and 159 Light on Two Sides apply to Phase 7 massing, not to the 20 m grid).
- The brief panel lists active patterns, why each is on (a snippet or "assumed"), and what
  each one changed.
- First set of cards: 21, 60, 61, 106, 107, 159. Dimensions are **not** coded until
  checked against the book. Until then a card's `checked` field is empty and the compiler
  treats its numbers as assumed.

### 6.4 The Nature of Order: the main aesthetic framework (Phase 6)

The fifteen properties replace the brief's generic list where they overlap. Each one is
computed at urban scale (U, Phase 6), at building scale (B, Phase 7), or not measured.

| Property | Scale | Proxy (Salingaros as the formula reference) | Replaces |
|---|---|---|---|
| Levels of scale | U, B | sizes of blocks, open spaces and buildings as a ladder; penalise large gaps between rungs (even spacing in log size) | proportion / golden ratio |
| Strong centres | U | centres = core peaks, squares, landmarks; score how many other elements (frontage, paths, height gradients) point to each | contrast and emphasis (in part) |
| Boundaries | U, B | share of each centre's perimeter with a defined edge (frontage, water, planting band), and its thickness | (new) |
| Alternating repetition | U, B | along streets and the skyline: alternation of built/open and high/low, its regularity and strength (FFT on a two-symbol sequence) | rhythm |
| Positive space | U | convexity of each open-space patch (area / convex-hull area), weighted by area | (new) |
| Local symmetries | U, B | count of small symmetric groups (mirror test on windows of 3–7 cells); global mirror kept as a secondary readout | balance and symmetry |
| Contrast | U | built/open and high/low contrast across edges | contrast and emphasis |
| Gradients | U | smoothness of height and density change from centres outwards | (new) |
| Roughness | U | variation within a repeated element, low but not zero | (new) |
| Echoes | B | similarity of angles and proportions across elements | (Phase 7) |
| The void | U | presence of one large calm open space relative to the busy parts | (new) |
| Not-separateness | U | edge interlock between the design and its context (shared, stepped edges) | (new) |
| Good shape, deep interlock and ambiguity, simplicity and inner calm | — | not measured; documented why | |

Kept from the brief's list: human scale, permeability and active edges, connection to
nature, harmony vs variety. They are urban-design metrics, not properties of wholeness.

**Semilattice richness** (new): the walking catchments of green, water, transit, market
and school, each about 400 m on the street network. The score is the share of design
cells in two or more catchments, weighted by how many. Strict single-use zoning scores
low. Needs activity locations: see R5.

**Wholeness** is the vector of the computed properties, never one number, in line with
the brief's "measures form and lets a person judge".

### 6.5 Engine shape this asks for

- `app/engine/metrics/` and `pc/metrics/` hold one module per property, with pure
  functions `(design, ground, network) → number`. Parity fixtures cover every metric.
- `network` (blocks, street segments, open-space patches, centres) is built once per
  design and shared by Phase 6 and Phase 8. It is only built for the readout panel and
  for promoted metrics, never for the whole population, unless the metric is promoted.
  This keeps the 5 s budget.

### 6.6 A New Theory of Urban Design, The Oregon Experiment: piecemeal growth (Phase 9)

```
increment 0 (2025): the existing fabric (retained + whatever stands on the design ground)
increment k:        evolve only new interventions on cells not yet committed;
                    earlier increments are locked (the existing `locked` mechanism);
                    floor-area target for this step (Sem 06's population table);
                    increment size capped (no single step builds most of the site)
acceptance:         the new fabric must not make any wholeness property worse than the
                    previous increment beyond a small tolerance (a constraint on the
                    vector, not a summed score); designs that fail are pushed back like
                    off-brief designs are now
```

- Reuses `locked`, `start`, the brief-as-constraint ranking, and the per-step targets.
- Needs the time steps from the data backlog (2025 / 2035 / 2050 layers, sea levels per
  year), so it lands after them.
- Experiment: `docs/experiments/piecemeal-vs-oneshot.md`. Same site and final target,
  compared on final scores, wholeness vector, diversity and run time.

---

## 7. Phase plan, adjusted

No changes to your order except:
- Phase 1 adds the `RunConfig` extraction and the Streamlit move.
- Phase 2 adds structured rules **with overlapping memberships** (6.2) and `prepare` in TS
  (needed for browser rule edits). It also adds the Overture `place` theme to fetch (R5).
- Phase 3 rasterises memberships onto any `CellGraph`.
- Phase 4 adds the pattern cards and pattern vocabulary (6.3), `docs/alexander.md`, and the
  misfit framing in `generative-method.md` (6.1).
- Phase 6 builds the derived street/block network that Phase 8 reuses (R5), and uses the
  fifteen properties as its framework (6.4).
- Phase 9 adds piecemeal growth (6.6).
- D3 (shared RNG) lands in Phase 1 if you approve it, since every later search method
  depends on it.

Data backlog items I'll touch as I go: sea levels (Phase 4, when the brief can cite
MCGM/INCOIS), river flooding for inland sites (Phase 2, Ahmedabad is inland), drain
networks (Phase 3, alongside drainage on `CellGraph`).

---

## Phase 1 log (2026-10-16)

Done:
- Layout: `app/` (Vite + TS), `app/engine/` (TS engine), `app/ui/` (the six chapters),
  `app/api/` (Vercel functions), `app/public/sites/` (exports), `test/parity/` (fixtures,
  Vitest test, speed script), `sandbox/app.py` (Streamlit, still run by `pc app`). `web/`
  is deleted.
- TS engine: a line-for-line port of `web/engine.js`, split into `config`, `num`, `ground`,
  `genome`, `fitness`, `rank`, `rng`, `evolve`, `worker` (Comlink).
- Behaviour check: before `web/` was deleted, the old JS and new TS engines ran nine full
  evolutions (three sites × plain / shock / locks + start genomes + other population
  sizes). History, final population (names, ranks, crowding, genomes, scores, parents),
  families and hand breeding were identical.
- Parity: `npm test`, 9 tests on 3 sites, exact.
- Run config, first step: the gene ranges are one table, `pc.genome.RANGES` and
  `DEFAULT_RANGES` in `app/engine/config.ts`, passed to `decode` and `grow`. After the
  change, the Python exports and fixtures are byte-identical.
- Vercel project `permutation-city`, with `vercel.json`, `/api/health` and the steps in
  `docs/deploy.md`.

Deferred, waiting on answers:
- D1 (framework): the ported chapters stay plain TS. The framework is chosen at the start
  of Phase 2, before any new UI.
- D3 (shared RNG): not switched. Python evolution still uses numpy.

## 8. Open questions

See the Phase 0 checkpoint in the conversation. The answers get recorded here once given.
