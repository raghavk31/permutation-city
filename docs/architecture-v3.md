# Permutation City v3: architecture and plan

Planning step, 2026-10-21, against branch `v2-phase9` at `5f16336`. Brief:
`docs/permutation-city-v3-prompt.md`. Claim: `docs/research/claim.md`.

Nothing here is built yet. Sections 7 and 8 are the estimate and the cuts; section 10 is my
questions.

---

## 1. In one paragraph

v3 keeps the analysis grid and everything that reads it (layers, rules, landform, scores,
form metrics, shocks, search), and replaces what a design *is*. Today a design is a use and
a height per cell, with streets on cell edges. In v3 it is vector geometry: a street
network, blocks, plots and buildings. It is grown from the genome in stages and then
rasterised onto the grid, as area fractions per cell, so the scorers still work. Nothing
draws cells any more, except a debug overlay. The UI splits into a story page and a
workbench that share one engine.

## 2. What changes, what stays

| Part | v2 | v3 |
|---|---|---|
| Layers, rules, landform, LST (`pc/`) | cells | **stays** |
| Skeleton (primary streets) | strong ridges and existing roads as cell sides | cleaned centrelines: simplified, splined, parallel carriageways collapsed, snapped to one network |
| Water and green placement | attractor fields claim cells by area share | **stays** as the claim, then dissolved and smoothed into polygons |
| Primary and secondary streets | skeleton + 4 street genes on cell edges | skeleton + **Otto routes** between destinations on a cost surface (section 5.1) |
| Local streets | level lines of an orientation field, on edges | **tensor-field streamlines**, by block pattern family (5.2) |
| Validation | reachability only | named hard rules with sources; repairs recorded (5.3) |
| Blocks | connected building cells | faces of the network, less water, green and forbidden land |
| Plots | Phase 7 splits of cell groups, ragged edges | **OBB splits** of blocks, every plot on a street (5.4) |
| Buildings | storeys and coverage per cell | per plot: storeys from the density field, footprint from coverage and setbacks |
| Scoring input | cell arrays | the same arrays, filled by rasterising, plus area fractions per cell (street, water, green, footprint) |
| Network metrics, space syntax | derived from cell edges | read the vector network directly |
| Massing envelopes | cell rasters | the vector plots (cleaner edges, no 15% shrink rule needed) |
| Piecemeal fabric | built cells + network on edges | built plots + the vector network, plus its raster |
| Genome | v2, 51 numbers | **v3, 59 numbers** (section 4) |
| Search, ranking, lineage, runs, shocks | | **stay**; runs file format 3 |
| Drawing | cells on canvas; oblique 3D prisms | vector layers in MapLibre (2D), three.js scene (3D), canvas thumbnails from the same geometry |
| Pages | one long page + `new.html` | story page + workbench |

## 3. The vector design model

### 3.1 Growth, in order

Fixed per site (computed at export or on load, cached):
1. The analysis grid, rules and layers, as now.
2. The **cost surface** on the grid: cheap on ridges and gentle slopes; dear across valleys,
   steep ground, high LST and forbidden land. Valleys are crossable only at allowed
   crossings, which keep the Phase 6b cap.
3. The **routing graph**: a coarse lattice (about 60 m) over the cost surface, with 16
   directions per node so routes aren't bent to hex angles.
4. **Candidate destinations:** gates (where existing roads cross the site boundary), and
   Overture places already in the export (transit, schools, shops).
5. The **cleaned skeleton** (5.5).

Per design, from the genome:
1. Decode. The attractor fields are computed as now.
2. Water and green claim cells as now. The claimed regions are dissolved into polygons and
   smoothed.
3. **Primary and secondary streets:** Otto routes between the gates, the centres (peaks of
   the density attractors) and the weighted places, merged by the detour-tolerance gene.
   They join the skeleton, and keep out of water and forbidden land except at crossings.
4. **Local streets:** in each region the primary and secondary streets enclose, the block
   pattern family's generator lays streets along the tensor field at the local spacing gene.
5. **Validate and repair** (5.3). Repairs are kept with the design.
6. **Blocks:** faces of the planar network, less water, green and forbidden polygons.
7. **Plots:** OBB splits within the family's width and depth ranges.
8. **Buildings:** per plot, storeys from the density field at the plot (capped by the rules),
   footprint from the coverage gene and setbacks.
9. **Rasterise** onto the grid: per cell, the area fraction of street, water, green and
   footprint, and floor area by area overlap. The cell's `use` becomes its largest share,
   for the metrics that need one class.

### 3.2 What the scorers read

- **Cell-based scores and metrics** (storage, heat, daylight, carbon, human scale, positive
  space, the void, gradients, local symmetries and the like) read the raster, now with area
  fractions.
- **Network metrics** (junctions, dead ends, meshedness, block size, connections per block,
  active frontage) and **space syntax** read the vector network.
- **Fairness for the baselines.** The v2 generator's designs rasterise exactly: whole cells,
  with streets as edge strips. So v2 and v3 designs are scored by the same scorer, which
  the A4 comparisons need.

### 3.3 Locks, the pen and breeding

- Cell locks still work: a locked water or green cell is forced into the claim, and a locked
  building cell is kept out of water and green and gets a plot.
- The pen, breeding and lineage stay. The block pattern family is one gene, so crossover
  keeps it whole.
- Genomes of different versions can't be bred together; the page says so.

## 4. Genome v3

Kept: 8 attractors × 5 genes and the 7 site-wide genes (47). The four street genes go.
New (12):

