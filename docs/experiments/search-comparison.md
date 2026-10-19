# Search comparison: NSGA-II, NSGA-III and MAP-Elites

Phase 5, 2026-10-19. Which search should the sandbox run by default?

**Answer: NSGA-II stays the default.** NSGA-III gives no gain at five objectives and stays
an option, to become the default once Phase 6 lets a run have more than five. MAP-Elites
finds about four times as many kinds of design but a weaker front. It is offered as its own
mode for exploring, not as the default.

## Set-up

- `npm run compare -- <site> 5` in `app/` (`app/scripts/compare-search.ts`). It uses the
  TypeScript engine, which matches Python design for design (`test/parity`).
- Each search ran with the same budget as the page's default run: 30 generations of 60, so
  1,860 designs grown. Seeds 1 to 5 were used, with the same seed giving the same
  Generation 0 in all three searches. The tables give the mean ± standard deviation over
  the five seeds.
- MAP-Elites used its default archive: average storeys × open ground, 10 × 10 bins,
  quality as the unweighted mean of the five scores (`quality` in `app/engine/elites.ts`).
- The main site is `mumbai-ewf`, as the brief asks. `ahmedabad-wadaj` is a cross-check on
  an inland site.

What each row measures:

| row | meaning |
|---|---|
| kept, on brief | designs the run ends with that are within 10% of the floor-area brief (NSGA: the final population; MAP-Elites: the archive) |
| on the front | of those, the ones no other kept design beats on all five scores |
| families on the front | front designs grouped by land-use similarity (`families`, threshold 0.15), as the Families chapter shows them |
| hypervolume | the share of the five-score box that the front dominates, scored on the MAP-Elites quality ranges, with 1 as the good end. Monte Carlo with 100,000 fixed points, so runs compare fairly. Higher is better. |
| share of the joint front | the three fronts of a seed pooled and re-ranked: what share of the pooled front each search supplies |
| cells | how many cells of a 10 × 10 grid over two traits the on-brief designs reach. Storeys × open ground is MAP-Elites' own archive, so it favours MAP-Elites; storage × height variety is a pair none of the searches aimed at. |
| genome spread | the mean gene-by-gene distance between kept designs (0 to 1) |
| best ... | the best value of each score on the front |

## Mumbai Eastern Waterfront

| | nsga2 | nsga3 | map-elites |
|---|---:|---:|---:|
| run time (s) | 4.7 ± 0.2 | 4.6 ± 0.1 | 4.8 ± 0.4 |
| designs grown | 1860 | 1860 | 1860 |
| kept, on brief | 60 ± 0 | 60 ± 0 | 39 ± 2 |
| on the front | 51 ± 8 | 47 ± 8 | 14 ± 2 |
| families on the front | 33 ± 5 | 27 ± 6 | 11 ± 1 |
| hypervolume (%) | **51.6 ± 5.4** | 49.6 ± 5.9 | 39.6 ± 3.2 |
| share of the joint front (%) | **52 ± 9** | 42 ± 9 | 6 ± 5 |
| cells: storeys × open ground | 10 ± 2 | 11 ± 2 | **39 ± 2** |
| cells: storage × height variety | 17 ± 2 | 15 ± 3 | **26 ± 3** |
| genome spread | 0.243 ± 0.013 | 0.229 ± 0.010 | **0.306 ± 0.004** |
| best flood storage | 1.692 ± 0.036 | 1.693 ± 0.037 | 1.701 ± 0.026 |
| best heat (°C, lower is better) | 0.876 ± 0.089 | 0.874 ± 0.053 | **0.752 ± 0.050** |
| best embodied carbon | 400.0 | 400.0 | 400.0 |
| best daylight | 1.000 | 1.000 | 1.000 |
| best human scale | 0.841 ± 0.014 | 0.838 ± 0.019 | 0.814 ± 0.005 |

## Ahmedabad: Gandhi Ashram and Wadaj (cross-check)

