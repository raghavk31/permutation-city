# Building-scale massing (Phase 7)

The urban design breeds a site; this breeds buildings inside one block of one design the
person picks. The code is `app/engine/massing/` (TypeScript only, decision D4); the page is
chapter 09 (`app/ui/mass/`); the Python bench is `pc/massing_check.py`.

Only the block a person picks is ever built in 3D, never a whole population of urban
designs (brief ground rule).

## From the urban design to envelopes

`envelope.ts`.

**Block.** A group of building cells between the design's streets and the existing roads
(`metrics/network.ts`, the same blocks the form metrics use).

**Plots** (choice of 2026-10-20: blocks, big ones split):
- A block over 0.5 ha is split in two along the long axis of its cell centres, again and
  again, while a part is over 0.5 ha. No part is made under 0.15 ha.
- A part with no frontage joins the neighbouring part it shares most sides with. It joins
  only while the two stay under 1 ha. Frontage is a street or open ground (landscape or
  water) next door.
- A part that can't join stays an interior plot, and the block's note says so. A 9 ha
  block (sparse street genes) gives several.
- Each plot's axis follows its longest street frontage (side directions doubled, so
  opposite sides agree). With no street frontage, it follows the long axis of its columns.

**Envelope**, on a raster of 2 m columns with 60 m of context round the block. A column is
buildable for a plot when it is:
- in one of the plot's cells
- more than half a street's width from a street side (each street takes width ÷ 2 from the
  cell on either side, as at the urban scale)
- outside the setbacks: front along streets, side between plots of one block, rear
  elsewhere. Defaults are 3, 0 and 3 m, all assumed. A confirmed brief's `setbacks_m`
  replaces them, and the page says which applies.

Per plot:
- **Height cap:** the rules' `max_levels` for each column's cell (choice of 2026-10-20). A
  column's cap is its own cell's.
- **Coverage limit:** 1 − the highest `min_permeable` among the plot's cells.
- **Floor-area target:** the floor area the urban design put on those cells (net of
  streets). So massing can move height around inside a plot, but is judged against what
  the city scale asked for.

**Context.**
- **The design's other buildings** in the frame stand as prisms: the cell inset by
  √coverage, `levels × 3.2 m` high.