| Gene | Range | Reads as |
|---|---|---|
| `detour` | 0-0.4 | how far a route may run over its own shortest path to share another route (Otto's excess thread length) |
| `w_gates`, `w_centres`, `w_transit`, `w_schools`, `w_markets` | 0-1 each | how much each kind of destination draws routes |
| `f_landform`, `f_edges`, `f_wind` | 0-1 each | weights of the tensor field's sources: ridges and contours; coastline, water edges and existing roads; prevailing wind |
| `local_spacing` | 50-140 m (to check against sources) | between local streets |
| `pattern` | 0-1, in 5 bands | block pattern family |
| `plot_depth` | 0-1 | where plot depth sits inside the family's range |

59 numbers. Versions:
- **v1 (47) and v2 (51)** load with their label and regrow through a frozen copy of the v2
  growth (`engine/legacy/v2/`), so their links reproduce.
- They draw with A1's dissolved shapes, so no cell outlines show.
- MAP-Elites traits gain three network traits (mean block size, route directness, share of
  local streets); the defaults stay storeys × open ground.
- The brief's gene ranges gain the new genes.
- The search comparison is rerun on v3.

## 5. Choices

### 5.1 Connectivity: Otto's minimal-detour systems, by route merging on a cost graph

**What.**
1. Order the destination pairs by demand: a gravity weight from the destination genes.
2. Route each pair along the least-cost path, with Dijkstra on the routing graph. Edges an
   earlier route already uses cost less, by the factor 1 ÷ (1 + `detour`).
3. Routes with little detour tolerance stay direct. Routes with more fold into shared
   trunks.
4. The coarse routes are fitted with splines and snapped to the fine cost surface for
   drawing and rasterising.

**Why this and not a Physarum solver:**
- **It is Otto's own parameter.** His wet-thread machine had one control, the excess length
  of each thread. The detour factor is that quantity, so the gene can be explained to a
  designer in one sentence and traced to the source.
- **It is fast enough to run on every design.** On a 60 m lattice (about 400 to 1,000 nodes
  per site) a Dijkstra takes about a tenth of a millisecond, so 20 to 40 routes take a few
  milliseconds. Results are cached by the network genes.
  - The Tero model iterates a flow on the whole graph until it settles: hundreds of sparse
    linear solves per design. That is seconds, not milliseconds, too slow inside evolution.
- **It is exact in both engines.** Costs are integers (millimetres), and ties break on node
  index. The Python port (Milestone B, see section 8) can then match the graph exactly.
  - A Physarum solve is iterative floating point. Its topology depends on when the
    iteration stops, which makes topology parity fragile.
- **Physarum stays useful as a check.** In Milestone B it can be one figure: a Tero network
  on one site beside the merged-route network, as a sanity check that both find similar
  trunks.

Sources to cite (to check against the books): Frei Otto et al., *Occupying and Connecting*
(2009); Eda Schaur, *Non-Planned Settlements*, IL 39 (1991); Tero et al., "Rules for
biologically inspired adaptive network design", *Science* 327 (2010).

### 5.2 Infill: Chen et al. 2008 tensor fields, with sources from the land

**What.** A tensor field is a smooth field of street directions: at each point it says
which way the major streets run, and the minor streets run across them. It sums basis
fields, each weighted by its distance:
- **Landform (`f_landform`):** along contours where the land slopes; along ridge lines near
  ridges.
- **Edges (`f_edges`):** along the coastline, water edges and existing roads near them.
- **Wind (`f_wind`):** a grid on the prevailing wind bearing (ERA5 regional wind, `pc/wind.py`: risk R9, resolved).
- **The pattern family's own field:**
  - rotated orthogonal: a constant grid
  - radial: about the strongest centre
  - contour-following: the landform field alone
  - organic: no field; Voronoi cells from seed points, with streets on the cell edges
  - tight and shaded: a dense grid turned off the hot-afternoon sun, with short blocks

Streets are traced as streamlines (fixed-step RK2) from seeds on the existing streets,
alternating major and minor. They stop on meeting a street within half the local spacing,
which gives T junctions instead of near-misses. Spacing comes from `local_spacing`.

**Why:**
- It is the method the brief names.
- Its inputs are legible: every source is a map layer the person has already seen.
- Its weights and spacing are natural genes.
- It handles curved land, which plain grids can't.
- On flat land with no wind data, it falls back to the family field on the bearing from the
  site-wide genes, as v2 does.

### 5.3 Validation and repair

Each rule is a named setting (`RULES` in `engine/plan/network.ts`), documented in
`docs/streets.md` with its source. The values below were the first placeholders; the checked
values and their sources are in `docs/streets.md` (2026-10-22).

| Rule | Setting (to check) | Repair |
|---|---|---|
| every end meets a street, gate or destination | dead end only where designated, ≤ 60 m | extend to the nearest street within 1.5 × spacing, else delete |
| junctions T or X, angles 60-120° | ≥ 25 m apart (local), more for higher classes | snap ends to the junction; straighten the last segment; merge close junctions |
| curve radius ≥ class minimum | e.g. 15 m local, 60 m primary | refit the spline; flag if still under |
| gradient ≤ class maximum | e.g. 8% local, 5% primary | reroute on the cost surface; flag |
| hierarchy | primaries continuous, lanes branch off secondaries | reclassify, or delete orphan lanes |
| block perimeter | in the family's range | split a long block with a lane; merge a sliver into its neighbour |

Sources: Marshall, *Streets and Patterns* (2005); the NACTO *Global Street Design Guide*
(2016); IRC codes for Indian street widths (IRC:86 and IRC:SP:118, to confirm which
apply); Jacobs, *Great Streets* (1993); Alexander's network patterns in *A Pattern
Language*. A street network passes when no hard rule fails after repair; the repairs are
listed on the design.

### 5.4 Plots: oriented bounding box splits

**What.**
1. Split a block at the middle of its oriented bounding box (rotating calipers), across its
   long axis, with a small seeded jitter.
2. Repeat until each part is within the family's plot width and depth.
3. Reject a split that leaves a part with no street frontage, and try the other axis.
4. Stop splitting a part when neither split is valid.
5. Shape (added in A2, after a survey found 20-40% of building-plot area in slivers and
   wedges):
   - A part is cut along its main street: the longest street edge, averaged only with street
     edges within 25° of it. Averaging every street edge cut corner parts on the diagonal.
   - Each split is tried at the middle, then 15% to either side. The first whose parts all
     fill at least 0.6 of their box and are at least 0.6 of the family's least frontage wide
     is taken. A part more than 3 full plots in size takes the best split anyway; a smaller
     one stays whole.
   - Block corners under 30° get a 4 m corner splay before splitting.
   - Result on 10 designs a site: thin plots under 1% (was up to 14%), wedges 2-8% (was
     19-41%), corners under 30° 1-5% (was 12-25%). What is left is mostly small triangular
     blocks too small to split. A test in `test/ui/plan.test.ts` holds these.

This follows Vanegas et al. 2012, "Procedural generation of parcels in urban modeling"
(Eurographics), the method CityEngine uses.

**Why OBB and not the straight-skeleton method:**
- It is simple and deterministic.
- It can be written in both engines without a polygon library.
- Width and depth ranges map onto it directly.

Straight-skeleton plots suit deep, irregular blocks better (organic family) and are a
Milestone B option.

### 5.5 Skeleton cleaning

1. Merge parallel carriageways of one road into one centreline (pairs within 40 m, running
   within 15° of each other, a fixed setting).
2. Simplify (Douglas-Peucker, 5 m), then fit centripetal Catmull-Rom splines.
3. Snap ends to the nearest street within 20 m.
4. Ridge lines are traced from the ridge edges as polylines first, then go through the same
   steps. This removes the zigzags at the source.

### 5.6 3D: one three.js scene with real sun, soft shadows and screen-space occlusion

**What.**
- **Sun:** the engine's existing solar position (Spencer, site longitude and UTC offset) for
  the chosen date and time.
- **Shadows:** one directional light with its shadow camera fitted to the site's bounds. A
  4096 shadow map with filtered (PCF) shadows and a blur radius covers a 2 km site at about
  half a metre per texel. (three.js 0.186 has dropped PCFSoftShadowMap.)
  three.js's cascaded shadow maps take over above that, or at eye level.
- **Ambient occlusion:** three.js's own GTAOPass (ground-truth AO), a screen-space pass. A
  quality toggle switches it off. (Changed in A1 from N8AO, which would also have pulled in the
  `postprocessing` library; GTAOPass ships with three.js.)
- **Materials:**
  - the design in the building ramp, from the tokens
  - existing context light grey, from Overture footprints at their known or estimated
    heights
  - streets as flat ribbons by class
  - water with a little reflection (an environment map from three.js's RoomEnvironment)
  - green with a faint noise texture
- **Speed:** the design is merged into one mesh per material; context buildings are one
  merged mesh, with far context as footprints only. The target is 60 fps on a mid-range
  laptop at default quality.

**Why:**
- three.js is already in use (massing viewer, exports).
- N8AO gives good contact shading cheaply, with no baking, so it works on designs that
  change every second.
- A baked occlusion would look better on a still frame but needs time per design.
- N8AO was the first choice; see the note above.
- A path tracer is for video stills only (Milestone B, if wanted).

### 5.7 2D maps: MapLibre with the design as vector layers

- The design is drawn in MapLibre, which is already in the app for the site picker.
  Coordinates go from local metres to longitude and latitude through the site origin.
  Distortion over a 4 km site is negligible.
- The basemap gives the context as streets and light footprints, so no grey hexes.
- Hatches for forbidden and constrained ground use fill patterns. Hover and selection use
  feature state.
- Thumbnails (gallery, tray, live strip) use a small canvas renderer reading the same
  geometry and tokens. A MapLibre instance per thumbnail would be too heavy.
- **PR #10 must land first:** MapLibre's worker doesn't load in the built app today (the
  "Draw a site" map is blank).

### 5.8 UI architecture

- **Two pages:** `index.html` (the story) and `workbench.html`. They share the engine,
  `ui/tokens.ts` (the only place colours, type and spacing are defined; CSS variables are
  generated from it), the plan renderer and the 3D scene module.
- **Svelte 5 for the workbench** (decision D1). Existing Svelte pieces (`Picker`, `Cake`,
  `Brief`) move into steps.
- **One state store,** synced with the URL (step, site, run, selected design) and with an
  undo stack of user actions (lock, keep, rule edit, gene lock).
- **Typography:** match raghavkohli.xyz. It uses Inter Tight for headings and text (500 for
  display, 300 and 400 for text) and IBM Plex Mono for notes, on rgb(250, 250, 248) with ink
  rgb(28, 27, 24). Proposal: Inter Tight for display and text, with tabular numerals
  (`font-feature-settings: "tnum"`), and Plex Mono only for data labels. Question Q7.

## 6. Parity for vector geometry

**The rules that make exact parity possible:**
- Every stage boundary quantises coordinates to millimetres (integers).
- Costs are integers.
- Every sort has an explicit tie-break (node index, then x, then y).
- Generation uses no polygon library. Splits, face extraction and OBBs are written in both
  engines from the same pseudocode.
- Booleans are used only when rasterising area fractions, where a tolerance is acceptable.

**What is compared:**
- **Topology:** identical graphs (nodes, edges, classes, faces and plots, in the same order).
- **Coordinates:** within 1 mm after quantisation.
- **Rasterised fractions:** within 1e-6.
- **Scores:** exact. They are computed from the raster, as now.

**Transcendental functions:** the tensor field's sin, cos and atan2 can differ in the last
bit between engines. The field is evaluated in double precision, and a streamline's
decisions (stop, snap, join) compare quantised values. A decision within 1 mm of a
threshold is logged as a near-tie, so fixtures can't pass by luck.

**Milestone A proposal** (cut 1 in section 8):
- Generation is TypeScript only.
- Python gets a bench: it reads the exported vector design, rasterises it, and checks every
  score exactly. This is the Phase 7 massing pattern.
- The full Python port of skeleton cleaning, routing, infill, blocks and plots, with
  topology parity, moves to Milestone B.
- This breaks the ground rule "generated in both engines" for five weeks, and needs your
  approval.

## 7. Estimate

**The unit is a working day of build sessions.** It is calibrated on v2, where Phase 7
(massing, three representations, viewer, exports, Python bench) took about one such day.
The items you say fell short (streets, UI) were built at that pace, so each estimate here
adds explicit iteration time for quality: tuning on all sites, polish, review rounds.

The calendar has **25 working days**, from Thursday 22 October to Wednesday 25 November.
Waiting for your reviews (plan, wireframes, design system, first two steps) is not counted
in the estimates.

| Item | Full scope | Proposed (section 8 cuts) |
|---|---:|---:|
| **A1 quick visual fixes** | **2.75** | **2.5** |
| dissolve cells into smooth shapes, 2D | 0.5 | 0.5 |
| dissolve in 3D | 0.25 | 0 |
| colour tokens, calmer palette, hatches, colour-blind check | 0.5 | 0.5 |
| framing to site, context as streets and footprints | 0.25 | 0.25 |
| 3D: context, streets, sun, soft shadows, AO, framing, plain titles (the scene module A3 reuses) | 0.75 | 0.75 |
| families: 5-7 by clustering, one line each, score glyph | 0.25 | 0.25 |
| gene labels, cross-reference fix, first screen with an image | 0.25 | 0.25 |
| **A2 vector geometry and streets** | **9.25** | **7.5** |
| skeleton cleaning (incl. collapsing dual carriageways) | 0.75 | 0.75 |
| Otto connectivity | 1.25 | 1.25 |
| tensor-field infill | 1.0 | 0.75 |
| validation and repair, numbers checked against sources | 1.0 | 1.0 |
| blocks and OBB plots | 0.5 | 0.5 |
| block pattern families (5 / 3) | 0.75 | 0.5 |
| water and green polygons, buildings per plot, rasterising, rewiring metrics, syntax, shocks and envelopes | 1.0 | 1.0 |
| genome v3, legacy loading, MAP-Elites traits, brief ranges, rerun search comparison | 0.5 | 0.5 |
| piecemeal on the vector fabric | 0.5 | 0.5 |
| speed: worker pool, network cache | 0.5 | 0.5 |
| Python: full generation parity / score bench only | 1.5 | 0.25 |
| **A3 workbench and story page** | **8.75** | **7.0** |
| wireframes, one revision | 0.75 | 0.75 |
| design system page and components | 0.75 | 0.5 |
| shell: layout, panels, store, URL, undo | 0.75 | 0.75 |
| 2D map: vector design, legend, scale bar, north arrow, fit | 0.5 | 0.5 |
| Site, Layers, Rules, Landform, Brief steps | 1.0 | 0.75 |
| Evolve: live strip, progress, cancel | 0.25 | 0.25 |
| Explore: linked trade-off views, brushing, gallery, archive, extremes | 1.0 | 0.75 |
| Compare (with / without difference map) | 0.5 | 0.25 |
| inspector, pen tray, generation slider | 0.5 | 0.5 |
| Massing step, camera presets, presentation mode | 0.5 | 0.5 |
| states, onboarding, tooltips, shortcuts, keyboard and focus | 0.75 | 0.5 |
| story page (13 / 8 sections), mobile | 1.25 | 0.75 |
| performance pass | 0.25 | 0.25 |
| **A4 evaluation, video, write-up** | **4.0** | **3.0** |
| hilly benchmark site on FABDEM | 0.25 | 0.25 |
| experiment harness: baselines, ablations (5 / 3), matched budgets | 0.75 | 0.5 |
| runs (mostly overnight) | 0.25 | 0.25 |
| statistics and the one script for every figure and table | 0.5 | 0.5 |
| masterplan: find what's public, then digitise and score / find only | 0.75 | 0.25 |
| paper draft: structure, method, figures, tables | 1.0 | 0.75 |
| video script, shot list, demo mode | 0.5 | 0.5 |
| **Carried forward from Phase 9** (foresight setting, banded ranking, open-ground split, phased brief, wholeness caching; H4 needs them) | **0.75** | **0.75** |
| **Quality checks** | **1.5** | **1.25** |
| visual regression tests in CI | 0.25 | 0 |
| performance budget check | 0.25 | 0.25 |
| Chrome, Safari, Firefox | 0.25 | 0.25 |
| hallway test with 3 people, top three fixes | 0.75 | 0.75 |
| **Total** | **27.0** | **22.0** |

**Full scope doesn't fit:** 27 days of work against 25, before any review waits. The
proposed scope is 22 days, which leaves 3 days for review rounds, the hallway test's
scheduling and surprises.

## 8. Cuts, least damage to the demo first

The proposed column applies cuts 1-10. Cuts 11-15 are held in reserve if work slips.

| # | Cut | Saves | Damage |
|---|---|---:|---|
| 1 | Python generation parity moves to B; Python checks scores on exported geometry in A | 1.25 | none on screen; the "both engines" claim waits five weeks. **Needs your approval** (breaks a ground rule) |
| 2 | Masterplan: report what's public in A; digitise and score in B | 0.5 | one reference point missing from the paper draft |
| 3 | No 3D cell dissolving in A1 (A2 replaces the design geometry a week later) | 0.25 | the v2 3D view keeps prisms for a week |
| 4 | Visual regression tests move to B | 0.25 | regressions caught by eye until then |
| 5 | Three block pattern families in A (rotated orthogonal, contour-following, organic); radial and tight-and-shaded with the islands in B1 | 0.25 | fewer kinds of plan in the demo |
| 6 | Tensor field with three sources (landform, edges, wind or bearing) | 0.25 | coastline and roads share one weight |
| 7 | Paper draft: structure, method, figures and tables; related work as an annotated list | 0.25 | you write more of the related work |
| 8 | Three ablations in A (no landform rules, no Otto connectivity, no QD search); no tensor and no families in B | 0.25 | two components untested until B |
| 9 | Story page with 8 sections (question, layers and rules, landform and streets, genome, evolution and trade-offs, massing, growing over time, what we found + try it) | 0.5 | denser sections |
| 10 | Workbench extras to B: layer-stack animation, dragging crossings, rule before/after toggle, first-visit overlay, minimap, compare's difference map, brushing on the scatter matrix (parallel coordinates keep it); a lighter design system page (tokens and the components in use) | 1.25 | less delight; core flow intact |
| 11 | reserve: story page is today's page tidied, with a pinned image per chapter | 0.5 | no scrollytelling |
| 12 | reserve: Compare moves to B | 0.25 | the five-minute test's "compare three designs" uses the gallery |
| 13 | reserve: the hilly site moves to B if FABDEM is down | 0.25 | the landform claim can't be tested in A |
| 14 | reserve: demo mode plays a saved-run link | 0.25 | less smooth video |
| 15 | reserve: drop the "piecemeal without wholeness" arm | 0.1 | one baseline fewer |

### Schedule (proposed scope)

| Week | Work | Checkpoint |
|---|---|---|
| 22-28 Oct | A1 (2.5); wireframes (0.75); A2 starts | A1 PR; **wireframes for review** about 26 Oct |
| 29 Oct-4 Nov | design system (0.5); A2 | **design system for review** about 29 Oct |
| 5-11 Nov | A2 ends; Phase 9 carry-over; A3 starts; overnight A4 runs begin | A2 PR; **first two workbench steps** about 11 Nov |
| 12-18 Nov | A3; A4 harness and figures | |
| 19-25 Nov | A4 paper and video; hallway test (needs 3 people about 20-23 Nov); browser checks; buffer | Milestone A, 25 Nov |

PRs:
- A1, A2 and A3 get one PR each, and A4 goes in with A3's.
- The Phase 9 carry-over rides in A2's PR, since it touches piecemeal.

## 9. Risks

**Saved runs, links and old results**
- **R1. Old links regrow differently.**
  - v1 and v2 links must regrow through the frozen v2 growth, or they stop reproducing.
  - The metrics' own code also changes (the network now comes from vector streets). A v2
    link reruns with the new metrics, so its readouts differ from the v2 page.
  - Mitigation: run files store each design's metrics as computed. Links say "metrics from
    the current build" with the build tag.
  - A full freeze of v2 metric code doubles the metric maintenance; I don't propose it.
- **R2. Metric ranges and wholeness.**
  - Junction density, dead ends, meshedness and block size move on a real network. The hex
    T/Y effect disappears.
  - The ranges in `docs/metrics.md` scale Explore's bars and the wholeness composite, so
    they need recalibrating on v3 runs.
  - Wholeness values from v2 and v3 aren't comparable. Phase 9's experiment must be rerun on
    v3 for the paper.
- **R3. Piecemeal on vector geometry.**
  - The fabric becomes built plots plus a network that later steps extend. Later Otto routes
    must treat built plots as obstacles and the built network as cheap.
  - Docks' land-cap failure carries over until the open-ground split lands (Phase 9
    carry-over).
  - Foresight changes the scoring of every step, so H4 needs all three arms rerun.

