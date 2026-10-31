# Permutation City: built form brief (plotting, building types, massing, voids)

(Given 2026-10-26, with the addition to section 5 that followed it. The plan in answer is
`docs/architecture-v3.md` section 12.)

Read this whole brief, then docs/architecture-v3.md (sections 7-11), docs/research/claim.md, docs/streets.md, docs/massing.md, docs/alexander.md, and the Milestone A plan in section 11. Re-plan first (section 9). Don't build until I approve.

## 0. Why this brief

The massing step produces walls, towers and blobs, not buildings. Looking at the Bengaluru tank cascade site:
- The brief asks for too much: block 206 must fit 46,505 m² on 0.86 ha (FSI about 5.4), so plots get 15 storeys at 80% cover.
- Buildings are plot shapes pushed up: 30-40 m deep, no courtyards, no gaps, interiors with no light or air.
- Side setback 0 at 15 storeys (assumed), so neighbouring plots fuse into continuous walls.
- The tallest buildings stand on the lake edge, ignoring the site's main feature.
- Voxel field and Network produce boulders, ribbed walls and thin pillars with no floors; the repair step is doing most of the design (e.g. 1,705 voxels dropped, 2,340 thinned).
- Plots are box-split strips and slivers.
- The labels contradict the forms ("most human in scale" is 15-storey slabs).

The root problem is the order of work. Today: cut blocks into plots, fill each plot with as much volume as the brief allows, repair what breaks. The references below all argue the opposite: public space first, buildings placed to shape it, plots drawn last, and form coming from forces acting on the site and from how people live in it.

## 1. References (read, cite in docs/built-form.md, and check every number against its source)

- **Christopher Alexander.** Generative codes and "unfolding": the order of steps decides the result; public space comes before buildings; building fronts are placed to make positive outdoor space; plots are surveyed after layout, not before. Patterns to use: Four-Story Limit (21), Positive Outdoor Space (106), Wings of Light (107), Courtyards Which Live (115), Building Fronts (122), Light on Two Sides of Every Room (159). Plus the Nature of Order properties already in docs/alexander.md, applied at building scale.
- **Frei Otto, Occupying and Connecting (2009).** Distancing and attracting occupations (his floating-magnet experiments), territories formed around occupied points, path systems. Also IL publications, Eda Schaur's IL 39 on unplanned settlements, and form-finding (dynamic relaxation) for light roofs and canopies.
- **Neri Oxman, Material-based Design Computation (MIT PhD, 2010) and material ecology.** Properties before shape: structure material properties as a function of environmental performance, with continuous gradients rather than assembled parts.
- **Leslie Martin and Lionel March, Urban Space and Structures (1972).** Pavilions, streets and courts compared at equal floor area: court forms hold the same floor space at about a third of the height.
- **Berghauser Pont and Haupt, Spacematrix (2010), and Steadman (2014) linking it to Martin and March.** FSI, ground coverage (GSI), height and open space ratio together place a block within a family of building types.
- **Charles Correa, Belapur incremental housing (1983-86).** Open-to-sky space as a room; a hierarchy of open spaces from private court to cluster court (about 12 x 12 m for 21 houses) to community space (about 20 x 20 m); free-standing units for cross-ventilation; low-rise, around 500 people per hectare.
- **B.V. Doshi, Aranya, Indore.** Serviced plots with cores; mixed plot sizes across income groups within each sector; roads and services laid to follow topography for gravity drainage.
- **Vanegas et al. 2012, "Procedural Generation of Parcels in Urban Modeling".** Skeleton subdivision for irregular blocks, OBB for regular ones. **Chen, Song and Ortner 2024, "Hierarchical Co-generation of Parcels and Streets".** Plots and streets generated together give regular, reachable plots.
- **Local rules:** Bengaluru Revised Master Plan 2015 zoning regulations, BBMP Building Bye-laws (latest), Karnataka fire safety requirements, URDPFI Guidelines 2014. Find the current legal lake buffer for Bengaluru tanks (the RMP figure, and how court and tribunal orders since 2016 have affected it) and say how confident you are.

## 2. New pipeline order

Replace "plots, then fill" with this sequence. Each step reads the result of the steps before it.

1. **Rules and brief** (section 3)
2. **Streets** (as built, plus frontage types, section 4)
3. **Shared ground first** (section 4)
4. **Building type per block** (section 5)
5. **Place buildings** (section 6)
6. **Draw plots around them** (section 6)
7. **Shape the buildings** (habitability, section 7)
8. **Voids** (section 8)
9. **Score** (section 10)

Document this in docs/built-form.md with the reference behind each step.

## 3. Rules and brief (first)

