# Research claim

Draft, 2026-10-21, for refining together. Brief: `docs/permutation-city-v3-prompt.md`.

## The working claim (as given)

> Urban form generated from the land (landform-derived rules, street networks found the way
> Frei Otto found path systems, and block patterns chosen by search rather than fixed by a
> grid) gives a wider range of designs that perform well, are more legible, and hold up
> better under climate shocks than form generated on a fixed grid. Growing it in steps with
> foresight beats designing it all at once.

## Proposed wording

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
