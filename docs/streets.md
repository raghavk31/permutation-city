# Streets, blocks and plots: the rule values and their sources

Version 3 grows a vector street network (`app/engine/plan/`). This page lists every number
that shapes a street, block or plot, where it comes from, and whether it was checked.

Checked 2026-10-22. Status key:

- **checked**: read in the source itself (clause or table given).
- **secondary**: taken from a secondary source; the primary text was not available.
- **design**: our choice; no source sets it. The reason is given.
- **conflict**: the sources disagree; the choice is explained.

Where the engine keeps a value: `RULES` in `engine/plan/network.ts`, `FAMILIES`, `RANGES_V3`
and the street widths in `engine/config.ts`, the plot rules at the top of
`engine/plan/plots.ts`.

## Sources

| Short name | Document | Where read |
|---|---|---|
| IRC:86 | IRC:86-2018, *Geometric Design Standards for Urban Roads and Streets* (first revision) | [law.resource.org PDF](https://law.resource.org/pub/in/bis/irc/irc.gov.in.086.2018.pdf) |
| SP:118 | IRC:SP:118-2018, *Manual for Planning and Development of Urban Roads and Streets* | [law.resource.org PDF](https://law.resource.org/pub/in/bis/irc/irc.gov.in.sp.118.2018.pdf) |
| SP:41 | IRC:SP:41-1994, *Guidelines for the Design of At-Grade Intersections in Rural and Urban Areas* | [law.resource.org PDF](https://law.resource.org/pub/in/bis/irc/irc.gov.in.sp.041.1994.pdf) |
| IRC:103 | IRC:103-2012, *Guidelines for Pedestrian Facilities* | [law.resource.org PDF](https://law.resource.org/pub/in/bis/irc/irc.gov.in.103.2012.pdf) |
| Hill roads | IRC hill road gradients (IRC:52 / SP:48 tables), as reproduced in course notes | [NPTEL](https://archive.nptel.ac.in/content/storage2/courses/105101087/17-Ltexhtml/p3/p.html), [Arunachal PWD](https://www.arunachalpwd.org/pdf/sk_chapter-6.pdf) |
| DCPR | Mumbai *Development Control and Promotion Regulations 2034*, Part IV | `corpus/_sources/mumbai-dcpr-2034.pdf` |
| CGDCR | Gujarat *Comprehensive General Development Control Regulations 2017* | `corpus/_sources/gujarat-cgdcr-2017-part2.pdf` |
| NACTO | NACTO *Urban Street Design Guide*, "Corner radii" | [nacto.org](https://nacto.org/publication/urban-street-design-guide/intersection-design-elements/corner-radii/) |
| Marshall | S. Marshall, *Streets and Patterns* (Spon, 2005) | the pattern families only (no number taken from it) |

The IRC hosts on law.resource.org also list files named IRC:103-2022 and IRC:SP:48-2023 that
turned out to be other documents (a bridge code and IRC:SP:129-2022). The 2012 IRC:103 was
used, and the hill-road gradients stay secondary until the Hill Road Manual can be read.

## How our classes map to the codes

The engine has three street classes. They are read against IRC:86 Table 3.1 (design speeds,
plain terrain) and Table 4.1 (land widths), and the SP:118 Annexure 3 templates:

| Our class | Width | Reads as | Design speed |
|---|---|---|---|
| primary | 18 m | collector street (IRC:86 15-30 m; SP:118 template 18A) | 40 km/h |
| secondary (Otto routes) | 12 m | local street (IRC:86 10-15 m; SP:118 template 12A) | 30 km/h |
| local, by family | 9, 7.5 or 6 m | access street or shared street (SP:118 templates 9A, 6A; DCPR layout roads) | 20 km/h |

20 km/h for local streets is IRC:86 3.3's posted speed for dense cores, near schools and
within 500 m of transit stations. It is also the IRC:86 Table 3.1 design speed for local
streets in mountainous terrain.

## Street widths

| Value | Status | Source |
|---|---|---|
| primary 18 m | checked | SP:118 Annexure 3, template 18A (18 m, footpaths both sides); inside IRC:86 Table 4.1 collector 15-30 m (plain) |
| secondary 12 m | checked | SP:118 template 12A; IRC:86 Table 4.1 local street 10-15 m. SP:118 3.3: "On streets less than 12 m right of way, pedestrians and vehicles may share", so 12 m is the narrowest street with separate footpaths |
| local 9 m (orthogonal, contour, radial) | checked | SP:118 template 9A (footpath one side); DCPR layout-road table (9 m for roads 150-300 m long, or serving 4,000-10,000 m²) |
| local 7.5 m (organic) | checked | DCPR layout-road table (7.5 m for roads under 75 m serving 1,500-4,000 m², or 75-150 m long); CGDCR 6.17 waives the cul-de-sac turning head for a 7.5 m road up to 110 m |
| local 6 m (tight and shaded) | checked | SP:118 template 6A (shared street); DCPR layout-road table (6 m for roads under 75 m serving under 1,500 m²); IRC:86 5.4 note ii (5.5 m least width without kerbs) |

Below 10 m the local streets are under IRC:86's local street range. They are access and shared
streets, which SP:118 and both DCRs provide for.

## Network

| Rule | Value | Status | Source and note |
|---|---|---|---|
| local street spacing (`local_spacing` gene) | 50-125 m | checked (upper); design (lower) | SP:118 3.2.1.3: a vehicular road at least every 250 m and a walking or cycling route at least every 125 m; SP:118 3.4 grid of 1,000 m (arterial), 250 m (collector), 125 m (local and NMT). Was 50-140 m. **Hills: SP:118 lowers these to 100 m and 80 m.** Not yet applied; to apply when the hilly site (Guwahati) is built. The 50 m floor is a design value (below it the plots of every family no longer fit back to back) |
| block length | ≤ 125 m a side, else a walking route through | checked | SP:118 3.2.1.1. Not a separate rule in the engine: the spacing and the perimeter cap hold it |
| block perimeter (upper, by family) | 500 m (360 m for tight and shaded) | checked | SP:118 3.2.1.1: "A walkable block perimeter ranges from 400 m to 500 m". Was 600-700 m for three families. Longer blocks are split by a lane; those that can't be are flagged |
| block perimeter (lower, by family) | 120-240 m | design | No code sets a least perimeter. Siksna (1996, *Urban Morphology* 1) on block sizes in North American and Australian centres is the reference to check; not yet read |
| block area | ≤ 15,000 m² | checked | SP:118 3.2.1.2. Follows from the 500 m perimeter for squarish blocks; not a separate rule |
| dead end | ≤ 60 m, local only, ending at open ground | design (stricter than the codes) | DCPR allows straight cul-de-sacs to 150 m (275 m with a second turning space); CGDCR 6.17 to 110 m for a 7.5 m road without a turning head. SP:118 3.2.1.4 asks for route directness of 1.1-1.5 and says cul-de-sac layouts (1.6-2.5) "are to be avoided", which is why we are stricter |
| junction angle | 60-120° | checked | SP:41 2.4 (i): roads "shall meet at or nearly at right angle. However, angles above 60° do not warrant realignment" |
| junction spacing (least, flagged) | local 25 m, secondary 40 m, primary 60 m | conflict | SP:41 8.2.1 suggests at least 150 m on collectors, 300 m on sub-arterials, 500 m on arterials, and free access on local streets. SP:118 (2018) asks for a route every 125 m, which on a collector means junctions closer than SP:41's 150 m. We follow SP:118's walkable grid; the SP:41 values are for traffic capacity and would forbid it. Our least spacings are design values, set to keep staggered junctions apart |
| junction merge | 20 m | design | Junctions closer than this on one street are one junction. An engine tolerance |
| corner (kerb) radius | 4 m chord splay at block corners under 30° | checked | IRC:86 5.1.3: turning radii on minor collectors and local streets "shall not exceed 4 m" (9 m on arterials and major collectors); NACTO: 10-15 ft (3-4.5 m), smaller preferred; CGDCR Table 6.48: 3 m up to 6 m roads, 4.5 m up to 9 m |
| curve radius (least, by class) | local 15 m, secondary 30 m, primary 60 m | checked | IRC:86 Table 8.2 at 7% superelevation: 15 m at 20 km/h, 30 m at 30 km/h, 60 m at 40 km/h. IRC:86 8.2.1 says urban sections with frequent junctions should desirably keep superelevation to 4%, which gives 20, 40 and 70 m. We use the code's limit (7%) for the flag, and note the stricter values here |
| gradient (most, by class, flagged) | local 8%, secondary 6%, primary 4% | checked (primary); secondary (others) | IRC:86 9.2: "a gradient of 4 per cent should be considered the maximum for urban roads", 2% where slow traffic dominates. Hill roads (secondary source): ruling 5%, limiting 6%, exceptional 7% (mountainous), 6, 7 and 8% (steep), exceptional only for short stretches. IRC:103 6.5: under 1:20 (5%) needs no rests; 1:10 (10%) or steeper is "extremely difficult and dangerous" for most disabled people. So local streets stop at 8%, under the 1:10 line. Was 10, 8 and 6% |
| least street gradient (drainage) | not enforced | checked | IRC:86 Table 9.1: kerbed pavements 0.5% desirable, 0.3% least. The contour streets' `MIN_STREET_SLOPE` (0.3%, version 2) matches the least value |

### Measuring the flags

Two measurement faults were fixed with this page (2026-10-22):

- **Gradient** was the height step between two cells over the 10 m between samples. Heights
  are per cell, so one step spans two cell centres (about 35 m on a 20 m hex). It is now
  measured between the centres. Flags per design: Wadaj 190 → 15, Bengaluru 315 → 53 (with the
  new limits).
- **Bends** were smoothed with a spline, which can't open a tight corner. The repair now
  fillets each corner with an arc of the class's least radius (`fillet` in `geom.ts`).
  Primary and secondary bend flags fell by half to three quarters. Local flags remain (50-60 per design on
  Wadaj and Bengaluru, about 0.8 per km of street): bends of 8-15 m radius near the ends of
  short streets, where the legs are too short for a 15 m arc. They are listed on the design.

## Blocks and plots (`FAMILIES`, `plots.ts`)

| Value | Status | Source and note |
|---|---|---|
| frontage and depth ranges by family (6-30 m, 12-40 m) | design | No code sets them; the codes only set a floor (CGDCR 6.4: a plot of at least 18 m², no side under 3 m). To compare with measured plots on the benchmark sites (Open Buildings footprints and OSM parcels) before the paper |
| plot shape: fill ≥ 0.6 of its box, narrow side ≥ 0.6 × least frontage | design | So no plot is a sliver or wedge. architecture-v3 5.4 step 5 has the survey |
| block sliver | blocks under 400 m² merge into a neighbour | design | An engine tolerance |
| corner splay | 4 m | checked | as the kerb radius above |

## Wind (the `f_wind` gene)

The tensor field can turn streets toward the prevailing wind, so streets carry breeze through
the fabric. The wind is the **regional** wind, not the wind in the site's streets.

- **Source:** ERA5 hourly 10 m wind, 2015-2024 (Hersbach et al. 2023, doi:10.24381/cds.adbb2d47),
  through Open-Meteo's historical weather API, model `era5`. `pc/wind.py`; cached as
  `data/<site>/raw/wind.json`; written into the site file as `meta.wind`. Terms beside
  FABDEM's are in `docs/landform.md` section 1.
- **Regional:** ERA5 is a 0.25° grid. The nearest grid point is kept with its distance:
  Mumbai 17 km (19.00 N, 73.00 E, across the harbour), Wadaj 11 km, Bengaluru 13 km.
  Sea breezes at the shore, hills and buildings change the wind locally; none of that is in it.
- **Which wind:** the hot-season afternoon, March-May 14:00-17:00 local (the months and hours
  the shade score uses), since that is when a breeze matters most. Hours under 0.5 m/s are calm
  and left out.
- **Axis:** the circular mean of the doubled bearings, so a street on the axis serves wind from
  either end. Its consistency (0 to 1) scales the gene's pull, so a wind without a clear axis
  steers little.
- **Seasons kept** (for the page and the paper): year, hot season, hot afternoons, monsoon
  (June-September), winter (December-February): a 16-sector rose of where the wind comes from,
  calm share, mean speed, axis and consistency.

| Site | Hot afternoons: from, axis, consistency | Monsoon: from, consistency | Winter: from |
|---|---|---|---|
| Mumbai (Docks, EWF) | 292.5° (WNW, the sea breeze), 103°, 0.78 | 225° (SW), 0.56 | 0° (N) |
| Ahmedabad (Wadaj) | 270° (W), 93°, 0.38 | 225° (SW), 0.36 | 45° (NE) |
| Bengaluru (cascade) | 90° (E), 100°, 0.47 | 270° (W), 0.80 | 90° (E) |

Status: **design** for the choice of season and the consistency scaling; the data are as
published. Orienting streets to the wind for cooling is not a code rule; its effect on the
heat score is part of the evaluation (docs/research/claim.md), not assumed.

## Pattern families

The five families (rotated orthogonal, contour-following, radial, organic, tight and shaded)
follow Marshall's pattern types (*Streets and Patterns*, chapter 4: the A-type "Altstadt"
core, the B-type "bilateral" grid, the C-type "conjoint" pattern) and the v3 brief. No number
in the table above is taken from Marshall.

## Engine tolerances (not design rules)

These shape the geometry, not the city. They are listed so nothing is hidden:

- Skeleton cleaning (`SKELETON` in `ground.ts`): 4 m raster, merge 14 m (20 m for roads, so a
  dual carriageway's two sides merge), holes under 4,000 m² filled, spurs under 30 m pruned,
  9 m simplification, 6 m spline step, ends within 20 m joined.
- Tensor field streamlines (`FIELD` in `field.ts`): 8 m step, sources' pull halves at about
  120 m, streamlines under 30 m dropped, 4 m snap.
- Network (`RULES` in `network.ts`): ends within 8 m snap, vertices within 1.5 m merge, a loose
  end may be carried 120 m to meet a street, routes within 25 m of the skeleton fold onto it.