- **Existing buildings** within 100 m of the design ground stand at their own heights
  (`existing_buildings` in `pc/export.py`; added 2026-10-20). They cast shade and receive it.
  - Overture's footprints, off the design ground (one whose middle is on it is left out: the
    design replaces it).
  - Heights, in order (changed 2026-10-20):
    1. Overture's `height`
    2. Overture's `num_floors` × 3.2 m
    3. **Google Open Buildings 2.5D Temporal**, 2023: the 90th percentile of its heights
       inside the footprint, when at least 2.5 m
    4. the median of known heights (1 or 2) within 300 m, when at least 5 are known
    5. 2 storeys
    6. **set by you**: a height typed in the massing view, for that site, overrides all of
       these

    Every building keeps where its height came from, and the page says how many came from each.
  - Of the buildings kept:

    | site | kept | height | floors | Open Buildings | nearby median | 2 storeys |
    |---|---:|---:|---:|---:|---:|---:|
    | mumbai-docks | 289 | 0 | 0 | 188 | 0 | 101 |
    | mumbai-ewf | 616 | 0 | 7 | 521 | 5 | 83 |
    | ahmedabad-wadaj | 112 | 0 | 28 | 54 | 16 | 14 |
    | bengaluru-cascade | 1,051 | 4 | 36 | 794 | 141 | 76 |

    Before Open Buildings, 2 storeys was the height of all 289 at Docks, 527 at EWF, 32 at
    Wadaj and 409 at Bengaluru.
  - **Open Buildings 2.5D Temporal** (Sirko et al. 2023, "High-Resolution Building and Road
    Detection from Sentinel-2", arXiv:2310.11622) estimates building height in metres from
    Sentinel-2 at an effective 4 m, yearly 2016–2023. It covers Africa, South and South-East
    Asia, Latin America and the Caribbean. `pc fetch <site> --only heights` reads the 2023
    tiles from Google's public bucket (`open-buildings-temporal-data`, no account) at 2 m into
    `raw/heights.tif`. Outside its coverage, the export says so and goes on without it.
    - Licence: CC BY 4.0 or ODbL 1.0, at the user's choice; we use CC BY 4.0 and credit it
      on the page. It contains Copernicus Sentinel-2 data.
  - **How it was tested.** Against Overture buildings with known floor counts (× 3.2 m) over
    each site's whole box, the same check the surface model failed:

    | site | known floors | Open Buildings r (p90) | r (median) | nearby median r | MAE: Open Buildings | nearby | 2 storeys |
    |---|---:|---:|---:|---:|---:|---:|---:|
    | bengaluru-cascade | 577 | 0.88 | 0.84 | 0.62 | 6.6 m | 8.6 m | 17.2 m |
    | ahmedabad-wadaj | 1,373 | 0.84 | 0.81 | 0.68 | 2.4 m | 2.4 m | 3.7 m |
    | mumbai-ewf | 30 | 0.60 | 0.57 | −0.33 | 15.3 m | 23.8 m | 30.8 m |
    | mumbai-docks | 2 | too few | | | | | |

    The nearby median here is leave-one-out (the building's own floors not counted). Open
    Buildings reads low: by 3 m on average at Bengaluru and Wadaj and 7 m at EWF. It isn't
    corrected for that. Against Overture's own `height` (38 buildings at Bengaluru) it
    correlates at only 0.26; those tags look unreliable too.
  - The surface model minus FABDEM bare earth was tested first and dropped: against the
    buildings with known floor counts it correlated at r = −0.32 to 0.06 (at 30 m it can't
    resolve single buildings). Known heights lean tall (tagged apartment blocks), so the
    nearby median does too.
  - **Low confidence.** When more than half of a block's existing neighbours have guessed
    heights (the nearby median or 2 storeys: nothing measured on the building itself), the
    two scores that read them, hot-season shade and winter sun taken from neighbours, are
    labelled low confidence. The rule counts the buildings the block's scores read, not the
    whole site.
- **The ground the shade and sky scores read** is the street bands plus landscape cells.

## Version 3 designs: envelopes from the vector plots

A version 3 design is drawn as streets, blocks and plots (docs/architecture-v3.md), so its
massing reads those instead of cells (`app/engine/massing/vector.ts`; `envelope` and
`blocksOf` hand a design with a plan to it). The rest (representations, scores, meshes,
downloads, the viewer) is unchanged: it reads the same `Envelope`.

- Blocks: the faces of the street network that hold building plots. Their area is the plots'
  area, net of streets.
- Plots: the plan's building plots in the block, as drawn. They are already set back half a
  street's width from the centrelines, so nothing is split or merged here.
- Setbacks, per plot edge: front where the edge lies within half a street's width plus 2 m of
  a centreline, or faces landscape or water 3 m out; side where it meets a front edge; rear
  otherwise.
- Street bands: columns within half a street's width of a centreline.
- Height cap and most cover: the rules' cap and least permeable share of the cell under each
  column, as before. The target: the floor area the design put on the cells under the plot,
  in proportion to the plot's columns.
- Context: the design's other building plots at their storeys, shrunk about their middles to
  their cover for the 3D view; existing buildings as before.
- The 3D ground is painted from the plan (streets as strokes, plots as polygons) at about
  3 px a metre, over the column ground smoothed.

Measured on random version 3 designs (Node, a block of 0.1 to 0.2 ha with 4 or 5 plots):
preparing a block takes 70 to 360 ms, and 12 massings by 3 generations under a second, on
Mumbai Docks, Guwahati and Bengaluru. Tested in `test/ui/massing-vector.test.ts`.

## Three representations, one interface

`context.ts` defines `Representation<G>`: `random`, `mutate`, `cross` (the better parent
first), `build` (to voxels), and `distance`. A run uses one representation. The genome
schema is fixed within a run: typology and field genomes have a fixed length per block, and
the CPPN's topology grows only through NEAT's own operators.

| | Genes | Built as | Skin |
|---|---|---|---|
| **Typology grammar** (`typology.ts`) | 10 per plot: type (courtyard, L, U, tower, slab, podium and tower), one of eight orientations, wing depth 9–18 m, extent, offset, storeys as a share of the cap, podium storeys or second-wing height, tower plan | rotated boxes on the plot's axis | the boxes themselves (exact) |
| **Voxel field** (`field.ts`) | 6 metaballs per plot × (u, v, z, radius 8–40 m, strength −0.5–1) | Wyvill falloff summed at voxel centres; built where above 0.3 | surface nets on the field, Taubin smoothing |
| **CPPN** (`cppn.ts`) | a NEAT network: inputs u, v (plot frame), z, distance to water, the rules' cap, winter sun past the context, bias; one tanh output | built where the output is above 0, one network for the whole block | as the field |

- **Crossover.** The typology grammar swaps whole plots, the field swaps whole balls, and
  the CPPN lines genes up by innovation number. NEAT's innovation numbers are kept per run.
  A split link always gives the same new node id.
- **Activations:** tanh, sin, gauss, abs, linear, sigmoid. Abs and gauss make mirror
  symmetry; sin makes repetition. No speciation: NSGA-II selects, and NEAT's compatibility
  distance only groups results.
- **Distance to water** uses the site's own water cells (lakes and rivers, mostly off the
  design ground), the design's water and valley channels. Not the smoothed `site_water`
  field, which is above zero everywhere.

**Priors from the brief:**
- Patterns 107 (Wings of Light) or 159 (Light on Two Sides) narrow the typology grammar's
  wings to 9–12 m and favour courtyard, L, U and slab in the first generation. The 12 m is
  assumed: Pattern 107's own width is still unchecked against the book (R10), and the cards
  say so.
- The brief's `typology_priors` (same six types) weight the first generation's types.
  Priors shape only where a run starts.

## Inside the envelope: reject or repair, and say which

`voxels.ts`. Every representation ends as voxels: 2 m × 2 m columns, one storey (3.2 m)
high. Floor area is the voxel count × 4 m². Repairs are always listed with each result:

| Repair | When | Applies to |
|---|---|---|
| shrink | a typology shape has more than 15% of its columns off its plot: shrink 10% about its centre, up to 8 times | typology |
| clip | columns still off the plot, or storeys over the cap, are removed | all (typology: the rest after shrinking) |
| lower | a box taller than the lowest cap under it is lowered | typology |
| ground | a voxel with nothing under it is dropped: no floating floors | field, CPPN |
| thin | a plot over its coverage limit loses its weakest columns (lowest summed field) | all |

A massing is **rejected** only when nothing is left inside the envelope. Rejected
massings rank last.

Plots are unions of hex or square cells, with ragged edges. Before the 15% rule, a
typology shape had to fit wholly, and nearly every one was shrunk to half the target. With
it, the best typology massing on each bench block gained 7–59% floor area (Mumbai Docks 7%, Wadaj 34%, Bengaluru 59%).

## Scores

`scores.ts`. All use the height of each raster column. The massing stands on the ground
with no floating floors, so a column's top is exact.

| Score | Better | How |
|---|---|---|
| winter sun on the ground | ↑ | hours of direct sun on 21 December, solar 08:00–16:00 every 30 min. Mean over sample points (every other column, so 4 m apart) on open ground within 30 m of the block: plots and public ground, not under buildings |
| hot-season shade on public ground | ↑ | share of public points (street bands, landscape) in shade when people are out in the heat: local time 14:00–17:00, every 30 min, on the 15th of March, April and May |
| sky view from the street | ↑ | 1 − mean sin²(horizon angle) over 16 directions to 100 m (Oke; Steyn), at the public points |
| frontal area (wind blocked) | ↓ | frontal area density of the block's massing, projected across 8 wind directions and averaged, over the plots' area (Grimmond and Oke 1999). No prevailing wind is assumed |
| winter sun taken from neighbours | ↓ | hours of 21 December sun (solar 08:00–16:00) the massing takes from the roofs of existing buildings in the frame: for each roof point (every other column, 0.5 m above the roof), the suns it gets with the block empty minus those it gets with the massing, times 30 min; mean over the roof points. 0 when no existing building is in reach |
| gap | | \|floor area − target\| ÷ target. Within 10% counts as on brief, as at the urban scale |

How the scores are computed:
- **Sun** uses Spencer's declination and solar time (12:00 is solar noon at the site).
  Local clock time converts to solar time through the site's longitude, its UTC offset and
  the equation of time (Spencer). The UTC offset is in the site's export: `utc_offset` in
  `site.yaml`, else 5.5 h inside India's box (India keeps one zone across 68–97° E, which
  longitude alone would put at +5), else the nearest hour of longitude. In Bengaluru, 14:00
  IST is about 13:40 solar time.