| | nsga2 | nsga3 | map-elites |
|---|---:|---:|---:|
| run time (s) | 10.2 ± 0.3 | 10.3 ± 0.4 | 10.5 ± 0.2 |
| kept, on brief | 60 ± 0 | 60 ± 0 | 51 ± 2 |
| on the front | 35 ± 9 | 22 ± 5 | 11 ± 1 |
| families on the front | 26 ± 6 | 16 ± 5 | 11 ± 1 |
| hypervolume (%) | **81.4 ± 2.9** | 80.7 ± 4.6 | 59.6 ± 5.2 |
| share of the joint front (%) | **58 ± 31** | 42 ± 31 | 0 ± 1 |
| cells: storeys × open ground | 5 ± 1 | 6 ± 2 | **51 ± 2** |
| cells: storage × height variety | 5 ± 1 | 4 ± 1 | **17 ± 2** |
| genome spread | 0.171 ± 0.035 | 0.174 ± 0.027 | **0.316 ± 0.003** |
| best flood storage | 2.332 ± 0.008 | 2.326 ± 0.003 | 2.304 ± 0.014 |
| best heat (°C) | **0.534 ± 0.051** | 0.560 ± 0.011 | 0.614 ± 0.022 |
| best human scale | 0.851 ± 0.019 | 0.848 ± 0.022 | 0.771 ± 0.026 |

## What it shows

- **Run time is the same.** All three spend almost all their time growing and scoring
  designs, and the budget is the same. Niching and the archive cost nothing you can measure.
- **NSGA-II and NSGA-III are close, and NSGA-II is a little ahead.** It is ahead on every
  front measure on both sites, but by less than one standard deviation. That is what the
  literature predicts: reference directions help when crowding distance stops working,
  which happens at about six or more objectives. We have five. NSGA-III also keeps fewer
  families (27 against 33 at Mumbai, 16 against 26 at Wadaj), because it fills niches in
  score space and not in plan.
- **MAP-Elites does the other job.** It reaches about four times as many storeys × open
  ground cells (39 against 10; 51 against 5) and more cells on a pair it didn't aim at
  (storage × height variety: 26 against 17). Its designs are further apart as genomes. But
  its front is weaker (hypervolume down by 12 points at Mumbai and 22 at Wadaj), and it
  supplies almost nothing to the pooled front. It keeps one design per kind, so its
  breeding pressure is spread thinly.
- **It sometimes wins an extreme.** At Mumbai, MAP-Elites' coolest design was cooler on
  average than either NSGA's (best heat 0.75 °C against 0.88 °C over the five seeds). At
  Wadaj it was not. Its archive keeps low, open
  designs alive that the NSGA fronts drop. So it is worth running when you want the
  outliers.

## Decision

| | |
|---|---|
| Default | **NSGA-II**, unchanged. |
| NSGA-III | An option. Since Phase 6, the "auto" search (the default) runs NSGA-III whenever promoted metrics take a run past five objectives, as the brief asks. |
| MAP-Elites | A mode of its own ("one of every kind"), with an archive grid in Explore. A brief's objective weights set its quality. |

## Re-run with streets (Phase 6b, 2026-10-20)

The same runs after Phase 6b changed the genome: four street genes, streets on cell edges,
and the landform skeleton. The seeds give different designs from here on, so these numbers
replace the ones above for current runs.

**Mumbai Eastern Waterfront** (roads skeleton; flat):

| | nsga2 | nsga3 | map-elites |
|---|---:|---:|---:|
| run time (s) | 9.8 ± 0.5 | 9.6 ± 0.4 | 9.6 ± 0.2 |
| kept, on brief | 60 ± 0 | 60 ± 0 | 29 ± 2 |
| on the front | 49 ± 10 | 42 ± 10 | 13 ± 1 |
| families on the front | 24 ± 9 | 22 ± 8 | 11 ± 2 |
| hypervolume (%) | **18.0 ± 2.0** | 17.9 ± 2.5 | 10.6 ± 0.9 |
| share of the joint front (%) | **54 ± 10** | 39 ± 11 | 7 ± 3 |
| cells: storeys × open ground | 13 ± 2 | 13 ± 2 | **29 ± 2** |
| cells: storage × height variety | 16 ± 3 | 18 ± 4 | **19 ± 2** |
| genome spread | 0.216 ± 0.020 | 0.210 ± 0.017 | **0.283 ± 0.006** |
| best heat (°C) | 1.352 ± 0.063 | 1.368 ± 0.032 | **1.210 ± 0.108** |
| best daylight | **0.888 ± 0.096** | 0.875 ± 0.052 | 0.816 ± 0.033 |
| best human scale | **0.777 ± 0.012** | 0.772 ± 0.008 | 0.736 ± 0.018 |