**Geometry and speed**
- **R4. Speed per design.** The vector pipeline adds routing, streamlines, faces, splits and
  rasterising: my guess is 5-15 ms per design against about 3 ms today. That would take a
  1,860-design run from about 5 s to 10-30 s.
  - Mitigation: a worker pool (evaluation is pure, so results stay deterministic when
    gathered in order), the network cache keyed on network genes, and a 60 m routing graph.
  - If that isn't enough, the default run shrinks, and the page says so.
- **R5. "Pass validation on every site with no manual fixes".**
  - Mumbai's road skeletons braid (dual carriageways, rail yards). Collapsing them is the
    likeliest place to lose time.
  - Validation can pass while a plan still looks wrong. "Looks like streets" needs your eye
    at the A2 checkpoint, not only the rules.
- **R6. Parity near-ties** (if generation parity stays in A): streamline stopping and
  snapping decisions near thresholds can flip between engines. Mitigated by quantising and
  near-tie logging (section 6). This is the reason for cut 1.
- **R7. Rasterising changes scores.** Fractional cells move storage and heat a little against
  v2 even for similar plans. v2 designs are rescored by the same scorer for A4, so
  comparisons stay fair, but v3 numbers aren't comparable with v2 pages.

**Data and evaluation**
- **R8. Few hilly sites.** Three benchmark sites are flat or near flat. The landform part of
  the claim rests on the fourth site, and FABDEM's host has been flaky (down 2026-10-18).