- **Sun blocking** is a column-by-column walk towards the sun (Amanatides and Woo). It
  compares the ray's height where it enters each column with the column's top.
- **Trade-offs.** Winter sun and sky view pull against hot-season shade; that is the
  trade-off to explore.
- **Why the afternoon (changed 2026-10-20).** The shade score first read 15 April, solar
  11:00–16:00. At 13° N the noon sun is then nearly overhead (87°), so the hours round noon,
  when shadows hardly exist, swamped the afternoon, when shadows are long and people are out
  in the heat. The score now reads local 14:00–17:00 over three hot-season dates. Across 48
  bred massings per block (`npm run massing-shade`), on three blocks per site:

  | site, block | shade before: mean, sd | shade now: mean, sd | sd now ÷ before |
  |---|---|---|---|
  | Mumbai Docks 60 | 18.0%, 2.7% | 29.7%, 4.4% | 1.6× |
  | Mumbai Docks 1 | 21.7%, 1.5% | 36.6%, 3.0% | 2.0× |
  | Mumbai Docks 41 | 13.4%, 1.1% | 23.3%, 2.1% | 1.9× |
  | Wadaj 44 | 17.6%, 1.2% | 28.0%, 1.6% | 1.3× |
  | Wadaj 28 | 14.0%, 3.2% | 20.5%, 6.1% | 1.9× |
  | Wadaj 32 | 17.3%, 2.5% | 24.6%, 4.6% | 1.8× |
  | Bengaluru 40 | 12.4%, 2.2% | 27.8%, 4.2% | 1.9× |
  | Bengaluru 2 | 44.0%, 1.0% | 76.2%, 1.0% | 1.0× |
  | Bengaluru 4 | 34.6%, 1.0% | 64.5%, 1.4% | 1.4× |

  The score now spreads 1.3–2.0 times as much across designs, so it tells them apart. The
  exception is a Bengaluru block whose shade comes almost wholly from tall existing neighbours.
  The neighbours score is above zero for 83–100% of massings where existing roofs are in
  reach (Docks 60, Wadaj 32, Bengaluru 2 and 4), up to 0.86 h of winter sun taken.

