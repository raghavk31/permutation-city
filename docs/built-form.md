# Built form: the pipeline, and the source behind each number

The built form brief (`docs/built-form-brief.md`, 26 October 2026) asks for shared ground
first, a building type per block, buildings placed before plots are drawn, and habitability
rules a designer would recognise. The plan for it is `docs/architecture-v3.md` section 12.
This file records what each step does, the reference it rests on, and how sure we are of every
number. A number is **read** (checked in the document itself, with the page), **secondary**
(from a report or summary of the document, which wasn't found), or **assumed** (our choice,
with the reason).

## The pipeline

| Step | What it does | Scale | Status |
|---|---|---|---|
| 1 Rules and brief | plot rules by road width, plot size and height; what the site can hold; the target | every design | **built for Bengaluru** (below) |
| 2 Streets, frontage | a frontage type and a cross-section per street | every design | **built** (below) |
| 3 Shared ground first | lake edge, valley corridors, squares, open-space hierarchy | every design | **built** (below) |
| 4 Building type per block | the block's type as coverage, storeys and floor area | every design | **built** (below) |
| 5 Place buildings | along frontage and shared-ground edges, with spacing rules | opened design | to come |
| 6 Draw plots | territories round the placed buildings, every plot on a street | opened design | to come |
| 7 Shape buildings | floor by floor: depth limit, floor heights, core, stepping to water | opened design | to come |
| 8 Voids | courtyards by sun, breezeways by wind, raised ground by flood depth | opened design | to come |
| 9 Score | urban scores from block density; building scores per block | both | to come |

Steps 1-4 run on every design in a run, so a run stays fast and the urban scores can freeze on
7 November. Steps 5-8 run only for the design a person opens, and for the block they mass
(decision 1, 26 October).

## Step 1: rules and brief (Bengaluru)

### What the engine does

- **Plot rules** (`app/engine/regs.ts`, `BENGALURU`) are looked up by site; a site without
  them grows as before.
- **While a plan grows** (`app/engine/plan/grow.ts`, `plotRules`), each plot knows the width
  of the widest street it fronts (`Plot.road`). Its building cells are held to the storeys
  that road allows, the coverage the plot's size allows, and the FAR the road allows (storeys
  come off first, then coverage). The plan records its capacity: FAR times area, summed over
  its building plots.
- **What the site can hold** (`app/engine/capacity.ts`) is the 90th percentile of that capacity
  over 48 random plans (seed 20261027) grown on the ground as it is. It is kept by a
  fingerprint of the ground, in `app/engine/capacity-table.ts` (`npm run capacity -- --write`).
  When a person edits a rule on the page, the ground changes and the page measures it again on
  the engine's workers (a few seconds).
- **The target** designs aim for is the lesser of the brief and what the site can hold
  (decision 2). "Against the target" in the inspector, and "on brief" in A4, mean within 10%
  of it.
- **The Brief step** shows the brief, what the rules allow, what designs aim for, and the share
  of the brief that can't fit.
- **Massing** (`app/engine/massing/vector.ts`) steps the envelope back with height: the low
  setbacks up to 11.5 m, then the all-round setback for each storey's height, never above the
  road's cap, with coverage by plot size and floor area by FAR.

### The result

| Lake buffer | Site can hold (90th percentile) | Median plan | Brief | Can't fit |
|---|---:|---:|---:|---:|
| 75 m (design default) | 181 ha | 140 ha | 591 ha | 69% |
| 30 m (the law only) | 222 ha | 171 ha | 591 ha | 62% |

The brief (FAR 2.0 over the 295.5 ha of design ground left by the legal buffer, assumed) is
about three times what the plots can hold. The reason is the one found on 26 October
(`architecture-v3.md` 12.2): FAR in Bengaluru applies to a plot, not to the whole site. Once
streets, the lake edge, valleys and parks are taken out, the plots are a fraction of the
ground, and FAR 1.75-3.25 on that fraction can't reach 2.0 over the whole.

(Measured again on 27 October after shared ground took its parks and squares from the plots:
186 and 228 ha before.)

### The numbers

