# Landform, heat and streets

Phase 6b. McHarg's reading of land is that valleys carry water and ridges carry movement.
This phase turns that into a fixed skeleton per site, which is a rules change, and the finer
streets inside it, which come from genes.

- Code: `pc/landform.py` (valleys, catchments, ridges), `pc/lst.py` (surface temperature),
  `pc/skeleton.py` (primary streets), and `pc/streets.py` with `app/engine/streets.ts`
  (streets on cell edges, in both engines).
- Every threshold below is named here and defined once in each engine:
  - Python: `pc/landform.py`, `pc/skeleton.py`, `pc/streets.py`
  - TypeScript: `app/engine/config.ts`

## 1. Sources

| Layer | Source | Notes |
|---|---|---|
| Ground | FABDEM v1-2 bare earth, 30 m (University of Bristol) | Free for non-commercial research (CC BY-NC-SA). Buildings and trees are removed. |
| Fallback ground | Copernicus GLO-30 | A surface model: heights include buildings and trees (see 5). |
| Mapped water | Overture water theme (from OSM): streams, drains, canals, rivers, ditches, water bodies | Wins where it disagrees with the DEM. |
| Roads | Overture transportation segments, every class except footpaths | Used for the skeleton's connections, and as the skeleton on flat land. |
| Surface temperature | Landsat 8/9 Collection 2 Level-2 `ST_B10`, read from Microsoft Planetary Computer (STAC, no key) | See 4. |
| Wind (regional) | ERA5 hourly 10 m wind, 0.25° (Hersbach et al. 2023, Copernicus Climate Change Service), through Open-Meteo's historical weather API (`pc/wind.py`) | Data CC BY 4.0, credit "Weather data by Open-Meteo.com" and Copernicus. The free API is for non-commercial use only (under 10,000 calls a day), the same limit as FABDEM's CC BY-NC-SA: a commercial use of this tool would need both replaced or licensed. One call per site. See `docs/streets.md`. |

## 2. Relief class

Relief is measured on the design ground's land:
- **relief:** the 5th to 95th percentile of ground height
- **slope:** the median slope between neighbouring cells
- **steep share:** the share of cells whose steepest slope to a neighbour is over 8% (the
  IRC hill road limit, `docs/streets.md`)

| Class | Rule |
|---|---|
| flat | relief under 5 m, or median slope under 0.5% |
| pronounced | relief of 20 m or more, and either median slope of 2% or more or a steep share of 15% or more |
| gentle | anything between |

- **Confidence is low** when a value is within a quarter of a class boundary, or when the
  terrain is the Copernicus surface model.
- **The surface model is always classed flat, by rule.** The site is marked to rebuild once
  FABDEM is back.
- **Why the steep share:** hills beside a valley floor. On Guwahati's Bharalu basin half the
  land is the flat bowl, so the median slope is 0.3% (flat) although the hills rise 90 m.
  The steep share is 6 to 8% on the four flat and gentle sites (DEM noise over 35 m cells),
  so 15% is about twice that floor.
- **Why 5 m:** FABDEM's vertical error in built-up land is roughly 1.5 to 2.5 m. Under about
  twice that, ridges and valleys found in the DEM are mostly noise.

| Site | Relief | Median slope | Steep share | Class |
|---|---|---|---|---|
| mumbai-ewf | 3.2 m | 0.29% | 6.8% | flat |
| mumbai-docks | 4.7 m | 0.58% | 6.1% | flat (low confidence) |
| ahmedabad-wadaj | 7.1 m | 0.58% | 6.4% | gentle (low confidence) |
| bengaluru-cascade | 31.5 m | 1.15% | 7.8% | gentle |
| guwahati-bharalu (first 2.4 km box) | 90.0 m | 0.58% | 34.7% | pronounced |

**Cell slope.** Each cell also gets `slope`, rise over run from the least-squares plane through
it and its neighbours, for rules to test (Guwahati: `steep hillside` over 25% is forbidden,
`hill slopes` over 10° constrained; the bye-law clauses are in its rules.yaml).

## 3. Valleys, catchments and ridges