**Evolution** (`evolve.ts`):
- NSGA-II on the five scores, among massings within 10% of the target; the rest are ranked
  by gap, rejected ones last.
- Binary tournaments, 60% crossover (Sem 06), mutation on every child, 10% immigrants.
- Defaults: population 24, 12 generations (312 massings).
- Times on a laptop:
  - a 1.6 ha block of 4 plots: 13 s
  - a 0.2 ha block: 8 s
  - an outlier 9 ha block of 22 plots: about 40 s (scoring dominates, about 100 ms each)
- Runs in its own worker (`massing/worker.ts`), apart from the urban one.

## Readouts

`readouts.ts`. Shown with the scores, never bred on:

| Readout | Definition |
|---|---|
| floor within 6 m of a window wall | share of floor area whose distance to the nearest empty column on its storey is 6 m or less. Courtyards count as outside. A rule of thumb for side-lit rooms (about twice a 3 m ceiling), not Pattern 159's numbers |
| echoes | 1 − normalised entropy of wall area over 18 bins of direction (mod 90°), from the mesh. Alexander's echoes as repeated angles (Salingaros). Boxes laid on a plot's axis score high; free skins low |
| local symmetries | per plot, the better of its two mirrors about its own axes: 1 − Σ\|h − h′\| ÷ Σ(h + h′) over its columns, weighted by plot area |
| levels of scale | floor plates of every storey and the open ground inside the plots, as a ladder of e-fold sizes from one column; entropy of area per rung (as `levelsOfScale` at urban scale) |
| plot coverage, FAR, storeys mean and top | plain measures |

