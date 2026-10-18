# Permutation City v2 - build brief for Claude Code

You are continuing work on **Permutation City**, a sandbox for generative design with nature. Read this whole brief, then `docs/generative-method.md`, then the repo, before writing any code. Work in phases. Stop at the end of each phase, report what you did, and wait for me before starting the next one.

---

## 1. What exists today

**Concept.** The tool takes Ian McHarg's Design with Nature layer-stacking method and adds evolution. You pick a site, and it fetches climate and landscape layers. The layers become rules for what can be built where, and designs are bred over generations. The user plays the urban designer: they set the rules, breed the designs they like, and test them against climate shocks. It is a sibling of Climate Code. Climate Code asks "what is here?" and this asks "what could be here?" The method comes from two CEPT studios.

**Python engine (`pc/`, run with `pc` through `uv`)**
- Phases 0-2 (data, layers, rules): 20 m hex grid; McHarg layers for ground, sea flooding, rain, green, buildings and industry; `rules.yaml` sorts each cell into forbidden / retained / constrained / open and gives a suitability map.
- Sandbox: `pc new / fetch / build / rules` works for any bbox or polygon, with a 250 m context margin. Coastal sites have editable sea levels.
- Phase 3 (genome and growth): attractor genes grow a design on the cells the rules allow.
- Phase 4 (fitness): flood storage, heat, floor area vs brief, carbon, daylight, human scale, ranked into Pareto ranks.
- Phase 5 (evolution): NSGA-II-style loop with the Sem 06 breeding rules (60/40 crossover, mutation, about 10% immigrants). About 1,860 designs in about 5 s. Family-keeping plus the extra scores fixed an early collapse into "towers in a park". Latest Mumbai run: 41 designs on the front in 17 families, 4.5-7.5 storeys on average. The main trade-off is storage vs daylight.
- Phase 6 (play): Streamlit app (`uv run pc app`) with Site, Evolve, Families (3D view, GeoJSON export) and Breed tabs. You can draw a new site in the app.

**Sites:** `mumbai-ewf` (main), `mumbai-docks` (polygon test, rough outline), `ahmedabad-wadaj`.

**Web version (Phase 8, mostly done)**
- `pc export` writes site data to JSON in `web/dist/`.
- `web/engine.js` is the engine ported to JS. `web/test/parity.mjs` checks it matches Python exactly.
- `web/` is a static page: six chapters, canvas maps, 3D view, evolution in a Web Worker.

**Still open from v1 (fold these into the phases below):** family tree view (lineage is saved, not drawn), saving brief edits back to `site.yaml`, saving and reloading runs, block-scale 3D massing, networks and space syntax, time steps (2025 / 2035 / 2050), and the data fixes listed in section 6.

---

## 2. What v2 is

A public web app on **Vercel**, at `permutation.raghavkohli.xyz` (my main site stays on GitHub Pages and will link to it). The user flow:

1. **Search** a location and **draw a site boundary** with a polygon tool.
2. **Layer cake**: the McHarg layers are fetched and stacked; the user sees each layer and the resulting suitability map, and can edit rules.
3. **Context**: the user describes the site in free text and can upload documents (bylaws, briefs, reports). An LLM, grounded in retrieved context, proposes a structured brief and parameter settings. The user reviews and edits, then confirms.
4. **Seed and evolve**: the engine builds the initial population and runs generations.
5. **Explore**: the user reads the Pareto front or a quality-diversity archive, compares designs on max/min of every metric, breeds favourites, and tests them against shocks.
6. **3D massing**: the same breed-and-explore loop at building scale, with free-form and curved massing, not just grid extrusions.

The Python engine stays as the **research bench and reference implementation**. The browser engine is the product. Parity tests keep them honest.

---

## 3. Ground rules

