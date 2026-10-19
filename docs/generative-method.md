# Generative method: lessons from earlier studios

Permutation City is built on methods already worked out by hand in two CEPT studios. This note records that vocabulary so the code uses the same words.

Sources:
- **Sem 06, Generative Techniques for Urban Place Making** (2020; tutors Radhika Amin, Arpi Maheshwari, Anuradha Ramchandani). Ahmedabad, Gandhi Ashram / Wadaj site, 1.45 km². `D:\Work\Academic-CEPT\Sem_06_Generative Techniques\00_Generative Techniques for Urban Place Making\sem 6\`
  - `evo-comp\evo-comp.-presentation\evo-comp-presentation.pdf`: Evolutionary Computation workshop (with Jaimin Bali and Ishita Singh)
  - `Raghav\Raghav-Final- Develop a livable neighbourhood which is resilient towards densification.pdf`: final, 63 pp
- **Sem 07, Every / Any / All / Some: Eco-machine** (2020; tutor Deepa Ramaswamy). Mumbai Eastern Waterfront. See the README.

---

## 1. Evolutionary Computation workshop (Sem 06)

A hand-run genetic algorithm on a 3D primitive.

| Term | Meaning in the workshop | Meaning in Permutation City |
|---|---|---|
| **Primitive unit** | a starting box (10 × 30 × 5) | a cell or block on the site grid |
| **Gene pool** | six operations A–F (twist, move/copy, rotate, polar array, mirror, scale) | the allowed moves and values, limited by the McHarg rules |
| **Genome** | an ordered string of genes, e.g. `CX1ABX2FD` | the parameter vector for one design |
| **Intensifiers** | `X1` (×1.5) and `X2` (×2) modifiers inside the genome | gene *strength* values: attractor radius, weight |
| **Body plan** | where the intensifiers sit (positions 1–4) | the fixed structure every genome follows |
| **Fitness criteria** | FC1 volume / surface area; FC2 height / base area; effective = (FC1+FC2)/2 | climate and program metrics; kept separate (Pareto), not averaged |
| **Ranking** | individuals ranked per criterion and on the average | non-dominated sorting |
| **Crossover** | single-point, 60/40 from the two parents | single-point and uniform crossover on the genome |
| **Breeding / killing strategy** | cross best with best and best with worst; kill the bottom | selection: tournament plus elitism |
| **New phenotype introduced** (G0.11) | an outsider added in Gen 2 to bring back variety | *immigration*: random newcomers each generation stop the population going stale |
| **Gene frequency analysis** | "B and D together give the best fit; A, C, E, F repeated give the worst" | per-run stats: which genes or values travel with fitness |
| **Normal distribution of fitness** | mean and standard deviation per generation | convergence chart: mean, best and spread per generation |

What it showed: by Gen 2, the population had collapsed onto a few genomes (Gen 2 repeated Gen 1's table). **Small populations converge fast and stop exploring.** Hence immigration, mutation, and a population larger than 10.

## 2. Final project: densification over time (Sem 06)

### 2a. Attractor density fields across time steps

Density was not drawn by hand. It came from **attractors with radii**, and the radii *changed over time*:

| | T(0) 2025 | T(1) 2035 | T(2) 2050 |
|---|---|---|---|
| Population | 65,873 | 92,921 | 155,676 |
| High-density attractors (bus/metro, junctions, TOD edge) | 100–150 m | 150–200 m | 150–250 m |
| Low-density attractors (swale + green, Gandhi Ashram, STP, Kalam Kush) | 100–150 m | 75–100 m | 50–100 m |
| Built mix (low / medium / high) | 45 / 31 / 24 % | 38 / 29 / 33 % | 33 / 24 / 43 % |

And **retained areas** (STP, Ashram, bioswale, Kalam Kush: 6.3 ha) were fixed and never built on.

For Permutation City:
- **Attractor radii and weights are genes.** This is the "evolve the attractors, not the cells" idea from the README.
- **Retained areas = McHarg's forbidden cells.**
- **Time steps.** A design is not one map but a *growth sequence* (2025 → 2035 → 2050). Fitness can be judged at each step, and climate shocks hit at a given year.
- High-density attractors *pull*, low-density ones *push*; both are needed.

### 2b. Networks

- Node-to-node connections by use (streets, residential, commercial, amenities, green, transit), then **bundled** into a foreground primary network
- Checked with **space syntax** (betweenness/choice)
- A **background** woven grid for other modes of movement

For Permutation City: v1 keeps streets as given or as a fixed grid. A later phase generates the primary network from attractor nodes and scores it with betweenness (the Climate Code ch. 07 logic).

### 2c. Typologies, pseudocode and block-level evolution

Primitives: **single courtyard, L, U, tower**. Example pseudocode (courtyard type):

1. Block 60 m side
2. Offset 12–18 m for the central court
3. Divide built area into unit cells of 3 / 4.5 / 6 / 7.5 m
4. Stack floor plates at 3 m (low 1–3, medium 3–5, high 5–8 floors)
5. Cull units to form voids (8 points; up to 8 at the corners, 6 in the middle)
6. Non-uniform scaling 1–1.5
7. Extrude

Genes: grid size, building depth (12–18 m), height (0–24 m), void position and number, scaling.
Fitness (8 criteria): maximise shade in the court, built volume, sun on the roof, height difference, open space on the ground and roof (and others).
Results shown as **Pareto fronts**, with most-fit and least-fit individuals side by side.

Finding: large unit cells give porous, accessible blocks with larger open spaces, suited to commercial and mixed use. Small cells give compact, close-knit blocks with community-scale voids.

For Permutation City: this is the **second scale**. v1 evolves the *site* (what goes where, how dense). A later phase evolves *blocks* inside each cell from a typology library, the way Sem 06 did. Two nested gene pools: site genome → block genomes.

## 3. Eco-machine (Sem 07)

- **20 m hex grid** (with a 40 m rectangular grid tried as well)
- **Streams as attractors** for spreading water across the land
- **Scale factor 0.3–0.9**, 252–480 units
- **Program by unit scale** (< 100, 100–350, 350–700, 700–850 m²)
- **Heights from sun and wind** (0, 1–3, 3–6, 6–10, 10–15 levels)
- Infrastructure programs **underground** (flood reservoir, water treatment, waste-to-energy, recycling), with **public programs on top**

---

## 4. Fitness as misfit (Alexander)

Christopher Alexander's *Notes on the Synthesis of Form* (1964) describes design as removing
misfits between a form and its context, rather than adding good qualities. Permutation City's
scores read that way:

| Score | The misfit it measures | Group |
|---|---|---|
| flood storage | rain the design can't hold | water |
| heat | surface heat the design adds | climate |
| daylight | floor area left in shadow | climate |
| embodied carbon | carbon spent per m² built | material |
| human scale | floor area above 8 storeys, building cells with no open space beside them | scale |
| floor-area gap | distance from the brief's target (a requirement, not a score) | brief |

Alexander groups requirements by how they interact, so that a change to one group disturbs
the others as little as possible. The groups above are a first guess. In each run, scores that
move together across the population are interacting, and showing that correlation matrix
(Phase 6) checks the grouping against the designs themselves. That is the book's own method.

Alexander later rejected the design-methods movement this book helped start (preface to the
1971 edition), and argued that good places come from many small steps, each fitted to what is
already there. Breeding whole designs at once is close to what he argued against. The
piecemeal growth mode (Phase 9) is the tool's answer, and `docs/alexander.md` sets out how each
of his works is used.

## 5. Valleys carry water, ridges carry movement (McHarg)

*Design with Nature* reads a site from its water: the valleys drain it and flood, and the
ridges stay dry and give the long views and the easy routes. Settlement that respects that
keeps the valleys open and puts movement on the ridges. Phase 6b makes this the frame every
design grows in (`docs/landform.md`):

- **As rules (fixed per site).** Water's paths are traced over the ground, with mapped streams
  and drains burned in. Valleys, with a buffer by stream order, are kept for drainage, storage
  and wetland: no buildings in the channel. The strong divides between catchments become the
  **primary streets**, joined to the existing roads. They cross a valley only at a counted,
  costed crossing. On flat land, where heights are noise, the valleys come from mapped water.
  Where there is none, as at the Mumbai port, the existing roads are the skeleton, and the
  page says so.
- **As genes (evolved).** Four street genes grow the finer streets inside that skeleton:
  - their spacing
  - their orientation: along the contours, parallel to the valleys, or on a bearing for wind
    and sun
  - their pattern: grid, loops, or branching. Dead ends are allowed but read as tree-like,
    after *A City is Not a Tree*.
  - their width

  Streets run on cell edges and take part of each cell they pass. Buildings rise a little
  where they front a street.

The Sem 06 densification work drew its networks by hand over the evolved fields (2b above).
Here the network is part of the genome, and the landform decides where its spine goes.

## Design decisions this leads to

1. **Genome = attractors + intensities + body plan**, not raw cells. Each attractor gene is (type, location, radius, weight, push or pull).
2. **Rules first.** Retained and forbidden cells never mutate (Sem 06 retained areas; McHarg).
3. **Fitness criteria stay separate**, shown as Pareto fronts, not averaged into one number (an averaged score hid trade-offs in the workshop).
4. **Population about 60, with elitism, mutation and immigration**, to avoid the early collapse seen in the workshop.
5. **Gene frequency and fitness distribution are logged every generation**, the same analysis as in the workshop, now automatic.
6. **Time steps** (e.g. 2025 / 2035 / 2050): designs grow, and climate shocks arrive at set years.
7. **Two scales:** site genome now, block or typology genome later.
8. **Naming kept from the studios:** individuals are `G{gen}.{nn}` (e.g. `G3.05`); runs are `Seq{n}`.