The hydrology runs on the site's cells (design area and context margin), not on a raster:
- Rules, streets and metrics all live on cells and their shared edges.
- It works the same on hexes and squares.
- The cells are about the DEM's own grain: 35 m between hex centres, against FABDEM's 30 m.

It was checked by hand against the existing pooling analysis.

1. **Condition the ground.** Cells on a mapped channel are lowered by `BURN_M` = 3 m
   ("stream burning"). Depressions are then filled from the outlets up, with a priority-flood
   and a tiny slope (`EPS` = 0.1 mm per step) so filled flats still drain.
   - Breaching (cutting through embankments) would suit roads and bridges in a DEM better.
     FABDEM already removes buildings and trees, which are most of the urban obstructions.
2. **Flow direction.** Each cell drains to its lowest neighbour: six directions on hexes,
   four on squares (no diagonals).
   - D-infinity would split flow between neighbours. On gentle land it would smooth the
     accumulation a little. On flat land the result comes from noise either way, which is
     why flat land takes valleys from mapped water instead (see 5).
3. **Valleys.** A cell is a valley:
   - where `flow_acc_ha` (upstream area) reaches `valley_ha`: a site setting, default 10 ha,
     in hectares so it means the same on any grid and cell size
   - or where a mapped channel runs
   - On flat land, mapped channels only.
4. **Stream order (Strahler).** Each valley has an order. A mapped river or canal is at least
   order 3. Valleys are split into segments at heads and confluences.
5. **Catchments.** Each cell takes the valley segment it drains to. A cell that drains
   straight to the sea or a river is its own outlet catchment.
   - On flat land, catchments come from the nearest mapped drain (in cell steps), not from
     flow.
6. **Ridges.** A ridge is an edge between land cells in two catchments where neither drains
   into the other. The edge between a stream's upper and lower reaches crosses the valley,
   so it is no divide. A ridge is ranked by:
   - **strength:** the whole upstream basin on its smaller side, in ha
   - **consistency:** the share of its edges that touch a headwater cell, where at most two
     cells' worth drains in
   - A **strong ridge** has strength of `RIDGE_MIN_HA` (5 ha) or more and consistency of
     `RIDGE_MIN_CONSISTENCY` (0.5) or more.
7. **Valley buffers** (provisional), each side, by stream order (`VALLEY_BUFFER_M`):

   | Order | Buffer |
   |---|---|
   | 1 | the channel cell only |
   | 2 | 20 m |
   | 3 and up | 40 m |

   They are turned into rings of cells as other reaches are (on 20 m hexes, orders 2 and 3
   both give one ring). They are **provisional until checked against the DCPR and CGDCR
   nallah margins**, and the page says so.

Output layers:

| Layer | What it holds |
|---|---|
| `flow_acc_ha` | upstream area draining through the cell, ha |
| `mapped_channel` | a mapped channel runs through the cell |
| `valley_order` | Strahler order (0: not a valley) |
| `valley_buffer` | within a valley's buffer |
| `catchment_id` | the valley segment or outlet the cell drains to |
| `ridge` | strength of the strongest divide on the cell's edges, ha |
| `flow_to_row`, `flow_to_col` | the cell it drains to |
| `lst` | hot-season surface temperature, °C |

`landform.json` holds the relief class, the ridges as cell edges, and the settings used.

### Rules

The old "drainage lines" rule (4 ha draining through) is replaced in every site and in the
template by two rules:
- **valleys:** `valley_order >= 1`; landscape, water or wetland only; 80% permeable
- **valley buffer (provisional):** landscape, water or wetland only; 60% permeable

Streets sit on cell edges, so these rules keep buildings out. Streets may run beside a
valley, but not along it (see 6).

## 4. Land surface temperature

- **Scenes:** Landsat 8 and 9 Collection 2 Level-2, `ST_B10`. They come from the hot season
  of `site.lst_months` (default March to May) over `site.lst_years` (default 2023 to 2025).
  Scenes over 40% cloud are skipped.
