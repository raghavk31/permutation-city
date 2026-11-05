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
  the site's zone. (25 October: the Bye-laws 2014 give 1.5 for the design's plots and
  streets in a High or Medium Intensity Zone; only the zone is still assumed, since the
  zone map isn't in the published PDF. See `sites/guwahati-bharalu/site.yaml`.)
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

## 12. Built form re-plan (approved 26 October, with the changes in 12.12)

The built form brief (`docs/built-form-brief.md`, 26 October) reverses the order of work:
shared ground first, buildings placed to shape it, plots drawn last. This section re-plans the
rest of Milestone A around it. Nothing is built until you approve.

### 12.1 Where things stand

- **Final-stretch section 1 (your priority 2) is done:** PRs #19, #20 and #21 merged on 25
  October, deployed and smoke-tested. Only PR #22 (Assamese font) is open.
- **Section 2 is half done:** items 2.1 and 2.2 (drawing tools, moves in the engine, conflicts
  hold the run, saved in links) are on branch `drawn-constraints`, pushed, no PR yet.
- **Calendar:** 22 days from 27 October to 17 November (feature complete), weekends counted.
  The day unit is the one in section 7. Sections 1 and 2.1-2.2 (5.25 units) took two calendar
  days, but the brief's complaints are about quality, so this plan doesn't bank that speed.

### 12.2 Why block 206 asks for FSI 5.4

`floorAreaTarget` is `target_far × the whole design ground` (`engine/fitness.ts`). For
Bengaluru that is FAR 2.0 (assumed) over ground that includes the tank edges, valleys and
landscape. All of it lands on the building plots, so a plot's net FSI is several times 2.0,
and the cap that stops it is the assumed 15 storeys in `sites/bengaluru-cascade/rules.yaml`.
Real rules (FAR by road width on the plot, coverage, setbacks by height) cap the plot, not the
site. So section 3 comes first: it turns the brief from "fill to the target" into "capacity
under the rules, and the brief's shortfall against it".

### 12.3 One decision that shapes the estimate: what each scale builds

The new pipeline has nine steps. Building all nine for every design in a run (480 per run, at
66-321 ms each today) would make runs several times slower, and every step after 4 would move
the urban scores that A4 freezes. Proposal:

| Step | Urban scale (every design in a run) | Opened design and the Massing step |
|---|---|---|
| 1 rules and brief | plot rules by road width, plot size, height; capacity | same |
| 2 streets, frontage types | yes | yes, plus cross-sections in 3D |
| 3 shared ground first | yes (a layer with its own outline) | yes, down to cluster courts |
| 4 building type per block | yes, as Spacematrix numbers: each block's type gives its coverage (GSI), storeys and floor area analytically | the type, then its parameters evolve |
| 5-8 place, plots, shape, voids | no | yes: the opened design's whole 3D view (type defaults) and the picked block (searched) |
| 9 score | urban scores read block-level coverage and storeys | building scores per block, with neighbours massed |

This keeps runs fast, makes the urban scores final once steps 1-4 land, and lets building-scale
work continue after the A4 freeze without invalidating it. The cost: the urban scores see a
block's type through its density numbers, not its exact buildings. **Question Q1.**

### 12.4 Estimate

Full scope against the proposal. "Old" rows are what remains of section 11.