- **R9. No wind data yet.** The tensor field's wind source and "aligned to wind" need a
  prevailing wind per site. Proposal: ERA5 hourly 10 m wind for 2015-2024 through
  Open-Meteo's archive API (free, no key), with roses for the hot season and the monsoon.
  Until then, wind falls back to the site-wide bearing gene.
  **Resolved 2026-10-22** (`pc/wind.py`, docs/streets.md "Wind"): every benchmark site has
  its regional wind, labelled regional, with the grid point's distance.
- **R10. Compute for A4.** 4 sites × about 9 conditions × 10 seeds is about 360 runs.
  - Plain runs are seconds; piecemeal runs took 6-13 minutes in Phase 9. Wholeness caching
    (carry-over) is needed to keep the piecemeal arms to a night.
- **R11. The masterplan's licence.** A published plan can be read and scored for research.
  Its drawing shouldn't be republished on the page. I'll report what's public before
  digitising.

**UI and delivery**
- **R12. Review cadence.** The schedule assumes reviews within a day at each checkpoint, and
  three hallway testers about 20-23 November.
- **R13. Browsers.**
  - Safari needs WebGL2 and module workers (fine from Safari 16.4).
  - The MapLibre worker bug (PR #10, still open) blanks the site map in builds today.
  - N8AO and shadows need testing on Safari's Metal backend.
- **R14. Copy.** All UI text you'll rewrite carries `COPY:` comments; until then the copy is
  placeholder-plain.

## 10. Questions

1. **Python parity.** Do you accept cut 1: TypeScript-only generation in Milestone A with a
   Python score bench, and the full Python port with topology parity in B?
2. **Time.** Can sessions run on some weekends? With six days a week, the reserve cuts are
   unlikely to be needed. Any days you're away (Diwali is Sunday 8 November)? Can you review
   each checkpoint within a day?
3. **Base.**
   - PRs #13 (Phase 7c) and #14 (Phase 9) are open, and #10 (map worker) too. Merge #10,
     then #13, then #14 into `main` (tests at each step), and branch v3 from `main`?
   - Phase 9's last step ("How it works") becomes the story page; agreed?
4. **Phase 9 carry-over.** My reading, please correct:
   - **phased brief:** each step's floor-area share is its own brief
   - **open-ground split:** the land cap applies only once a step's floor-area share is met,
     so early steps build denser (the Docks fix)
   - **banded ranking:** when no design is on brief, rank by gap bands so the other
     objectives still steer
   - **foresight:** each step is also scored under the final year
   - **wholeness caching:** measure wholeness once per distinct design
   - **matched comparison:** 10 seeds, same budget
5. **The hilly site.** Any preference? Two candidates with relief, flooding and an Indian
   context:
   - Guwahati, the Bharalu basin: hills and urban floods
   - Pune, the Ram Nadi and Baner hills
   I'll check FABDEM coverage and data before building either.
6. **Wind.** Is ERA5 through Open-Meteo acceptable as the prevailing-wind source (R9)?
7. **Type.** raghavkohli.xyz uses one family (Inter Tight) plus IBM Plex Mono. Use Inter
   Tight for display and text and Plex Mono for data labels? Or do you want a separate
   display face (Fraunces appears on your site only in the logo)?
8. **Domain.** Should the workbench live at `/workbench` on the same Vercel project? Is
   `permutation.raghavkohli.xyz` still the address?
9. **Connectivity.** Agree with merged routes on a cost graph, and Physarum only as a
   Milestone B comparison figure?
10. **The claim.** See the three questions at the end of `docs/research/claim.md`.

## 11. The final stretch (approved 25 October)

The brief for the last four weeks of Milestone A added drawn constraints and direct
editing, a programme, score maps, the context box and three workbench additions from the
classic page. Approved on 25 October with cuts C1-C3.

**Dates.** Feature freeze 20 November; 21-25 November polish, video and fixes only. No
checkpoints 13-16 November (you are away for reviews; build days continue). Features are
finished by 17 November so the hallway test on 18-20 November runs on the finished golden
path.

**Two findings behind the estimate**
- Reserve cuts 11, 12, 13 and 15 are for things that are now built. Only cut 14 (C3 below)
  still saves time.
- The day unit is the one in section 7, kept for comparison. A1-A3 (17 estimated days) were
  mostly committed on 21-23 October; the time moved into review rounds, the design review
  and performance, so this plan keeps a buffer.

### 11.1 Estimate

| Item | Days |
|---|---:|
| **1. Close what's open** | **3.0** |
| H4 write-up, both result sets merged | 0.5 |
| v3-a2 PR, merge, deploy, smoke test of /, /workbench and /classic | 0.25 |
| Performance pass: measure, fix anything over budget (interactions under 100 ms, UI never blocked) | 0.75 |
| Assamese font, IRC:SP:118 hill spacing on Guwahati, Guwahati FAR | 0.75 |
| Finish the 23 October workbench audit, fix the top findings, park the rest | 0.75 |
| **2. Drawn constraints and direct editing** | **5.25** |
| Drawing tools, data model, saved in runs and links | 1.0 |
| Engine: street constraints join the skeleton before connectivity, polygons override rules, a conflict blocks the run | 1.25 |
| Street edits rebuild blocks and plots, repair, re-score | 1.5 |
| Building delete and height edits | 0.25 |
| Edits locked for the next run (a locked edit becomes a constraint) | 0.5 |
| Undo and redo, tests | 0.75 |
| **A4: harness, ablations, runs, statistics, figure script, masterplan report, video script, demo mode** | **2.0** |
| Stress tests in the workbench | 0.75 |
| **4. Score maps, click-through, area statement and CSV** | **2.25** |
| Growing over time in the workbench | 1.0 |
| **5. Context box: place-tied overrides, confirmation, "set by you" list, keep / repair / replace, sites re-exported with street names** | **3.25** |
| **3. Programme: brief mix, uses on plots by rules (C2), population, URDPFI check** | **1.5** |
| Plan export: GeoJSON (C1) | 0.25 |
| **Quality before the freeze:** browsers, performance budget in CI, hallway script and observation sheet | **0.75** |
| Review rounds and surprises | 1.5 |
| **Total before 17 November** | **21.5** |
| Paper draft (moved to 21-25 November) | 0.75 |

24 days are available from 25 October to 17 November, so about 2.5 days of margin.

### 11.2 Cuts

Approved:

| # | Cut | Saves | Damage |
|---|---|---:|---|
| C1 | DXF moves to B; A exports GeoJSON and the area statement CSV | 0.5 | CAD users import GeoJSON |
| C2 | Uses go on plots by rules after growth (commercial on the busiest streets by integration, schools within walking distance of housing, shares from the brief), not by new genes | 0.5 | search doesn't vary the land-use mix; genome v3 and the five scores stay fixed, so the A4 runs stay valid |
| C3 | Reserve 14: demo mode plays a saved-run link | 0.25 | a slightly less smooth video |

Ready if anything slips, in this order:
- C4: walking times to green and schools only; transit only where a site has stop data (0.25).
- C5: keep / repair / replace defaults from heritage tags only, no age data (0.25).

### 11.3 Schedule

| Dates | Work | Checkpoint |
|---|---|---|
| 25-27 Oct | Section 1 | **27 Oct:** H4 results, live smoke test, performance report, audit findings |
| 28 Oct-2 Nov | Section 2 | look at the drawing tools about 30 Oct; **2 Nov:** constraints and editing |
| 3-4 Nov | A4 harness; scores and genome frozen; overnight runs, 10 seeds | |
| 5-8 Nov | Stress tests, score maps, area statement | **8 Nov:** first A4 numbers, stress tests, score maps |
| 9-12 Nov | Growing over time, section 5 | **12 Nov:** context box; hallway task script and observation sheet |
| 13-16 Nov | Section 3, GeoJSON, A4 statistics and the figure script, masterplan report, demo mode, performance budget in CI | none |
| 17 Nov | Figure script run on the A4 results; golden path complete | **17 Nov:** feature complete |
| 18-20 Nov | Hallway tests, Chrome / Safari / Firefox, fixes | **20 Nov:** freeze |
| 21-25 Nov | Paper draft, video from the shot list, polish, fixes | **25 Nov:** Milestone A |

One PR per item.

### 11.4 Decisions (25 October)

- Golden path: Bengaluru tank cascade. Guwahati only for a short shot of a constraint
  conflict on steep ground.
- "Keep building" (drawn constraint) and the "keep" status (context box) are one control.
- Edits re-score at once with an estimated whole-network syntax, labelled as an estimate;
  the exact value fills in in the background.
- Occupancy from Census 2011 household size, with its source, until the URDPFI 2014
  Guidelines are in `corpus/`.
- Guwahati FAR stays 1.5, marked "assumed", unless the Bye-laws and the Master Plan settle
  the site's zone.
- Run time on camera: demo mode or a jump cut, whichever is more honest. No faked speed.
- Safari: Playwright WebKit for my checks; a real device pass if you have one.

### 11.5 Risks

- **Re-scoring within a second.** Growth is 66-321 ms per design, exact Rn syntax 0.3-0.8 s;
  handled by the estimate-then-exact rule above.
- **Drawn streets against Otto connectivity.** Forced streets can fight route merging; the
  conflict report covers the network, not only forbidden ground.
- **A4 validity.** Any change to the genome or the five scores after 4 November means
  re-running the experiments.
- **Place matching** depends on street names in the site exports (re-export approved).
- **Sources.** URDPFI arrives from you; Guwahati FAR may stay assumed.

---

## A1 log (2026-10-21): quick visual fixes

On branch `v3-a1`, off `main` after PRs #10, #13 and #14 were merged (each tested; the live
site checked after each).

