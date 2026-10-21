# Piecemeal growth

Phase 9 step 4, 2026-10-21. Code: `app/engine/piecemeal.ts`. Experiment:
[`experiments/piecemeal-vs-oneshot.md`](experiments/piecemeal-vs-oneshot.md).

Alexander argues that a town should grow in many small increments, each one repairing and
completing what is there, not be laid down in one stroke (*The Oregon Experiment*, 1975;
*A New Theory of Urban Design*, 1987). The sandbox can now grow a site that way: in three
increments, 2025, 2035 and 2050. Choose "growth: piecemeal" in the run form.

## What happens

1. **Three increments.** By 2025 up to 40% of the floor-area brief is built, on up to 40% of
   the cells. By 2035 it is 70% on up to 70% of the cells, and by 2050 all of it on all of the
   cells. Each increment is its own run of the size in the form (generations × population),
   with NSGA-III and seed + k.
2. **Earlier increments are fixed.** A design in a later increment grows from its genome as
   usual, around the fabric. The cells already built are locked to their use, and their
   storeys, coverage and floor area are copied in exactly as built.
3. **New cells.** The design then builds new cells in order of its attractors' pull. It stops
   when the fabric reaches the year's share of the floor-area brief or the year's share of
   the land, whichever comes first. The 2050 increment builds every cell that is left.
4. **Unbuilt cells for now.** Cells not built yet are open ground, marked fallow. They count
   as landscape when an increment is scored.
5. **Streets.** The first increment lays out the street network from its four street genes.
   Later increments keep that network and build along it.
6. **What is built.** At the end of an increment, the design that gets built is chosen from
   its front, from the designs within the brief when there are any. It is the one with the
   best unweighted mean of the five scores (`quality`), less its wholeness penalty.
7. **Replaying a run.** The fabric is deterministic: the genomes built at each increment
   give back the same fabric (`replayFabric`). This is how saved runs and links reopen a
   piecemeal run, and how a design is opened grown around the fabric it grew in.

## The site changes between increments

Each increment is scored under its own year, using IPCC AR6 and SSP2-4.5 by default
(SSP5-8.5 can be chosen):

| | how |
|---|---|
| warming | Global warming over 1850–1900, from AR6 WG1 Table SPM.1: 1.1 °C for 2011–2020, then the best estimates for the near term (2021–2040) and the mid term (2041–2060), placed at their mid years and interpolated. It is counted from 2025. SSP2-4.5: 2035 +0.26 °C, 2050 +0.63 °C. SSP5-8.5: 2050 +0.97 °C. |
| sea | On coastal sites, today's monsoon surge level plus the AR6 rise at the tide gauge for that year (the same NASA data as the sea shock, `docs/shocks.md`). Inland sites have no sea. |
| storm | The site's design storm × (1 + 0.07 × warming). Heavy one-day rain grows about 7% per °C (AR6 WG1 SPM B.2.4). |
| heat | The hot season warms by the warming, since hot extremes over land warm at least as fast as the global mean. |

Under a year's conditions (`scoreUnder`), the scores change as follows:
- **Storage** is scored against that year's storm, and storage the sea floods is lost.
- **Heat** adds how far public ground runs above today's hottest tenth in that year's hot
  season.
- **The gap** to the brief loses the floors under that year's sea.
- Carbon, daylight and human scale don't change.

## Wholeness

Wholeness is a composite, 0 to 1 (`WHOLENESS`, `wholenessOf`). It uses the twelve of
Alexander's properties the engine measures that have a better end (`docs/metrics.md`, the
two Alexander groups), plus legibility and intelligibility (Phase 8):

> levels of scale, strong centres, boundaries, positive space, the void, gradients, rhythm
> (built), rhythm (skyline), local symmetry, balance, contrast, landmarks, legibility,
> intelligibility

Each property is scaled to 0..1 over its usual range in `docs/metrics.md`, with the better
end high, and clipped. The fourteen are then averaged with equal weight.

The properties with no better end (roughness, global symmetry and the like) are left out.
The weights are equal because nothing in Alexander ranks the properties against each other.
This is a reading of the theory I chose, not Alexander's own measure.

During a run, legibility uses the estimated Rn integration (as a promoted legibility does,
`docs/metrics.md`). The experiment reports exact wholeness.

## The penalty (a penalty, not a ban)

An increment is meant to repair the whole, not to damage it. Every design of an increment
gets a sixth objective:

    wholeness_kept = −max(0, wholeness before − wholeness after)

It is 0 when the fabric's wholeness holds or rises, and negative by how much it falls. A
design that lowers wholeness can still be kept and built if its other scores are worth it.
The penalty is also subtracted when choosing what to build. The page shows each increment's
wholeness before and after, and the penalty paid.

Two further changes from a plain run:
- **Near-copies** are judged only on the cells not built yet. Otherwise every design of a
  late increment would be a "copy", since they all share most of the site.
- **What doesn't apply:** locks, the pen, the timed shock and MAP-Elites.

## Cost

Wholeness is read on every design grown, and legibility's estimate is the expensive part.
On this laptop, a piecemeal run of 3 × 16 generations of 40 took 6–13 minutes. The same
number of designs in a plain run took 10–35 seconds. The page says to expect minutes.