- **Do not break what works.** Keep `pc` commands, the Streamlit app and the parity test passing at every phase. If a change makes Python and JS diverge, fix it or stop and tell me.
- **Every engine change ships in both Python and TypeScript, with a parity test.** Seeded RNG everywhere so runs are reproducible.
- **The genome schema is fixed within a run.** The LLM may *configure* parameters from a fixed vocabulary. It may never invent genes or change the schema, because crossover and reproducibility depend on it.
- **Aesthetic metrics are readouts by default, not objectives.** The user can promote at most two into the optimiser (as objectives or as MAP-Elites axes). Keep the default objective count at 5 or fewer for NSGA-II.
- **Every metric is a pure, unit-tested function** with a definition and source in `docs/metrics.md`. No metric I can't explain to a jury.
- **Performance budget:** 2D evolution stays at roughly today's speed (about 1,800 designs in about 5 s on a laptop) and runs in a Worker; UI stays responsive while it runs. 3D massing is evaluated only for designs the user selects, never for the whole population.
- **API keys never reach the client.** LLM calls go through Vercel functions.
- **UI copy is plain and short.** No marketing tone, no em dashes.
- Small commits with clear messages. Update `docs/` as you go.

---

## 4. Target architecture

```
/pc          Python engine (reference, research bench, unchanged CLI)
/service     FastAPI layer service wrapping pc fetch/build/rules/export (deploy on Railway)
/app         Vite + TypeScript front end (deploy on Vercel)
  /engine    TS engine (ported from web/engine.js), runs in a Web Worker
  /ui        map, layer cake, brief, evolve, explore, 3D views
/app/api     Vercel serverless functions (LLM brief compiler, retrieval)
/corpus      curated RAG documents (markdown) with source notes
/test        parity tests (Python vs TS), metric unit tests
/docs        generative-method.md, architecture-v2.md, metrics.md, experiments/
```

Stack suggestions (challenge them in Phase 0 if you see a better fit): MapLibre GL for the map, terra-draw for polygons, Nominatim or a geocoder of your choice for search, three.js for 3D, Comlink for the Worker, Vitest for tests, the Anthropic API for the brief compiler.

---

## 5. Phases

Each phase ends with a **checkpoint**: summarise what changed, show how to run it, list anything you were unsure about, and stop.

### Phase 0 - Audit and plan
- Read the repo end to end. Map how layers, rules, genome, growth, fitness and evolution connect, in Python and JS.
- Write `docs/architecture-v2.md`: what you'll reuse, what moves, what gets refactored, and risks.
- Flag every place the code assumes a hex grid.
- List open questions for me (accounts, keys, geocoder choice, corpus contents).

### Phase 1 - Restructure and deploy a skeleton
- Move to the layout above. Port `web/engine.js` to TypeScript in `/app/engine` without changing behaviour; parity must still pass.
- Scaffold the Vite app with the existing chapters working on the precomputed sites.
- Deploy a preview to Vercel. Document how to point `permutation.raghavkohli.xyz` at it.

### Phase 2 - Layer service and site picker
- FastAPI service wrapping `pc new / fetch / build / rules / export`. `POST /sites` with a GeoJSON polygon and grid settings returns a job id; poll for status; result is the same JSON `pc export` produces.
- Cache results by a hash of polygon + grid type + cell size + layer config.
- Cap site area (start at 4 km² plus margin) and return a clear error above it. CORS locked to the app domains. Dockerfile and Railway deploy notes.
- Front end: search, polygon draw, submit, progress, then the layer cake view (toggle each layer, see the suitability map, edit rule thresholds and re-run rules).

### Phase 3 - Grid abstraction (hex or quad)
- Introduce a `CellGraph` interface (cells, neighbours, centroid, area, polygon, adjacency weights) in both Python and TS. Implement `HexGrid` and `QuadGrid`. Cell size is a parameter.
- Rasterise every layer and rule onto any `CellGraph`. Remove hex assumptions from growth and fitness.
- Parity tests for both grid types. Leave the interface open for a Voronoi or parcel graph later, but don't build it now.
- Add the grid choice to the site picker.

### Phase 4 - Context and the brief compiler (RAG)
- Context step in the UI: free-text site description plus document upload (PDF, text).
- Retrieval: chunk uploaded docs and `/corpus`. Start simple (BM25 or small embeddings stored as JSON). Corpus seed: my CEPT method doc, notes on Mumbai and Ahmedabad development rules, a typology library. Every corpus file states its source.
- Vercel function calls Claude with the site summary (layer stats, area, climate), retrieved snippets and a **fixed JSON schema** for the brief: target floor area / FSI, height limits, setbacks, programme mix, objective weights, rule weights, typology priors, aesthetic priorities. The response must cite which snippet supports each value, or say "assumed".
- UI shows the proposed brief with citations; the user edits and confirms. The confirmed brief is frozen into the run config and saved to the site config (this closes the old "save brief changes to site.yaml" item).
- Retrieved typologies may seed part of the initial population. Keep this optional and labelled.