- **Colour tokens** in `app/ui/tokens.ts`, the only place colours, ramps, type and spacing
  are defined. CSS reads them as custom properties; canvas and three.js read them directly.
  - Water is one blue family, green one teal-green family, buildings a warm ramp by storeys.
    The existing city is light grey. Forbidden ground is a red hatch, constrained ground a thin
    outline with a sparse hatch. Elevation, heat (inferno) and other measures have ramps of
    their own. The accent marks the selection only.
  - The colour-blind check is `npm run colour-check` (Machado 2009, OKLab distance), recorded
    in `docs/ui/colour.md`. A six-step building ramp leaves no green that clears every pair
    under protanopia. Greens therefore carry a stipple in plan, existing buildings an edge
    line, and selections are outlines. Those pairs are marked, not hidden.
- **No cell outlines.** `regions()` dissolves cells of one colour into smoothed outlines, as
  side midpoints, a moving average and corner cutting. Every design and layer map uses it.
  - Corners are matched within 20 cm, which fixed seams from float noise.
  - A backdrop fills the slivers where three regions meet.
- **Framing:** every map is framed to the design ground, with a margin of 60 m or 6%. The
  context is roads, rail and the existing building footprints, not grey cells.
- **3D** (`app/ui/scene/design3d.ts`, loaded on first use: 14 KB gzipped plus three.js):
  - buildings dissolved by storeys, cut along the design's streets, set back 3 m, and
    extruded (heights ×1.5)
  - streets as ribbons
  - existing buildings as light grey extrusions at their heights
  - the site's sun on 15 March at 16:00
  - soft shadows (PCF with a blur radius; three.js 0.186 dropped PCFSoftShadowMap) and GTAO
    ambient occlusion
