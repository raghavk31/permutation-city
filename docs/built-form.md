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
step's block search seeded from the same layout.

## Precedents as types (30 October)

`app/engine/plan/precedents.ts`, `blocktypes.ts`, `blockmass.ts`. The four fixed types are
gone: every lot is built as a precedent from the typology library (`docs/typologies.md`),
chosen for its programme and the site's climate and taken to the density the genes ask for.

- **A lot** is a block's building plots of one programme (`programme.ts`): a block's homes are
  one lot, a school in the same block another, so the school is built as a school.
- **Candidates** are the library's building precedents for the programme (no ponds, terraces,
  pits, canopies or houses on water), best answer to the site's climate challenges first
  (`typology/challenges.ts`; since 31 October, not nearest climate: user), taken in turn from
  each family of arrangement so courts, yards, rows and tall types are all tried. The library
  has no clinics and no treatment plants with buildings: health takes education's and culture's
  precedents, sewage and waste take waste's and industry's (assumed). The first `CANDIDATES` (8)
  whose tile fits the lot are tried.
- **Variants** (B7, 31 October; `plan/ranges.ts`): each candidate is also tried shrunk to fit
  (fewest units in a row and rows) and with deeper units (depth at the top of its range), at
  every storey count; a variant costs `VARIANT_W` against the precedent as built. A measured
  layout over its FAR or coverage cap by more than 10% (one tile too big to thin) is left out.
  One plot's search (`massing/precedent.ts`) varies every setting; here three fixed variants keep
  typing fast enough for every design.
- **Laid out:** the precedent's seed is built by the grammar and its plot (with half its street)
  tiled over the oriented box of the lot's plots, turned where more tiles fit; each building is
  clipped to the plots, and a building with less than 60% of its footprint on the land is left
  out rather than cut to a sliver. A building the land doesn't cut keeps its precedent's roof
  in the 3D view (gable, mono, vault, cone, dome).
- **Drift:** a precedent may be raised or lowered to any storey count the lot's caps allow.
  Raised past its own height, its court (or the street between its rows) widens to the new
  height, light at 45° to the ground floor, as the fixed types' rows had. Each lot reports its
  drift: storeys, court, street, from and to.
