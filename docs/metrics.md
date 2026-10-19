# Form metrics

Phase 6. These are readouts on every design: the Explore and Families chapters show them,
compared across the designs a run kept. Up to two of them can be promoted to objectives, any
of them can be a MAP-Elites trait, and breeding by hand can favour any of them.

They are there to judge with, not to give a verdict. Following *The Nature of Order*,
wholeness is the whole list, never one number.

- Code: `app/engine/metrics/` and `pc/metrics/`, one file per family. The two engines agree
  to nine decimal places on 12 designs per site, on all five sites (`test/parity`).
- Hand-worked cases: `test/metrics/cases.json`, read by both engines.
- The framework is set out in `docs/architecture-v2.md` 6.4. Alexander's properties replace
  the brief's generic list where they overlap. Human scale, permeability, nature, and
  harmony and variety are kept beside them.

## What the metrics read: the derived network

Since Phase 6b, every design has streets of its own, on the edges of its cells (the street
skeleton and the street genes; `docs/landform.md`). The metrics read them, with what is
derived from each design (`network.ts`):

| | |
|---|---|
| street | a side of a cell that carries a street of the design, with its class (primary, secondary, lane) and width |
| block | a connected group of building cells. A street of the design, or an existing major road (Overture, the site's `context.roads`), between two cells puts them in different blocks. |
| open space | a connected group of landscape or water cells, cut the same way |
| park | a connected group of landscape cells of 0.5 ha or more |
| street face | a building cell's link to a cell that isn't building, or that a street or road separates. Links off the edge of the design ground don't count. |
| centre | the cell nearest each core attractor: the design's own local centres |
| junction | a corner where three or more street sides meet |
| landmark | a building at least two standard deviations and two storeys above the mean height |
| walk | steps over cell links (streets and roads can be crossed on foot), times the cell spacing |

The street graph (sides, joined at cell corners) is built so Phase 8's space syntax can run
on it directly.

**Compare by grid type.** On hexes three sides meet at every corner, so every junction is a
T or a Y; squares give crossroads. Junction density and meshedness differ by grid type for
similar layouts. Compare them only between designs on the same kind of grid (as with heat).

**Walkable blocks and junctions now separate designs.** Over 20 random designs per site,
before streets (tag `v2-pre-streets`) and after:

| Site | Walkable blocks before | Walkable blocks after | Junctions before (/km²) | Junctions after (/km²) |
|---|---|---|---|---|
| mumbai-ewf | 7% (2–14%) | 50% (28–95%) | 0.6 (0–1.2) | 308 (213–465) |
| mumbai-docks | 11% (7–18%) | 67% (47–99%) | 0.4 (0–1.5) | 382 (287–511) |
| ahmedabad-wadaj | 7% (5–10%) | 32% (12–66%) | 0.1 (0–0.8) | 119 (31–275) |
| ahmedabad-wadaj (squares) | 7% (5–11%) | 30% (12–65%) | 0.3 (0–0.8) | 97 (25–205) |

Junctions were open cells touching three blocks; now they are street corners, so the two
columns measure different things. What matters is that both now spread across designs.

## The metrics

"Range" is what 20 random designs gave on Mumbai Eastern Waterfront (`npm run metrics`).
It is only a guide to the scale.

### Human scale

| key | what it measures | better | range |
|---|---|---|---|
| `dh_enclosure` | Share of street faces where the street's width over the building's height (D/H) is between 1 and 3. Width is the open run straight out from the face to the next building, plus the street's own width where the design has one (a nominal 12 m where only an existing road crosses). A run that reaches the edge of the design, or is longer than 120 m, encloses nothing. | higher | 11–67% |
| `block_size` | Share of building cells in blocks whose perimeter is 400 m or less. | higher | 28–95% |
| `low_frontage` | Share of street faces on buildings of six storeys or fewer. | higher | 9–100% |

D/H between 1 and 3 is the usual range for streets that feel enclosed without being
canyons. A 400 m perimeter is roughly a 100 m block.

### Permeability and active edges

| key | what it measures | better | range |
|---|---|---|---|
| `junctions` | Corners where three or more street sides meet, per km² of design ground (T and Y only, on hexes). | higher | 213–465 |
| `connections` | How many different spaces each block opens onto: open spaces, a street, the edge of the design. The mean over building cells. | higher | 1.6–2.9 |
| `active_frontage` | Of the building faces on the design's streets, the share on primary and secondary streets: the through routes whose footfall shops need. Lanes and cul-de-sacs are quieter. Buildings carry no programme yet. | higher | 59–87% |
| `meshedness` | Meshedness (Buhl et al. 2006): (E − V + C) / (2V − 5) on the street graph's junctions and ends, where corners a street only passes through are merged away. 0 is a tree, 1 a full triangulation. Networks of T junctions (hexes) can't go past about 0.25. | higher | 9–13% |
| `dead_ends` | Of the street graph's junctions and ends, the share that are dead ends (an end at the edge of the design ground carries on outside). Many dead ends read as a tree, in line with Alexander's critique. | lower | 12–20% |

### Connection to nature

| key | what it measures | better | range |
|---|---|---|---|
| `green_walk` | Share of building cells within a 300 m walk of a park of 0.5 ha or more. | higher | 74–100% |
| `water_walk` | Share of building cells within a 300 m walk of water. | higher | 14–90% |
| `green_cover` | Landscape share of the design ground. | higher | 17–49% |
| `green_view` | For each building, the share of open cells within two steps. The mean over buildings. A rough stand-in for a green view. | higher | 14–30% |

### Water and land fit

McHarg's reading: valleys carry water, ridges carry movement (`docs/landform.md`).

| key | what it measures | better | range |
|---|---|---|---|
| `valley_free` | Of the valley channels and their buffers, the share kept free of buildings (1 where the site has no valleys). The rules already keep buildings out, so it is 100% unless locks or edited rules let buildings in. | higher | 100% |
| `ridge_streets` | Share of the streets beside a strong divide (5 ha or more on its smaller side) or with both sides in the top quarter of the ground's height. | higher | 15–27% |
| `low_streets` | Share of the streets between two valley cells (crossings) or with both sides in the bottom quarter of the ground's height. | lower | 6–27% |
| `runoff_path` | How far rain runs from a building to the first landscape or water cell, along the ground's flow, in metres. The mean over building cells; a path that leaves the design ground stops there. | lower | 99–315 m |
| `heat_fit` | Cooling where it's hot: the mean hot-season surface temperature (Landsat; `pc/lst.py`) of the cells the design keeps open (landscape and water), less the mean over the design ground, °C. Above 0, greening and water go to today's hot spots. 0 without LST. | higher | −0.6 to +0.3 °C |

The ranges for these depend strongly on the site's landform: `npm run metrics` lists them per site.

### Harmony and variety

The three mixes are shown, never judged. Harmony and variety pull against each other, and
the brief asks for both to be visible.

| key | what it measures | better | range |
|---|---|---|---|
| `height_mix` | Entropy of storeys over building cells, over ln of the tallest the rules allow. 0: all one height. | neither | 7–74% |
| `use_mix` | Entropy of building, landscape and water, over ln 3. | neither | 80–99% |
| `type_mix` | Entropy of five types (low, mid and tall buildings, landscape, water), over ln 5. | neither | 57–93% |
| `coherence` | Proportion and coherence: blocks of three or more cells, sorted by plan shape (long side over short, from the spread of their cells) and by massing (height over the side of a square of the same area), each in half-octave steps. 1 minus the entropy of those classes over ln (number of blocks). 1: every block shares one proportion. The golden ratio gets no special credit, as the brief asks. | higher | 13–54% |

### Alexander's properties

Salingaros's formulas are the reference. They were written for façades and plans at
building scale. Applying them to an urban plan on a 20 m cell grid is our choice, and some
of these proxies are rough. Each row says what it actually counts.

| key | property | what it measures | better | range |
|---|---|---|---|---|
| `levels_of_scale` | levels of scale | Sizes of blocks and open spaces as a ladder of e-fold steps from one cell to the largest; the entropy of the area on each rung. One huge block, or a missing rung, scores low. | higher | 57–87% |
| `strong_centres` | strong centres | Within 300 m of each centre, the correlation of storeys with nearness (0 if negative); the mean over centres. Do heights rise towards the centres? | higher | 0–88% |
| `boundaries` | boundaries | Of the edges of open spaces (three cells or more), the share that buildings define. | higher | 39–72% |
| `rhythm_built` | alternating repetition | Along each row of cells (runs of 16 or more), built and open as 1 and 0. The power of the strongest frequency in the discrete Fourier transform, as a share of all the power apart from the mean. Weighted by length. | higher | 17–52% |
| `rhythm_skyline` | alternating repetition | The same on storeys (open as 0). | higher | 19–51% |
| `positive_space` | positive space | Open spaces of three cells or more: area over the area of their convex hull, weighted by area. Convex spaces are positive. | higher | 57–71% |
| `local_symmetry` | local symmetries | Of the cells whose ring of neighbours is complete and mixed (two or more cells differ from the commonest kind), the share whose ring of use and height band is mirror-symmetric about some axis. | higher | 71–92% |
| `symmetry` | (secondary) | Global mirror symmetry of the skyline: for axes every 15° through the centre of the ground, the correlation of storeys between each cell and its mirror image, times the share of cells that have one. The best axis. Shown only: Alexander prefers local symmetries to a global one. | neither | 12–34% |
| `balance` | (asymmetric balance) | 1 when the centre of the floor area sits on the centre of the ground, 0 when it is a quarter of the ground's diagonal away. | higher | 43–91% |
| `contrast` | contrast | Share of neighbouring cells that differ in use or height band (up to 4, up to 8, taller). | higher | 14–28% |
| `landmarks` | contrast and emphasis | Of the landmarks, the share within 100 m of a junction or a centre. 0 when there are none. | higher | 0–100% |
| `gradients` | gradients | Where neighbouring buildings differ in height, the share that step by just one storey. Change by degrees, not jumps. | higher | 0–100% |
| `roughness` | roughness | Within blocks of three or more cells, the standard deviation of storeys over the mean, weighted by size. Alexander wants it low but not zero, so neither end is better. | neither | 6–31% |
| `the_void` | the void | The largest open space as a share of the ground. | higher | 9–41% |

Not measured, and why:

| property | why |
|---|---|
| echoes | it is about angles and proportions repeated across buildings: building scale, Phase 7 |
| not-separateness | it needs the context's own cells next to the design (its uses and heights), which the design ground doesn't carry; Phase 9's piecemeal growth will |
| good shape; deep interlock and ambiguity; simplicity and inner calm | no proxy on a cell grid that a jury would accept (R11) |

### Use and orientation

| key | what it measures | better | range |
|---|---|---|---|
| `semilattice` | Semilattice richness (*A City is Not a Tree*). Five kinds of 400 m walking catchment: parks, water, shops and food (Overture places, plus the design's own centres), schools, and transit (Overture places). A place outside the design ground starts its walk at its nearest cell, with the straight-line distance already counted. For each cell, (catchments − 1) / 4, floored at 0; the mean. 0 when each cell reaches one thing, 1 when every cell reaches every kind. Sites exported without places use the old stand-in: parks, water, centres and existing roads, (catchments − 1) / 3. | higher | 66–81% |
| `legibility` | **A placeholder until Phase 8.** Share of cells within 300 m of a landmark or a centre: something to find your way by. | higher | 0–52% |

Places are kept when Overture's confidence is 0.4 or more and they aren't marked closed
(`pc/maps.py`, `PLACE_MIN_CONFIDENCE`). With that filter:

| Site | Shops and food | Schools | Transit |
|---|---:|---:|---:|
| mumbai-ewf | 1,608 | 52 | 12 |
| mumbai-docks | 87 | 9 | 5 |
| ahmedabad-wadaj | 99 | 22 | 2 |

Transit is thin: Overture has rail stations and a few transit facilities, but no bus stops.

Semilattice richness over 20 random designs, before (roads as a stand-in for transit) and
after (real destinations, re-fetched 2026-10-19):

| Site | Before: mean (min–max) | After: mean (min–max) |
|---|---|---|
| mumbai-ewf | 0.64 (0.48–0.77) | 0.76 (0.66–0.81) |
| mumbai-docks | 0.81 (0.61–0.95) | 0.72 (0.60–0.74) |
| ahmedabad-wadaj | 0.64 (0.50–0.74) | 0.66 (0.57–0.71) |

The spread across designs narrows: existing shops and schools don't depend on the design,
so a design changes only the parks, water and centres it adds.

## Promoting metrics

- **To objectives** (`objectives` in `evolve`; `--objectives a,b` in `pc evolve`; "also
  optimise" in chapter 04). Up to two, and only metrics with a better end. Each design then
  carries the metric's value in its scores, rounded to six places, and it is ranked like a
  score.
  - With six or seven objectives, NSGA-II's crowding stops telling designs apart, so the
    "auto" search (the default in the page and the CLI) switches to NSGA-III, as the brief
    asks.
  - Cost: computing a metric for every design adds about 1 to 5 ms per design per metric.
    About 2.4 s against 1.8 s for a ten-generation run at Mumbai, measured in a headless
    browser.
- **As MAP-Elites traits:** any metric. The bins cover 0 to 1, or the range in `range`
  (junctions 0 to 4, connections 2 to 10).
- **In breeding by hand:** "favour" breeds 24 children and keeps the six best on any score,
  or on any metric with a better end.
- **The brief:** its aesthetic priorities use the same vocabulary as the properties above.
  Rows the brief asks for are marked in the panel.

## Performance

A design's network and all 30 metrics take about 10 to 15 ms at Mumbai EWF (1,623 cells) and
25 ms at Wadaj (3,607 cells), once the per-site caches are built. The caches hold road cuts,
link directions, rows and mirror images. The worker measures every kept design after a run:
an estimated 1 s for 60 designs.