**Ahmedabad: Gandhi Ashram and Wadaj** (landform skeleton; gentle):

| | nsga2 | nsga3 | map-elites |
|---|---:|---:|---:|
| run time (s) | 19.8 ± 0.8 | 19.4 ± 0.6 | 21.0 ± 1.0 |
| kept, on brief | 60 ± 0 | 60 ± 0 | 60 ± 5 |
| on the front | 32 ± 5 | 31 ± 10 | 12 ± 1 |
| families on the front | 21 ± 4 | 20 ± 7 | 11 ± 1 |
| hypervolume (%) | **73.6 ± 2.7** | 70.0 ± 5.4 | 53.4 ± 3.9 |
| share of the joint front (%) | **63 ± 19** | 36 ± 21 | 1 ± 1 |
| cells: storeys × open ground | 5 ± 1 | 7 ± 1 | **60 ± 5** |
| cells: storage × height variety | 4 ± 0 | 5 ± 1 | **21 ± 3** |
| genome spread | 0.176 ± 0.025 | 0.170 ± 0.025 | **0.310 ± 0.006** |
| best heat (°C) | **0.620 ± 0.022** | 0.668 ± 0.121 | 0.760 ± 0.110 |
| best human scale | **0.834 ± 0.019** | 0.821 ± 0.015 | 0.768 ± 0.015 |

What changed:
- **The ranking holds.** NSGA-II stays the default: it is ahead on front quality, with
  NSGA-III within noise. MAP-Elites still covers the most kinds of design, with the weaker
  front.
- **Runs take about twice as long.** Each grow now generates streets: about 2–8 ms against
  1–2 ms.
- **Hypervolume falls on both sites** (Mumbai 51.6 → 18.0, Wadaj 81.4 → 73.6 for NSGA-II). Streets add sealed ground (heat) and take plot area,
  so the same floor area stands taller (daylight), and the floor-area brief is harder to meet.
  The box the hypervolume is measured in is unchanged, so absolute values aren't comparable
  with the earlier tables; the ranking within each table is.

## Caveats

- Five seeds per site. The NSGA-II vs NSGA-III gaps are inside the noise. The gap between
  NSGA and MAP-Elites is not.
- Hypervolume is clamped to the quality ranges. At Wadaj, flood storage goes past the top of
  its range (1.8), so differences there don't count. Embodied carbon and daylight reach their
  best values in every run (400 kg/m², 100%), so they don't separate the searches.
- MAP-Elites' quality is the plain mean of five scaled scores. Another quality, such as a
  brief's weights, would give a different archive.
- The NSGA-III here is simplified so that Python and the browser match bit for bit (see the
  header of `app/engine/niche.ts`): it normalises between the ideal and worst points instead
  of using hyperplane intercepts, and breaks ties by order instead of at random. A textbook
  version could do slightly better.

## The ranges MAP-Elites' bins cover

Values outside a range go in the end bins. `npm run ranges` (`app/scripts/descriptor-ranges.ts`)
checks the ranges against 500 random designs on each of three sites (Mumbai Eastern
Waterfront, Mumbai Docks, Ahmedabad Wadaj):

| trait | bins cover | 2nd to 98th percentile, 1,500 random designs |
|---|---|---|
| average storeys | 1 to 10 | 1.08 to 7.25 |
| height variety (spread of storeys) | 0 to 3.5 | 0.33 to 2.73 |
| open ground (landscape and water) | 0.2 to 0.8 | 0.28 to 0.71 |
| landscape share | 0.1 to 0.5 | 0.15 to 0.48 |
| water share | 0.05 to 0.3 | 0.05 to 0.30 |
| flood storage | 0.4 to 1.8 | 0.50 to 2.11 |
| heat | 0.4 to 3 | 0.71 to 2.67 |
| daylight | 0.3 to 1 | 0.59 to 1.00 |
| human scale | 0.5 to 0.9 | 0.53 to 0.83 |

Average storeys runs to 10 because evolved designs go higher than random ones (up to 9.7 in
these runs). Flood storage goes past 1.8 only at Wadaj, where those designs share the top
bin.