- **Families:** the six most distinct designs, by farthest-point sampling on land-use
  difference. Each is named for the score or trait it stands out on ("Design 3 · most flood
  storage"), with a five-bar score glyph. "Show all" lists every family.
- **Genome:** the genes strip is gone. Attractors are drawn as bold rings (solid, dashed or
  dotted by kind) with a one-line summary.
- **Other fixes:** the chapter cross-reference is fixed. The first screen leads with a 3D
  image (`public/hero.jpg`). Fonts match raghavkohli.xyz (Inter Tight, IBM Plex Mono).
- **Tests:** 336 (7 new: dissolving, holes, float noise, street cuts, inset, representatives,
  labels).

Unsure about, or left open:
- **Building masses in 3D are big.** v2 designs merge every adjacent building cell of one
  height, so a district can read as one 500 m slab. A2's plots replace this; the hero image
  will be remade then.
- **The hero is a capture,** not yet made by a script. It will be one in A4's figure script.
- **Shadows are thin from the default aerial view.** They read well closer in. The camera
  presets in A3 will help.

## A2 log (2026-10-22): speed, measured

Risk R4 guessed 5-15 ms per version 3 design. The real cost is higher, so the default run
shrank (your call, 21 October: 15 generations of 30, 480 designs, with the live strip).

- **Per design, Node, one thread:** Docks 66 ms, Eastern Waterfront 160 ms, Bengaluru
  213 ms, Wadaj 298 ms, Guwahati 321 ms.
- **The default run in the browser:** production workbench, headless Edge on the
  development laptop, worker pool:

| site | whole run | first generation shown | worst page response while running |
|---|---:|---:|---:|
| Mumbai Docks | 14 s | 3.6 s | 113 ms |
| Bengaluru tank cascade | 59 s | 10.1 s | 190 ms |
| Ahmedabad Wadaj | 69 s | 11.6 s | 50 ms |
| Guwahati Bharalu | 61 s | 10.3 s | 75 ms |

The page stays responsive throughout (the run is in workers), and the live strip shows the
best designs from the first generation on. A run is over the 10 s you asked about on every
site but Docks. The Evolve step shows its time estimate before a run starts.

## A2 log (2026-10-25): H4 results

The H4 runs (five modes, five sites, seeds 1 and 2, 1,440 designs per mode) finished across
two sessions and were merged; the tables are in `docs/experiments/piecemeal-vs-oneshot.md`
under "H4".
- **Against H4.** Steps with foresight end hotter at 2050 than the better one-shot mode on
  all five sites (by 0.12 to 0.81 °C), worse on flood storage on three, worse under the
  100-year rain on four, and far less diverse on all five. They are ahead on wholeness of
  the design built on three sites, on carbon on three and on daylight on two.
- **Foresight, as built (`scoreAhead`), changes little.** It helps clearly on Eastern
  Waterfront and hurts on Docks, including more floor lost to the 2100 sea.
- **The wholeness objective works.** Without it the design built is less whole on four sites
  (by 0.06 to 0.12) and no other score gains consistently.
- **Two seeds.** These are directions across sites, not tested effects; the A4 protocol's
  10 seeds and tests are not applied to H4 in Milestone A unless you ask for it.


## Final stretch log (2026-10-25): performance pass

Measured with real pointer input in headless Edge (production build, development laptop,
Intel UHD 630, 1440 x 900), main against this branch in one session. Times are Event Timing
durations: click to the next frame on screen.

| interaction | Bengaluru, main | Bengaluru, now | Docks, main | Docks, now |
|---|---:|---:|---:|---:|
| first visit to Massing | 1,160 ms | 224 ms | 600 ms | 200 ms |
| Explore | 1,152 ms | 1,080 ms | 360 ms | 376 ms |
| step Rules | 312 ms | 232 ms | 208 ms | 128 ms |
| step Site again | 288 ms | 216 ms | 336 ms | 368 ms |
| page load, long tasks | 3 (818 ms) | 4 (843 ms) | 3 (464 ms) | 4 (603 ms) |
| long tasks during the run | 34 (5.2 s) | 20 (3.5 s) | 6 (0.5 s) | 1 (0.1 s) |

What changed:
- **The cell locator** (point to nearest cell, used by growth, plots and massing) fills its
  raster by painting distances cell by cell instead of a bucket search per pixel: the same
  answer at every point on all five sites, 10 to 35 times faster (Wadaj 403 to 11 ms).
- **Massing reuses the design already grown** instead of growing it again on the page.
- **Grounds, rule results, dissolved regions and the existing-building footprints are kept**
  per site, so a step visited again doesn't redo them; the ground under a plan is drawn once
  per site and size.
- **The Site map stays alive** once the Site step has been shown with a site open (MapLibre
  cost about 2 s to build again). A link that opens on Site and moves on doesn't keep it.
- **Skeleton lines and the locator are made while the page is idle**, after a site opens and
  after a run.

Still over the 100 ms budget: step changes (130 to 370 ms) and Explore on Bengaluru. The
main thread is mostly free in them: Explore reaches its next frame about 150 ms after the
click (111 ms of script for a dozen plans) and the rest is the frame being shown, slow on
this GPU in headless Edge. Check these in a real browser before more work on them. The
whole run is unchanged (Bengaluru 59 s, Docks 14 s): growth in workers is the cost there.
