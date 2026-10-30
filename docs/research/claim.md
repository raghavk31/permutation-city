# Research claim

Draft, 2026-10-21, for refining together. Brief: `docs/permutation-city-v3-prompt.md`.
Re-centred on losses 2026-10-28 (below), before the A4 runs; the 21 October wording is kept
under it as history.

## The main claim (28 October)

### As given

> Designing with nature avoids the losses that cities now take as normal. Our cities flood in
> light rain because they have no stormwater system, have little green space within reach,
> and build the same buildings everywhere, which ignore the climate and lean on air
> conditioning to make up for it. Their programmes aren't worked out as systems. This way of
> designing brings the climate system and the design system together.

### Proposed wording

> On real sites, under the same bye-laws and the same floor-area target, a plan generated
> from the land's water, ground and climate loses less floor area to rain, sea and heat
> shocks (H3), and gives more people green space within a walk, than the plan the same rules
> produce when plots are laid out first and water is handled afterwards. The cost is stated:
> the floor area given back to water and green ground.

The headline sentence the A4 results should fill in:

> On the Bengaluru tank cascade, designing with nature cuts the floor area lost to a
> 100-year rain by X% and heat exposure by Y%, at a cost of Z% of buildable floor area.

What changed from 21 October and why:
- **Losses lead.** H3 ("share failed and floor lost" under the shock battery) measures the
  built mass a city loses, which is the claim's own subject. It moves to the front; H1
  (range) and H2 (intelligibility) become supporting results.
- **The baseline is how cities are built now**, not only a fixed grid (below).
- **The cost is part of the claim.** Bengaluru's rules already show that reserving water and
  green ground first lowers what plans can hold (`docs/built-form.md`: 181 ha against a
  591 ha brief). A claim that states its cost is easier to believe than one that doesn't.
- **Lineage.** The idea is McHarg's *Design with Nature* (1969), with Spirn's *The Granite
  Garden* (1984) and sponge-city practice. What is new here is making it generative, under
  real Indian rules, and measuring the losses avoided.

### The business-as-usual baseline

The plan the same rules give when plots come first, built from the ablations below together:
- the same site, bye-laws, floor-area target and search budget;
- streets as a plain grid on a bearing, joined to the existing roads (no Otto connectivity,
  no tensor-field infill);
- rules from flooding and zoning only: no valleys, ridges or flow lines, and lake and drain
  buffers at the legal minimum (Bengaluru: 30 m), not the 75 m design default;
- parks at the bye-law minimum share, placed on leftover ground, not reserved first;
- one block pattern everywhere.

The fixed-grid generator of 21 October stays as a second comparison. If a real layout can be
had (a development authority plan or an approved layout near the site), it is scored by the
same code as a reference value.

### What each part of the claim rests on in Milestone A

| Part of the claim | Status | Evidence |
|---|---|---|
| Cities flood in light rain, with no stormwater system | measured | rain shock (100-year one-day rain), flow lines over the catchment, valleys and buffers kept open, storage score |
| Little green space within reach | measured | shared ground reserved first, park hierarchy, access to each level of open space |
| Heat | measured, as proxies | heatwave shock (+4.5 °C), land surface temperature, wind; heat model and LST agree only weakly (see below) |
| Buildings ignore the climate and lean on air conditioning | argued, not measured | needs building-scale stand-ins (sun on façades, depth for cross-ventilation, breezeways) from the type generators; open, decide by 12 November |
| Buildings all look the same | partly measured | diversity of the front between designs; variety between buildings in one design is not measured |
| Programmes aren't worked out as systems | not claimed in A | programme was cut from Milestone A; future work |

## The working claim (21 October, as given)

> Urban form generated from the land (landform-derived rules, street networks found the way
> Frei Otto found path systems, and block patterns chosen by search rather than fixed by a
> grid) gives a wider range of designs that perform well, are more legible, and hold up
> better under climate shocks than form generated on a fixed grid. Growing it in steps with
> foresight beats designing it all at once.

## Proposed wording (21 October)

Narrower and testable. The changes are explained under it.