| Rule | Value | Source | Confidence |
|---|---|---|---|
| FAR by road width | up to 12 m: 1.75; 12-18 m: 2.25; 18-24 m: 2.5; 24-30 m: 3.0; over 30 m: 3.25 | RMP 2015 Zoning Regulations, Table 10 (Residential (Main)), p. 27 | read |
| Ground coverage by plot size | up to 360 m²: 75%; to 1,000: 65%; to 2,000: 60%; to 4,000: 55%; over: 50% | same, Table 10 | read |
| Height on roads under 9 m | at most 11.5 m (3 storeys of 3.2 m) | same, Table 10 note b | read |
| Low setbacks, up to 11.5 m and 4,000 m² | front 12%, rear 8%, sides 8% of depth and width (sites over 9 m); 1 m on narrower ones | same, Table 8, p. 19 | read |
| Setbacks on plots over 4,000 m² | 5 m all round | same, Table 8 | read |
| Setbacks above 11.5 m, all round | 5 m to 15 m high, rising by 1 m per 3 m to 10 m at 30 m, then 11-14 m, 16 m over 50 m | same, Table 9, p. 20 | read |
| Spacing of buildings on one plot | half the taller one's height | same, 3.6 (i); Bye-laws 2003 Tables 4-6 note 12 | read; **not applied yet** |
| Layout shares | plots at most 55% of the land, parks at least 15% | same, 6.1 (b), (c), p. 43 | read; measured per plan (`plotShare`, `parkShare`), **not enforced yet** |
| High-rise | ground plus four floors and up; needs a 21 m site, a 12 m road, 6 m clear all round | Bye-laws 2003, 2.46, 9.3.2, 9.3.3, 16.0 (e) | read; **not enforced** (the default is four storeys, below it) |
| Most storeys, default | 4 | Alexander, Pattern 21 (Four-Story Limit); decision 8 | assumed (book not checked, decision 7) |
| Lake buffer, the law | 30 m | RMP 2015, 4.12.2 ii, pp. 38-39 | read; medium that 30 m is what an approval applies today |
| Lake buffer, Karnataka Act 19 of 2026 | 24 m for tanks of 25-100 acres, 30 m over 100 | Act 19 of 2026, s. 2, Gazette 18 February 2026 | read; the RMP's 30 m is stricter, so it binds |
| Lake buffer, design default | 75 m | NGT, 4 May 2016 (set aside in general by the Supreme Court, 5 March 2019) | read; labelled a design choice beyond the legal minimum |
| Floor to floor | 3.2 m | Bye-laws 2003, 20.1 (2.75 m clear rooms) plus a slab | assumed |
| Daylight depth | 7.5 m from an opening (a wing lit both sides at most 15 m deep) | Bye-laws 2003, 20.11 (3), p. 41 | read; for step 7 |
| The brief | 590.9 ha of floor area (FAR 2.0 over 295.5 ha) | the site's figures | assumed |

Corpus notes, with the full tables and how each was found:
`corpus/regulations/bengaluru-rmp2015-far-setbacks.md`,
`corpus/regulations/bengaluru-byelaws-2003.md`,
`corpus/regulations/bengaluru-lake-drain-buffers.md`.

### Simplifications, and what isn't applied yet

- **The buffer is measured from the mapped water edge** (Overture), not the tank's boundary in
  the revenue records, which is usually larger. The real buffer reaches further inland.
- **Interior plots** (no street frontage) take the narrowest road band: FAR 1.75 and 11.5 m.
- **A plot's road** is the widest street it fronts. A corner plot's second front setback (RMP
  3.1 vii) isn't applied.
- **Drain buffers** aren't applied from the regulations yet. The site still uses the
  provisional valley buffer (0, 20 or 40 m by stream order). The RMP gives 50, 25 and 15 m
  from the centre; an October 2025 notification reportedly halved them (secondary, figures
  not found).
- **The 2026 amendment** to Table 8 (fixed setbacks under 250 m², 15 m on roads under 9 m) is
  known only from a law firm's summary; the notification wasn't found, so the 2007 table
  stands here.
- **The 2018 premium FAR** near metro and ring road projects isn't applied: the site isn't
  known to lie in an impact zone.
- **Other sites** have no plot rules yet (Wadaj, the Mumbai sites, Guwahati: Milestone B,
  decision 4). They keep their brief as the target.
- The Python engine has no plot rules, so the parity test turns capacity off.

## Steps 2 and 3: streets and shared ground

`app/engine/plan/shared.ts`, run in every design between laying out the plots and filling
them (`plan/grow.ts` step 8).

### Shared ground, in the brief's order

1. **Lake buffer, tank edges, valleys, drainage lines.** The rules already keep these open:
   forbidden ground off the design ground (`Ground.openLand`) and constrained cells that take
   only water, wetland or landscape. They count as shared ground; nothing is claimed again.