- **Pixels dropped:**
  - those flagged in `QA_PIXEL` bits 0 to 5: fill, dilated cloud, cirrus, cloud, cloud shadow
    and snow
  - those whose surface-temperature uncertainty (`ST_QA`) is over 5 K. The cap was 3 K at
    first, but humid coastal air puts clear-sky Mumbai at 3.4 to 4 K, so 3 K dropped almost
    every scene. Cloud edges run 6 to 7 K.
  - whole scenes where less than half the box is clear
- **Conversion and combining:** the published scale and offset (0.00341802 × DN + 149 K),
  less 273.15, then the median of the clear scenes per 30 m pixel.
- **On the cells:** sampled at each cell centre. The scene list and dates are stored in
  `raw/lst.json` and shown on the page.

| Site | Clear scenes | Dates |
|---|---|---|
| mumbai-docks | 22 | 2023-03-20 to 2025-04-26 |
| mumbai-ewf | 23 | 2023-03-20 to 2025-05-12 |
| ahmedabad-wadaj | 54 | 2023-03-03 to 2025-05-20 |

**What it is not.** It is the temperature of the surface (roofs, roads, soil, canopy), not
of the air people breathe. Landsat's thermal band is about 100 m across, resampled by USGS
to 30 m. It shows where surfaces get hot across a site, not which side of a street is hotter.

**LST against the heat score, not yet decided.** The heat score's own per-cell model
(roofs 4.0, sealed 5.0, landscape 0.5, water −2.0), applied to today's land cover,
correlates with LST at:
- r = +0.23 at Mumbai EWF
- r = +0.32 at Mumbai Docks
- r = −0.10 at Wadaj

At Wadaj, vegetation runs slightly hot (r = +0.13): in the dry season grass and scrub get
hot, and the model counts all "green" as cool.

So LST sits beside the heat score for now:
- as a layer
- as the "cooling where it's hot" metric (see `docs/metrics.md`)

It neither replaces nor calibrates the score. Calibrating would first need the model to split
trees from grass and bare ground.

## 5. Flat land, and the surface-model fallback

- **Flat sites.** Ridges and valleys found in the DEM are mostly noise. Valleys come only
  from mapped water and drains, which closes the "drain networks for flat land" backlog item.
  Catchments come from the nearest drain, and ridges from the divides between drains.
- **No usable skeleton.** If even that gives nothing (no mapped drains, or no strong ridges),
  the skeleton is the existing road network, and the page says "skeleton from existing roads,
  not landform".
- **Mumbai.** Neither Mumbai site has a mapped drain: OSM has only the docks, and the city's
  storm-water drain network isn't open data. Both Mumbai sites use the roads.
- **The surface model.** When FABDEM can't be reached, a web build falls back to the
  Copernicus surface model. Its heights include buildings and trees, so fill and flow would
  trace rooftops. It is **unsuitable for urban hydrology**:
  - Those sites are classed flat with low confidence, and marked to rebuild once FABDEM is
    back.
  - The page warns wherever that source is used.
  - This leaves the free-for-commercial-use elevation source weak for this phase. FABDEM is
    non-commercial (CC BY-NC-SA). The only commercial-safe global source at this resolution
    is a surface model.

## 6. Streets

### Streets on cell edges

Streets run along the sides of cells, never through them: a street a whole 20 m hex wide
would be 35 m across. Each street side takes half its width from the cell on either side,
which comes out of that cell's buildable area. Building coverage then applies to the plot
that's left: coverage × (1 − street share), within the permeable minimum.

- Every design reports **gross** floor area (as if streets took nothing) and **net** floor
  area (after streets). The floor-area brief is judged on net.
- The coverage gene's range was widened to 0.35–0.90.

**Grid types differ.** On hexes three sides meet at every corner, so every junction is a T or
a Y, never a crossroads; squares give crossroads. Junction density and meshedness therefore
differ by grid type for similar layouts. Compare them only between designs on the same kind
of grid, as with heat.

**Drawing and metrics use different lines.** Edge streets zigzag on hexes. For drawing and
export, centrelines are smoothed (`centrelines` in `app/engine/streets.ts`): points averaged
with their neighbours, then rounded with Chaikin's method, with the ends fixed. Metrics use
the true edges.

### The skeleton: primary streets (`pc/skeleton.py`)

Fixed per site, worked out at export:
- **Landform:** the strong ridges, on the sides of design cells. Sides inside a valley
  corridor are dropped.
