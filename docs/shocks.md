# Shock tests

Any opened design can be put through three shocks: a higher sea, an extreme storm and a
heatwave. Each shows what fails and where on a map, and gives the scores before and after.
Code: `app/engine/shocks.ts` (the tests), `app/engine/scenarios.ts` (the presets and their
sources). It's TS only: shocks read a design, they don't breed one. `npm run shock-survey`
runs every preset on the front of one run per site (tables at the end).

## 1. Sea level

**Model.** The site's own connected bathtub (`pc/layers.py` `add_flood`), run in the browser
at any level:
- Land floods if it is below the sea and the sea can reach it through land that is also below.
- It runs on the whole grid (the design ground and its context), from the grid's sea cells.
- At the site's own levels it gives exactly the site's flood layers (a test checks this).

**What fails:**
- **Flooded ground.** The sea takes a flooded cell's storage, so it no longer holds rain. The
  flood storage score falls with it.
- **Buildings above the plinth.** A building loses every storey the water rises above its
  plinth, which is 0.45 m: the Model Building Bye-Laws' minimum above the road, as reproduced
  in secondary sources (the 2016 text wasn't checked). Floor area falls, and the gap to the
  floor-area brief changes with it.
- Heat, carbon, daylight and human scale don't move.

**Presets** (m above mean sea level; any level can be typed). Only coastal sites get these:
a sea in the grid, and `sea_levels` in `site.yaml`.

| preset | level | source |
|---|---:|---|
| high tide today | 2.5 | the site's working level (`site.yaml`) |
| monsoon surge today | 3.5 | the site's working level |
| monsoon surge in 2050 | 3.8 | the site's working level |
| monsoon surge, 2050, SSP2-4.5 median | 3.61 | surge today + AR6 rise from 2025 to 2050 at Apollo Bandar |
| monsoon surge, 2100, SSP2-4.5 median | 3.90 | the same, to 2100 |
| monsoon surge, 2100, SSP5-8.5 median | 4.14 | the same, SSP5-8.5 |
| monsoon surge, 2100, SSP5-8.5 high end | 4.98 | the same, 83rd percentile, including low-confidence ice processes |
| highest reported tide plus largest surge, today | 4.92 | 2.83 m tide + 2.09 m surge, Maharashtra Maritime Board as reported (`corpus/sites/mumbai-sea-levels.md`) |
| the same with 0.38 m of rise, 2050 | 5.30 | the same plan's 2050 allowance |

- **Where the AR6 figures come from.** IPCC AR6 relative sea-level projections at the Mumbai
  (Apollo Bandar) tide gauge, PSMSL 43 (Fox-Kemper et al. 2021; Garner et al. 2021). They are
  read from the NASA Sea Level Projection Tool's data for that gauge (2026-10-21) and stored
  in `scenarios.ts` (`AR6_MUMBAI`): medians and the 17th and 83rd percentiles by decade.
- **Baseline.** AR6 is relative to 1995–2014; rise is counted from 2025 (0.059 m under
  SSP2-4.5 at the gauge), because the sites' levels are today's.
- **Other coasts.** They are used only within 150 km of the gauge. A coastal site elsewhere
  gets only its own levels.

## 2. Extreme rain

**Model.** A storm of any depth falls on every cell at once:
1. Each cell holds what the storage score says its use holds: water 1.0 m, landscape 0.10 m,
   a plot 0.05 m × its permeable share.
2. The rest runs downhill along the landform's flow directions (`down`), filling storage on
   the way.
3. Water stands in the site's hollows (the `pool` layer, the priority-flood fill depth) once
   enough has arrived to fill them.
4. It leaves at the edge of the design ground.

There are no drains: in a storm this rare they are full. Mumbai's are designed for 25 to
50 mm an hour.

**What fails:**
- **Ponds and tanks that fill and spill.** Landscape that fills is only saturated ground
  (it holds 10 cm), so it is counted apart.
- **Standing water deeper than 15 cm.**
- **Buildings with standing water above the plinth (0.45 m).** No front design on any site
  has any, and it can't happen: no buildable cell sits in a hollow deeper than 45 cm. The
  rules keep building out of them (only Wadaj and Bengaluru have hollows that deep: 117 and
  13 cells).
- **The flood storage score against this storm.** It's the score's own formula with this
  storm's volume, as the evolution's climate shock computes it.

**Presets:**
- the site's design storm
- the 10-, 25-, 50- and 100-year one-day rainfall, and the wettest day in the record, from the
  nearest IMD grid cell (within 0.2°)
- near Mumbai, the Santacruz gauge's 944 mm of 26 July 2005

| site | IMD cell | 10-year | 25-year | 50-year | 100-year | wettest day |
|---|---|---:|---:|---:|---:|---|
| Mumbai (Docks, EWF) | 19.0° N 72.75° E | 307 mm | 392 | 465 | 549 | 528 mm, 5 July 1974 |
| Ahmedabad (Wadaj) | 23.0° N 72.5° E | 192 | 254 | 309 | 372 | 323 mm, 14 July 2000 |
| Bengaluru (cascade) | 13.0° N 77.75° E | 103 | 121 | 134 | 147 | 173 mm, 19 November 2021 |

**How they were computed.** The data is IMD's 0.25° gridded daily rainfall (Pai et al. 2014),
1951–2024, 74 years. For each year, the wettest day in the nearest grid cell with land; then a
GEV fitted to those 74 annual maxima by L-moments (Hosking 1990; Hosking and Wallis 1997). Run
`uvx --with imdlib --from imdlib python -I pc/imd_rain.py <folder>`; the download is 1.9 GB.
IMD's day is the 24 hours to 08:30 IST, so a date is the morning the rain was read.

**What the grid misses.** A 0.25° cell is about 27 km across, an areal mean, so it reads well
below a rain gauge. On 26 July 2005 the Santacruz gauge recorded 944 mm; the grid cell over
the docks recorded 492 mm, and the wettest cell nearby 733 mm. The table's levels are for an
area, not a point; the gauge figure is a preset of its own. Bengaluru's 100-year day (147 mm)
is close to its design storm (150 mm).

## 3. Heatwave

**Model.** Each cell's surface temperature in a heatwave is:

    T = today's hot-season LST at the cell
        + (the heat score's field for the design − the same field for today's land cover)
        + the heatwave's rise

- **Today's hot-season LST:** the Landsat median (`docs/landform.md`, section 4).
- **The heat score's field** is its per-cell model: roofs 4.0, sealed 5.0, unsealed 1.0,
  landscape 0.5, water −2.0, 0.1 a storey, smoothed over 100 m.
- **Today's land cover** goes through the same model: footprints as roofs with their heights,
  vegetation as landscape, bare ground as unsealed, the rest sealed. So the design replaces
  today's surfaces instead of adding to them.

**What fails.** Public ground hotter than today's hottest tenth of the design ground (the
90th percentile of today's LST there). Public ground is landscape cells plus streets, by area:
a street's length × its width, at the mean of the two cells it runs between. The page shows
the share on a usual hot-season day and in the heatwave. The heat score doesn't move: it
measures the design's own warming, which the weather doesn't change.

**Presets** (°C over a usual hot-season day; any rise can be typed):
- +2 °C, a smaller rise for comparison
- IMD's heat wave, +4.5 °C (a departure from normal of 4.5 to 6.4 °C)
- IMD's severe heat wave, +6.5 °C (a departure of more than 6.4 °C)

These come from the India Meteorological Department's heat wave criteria, as given in its
heat bulletins.

**Not decided.** LST is the surface, not the air, and IMD's criteria are air temperatures.
Adding an air-temperature departure to a surface temperature is a simplification; in a real
heatwave, sealed surfaces warm more than the air does. The heat model also correlates only
weakly with LST (r = −0.10 to 0.32; `docs/landform.md`).

## 4. How front designs hold up

The front of one run per site (NSGA-II, 20 generations × 40, seed 1), median (range) across
the front's designs (`npm run shock-survey`).

| site | sea, 2050 SSP2-4.5 (3.61 m): flooded, floor lost | 100-year rain: failing cells, storage | IMD heat wave: public ground overheated |
|---|---|---|---|
| Mumbai Docks (27) | 63%; 2% (1–3%) | 9% (2–10%); 33% (14–35%) | 2% → 71% (62–79%) |
| Mumbai EWF (28) | 30%; 0% | 11% (8–14%); 51% (30–60%) | 2% → 53% (37–73%) |
| Ahmedabad Wadaj (21) | inland | 7% (4–14%); 85% (72–93%) | 1% → 27% (19–34%) |
| Bengaluru cascade (30) | inland | 3% (2–4%); 172% (111–201%) | 7% → 44% (35–53%) |

What this shows:
- **Sea flooding is the terrain's, not the design's.** Every design on a site floods the same
  ground, because none of them raises it. Designs differ only in what they put there: floor
  lost runs 1–3% at 3.61 m and 10–14% at 5.3 m on Docks. Raising ground (the rules'
  `raised_ground`) isn't modelled.
- **Rain separates designs by their ponds.** At Docks, 100-year storage runs from 14% to 35%
  across the front.
- **Heat separates them most.** At Wadaj in an IMD heat wave, 19% to 34% of public ground
  overheats.
- **Bengaluru's tanks hold even the 100-year day.** Storage stays at 111–201%.

## 5. Limits

- **Sea:** a bathtub, with no waves, wave run-up, flow over time or defences. Designs can't
  raise ground.
- **Rain:** one day's total at once, no timing. No drains, and no infiltration beyond the
  storage depths. Water stands only in the hollows the terrain has today (the design's
  ponds are storage, not hollows).
- **Heat:** surface, not air. One summer's median scene stands for "a usual hot-season day".
  The threshold is relative to the site, so a cool site and a hot one both have a hottest
  tenth.
- **Rain return levels:** from gridded data (areal means). Only three IMD cells are tabled,
  so a drawn site elsewhere gets only its design storm and typed storms.