### Phase 5 - Search: NSGA-II, NSGA-III and MAP-Elites
- Keep NSGA-II as the default.
- Add NSGA-III (reference points) for runs with more than 5 objectives.
- Add **MAP-Elites**: the user picks two behaviour descriptors (from the metrics in Phase 6, for example symmetry × density or green connectivity × height variety). The archive keeps the best design per cell.
- Explore UI: Pareto front view (scatter matrix, parallel coordinates, max/min per metric, "show me the extreme on X") and an archive grid of thumbnails for MAP-Elites.
- Run both on `mumbai-ewf` and write `docs/experiments/search-comparison.md`: diversity, front quality, run time. Use this to fix the default.

### Phase 6 - Aesthetic and urban metrics
Implement as readouts on every design, shown in a panel and comparable across the front. Definitions go in `docs/metrics.md`.

- **Human scale:** street width to building height (D/H) ratio, block perimeter (flag over ~400 m), share of frontage under a height threshold.
- **Proportion and coherence:** distribution of footprint and massing ratios; reward a small reused palette of ratios (low entropy). Do not reward the golden ratio specifically.
- **Balance and symmetry:** mirror correlation of the plan and skyline about the best axis; centre of visual mass vs site centroid for asymmetric balance.
- **Rhythm:** FFT of the skyline and street-frontage profiles; strength of the dominant periodicity.
- **Harmony vs variety:** entropy of heights, types and uses. Show both, since they pull against each other.
- **Contrast and emphasis:** presence and placement of landmarks (outliers in height or form) relative to nodes.
- **Permeability and active edges:** intersection density, block size, connections per block, share of active frontage on the ground floor.
- **Connection to nature:** walking distance to green and water, green coverage, a green view proxy.
- **Legibility:** see Phase 8; use a simple placeholder until then.
- Materiality and texture are out of scope for metrics; record them as tags in the brief only.

The user can promote up to two metrics to objectives or MAP-Elites axes. The Breed tab can bias selection by any metric.

### Phase 7 - 3D massing v2 (two-scale)
- **Urban scale** (existing genome): produces plots and an envelope per plot (height cap, setbacks, mask from the rules).
- **Building scale** (new gene pool), evolved inside a selected design's envelopes. Three representations, behind one interface:
  1. **Typology grammar:** courtyard, L, U, tower, slab, podium + tower, with parametric dimensions.
  2. **Voxel field with smooth skin:** voxels for validity, marching cubes or metaballs for a curved surface.
  3. **CPPN field:** a small network maps (x, y, z, distance to water, suitability, sun exposure) to density, thresholded into form. Evolve with NEAT-style mutation. Symmetry and repetition come from the activation functions.
- Every massing must stay inside its envelope; reject or repair, and say which.
- Scores: ground-level sun hours, sky view factor, shade on public space, a frontal-area wind proxy, floor area vs brief. Plus the Phase 6 metrics that apply at this scale.
- three.js viewer: orbit, sun study slider (date and time), section cut, compare two designs side by side.
- Export glTF and OBJ; Rhino `.3dm` via rhino3dm if practical.

### Phase 8 - Space syntax and legibility
- Build the street and open-space network from each design. Compute integration and choice (axial or segment, your call, justify it).
- Legibility score from integration structure plus landmark visibility (viewsheds from main routes).
- Replace the Phase 6 placeholder.

### Phase 9 - Runs, lineage and polish
- Save and reload runs: encode site + brief + seed + settings in the URL, plus JSON download and upload.
- Family tree view from the saved lineage.
- Shock testing in the browser (sea level, extreme rain, heatwave) on any selected design.
- A short "how it works" chapter in the app, based on `docs/generative-method.md`.

### Phase 10 - Design and UI
Runs last, once every screen exists. Engine behaviour does not change; parity must still pass.

