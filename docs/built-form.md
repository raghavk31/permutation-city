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
| 2 Streets, frontage | a frontage type per street segment | every design | to come (section 4) |
| 3 Shared ground first | lake edge, valley corridors, squares, open-space hierarchy | every design | to come (section 4) |
| 4 Building type per block | the block's type as coverage, storeys and floor area | every design | to come (section 5) |
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
| 75 m (design default) | 186 ha | 142 ha | 591 ha | 69% |
| 30 m (the law only) | 228 ha | 173 ha | 591 ha | 61% |

The brief (FAR 2.0 over the 295.5 ha of design ground left by the legal buffer, assumed) is
about three times what the plots can hold. The reason is the one found on 26 October
(`architecture-v3.md` 12.2): FAR in Bengaluru applies to a plot, not to the whole site. Once
streets, the lake edge, valleys and parks are taken out, the plots are a fraction of the
ground, and FAR 1.75-3.25 on that fraction can't reach 2.0 over the whole.

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

## Steps 2-9: references to check

Figures from books go in as **assumed** with the secondary source named until a copy is read
(decision 7). The ones the next steps will lean on:

- Open-space hierarchy and sizes: Charles Correa, *The New Landscape* (1985).
- Block types as coverage, storeys and floor area: Berghauser Pont and Haupt, *Spacematrix*
  (2010).
- Alexander, *A Pattern Language* (1977): 21 Four-Story Limit, 107 Wings of Light, 115
  Courtyards Which Live, 122 Building Fronts, 159 Light on Two Sides of Every Room
  (`docs/alexander.md`).
- Daylight depth and room sizes: Bye-laws 2003, 20.1 and 20.11 (read, above).