- **Choice:** every candidate at every storey count is first estimated (tiles that fit times the
  precedent's floor area, as if the land filled its box), thinned to the plot rules' coverage
  and FAR; the best three by score are laid out and measured, and the best measured wins. The
  score: the gene for the precedent's family, plus Martin and March's prior for courts at FSI 1
  and over, less 6 times the relative miss of the wanted FSI (density all but a constraint, as
  asked on 28 October), 0.25 per noticeable step of climate difference and 0.15 per doubling or
  halving of the precedent's height (weights assumed).
- **The type genes** of genome 3.1 are now preferences for four families of arrangement: round a
  court (court, ring), round a shared yard (cluster), rows (row, shed), slabs and towers (slab,
  tower). Towers keep their limits: at a node, where nothing lower reaches the density, at most
  two on the site.

Six random designs a site, against the fixed types on the same designs:

| site | FSI asked | given (fixed types) | given (precedents) | floor area, fixed / precedents | climate (steps) | typing a plan |
| --- | --- | --- | --- | --- | --- | --- |
| Bengaluru | 0.94 | 1.10 | 0.93 | 80 / 70 ha | 0.67 | 143 ms |
| Wadaj | 2.44 | 2.12 | 2.10 | 292 / 292 ha | 0.47 | 299 ms |
| Wadaj (quad) | 2.49 | 2.16 | 2.17 | 292 / 297 ha | 0.45 | 229 ms |
| Mumbai Docks | 1.79 | 1.71 | 1.50 | 36 / 34 ha | 0.60 | 45 ms |
| Mumbai EWF | 2.11 | 1.94 | 1.69 | 98 / 90 ha | 0.60 | 99 ms |
| Guwahati | 2.51 | 2.17 | 2.04 | 203 / 199 ha | 0.96 | 171 ms |

No lot's massing is off its promise by more than 10%: the choice measures the same layout the
3D view draws. Bengaluru now gets what was asked (the fixed types over-gave). On the dense sites
the precedents fall short where the fixed types had towers (about one a design, none now: few
tower precedents are near these climates) and where courts widen with height. Precedents used
most on Bengaluru: the vatara (28% of typed land, raised from 1 to 2.6 storeys on average),
Chettinad houses (23%), Padmanabhapuram (11%), Malleswaram's rows (8%), the agraharam (6%).

What the dense sites show: to reach FSI 2 and more, single-storey courtyard houses are raised
to eight storeys and more (thotti-mane 1 to 8.7 on Mumbai, sangath 1 to 6.5 on Wadaj). The drift
readout says so per lot; whether a precedent so far from its own height is still that precedent
is open (a cap on drift is one answer, a denser precedent another).

Not yet: crossing two precedents (a hybrid), drift in unit sizes and counts (only storeys, court
and street move), water and waste precedents without buildings (ponds, wetlands) for the sewage
and waste lots, and the Massing step's search starting from the lot's precedent.

## Buildings, not pieces (30 October)

`app/engine/plan/blockmass.ts`, `clipper.ts`, `precedents.ts` (`maxStoreys`). Screenshots of the
massing showed odd extrusions: thin fins, seams, saw-tooth tops, buildings cut at angles. A
count over random designs found 38% (Bengaluru) to 81% (Guwahati) of drawn masses under 6 m
wide and more than twice as tall as wide. The causes and what changed:

- **Every unit was its own block.** A row's shared-wall houses and a court's wings were separate
  boxes pressed together (seams, flickering faces). Now the solids of one base and height that
  touch are joined into one outline (Clipper, on whole millimetres): a terrace is one building, a
  court house one ring round its court, drawn with the court as a hole.
- **A well was drawn as fins.** A pol's or a tube house's chowk was a front block, a back block and
  one side wing 0.7 to 1.4 m wide. The grammar now puts a wing on both sides, so the well is a
  court closed on four sides, and the joined outline has it as a hole.
- **Plot lines and the land's edge sliced buildings.** Each building was clipped to every plot it
  crossed. Now a lot's plots are joined into one outline first, so the lines between them cut
  nothing; at the outline a building is trimmed by whole units or wings: a unit stays where 85%
  of it is on the land (its overhang cut off), the rest are left out, and a terrace of houses
  under 6 m wide trimmed to one house is left out rather than standing as a fin.
- **Raised without limit.** A one-storey court house could be drawn nine storeys tall on 4 to 6 m
  wings. Now a precedent is raised to at most twice its own height (one storey more for a
  one-storey precedent), and no taller than 2.5 times the depth of its wings, rows or units (a
  free-standing house by its narrower side). Both numbers are assumed until each type has its
  own ranges (next: typologies as ranges of their features).
- **Measuring stays fast.** Choosing a type needs floor areas, not outlines, so the choice reads a
  trimmed building's area from its units; the exact outline is cut only to draw. Typing a plan
  takes as long as before.

Afterwards, fins are 2 to 11% of masses (Wadaj highest: haveli wings), and the precedents give
less floor area where they had been raised past these limits. Six random designs a site:

| site | FSI asked | given before | given now | typing a plan |
| --- | --- | --- | --- | --- |
| Bengaluru | 0.93 | 0.93 | 0.85 | 225 ms |
| Wadaj | 2.43 | 2.10 | 1.49 | 497 ms |
| Mumbai Docks | 1.77 | 1.50 | 1.16 | 59 ms |
| Mumbai EWF | 2.11 | 1.69 | 1.27 | 144 ms |
| Guwahati | 2.52 | 2.04 | 1.41 | 289 ms |

The shortfall on the dense sites is what the old drawings hid by stretching vernacular houses
upward. Reaching those densities honestly is the next step's job: each type's features (height,
voids, staggers, openings, unit sizes) given ranges from case studies, evolved per lot and by a
few site-wide genes toward the site's climate, and hybrids of two precedents where no single one
reaches the lot's density and climate within its ranges. Still not done here: laying rows along
the street rather than along the lot's bounding box.

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


### Challenges, variants and families at urban scale (B7, 31 October)

Types survey, 8 random version 3.1 designs a site (`npm run types-survey -- --n 8`), FSI given
over typed land: before (nearest climate, as built); by challenge with variants and families;
and with the small local nudge the user chose (31 October: `LOCAL_W`, a quarter of the old
climate-likeness weight, in both the candidates' order and the score).

| Site | FSI asked | Before | By challenge | With local nudge | Homes lead with (nudged) |
|---|---|---|---|---|---|
| Mumbai EWF | 2.01 | 1.21 | 1.43 | 1.38 | Chettinad, Hoi An, Golconde, pol, nalukettu |
| Ahmedabad Wadaj | 2.28 | 1.44 | 1.61 | 1.58 | pol, tube house, IIM Ahmedabad, Golconde |
| Mumbai Docks | 1.66 | 1.09 | 1.26 | 1.24 | Chettinad, Hoi An, nalukettu, Golconde |
| Bengaluru cascade | 0.94 | 0.86 | 0.89 | 0.88 | pol, Padmanabhapuram, Chettinad, Oaxaca patio |
| Guwahati Bharalu | 2.35 | 1.39 | 1.46 | 1.46 | Chettinad, Padmanabhapuram, Hoi An, chang ghar |

Lots no precedent fits: 2-6% before, 0-2% after. With the nudge, Ahmedabad's own pol and tube
house lead again (climate distance 0.65 steps, from 1.15), Bengaluru's courts return (32% of
lots), Guwahati's chang ghar appears; Mumbai's chawl still doesn't (its mechanisms, shared
ground and cross ventilation, answer less of Mumbai's heat, rain and monsoon than the Chettinad
house's). Rows are chosen on 63-80% of lots. Typing takes 100-800 ms a plan (70-640 before).

## Nature on every lot (2 November)

`app/engine/plan/lotnature.ts`, `blockmass.ts` (`usableOpen`, `lotGround`), `blocktypes.ts`,
`grow.ts`, `fitness.ts`. The user (2 November): limit nature by the land and the catchment,
and score how well a lot's form serves the climate together with its programme; that is what
makes a type a programme's own.

**The programme's open ground first.** Each programme asks for open ground of a kind
(`OPEN_NEED`), in pieces big enough to use (`PIECE`):

| Programme | Open ground | Share of the lot | Least piece | Source |
|---|---|---|---|---|
| homes, shops (health, culture assumed alike) | garden or playground, trees in it | 15% from 1,001 m², 20% from 2,501 m², 25% above 10,000 m² | 7.5 m across, 125 m² | Mumbai DCPR 2034 Reg. 27(1), read; Guwahati asks 20%, read |
| schools and colleges | playfield, clear | 50% | 18 x 36 m | URDPFI 2014 Tables 8.48-8.49, read |
| industry | garden | 15% from 1,000 m² | 7.5 m, 125 m² | DCPR 2034 Reg. 27(2), read |
| waste yard | working yard, clear | 30% | 12 m, 300 m² | assumed |
| sewage plant | treatment wetland | (all its open ground) | | design |

What counts is measured on each option's layout (`usableOpen`: the free ground on the land's
2 m grid opened by a disc of half the least width, pieces under the least area dropped), so a
court narrower than 7.5 m, a setback strip or a lane between rows doesn't count. The grid reads
widths to within a cell.