- **Audit first.** Screenshot every screen and state of the deployed app (search, layer cake, context and brief, evolve, explore, 3D, runs). List what is inconsistent, cluttered or unclear, ranked by how much it hurts the flow. Agree the list with me before changing anything.
- **Design system.** One set of tokens (type scale, colour, spacing, radius, elevation) and shared Svelte components in `app/ui/`. Map and layer palettes are colour-blind safe and readable in light and dark themes. Document it in `docs/design.md`.
- **One flow.** The six steps of section 2 read as one path: a clear current step, back and forward without losing state, and the site, brief and run always visible in a summary.
- **States.** Every screen has designed loading, empty, error and long-job states (layer fetches and evolution runs show progress and can be cancelled where the engine allows).
- **Data views.** Pareto views, metric panels and the archive grid share one chart style, with readable axes, units and legends.
- **Layout.** 2D screens work from phone width to a wide desktop with no horizontal scroll. 3D stays desktop-first (see section 7) but must not break on small screens.
- **Accessibility.** Keyboard use for every control, visible focus, WCAG AA contrast, reduced motion respected, and text labels for anything shown only by colour.
- **Copy.** One pass over all UI text against the ground rules: plain, short, no marketing tone, no em dashes.
- **Performance.** Measure first load and bundle size before and after; the redesign must not make either worse.
- Checkpoint: before and after screenshots of each screen in `docs/design.md`.

---

## 5b. Christopher Alexander as a core reference

Alexander's work shapes the vocabulary, the metrics and the growth model. Add `docs/alexander.md` explaining how each work is used, and note in `generative-method.md` that Alexander grew sceptical of design methods after *Notes on the Synthesis of Form*. Cite him as a critic as well as a source.

**A Pattern Language -> the fixed vocabulary (Phase 4).** The brief compiler configures from a pattern vocabulary, never inventing new patterns. Write pattern cards in `/corpus/patterns/` (pattern number, name, scale, paraphrased intent, page reference, and how the tool uses it: `constraint`, `metric`, or `prior`). No verbatim book text. Start with the urban and building patterns that can be tested, for example 21 Four-Story Limit, 60 Accessible Green, 61 Small Public Squares, 106 Positive Outdoor Space, 107 Wings of Light, 159 Light on Two Sides of Every Room. Check every dimension against the book before coding it. The brief shows which patterns are active and why.

**A City is Not a Tree -> overlapping rules (Phase 2-3).** The current rules give each cell exactly one class, which is tree-like zoning. Allow cells to hold several overlapping memberships (e.g. flood storage plus public open space) while keeping `forbidden` absolute. Add a **semilattice richness** metric in Phase 6: how much the walking catchments of different activities (green, transit, market, school, water) overlap. Strict single-use zoning should score lower.

**The Nature of Order -> aesthetic metrics (Phase 6).** Use the fifteen properties as the main aesthetic framework, implementing those that can be computed and documenting the rest as not measured:
- levels of scale (an even ladder of element sizes, penalise big jumps; replaces any golden-ratio scoring)
- strong centres (nodes that other elements reinforce)
- boundaries (thickness and presence of edges around centres)
- alternating repetition (replaces the generic rhythm metric)
- positive space (convexity of open space, not leftover)
- local symmetries (count of small symmetric groups; use this instead of global mirror symmetry, keep global as a secondary readout)
- contrast, gradients, roughness, echoes, the void, not-separateness where a defensible proxy exists
Use Nikos Salingaros's work on quantifying these as the reference for formulas, and cite it in `docs/metrics.md`.

**Notes on the Synthesis of Form -> fitness framing.** Describe fitness in `generative-method.md` as reducing misfits, with requirements grouped by how they interact.

**A New Theory of Urban Design and The Oregon Experiment -> piecemeal growth mode (Phase 9).** Add a growth mode that develops a site in increments (2025, 2035, 2050). Each increment evolves only new interventions on top of what exists, and must keep or improve the wholeness metrics of the existing fabric. Compare its results to one-shot evolution in `docs/experiments/`.

## 6. Data backlog (do when touching the relevant code, or flag)
- Check Mumbai sea levels against MCGM / INCOIS figures.
- Georeference the studio DWG site plan.
- Map contaminated land properly instead of using industrial land as a stand-in.
- Add drain networks for flat land.
- Add river flooding for inland sites.
- Time steps (2025 / 2035 / 2050) once layers support scenarios.

## 7. Out of scope for now
User accounts, multi-user collaboration, server-side run storage, mobile-first 3D, and any claim in the UI that the tool "optimises beauty". It measures form and lets a person judge.

## 8. Start here
Do Phase 0 only. End with `docs/architecture-v2.md` and your list of questions for me.
