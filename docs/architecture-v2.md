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

All fixed in Phase 3 (see the Phase 3 log), plus one the table missed: the drainage rule
counted cells upstream.

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
  evolve.ts     NSGA-II and NSGA-III (niche.ts); elites.ts is MAP-Elites
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
- Called through **OpenRouter** (the user's choice), from a Vercel function, with
  `OPENROUTER_API_KEY`. OpenRouter's API is OpenAI-compatible
  (`https://openrouter.ai/api/v1/chat/completions`).
- Model: Claude Sonnet 5.5 by default, Opus 5.5 as an option. The OpenRouter model id
  comes from `OPENROUTER_MODEL`, so the model can change without a deploy. The exact id
  is read from OpenRouter's model list in Phase 4, not guessed.
- Output goes through tool calling with a strict JSON schema. A validator rejects any key
  or value outside the vocabulary before the UI sees it, so the result doesn't depend on
  how a given provider enforces the schema.

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
- Phase 10 (added 2026-10-17) is a design and UI pass over the whole app: audit, design
  system, flow, states, accessibility and copy. It runs last so no screen is redesigned twice.
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

Added after the decisions below (same day):
- **Shared RNG (D3).** `pc/rng.py` and `app/engine/rng.ts` are the same mulberry32. Normal
  draws are the Irwin-Hall sum of 12 uniforms, not Box-Muller: additions only, so there is
  no `log`/`cos` whose last digit could differ between the two languages. The JS counter
  wraps at 2³² (`>>> 0`), so long runs stay exact. Python draws in the browser engine's
  order: crossover and mutation one gene at a time, parents by the same two-draw
  tournament.
- **Ties and rounding.** `fitness.crowding` uses a stable sort, as JS does. Scores round
  by scale, round half to even, unscale (`np.round`), as JS does.
- **One set of engine inputs.** `pc grow`, `pc evolve` and the sandbox grow on
  `export.engine_ground`: the design ground exactly as exported (local metres, rounded,
  one cell area). Attractors are shifted back by `Ground.origin` for drawing. Before this,
  the CLI grew on the unrounded geopackage, which broke ties differently.
- **Result.** The same seed gives the same run in Python and in the browser. Parity now
  covers the random stream and three whole evolutions per site (`npm test`, 21 tests).
  Full 30 × 60 runs from `pc evolve` matched the browser engine on all three sites, down
  to every individual's scores and parents.
- **Cost.** Every earlier seed now gives a different run. Mumbai Seq1 is now 43 designs on
  the front in 35 families (it was 41 in 17). The map sheets in `sites/mumbai-ewf/maps/`
  are redrawn.

## Phase 2 log (2026-10-16)

Done, on branch `v2-phase2` (PR #1 merged first):
- **Structured, overlapping rules (6.2).** `pc/rules.py` parses `when` strings into
  `{layer, op, value}` clauses joined by `all` / `any` / `not` (the structured form is
  accepted directly). Nothing goes through `eval` any more, which closes R2. Each cell gets
  a membership bitmask (one bit per rule, at most 32), the union of its rules' `roles`, and
  a `conflict` flag when its rules' allowed uses share nothing (then the union applies).
  Forbidden stays absolute. On all three sites every state, reason, limit and use is the
  same as before, and the map sheets are byte-identical. Roles added to every
  `rules.yaml`: `flood_storage`, `drainage_path`, `breeze_corridor`, `canopy`,
  `public_edge`. Unit tests in `test/python/test_rules.py` (pytest, D8).
- **Export format 2 (D9).** Site files add every layer column as built, grid neighbours,
  memberships and the compiled rules. The format-1 fields are unchanged, and so are the
  `design` blocks. The export now applies `rules.yaml` itself rather than reading
  `suitability.gpkg`. Sizes: Mumbai 0.67 → 1.4 MB, Ahmedabad 0.52 → 0.92 MB, Docks 0.15 →
  0.26 MB. Gzipped, as Vercel serves them: 156, 161 and 44 KB.
- **Rules and `prepare` in TS (refactor 2).** `app/engine/rules.ts` applies a rule set;
  `ground.ts` rebuilds the design ground from it (`designFromRules`, `prepareFromRules`).
  Parity covers the site's rules and an edited set (thresholds halved, plus a "yards" rule
  that conflicts with the rain hollows) on all three sites: memberships, states, limits,
  uses, conflicts, roles, reasons and the rebuilt design ground, exactly. 43 Vitest tests.
- **Overture `place` theme** added to `pc fetch`, for activity locations (R5). Existing
  sites don't have it until they are fetched again.
- **Layer service (`service/`).** FastAPI: `POST /sites`, `GET /jobs/{id}`,
  `GET /results/{key}.json`, `GET /limits`, `GET /health`. One job at a time in a thread;
  progress per step, and per Overture theme. Cache key: polygon, grid, context, sea
  levels, rules, Overture release (pinned for the download), `LAYERS_VERSION`, export
  format. Caps: 4 km², 4,500 cells, 6 builds an hour per address; CORS for the app and its
  previews only; structured rules only. `service/Dockerfile`, `railway.json`,
  `docs/service.md`. Tested end to end on two Mumbai polygons (0.26 km² in 7.5 minutes,
  mostly Overture; 2 ha), and both load and evolve in the browser engine.
- **Front end (D1, D2).** `new.html` in Svelte 5:
  - search (Photon), MapLibre on OpenFreeMap with an Esri imagery toggle, terra-draw
    polygon, and the area and cell count checked against `/limits` before sending
  - build with a step list and the job's own progress
  - the layer cake: each layer as its own map, toggled on and off, beside the rules map;
    hovering any map reads every layer, the cell's rules, roles, limits and conflicts
  - each rule's thresholds, comparison, height cap and unsealed share are editable, and it
    can be switched off; the map redraws at once
  - "Evolve designs on this ground" opens the chapters with `?site=<id or key>&rules=<the
    changes>`, and the same link reloads the cake. The chapters page accepts these links
    for precomputed and service-built sites.

Not done, or done differently:
- **Railway is not deployed.** There's no Docker on this machine and Railway needs your
  login (`railway login`). Until it's up, production's `new.html` says new sites can't be
  built yet; the layer cake works for the ready-made sites.
- **Grid choice** stays hex-only in the picker until Phase 3 (the service refuses `quad`
  with a clear message).
- **Rules can be edited, not added.** New rules (picking a layer and a test) need a small
  editor; I'd rather design it with the brief compiler in Phase 4, which will also add rules.
- **`svelte-check`** doesn't support TypeScript 7 yet, so `.svelte` files aren't
  type-checked. They stay thin; their logic is in `.ts` files that `tsc` checks.
- **Bundle:** `new.html` is 1.2 MB of JS (335 KB gzipped), mostly MapLibre. It's a
  separate page, so the chapters don't pay for it.

## Phase 3 log (2026-10-17)

Done, on branch `v2-phase3` (stacked on `v2-phase2`, PR #2 not merged yet):
- **`CellGraph` in both engines.** `pc/grid.py`: `HexGrid` and `QuadGrid` behind one
  interface (cover a shape, neighbours from row and col, outline, cell area, degree,
  spacing, shared edge). `app/engine/graph.ts`: the same grid read from the export
  (`gridOf`), a `CellGraph` over the site grid or the design ground (neighbours, centroid,
  area, polygon, weight), outlines and areas for drawing. Hex size is centre to corner (as
  `hex_radius` was); quad size is the side.
- **Quad neighbours share an edge (4), not a corner.** Water can't leak through a diagonal
  in the flood fill, "fronts a park" means a shared edge as it does on hexes, and drainage
  is D4. Every neighbour is then one spacing away, so the lowest neighbour is also the
  steepest and the table's "slope by distance" fix isn't needed. On these two grids every
  adjacency weight is equal (one whole edge), so smoothing stays a plain mean; a Voronoi
  graph would bring its own weights.
- **Reaches in metres, not hops.** Heat smoothing, the site's water, the water attractors'
  field and the daylight search are each set in metres (100, 100, 35, 100) and turned into
  steps with `passes()`. On 20 m hexes these are the old 3, 3, 1 and 3 steps exactly. On
  20 m squares they are 5, 5, 2 and 5. (Hexes of 15, 25 or 30 m from the picker now
  search about 100 m for daylight, where before they always searched 3 rings.)
- **A hex assumption the Phase 0 table missed: the drainage rule.** `upstream >= 40`
  counted cells: 4.2 ha of catchment on 20 m hexes, 1.6 ha on 20 m squares. New layer
  `catchment_ha` (upstream × cell area), and the rule is now `catchment_ha >= 4.1` in the
  template and every site. On 20 m hexes that picks exactly the same cells.
  `LAYERS_VERSION` is 2.
- **Export format 3.** `meta.grid` = `{type, size, spacing, degree, edge}`; hex files keep
  `hex_radius`. Neighbour arrays are n × degree. The TS loader still reads formats 1 and 2
  as hexes.
- **Hex results unchanged.** After rebuilding the three sites, map sheet 02 and every
  export block except `meta` (grid, design, context, and rules apart from the drainage
  rule's wording) are byte-identical. The fixtures' 40 grown designs, their scores and
  ranks, and all nine Python evolutions are byte-identical too. Map sheet 01's caption
  changed ("4+ ha drains through").
- **Quad parity sites.** `sites/mumbai-docks-quad` (20 m squares, coastal, polygon) and
  `sites/ahmedabad-wadaj-quad` (30 m squares, inland, box). They share their downloads
  through a new `data:` key in `site.yaml`. Parity is exact on both: rules, rebuilt
  design ground, growth, scores, ranks and three whole evolutions (`npm test`, 76 tests,
  including `test/ui/graph.test.ts`). Grid tests in Python: `test/python/test_grid.py`
  (42 Python tests in all).
- **Picker, CLI and sandbox.** The picker offers hexes or squares and a size, shows the
  m² per cell, and estimates cells per grid type, as the service does. The service builds
  quad sites. `pc new --grid quad --size 25` (`--hex` still works); the sandbox's new-site
  form has grid and size. The chapters, the cake and the 3D view draw from the grid's
  outline, so squares draw as squares and prisms get four sides.

Speed (`npm run speed`, 30 × 60 with a shock, this laptop): Docks 2.3 s (661 cells),
Docks on squares 5.2 s (1,749), EWF 4.5 s (1,623), Ahmedabad 10.0 s (3,607), Ahmedabad
on 30 m squares 10.9 s (4,146). Time follows cell count, as R1 said; a 20 m square has
40% of a 20 m hex's area, so the same site has 2.6 times the cells.

Unsure about, or left open:
- **Scores across grids.** Heat and human scale use neighbour counts (6 vs 4), so the same
  layout scores a little differently on each grid. The picker says to compare designs on
  one grid. Fitting the constants so the grids agree would be a separate experiment.
- **D4 drainage** gives straight, axis-aligned drainage lines on squares (visible on map
  sheet 01). D8 would look more natural but needs distance-weighted slopes and diagonal
  flow; I'd only do it if the quad grid becomes a main mode.
- **The two quad sites are public**: they show in the chapters' site list, which is a
  way to see the grids side by side. They can be hidden from `sites.json` if you'd rather
  not show test sites.
- **Hover on squares** uses the nearest centre within the circumradius, which is exactly
  the square the pointer is in.

## Phase 4 log (2026-10-17)

Done, on branch `v2-phase4` (stacked on `v2-phase3`):
- **Corpus (`corpus/`).** 18 files, 57 snippets, each with its source, reference, licence and
  how it was checked in its front matter:
  - Mumbai DCPR 2034: FSI (Reg. 30, Table 12), layout open space (Reg. 27), margins, tower
    step-backs and heights (Regs. 19, 41, 43)
  - Gujarat CGDCR 2017: AUDA FSI (Table 6.5), height and margins (6.6, 6.7), common plot
    (Table 6.50), Gandhi Ashram, riverfront and restricted zones (8.4, 8.5)
  - CEPT Sem 06 (densification at Wadaj; the workshop and block evolution) and Sem 07
    (Eco-machine), quoted with credit
  - a typology library (courtyard, L, U, tower, slab, podium and tower)
  - six pattern cards (21, 60, 61, 106, 107, 159), paraphrased, page and checked fields empty
  - Mumbai tide, surge and sea-level figures (secondary sources; see "Unsure about")
  Every regulation note cites the PDF page and the printed page. Where the PDF prints an
  amendment as both values ("two three times", "8% 10%"), the note says so.
- **Retrieval (`app/brief/`).** BM25 with a small synonym list (FSI/FAR, storey/height,
  setback/margin), run once for the description (uploads first) and once per part of the
  brief (FSI, height, margins, open space, flooding, typology, floor area, patterns), filtered
  to the site's place (Mumbai, Ahmedabad, or anywhere). About 25 snippets, 10 to 15 k
  characters. The corpus ships as `app/api/_corpus.ts` (`npm run corpus`; a test fails if it
  is stale), since the function can't read `../corpus` on Vercel.
- **The brief schema (`app/engine/brief.ts`, `pc/brief.py`).** A fixed vocabulary: FSI or
  floor area, height cap, coverage, storm, setbacks, programme mix, objective weights, gene
  ranges, typology priors, aesthetic priorities (the Phase 6 metrics), changes to constrained
  rules, patterns, material tags. Every value carries its snippet ids or none (assumed). The
  validator drops anything outside the vocabulary or its limits, with a warning: unknown
  fields, forbidden or retained rules, patterns without a card, ranges outside the defaults.
  `applyBrief` turns a brief into a run config: targets and storm, gene ranges, the height cap
  (on the rules' default; pattern 21 gives 4 storeys when the brief sets none), rule switches
  and limits. Typology priors give optional starting genomes (a site-scale reading of each
  type, labelled). **Parity:** five hand-written briefs (one full, one broken in about 30
  ways) are validated and applied on every site's rules in both engines: same brief, same
  warnings word for word, same run config, same seeds (30 tests).
- **`evolve` takes gene ranges** in both engines (default unchanged, so every earlier
  fixture still matches).
- **`POST /api/brief` (`app/brief/compile.ts`).** Checks the origin (the app and its
  previews), body size, description and upload limits, and a per-instance rate limit (8 an
  hour per address). Then retrieval, then OpenRouter with the brief as a tool whose schema
  only offers this site's changeable rules, the snippets shown and the pattern cards, then
  the validator. Model `anthropic/claude-sonnet-5.5` (from OpenRouter's list), or
  `anthropic/claude-opus-5.5` when "careful" is chosen; both overridable by env.
  OpenRouter refuses a forced `tool_choice` for these models, so it is `auto` and the prompt
  requires the tool; a text answer is a clear 502.
- **Tested on the preview** (`permutation-city-phczg368e`) with Mumbai Docks: HTTP 200 in
  30 s, 17 k prompt and 3.4 k completion tokens, **$0.069**. The brief: FSI 2.0 (DCPR Table
  12), 8 storeys (under the 32 m high-rise threshold), coverage 60%, DCPR setbacks, storage
  weighted first (Sem 07, sea levels), courtyard, L and U types, patterns 60, 106 and 61; the
  programme mix and most weights marked assumed. No warnings.
- **The brief panel (`new.html`, after the layer cake).** Description, documents (PDF via
  pdf.js 6.3.289 or text, read in the browser; only chosen passages are sent, at most 150),
  the model, then the proposed brief: every value editable, cited values as chips that open
  the passage, assumed ones marked, what each field drives, the checker's warnings, and the
  effect ("137 ha of floor area on 68.7 ha"). A value changed by hand loses its citation and
  says so. "Write it myself" starts an empty brief. "Evolve designs with this brief" carries
  it in the link (`&brief=`); the chapters check it again, apply it, show a brief line with
  an edit link, put typology seeds into Generation 0, and order families by the weights.
  Download gives the brief with the passages it cites.
- **Saved with the site.** `uv run pc brief <site> <file>` checks the downloaded brief, saves
  `sites/<id>/brief.json` and writes its targets and storm into `site.yaml`. `pc grow` and
  `pc evolve` then use its rules and gene ranges. The sandbox's brief controls gained "Save
  the brief to site.yaml". This closes the v1 item "save brief changes to site.yaml".
- **Docs:** `docs/alexander.md`; "Fitness as misfit" in `docs/generative-method.md`;
  `corpus/SOURCES.md`.
- **Fixes on the way:** the function's imports name their `.js` files (Vercel runs it as
  unbundled Node ESM; a test checks this); in dev, Vite serves `/api/brief` through the same
  handler (`BRIEF_REPLAY=<file>` answers from a recorded response).

Tests: `npm test` 132, `uv run pytest` 47.

Unsure about, or left open:
- **Mumbai's sea levels may be low.** Reported official figures (maximum tide 2.83 m above
  MSL, maximum surge 2.09 m, 0.38 m rise by 2050) stack to about +4.9 m today and +5.3 m in
  2050, against the sites' +3.5 m and +3.8 m. That stack is a worst case, and the primary
  INCOIS and Maritime Board documents weren't found, so I didn't change `site.yaml`. Your call.
- **Pattern cards are unchecked** against *A Pattern Language* (I don't have the book). Only
  pattern 21's 4 storeys reaches the engine, and only when switched on.
- **Cost control** is an origin check plus an in-memory limit per function instance, which
  Fluid Compute only partly shares. A Vercel Firewall rate-limit rule on `/api/brief` would be
  firmer; say if you want it.
- **Uploads come back as ids** after a link round trip (corpus citations are looked up again;
  upload passages aren't stored anywhere, by design).
- **Typology seeds** are my site-scale reading of each type (`TYPOLOGY_GENES`), not something a
  source states. They're optional and labelled.
- **The model can set material tags freely** (recorded only); everything else is from the
  fixed vocabulary.

## Phase 5 log (2026-10-19)

Done, on branch `v2-phase5`:
- **NSGA-III** (`pc/niche.py`, `app/engine/niche.ts`): Das-Dennis reference directions (the
  fewest divisions that give one per design: 3, 4 and 5 for populations of 30, 60 and 90),
  and niching on the front that doesn't fit. It is simplified so both engines pick the same
  designs bit for bit: it normalises between the ideal and worst points (no intercepts) and
  breaks ties by order. `evolve(..., search="nsga3")`. Everything else (breeding,
  immigrants, shocks, locks, start genomes) is shared with NSGA-II.
- **MAP-Elites** (`pc/elites.py`, `app/engine/elites.ts`): an archive over two traits, the
  best design per cell, with the same budget and breeding as `evolve`. There are nine
  traits: average storeys, height variety, open ground, landscape, water, and four of the
  scores. Phase 6 adds its metrics to this list. Quality is the mean of the five scores
  scaled 0 to 1, below zero when off the brief; a brief's objective weights weight it. A
  shock re-judges the archive under the heavier storm.
- **Parity:** four new whole runs per fixture (two NSGA-III, two MAP-Elites with axes, bins,
  a shock, start genomes and weights) match between Python and TS, including each elite's
  cell and quality. `test/ui/search.test.ts` checks what the methods promise: reference
  points, empty niches filled first, bins, quality ordering, and elites that only improve
  their cell.
- **CLI:** `uv run pc evolve <site> --search nsga2|nsga3|map-elites [--axes a,b] [--bins n]`.
  Runs and sheets of other searches are tagged (`seq1-nsga3`), so they don't overwrite the
  NSGA-II ones.
- **The page.** Chapter 04 has a search choice and, for MAP-Elites, the two traits and the
  bins (a linked brief's weights go to MAP-Elites as its quality). A new chapter, **05
  Explore**, shows every design the run kept:
  - a scatter matrix of the five scores, better towards the top right
  - parallel coordinates over the five scores plus floor area and storeys
  - the archive grid of plan thumbnails, for MAP-Elites
  - a table of the extremes: the design at each end of every measure, with the better end
    outlined
  Point at a design to identify it, and click to pick it: a plan, its scores, "view in
  detail" (the Families chapter's 3D view and locks) and "to the pen". Families and
  Breeding are now 06 and 07. The worker returns the kept designs with their scores, and
  the page regrows the ones it draws, with the run's locks and ranges. Archive thumbnails
  draw the site and its roads once and reuse them (85 thumbnails: 11 s down to about 1 s
  in a headless browser).
- **The comparison** (`docs/experiments/search-comparison.md`, `npm run compare`): five
  seeds on `mumbai-ewf`, with `ahmedabad-wadaj` as a cross-check.
  - NSGA-II and NSGA-III are within noise of each other, NSGA-II slightly ahead.
    Hypervolume at Mumbai: 51.6% NSGA-II, 49.6% NSGA-III.
  - MAP-Elites reaches about four times the trait cells (39 against 10) and has more
    distinct genomes, but a weaker front (39.6%).
  - Run times are the same (about 5 s at Mumbai).
  - **The default stays NSGA-II.**

Tests: `npm test` 181, `uv run pytest` 49. `tsc` is clean. Checked in a headless browser on
Mumbai EWF at 1280 and 375 px wide, with no console errors and no sideways scroll.

Unsure about, or left open:
- **NSGA-III as the default for more than five objectives** waits for Phase 6, where metrics
  can be promoted to objectives. Today every run has five, so the brief's rule never fires.
  I'd add the switch with the promotion.
- **MAP-Elites' traits** are the ones we have now. The brief's examples (symmetry ×
  density, green connectivity × height variety) need Phase 6's metrics. `DESCRIPTORS` is
  where they plug in.
- **The archive's range is fixed per trait**, checked against 1,500 random designs. A brief
  that pushes designs far outside it (say, 15 storeys) would pile them into the end bins. An
  adaptive range would fix that, but it is harder to keep identical across engines.
- **Explore uses the final population only**, not every design grown (1,860). Showing all of
  them would mean sending them back from the worker; say if you want it.

## Phase 6 log (2026-10-19)

Done, on branch `v2-phase6` (stacked on `v2-phase5`). Definitions are in `docs/metrics.md`.
- **The derived network** (`app/engine/metrics/network.ts`, `pc/metrics/network.py`), as
  proposed in R5:
  - blocks: connected building cells, cut where an existing major road crosses a link
  - open spaces and parks
  - street faces
  - centres: the cells nearest the core attractors
  - junctions and landmarks
  - walking distance over cell links
  The design ground now carries the site's roads (`Ground.roads`). Road cuts, link
  directions, rows and mirror images depend only on the site, so they are cached per site.
- **30 metrics in five families**, keyed to the brief's `AESTHETICS` vocabulary:
  - human scale (D/H enclosure, walkable blocks, low street faces)
  - permeability (junctions, connections per block, active frontage)
  - nature (park and water within 300 m, landscape cover, green view)
  - harmony and variety (mixes of heights, uses and types, shown not judged; a proportion
    palette)
  - eleven of Alexander's properties: levels of scale, strong centres, boundaries,
    alternating repetition (an FFT of built/open and of the skyline along the rows),
    positive space, local symmetries (plus global symmetry and balance as secondary
    readouts), contrast, landmarks at nodes, gradients, roughness and the void
  - semilattice richness
  - a placeholder for legibility
  Echoes (building scale) and not-separateness are listed as not measured, with the reason;
  so are the properties with no defensible proxy (R11).
- **Parity:** the metrics of 12 designs per site match to nine decimal places on all five
  sites, hex and quad. `test/metrics/cases.json` holds hand-worked designs (stripes, a pond)
  that both engines check exactly.
- **Promotion.** `evolve(..., objectives=[...])` takes up to two metrics with a better end,
  in both engines. A promoted value is stored in the design's scores (rounded to six
  places, as the scores are) and ranked like a score. Ranking, crowding and NSGA-III niching
  take an objectives list, which defaults to the five scores, so every earlier fixture is
  unchanged. Any metric can be a MAP-Elites trait. New fixture runs cover:
  - NSGA-II with two promoted metrics
  - NSGA-III with seven objectives and a shock
  - MAP-Elites over two metrics
- **"auto" search** (the new default in the page and in `pc evolve`): NSGA-II, or NSGA-III
  once promoted metrics take a run past five objectives. This closes the brief's rule left
  open in Phase 5.
- **The page:**
  - Chapter 04 has "also optimise" (two metrics), with a best-so-far chart for each.
  - Explore's pick panel and the Families detail show every metric, by group, each with a
    bar placing it among the designs the run kept. Properties the brief's aesthetic
    priorities ask for are marked.
  - Explore's parallel coordinates and extremes compare the scores or any one group of
    metrics.
  - The scatter matrix adds promoted metrics.
  - Breeding can favour any score or metric: it breeds 24 and keeps the best six.
  The worker measures every kept design.
- **CLI:** `pc evolve --objectives a,b`, `--search auto`. MAP-Elites `--axes` takes metric
  keys.
- `npm run metrics` surveys the metrics on random designs (spread and time per metric).

Tests: `npm test` 209, `uv run pytest` 53, `tsc` clean. Checked in a headless browser on
Mumbai EWF:
- a ten-generation run with two promoted metrics (NSGA-III, seven objectives): 2.4 s, against
  1.8 s without
- the metrics panel and the group views
- biased breeding
No console errors.

Unsure about, or left open:
- **Blocks are huge on most designs.** The genome has no streets, so the derived blocks are
  whatever building cells touch, cut only by existing roads. Walkable blocks (2 to 14%) and
  junctions (0 to 1.2 per km²) read low almost everywhere. That is honest about the designs,
  but it means those two metrics barely separate them. A street gene, or a rule that
  reserves a street every N cells, would fix it, but it changes the genome or the rules;
  your call.
- **Semilattice richness uses roads as a stand-in for transit**, and has no shops or
  schools. Overture's `place` theme is fetched for new sites but not for the three
  existing ones. Re-fetching them (`pc fetch`) and exporting the places by category would
  give real activities. It is network work I haven't done.
- **Some proxies are rough**, and `docs/metrics.md` says so for each:
  - Active frontage is nearness to a centre.
  - Green view counts open cells within two steps.
  - Local symmetries are high on almost every design (70 to 90%), because the attractor
    fields are smooth.
  - Gradients is 0% or 100% on designs with few height steps.
- **The constants are mine:** D/H 1 to 3, 400 m blocks, 6 storeys, 300 m and 400 m walks,
  12 m nominal street, landmark at mean + 2 sd. They are in `config.ts` and
  `pc/metrics/network.py`, and each is named in the docs.
- **Pattern cards and the corpus** don't cite the metrics yet. A brief can ask for a
  property, but the model only sees the vocabulary, not the definitions.

## Phase 6b log (2026-10-20): landform, heat and streets

On branch `v2-phase6b`, off `v2-phase6`. The last commit before streets is tagged
`v2-pre-streets`. The method is in `docs/landform.md`.

- **Places re-fetched first (brief section 5).** Overture shops, schools and transit for all
  five sites, kept at confidence 0.4 or more.
  - Semilattice richness now walks to real destinations: parks, water, shops (with the
    design's centres), schools and transit. Roads are no longer a stand-in for transit.
  - Means over 20 random designs: Mumbai EWF 0.64 to 0.76, Docks 0.81 to 0.72, Wadaj 0.64 to
    0.66. The spread across designs narrows, since existing destinations don't depend on the
    design.
  - Transit is thin in Overture: 12, 5 and 2 points, and no bus stops.
- **Landform (`pc/landform.py`).** Hydrology on the cells themselves (approved choice):
  - stream burning of mapped channels (Overture water, from OSM)
  - priority-flood fill with epsilon
  - flow to the lowest neighbour (six directions on hexes, four on squares)
  - valleys from 10 ha upstream (`valley_ha` per site), with Strahler order and provisional
    buffers
  - catchments per valley segment
  - ridges as edges between catchments where neither drains into the other, ranked by the
    smaller upstream basin and by consistency
  - relief classes as approved; FABDEM vs Copernicus told apart by file hash
  - flat sites take valleys from mapped water only, and catchments from the nearest drain

  Results:
  - **Both Mumbai sites: flat, no mapped drains.** The skeleton comes from the existing
    roads, labelled "skeleton from existing roads, not landform".
  - **Wadaj:** gentle (low confidence), 171 valley cells up to order 3 (89 on mapped
    streams), 22 strong ridges, 0 of 9 allowed crossings used. The square-grid version has
    13 strong ridges.
- **LST (`pc/lst.py`).** Landsat 8/9 C2 L2 from Planetary Computer: one SAS token per
  container (signing every asset hit the rate limit), cloud mask from QA_PIXEL bits 0 to 5,
  uncertainty cap 5 K. Median of 22, 23 and 54 clear scenes. Its comparison with the heat
  score is under "Unsure about".
- **Streets on cell edges, in both engines** (`pc/streets.py`, `app/engine/streets.ts`):
  - Four genes at the end of the genome (version 2, 51 numbers). A 47-number genome grows as
    a labelled pre-street genome.
  - Primary skeleton from `pc/skeleton.py`. On the roads fallback: major roads primary,
    residential secondary, service and port roads lanes.
  - Secondary streets and lanes follow level lines of the orientation field: contours, valley
    distance, or a bearing (the bearing on flat land). Patterns are grid, loops or branching.
  - No street runs along a valley corridor. Parts are joined by one breadth-first search from
    the main network, and every block is reachable.
  - Streets take width ÷ 2 from each side's cell, and coverage applies to the plot left.
    Gross and net floor area are both reported. Coverage range widened to 0.90.
  - About 2–8 ms per grow in TS, against 1–2 ms before. Ten generations at Wadaj take 7 s.
- **Export format 4.**
  - Per design cell: ground height, valley order, buffer, receiver, LST and ridge.
  - The skeleton, on design and grid cells, so edited rules map it again; the grid's
    receivers.
  - `meta.landform`, `meta.lst`.
  - The service bumps `LAYERS_VERSION` to 3, fetches LST as an optional step, and warns on
    Copernicus sites.
- **Rules.** "Drainage lines" is replaced in every site and in the template by "valleys" and
  "valley buffer (provisional)".
- **Metrics:**
  - Blocks are cut by the design's streets, and D/H uses real street widths.
  - Junctions are now street corners (T and Y on hexes).
  - Active frontage is now the share of faces on primary and secondary streets.
  - New: meshedness and dead-end share (permeability). Also water and land fit: valleys kept
    open, streets on ridges, streets in low ground, runoff path, and cooling where it's hot
    (LST).
  - Walkable blocks and junctions now spread across designs (table in `docs/metrics.md`):
    e.g. walkable blocks at Mumbai EWF go from 7% (2–14%) to 50% (28–95%).
- **The page:**
  - Five new layers: surface heat, flow, valleys, catchments, ridges. A relief line with the
    LST scenes; a Copernicus warning.
  - New chapter **03 Landform**: valleys by order, buffers, the skeleton in ink, crossings,
    ridge switches, the crossing count against the cap, joined or invalid, provisional
    buffers.
  - Plans draw streets as smoothed centrelines at their widths. Score lines show net and
    gross floor area, and pre-street genomes are tagged.
  - The brief lists the four street genes, each with a lock.
  - The layer cake (new.html) shows the new columns and the relief label.
- **Tests:**
  - parity: 130 tests, now including whole runs with street genes, every metric, and
    rule-edited grounds with landform columns
  - `test/ui/streets.test.ts` (11)
  - `test/python/test_landform.py` (4)
  - `npm test` 220, `uv run pytest` 57

Unsure about, or left open:
- **LST against the heat score: your call.** The heat score's own per-cell model, applied
  to today's land cover, correlates with LST at r = +0.23 (Mumbai EWF), +0.32 (Docks) and
  −0.10 (Wadaj, where dry-season grass runs hot). My recommendation is that LST sits beside
  the score, as a layer and the "cooling where it's hot" metric. It shouldn't replace or
  calibrate the score until the model splits trees from grass and bare ground.
- **Mumbai's roads skeleton is dense.** All classes, as agreed, give 864 skeleton sides for
  661 cells at the Docks. Streets take about half the gross floor area there, against 15–35%
  at Wadaj. Dual carriageways show as braided bands. Keeping only major and residential
  roads as the skeleton would halve that; say if you want it.
- **The skeleton doesn't move with edited rules.** It is mapped onto the new design ground,
  and sides that stop being design ground drop out.
- **Valley buffers stay provisional** until checked against the DCPR and CGDCR nallah
  margins in the corpus.
- **Bengaluru (added 2026-10-20, once FABDEM answered again).** `bengaluru-cascade`: a 1 km
  corridor (3.7 km²) along the Haralur → Kasavanahalli → Kaikondrahalli → Saul Kere tanks,
  candidate A of four (the only true cascade of small tanks, the most relief, open land left).
  - FABDEM, gentle (high confidence): relief 31.5 m, median slope 1.15%. 562 valley cells up
    to order 3 (335 on mapped drains), 41 strong ridges on the design ground, 0 of 10
    crossings, joined to the roads. Design ground 295 ha in 2,843 cells.
  - The first landform skeleton on a drawn polygon. Landform runs on the whole box, so ridge
    edges reached cells the polygon had cut; `pc/skeleton.py` now places those from rows and
    columns. It crashed the export before.
  - Design storm 150 mm and FAR 2.0 are assumed (in `site.yaml`).
  - A parity fixture: 156 parity tests now pass. Ten generations of 60 take 7.5 s.

## Phase 7 log (2026-10-20): building-scale massing

On branch `v2-phase7`, off `v2-phase6b`. The method is in `docs/massing.md`.

Choices made at the start (all the recommended options):
- plots are Phase 6b blocks, those over 0.5 ha split into 0.15–0.5 ha plots
- the height cap is the rules' max levels; the urban design's floor area is each plot's
  target
- one block per run, with its neighbours as context
- `.3dm` export through rhino3dm, loaded only on export

What was built:
- **Engine** (`app/engine/massing/`, TS only per D4):
  - envelopes on a 2 m raster: street bands, setbacks from the brief or defaults, caps,
    coverage limits, targets
  - three representations behind one interface: a typology grammar, a metaball voxel
    field, and a CPPN with NEAT mutation and crossover
  - repairs said with every result
  - four scores plus the floor-area gap: winter sun, hot-season shade, sky view, frontal
    area
  - NSGA-II in its own worker
  - readouts: daylit floor, echoes, local symmetries, levels of scale
  - meshes: exact boxes, or surface nets with Taubin smoothing
- **Page:** chapter 09 Massing, loaded on first use.
  - "mass a block" under a design's plan
  - a block picker, the plots table, editable setbacks
  - a gallery with height thumbnails
  - two linked three.js views with a sun study (date, solar time, shadows) and a section
    (plan cut or cut across)
  - a table of scores and readouts for A and B
  - downloads: glTF, OBJ, Rhino .3dm, bench file
- **Python bench** (`pc/massing_check.py`): rechecks a massing's envelope, suns and scores
  from a bench file, to the last digit. Nine fixtures, three sites × three representations.
- **Priors:** Patterns 107 and 159 narrow the typology wings to 9–12 m (assumed). The
  brief's typology priors weight the first generation; its setbacks set the envelope.
- **Ground:** gains `water`, the site's water cells. The smoothed `site_water` field is
  above zero everywhere, so it can't say where water is.
- **Tests:** `test/ui/massing.test.ts` (29), `test/ui/massing-exports.test.ts` (2: OBJ and
  `.3dm` read back), `test/python/test_massing_check.py` (13).
- **Page weight:** first load 41 KB gzipped before this phase, 43 KB after. three.js
  (737 KB) loads with the first 3D view, rhino3dm (2.7 MB) with the first `.3dm`.
- **Checked in a headless browser** on Bengaluru (typology, CPPN), Wadaj (field, a plan
  cut) and Mumbai Docks on squares (typology). Plus phone width (no sideways scroll).

Found and fixed on the way:
- Skins were open at their base (an off-by-one in the sample loop).
- Plain Laplacian smoothing shrank small masses by up to a third.
- Typology shapes had to fit their ragged plots wholly. They now may leave 15% of their
  columns to clipping.
- Interior plots snowballed into 4 ha plots.
- A Svelte state proxy couldn't be posted to the worker.

Unsure about, or left open:
- **Large blocks are slow.** A 9 ha block (sparse street genes) of 22 plots takes about 40 s
  for 312 massings; a typical 1–2 ha block takes 8–15 s. The page warns over 3 ha.
- **Context is the design's own prisms**, not the existing city.
- **Shade is scarce near the equator in April.** At Bengaluru (13° N) the sun is nearly
  overhead, so the shade score moves little; a hot-month afternoon window may suit better.
  It's in `HOT` in `scores.ts`.
- **Targets can be unreachable.** Urban designs often ask for FAR 4–7 on a block, more than
  the envelope's setbacks and coverage limit allow. Typology runs can then stay off
  brief, with a front of one, while CPPN and field runs fill the envelope.
- **Pattern 107's width is unchecked** against the book.

## Phase 8 log (2026-10-20): space syntax and legibility

On branch `v2-phase8`, off `main` after PRs #6–#9 were merged. The method is in
`docs/metrics.md`, "Space syntax".

Choices at the start (yours):
- radii 400 m, 800 m and Rn
- existing streets fetched to a 1 km buffer for space syntax only; computed on the full
  network, reported on site segments; the global measure labelled "Rn within the 1 km buffer"
- NAIN and NACH (Hillier, Yang and Turner 2012) as the measures, raw values secondary
- legibility a readout, promotable, with intelligibility in it and shown on its own; landmarks
  from the Phase 6 outliers

Then, once the costs were measured:
- exact Rn choice only for the opened design (10–35 s)
- a promoted legibility estimated during the run, with every value shown exact

What was built:
- **Data.** `pc fetch <site> --only streets` downloads Overture roads to 1 km beyond each
  site's box. The export carries them as simplified segments (`syntax` in the site file):
  3,300–12,500 segments per site.
- **The network** (`app/engine/syntax.ts`, `pc/syntax.py`):
  - The design's streets are rebuilt as **strokes**. Read straight off cell edges, hex streets
    are chains of 60° turns: before strokes, the median bend on hex sites was exactly 60°, and
    the straightest way through a junction was under 20° at 0–26% of junctions.
  - With strokes, the straightest way through is under 20° at 78–88% of junctions, hex and
    square alike.
  - Then the buffer, with streets over the design ground dropped, and links where the city's
    streets dangle at the edge.
- **The analysis:**
  - least-angle paths with integer turn costs (so both engines count the same ties), ties by
    length, metric radii
  - Brandes choice
  - Rn integration by a bucket queue, 3 times faster than the heap, identical results
- **Metrics:** NAIN at 400 m, 800 m and Rn; NACH at 400 m and 800 m; intelligibility (R400
  against Rn NAIN); legibility (intelligibility, centres on the integration core, landmarks
  seen from it). The Phase 6 placeholder is gone.
- **The run's estimate:** Rn integration on a condensed network (the buffer reduced to its
  gateways, once per ground).
  - Legibility r = 0.78–0.96 against exact; intelligibility r = 0.96–0.99.
  - About 0.15–0.5 s per design.
  - The 128-segment sample first chosen gave r = 0.67–0.80 and was dropped.
- **Both engines, exact parity:** every site's fixture checks one design segment by segment,
  and Docks also checks exact Rn choice and a run with legibility promoted. Python takes
  10–15 s per design.
- **The page:**
  - Space syntax readouts for the kept designs arrive from the worker after a run, one design
    at a time, with a progress line.
  - Explore has a "space syntax" group, which waits until every design is read.
  - The opened design has a space syntax panel:
    - a map coloured by any of the five measures, the integration core in ink, landmarks as
      triangles, the buffer in grey
    - NAIN and NACH by radius, with mean depth and mean choice beside them
    - legibility's three parts
    - a button for exact Rn choice (5 s on Docks)
  - Breeding can be biased by a syntax metric (the worker estimates it).
- **Tests:** `npm test` 296 (19 new), `uv run pytest` 75 (5 new). Checked in a headless
  browser on Mumbai Docks: a run, the readouts, Explore, the panel, exact Rn choice, and a
  10-generation run with legibility promoted (NSGA-III, six objectives, 330 designs in 46 s).

Also found in the smoke test after merging: the site picker's map had been blank on the live
site since Phase 2 (MapLibre's worker wasn't bundled). Fixed in PR #10, left for you to merge.

Unsure about, or left open:
- **A promoted legibility costs time.** About 5–8 minutes more per 1,860-design run with the
  estimate; an exact mode (integration without choice) would add 10–21 minutes. The estimate
  is weakest where a design's few centres and landmarks sit near the edge of the core (Docks,
  r = 0.78).
- **Landmark visibility is strict.** Any building of a few storeys close to the viewer blocks
  the sightline (cells are treated as solid, ignoring coverage and the street between). On
  some designs a cluster of landmarks next to the core counts as unseen.
- **The buffer is Overture's roads without footpaths.** Indian cities' lanes and footpaths are
  patchy in Overture, so the city round each site is coarser than it is.
- **Rn is the 1 km buffer, not the city.** Global values depend on where the fetch stops; they
  compare designs on one site, not sites.
- **Parallel-coordinate labels overlap** with seven syntax axes (left for Phase 10).

## Phase 7b log (2026-10-20): afternoon shade and existing neighbours

On branch `v2-phase7b`, off `v2-phase8`. The two Phase 7 follow-ups you asked for after
Phase 8. The method is in `docs/massing.md`.

What was built:
- **Shade in the hot afternoon.** The shade score read 15 April, solar 11:00–16:00; at 13° N
  the near-overhead noon sun swamped it. It now reads local 14:00–17:00 on the 15th of March,
  April and May. Local time goes to solar time through longitude, the site's UTC offset
  (`utc_offset` in `site.yaml`, else 5.5 h in India) and the equation of time.
- **Its spread** (`npm run massing-shade`, 48 bred massings on each of three blocks per
  site): the standard deviation across designs is 1.3–2.0 times what it was on 8 of 9 blocks.
  The exception (1.0×) is a Bengaluru block shaded almost wholly by tall existing neighbours.
- **Existing buildings as shade casters.** Overture footprints within 100 m of the design
  ground, in the export as `existing_buildings`. Heights: Overture's height, else floors ×
  3.2 m, else the median of known heights within 300 m, else 2 storeys; each keeps its source
  and the page counts them. Most are estimated (all 289 at Docks are 2 storeys).
- **A new massing score, winter sun taken from neighbours** (↓): hours of 21 December sun
  the massing takes from existing roofs. Above zero for 83–100% of massings where existing
  roofs are in reach, up to 0.86 h.
- The sun study shows the three hot-season dates and local time with the UTC offset; the
  viewer and the .3dm export carry an "existing" layer.
- Sites re-exported; massing bench v2; fixtures regenerated, Python check matches.
- **Tests:** `npm test` 299, `uv run pytest` 75, `vite build` clean. Checked in the browser
  on Bengaluru.

Unsure about, or left open:
- **Heights are mostly guesses.** Overture knows few heights on these sites; the surface
  model minus FABDEM was tried and dropped (r = −0.32 to 0.06 against known floors). Known
  heights lean tall, so the nearby median does too.
- **The neighbours score is often zero.** Blocks away from the edge of the design ground
  have no existing roof in reach; it matters only on edge blocks.

## Phase 7c log (2026-10-20): neighbour heights

On branch `v2-phase7c`, off `main` after #11 and #12 were merged. Your three follow-ups.

- **Google Open Buildings 2.5D Temporal**, tested the way the surface model was: against
  Overture buildings with known floors, r = 0.88 (Bengaluru, 577 buildings), 0.84 (Wadaj,
  1,373), 0.60 (EWF, 30), using the 90th percentile of its heights in the footprint. The
  nearby median gets 0.62, 0.68 and −0.33; the surface model got −0.32 to 0.06. Licence
  CC BY 4.0 or ODbL 1.0; credited on the page. It is now the third source, after Overture's
  height and floor counts. `pc fetch <site> --only heights` reads Google's public bucket (no
  account); the export fetches it when missing and goes on without it outside coverage.
- **Defaults fall** from 289 to 101 buildings at Docks, 527 to 83 at EWF, 32 to 14 at Wadaj,
  409 to 76 at Bengaluru.
- **Set by you.** The massing view lists the block's existing neighbours (guesses first)
  with a height box each; clicking a building in 3D finds its row. A typed height becomes
  source "user", is kept per site across designs, goes to the worker with the run, and marks
  the run stale until bred again.
- **Low confidence.** When more than half of a block's neighbours have guessed heights
  (nearby median or 2 storeys), hot-season shade and winter sun taken are labelled low
  confidence.
- Sites re-exported, massing fixtures regenerated (Python check matches). Tests: `npm test`
  300, `uv run pytest` 76. Checked in the browser on Docks: the label, setting heights, the
  label clearing, a run, picking in 3D.

Choices I made that you may want otherwise:
- **"Low confidence" counts the block's neighbours, not the whole site,** and counts the
  nearby median as a guess as well as the 2-storey default. With Open Buildings in, no site
  has a majority of defaults any more (Docks is highest at 35%), so a site-wide rule on
  defaults alone would never fire.
- **Open Buildings reads low** (3 m on average at Bengaluru and Wadaj, 7 m at EWF). I left
  it uncorrected rather than fit a bias on a few hundred tagged buildings that lean tall.

## Phase 9 log (2026-10-21): runs you can keep, and their family trees

On branch `v2-phase9`, off `v2-phase7c` (PR #13).

### Step 1: save and reload runs (`app/ui/runs.ts`)

- **The link.** After every run the address names it:
  `?site=…[&rules=…][&brief=…]&seed=…&gens=…&pop=…&search=…[&obj=…][&ax=…&ay=…&bins=…][&shock=15x1.3][&off=…][&locks=…][&pen=n]&gv=2&b=<build>`.
  - Opening it loads the site with its rules and brief, switches the same ridges off, locks
    the same cells, sets the form and runs again. The engine is deterministic, so the same
    designs come back: checked on Docks (330 designs, with a promoted metric and a shock) and
    Bengaluru (1,860, with a shock); families, front and sizes matched.
  - Locks are run-length encoded ("<use><count in base 36>"), so a link stays short.
  - A link can't carry designs from the pen. When a run started from them, it says how many
    (`pen=`), and opening it warns that the run won't match.
  - `gv` is the genome version, `b` the build (Vercel's commit, or the local one). Either one
    differing from this page puts a note under the run.
  - Unknown metrics, traits or searches are refused with a sentence, not guessed.
- **The file** (download the run / load a saved run) holds the full state:
  - the site, rules, brief, skeleton, locks with their notes
  - the settings and the run's start genomes (pen and typology seeds)
  - the result (history, families, kept designs with their metrics and space syntax, the
    archive) and the lineage, with every design's genome packed as Float64 base64
  - the pen, the hand-bred children, the opened design, and heights set on existing buildings
  - Loading shows the run as it was, without running it again (311 KB for a 330-design run).
  - Old genome versions load: 47-number genomes grow with the default street genes and carry
    the "pre-street genome" label, and the file's genome version is named.
- **Engine:** `evolve` and `mapElites` record a lineage: each design's parents, how it came
  (random, start, newcomer, bred), the share of genes from each parent, genes mutated, and
  its scores when made. Recording never touches the random stream (parity unchanged).

### Step 2: the family tree (`app/ui/tree.ts`)

- In the Evolution chapter, under the charts.
  - One row per generation, top to bottom. Lines run parent to child, heavier from the parent
    that gave more of the differing genes.
  - Ring: mutated (heavier for more genes). Square: newcomer. Diamond: a starting design.
  - Dark: kept; orange: the front, or the archive's elites under MAP-Elites. The shock's
    generation is shaded.
  - Pointing at a design traces its ancestry in ink and describes it; clicking opens it in
    the detail panel, grown as the run grew it.
- **At 1,800+ designs.** By default only the kept designs and their ancestors are drawn
  (284 of 1,860 on a Bengaluru run); each row ends with "+n" dead ends. "Show every design"
  draws all 1,860. A redraw takes about 20 ms either way.
- **Layout:** barycentre ordering (down, up, down), each design near its parents' mean with
  a minimum gap.
- Tests: `npm test` 310 (10 new: links, files, lineage, layout), `uv run pytest` 76.

Unsure about, or left open:
- **Opening a link runs it.** A run with legibility promoted takes minutes, and it starts as
  soon as the page loads. A "grow this run" button would be gentler; say if you want one.
- **Reloading the page reruns the run.** The address always names the last run.
- **The full tree is dense.** At 60 designs a row it is a lattice; tracing one design's
  ancestry works, reading the whole doesn't. Ancestries are wide: a front design after 30
  generations descends from most of Generation 0.
- **Under MAP-Elites the archive is the whole kept set,** so every kept design is orange.

## 8. Decisions (2026-10-16)

The user asked to go with the recommendations:

| | Decision |
|---|---|
| Hosting | Vercel, on a `vercel.app` name for now (https://permutationcity.vercel.app; `permutation-city` was taken). The custom subdomain steps stay in `docs/deploy.md` for later. |
| Framework (D1) | Svelte 5 for new UI from Phase 2. The six ported chapters stay plain TS until they are reworked. |
| Map stack (D2) | MapLibre GL, OpenFreeMap basemap, Esri World Imagery behind a toggle with attribution, terra-draw, Photon search. |
| Shared RNG (D3) | Done (above). |
| Phase 7 geometry (D4) | TS only. Python checks scores on exported meshes. |
| Space syntax (D5) | Segment analysis on the derived network. |
| Retrieval (D6) | BM25 index built at deploy time; uploads parsed and chunked in the browser. |
| Brief model (D7) | Claude Sonnet 5.5 through OpenRouter (`OPENROUTER_API_KEY`, model id in `OPENROUTER_MODEL`), Opus 5.5 as an option, strict JSON schema through tool calling plus our own validator. |
| Licences | The app stays free and non-commercial (FABDEM is CC BY-NC-SA). |
| Git | Work on `v2`, one pull request into `main` per phase checkpoint. |
| CEPT studio work | May be quoted in the app, with credit to the studio, semester and tutors. Phase 4 writes corpus notes from the Sem 06 and Sem 07 files listed in `generative-method.md`; the files themselves stay off the repo. |

Nothing is open. The DCPR 2034 and CGDCR 2017 (Part II) PDFs are found (see
`corpus/SOURCES.md`), and `OPENROUTER_API_KEY` is set in Vercel for Production and Preview.
