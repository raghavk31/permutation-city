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

**Context.** The design's other buildings in the frame stand as prisms: the cell inset by
√coverage, `levels × 3.2 m` high. The ground the shade and sky scores read is the street
bands plus landscape cells.

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
| hot-season shade on public ground | ↑ | share of public points (street bands, landscape) in shade on 15 April, solar 11:00–16:00 |
| sky view from the street | ↑ | 1 − mean sin²(horizon angle) over 16 directions to 100 m (Oke; Steyn), at the public points |
| frontal area (wind blocked) | ↓ | frontal area density of the block's massing, projected across 8 wind directions and averaged, over the plots' area (Grimmond and Oke 1999). No prevailing wind is assumed |
| gap | | \|floor area − target\| ÷ target. Within 10% counts as on brief, as at the urban scale |

How the scores are computed:
- **Sun** uses Spencer's declination and solar time (12:00 is solar noon at the site). The
  sun study in the viewer uses the same function.
- **Sun blocking** is a column-by-column walk towards the sun (Amanatides and Woo). It
  compares the ray's height where it enters each column with the column's top.
- **Trade-offs.** Winter sun and sky view pull against hot-season shade; that is the
  trade-off to explore. At 13° N in mid-April the sun is nearly overhead at noon (87°), so
  shade on open ground is scarce at Bengaluru whatever is built.

**Evolution** (`evolve.ts`):
- NSGA-II on the four scores, among massings within 10% of the target; the rest are ranked
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
- **Rhino .3dm** (metres, layers "massing" and "context", a named mesh per plot). rhino3dm's
  2.7 MB WebAssembly loads only when someone asks for a .3dm.
- **Bench file** (below)

## The viewer

`app/ui/mass/viewer.ts`, three.js 0.186.

**Controls:**
- Orbit, zoom and pan.
- Sun study: four dates (21 December, 21 March, 15 April, 21 June) and solar time 06:00–18:00.
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
- **scores:** sun, shade, sky, wind and gap recomputed with the same arithmetic, in the
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
- **The context is the urban design's own cell prisms**, not the existing city. Retained
  buildings outside the design ground don't shade.
- **Interior plots** are reached through their neighbours. No lane is cut to them.
- **Echoes** come from wall directions only, not proportions.
- **Pattern 107's width (12 m) is assumed** until checked against the book.