- Replace the assumed brief with real figures for the Bengaluru site: permissible FAR by zone and road width, maximum ground coverage, height limits, and setbacks by building height and road width, from the RMP 2015 zoning regulations and BBMP bye-laws. Every number sourced; anything unconfirmed marked "assumed".
- Fire access: open space around taller buildings as the rules require.
- Lake buffer: the current legal figure, plus a design setting for a wider buffer. Inside the buffer, no buildings; it's shared ground.
- If the brief's floor area can't fit the site under the real rules, say so plainly in the UI and by how much, rather than forcing it.
- Repeat for the other sites where the corpus allows (Ahmedabad CGDCR, Mumbai DCPR 2034, Guwahati bye-laws). Bengaluru first.

## 4. Streets and shared ground

**Streets** (finish the current work, then add):
- A cross-section per street class (footpath, trees, carriageway, swale), drawn and applied in 3D.
- A frontage type per street segment: active (shops at ground), residential, green edge, lake edge. Buildings read this when placed.

**Shared ground before buildings:**
- Reserve, in this order: the lake buffer and tank edges; valley corridors and drainage lines; a square at each important junction (high choice or integration, from the space syntax work); then a hierarchy of open spaces down to cluster courts (Correa's scales as defaults, settings to change them).
- Shared ground is a layer with its own outline; buildings may front it but not occupy it.
- Score: share of households within a short walk of each level of open space.

## 5. Building type chosen per block

- For each block, from its target density, ground coverage limit, height limit, setbacks and shape, find the feasible building families using the Spacematrix relationships: courtyard block, perimeter block, row housing (streets), clusters around courts (Correa), pavilions, podium with towers.
- Default preference at medium and high density: courtyard and perimeter blocks (Martin and March). Towers only where justified (a landmark at a node, or density the low forms can't reach) and a limited number per site.
- The family is a gene the search can vary within the feasible set.
- Each family has rules for plot shape, building depth, spacing and height. Store them in one documented place.

Addition to section 5 (building types):
- Two levels. The building type is chosen per block from the feasible set; parameters evolve within each type. Never cross parameters between types.
- Run each feasible type as its own island with its own Pareto front, so one type can't eliminate the others early. Alternatively, use MAP-Elites with type as one archive axis; tell me which you prefer and why.
- Parameters per type, bounded by the section 7 habitability rules so every variation is buildable without heavy repair. For example: courtyard (court width and length, wing depth, corner treatment, breaks for breezeways); perimeter block (depth, height steps, gaps); row housing (unit width, row spacing, orientation); clusters (court size, units per cluster); podium with towers (podium height, tower count, footprint, spacing).
- One main type per block, with variation between plots inside the type's parameter ranges. No mixing types within a block in Milestone A.
- Evaluate each block's massing with its neighbouring blocks present, so shade, wind and lake views account for them.
- In the Massing step, show the best design of each feasible type side by side with its key scores, so the designer compares types first and then explores variations within the chosen one.

## 6. Placing buildings, then drawing plots

**Placement** (Otto's occupying, simplified for Milestone A):
- Buildings are placed along street frontage and around the edges of shared ground first (Alexander's building fronts), so outdoor spaces get edges.
- Buildings push apart to keep light, privacy and fire spacing, and pull towards frontage, corners and each other into clusters.
- Milestone A: a rule-based placement along frontages with spacing rules. Milestone B: a particle simulation of distancing and attracting forces (section 11).

**Plots drawn after placement:**
- Plots are the territory around each building, clipped to the block, with every plot fronting a street.
- Use skeleton subdivision for irregular blocks and OBB for regular ones (Vanegas et al. 2012). No slivers or wedges: set minimum width, minimum depth and maximum depth-to-width ratio, and merge or reshape plots that fail.
- Mixed plot sizes within each block (Aranya); corner plots handled as a type of their own.
- Plots follow the land: they step with the slope, drainage runs by gravity, nothing sits on a drainage line.
- The plot table in the Massing step shows the plot type and which rule set its size.

## 7. Habitable buildings (hard rules)

- **Depth:** a maximum depth from facade to facade so every room gets daylight and cross-ventilation (Wings of Light, Light on Two Sides). Propose defaults by building type and justify them.
- **Floors:** real floor-to-floor heights (ground floor taller where frontage is active), a structural grid, and a core per building sized by floor area and height.
- **Spacing:** minimum distance between buildings tied to their heights and to the bye-law setbacks.
- **Height:** a default ceiling (Four-Story Limit as the starting point, raised where density or bye-laws justify it), with any taller buildings flagged and counted.
- **Response to the site:** buildings step down towards water and shared ground and rise away from them; heights taper at the lake edge.
- **Ground floor:** active uses where the frontage type says so; stilts or a raised plinth where flood depth says so.
- Violations are reported, never silently repaired into odd shapes. If repairs exceed a threshold, the design is penalised.

## 8. Voids (derived from fields, not cut at random)

Milestone A:
- **Courtyards:** sized so sun reaches the court floor for a set number of hours in winter, and shade covers it in hot-season afternoons. Court width relative to building height is the control.
- **Breezeways:** gaps through blocks aligned to the prevailing wind (from the ERA5 data), so air moves through the block.
- **View corridors:** gaps that keep views to the lake from the streets behind.
- **Raised ground:** stilts or open ground floors where flood depth requires.

Milestone B:
- Sky courts and roof terraces in taller buildings.
- A general field method (Oxman): combine sun, wind, heat, flood, view and noise fields into an "openness" field per block; voids and porosity follow it.

## 9. Re-plan first

1. Estimate sections 3-8 and 10 in days, against the schedule in architecture-v3.md section 11 (feature complete 17 November, no checkpoints 13-16 November).
2. This work is more important to the demo than some planned items. My priorities, high to low:
   1. Section 3 (rules and brief)
   2. Section 1 of the final-stretch plan (closing what's open)
   3. Section 4 shared ground first
   4. Section 5 building types
   5. Section 7 habitability rules
   6. Section 8 courtyards and breezeways
   7. Section 6 plotting fixes (skeleton splits, frontage, no slivers)
   8. Drawn constraints and editing
   9. A4 evaluation
   10. Stress tests
   11. Score maps and area statement
   12. Growing over time
   13. Context box
   14. Programme
3. Propose what to move to Milestone B to make it fit. Candidates I'd accept: the context box, programme beyond the rule-based version, growing over time in the workbench, plan export beyond GeoJSON.
4. A4 timing: these changes alter the urban scores, so the A4 runs must happen after them. Propose new dates for freezing scores and running the experiments.
5. Risks and questions for me.

## 10. Scores to add or change

- **Habitability:** share of floor area within the depth limit, daylight on floors (not just ground), share of units with cross-ventilation, sun hours on court floors.
- **Buildability:** regular structural grids, core provision, plots meeting the minimum dimensions, total repair applied.
- **Shared ground:** open space per person at each level of the hierarchy, and walking access to each.
- **Site response:** height near water versus away from it, buildings in drainage lines (should be zero).
- Hide any score that's identical across a whole run, such as "winter sun taken from neighbours" when it's always zero.
- Rename designs by what they actually do at the scale shown, so labels can't contradict the forms.

## 11. Milestone B (plan now, build after 25 November)

- **Otto's territories:** buildings as particles with distancing and attracting forces (light, privacy, fire spacing; frontage, centres, clusters), relaxed to equilibrium, with plots as the resulting territories. Compare against the rule-based placement.
- **Oxman's graded properties:** facade porosity and screening (jaali) varying with sun exposure, verandah and shade depth (chhajja) by orientation, and the openness field from section 8.
- **Otto's form-finding:** dynamic relaxation for light roofs and canopies over squares, markets and streets; hanging-chain vaults where they fit.
- **Voxel field and Network rebuilt on floors:** generate floor by floor, with a minimum thickness and width, the smooth skin as surface only, and a penalty for repair. Until then they're labelled "experimental" and Typologies is the default.
- **Plots and streets generated together** (Chen et al. 2024) instead of streets then plots.
- **The site as a system:** water from roof to street to swale to tank with each block's contribution measured; cool corridors; roofs for solar; valley floors for growing; and piecemeal growth as the main way of designing, where each step must strengthen the whole.
- **Building-scale beauty:** levels of scale (building, wing, bay, opening), boundaries (plinths, verandahs, parapets), rhythm of bays on facades, a consistent roof language, a limited material palette.

## 12. Quick fixes (do now, small)

- Street view camera: place it on the nearest street at eye height, looking along the street, never inside a building.
- Make "the design's other buildings" and "existing buildings" clearly different colours; hatch existing buildings whose heights are estimated.
- Fix the plot panel saying "no existing buildings near this block are mapped" when the 3D view shows existing buildings.
- Massing names: plain words instead of codes like "M7.121"; replace "beaten 87%" with something a viewer understands.
- Larger "What survived" thumbnails.
- The explainer card should collapse after "Got it".
- Voxel field and Network labelled "experimental"; Typologies the default.

## Ground rules (unchanged)
Small commits, one PR per item, tests green in both engines, preview deploys, seeded and deterministic runs, every number sourced or marked "assumed", estimates visibly marked, UI copy short with COPY: marks, no em dashes.