2. **Squares at the important junctions.** Where two or more secondary or primary streets
   meet, ranked by the classes meeting there and nearness to a centre (a proxy for choice and
   integration: the routes are the streets that carry through-movement by construction). The
   corner plot of 150-1,200 m² nearest the junction becomes the square; squares stand at least
   300 m apart (design).
3. **The open-space hierarchy.** For each level, a building plot with no open ground of the
   level's size within its walk is unserved; the block serving the most unserved plot land per
   hectare of park becomes a park, until every plot is served or 25% of the land is claimed
   (design cap). Under Bengaluru's plot rules, blocks are then added until parks reach 15% of
   the land (RMP 2015 6.1 c). Walks are straight lines times 1.3 (SP:118 3.2.1.4: route
   directness 1.1-1.5), stepped over the cells.

| Level | Least size | Walk | Reserved here? | Source |
|---|---:|---:|---|---|
| doorstep green | 125 m² | 100 m | no: built at block scale (courts) | size URDPFI 2015 via NIUA (secondary); walk Fields in Trust 2015 (assumed) |
| housing area park | 5,000 m² | 400 m | yes | as above |
| neighbourhood park | 10,000 m² | 1,000 m | yes | as above |

Correa's four levels (family, doorstep, neighbourhood, city) give the structure; his book
gives no sizes, so the URDPFI figures stand in (assumed, decision 7). Corpus:
`corpus/regulations/urdpfi-open-space-hierarchy.md`.

### Frontage per street

Sampled either side of each segment's middle, just past its width: **lake edge** within 40 m
of water or the lake buffer; **green edge** beside shared ground; **active** on a secondary or
primary street within 250 m of a centre or a square; else **residential**. All four are design
rules (no regulation sets them). Buildings will read them when they are placed (step 5).

### Cross-sections

Every street is drawn as its IRC:SP:118-2018 template (Annexure 3: 18A, 12A, 9A, 6A; the 7.5 m
street assumed between 9A and 6A), in the Massing step's 3D ground, the plan's 3D view and as a
diagram in Explore's inspector. Trees stand every 15 m in planted strips of 1.5 m or more.
SP:118 draws no swale: the planted zones are where one would go (design choice). Corpus:
`corpus/regulations/irc-sp118-street-templates.md`.

### Access (the score)