> On real sites, a generator that takes its rules and street structure from the land (rules
> from landform and flooding, a street network that merges routes on a cost surface as Frei
> Otto's path systems do, and block patterns chosen by search) produces, for the same search
> budget, (H1) a wider set of designs that meet the brief and do well on the five scores,
> (H2) street networks that are more intelligible, and (H3) designs that lose less under
> sea, rain and heat shocks than a generator that lays the same programme on a fixed grid.
> (H4) Built in three steps whose choices are scored against the final year's conditions as
> well as their own, a site ends at least as well as one designed in a single step for
> that year.

What changed and why:
- **"For the same search budget".** Every comparison is at a matched number of designs
  grown. Without it, a wider range could just mean a longer run.
- **"Meet the brief".** A design that is off the floor-area brief is not a solution, so it
  can't count towards the range.
- **"More intelligible", not "more legible".** Intelligibility (the correlation of local
  and global integration, Hillier) is a standard, external measure. Our legibility score is
  our own composite and partly built from the same integration values, so it is reported
  but can't carry the claim alone.
- **H4 says "at least as well".** Phase 9 found that steps without foresight lose to
  one-shot on heat and diversity (`docs/experiments/piecemeal-vs-oneshot.md`). Foresight is
  the untested fix. "Beats" is the hope; "no worse, and more whole" is what the evidence may
  support.
- **Landform is tested where there is landform.** Three of the four benchmark sites are flat
  or nearly flat (relief 3-7 m). On flat land the rules and skeleton come from mapped water
  and existing roads, not from landform, so H1-H3 on those sites test the vector streets and
  block patterns, not landform. The landform part of the claim needs the hilly fourth site.

## Hypotheses, measures and comparisons

| | Hypothesis | Measures | Compared with |
|---|---|---|---|
| H1 | A wider range of good designs | hypervolume of the on-brief front (five scores); QD-score and coverage of a fixed MAP-Elites grid over two descriptors set before the runs (storeys × open ground, as in Phase 5); families on the front | v2 grid generator; random designs within the rules; each ablation |
| H2 | More intelligible networks | intelligibility; NAIN and NACH at 400 m, 800 m and Rn, computed exactly; legibility as a secondary readout | as H1, plus the existing city in the 1 km buffer and, if available, a digitised masterplan, as reference values |
| H3 | Better under shocks | the fixed battery from Phase 9: 2100 SSP5-8.5 high-end sea, the site's 100-year one-day rain, a +4.5 °C heatwave; share failed and floor lost | as H1 |
| H4 | Steps with foresight are no worse | the five scores at 2050 conditions, wholeness, diversity of the final front, the shock battery | one-shot scored at 2050; steps without foresight; steps with and without wholeness as an objective |
| H5 (Milestone B) | The best block pattern depends on landform and climate | per family: front quality and shock losses, by site | islands of one family each (B1) |

Components and the ablation that tests each:

| Component | Ablation | Bears on |
|---|---|---|
| landform-derived rules | rules from flooding and zoning only, no valleys, ridges or buffers | H1-H3 on the hilly site |
| Otto connectivity | primary and secondary streets as a plain grid on a bearing | H1, H2 |
| tensor-field infill | local streets as a plain grid inside each block | H1, H2 |
| block pattern families | one family (rotated orthogonal) for every design | H1 |
| quality-diversity search | NSGA-II only, no MAP-Elites archive | H1 |

## Protocol

- **Sites:** mumbai-ewf, ahmedabad-wadaj, bengaluru-cascade, and one site with pronounced
  relief on FABDEM. Each site's relief class and data confidence go in every table.
- **Seeds:** 10 per condition. Every condition gets the same budget of designs grown.
- **Statistics:**
  - Medians and interquartile ranges.
  - Mann-Whitney U, two-sided, for each measure, with Holm's correction across the measures
    of one table.
  - Cliff's delta as the effect size.
  - With 10 seeds a test can miss a small effect; tables say so.
- **Pre-registration, light:** the measures, descriptors, battery and tests above are fixed
  in this file before the Milestone A runs. A change after the runs is logged here with its
  date and reason.

## Evidence so far (v2)

| Source | Finding | For or against |
|---|---|---|
| `docs/experiments/search-comparison.md` | MAP-Elites finds about four times as many kinds of design as NSGA-II, with a weaker front | for quality-diversity search widening the range; against it giving better designs |
| `docs/experiments/piecemeal-vs-oneshot.md` | Steps without foresight: hotter at 2050 on 3 of 4 sites, far less diverse, mixed on storage; the built design is more whole. On Mumbai Docks the brief can't be met. | against H4 as worded, without foresight |
| `docs/experiments/piecemeal-vs-oneshot.md`, H4 (v3, 5 sites, 2 seeds) | Steps with foresight: hotter at 2050 than one-shot on all five sites, worse on storage on three and rain on four, far less diverse; more whole on three. Foresight barely differs from plain steps. Without the wholeness objective, less whole on four sites | against H4; for the wholeness objective |
| `docs/landform.md` | LST and the heat score's own model correlate weakly (r -0.10 to +0.32) | a limit on H3's heat part |

## Threats to validity

- **Our metrics, our generator.** The same author wrote the generator and most of the
  measures. A network built by merging routes may raise integration by construction. Two
  checks: intelligibility (an external, standard measure), and reference values from the
  existing city and any digitised masterplan, scored by the same code.
- **Proxies, not simulation.** Heat, storage and wind are morphological proxies.
- **Data.** Most existing heights are estimated. Mumbai has no open drain data. FABDEM is
  noisy under 5 m of relief.
- **Few sites.** Four sites, three of them in western or southern India and mostly flat.
  Results are about these sites.
- **The designer study comes later** (Milestone B). Until then, "designers using it" is the
  hallway test only.

## Not claimed

- That the buildings use less energy or need less air conditioning (Milestone A has no
  building energy model).
- That programmes are worked out as systems (programme is not in Milestone A).
- That the tool finds beautiful designs, or optimises beauty.
- That designs would perform as scored when built.
- That it replaces design judgement. The designer selects; the search proposes.

## Open questions for the claim

1. Is H4's "at least as well" acceptable, or do you want "beats" kept as the hypothesis and
   reported against if it fails?
2. Wholeness: `docs/alexander.md` says wholeness stays a vector, never one number, but Phase
   9's penalty needs one. Keep the composite only for the piecemeal penalty, and report the
   properties separately everywhere else?
3. Should H2 also score a patch of old, organically grown fabric (for example Ahmedabad's
   walled city, a few kilometres from Wadaj) as a "what good looks like" reference?
4. (28 October) The business-as-usual baseline: is the recipe above close enough to how
   these sites would be built now, or is there a real layout to score instead?
5. (28 October) Climate-responsive buildings: add building-scale stand-ins for cooling to
   the type generators (12 November), or keep that part of the claim as an argument?