- **Joining:** each part is joined to the nearest side an existing road crosses, by the
  shortest path along cell sides.
  - A side between two valley cells (channel or buffer) is a crossing, a bridge or causeway.
    It costs `CROSSING_COST` = 6 sides' length, so paths cross valleys only where they must.
  - Crossings are counted against a cap: one per 300 m of valley of order 2 or more, and at
    least one.
  - A skeleton that can't reach a road is marked invalid.
- **Roads, on flat land:** existing roads of every class but footpaths:

  | Road class | Becomes |
  |---|---|
  | motorway to tertiary | primary street, 18 m |
  | residential, unclassified, living street | secondary street |
  | service, track, unknown | lane |
- **The site's choice** (`skeleton` in site.yaml): `auto` (the default) is the above, landform
  where there are strong ridges and roads otherwise; `roads` takes the existing roads even
  where there are ridges; `landform` asks for ridges. Guwahati's Bharalu basin is `roads`: a
  built-up basin whose major roads (GS Road among them) carry the city, where the ridges
  mostly ran across the flat valley floor.
- **Forbidden land:** the skeleton never runs between two forbidden cells (those aren't
  design ground). It may run along their edge.
- **Editing:** the skeleton is exported on design cells and on grid cells, so it maps onto a
  design ground rebuilt from edited rules. The landform chapter can switch any ridge off.

### Street genes: secondary streets and lanes

Four genes at the end of the genome. Genome version 2 has 51 numbers. A 47-number genome is a
**pre-street genome**: it grows with every street gene at 0.5, and is labelled.

| Gene | Range | What it does |
|---|---|---|
| `street_spacing` | 70–180 m | between parallel streets |
| `street_orientation` | 0–1 | 0–⅓ along the contours; ⅓–⅔ parallel to the valleys; ⅔–1 on a bearing (0–180°). On flat land, or without valleys, the bearing is used. |
| `street_pattern` | 0–1 | 0–⅓ a grid; ⅓–⅔ loops (cross streets staggered); ⅔–1 branching (every other spine dropped, so cross streets end in cul-de-sacs). Dead ends are allowed, and read as tree-like in the metrics. |
| `street_hierarchy` | 0–1 | secondary streets 9–15 m, lanes 6–9 m (primary streets are always 18 m) |

How the streets grow:
1. First-family streets follow level lines of the orientation field, every `street_spacing`
   metres. Cross streets follow the perpendicular, from a least-squares plane through the
   field.
2. No street runs along a valley corridor (both sides valley).
3. Parts that don't touch the skeleton are joined to it by the shortest path that keeps out
   of the valleys, or dropped.
4. Every block can then be reached: each region of cells not split by streets touches the
   network or the edge of the design ground.
5. Precedence: forbidden land, then the skeleton, then locks, then genes.
   - Streets sit on edges, so a lock never loses its cell. A locked building beside a street
     gives up the street's share.
   - A street between two water cells the genes made is dropped.
6. Buildings on a street rise a little higher (`STREET_FRONT_RISE`, × 1.1, capped).

Every design checks in both engines: same streets, same scores, same whole runs with the
shared random numbers (`test/parity`).

## 7. Known limits

- **DEM resolution.** At 30 m, FABDEM misses drains narrower than a cell, and the culverts
  and walls that steer water in a city.
- **Mapped drains are incomplete.** OSM has no drains for either Mumbai site. Mumbai's
  storm-water drain network isn't open data.
- **LST is about 100 m**, and measures surfaces, not air.
- **Buffers are provisional,** pending the DCPR and CGDCR nallah margins.
- **Ridge strength and consistency are our own proxies.** On low-relief land they are low
  confidence even when the class is "gentle".
- **Road skeletons inherit OSM's road geometry.** A dual carriageway becomes two parallel
  streets, and on hexes a road at an angle marks the sides on both of its flanks. The Docks
  skeleton reads as a braided band along P D'Mello Road and the Eastern Freeway.
- **The skeleton doesn't move with edited rules.** It is the site's own, mapped onto the new
  design ground. Sides whose cells stop being design ground drop out.
