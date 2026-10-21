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
