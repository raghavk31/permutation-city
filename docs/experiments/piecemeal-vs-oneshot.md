# Piecemeal growth against one-shot design, at 2050

Phase 9 step 4, 2026-10-21. Does growing a site in three increments (`docs/piecemeal.md`)
give a better 2050 than designing it all at once?

**Answer: not on the five scores, and not on diversity. Piecemeal growth does somewhat
better on wholeness.**
- **Heat.** The piecemeal 2050 front is hotter on three sites and level on Bengaluru. More
  of its public ground overheats in a heatwave on all four (only just, on Bengaluru).
- **Flood storage.** Better on Eastern Waterfront, worse on Docks, about level on the two
  inland sites.
- **Wholeness.** The design actually built ends higher on wholeness than one-shot today's
  choice on all four sites, and higher than one-shot 2050's choice on three of the four.
  Wholeness across the whole front is mixed.
- **Docks.** On Mumbai Docks the method failed in every seed: no 2050 design got within the
  floor-area brief (the doubts below explain why).

**Version 3 (vector streets, 2026-10-22) gives the same answer**, with two changes: Docks now
meets the brief, and piecemeal growth now leads on daylight on all four sites. See
[Version 3](#version-3-vector-streets-blocks-and-plots) at the end.

**H4 (foresight, five sites, 25 October): not supported.** Growing in steps with foresight
ends hotter at 2050 than the better one-shot mode on all five sites, worse on flood storage
on three and under the 100-year rain on four, and far less diverse; it is ahead on
wholeness of the design built on three. Foresight changes little against plain piecemeal.
Dropping the wholeness objective lowers wholeness on four sites and buys nothing else. See
[H4](#h4-foresight-and-growing-without-wholeness).

Piecemeal growth earns its place as a way of working: a phased plan, with what each phase
adds scored under its own year. It doesn't earn it as a better optimiser.

## Set-up

- Run with `npm run piecemeal-vs-oneshot -- <site> --seeds <n>` in `app/`
  (`app/scripts/piecemeal-vs-oneshot.ts`). Settings: 15 generations of 40, seeds 1–3, the
  four demo sites.
- Every mode grows the same 1,920 designs:

| mode | what it is |
|---|---|
| piecemeal | 2025, 2035, 2050: three runs of 16 generations (Generation 0 plus 15) of 40, NSGA-III, SSP2-4.5 |
| one-shot today | one plain run of 47 generations of 40 (NSGA-II), scored under today's conditions |
| one-shot 2050 | the same, but every design is scored under 2050's conditions, as piecemeal's last increment is |

- Each mode's 2050 front is judged the same way. The front is rank 1 of the final
  population, limited to designs within the brief when there are any.
  - **2050 scores:** scored under 2050's sea, storm and heat (`scoreUnder`), as medians over
    the front, then over seeds.
  - **Wholeness:** exact (Rn integration, not the estimate), median over the front. "Built"
    is the design each mode would build: `chooseBuilt`, the best mean of the five scores.
  - **Diversity:** spread is the mean pairwise share of cells whose use differs. Families
    use `frontFamilies`' threshold.
  - **Shocks:** a 2100 high-end sea (SSP5-8.5), the site's 100-year one-day rain, and a
    +4.5 °C heatwave (`docs/shocks.md`). Shares, median over the front.
- Each cell of the tables below is the median of the three seeds. Arrows give the better
  direction.

## Results

### Ahmedabad Wadaj (inland)

| | piecemeal | one-shot today | one-shot 2050 |
|---|---:|---:|---:|
| front (on brief) | 14 (14) | 40 (40) | 40 (40) |
| wholeness, front ↑ | 0.454 | 0.418 | **0.471** |
| wholeness, built ↑ | **0.443** | 0.360 | 0.385 |
| storage, 2050 ↑ | 2.16 | 2.20 | 2.20 |
| heat, 2050 (°C) ↓ | 0.94 | **0.75** | 0.77 |
| carbon (kg/m²) ↓ | 401 | 400 | 400 |
| daylight ↑ | **0.93** | 0.88 | 0.90 |
| human scale ↑ | 0.79 | 0.79 | 0.75 |
| gap to brief ↓ | 0.079 | 0.065 | 0.065 |
| spread / families | 0.11 / 1 | 0.34 / 25 | 0.42 / 32 |
| 100-year rain: failed ↓ | 0.083 | 0.075 | 0.069 |
| heatwave: public ground overheated ↓ | 0.28 | 0.23 | 0.22 |

### Bengaluru tank cascade (inland)

| | piecemeal | one-shot today | one-shot 2050 |
|---|---:|---:|---:|
| front (on brief) | 29 (29) | 40 (40) | 40 (40) |
| wholeness, front ↑ | 0.459 | 0.466 | **0.473** |
| wholeness, built ↑ | **0.529** | 0.489 | 0.431 |
| storage, 2050 ↑ | 1.88 | 1.65 | **2.00** |
| heat, 2050 (°C) ↓ | 1.89 | 1.89 | **1.73** |
| carbon (kg/m²) ↓ | 405 | 402 | 405 |
| daylight ↑ | 0.77 | 0.77 | 0.72 |
| human scale ↑ | 0.69 | 0.72 | **0.74** |
| gap to brief ↓ | 0.083 | 0.078 | 0.082 |
| spread / families | 0.10 / 1 | 0.26 / 13 | 0.26 / 18 |
| 100-year rain: failed ↓ | 0.036 | 0.035 | 0.035 |
| heatwave: public ground overheated ↓ | 0.45 | 0.44 | 0.43 |

### Mumbai Docks (coastal)

| | piecemeal | one-shot today | one-shot 2050 |
|---|---:|---:|---:|
| front (on brief) | **1 (0)** | 39 (39) | 40 (40) |
| wholeness, front ↑ | 0.516 | 0.469 | 0.467 |
| wholeness, built ↑ | 0.516 | 0.448 | 0.507 |
| storage, 2050 ↑ | 0.04 | 0.06 | **0.19** |
| heat, 2050 (°C) ↓ | 3.10 | **2.37** | 2.45 |
| carbon (kg/m²) ↓ | 418 | 425 | 427 |
| daylight ↑ | 0.52 | 0.52 | 0.50 |
| human scale ↑ | **0.43** | 0.29 | 0.28 |
| gap to brief ↓ | 0.133 | 0.100 | 0.083 |
| spread / families | 0 / 1 | 0.23 / 15 | 0.30 / 22 |
| 2100 high sea: flooded / floor lost ↓ | 0.83 / 0.062 | 0.83 / 0.047 | 0.83 / 0.054 |
| 100-year rain: failed ↓ | **0.044** | 0.107 | 0.068 |
| heatwave: public ground overheated ↓ | 0.80 | 0.71 | 0.72 |

Docks' piecemeal column is a single design that misses the brief, so its wholeness is not
comparable with the others.

### Mumbai Eastern Waterfront (coastal)

| | piecemeal | one-shot today | one-shot 2050 |
|---|---:|---:|---:|
| front (on brief) | 40 (40) | 40 (40) | 40 (40) |
| wholeness, front ↑ | 0.489 | 0.476 | 0.489 |
| wholeness, built ↑ | 0.503 | 0.496 | **0.556** |
| storage, 2050 ↑ | **0.70** | 0.40 | 0.53 |
| heat, 2050 (°C) ↓ | 2.20 | **1.84** | 1.87 |
| carbon (kg/m²) ↓ | 411 | 408 | 410 |
| daylight ↑ | 0.66 | **0.71** | 0.69 |
| human scale ↑ | 0.56 | **0.66** | 0.64 |
| gap to brief ↓ | 0.092 | 0.083 | 0.074 |
| spread / families | 0.08 / 1 | 0.27 / 17 | 0.36 / 25 |
| 2100 high sea: flooded / floor lost ↓ | 0.46 / 0.019 | 0.46 / 0.009 | 0.46 / 0.018 |
| 100-year rain: failed ↓ | 0.091 | 0.123 | **0.062** |
| heatwave: public ground overheated ↓ | 0.53 | 0.43 | 0.45 |

### The increments

Wholeness of the fabric before → after each increment (the design built), seeds 1–3:

| site | 2025 | 2035 | 2050 | penalty paid |
|---|---|---|---|---|
| Ahmedabad | 0.19 → 0.39 / 0.36 / 0.51 | → 0.42 / 0.42 / 0.51 | → 0.43 / 0.44 / 0.52 | once (2035, 0.002) |
| Bengaluru | 0.19 → 0.43 / 0.44 / 0.38 | → 0.48 / 0.51 / 0.39 | → 0.52 / 0.53 / 0.43 | never |
| Docks | 0.17 → 0.51 / 0.42 / 0.39 | → 0.55 / 0.44 / 0.57 | → 0.45 / 0.52 / 0.54 | twice, in 2050 (0.10, 0.023) |
| Eastern Waterfront | 0.18 → 0.54 / 0.41 / 0.51 | → 0.52 / 0.56 / 0.53 | → 0.50 / 0.49 / 0.53 | three times (0.024, 0.016, 0.063) |

The design built lowered wholeness in 6 of 36 increments. All of them were on the two
Mumbai sites, and in the later increments, when most cells are fixed and there is little
room left to repair.

## Reading it

- **Heat is most likely the cost of fixing the early phases.** Each increment builds where its attractors
  pull hardest, at its year's share of the brief. The 2025 phase builds its cells under
  2025's heat, and every later phase must live with them. A one-shot run can move every
  building, every generation.
- **Storage on Eastern Waterfront.** Piecemeal is better here (0.70 against 0.40 and 0.53).
  One possible reason: the last increment fills the remaining ground under 2050's storm. I
  haven't checked it.
- **Diversity: much lower, mostly by construction.** By 2050 the front shares the 70% of
  cells built in 2025 and 2035, so the spread over the whole site can't be large, and every
  front is one family at the 5% threshold. Taken over the cells the last increment could
  change (about 30% on each site), the spread is roughly 0.27–0.37. That is close to
  one-shot's 0.23–0.42. This is an estimate, divided out, not a measurement.
- **Wholeness.** The design built ends higher than one-shot today's choice on all four
  sites, and higher than one-shot 2050's on three. That is what the penalty is for. Across
  the whole front the gain is small or nothing: piecemeal is ahead on Docks, level on
  Eastern Waterfront, between the one-shot modes on Ahmedabad, and slightly behind on
  Bengaluru.
- **Scoring one-shot under 2050** (the third column) helps it on storage (Docks, Bengaluru)
  and on gap, and costs little elsewhere. A one-shot plan for 2050 should be scored under
  2050's conditions.

## Doubts

- **Docks: the brief can't be met.** On Docks the 2025 increment reached the 40% land cap
  (265 of 661 cells) before 40% of the floor area. The 2035 increment did the same. The
  2050 increment then had 30% of the land for the rest of the brief, and no design got
  within 10%. Even with no sea, the median gap is 0.109.
  - When no design is within the brief, ranking orders designs by gap alone. So the front
    is one design, and the other objectives, wholeness among them, stop steering.
  - Two possible fixes:
    1. Cap the land only when the floor-area share is already met, so early increments
       build denser.
    2. Let the last increment rebuild fallow-adjacent cells.
  - I haven't changed it. Both fixes change what "piecemeal" means here, and it is your call.
- **The increments can't see ahead.** The 2025 phase is scored under 2025's sea and
  builds on ground the 2050 sea floods. On Docks, floor lost to the 2100 sea is higher than
  one-shot's (0.062 against 0.047–0.054), and on Eastern Waterfront it is double one-shot
  today's. This is honest to "each phase under its own year", but a real phased plan would
  look ahead. Scoring each phase under 2050 as well would be one fix.
- **The budgets match in designs grown, not in evolutionary depth.** Piecemeal has three
  runs of 16 generations, one-shot one of 47. Piecemeal also has a sixth objective, and
  NSGA-III instead of NSGA-II.
- **Wholeness is my composite** (`docs/piecemeal.md`): equal weights over fourteen
  measures, scaled over the ranges in `docs/metrics.md`.
- **Three seeds** give medians, not spreads. The differences in carbon and in gap are within
  seed noise. Those in heat and diversity are consistent across seeds and sites.
- **Run time:** piecemeal took 6–13 minutes per run against 9–35 seconds for one-shot.
  Almost all of it is reading wholeness on every design. (Four runs show about 30,000 s:
  the laptop slept during one increment.)

## Version 3: vector streets, blocks and plots

Rerun 2026-10-22 on genome version 3 (`--version 3`): 15 generations of 30, seeds 1 and 2,
the same four sites, so each mode grows 1,440 designs. In piecemeal, the first increment's
streets, blocks and plots are the frame the later increments fill (`docs/piecemeal.md`).
Each cell is the median of the two seeds. The judging is unchanged from the set-up above.
The run file is not in the repository; `pm-table.mjs` made the tables from it.

**The answer holds: piecemeal growth is not a better optimiser.**
- **Heat:** the piecemeal 2050 front is hotter on all four sites, by 0.4 to 0.6 °C on three,
  and more of its public ground overheats in a heatwave on all four.
- **Storage:** worse on three sites. Docks drops to 0.07 against 0.28 and 0.31.
- **Wholeness of the design built:** higher than either one-shot choice on three sites. On
  Bengaluru it is level with one-shot today and below one-shot 2050.
- **Daylight:** better on all four sites, and carbon better or level. With the 2025 frame
  fixed, later increments fill plots between streets that already exist, which may keep
  buildings lower and apart. I haven't checked this.
- **Diversity:** much lower, by construction, as in version 2.

**What changed from version 2:**
- **Docks meets the brief.** All of the front is within it in both seeds (26.5 designs on
  the front, median). In version 2 no 2050 design got within 10%.
- **The penalty was paid 3 times in 24 increments:** 2035 on Docks seed 1 (0.006), and 2050
  on Eastern Waterfront seed 2 (0.026) and Wadaj seed 2 (0.053). Version 2 paid it 6 times
  in 36.

#### Mumbai Docks (coastal)

| | piecemeal | one-shot today | one-shot 2050 |
|---|---:|---:|---:|
| front (on brief) | 26.5 (26.5) | 30 (30) | 30 (30) |
| wholeness, front ↑ | **0.490** | 0.462 | 0.461 |
| wholeness, built ↑ | **0.506** | 0.459 | 0.442 |
| storage, 2050 ↑ | 0.07 | 0.28 | **0.31** |
| heat, 2050 (°C) ↓ | 2.43 | **1.84** | 2.13 |
| carbon (kg/m²) ↓ | **412** | 427 | 419 |
| daylight ↑ | **0.64** | 0.52 | 0.58 |
| human scale ↑ | **0.57** | 0.36 | 0.53 |
| gap to brief ↓ | 0.060 | 0.082 | **0.057** |
| spread / families | 0.09 / 1.5 | 0.38 / 18 | 0.39 / 21 |
| sea 2100: floor lost ↓ | 0.073 | **0.055** | 0.067 |
| 100-year rain: failed ↓ | 0.070 | 0.051 | **0.039** |
| heatwave: public ground overheated ↓ | 0.62 | **0.60** | 0.64 |
| run time (s) | 269 | 77 | 92 |


#### Mumbai Eastern Waterfront (coastal)

| | piecemeal | one-shot today | one-shot 2050 |
|---|---:|---:|---:|
| front (on brief) | 30 (30) | 27 (27) | 30 (30) |
| wholeness, front ↑ | 0.479 | 0.449 | **0.481** |
| wholeness, built ↑ | **0.546** | 0.457 | 0.451 |
| storage, 2050 ↑ | 0.51 | 0.43 | **0.58** |
| heat, 2050 (°C) ↓ | 2.17 | **1.62** | 1.91 |
| carbon (kg/m²) ↓ | 407 | 407 | 407 |
| daylight ↑ | **0.75** | 0.73 | 0.72 |
| human scale ↑ | 0.63 | **0.75** | 0.69 |
| gap to brief ↓ | 0.068 | 0.083 | **0.057** |
| spread / families | 0.10 / 2.5 | 0.24 / 10.5 | 0.35 / 18 |
| sea 2100: floor lost ↓ | 0.032 | **0.012** | 0.021 |
| 100-year rain: failed ↓ | 0.067 | 0.132 | **0.059** |
| heatwave: public ground overheated ↓ | 0.42 | **0.36** | 0.44 |
| run time (s) | 1091 | 201 | 185 |


#### Ahmedabad Wadaj (inland)

| | piecemeal | one-shot today | one-shot 2050 |
|---|---:|---:|---:|
| front (on brief) | 28.5 (28.5) | 26 (26) | 29 (29) |
| wholeness, front ↑ | **0.480** | 0.400 | 0.411 |
| wholeness, built ↑ | **0.514** | 0.383 | 0.457 |
| storage, 2050 ↑ | 2.14 | 2.13 | **2.17** |
| heat, 2050 (°C) ↓ | 0.98 | 0.99 | **0.89** |
| carbon (kg/m²) ↓ | **402** | 403 | 404 |
| daylight ↑ | **0.91** | 0.88 | 0.84 |
| human scale ↑ | 0.74 | 0.77 | 0.77 |
| gap to brief ↓ | 0.076 | **0.060** | 0.061 |
| spread / families | 0.10 / 1.5 | 0.39 / 17.5 | 0.38 / 21 |
| 100-year rain: failed ↓ | 0.074 | **0.060** | 0.081 |
| heatwave: public ground overheated ↓ | 0.34 | 0.29 | **0.28** |
| run time (s) | 4135 | 313 | 316 |


#### Bengaluru tank cascade (inland)

| | piecemeal | one-shot today | one-shot 2050 |
|---|---:|---:|---:|
| front (on brief) | 19 (19) | 27 (27) | 28.5 (28.5) |
| wholeness, front ↑ | 0.428 | 0.429 | **0.439** |
| wholeness, built ↑ | 0.429 | 0.429 | **0.498** |
| storage, 2050 ↑ | 1.58 | **2.00** | 1.85 |
| heat, 2050 (°C) ↓ | 2.19 | **1.69** | 1.82 |
| carbon (kg/m²) ↓ | **407** | 413 | 412 |
| daylight ↑ | **0.74** | 0.64 | 0.66 |
| human scale ↑ | 0.70 | 0.73 | **0.74** |
| gap to brief ↓ | 0.087 | 0.082 | **0.058** |
| spread / families | 0.08 / 1 | 0.27 / 11.5 | 0.28 / 11.5 |
| 100-year rain: failed ↓ | **0.027** | 0.036 | 0.034 |
| heatwave: public ground overheated ↓ | 0.52 | **0.45** | 0.47 |
| run time (s) | 2831 | 369 | 405 |

**Doubts, version 3**
- **Two seeds, not three.** Seed noise is larger than in version 2; treat single-site
  differences under about 0.05 (scores) or 0.03 (wholeness) as level.
- **Guwahati is not in this run.** It was added as the hilly site after the run started.
- **Run time:** piecemeal took 4.5 to 70 minutes per run against 1 to 7 minutes for
  one-shot, almost all of it exact wholeness. Wadaj is the slowest.

## H4: foresight, and growing without wholeness

Run 2026-10-23 to 24 for H4 (`docs/research/claim.md`), after the Phase 9 carry-over
(b7ed143). Genome version 3, 15 generations of 30, seeds 1 and 2, five sites (Guwahati
added), so each mode grows 1,440 designs. The run died with its session part-way, and the
missing site-seeds were relaunched in a second session; the two result sets were merged on
25 October (50 runs, no duplicates). The run files are not in the repository.

Five modes, judged as in the set-up above:

| mode | what it is |
|---|---|
| piecemeal | as before, now with banded ranking (`docs/piecemeal.md`) |
| foresight | piecemeal, each step before the last also scored under 2050 (`scoreAhead`) |
| no wholeness | piecemeal with no wholeness objective and no penalty |
| one-shot today | as before |
| one-shot 2050 | as before |

The one-shot rows match the version 3 rerun of 22 October to the last digit on all four
sites both runs share: the runs are deterministic across sessions.

**H4 is not supported by these runs.** H4 says a site built in steps with foresight ends at
least as well as one designed in a single step for 2050. Against the better of the two
one-shot modes, foresight is:
- **hotter at 2050 on all five sites**, by 0.12 °C (Wadaj) to 0.81 °C (Docks);
- **worse on flood storage on three** (Docks, Bengaluru, Guwahati), better on Eastern
  Waterfront, level on Wadaj;
- **worse under the 100-year rain on four**, and more of its public ground overheats in a
  heatwave on three;
- **much less diverse on all five** (spread 0.08-0.12 against 0.24-0.39), by construction as
  before;
- **further from the brief** on three sites;
- better on **carbon** on three and **daylight** on two;
- higher on **wholeness of the design built** on three (Docks, Eastern Waterfront,
  Guwahati), level on Wadaj, lower on Bengaluru.

**Foresight against plain piecemeal: mostly no difference.**
- It helps clearly on one site. On Eastern Waterfront heat falls from 2.48 to 1.88 °C,
  storage rises from 0.34 to 0.64, and the heatwave share falls from 0.55 to 0.45.
- It hurts on another. On Docks storage falls from 0.24 to 0.09, the heatwave share rises
  from 0.62 to 0.76, and floor lost to the 2100 sea rises from 0.075 to 0.086. That last one
  is the opposite of what foresight is for.
- Elsewhere most differences are within the two-seed noise. Guwahati gains a little
  (storage, daylight, less heatwave overheating). One cost is consistent: more of the
  ground fails under the 100-year rain on three sites (Docks, Eastern Waterfront, Guwahati).
- `scoreAhead` judges a step by how its own buildings fare in 2050. It does not move
  buildings already placed, and the 2025 step still builds under 2025's ranking. That is a
  narrow kind of foresight, and these runs say it isn't enough.

**The wholeness objective does its job and costs little.** Without it, the wholeness of the
design built falls on four of five sites, by 0.06 to 0.12 (on Bengaluru it is 0.02 higher,
within the noise). The other scores are mostly level with plain piecemeal; no score
improves consistently when wholeness is dropped. The wholeness a step takes away (what the
penalty charges, measured in every arm) happens about as often in each arm, 5 to 7 times in
30 increments, but is far larger without the objective: up to 0.097, against 0.030 in plain
piecemeal and 0.033 with foresight.

**Plain piecemeal moved since 22 October**, because ranking is now banded. On Docks storage
at 2050 rose from 0.07 to 0.24 and the front on brief fell from 26.5 to 14. On Eastern
Waterfront storage fell from 0.51 to 0.34 and heat rose from 2.17 to 2.48. Single-site
moves of this size between versions are another sign that two seeds are not enough.

#### Mumbai Docks (coastal)

| | piecemeal | foresight | no wholeness | one-shot today | one-shot 2050 |
|---|---:|---:|---:|---:|---:|
| front (on brief) | 14 (14) | 19.5 (19.5) | 10 (10) | 30 (30) | 30 (30) |
| wholeness, front ↑ | 0.502 | **0.520** | 0.507 | 0.462 | 0.461 |
| wholeness, built ↑ | 0.514 | **0.517** | 0.456 | 0.459 | 0.442 |
| storage, 2050 ↑ | 0.24 | 0.09 | 0.19 | 0.28 | **0.31** |
| heat, 2050 (°C) ↓ | 2.63 | 2.65 | 2.58 | **1.84** | 2.13 |
| carbon (kg/m²) ↓ | 411 | 412 | 411 | 427 | 419 |
| daylight ↑ | 0.62 | 0.60 | 0.62 | 0.52 | 0.58 |
| human scale ↑ | 0.55 | 0.58 | **0.60** | 0.36 | 0.53 |
| gap to brief ↓ | 0.064 | **0.055** | 0.072 | 0.082 | 0.057 |
| spread / families | 0.03 / 1 | 0.08 / 1.5 | 0.08 / 1 | 0.38 / 18 | 0.39 / 21 |
| sea 2100: floor lost ↓ | 0.075 | 0.086 | 0.075 | **0.055** | 0.067 |
| 100-year rain: failed ↓ | 0.049 | 0.062 | 0.054 | 0.051 | **0.039** |
| heatwave: public ground overheated ↓ | 0.62 | 0.76 | 0.69 | **0.60** | 0.64 |

#### Mumbai Eastern Waterfront (coastal)

| | piecemeal | foresight | no wholeness | one-shot today | one-shot 2050 |
|---|---:|---:|---:|---:|---:|
| front (on brief) | 24 (24) | 30 (29.5) | 23 (23) | 27 (27) | 30 (30) |
| wholeness, front ↑ | **0.488** | 0.484 | 0.466 | 0.449 | 0.481 |
| wholeness, built ↑ | 0.525 | 0.525 | 0.469 | 0.457 | 0.451 |
| storage, 2050 ↑ | 0.34 | 0.64 | **0.74** | 0.43 | 0.58 |
| heat, 2050 (°C) ↓ | 2.48 | 1.88 | 2.14 | **1.62** | 1.91 |
| carbon (kg/m²) ↓ | **405** | 406 | 407 | 407 | 407 |
| daylight ↑ | **0.78** | 0.74 | 0.72 | 0.73 | 0.72 |
| human scale ↑ | 0.66 | 0.69 | 0.62 | **0.75** | 0.69 |
| gap to brief ↓ | 0.070 | 0.068 | 0.081 | 0.083 | **0.057** |
| spread / families | 0.09 / 1.5 | 0.10 / 2 | 0.10 / 2.5 | 0.24 / 10.5 | 0.35 / 18 |
| sea 2100: floor lost ↓ | 0.030 | 0.033 | 0.032 | **0.012** | 0.021 |
| 100-year rain: failed ↓ | 0.059 | 0.085 | 0.069 | 0.132 | 0.059 |
| heatwave: public ground overheated ↓ | 0.55 | 0.45 | 0.48 | **0.36** | 0.44 |

#### Ahmedabad Wadaj (inland)

| | piecemeal | foresight | no wholeness | one-shot today | one-shot 2050 |
|---|---:|---:|---:|---:|---:|
| front (on brief) | 30 (30) | 16 (16) | 18 (18) | 26 (26) | 29 (29) |
| wholeness, front ↑ | **0.446** | 0.439 | 0.442 | 0.400 | 0.411 |
| wholeness, built ↑ | **0.471** | 0.427 | 0.410 | 0.383 | 0.457 |
| storage, 2050 ↑ | 2.09 | 2.12 | 2.13 | 2.13 | **2.17** |
| heat, 2050 (°C) ↓ | 1.00 | 1.01 | 1.02 | 0.99 | **0.89** |
| carbon (kg/m²) ↓ | 401 | **400** | 402 | 403 | 404 |
| daylight ↑ | 0.90 | **0.99** | 0.93 | 0.88 | 0.84 |
| human scale ↑ | 0.78 | **0.81** | 0.78 | 0.77 | 0.77 |
| gap to brief ↓ | 0.065 | 0.081 | 0.069 | **0.060** | 0.061 |
| spread / families | 0.11 / 2.5 | 0.09 / 2 | 0.13 / 2 | 0.39 / 17.5 | 0.38 / 21 |
| 100-year rain: failed ↓ | 0.095 | 0.088 | 0.085 | **0.060** | 0.081 |
| heatwave: public ground overheated ↓ | 0.29 | **0.27** | 0.35 | 0.29 | 0.28 |

#### Bengaluru tank cascade (inland)

| | piecemeal | foresight | no wholeness | one-shot today | one-shot 2050 |
|---|---:|---:|---:|---:|---:|
| front (on brief) | 17.5 (17.5) | 19.5 (19.5) | 22.5 (22.5) | 27 (27) | 28.5 (28.5) |
| wholeness, front ↑ | **0.440** | 0.438 | 0.421 | 0.429 | 0.439 |
| wholeness, built ↑ | 0.433 | 0.455 | 0.453 | 0.429 | **0.498** |
| storage, 2050 ↑ | 1.73 | 1.58 | 1.66 | **2.00** | 1.85 |
| heat, 2050 (°C) ↓ | 2.09 | 2.10 | 2.09 | **1.69** | 1.82 |
| carbon (kg/m²) ↓ | 407 | **406** | 408 | 413 | 412 |
| daylight ↑ | 0.71 | 0.71 | 0.68 | 0.64 | 0.66 |
| human scale ↑ | 0.68 | 0.70 | 0.70 | 0.73 | **0.74** |
| gap to brief ↓ | 0.092 | 0.082 | 0.092 | 0.082 | **0.058** |
| spread / families | 0.09 / 1.5 | 0.09 / 1 | 0.07 / 1 | 0.27 / 11.5 | 0.28 / 11.5 |
| 100-year rain: failed ↓ | **0.028** | 0.037 | 0.032 | 0.036 | 0.034 |
| heatwave: public ground overheated ↓ | 0.54 | 0.52 | 0.51 | **0.45** | 0.47 |

#### Guwahati Bharalu (hilly, inland)

| | piecemeal | foresight | no wholeness | one-shot today | one-shot 2050 |
|---|---:|---:|---:|---:|---:|
| front (on brief) | 30 (30) | 30 (30) | 16.5 (16.5) | 30 (30) | 28.5 (28.5) |
| wholeness, front ↑ | 0.492 | 0.496 | 0.429 | 0.452 | **0.502** |
| wholeness, built ↑ | **0.535** | 0.517 | 0.420 | 0.484 | 0.434 |
| storage, 2050 ↑ | 2.43 | 2.50 | 2.46 | 2.82 | **2.86** |
| heat, 2050 (°C) ↓ | 1.66 | 1.68 | 1.68 | 1.40 | **1.33** |
| carbon (kg/m²) ↓ | 404 | 402 | **400** | 401 | 401 |
| daylight ↑ | 0.80 | 0.89 | **0.96** | 0.83 | 0.87 |
| human scale ↑ | 0.69 | 0.70 | 0.68 | 0.73 | 0.73 |
| gap to brief ↓ | 0.075 | 0.071 | 0.096 | 0.079 | 0.071 |
| spread / families | 0.12 / 3 | 0.12 / 3 | 0.12 / 2.5 | 0.35 / 20 | 0.36 / 19.5 |
| 100-year rain: failed ↓ | 0.051 | 0.068 | 0.064 | 0.051 | **0.047** |
| heatwave: public ground overheated ↓ | 0.50 | **0.44** | 0.53 | 0.47 | 0.50 |

The inland sites have no sea row: the 2100 sea doesn't reach them.

**Doubts, H4**
- **Two seeds, no significance tests.** The protocol in `claim.md` asks for 10 seeds with
  Mann-Whitney tests. These runs can show a consistent direction across sites (heat, diversity,
  the wholeness objective), not a tested effect. Single-site differences under about 0.05
  (scores) or 0.03 (wholeness) are treated as level.
- **Run times are not comparable.** The laptop slept or was busy during some runs: five
  one-shot runs took 2,600 to 5,000 s against 300 to 650 s for their twins. In piecemeal the
  first increment takes 90% or more of the time (exact wholeness on a fresh site).
- **What would test H4 properly:** a stronger foresight (the 2025 step ranked under 2050 as
  well as 2025, not only scored), and 10 seeds. Both are for you to decide; neither is in
  the Milestone A plan.