**Then nature, by the climate's challenges, on what is left.** No genes: nothing in the site's
scores charges for a pond, a tree or a planted roof, so a gene would run to its top.

- *Ponds*: 5-10% (more where rain or monsoon matter) of the ground whose rain reaches the lot
  first (each cell counts for the first lot down its flow path; rain reaching a park or water
  first is held there), never on the programme's pieces. A sewage plant's open ground is all
  wetland.
- *Trees*: 30-60% (more where heat matters) of the dry open ground, and of a garden; not on a
  playfield or a yard.
- *Planted roofs*: up to half the roofs where rain or heat matters.

**Scores.** The site's storage score adds what the lots' ponds (0.6 m), trees and planted roofs
hold (the plot's run-off coefficients over its 75 mm storm); its heat score reads ponds as
water, trees and planted roofs as landscape, taking paving first. Lot typing adds, per measured
option, `OPEN_W` (1) times the share of the programme's open ground missing and `NATURE_W`
(0.25) times the share of the climate's work its ground and roofs do (rain held and ground
under trees or water, averaged). Both weights assumed.

**Survey** (`npm run nature-survey -- --n 6`):

| Site | FSI given (before) | Ponds / trees, of typed land | Storage without, with | Heat without, with | Homes get | Schools get |
|---|---|---|---|---|---|---|
| Mumbai EWF | 1.51 (1.51) | 14% / 23% | 1.11, 1.22 | 1.44, 0.81 | 96% | 75% |
| Ahmedabad Wadaj | 1.70 (1.72) | 14% / 25% | 1.47, 1.62 | 1.58, 0.90 | 95% | 70% |
| Mumbai Docks | 1.42 (1.42) | 14% / 23% | 1.11, 1.23 | 1.38, 0.77 | 96% | 65% |
| Bengaluru cascade | 1.06 (1.07) | 8% / 25% | 1.49, 1.57 | 1.40, 0.91 | 93% | 61% |
| Guwahati Bharalu | 1.61 (1.63) | 15% / 19% | 2.01, 2.21 | 1.54, 0.93 | 97% | 75% |