## Meshes and downloads

`mesh.ts`, `app/ui/mass/exports.ts`.

**Meshes:**
- **Typology:** boxes, exact.
- **Fields:** surface nets on the voxel field. The field is first forced to agree with the
  voxels after repairs, so the skin matches what is scored. Then three rounds of Taubin
  smoothing (λ 0.5, μ −0.53), which smooths without shrinking; plain Laplacian smoothing
  lost up to a third of a small mass.
- The skin is clamped to the ground and the cap. It stays within half a column of the
  envelope in plan.
- Skins are closed except at ambiguous voxel corners: 5 non-manifold edges on one CPPN
  massing of about 6,400 triangles.

**Downloads** (massing A with its context):
- **glTF** (binary, y up)
- **OBJ** (z up, metres, an object per plot)
- **Rhino .3dm** (metres, layers "massing", "context" and "existing", a named mesh per plot). rhino3dm's
  2.7 MB WebAssembly loads only when someone asks for a .3dm.
- **Bench file** (below)

## The viewer

`app/ui/mass/viewer.ts`, three.js 0.186.

**Controls:**
- Orbit, zoom and pan.
- Sun study: five dates (21 December; the 15th of March, April and May, the hot-season dates
  the shade score reads; 21 June) and local time 06:00–19:00, with the UTC offset shown.
  The directional light follows the engine's sun vector and casts shadows.
- Section: a plan cut at a height, or a cut across the block along the first plot's axis.
- Two results side by side (A and B), with their cameras linked.

**Loading:**
- The ground is the envelope's raster: streets, plots, setbacks, landscape, water, other
  buildings.
- The chapter loads when a design is first sent to it ("mass a block" under a design's
  plan), and three.js when the first result is shown.
- The page's first load: 41 KB gzipped before this phase, 43 KB after (`vite build`,
  index.html's own files).

## The Python bench

`pc/massing_check.py` (decision D4: Python checks the building scale, it doesn't grow it).

A bench file holds one massing with everything needed to recheck it, run-length encoded:
- the envelope rasters
- the voxels
- the sample points
- the sun, sky and wind direction vectors
- the browser's scores

The check:
- **envelope:** every voxel on a buildable column, under its cap, with a voxel under it,
  and each plot within its coverage limit
- **suns:** the vectors match the dates and latitude (within 1e-12)
- **scores:** sun, shade, sky, wind, neighbours and gap recomputed with the same arithmetic, in the
  same order. Heights are float32, as in the browser. They must match to the last digit.

The direction vectors travel in the file, so the two languages' `sin` and `cos` never have
to agree on a last digit.

Fixtures: `npm run massing-bench` writes nine (three sites × three representations) to
`test/massing/fixtures/`. pytest rechecks them, including tampered copies that must fail.
Vitest rebuilds them from their genomes and expects the same voxels and scores. The page's
"bench file" button writes the same format for any result:

    uv run python -m pc.massing_check <file>.json

## Not done, or unsure

- **Proxies, not simulation.** No wind simulation: frontal area is a morphometric proxy.
  No reflected light: sky view stands in for diffuse daylight.
- **Most existing heights are estimated** (above). Wrong heights move the shade score and
  the neighbours score; the page says how many are estimated for the block in view.
- **Interior plots** are reached through their neighbours. No lane is cut to them.
- **Echoes** come from wall directions only, not proportions.
- **Pattern 107's width (12 m) is assumed** until checked against the book.