| Item | Full | Proposed |
|---|---:|---:|
| **Quick fixes (brief section 12)** | **1.0** | **1.0** |
| street view camera on the nearest street | 0.25 | 0.25 |
| other buildings and existing buildings in distinct colours, estimated heights hatched | 0.25 | 0.25 |
| plot panel "no existing buildings" bug; plain massing names; "beaten 87%" reworded | 0.25 | 0.25 |
| larger thumbnails; explainer collapses; Voxel field and CPPN "experimental", Typologies default | 0.25 | 0.25 |
| **References and docs/built-form.md** (pipeline, the reference behind each step, every number checked or marked) | **1.0** | **0.5** |
| **3. Rules and brief** | **3.75** | **2.25** |
| Bengaluru: RMP 2015 zoning regulations and amendments, bye-laws, fire rules, URDPFI; a corpus note, every figure cited | 0.75 | 0.75 |
| engine: FAR, coverage, height and setbacks per plot by road width, plot size and height; fire open space; capacity of the site | 0.75 | 0.75 |
| brief against capacity: the shortfall said plainly in the Brief step, Evolve and Massing | 0.5 | 0.5 |
| lake and drain buffers: legal figure plus a wider design setting (12.6) | 0.25 | 0.25 |
| other sites: Wadaj (CGDCR), Docks and EWF (DCPR), Guwahati (Bye-laws) | 1.5 | 0 (B, Q4) |
| **4. Streets and shared ground** | **3.0** | **2.25** |
| frontage type per segment (active by integration and choice, residential, green edge, lake edge) | 0.5 | 0.5 |
| cross-section per class: plan diagram, applied to the 3D street ribbons | 0.75 | 0.25 |
| shared ground first: lake buffer, valley corridors, squares at high-choice junctions, open-space hierarchy (Correa's sizes as settings) | 1.25 | 1.25 |
| walking access to each level of open space (score) | 0.5 | 0.25 |
| **5. Building type per block, urban scale** | **1.5** | **1.5** |
| Spacematrix feasibility per block; the family rules table in one documented file | 1.0 | 1.0 |
| type gene within the feasible set, genome v3.1, old links regrow as v3 | 0.5 | 0.5 |
| **5-7. Buildings at block scale** | **4.5** | **4.25** |
| placement along frontage and shared-ground edges with spacing rules; six type generators built floor by floor (depth limit, floor heights, grid, core, height ceiling, stepping down to water, ground floor by frontage and flood) | 3.0 | 2.75 |
| violations reported, repair counted, penalty over a threshold | 0.25 | 0.25 |
| one island per feasible type, best of each side by side with key scores, then variations in the chosen type | 1.0 | 1.0 |
| neighbouring blocks massed with their type's defaults | 0.25 | 0.25 |
| **6. Plots drawn after placement** | **1.75** | **1.75** |
| territories clipped to the block, every plot on a street; skeleton splits for irregular blocks, OBB for regular; least width and depth, depth-to-width ratio, merge; corner plots; mixed sizes | 1.25 | 1.25 |
| plots follow the land (nothing on a drainage line, stepping with slope); plot table with type and the rule that set its size | 0.5 | 0.5 |
| **8. Voids** | **1.75** | **1.25** |
| courtyards sized by winter sun on the court floor and hot-afternoon shade | 0.5 | 0.5 |
| breezeways aligned to the hot-afternoon wind axis | 0.5 | 0.5 |
| view corridors to the lake | 0.5 | 0 (B) |
| raised ground where flood depth needs it | 0.25 | 0.25 |
| **10. Scores** | **1.5** | **1.25** |
| habitability: floor within the depth limit, daylight on facades per floor (sky view at facade points), cross-ventilation share, sun on court floors | 0.75 | 0.75 |
| buildability, site response | 0.5 | 0.25 |
| hide scores constant across a run; names from what a design does at the scale shown | 0.25 | 0.25 |
| **New work** | **19.75** | **16.0** |
| **Old: drawn constraints, rest** (street edits rebuild and re-score; building edits; locked edits; undo and tests) | 3.0 | 1.0 |
| **Old: A4** harness, runs, statistics, figure script, masterplan report, video script, demo mode | 2.0 | 2.0 |
| **Old: stress tests in the workbench** | 0.75 | 0 (B, Q4) |
| **Old: score maps, click-through, area statement and CSV** | 2.25 | 0.5 (area statement and CSV only) |
| **Old: growing over time in the workbench** | 1.0 | 0 (B) |
| **Old: context box** | 3.25 | 0 (B) |
| **Old: programme** | 1.5 | 0 (active ground floors come from frontage types) |
| **Old: GeoJSON export** | 0.25 | 0.25 |
| **Old: quality before the freeze** (browsers, budget in CI, hallway script) | 0.75 | 0.75 |
| **Review rounds and surprises** | 1.5 | 1.0 |
| **Total before 17 November** | **36.0** | **21.5** |

22 days are available, so the proposal leaves half a day of margin besides the review
allowance. Full scope is 14 days over. The riskiest row is the six type generators (2.75): it is
where slips will show first, and the reserve cuts in 12.5 start there.

### 12.5 Cuts

To Milestone B, from your list of acceptable candidates:

| # | Cut | Saves | Damage |
|---|---|---:|---|
| D1 | Context box | 3.25 | the "set by you" list, keep / repair / replace wait; drawn "keep building" still works |
| D2 | Growing over time in the workbench | 1.0 | the classic page and the H4 write-up keep piecemeal visible |
| D3 | Programme beyond frontage-driven ground floors (brief mix, population, URDPFI check) | 1.5 | no land-use mix or population figure in A |
| D4 | Plan export beyond GeoJSON | 0 | already cut (C1) |

Beyond your list, needing your approval (Q4):

| # | Cut | Saves | Damage |
|---|---|---:|---|
| D5 | Score maps and click-through to B; the area statement and CSV stay | 1.75 | scores stay as numbers and bars, not maps |
| D6 | Stress tests in the workbench to B | 0.75 | the classic page still runs them; the workbench doesn't |
| D7 | Drawn constraints: building delete and height edits, locked edits to B. Street edits rebuild and re-score stay. A building edit becomes "change this block's type" | 2.0 | fewer direct edits on the demo |
| D8 | Real rules for Bengaluru only; the other sites keep today's rules, marked assumed | 1.5 | A4's other sites run on assumed plot rules |
| D9 | View corridors to B | 0.5 | lake views are kept only by stepping down to water |
| D10 | Narrower rows: 3D cross-sections as ribbon widths, access score folded into section 10, lighter built-form doc | 1.75 | less finish |

Reserve, in this order, if a row slips:
- E1: neighbouring blocks as prisms at their type's density, not massed (0.25)
- E2: raised ground flagged and drawn as a plinth line only (0.25)
- E3: the Massing step shows the best of each type side by side, without exploring variations inside the chosen one (0.5)
- E4: OBB splits with the shape rules for every block; skeleton splits for irregular blocks in B (0.5)
- E5: five type generators, pavilions in B (0.5)

### 12.6 Rules: what is known today, and confidence

From a first search (26 October), to be read in the sources themselves before any figure enters
the engine:
- **Lake buffer.** RMP 2015's zoning regulations set 30 m around lakes and 50, 25 and 15 m
  along primary, secondary and tertiary drains. The NGT raised the lake buffer to 75 m in May 2016
  (the Bellandur and Mantri case). Most sources, including a 2023 Karnataka High Court judgment,
  say the Supreme Court set the 75 m direction aside in March 2019, which returns lakes to
  30 m. One case summary says the opposite, and later reports describe a state move to lower
  buffers for smaller lakes.
  **Confidence: medium** that 30 m is the operative figure for these four tanks, all large;
  **low** on any later amendment until its notification is read.
  Proposal: the legal figure (30 m) is the rule; a design setting defaults to 75 m (the NGT's
  ecological case), with the capacity shown both ways (Q6).
- **FAR, coverage and setbacks.** RMP 2015 Zoning Regulations (BBMP's PDF of
  `Zoning_Regulations_RMP2015f`, Table 10 for Residential (Main), building lines by road width)
  and BDA's compiled amendments. A February 2026 amendment reportedly changes setbacks to
  depend on plot size (above 4,000 m², 5 m on all sides); sources disagree on the details, so the
  notification itself has to be found. Bengaluru's civic body became the Greater Bengaluru
  Authority in 2025; which bye-laws are "latest" (BBMP Building Bye-laws 2003, or a newer set)
  is to be settled.
- **Fire:** Karnataka Fire and Emergency Services rules and NBC 2016 Part 4 for buildings over
  15 m: access width and open space round the building.
- **Alexander's dimensions** (107, 115, 122, 159) are still unchecked against the book
  (`docs/alexander.md`). Without a copy they stay "assumed" with a secondary source (Q7).

Sources found so far:
[Citizen Matters on shrinking buffers](https://citizenmatters.in/shrinking-lake-buffers-zones-bengaluru-citizens-need-to-know/),
[Citizen Matters on the NGT 75 m order](https://citizenmatters.in/bellandur-lake-ngt-final-judgment-on-mantri-sez-bangalore/),
[Deccan Herald on the Supreme Court hearing](https://www.deccanherald.com/india/karnataka/bengaluru/can-ngt-alter-lake-buffer-zone-713458.html),
[Karnataka High Court, SJR Prime v. BBMP, 2023](https://indiankanoon.org/doc/105341693/),
[Lawtext summary (contradicts the others)](https://lawtext.in/judgement.php?bid=6149),
[RMP 2015 Zoning Regulations, BBMP](https://site.bbmp.gov.in/PDF/townplanning/Zoning_Regulations_RMP2015f%20(1).pdf),
[BDA amendments to the zoning regulations](https://bdabangalore.org/uploads/files/TPM_Documents/Amendments_to_Zoning_Regulation_All.pdf),
[Cyril Amarchand on the 2026 setback amendment](https://corporate.cyrilamarchandblogs.com/2026/02/amendment-to-zonal-regulations-under-revised-master-plan-2015-streamlining-setback-requirements-and-parking-provisions-in-bengaluru/).

### 12.7 Islands or MAP-Elites for building types

**Islands, one per feasible type, each with its own NSGA-II front.** Why:
- What you want to see is the best of each type with its trade-offs. An island gives each type
  a front directly; MAP-Elites with type as one axis keeps one elite per cell, so each type's
  "best" depends on a second axis we'd have to invent.
- Parameters can't cross between types by construction: each island has its own genome schema,
  which is how `Representation` in `engine/massing/context.ts` already works.
- Budgets are fair and predictable: each feasible type gets the same number of massings, and the
  islands run in parallel workers. A block usually has 2-4 feasible types.
- MAP-Elites is better for the second stage (variations inside the chosen type). It can come back
  there in B, with descriptors such as court proportion and height variation.

### 12.8 A4 dates

The urban scores change with steps 1-4 (rules, frontage, shared ground, block types). With
12.3, the building-scale steps don't touch them.
- **Scores and genome v3.1 frozen: 7 November** (was 4 November).
- **Runs:** nights of 7-10 November, 10 seeds, matched budgets. One more night (by 14 November) if a
  fix forces a rerun.
- **Statistics and the figure script:** 13-16 November; the figure script run on 17 November, as
  before.
- The baselines and ablations go through the same rules, shared ground and block types, so
  comparisons stay matched. The v2 grid baseline keeps its own growth (as now).
- H1 counts designs "on brief". Where the brief exceeds the site's capacity, on brief has to mean
  "within 10% of the lesser of brief and capacity" (Q2), recorded in each run file.

### 12.9 Schedule

| Dates | Work | Checkpoint |
|---|---|---|
| 27 Oct | Quick fixes; PR for `drawn-constraints` as it stands | |
| 28-30 Oct | Section 3 for Bengaluru; references and `docs/built-form.md` | **30 Oct:** real rules, capacity against the brief, the lake buffer finding |
| 31 Oct-2 Nov | Section 4: frontage types, cross-sections, shared ground first, access | |
| 3-4 Nov | Section 5 at urban scale: feasibility, type gene, genome v3.1 | **4 Nov:** shared ground, frontage and block types on the plan (replaces the 2 Nov checkpoint) |
| 5 Nov | Street edits rebuild and re-score | |
| 6-7 Nov | A4 harness on the new pipeline; area statement and CSV; GeoJSON | **7 Nov:** scores frozen; runs start that night |
| 8-12 Nov | Type generators with the habitability rules; islands and the side-by-side view; neighbours massed | **12 Nov:** building types side by side on Bengaluru |
| 13-16 Nov | Plots after placement; courtyards, breezeways, raised ground; new scores; A4 statistics | none |
| 17 Nov | Figure script on the A4 results; golden path complete | **17 Nov:** feature complete |
| 18-25 Nov | As section 11.3: hallway tests, browsers, freeze 20 Nov, paper draft, video | **25 Nov:** Milestone A |

13-16 November is the densest window (about 5 units in 4 days); reserve cuts E1-E5 apply there
first. One PR per item, as before.

### 12.10 Risks

- **The brief may not fit.** With real plot rules, a 30-75 m lake buffer and shared ground
  reserved first, Bengaluru's FAR 2.0 over the whole ground will probably not fit. The page will
  say by how much. That is the honest result, but it changes what "on brief" means for A4 (Q2).
- **The type generators are new geometry** (six families, floor by floor, cores and grids) in
  2.75 days. If they slip, E3-E5 apply, and building-scale work can run past the A4 freeze
  without harm.
- **Sources.** The 2026 setback amendment, the GBA bye-laws and any later lake-buffer change may
  not be findable as notifications; those figures stay "assumed" with the secondary source named.
  Spacematrix (2010) and Urban Space and Structures (1972) are books; their relationships are
  well published, but the exact figures need a copy or a paper that quotes them (Steadman 2014).
- **Fewer buildable plots** after shared ground pushes density up, which pushes towards towers.
  The tower limit per site and the height ceiling hold it; the capacity statement shows the cost.
- **Genome v3.1** changes saved v3 links: they regrow as v3 (frozen), labelled, as v2 links do.
- **Checkpoints get later.** Drawn constraints' checkpoint moves from 2 to 4 November, and you
  see building types only on 12 November, the day before the no-checkpoint window.

### 12.11 Questions

1. **Scales (12.3).** Urban scale uses steps 1-4 with block types as density numbers; placement,
   plots, shaping and voids are built for the opened design and the Massing step. Agreed?
2. **Brief over capacity.** Keep the brief as given, show the shortfall, and search towards the
   lesser of brief and capacity (A4's "on brief" the same)? Or treat the capacity as a hard
   finding and change Bengaluru's brief?
3. **Islands (12.7)** rather than MAP-Elites with type as an axis?
4. **Cuts beyond your list:** D5 score maps, D6 workbench stress tests, D7 building and locked
   edits, D8 other sites' rules, D9 view corridors, D10 narrower rows. Any you'd keep, and what
   would you drop instead?
5. **A4 freeze on 7 November**, runs on the nights of 7-10 November?
6. **Lake buffer design default:** 75 m (the NGT's figure) with the legal 30 m as the rule, or
   another width?
7. **Books.** Do you have *A Pattern Language*, *Spacematrix*, *Urban Space and Structures* or
   *Occupying and Connecting* at hand (page numbers or photos of the relevant pages)? Otherwise
   their numbers go in as "assumed" with a secondary source.
8. **Height ceiling.** Four storeys as the default everywhere (Pattern 21), raised per block only
   where the block's density needs it or a landmark is justified, with at most N towers per site:
   what N for Bengaluru (I'd say 2)?

### 12.12 Decisions (26 October)

1. **Scales:** the split in 12.3 is approved, with two conditions:
   - **Consistency check.** Each run masses a sample of blocks per type and reports the gap
     between the density numbers the type promised (coverage, storeys, floor area) and what the
     massing produced. A type whose gap is over 10% is flagged.
   - **Unopened blocks in 3D** get a cheap default massing for their type (a courtyard reads as a
     courtyard), never plot extrusions.
2. **Target:** the lesser of the brief and the rules' capacity. In A4, "on brief" means within
   10% of the rule-capped target. The UI shows the shortfall against the original brief.
3. **Islands,** one per feasible type. MAP-Elites later, for variations inside a chosen type.
4. **Cuts:** stress tests stay in the workbench. Score maps (D5), building and locked edits (D7),
   other sites' rules (D8) and view corridors (D9) move to B, with D1-D3. To make room, Milestone A
   ships **four types: courtyard, perimeter block, row housing, podium with towers.** Clusters
   around courts and pavilions move to B.
5. **A4:** scores and genome v3.1 frozen on 7 November.
6. **Lake buffer:** the legal rule is 30 m; the design default is 75 m, labelled as a design
   choice beyond the legal minimum. Keep looking for any later notification and report it.
7. **Books:** none named yet. Figures from the books go in as "assumed", with the secondary
   source named.
8. **Height:** four storeys by default. At most two towers per site, only at major nodes, and only
   where the lower types can't reach the density.

Effect on the estimate: stress tests +0.75; four generators instead of six, -0.75 (2.75 to 2.0);
consistency check +0.25 (the default massing for unopened blocks was already in the generators).
Total still 21.75 of 22 days, so the margin is thin and E1-E4 stay ready. Stress tests go on
5 November with the street edits; the street edits move to 6 November alongside the A4 harness.

## 13. Part B: one plot, one building (draft, 31 October; awaiting approval)

Dates no longer drive the work (28 October): the order below is by value, with a checkpoint
after each step.

### 13.1 Two products

The user split the tool in two on 31 October:

| | One plot | Whole site |
|---|---|---|
| Input | a location, a plot outline, a brief | a site (today's engine) |
| Output | a few evolved buildings for that plot, each traced to its precedents and genes | evolved site designs |
| Scores | building scale: sun, shade, sky, wind, rain held, gap to the brief | urban scale, shocks |

They share the grammar, the precedent library, nature's rules and the climate profile. The
one-plot engine is part B's "fit each lot" step built to stand on its own: the site scale
later calls it once per lot (measure-only, as `blocktypes.ts` does now).

### 13.2 What exists to reuse

- `engine/massing/`: breeding inside a block's envelopes (NSGA-II, `evolve.ts`), the 2 m
  column raster (`envelope.ts`), five scores (`scores.ts`: winter sun on the ground,
  hot-season shade on public ground, sun taken from neighbours, sky view, frontal area) and
  the gap to a floor-area target; readouts (`readouts.ts`); meshes and the chapter 09 page.
  Its envelope is built from a grown design; one plot needs an envelope built from a polygon.
- `engine/typology/grammar.ts`: any precedent's seed as solids, with FSI and GSI.
- `engine/plan/precedents.ts`, `blockmass.ts`: candidates by programme and climate, variants
  raised to a density with drift, tiling a seed over a lot and trimming by whole units.
- `engine/typology/climate.ts`: a six-number climate profile and distance.
- `engine/typology/nature.ts`: 30 genes with numeric design ranges.

### 13.3 The pipeline

1. **Brief (a form first):** programme (from the eight plot programmes), floor area or FSI,
   storey cap, setbacks, and must-haves (a court, shops on the ground, rain held). Free text
   read by a model can fill the form later.
2. **Plot and place:** the plot as a polygon (drawn on a map or typed as width × depth ×
   orientation), its latitude and longitude, optional neighbours' heights.
3. **Climate:** the profile for the place (13.6).
4. **Candidates:** the library's precedents for the programme, nearest climate first; the
   first 8 whose tile fits the plot.
5. **Genome, one per design:** which precedent (an index), its grammar settings as 0..1
   within ranges (13.4), and the nature genes in play as 0..1 within their ranges.
6. **Build:** grammar → tile and trim to the plot (`blockmass.ts`) → columns (`voxels.ts`).
7. **Score:** the five massing scores and the gap, plus new ones from the genes (13.5).
8. **Breed:** NSGA-II as `massing/evolve.ts`, a new representation "precedent" beside
   typology, field and CPPN. The first generation is the candidates at their own settings.
9. **Show:** the front, each design with its precedent, its drift from it, the genes it took
   and the scores; one opened in 3D.
10. **Hybrids** only when no single precedent reaches the brief and the climate within its
    ranges (decision of 30 October): a child may take the arrangement of one and the
    settings of another.

### 13.4 Ranges

A setting's range starts from the precedent's own value and widens to the spread of its
family (court, yard, row, tall) in the library, then is capped by the rules and the brief.
Storeys keep the caps of part A (twice the precedent's height, 2.5 times its wings' depth;
`maxStoreys`). Nature genes use `built.lo`..`built.hi`; a gene limited to some climates is
switched off elsewhere. Drift is reported per setting, as now for storeys, court and street.

### 13.5 Scores

Kept: winter sun, hot-season shade, sun taken, sky view, frontal area, gap. Added, each a
stand-in until checked against a simulation:

| Score | From the genes | How |
|---|---|---|
| Rain held on the plot | forest floor, wetland share, ponds in series | share of a design storm held by open ground, planted roofs, courts and ponds (run-off coefficients per surface; assumed) |
| Shade on the plot's open ground | tree shade, canopy share | the existing shade score over the plot's own courts and yards, trees counted at 60-90% |
| Shade fit to climate | leaf size, stomata | eave depth and façade porosity against the climate profile (deep and open where hot-wet, fine and closed where hot-dry); a rule score, said so |

The six genes to wire first (31 October): wetland share, ponds in series, riparian band
(when the plot touches a stream), canopy share, tree shade, leaf size.

### 13.6 Climate for any place

Today `climate.json` holds the library's places and the sites, fetched offline from NASA
POWER (`pc/typology_climate.py`). For any plot: (a) fetch NASA POWER from the page when a
place is chosen and cache it, if its API allows requests from a browser (not checked: the
check from this machine timed out); (b) a small server function that fetches and caches;
(c) the nearest place already in `climate.json`, said so. **Question Q1.**

### 13.7 Steps, in order of value

| Step | What | Checkpoint |
|---|---|---|
| B1 | Envelope from a polygon: plot, setbacks, caps, empty context; the five scores run on it | the old massing breeds on a typed plot |
| B2 | The "precedent" representation: candidates, genome, build through the grammar and blockmass, drift | a plot in Bengaluru gives a front of precedent variants, drawn |
| B3 | Ranges from the library's families; storeys within caps; hybrids | drift readout per setting; hybrids only when needed |
| B4 | The six nature genes as modifiers and the three new scores | genes change the front in the direction their card says, tested |
| B5 | The page: form, plot, front, 3D, traces to precedent and genes | usable by someone new (plain words, a diagram per step) |
| B6 | Climate for any place (13.6) | a plot outside the known places |
| B7 | Site scale calls B2-B4 per lot (measure-only) and the consistency check | site densities as before or better; fins stay low |

### 13.8 Questions

- **Q1.** Climate for any place: (a), (b) or (c)? Proposal: (c) first, then (a) if allowed.
- **Q2.** Where does the page live: a new page (`/build`) or chapter 09 with a "plot only"
  mode? Proposal: a new page, sharing chapter 09's viewer.
- **Q3.** Neighbours: none at first, or typed heights round the plot? Proposal: optional
  typed heights, since sun taken and shade need them.
- **Q4.** Which of the five old representations stay offered beside "precedent"? Proposal:
  precedent by default, the old three behind "more ways".

---

## 14. Public ground: the open half of the city (approved 3 November)

### 14.1 The idea

The user, 3 November: read the neighbourhood as **built** (buildings and infrastructure) and
**open** (where public life takes place, the space for the city). Today the open half is
what is left after streets and plots, chosen by size and walk only (`plan/shared.ts`: a square
on a corner plot at busy junctions, parks by the URDPFI hierarchy, a frontage label per
street) and streets are five SP:118 sections picked by width (`config.ts` `CROSS_SECTIONS`).
No open space knows its job. The library's public space round (42 entries tagged `public`) is
not wired to the engine.

Part C gives the open half its own types, placement and form. Every open space does **two
jobs**, one for the climate (hold, store, clean or move water; shade; cool; carry wind; grow
food) and one for the public (gather, linger, play, trade, pass, ritual, work in the open),
and has a **dry day and a wet day**: a plaza that floods to a dry line, a stepwell that stores
water and seats a crowd.

Decisions (user, 3 November):

1. **Placement by rule, form evolved.** Where an open space goes follows from the job its land
   and network can do (14.4); its shape evolves within its family's ranges (14.6). No new
   site genes at first.
2. **Street role and network are connected** (my call, asked to decide): a street's role is
   read from the network and from what fronts it, not a gene; its section evolves within the
   ranges of its role (14.5).
3. **One public space as a product:** undecided. The engine is built so one space can be
   searched on its own (outline + catchment + brief), as `plotsearch.ts` is for one plot;
   whether it gets a page is decided after P5.
4. **References for public life:** Gehl and NACTO. The scores (14.7) are stand-ins mapped to
   Gehl's twelve quality criteria and NACTO's street guidance, said so; Gehl's own method is
   counting people, which a design tool cannot do.

### 14.2 Sources to read first

| Source | For | Access |
|---|---|---|
| NACTO Global Street Design Guide (2016) | street types, section dimensions, intersections | GDCI site, partly free online; to check |
| NACTO Urban Street Stormwater Guide (2017) | bioswales, planters, flow-through streets: the street as drainage | to check |
| Gehl, *Cities for People* (2010); Gehl Institute Public Life Tools | the twelve quality criteria; the public space public life survey | book not free; the tools are free |
| Jones, Boujenko and Marshall, *Link and Place* (2007) | street role as movement against place | to check |
| IRC SP:118 (2018), already read | Indian sections, kept as the floor | `corpus/_sources/irc-sp-118-2018.pdf` |
| Rotterdam water squares, Copenhagen Cloudburst plan, sponge city guidance | fill thresholds by return period | public reports |

Figures from these go into entries with their source and confidence, as the library does.

### 14.3 An open space record

Public entries gain an `open` record beside their building seed:

| Field | Meaning |
|---|---|
| family | sunken/stepped, basin/wetland, linear, canopy, field, doorstep, street (below) |
| climate jobs | from the mechanisms (storage, flood-room, filter, recharge, shade, evaporative, wind) |
| public jobs | gather, linger, play, trade, pass, ritual, work (new list) |
| fills at | the storm it starts to take water at, as a return period in years (dry line) |
| use when wet | share of its area still usable when full (stepwell near all, flooded field none) |
| genes | ratios only: depth to width, step rise to tread, wet share by depth, canopy share, height to span, enclosure (edge height to width), share of edge with doors, seat edge per area, swale share of a section |

Families and their first members:

| Family | Members in the library | To add |
|---|---|---|
| Sunken or stepped | stepwell, kalyani, kund, hyderabad-baoli, ghats, water-square, epidaurus | Chand Baori, kulam (temple tank), Yanweizhou terraces |
| Basin or wetland | kere, johad, houtan, benjakitti, chula-park, bishan-park, nijmegen-river, qunli | ahar-pyne (Rajgir), East Kolkata (exists, not tagged) |
| Linear | cheonggyecheon, green-street | cloudburst boulevard (Copenhagen), Tåsinge Plads, nala corridor |
| Canopy | katte, medina-umbrellas, metropol-parasol, portico, havana-portales, toguna | haat under trees, stoa |
| Field | enghaveparken (its sunken pitches) | maidan, school field that holds storm water |
| Doorstep | chabutro, van-eyck-playgrounds, paley-park, venice-wells, sabil | chowk, otla, pocket park |
| Street | superblock, bazaar-isfahan | pol street, galli, bazaar with colonnade, woonerf, hutong, souk, superilla interior, NACTO types |

### 14.4 Placement by rule

Run where `shared.ts` runs now (after plots, before buildings), in this order, each rule
taking ground only where the earlier ones left it:

1. **Water first.** Each catchment's low ground and flow lines (the catchment split in
   `grow.ts`) take a water family sized by the rain that reaches it (design storm × run-off
   × catchment area over the family's depth range).
2. **A cascade by storm.** Along each flow path: doorstep rain gardens fill every year, street
   swales every 2, a square that floods every 10, a park basin every 100, then the lake. Small
   storms stay near the door; big ones move down. The square and the park are placed where
   the path meets the network (so they are reachable) and the land is low.
3. **Network places.** The most integrated junctions (from `metrics/syntax.ts`) and bus stops
   take squares of the canopy or stepped family; spacing as now (300 m).
4. **Programme pairs.** A school's field (may sit across a local street, closed to traffic
   at school hours), the market beside transit, a tank beside a temple or cultural plot, a
   wetland beside the sewage or waste yard (DEWATS).
5. **Every door.** A doorstep space within 100 m of each home, from the doorstep family,
   where courts do not already give one.
6. **Parks to the rules' share** (RMP 15% in Bengaluru), as now, but each park takes the
   family its land suits (low: basin; flat and dry: field; mixed: both).

### 14.5 Streets as a system

- **Link** (movement) from the network: its class (primary, secondary, local) and its
  through-movement (`syntax.ts` choice).
- **Place** from what fronts it: the open spaces on it (14.4), active frontage, the
  programmes on it (school, market, transit stop) and the floor area within a walk.
- **Role** = the cell of the link and place grid, mapped to a NACTO street type (boulevard,
  main street, commercial street, residential street, shared street, laneway, pedestrian
  street). The network shapes the role; the open spaces placed by rule raise a street's place.
- **Section genes within the role's ranges:** shares of footpath, planting and swale,
  carriageway, a central gutter or not, permeable paving, a colonnade, tree spacing. SP:118
  stays the floor for widths.
- **Climate genes:** street height to width, angle to the hot sun and the prevailing wind,
  continuous shade along the walk.
- **Overflow streets:** a few streets per catchment are chosen to carry the 100-year storm
  to the basin (the cloudburst road), and the others drain toward them.

### 14.6 Form evolved

Each placed space gets a small search over its family's genes (as one plot's search),
measure-only at site scale (defaults, then the best of a few), exact when the design is
opened. Hybrids (a stepped field with a canopy edge) only when no single family does both
jobs within ranges, as for buildings.

### 14.7 Scores (stand-ins, mapped to Gehl and NACTO)

| Score | Gehl criterion | How |
|---|---|---|
| Water held in public ground, and the share of it usable on a dry day | protection against unpleasant experience | volume below each space's dry line; area × use when wet |
| Shade hours on walking routes | good climate | site-scale shade model (buildings and trees) on the hot season's afternoons; the open item from 2 November |
| Doors and windows on the edge | possibilities for standing and staying | share of each space's edge fronted by active ground floors |
| Places to sit | possibilities for sitting | seat edge per area (steps, plinths, katte) |
| Human scale | dimensioned at human scale | edge height to width of each space and street |
| Safe to walk | protection against traffic | footpath width against NACTO by role; crossings at junctions |
| 3-30-300 | (green access) | trees seen from each home, canopy share, a park within 300 m |
| Floor lost to the 100-year storm | (claim H3) | drops as open ground holds water; read later by the baseline work |

### 14.8 Steps, in order of value

| Step | What | Checkpoint |
|---|---|---|
| P1 | Library round: the `open` record on the 42 public entries, about 25 new (streets included), a drawing of each in both states, photo check | /typologies shows public space by family, dry and wet |
| P2 | Grammar for open ground: families and genes, drawn from genes, tested | each family drawn at its range ends |
| P3 | Placement by rule (14.4), replacing the choice in `shared.ts`; school field across a street | on each site, water spaces sit on low ground; every home has a doorstep space |
| P4 | Streets: role from network and place, section genes, overflow streets | street map by role; sections drawn per street |
| P5 | Form evolved per space and the scores (14.7), including the site-scale shade model | scores move the right way when a space is removed |
| P6 | Workbench "Public ground" layer and 3D, with a storm slider filling the cascade | usable by someone new |

Then decide on one public space as its own page.

### 14.9 Questions

- **Q1.** Fill thresholds (1, 2, 10, 100 years) are assumed from Rotterdam and Copenhagen;
  keep until an Indian source is found?
- **Q2.** School field across a street: close the street at school hours (a shared street), or
  only allow it across a laneway?
- **Q3.** Should the search still be free to trade open ground for floor area (today's
  `SHARED_MAX` 25%), or is the rule-placed public ground fixed and the buildings fit round it?

Approved 3 November ("go ahead") with the proposals standing for Q1-Q3 until the user says
otherwise: fill thresholds kept and labelled assumed; a school field may cross a local street,
which becomes a shared street at school hours; rule-placed public ground is fixed and the
buildings fit round it.

### 14.10 Log

- **P1 done (3 November).** `OpenRecord` (types.ts: family, jobs, holds, fillsAt, wetUse,
  conf, dry, wet, fill) for all 62 public entries in `library/open.ts`; 20 new entries (212 ->
  232 precedents), streets and Indian public ground first; grammar `fill`
  (water in a pit up to its level, over terraces, in rain beds, over flat ground) and
  `surface: "green"` ponds as rain beds; the page filters public space by family and draws the
  wet day beside the dry; climate normals fetched for the new places. Photo check: 18 of 20
  against Commons photos, three drawings corrected. Sourced wet-day figures are few (Sapporo
  schoolyards, Yanweizhou, Copenhagen, green street); the rest are assumed and say so.
- **P2 done (3 November).** `engine/typology/openshape.ts`: genes per family (6 families,
  28 genes) with limits, the library's spread (`familySpread`, from `shapeOf` on each member's
  seed), `shapeParams` (shape + land -> grammar, dry or wet) and `measureShape` (storage,
  usable when full, seats, shade, enclosure). Grammar gained a pit's `tread`, canopies in
  `rows`, trees `treesAt` the edge or in the court, and a `crown` size. Page view "Shaping open
  ground" (#open-<family>) draws each gene at both limits. Tests: every family builds at every
  limit, wet and dry; each gene moves its measure the right way.
- **P3 done (3 November).** `plan/shared.ts`: water first (`gathered`, basins and lowered
  fields sized for the 100-year storm's excess over the lots' 10-year), water squares where rain
  gathers, parks by family, a doorstep space within 100 m of every building plot (plots, with
  `doorAccess`), and `pairFields` after programme (a school short of land takes the playfield it
  lacks across a local street; `LotIn.away`). `plan.shared.spaces` and `.water`. Survey in
  docs/built-form.md "Public ground by rule": doorstep 100% on every site, water held 79-97% of
  its need, water spaces low; floor area 4.5-9% lower. Inspector lists the new spaces.
- **P4 done (3 November).** `plan/streetroles.ts`: link from class (syntax choice is
  evaluation-time, so class stands in; noted), place from frontage, public spaces, shops,
  schools and stops; eight roles after GSDG (laneway to boulevard) with speeds; `sectionOf`
  (lanes, then least footpaths and tree strips, then climate planting, swales when wet);
  overflow streets on flow lines carrying 8 ha or more. Explore "Streets" layer, inspector
  sections per role. Survey in docs/built-form.md "Streets as a system".
- **P5 done (3 November).** `plan/publicform.ts` (each space's shape searched within its
  family from its library precedents; school fields at most 30 cm; a field's water line follows
  its need), the site's design storm for the big storm, `metrics/publicground.ts` (seven
  scores mapped to Gehl and NACTO, in the measures list), a hot-afternoon street shade model
  (`streetShade`), the doorstep greedy on a heap. Survey in docs/built-form.md "Public spaces
  shaped, and public ground scored". Floor area 5-13% below before part C.
- **P6 done (4 November).** Explore "Public ground" layer (families, storm streets, scores),
  storm slider on the plan and in 3D (`plan/storm.ts` stormOn: lots to 75 mm, then the water
  spaces to the site's design storm, spill past a space's storage), 3D public spaces by family
  with trees and role sections for streets, water slabs updated alone (`DesignView.setStorm`).
  Form search: water dominates (3 times, usability in proportion); squares at most 3 m deep.
  Fixed an import cycle from P5 that stopped the browser's grower worker loading (whereOf
  moved to massing/sun.ts; test/imports.test.ts guards against new cycles).
  Still to decide: one public space as its own page. (Part of section 15 now.)

## 15. An agentic design system for cities (approved 4 November)

The user's direction on 4 November: an agentic design system for our cities. People choose a
stretch of a real place and a brief; the system analyses it and designs what the brief asks for,
keeping the rest; stakeholders decide what stays; the output eventually gets very detailed;
mobility is a section of its own. First test: the Yamuna along the Taj Mahal. This goes ahead of
the business-as-usual baseline, which waits.

### 15.1 One mechanism: the brief

A riverfront, a junction and one plot are one thing with different settings. A brief has:

| Part | Meaning | Taj riverfront |
|---|---|---|
| Place | where, on the real map | the chosen stretch |
| Can change | the zone the design may touch | river edge and floodplain within the line |
| Affects | judged but not changed | the city's routes to the river, views, the monuments' setting |
| Reads | data from further out | river levels, upstream rain, approach streets |
| Stays | fixed, each with who decided and why | monuments, the Taj-Mehtab Bagh axis, legal limits |
| Makes | the systems that run | public ground, water, planting; no massing unless allowed |
| Judged by | scores for this brief | days usable through the river's year, flood passed, shade, access, views kept |
| Detail | how far to take it | see 15.3 |

Engine stages (streets, blocks, plots, public ground, buildings) become switches: a stage either
runs or loads the real thing. `piecemeal.ts` already grows around fixed fabric and `locked` holds
cells, but both are per cell, so this is new at the level of streets and buildings.

What exists: `pc/export.py` already exports real footprints with heights (`existing_buildings`:
100 m round the design ground, and those on it) and existing streets to 1 km; `massing/plot.ts`
takes neighbours as prisms. Scoring today's condition with the same scores gives each brief its
baseline: today against the design.

### 15.2 What makes it agentic

Agents read, propose, check and explain; the engine does the numbers; people decide.

- **The rule already in the repo.** The brief compiler (`app/api/brief.ts`, `engine/brief.ts`)
  may only pick from a fixed vocabulary within limits, and must cite a source or say "assumed".
  Every agent keeps to that: no number from a model, only from an engine tool or a cited source.
- **Roles.** Analyst (reads the place), water, mobility, public realm, built form, rules checker,
  critic (argues against the proposal, from the scores and the rules). Start with few: analyst,
  rules checker and critic, adding a role when there is a tool for it to use.
- **Stakeholder decisions are records.** Who decided, what, on what evidence, and what it changed.
  An agent proposes what stays and asks; it doesn't decide.
- **Tools first.** An agent is as good as what it can call, so each design step ships as a
  callable tool. The engine already runs under Node for tests and surveys, so a server can call
  it. Which agent framework to use is decided at step F3, not before.

### 15.3 Detail

The output must get very detailed, so the geometry can't be another grid.

| Level | Unit | Output |
|---|---|---|
| 1. Concept | 2 m raster | layout options, scores, key sections |
| 2. Scheme | vector, levels to 0.1 m | plans, sections, levels, element and planting schedules, DXF |
| 3. Detailed | vector, real products | construction details, quantities, IFC |

Decision now: elements in a focused brief are vector with levels from the start, so they can
carry more detail later. Level 3 needs people too: structure, hydraulics and approvals need
qualified sign-off. The system prepares, labels what is assumed and doesn't certify.

### 15.4 Mobility

A section beside water and public ground, with analysis before design.

1. **Analysis, from data we hold.** Overture streets, existing-street syntax (already computed),
   walking access to places, gaps and barriers. Bus routes, lanes and counts come from
   stakeholders or new sources, each labelled.
2. **Design.** Junction geometry (kerbs, crossings, refuges, corner radii, space reclaimed), street
   sections (`streetroles.ts`), walking and cycling links, stops. Needs finer geometry than the
   street sections have today.
3. **Traffic, when there is data.** Volumes need counts; a microsimulator such as SUMO is the
   likely tool. Until then the system makes no claim about traffic flow.

### 15.5 The Taj stretch: what we found (4 November, needs checking before use)

| Finding | Status | Consequence |
|---|---|---|
| [NGT restrained construction on Agra's Yamuna floodplain in 2015 and refused to lift it](https://housing.com/news/ngt-refuses-vacate-2015-order-construction-yamuna-floodplains-agra) | reported; current status not confirmed | treat the floodplain as no-build |
| [80 acres of river bed between Taj and Fort were the Taj Corridor; demolition ordered](https://www.deccanherald.com/content/336049/authorities-fail-act-green-bodys.html) | reported, old | check what stands today |
| [Floodplain behind the Taj reported not demarcated as of 2025](https://livelaw.in/news-updates/ngt-ravine-destruction-illegal-mining-taj-mahal-yamuna-restricted-floodplain-area-uttar-pradesh-285101) | superseded in part: see the F2 log, 15.8 | the map is still missing: test more than one line |
| Flood marks [495, 499 and 508 ft](https://theprint.in/india/yamuna-breaches-low-flood-level-mark-in-agra-officials-step-up-relief-preparedness/1672335) | replaced by [metres from the Commission's figures, as reported](https://www.arabnews.com/world/indias-yamuna-river-laps-walls-of-taj-mahal-after-heavy-rain-2340376), F2 | the Commission's own tables still to read |
| [River reached beyond the danger mark in September 2025](https://www.freepressjournal.in/india/uttar-pradesh-news-rising-yamuna-poses-threat-to-taj-mahal-as-floodwaters-engulf-agras-riverfront); [dry-river concern too](https://www.nationalheraldindia.com/national/drying-yamuna-could-endanger-taj-mahal) | reported | design for both low water and flood |
| [Rubber dam proposed 1.5 km downstream of the Taj](https://rsdebate.nic.in/bitstream/123456789/731472/1/PQ_257_01082022_U1674_p358_p358.pdf) | proposal, 2022; present status unknown | score with and without it |
| [Riverfront park reported, foundation stone 25 July 2026](https://www.prabhatkhabar.com/state/uttar-pradesh/agra-yamuna-river-front-park-project-amrit-2-0-yogi-government-development/amp) | one report, location to map | check overlap; it may be a stay |
| [Koch: Mughal Agra as a riverfront garden city](https://bagchee.com/books/BB41021/the-complete-taj-mahal-and-the-river-front-gardens-of-agra); [Mehtab Bagh in the riverfront terrace pattern](https://en.wikipedia.org/wiki/Mehtab_Bagh) | established; garden count conflicts (44 or 11), read the book | the place's own precedent, for the library |
| [WMF and ASI restored Mehtab Bagh's garden](https://wmf.org/node/14641) | reported | a partner body; a stay |
| Monument limits ([prohibited 100 m](https://lawgist.in/ancient-monuments-and-archaeological-sites-and-remains-act-1958/20A), [regulated 200 m further](https://lawchakra.in/high-court/karnataka-high-court/karnataka-hc-amasr-act/), AMASR Act) and the Taj Trapezium Zone | Act read in a copy; rule layers since F2, from our outlines | get the Archaeological Survey's limits |

**What this means.** Mostly a no-build problem: the search can't reach for massing. It has to
design ground, water, planting, access from outside the floodplain, and things that flood or
lift. A good first test of the public-ground work, and a real answer to "keep the context". This
is a study, not a permission: what's legal gets stakeholder and legal review, and anything beyond
today's rules is labelled as a what-if.

### 15.6 Steps, in order of value, with a checkpoint after each

- **F1. The brief and the real place.** The brief record, the Agra site (fetch, boundary), zones
  drawn on the map, real streets and buildings as fixed geometry, today scored as the baseline.
- **F2. Reading the stretch.** River through its year (gauge records; levels as bands on the
  ground), rule layers (15.5), views from the Taj and Mehtab Bagh as a measured limit.
- **F3. First agents.** Analyst, rules checker and critic on the tools from F1-F2; proposals of
  what stays and stakeholders' decisions as records; framework chosen here.
- **F4. River-edge library round.** Ghats, Mughal riverfront terraces and others, photo-checked;
  a family of river-edge spaces with genes (the linear family has only 3 members).
- **F5. Designing an edge.** Search along a line: section by section, vector with levels, scored
  against river bands, access, shade, views.
- **F6. Level 2 output.** Plans, sections, level and planting schedules, DXF, for the Taj edge.
- **F7. Mobility analysis**, then reaching the river as its first design job.
- **F8. Plot brief** with real neighbours, built and open composed together (40,000 m2 housing,
  cultural programmes), on `/build`.
- **F9. Junction brief**, with mobility design and finer street geometry.

Then the one-public-space page is a kind of brief, and the BAU baseline returns for whole sites.

### 15.7 Questions

- **Q1. Which extent?** Proposal: both banks from Agra Fort to the Taj and Mehtab Bagh, since the
  Mughal scheme crossed the river.
- **Q2. Who are the stakeholders in the first test?** Proposal: one person acts in named roles
  (ASI, Agra Development Authority, irrigation, residents, boat and ghat users), with logins later.
- **Q3. What's the first detailed deliverable?** Proposal: level 2 of 15.3, DXF included.
- **Q4. Stay within today's rules?** Proposal: a lawful design first, what-ifs beside it, labelled.

Approved 4 November with all four proposals as they stand.

### 15.8 Log

- **F1 built (4 November; waiting for the user's check).** `sites/agra-taj` (study box, both
  banks) and `sites/agra-taj/brief.yaml`, every stay a proposal with its reason, source and status.
  `pc place` (pc/place.py) writes `app/public/sites/agra-taj.place.json`: 11,832 buildings with
  height and height source, streets cut at the map's own junctions so a bridge doesn't join the
  road below it, water, land use, per-cell ground, river bands, satellite wet record, trees and
  surface heat. `engine/focus`: `place.ts` (brief, `checkBrief`, `zoneOf`, `profile`), `walk.ts`
  (walking on real lines), `today.ts` (the baseline, each measure labelled measured, from the
  map or estimated). The first page showed the zone at each river mark, what stays, a real section and
  today's numbers.
  **Moved into the workbench the same day (the user's direction):** the exercise is the first
  choice, and everything after it happens in the workbench. `engine/focus/exercise.ts` lists the
  four exercises; the Exercise step (`ExerciseCentre`, four diagrams) decides the steps that follow.
  A whole neighbourhood keeps its nine steps and its links (a `?site=` link is still that exercise);
  a river edge has Place, Read the place, What stays, then Design and Drawings shown as not built.
  Read the place draws on the workbench's `MapCanvas` (`focuspaint.ts`) with six layers (what can
  change, river levels, 10-minute walk, hot ground, wet record, tree cover), a readout of the spot,
  a real section, and today's numbers in the inspector. Links: `?exercise=riverfront&place=agra-taj
  &step=read&mark=2`. `pc place` also writes `places.json`, what the Place step lists. The
  separate `/focus` page is gone.
  Today at the 508 ft line: 201 ha can change, 575 buildings stand in it (13.1 ha of footprint,
  19.3 ha of floor, 39% of heights guessed), 22% tree cover, 42.2 °C hot-season ground against 41.1
  for the box. Taj to Mehtab Bagh is 956 m straight, 6.5 km on mapped streets. The zone is 54 ha at
  495 ft and 103 ha at 499 ft, so the line's uncertainty is large; it is shown, not hidden.
  Data traps found: "Agra Fort" in Overture is the railway station (the stay uses the Fort's
  buildings); a Pacific marine monument's land use reaches the box (dropped, reported); ground
  height is 0 on water cells (treated as unknown, and tanks aren't the river).
  Not done: stays can't be decided yet (F3); streets and buildings as fixed geometry are read
  by the baseline but no design search uses them yet (F5).
- **F2 built (4 November; waiting for the user's check).** Read the place gains three layers,
  and the engine three tools for F3's agents (`engine/focus/river.ts`, `views.ts`, rules on
  the cells as bits).
  - **The river's records.** Marks are now 151.4 m (the Central Water Commission's warning
    level), 152.4 m (September 2025 at 2 pm; 152.49 m was reported that evening) and 154.76 m (the 1978 record), read
    from reports of the Commission's figures. The line is the record, nearest to what the
    floodplain notification is reported to use. At the record: 199 ha can change, 555 buildings
    stand in it. At 151.4 m: 59 ha; at 152.4 m: 113 ha.
  - **The ground model held against what happened.** `checkRecords` at the same level: July 2023,
    water reported at the Taj's walls, the model stops 35 m from our approximate outline. September
    2025, 0.6-0.9 m reported at Mehtab Bagh, the model wets 30% of it, 1.1 m deep where wet. So
    it's about right, to within a metre, which is about what the terrain can do.
  - **The river's year.** `pc river-year`: Sentinel-2 month by month, 2022-2025, 12 to 114 clear looks
    a pixel per month. No daily gauge series could be read (the Commission's service timed out). Water
    seen runs from 20 ha in May to 55 ha in November. That the monsoon doesn't lead is partly the
    method: cloud hides short floods, and muddy water reads weakly. It measures where water is on
    clear days, not depth. 7 ha of the zone is seen wet over 30 days a year.
  - **Rules as layers.** Prohibited (100 m) and regulated (the next 200 m) around the three
    monuments, from our outlines; the floodplain, its reach standing in; a 2010 report of 500 m round
    the Taj, drawn dotted and not counted as law; trees within 5 km and the Trapezium, across the whole
    study area. Of the zone, 21 ha is prohibited and 45 ha regulated.
  - **Views as a measured limit.** On terrain and every building: toward the Taj, the sight line to
    its plinth's top; north from its terrace, the skyline behind. From Mehtab Bagh the sight line is
    clear today; from the Fort, 45% of the Taj's width is clear down to the plinth, with the Taj's
    mosque and one other building across it (the mosque's height is estimated). 4 ha of the
    zone is held under 3 m. Trees are left out, so what's "seen" is an upper bound.
  - **Findings that change this section.** Uttar Pradesh notified the floodplain on 22 January 2025
    ([ThePrint](https://theprint.in/india/over-5000-buildings-in-agra-face-risk-of-demolition-after-up-govt-demarcates-yamuna-floodplain/2478998/)),
    banning new construction and calling existing buildings illegal; that replaces 15.5's "not
    demarcated" as the leading reading, though a 2025 report still said so of the Taj's back. Its map
    wasn't found, and reported widths of 5.09 and 2.55 km can't be drawn as a line. The terrain reads
    about 166 m at the Taj's plinth, so it already holds the plinth, and adding its height would
    count it twice. The depth at Mehtab Bagh in September 2025 comes from local reports (2 to 3 ft).
  - **The question most of the design rests on:** whether a path, a ghat or planting counts as
    construction under the monument and floodplain rules. Unread, and first for the rules checker.
  Not done: the notification and the Archaeological Survey's limits unread; no depth through the year.
- **F3 built (5 November; never yet run on a real model).** What stays now takes decisions, and three
  agents read the place.
  - **Decisions as records** (`engine/focus/decisions.ts`). Role, keep or change, a reason (required)
    and what it changed, in a log that only grows: reopening adds a record. Changing a stay on the map
    adds its land to the zone and today's numbers follow (Mehtab Bagh: 199 to 207 ha); changing a limit
    moves no land and says any law behind it still applies. Held in the browser, with a download:
    nothing is shared yet.
  - **Tools** (`engine/focus/tools.ts`): eight, all read-only. There's no tool to write a decision.
  - **Agents** (`agents/roles.ts`): analyst, rules checker, critic. **Framework: none.** A plain loop
    (`agents/run.ts`) in the browser, which holds the place and runs the tools, and one turn per
    request through `POST /api/agent` (`agents/turn.ts`), which holds the key, the instructions and the
    tool list. It uses OpenRouter as the brief compiler does, one bill and no new dependency, with
    the "careful" model (Claude Opus 5.5). Only `turn.ts` would change to call Anthropic directly.
  - **The check** (`engine/focus/findings.ts`). The rule of 15.2 in code: a finding with a number no
    tool returned, a "sourced" finding whose link isn't on record, or an assumption carrying a number
    is removed, and the person sees what was removed and why. It can't catch a wrong claim with no
    number in it, so the prompts ask for those as questions; a live run has to test that.
  - Tested with a stand-in model only: there's no key on the development laptop. Prompt quality, cost
    per run and whether agents keep to their roles are all unknown until a real run.
- **F4 built (5 November).** "At the river's edge", a seventh family of public space, with seven new
  precedents and genes for a section from the street to the water (`typology/library/edge.ts`,
  `edgesections.ts`, `openshape.ts` `edgeSection`). Details and what's unsure in `docs/typologies.md`
  under "River edges". Nothing places this family yet, so whole-city runs are unchanged; F5 does. Most
  section numbers are assumed, because projects rarely publish them.

### 15.9 F5 plan: designing an edge (approved 5 November, Q1-Q3 as proposed)

**What it makes.** For each bank, a line along the water cut into stretches, and for each stretch a
section from the street to the water, fitted to the real ground and held against the river. The
result is vector with levels (15.3), so F6 can draw it. A person chooses among a few labelled options
and sees each against today.

**What the bank is like (read from `agra-taj.place.json`).**

| | Taj side | Mehtab Bagh side |
|---|---|---|
| Bank, along the traced line (E1) | 3.6 km | 3.1 km |
| Ground at the bank, 10th / middle / 90th percentile | 147.8 / 151.4 / 156.6 m | 145.5 / 149.3 / 152.6 m |
| Bank to ground above the record, middle / 90th percentile | 60 / 271 m | 180 / 284 m |
| Bank cells in a prohibited / regulated area, of all | 18 / 30 of 126 | 13 / 17 of 104 |

So the two banks differ: the Taj side is narrow and higher, the other wide and low. One section can't
serve both, which is why the search works stretch by stretch.

**The problem to face first.** The middle of the Mehtab side's bank reads 149.3 m, below the 149.6 m
reported on a steady monsoon day, and low water hadn't been measured at all. The datum was never
checked. E1 looked (log below): this mostly isn't a terrain error, because the river usually stands
well below that reading. Every section hangs from these heights, so:

- E1 compares the terrain, the marks and the satellite's wet months, to estimate any offset.
- Every score that depends on level runs at -1, 0 and +1 m, and a design claims only what holds at all
  three. The two reports that can be tested disagree by -0.4 and +0.5 m, so this covers them.
- Levels to 0.1 m are design levels relative to each other. They aren't survey levels, and the
  drawings have to say that a survey comes before anything is used.

**Three classes of work.** Whether a path, ghat or planting is "construction" is unread (15.8), so the
search carries the question instead of settling it:

| Class | What | Treated as |
|---|---|---|
| Soft | Planting, earth paths at grade, reshaping with no net fill | The lawful design, labelled as resting on this assumption |
| Hard | Ghat steps, stone paths, walls, raised walks | A what-if, labelled, drawn beside the lawful design |
| Building | Anything with a roof or floor | Not proposed |

In a prohibited area, the lawful design only plants. Whether more is allowed is for the rules checker
and stakeholders.

**Limits that nothing may break.** No net fill below the record flood, no wall into the river or change
to its course, nothing above a view's limit (a tree's full height counts), no building removed, no
tree cover lost in any cell (only cover is known, not single trees, and felling is a matter for the
Court). This follows the test for a river edge: it leaves the river its room, works with the flood,
and doesn't push out the people there.

**Scores, each measured on today as well and labelled by evidence.**

| Score | How | Evidence |
|---|---|---|
| Days usable | For each level, its height against the river's estimated monthly level | estimate, coarse: months, not days |
| Flood passed | Cross-section open to the water at each mark, and cut minus fill, against today | estimate; not a hydraulic model, so it makes no claim about flood levels |
| Access | A path along the edge on the real walking network, ways in from ground above the flood, people within 10 minutes | map, plus the design |
| Shade | Hot-afternoon shade along the path, from the street-shade model | estimate |
| Places to sit | Length of rise that can be sat on | design |
| Views kept | Margin under each view's limit; a limit, also reported | estimate |
| River's room | Share of the zone left unpaved and planted, and its change | design |

**Steps, each with a checkpoint.**

- **E1. The line and its stretches.** Each bank traced through `smoothTrace`, stations every 50 m, and
  a real cross-section at each: ground, marks, rules, view limit, buildings, nearest street, tree cover,
  days wet. Stretches cut where those change, at least 100 m long. The datum check. Design step shows
  the stretches and sections, with nothing designed yet.
- **E2. A section on real ground.** A shape becomes a section for a stretch: reach, drop and flood height
  are read from the place, the rest are genes. Vector offset lines with levels, cut and fill, each
  limit checked, each element with its class.
- **E3. Scores.** As above, today against a hand-set design, each with its label.
- **E4. The search.** Each stretch starts from the library's members and searches its genes, in the
  manner of `publicform.ts` (`mapElites` is tied to whole-site ground, so it isn't reused). Then a pass
  along the bank chooses a chain that joins well: paths meet at a slope a wheelchair can use, with a
  cost for changing levels. Options: lawful soft works, and the what-if with hard works, each in a few
  distinct directions, such as most days usable or most planted.
- **E5. In the workbench.** The Design step: options, each against today; choose a stretch to see its
  section on the real ground with a river-level slider. New read-only tools, so the critic and rules
  checker can read a design. No tool to change one.

**Not in F5.** DXF, schedules and species (F6); ferries, bridges and routes across the river (F7); any
hydraulic model, so no claim about what a design does to flood heights; 3D (the section and plan carry
the check; the grammar's edge drawing can follow).

**Questions.**

- **Q1.** Is the soft / hard / building split right as the lawful line? Proposal: yes, until the
  notification or a stakeholder says otherwise.
- **Q2.** The river's monthly level has no gauge behind it. Proposal: try the Commission's tables once
  more, otherwise estimate from the satellite's monthly wet area on the terrain and label it. A daily
  record from anyone who holds one would improve this more than anything else in F5.
- **Q3.** Should the riverfront park reported in July 2026 stay out of the design? Its site is unmapped.
  Proposal: ignore it until it's located, and say so on the page.

**E1 built (5 November; waiting for the user's check).** The Design step shows both banks cut into
stretches, a real section at any station, and how far the heights hold (`engine/focus/edge.ts`).

- **Banks.** Traced from the mapped river's outline through `smoothTrace`, read every 50 m: 25
  stretches, 15 on the Taj's bank and 10 on Mehtab Bagh's, cut by room, law and whether a view holds
  trees down. Each section says what ends its usable ground. The Taj's bank has almost no room from
  about 2 km along, where the river runs at its wall; the east end of the Mehtab side has over 500 m.
- **The terrain under the river.** `pc place` now keeps it (`cells.bed`), where the export left 0. Terrain
  models flatten water: 471 of 873 river cells read 145.5 m, and bars that stand dry in November read
  about 147 m. That gives a low end for every section in the terrain's own heights, independent of the
  gauge. It's the water's surface when the model was flown, not a measured bed.
- **The mapped river isn't the water.** Only 188 of its 873 cells are wet in May and 456 in November, so
  on much of the bank the water is far from the mapped edge: up to about 390 m across sand on the Taj's
  upstream stretches. Each station records it. A design's "edge" is a different place by season.
- **The river's level by month.** Sorting what the satellite saw wet from dry, with those heights, gives
  145.5 to 147.25 m in the 10 months it can read, agreeing 41 to 68%. July is too cloudy, and August
  doesn't follow the ground. So Q2's fallback gives an ordinary day and not the monsoon: clear days only,
  and cloud and muddy water hide floods. **Days usable (E3) needs another source for the monsoon.** Next
  to try: modelled daily discharge (GloFAS) with reported levels to tie it down, labelled as such.
- **The gauge.** Tried again 5 November, as Q2 proposed. The forecast service now answers but has no
  documented way to list stations; India-WRIS's open API returns "no data" even for its own documented
  examples. [The Commission's network list](https://www.slideshare.net/slideshow/hydrologicalnetworkdetailsofcwcpdf/255522242)
  confirms a station at Agra Poiya Ghat since 1976, so the record exists: someone holds it.
- **Heights against reports.** September 2025 at Mehtab Bagh: the terrain gives 0.4 m more water than
  reported. July 2023 at the Taj: the water needs 0.5 m more to reach our outline. Opposite signs, so no
  steady offset shows, though two reports can't prove there's none. The gauge's zero and how far the
  river falls between the gauge and here are still unread.
- **Not done.** Trees and fences aren't in a section. Sections on a tight bend can overlap, so a
  stretch's hectares are approximate. "A view holds trees down" assumes a 10 m tree, for E2 to replace
  with a planting's real height.

**E2 built (5 November; waiting for the user's check).** On a chosen stretch, any of the ten precedents can
be tried, lawful or what-if, and drawn over today's ground with the earth it moves, its path and what it
plants, with each limit checked on the result (`engine/focus/edgeform.ts`).

- **How a shape fits.** How far and how far down come from the place; the rest are genes. Levels hold along
  the stretch, as a terrace does, and meet today's ground at both ends of what's reshaped. The output is
  vector: pieces with levels and works class per section, and lines along the bank for each level and the path.
- **Choices made while building, all assumptions to review.** Cell tree cover of 5% or more keeps its ground,
  because only cover is known, so a section reshapes its longest tree-free run. A stretch reshapes only if half
  of it can take the levels: one free section is a hole, not a terrace. Levels sink together until no earth is
  added below the record flood. Ground falling away from the river is left alone. Beside a monument, nothing is
  hard even as a what-if, which goes further than the plan said. A bank steeper than 1 in 3 counts as hard, since
  it needs a facing. Planting is by kind and assumed height, with species left to F6.
- **Checks.** All ten precedents on all 25 stretches both ways (500 fits): river, buildings and streets, earth,
  views, trees, banks and law all hold. They caught real errors while building, including stale levels making
  banks too steep.
- **What it shows, for E3 and E4.** Precedents copied blindly move a lot of earth: Adyar on B4 digs about 15,600 m³
  and places 13,600 m³ on nearly flat ground. Nothing scores that yet, so earthworks need a cost.
- **Open: the bank's face.** A design stops at the mapped bank because the river's course and bed stay. Terrain is
  coarse enough that the fall from there to the water doesn't show: on B4 the design's lowest level is about 150 m
  and an ordinary river about 146.5 m. So as it stands, no lawful section brings anyone down to the water.

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