`plan.shared.access`: per level, the share of the design's floor area within its walk. Shown
in Explore (the plan's "Shared ground" view and the inspector). It is a readout until the
scores are revised (section 10); the urban objectives are unchanged.

### Cost

Shared ground, frontage and access add 8-61 ms a design (Docks, Bengaluru, Wadaj; Node), against
120-500 ms for the rest of the plan.

## Step 4: a building type per block

`app/engine/plan/blocktypes.ts`, run in every design after shared ground and the heights, before
the plot rules (`plan/grow.ts` step 9). The four types and every number they use are in that one
file, `BLOCK_TYPES` and the constants under it.

### What the engine does

- **A block as Spacematrix sees it.** Its building land (the cells of its building plots, less
  street) and the oriented bounding box of its outline scaled to that land: a width W across and
  a length L along.
- **What the genes ask.** The floor area the fields grow on the block (the coverage gene, heights
  from the core field, as before) over its land: the wanted FSI.
- **What each type gives.** For each storey count in the type's range, within the block's height
  caps (the site's storey cap, the road's height limit), the type's ground coverage (GSI) on a
  W x L block, held to the rules' coverage for the block's size, and its FSI = GSI x storeys, held
  to the FAR the block's plots allow. A type with no storey count whose shape fits is not
  feasible. The type takes the storey count that comes closest to the wanted FSI.
- **The choice.** Each feasible type scores its gene (the search's preference, 0-1), plus 0.25
  for courts and perimeter blocks where the wanted FSI is 1 or more (Martin and March's case for
  them at medium and higher density), less twice its relative miss of the wanted FSI. The best
  score wins. So the genes choose among types that reach the density; a type that falls far short
  loses whatever the genes prefer.
- **Towers** (decision 8): only on a block whose middle is within 150 m of a square or a centre,
  on a road of 12 m or more, wide enough for the bye-laws' high-rise site and fire clearance, and
  only where no lower type reaches the wanted FSI. At most two towers on the site: the blocks
  furthest short of their density choose first.
- **On the plan.** A typed block's building cells take the type's coverage and storeys (within
  each cell's cap); podium with towers gives the podium's, and a tower each to the cells nearest
  the node. Then the plot rules (step 1) hold each plot to its FAR, coverage and height as
  before. The urban scores read these cells, so they see each block's type through its density.

### The types

| Type | Wing depth | Storeys | Coverage on the block | Source |
|---|---:|---:|---|---|
| courtyard | 10-14 m | 3-6 | courtyard buildings tiled over the block, 6 m apart, stretched along it; each a ring of wings round a court at least 12 m and as wide as the wings are high | depth: Bye-laws 2003 20.11 (3), a wing lit on both sides at most 15 m (read); court 12 m: Correa's cluster court (brief, secondary); court as wide as high: assumed until step 8 sizes it by winter sun |
| perimeter block | 10-15 m | 3-6 | one ring along the block's edge, 10% left open for passages; the yard inside at least 12 m and as wide as the ring is high | depth as above (read); breaks and yard: assumed |
| row housing | 8-12 m | 2-4 | rows along the block's length, apart by their height and at least 6 m, 10% left open | depth and spacing assumed (light at 45° to the ground floor; the RMP's half the height, 3.6 (i), is the legal floor); walk-ups to four storeys: Alexander 21 (assumed) |
| podium with towers | floor plate 18-24 m | towers 5-15, podium 2 | podium at the plot's coverage (at most 60%), one or two towers per block, apart by half the taller one's height and twice the fire clearance | high-rise from ground plus four: Bye-laws 2003 2.46 (read); spacing: RMP 3.6 (i), Bye-laws 16.0 (e) (read); plate, 15 storeys, podium: assumed |

Wing depth sits where the coverage gene puts it in each type's range (more ground covered,
deeper wings). Fire clearance and the high-rise site and road are Bengaluru's (Bye-laws 2003);
sites without plot rules use them too, marked assumed.

### Genome version 3.1

Four genes join the end of the genome (63 numbers), one preference per type
(`t_courtyard`, `t_perimeter`, `t_row`, `t_towers`), shown in the inspector as "Building types
preferred". The plan's own random seed reads only the first 59, so a type gene never moves a
street or a plot. A version 3 genome (59 numbers) grows as before, without types; links and
files from before breed again as version 3, with a note.

### The result

Over 16 random designs a site (`npm run types-survey -- --n 16`, 28 October): the share of
blocks of each type, how often each is feasible, and the FSI asked and given over typed land.

| Site | Courtyard | Perimeter | Row | Towers | FSI asked / given | Floor area (v3) |
|---|---:|---:|---:|---:|---:|---:|
| Bengaluru | 13% (46%) | 4% (44%) | 82% (99%) | 0% (0%) | 1.08 / 1.21 | 106 ha (90) |
| Wadaj | 28% (56%) | 15% (54%) | 56% (99%) | 0% (5%) | 2.61 / 2.25 | 346 ha (396) |
| Mumbai Docks | 16% (50%) | 10% (48%) | 73% (100%) | 1% (4%) | 1.78 / 1.74 | 42 ha (49) |
| Mumbai EWF | 21% (51%) | 13% (48%) | 65% (99%) | 1% (5%) | 2.27 / 1.99 | 120 ha (143) |
| Guwahati | 22% (47%) | 14% (45%) | 64% (100%) | 0% (5%) | 2.72 / 2.25 | 233 ha (276) |

(Feasible in brackets.) Half the blocks are too narrow for a court: two wings and a 12 m court
need 32-40 m across, and the plot families make many blocks two plots deep. Rows fit almost
everywhere. Random genes aren't a search, though: after a short run on Bengaluru (8 generations
of 24) the design most daylit was 97 perimeter blocks, 70 rows, 9 courtyards and two towers at
nodes, 177 ha against the 181 ha the rules allow. On the denser sites the types give 10-15%
less floor area than the fields asked, since the types cap storeys and coverage that plots
alone didn't; Bengaluru gets more, since rows start at two storeys.

Typing costs 2-10 ms a design, about 1-2% of a plan.

### Simplifications, and what isn't built yet

- **A block is its bounding box** scaled to its land. Irregular blocks get the numbers of a
  rectangle of the same land and proportions.
- **One type per block** (brief section 5), no mixing.
- **The 3D view still extrudes plots** at their cells' storeys, a tower plot whole. Default
  massing per type for unopened blocks, and the consistency check (massing a sample of blocks
  per type against the numbers here, a gap over 10% flagged; decision 1), come with the type
  generators (12 November checkpoint).
- **Blocks no type fits** (about 1%: too narrow even for a row) keep what the genes grew.

## Whole-site massing (29 October)

`app/engine/plan/blockmass.ts`. Every typed block is massed as its type in the 3D view, never as
plot extrusions (decision 1 of 12.12):