Read plainly: homes find their gardens; schools find only 61-75% of their playfields, since
an 18 x 36 m clear field rarely survives at these densities (a finding, not a fault of the
measure); waste yards often find under a quarter. Density barely moves (0-2%). Ponds and trees
halve the heat score, which leans on the heat model's surface numbers (water -2 °C,
landscape +0.5 °C), not on a shade model; storage rises 5-14%. Precedents shift a little toward
layouts that leave whole yards (IIM Ahmedabad, Golconde). Growing a design takes 17-25% longer
(the open ground measured on three layouts a lot).

Not done: ponds placed by the lot's own low ground (they go where the open ground is widest);
programme open ground at site scale (a school's field across a street from it); a shade model
for trees at site scale; usable ground in the readouts and the explore page.

## Public ground by rule (3 November)

Part C, step P3 (architecture-v3 section 14.4). Shared ground used to be chosen by size and walk
only. Each open space is now placed for a job, recorded with its rule and its family
(`plan.shared.spaces`), and the water it holds is counted (`plan.shared.water`).

1. **Water first.** Rain is followed down the landform's flow directions until it meets open
   ground or water (`gathered`). Where the rain of 3 ha or more runs through building land, the
   plots of that block nearest the point become a water space: a basin (0.9 m deep) where
   15 ha or more gathers, else a lowered field (30 cm, Japan's schoolyard limit). The storms
   come in a chain: each lot's ponds hold the 10-year storm (lotnature.ts), so a water space
   holds what the 100-year storm brings beyond it (120 mm against 75 mm, the 100-year assumed at
   1.6 times the 10-year), and fills only when the lots overflow.
2. **Squares** at the busiest junctions as before; a water square (the library's Benthemplein
   shape) where 1 ha or more gathers at it, else a shade square.
3. **Parks** by the URDPFI hierarchy as before; each a basin where rain gathers in it, else a field.
4. **Every door.** A small open space (125-1,500 m², one plot) within 100 m of every building
   plot, the plot that brings the most plots within the walk first. Measured between plots'
   centres, since such a space is smaller than a grid cell (the old doorstep measure counted
   only cells, so it read 56-80% where the rule now gives 100%).
5. **Schools' fields across the street** (after programme): a school given less land than
   URDPFI asks takes the playfield its own land can't hold on the home plots across a local
   street, and its lot no longer counts that field as its own need.

Survey (4 random version 3.1 designs a site, the same seeds before and after):

| Site | Floor area | Water spaces (ha) | Holds (m³) of its need | Doorstep spaces | Fields across a street (ha) | Rain still leaving over building land (ha) |
|---|---|---|---|---|---|---|
| Mumbai EWF | 72.4 -> 66.2 ha (-9%) | 5.7 | 16,800 of 18,100 | 28 | 0.6 | 15 |
| Ahmedabad Wadaj | 182.7 -> 170.3 (-7%) | 5.0 | 13,800 of 14,500 | 68 | 1.9 | 44 |
| Mumbai Docks | 23.8 -> 21.9 (-8%) | 1.6 | 5,300 of 6,800 | 13 | 0.4 | 7 |
| Bengaluru | 64.0 -> 61.1 (-4.5%) | 2.1 | 5,100 of 5,300 | 42 | 0.8 | 33 |
| Guwahati | 144.8 -> 131.3 (-9%) | 6.0 | 16,900 of 17,900 | 54 | 2.2 | 12 |

Water spaces sit low: the median one at the 6th (Bengaluru) to 42nd (Guwahati) percentile of the
site's ground height. Growing a design takes the same time.

**The cost is 4.5-9% of the floor area**, from the water spaces, the parks' families and the
school fields; the doorstep spaces cost little, since most are smaller than a cell. Under the
default for Q3 (rule-placed public ground is fixed, buildings fit round it) nothing moves the
lost floor elsewhere. Still open: rain from catchments under 3 ha that leaves the site over
building land (its 10-year share held on the lots, its excess not); doorstep spaces smaller than
a cell take no floor area off the cells they sit in, so their cost is undercounted; a school's
field on its own lot and across the street don't add up exactly to URDPFI's half.

## Streets as a system (3 November)

Part C, step P4 (architecture-v3 section 14.5; `app/engine/plan/streetroles.ts`). Streets used
to take one of five IRC:SP:118 sections by width. Each street now has a role, read from two
things, and a section laid out for that role and the site's climate within its width.

- **Link** (how much it carries): its class. The router lays secondary streets on the routes
  between destinations and primaries on the skeleton, so class stands for through-movement; a
  dead end carries nothing through. (The plan named space syntax's choice; it is measured only
  when a design is scored, after the plan is grown, so class stands in.)
- **Place** (how much it is a place): a point each for an active frontage, a public space on
  it, shops or services on a third of its plots, a school or a bus stop.
- **Role**, after the Global Street Design Guide's types (GDCI and NACTO 2016, chapter 10):

| Role | GSDG type | When | Speed |
|---|---|---|---|
| Laneway | Laneways and alleys | a dead end that is a place | 10 km/h |
| Shared home street | Residential shared street | a local street with two place points, no shops; a dead end that isn't a place | 15 |
| Shared shopping street | Commercial shared street | a local street with two place points and shops | 15 |
| Home street | Residential street | a local street | 20 |
| Park and water edge | Waterfront and parkside street | a local or secondary street on a green or lake edge | 30 |
| Main street | Neighbourhood main street | a secondary street with a place point | 30 |
| Avenue | Central two-way street | a secondary street with none, or a primary with one at most | 40 |
| Boulevard | Large street with transit | a primary street with two place points | 40 |

Speeds from GSDG's design controls (urban streets 40 km/h at most; 10-15 km/h where people walk
in the motorists' space; 20 km/h where people cross anywhere); the speeds per role are our
reading of them. A street between a school and its playfield across the street reads as a
shared home street (school and public space), as Q2's default asked.

**The section.** Lanes first (3.0 m each, GSDG), the most that leave the role's least footpaths
(GSDG's clear path: 1.8 m on home streets, 2.4 m on commercial ones) and its tree strips (both
sides of main streets, avenues and boulevards, one side of home streets and park edges; a
strip of 1.5 m holds trees), then planting, more where the climate is wet or hot, then wider
footpaths. In a wet climate planting is a swale or a rain-garden planter (Portland's planters
0.9 m and swales 2.4 m at least). Shared streets are one surface with no kerb, planted at the
edges. On Bengaluru an 18 m avenue is 3.8 m footpath, 2.2 m trees, two lanes, 2.2 m trees,
3.8 m footpath: two lanes, not four, so the trees fit.

**Overflow streets.** A street whose samples mostly drain to one another along the landform,
carrying the rain of 8 ha or more, carries the big storm: its carriageway falls to the swale and
it gets a metre more planting. 1-3% of street length on the sites.

On the five sites (3 designs each), by length: park and water edges 21-27%, home streets
16-25%, shared home streets 13-21%, laneways 7-13%, main streets 8-13%, avenues 4-10%,
boulevards 4-9%, shared shopping streets 2-5%. Explore has a Streets layer; the inspector draws
a section per role and width.

Not done: the sections are set by rule, not yet evolved within each role's ranges (P5); a
street's height to width and its angle to sun and wind are not read; 12 m main streets and
avenues have no room for tree strips beside two lanes (trees would go in footpath pits, not
drawn); GSDG's own section dimensions were not readable online, so the role ranges are ours.

## Public spaces shaped, and public ground scored (3 November)

Part C, step P5 (architecture-v3 sections 14.6-14.7).

**Each space's form** (`app/engine/plan/publicform.ts`). Placement stays by rule; the shape is
searched within its family's genes (typology/openshape.ts): it starts from every library
precedent of the family read into the genes, keeps the best, then mutates one or two genes at a
time (40 steps, seeded by the space). A space is asked to hold what it was placed for (twice
the weight of anything else), to stay usable when full, to give steps low enough to sit on, to
be shaded where heat matters, and, at the door, to be enclosed between 0.8 and 2 times its width.
A school's field stays within Japan's 30 cm. A field's water now rises only as high as it must,
so a deeper field keeps its banks dry: the share of water spaces usable in a storm went from
0-3% to 12-21%. Each space records its shape, the precedent it grew from and its measures.

**The storm is the site's own.** Water spaces now hold the site's design storm (site.yaml: a
heavy monsoon day, the storage score's storm: Mumbai 200 mm, Bengaluru and Ahmedabad 150,
Guwahati 110) past the lots' 75 mm, not an assumed 120 mm, so the public ground and the storage
score agree. On the same seeds, floor area against before part C: Mumbai EWF -13%, Docks -11%,
Wadaj -8%, Guwahati -8.5%, Bengaluru -5%. Mumbai's rose with its 200 mm storm.

**Scores** (`app/engine/metrics/publicground.ts`, in the measures list), stand-ins for Gehl's
criteria and NACTO's guidance, said so on each:

| Score | Gehl / NACTO | Five sites (3 designs each) |
|---|---|---|
| storm held in public ground | protection | 91-100% |
| public ground usable in a storm | protection | 12-21% |
| places to sit (m of step per ha of public space) | sitting | 360-690 |
| shade on streets, hot afternoons | good climate | 44-58% |
| doors on public spaces | standing and staying | 24-57% |
| tree canopy (3-30-300's thirty) | | 13-15% |
| safe to walk (GSDG clear path or a shared street) | protection from traffic | 100% |

Street shade is a site-scale model: for each street, the hot-season suns (March to May, 14:00
to 17:00, the massing scores' HOT), the buildings on the sun's side throw shadow across it by
their plots' storeys, and street trees shade their strip and 2.5 m each side at 80%. Removing a
water space lowers the storm held; removing street trees lowers the canopy; taller buildings on
the sun's side and street trees each add shade (tests).

Growing a design takes no longer than before part C (Mumbai EWF 515 against 536 ms a design,
stage by stage): the doorstep rule's greedy now runs on a heap.

Weak spots: canopy cover is low (13-15% against 3-30-300's 30%): the lots' trees, the public
spaces' and the street trees together; safe to walk is 100% by construction (sections are laid
out to the clear paths), so it only catches streets too narrow for them; doors on public spaces
reads building plots near a space's edge, not doors.

## Public ground in the workbench (4 November)

Part C, step P6. Explore has a **Public ground** layer: every space the rules placed, coloured by
its family (water spaces in blues, green ground in greens, shade and doorsteps warm), the streets
that carry the big storm, and the seven public ground scores in its legend. A **storm slider**
(a day's rain, 0 to 1.25 times the site's design storm) runs the storm chain
(`app/engine/plan/storm.ts`): the lots' ponds fill to 75 mm; past it the lots overflow, the
overflow streets turn to water and the public water spaces fill in proportion to what they were
placed to hold, full at the site's design storm; a space that holds less than its share spills
on. The slider works on the plan and in 3D, where the public spaces are tinted by family, shaded
ones carry trees, streets show their roles' sections, and the storm's water stands in the spaces
as translucent slabs as deep as their water (heights exaggerated), without rebuilding the scene.

Two fixes found on the way: a space placed for water now holds what it can before anything else
(a square that couldn't hold its share had traded its water away to stay usable), and a junction
square sinks no deeper than 3 m (one had become a 13 m stepwell on a 262 m² corner).

A bug found by the browser check: step 5's street shade imported the massing setup for the
site's sun, which closed an import cycle (the plan -> massing setup -> genome -> evolution ->
fitness -> the plan). Node resolved it; the browser's grower worker did not, and failed to load,
so runs stalled at generation 0 while every Node test passed. `whereOf` now lives in
`massing/sun.ts`, which imports nothing, and `test/imports.test.ts` fails on any new import cycle
in the engine (three old ones, known to load, are listed).