- **Courtyard:** courtyard buildings tiled over the oriented box of the block's building plots,
  each a ring of wings round a court at least `COURT_MIN_M` and as wide as the wings are high.
- **Perimeter block:** one ring of wings of the type's depth along the outline of the land (its
  convex hull), each side broken for passages (`BREAKS`).
- **Row housing:** rows along the block's length, their height apart, broken into pieces of at
  most 40 m.
- **Podium with towers:** the podium at the type's coverage, the towers on it along the block.

Each building is clipped to the block's building plots (Sutherland and Hodgman 1974); pieces under
25 m² are dropped. Blocks no type fits keep their plot extrusions.

**The consistency check found the bounding-box arithmetic wrong on real blocks.** Massed as laid
out, most blocks missed their type's promised floor area by more than 10% (six random designs
each on Bengaluru, Docks and Wadaj: 60-99% of blocks flagged, the box arithmetic over-promising
on irregular blocks cut by shared ground). So a low type's coverage is now **measured**: the
type is laid out on the block's own plots at each storey count and its covered share is what the
choice reads (`BlockShape.measure`). After that, on the same designs, 34% of blocks stay
flagged on Bengaluru, 12% on Docks and 11% on Wadaj. The likely cause is the rules' coverage or
FAR capping a type below what its layout covers (the massing isn't thinned to the cap yet); not
yet broken down by cause.
Towers keep the arithmetic.

**Capped blocks thinned (29 October).** The over-promise left on Bengaluru was the rules: its
coverage and FAR cap a type below what its layout covers (20% of blocks massed over their cap,
mostly perimeter blocks). A block over its cap by more than 2% now has whole buildings left out,
spread evenly by error diffusion: whole courts (a wing at a time where a block holds fewer than
three, opening a court on a side), row pieces, perimeter pieces (wider passages). Wing depth is
kept, since the daylight rule set it. The measured perimeter also needs its yard now (at least
`COURT_MIN_M` and as wide as the ring is high), as the box arithmetic did; without it, rings on
small blocks overlapped at the corners. Six random designs each, flagged blocks:

| site | over before | over after | under | of which no building plot |
| --- | --- | --- | --- | --- |
| Bengaluru | 20% | 3% | 15% | 14% |
| Docks | 0% | 0% | 11% | 11% |
| Wadaj | 0% | 0% | 11% | 11% |

**What was left was a cell/plot mismatch, not the massing.** Nearly every block still under
was a block whose building cells sat in plots voted another use (one unsplit plot, mostly
landscape, sometimes water; `plotUse`): 11-13% of typed floor area was counted on cells and never
drawn, and untyped designs leaked the same way (plot extrusions draw only building plots). Now
**the plot decides** (user's choice, 29 October; `growV3` after shared ground): a building cell in
a plot of another use becomes open ground (landscape, never water, which no claim drew; cells
earlier increments built stay). Floor area per random design falls by what had leaked
(Bengaluru 102 to 88 ha, Wadaj 337 to 307, Docks 42 to 39, Guwahati 231 to 216; 12 designs
each). The capacity readout is unchanged (181.0 ha on Bengaluru's rules, 221.7 ha on the law's
buffer only): the plot rules already counted building plots only. Flagged blocks after both
fixes: Bengaluru 4.0% (2.9% over, small blocks a whole building too coarse to thin), Docks 0.5%,
Wadaj 0.2%. Also seen: a self-intersecting plot now and then (about one block in a thousand)
undercounts its own area.

Cost: growth is slower (per design, Bengaluru 476 to 618 ms, Docks 115 to 192 ms, Wadaj 591 to
843 ms in Node), from laying out each low type at each distinct court width and row gap.

Not yet: the check shown in the workbench; the Massing
step's block search seeded from the same layout; library precedents as types.

## Steps 5-9: references to check

Figures from books go in as **assumed** with the secondary source named until a copy is read
(decision 7). The ones the next steps will lean on:

- Open-space hierarchy: Charles Correa, *The New Landscape* (1985) (structure; used, above).
- Block types as coverage, storeys and floor area: Berghauser Pont and Haupt, *Spacematrix*
  (2010).
- Alexander, *A Pattern Language* (1977): 21 Four-Story Limit, 107 Wings of Light, 115
  Courtyards Which Live, 122 Building Fronts, 159 Light on Two Sides of Every Room
  (`docs/alexander.md`).
- Daylight depth and room sizes: Bye-laws 2003, 20.1 and 20.11 (read, above).
