# Typologies: programme first, precedents as seeds

Draft, 28 October 2026. The building-scale search starts from programme and from precedents:
forms that people built over centuries for a climate and a material, and a few modern ones that
did the same with new means. Each precedent is written down as numbers in one shared grammar,
seeds the first generation of the search for its programme, and is then evolved for this site's
sun, wind, water and density. Nothing here is built yet.

Every figure carries its source. A figure marked **assumed** has no source we could read and is a
placeholder until one is found. Confidence is **high** (a primary or scholarly source),
**medium** (a reliable secondary source, or sources that agree), or **low** (one popular source,
or sources that disagree).

## The pipeline

1. **Programme from the land.** Each block or piece of ground gets a programme from the layers
   already in the engine (flow lines, sinks, flood depth, wind, street integration, junctions).
   Quantities come from the population the housing holds, through published norms.
2. **Precedents for the programme.** The library lists, per programme, the precedents that serve
   it, with their climate of origin and the mechanism that answers it.
3. **One grammar.** Every precedent is a point in the same set of parameters (below), so two
   precedents can be crossed and the child is a real hybrid.
4. **Precedents seed the search.** Generation 0 of each programme's search is its precedents,
   scaled to the block. Their scores make the first front.
5. **Evolution reaches the density.** Floor area within 10% of the block's target is a
   constraint, as at urban scale. Precedents that are too sparse are not removed: the grammar's
   ranges reach past each precedent's own, so the search can stack, repeat, raise or join them
   until they carry the density.
6. **Drift.** Each result reports its nearest precedent and how far it moved from it, parameter by
   parameter. "A pol reaches FSI 2.5 with little change; a tulou needs a second ring and a
   narrower court" is a finding a designer can use.

## Bengaluru's climate, and what transfers

Bengaluru sits in the NBC 2016 **temperate** zone at about 920 m (ASHRAE/NBC paper below; medium).
It is mild all year with two monsoons. The engine already has its hot-afternoon wind axis
(`pc/wind.py`) and land surface temperature, so the site's own numbers decide, not the label.

What matters most here, in order: **shade** on streets and façades in the hot months (March to
May), **cross-ventilation** through the year, and **rain** handled where it falls. Thermal mass
matters less than in Ahmedabad or Kutch. So from each precedent we take the mechanism that fits:
- from hot-dry precedents (pol, bhunga, stepwell): mutual shading, deep narrow streets, the
  chowk as a light and air well, storage of rain below ground;
- from warm-humid precedents (tulou, nalukettu, chang ghar): courts open to rain, deep eaves,
  raised floors, rooms one deep for cross-ventilation;
- from modern precedents (tube house, Belapur, Aranya, chawl): density at low cost, stack
  ventilation in section, incremental growth.

## The grammar

Shared by every precedent. Ranges are the search's, wider than any precedent's own.

| Group | Parameter | Range (search) | Notes |
|---|---|---|---|
| unit | footprint | rectangle, circle | circle for bhunga and tulou rooms |
| unit | width, depth (m) | 2.5-20, 3-24 | room or house |
| unit | storeys | 1-8 | four is the default ceiling (decision 12.12) |
| unit | floor height (m) | 2.5-4.5 | |
| arrangement | kind | row, ring, court, cluster, slab, stacked | |
| arrangement | ring depth (m) | 3-12 | rooms one or two deep |
| arrangement | count (rings, rows, units per cluster) | 1-4, 1-12, 3-12 | |
| arrangement | shared walls | yes / no | pol and chawl share; Belapur and bhunga don't |
| void | inner court or chowk, as a share of the plan | 0-0.5 | |
| void | court height to width | 0.3-4 | sun on the court floor, shade in the afternoon |
| edge | street height to width | 0.5-6 | PLEA 2009: 1.2-5.7 shades 70-90% of a street |
| edge | verandah, otla or gallery depth (m) | 0-3 | |
| edge | eave overhang (m) | 0-2.5 | tulou about 2 m |
| ground | raised floor (m) | 0-4 | chang ghar; raised ground where flood needs it |
| ground | sunken court depth (m) | 0-12 | stepwell, kalyani |
| skin | wall thickness (m) | 0.2-2 | reported, not scored (no thermal model in A) |
| skin | porosity, the share of façade open (jali, louvre) | 0.05-0.6 | cross-ventilation |

## Housing

### Pol house (Ahmedabad; hot-dry)
- **Form:** row houses with shared walls on a dead-end street behind a gate. Narrow frontage,
  deep plan, an internal chowk open to the sky, an otla (raised step) on the street. Upper floors
  often project over the street.
- **Numbers:**
  - frontage about 4-8 m, depth about 15 m, streets about 1-4 m (lecture deck on Scribd; low);
  - pols hold about 5-10 to 50-60 houses (Wikipedia, citing the Bombay Presidency Gazetteer; medium);
  - in the walled city only 17.3% of the area is street (Agarwal, PLEA 2009; medium);
  - a street height to width of 1.2-5.7 shades 70-90% of it; N-S at 1.2 shades as much as E-W at
    2.6 (Agarwal, PLEA 2009, Ecotect simulations; medium);
  - more than 72% of people in shade felt comfortable outdoors at 31 °C (same; medium);
  - most multi-storey houses have a covered rainwater reservoir below the yard (Gazetteer via
    Wikipedia; medium).
- **Mechanism:** mutual shading of streets and walls, a stack of air through the chowk, rain
  stored under the house.
- **Seed:** row, shared walls, width 6, depth 15, storeys 3, chowk 0.12, street H/W 2.5, otla 1.2.
- **Gaps:** chowk size and storeys measured. Rawal (PLEA 2017) logged pol houses for a year; the
  results are behind CEPT's repository, which was unreachable.

### Fujian tulou (Hakka, Fujian; humid subtropical)
- **Form:** one to four concentric rings of identical rooms around a court; each family owns a
  vertical stack. Ground and first floors have no outer windows. Rammed earth walls, about 2 m
  eaves.
- **Numbers** (Wikipedia, "Fujian tulou"; medium; the article's own room totals don't add up in
  two cases):

  | Tulou | Diameter (m) | Storeys | Rooms |
  |---|---:|---:|---|
  | Cuilin Lou | 14 | 3 | |
  | Yuchang Lou | 36 | 5 | 50 per floor |
  | Chengqi Lou | 62.6 | 4 | 72 per level, outer ring; second ring 2 storeys, 40 per level |
  | Eryi Lou | 71 | 4 | 48 per level |
  | Shunyu Lou | 74.1 | 4 | 64; outer wall 15 m high, 1.6 m thick |
  | Fusheng Lou | 77.42 | | |

  - Outer walls about 2 m at the base, about 1 m at the top (same; medium).
  - Chengqi Lou held 57 families, about 300 people (same; medium).
  - Room width at the outer wall for Chengqi Lou: π × 62.6 / 72 ≈ 2.7 m (derived).
- **Mechanism:** a closed ring shades its own court, thick walls damp the swing, the court
  collects rain and air.
- **Seed:** ring, diameter 40, ring depth 8 (assumed), storeys 4, court 0.4, eave 2, porosity
  0.1 on the outside and 0.4 on the court.

### Bhunga (Kutch; hot-dry, seismic)
- **Form:** a single round room with a conical thatched roof on a central post; a family has
  several, set apart.
- **Numbers** (World Housing Encyclopedia report 72, Choudhary, Jaiswal and Sinha, IIT Bombay; high):
  - inner diameter 3-6 m, one storey of 2.5 m;
  - about 3 m between buildings;
  - walls taken about 1 m into the ground as a foundation;
  - three openings: one door, two small windows;
  - few bhongas were badly damaged in the 2001 Bhuj earthquake.
- **Gaps:** wall thickness not given in the report (one build account says 60 cm; low). The
  arrangement round a shared yard is described in popular sources only (assumed).
- **Mechanism:** a round plan with no corners to crack and a small surface for its volume;
  thick earth walls; separate rooms round an outdoor living yard.
- **Seed:** cluster, circle, diameter 5, storeys 1, units per cluster 5, gap 3. The furthest from
  Bengaluru's density: the drift readout will show what it takes (a stacked or ringed bhunga).

### Nalukettu (Kerala; warm-humid)
- **Form:** four wings joined around a nadumuttam, a court open to the sky that takes the rain;
  deep eaves and verandahs.
- **Numbers:** none found in a usable source; one guide quotes 65 air changes an hour with no
  traceable reference. Seed **assumed:** court 6 × 6 m, wings 5 m deep, 1-2 storeys, eave 1.2.
- **Mechanism:** rooms one deep for cross-ventilation, a rain court, eaves over walls.
- **Why keep it:** its climate is the closest to Bengaluru's among the houses here.

### Chang ghar (Mising, Majuli and Dhemaji, Assam; flood plain)
- **Form:** a house on bamboo stilts.
- **Numbers:**
  - platforms "at least 10 feet" (about 3 m) high on Majuli (UNDRR feature; medium);
  - in Dhemaji, raised about one foot above last year's flood: "water up to five feet, we raise
    to six" (Dialogue Earth; medium);
  - poles set in pits about 3.5 feet deep (same; medium).
- **Mechanism:** the floor sits above the flood; the ground below stays open to water.
- **Use here:** the raised-floor parameter, set per block from the 100-year flood depth plus a
  freeboard (0.3 m, assumed). It answers the rain shock directly.

### Tube house (Charles Correa, Ahmedabad, 1961-62)
- **Numbers:**
  - about 3.6 m wide and 18.2 m long (secondary sources; low);
  - row houses at the same density as the walk-up flats the brief asked for (Charles Correa
    Foundation; high).
- **Mechanism:** a sloping section draws warm air up and out at the top, with a low inlet; a
  pergola over the inner court.
- **Seed:** row, shared walls, width 3.6, depth 18, storeys 2, stack section.

### Chawl (BDD chawls, Mumbai)
- **Numbers:** ground plus three; about 10 rooms of about 160 sq ft (about 15 m²) on each side
  of a central corridor about 3 m wide; courtyards between buildings; 207 buildings with
  16,544 tenements (court filing, livelaw; medium).
- **Mechanism:** a shared corridor or gallery as the street of the building.
- **Seed:** slab, rooms 3 × 5 m, double-loaded, corridor 3 m, storeys 4.

### Belapur incremental housing (Correa, Navi Mumbai, 1983-86)
- **Numbers** (Charles Correa Foundation; high):
  - plots 45-70 m², each house free-standing (no party walls), so each can grow;
  - seven houses around a shared court 8 × 8 m;
  - three of those around a court 12 × 12 m (21 houses);
  - three modules around a space about 20 × 20 m;
  - designed for about 500 people per hectare, open space and schools included.
- **Mechanism:** a hierarchy of courts; low rise at high density; growth over time.
- **Seed:** cluster, 7 units per court, court 8, storeys 1-2.

### Aranya (B. V. Doshi, Indore, 1983-89)
- **Numbers:** about 6,500 dwellings on 85 ha net for 60,000 people, about 76 dwellings a
  hectare; smallest plots 35 m², given as a plinth, a service core and one room; six sectors
  around a central business spine (Aga Khan Award citation; high).
- **Mechanism:** the street as the shared room; houses grow around a core.
- **Seed:** row, width 4.5, depth 8, storeys 1-3, with the service core fixed.

## Water

### Stepwell (vav, baori)
- **Rani ki Vav, Patan:**
  - about 64-65 m long and 20 m wide, about 27 m deep, seven storeys of terraces;
  - a well shaft about 30 m deep and 10 m across;
  - a tank 9.5 × 9.4 m at 23 m depth
  (Wikipedia and UNESCO nomination; medium).
- **Chand Baori, Abhaneri:** 11 storeys of steps, about 850 AD (popular sources; low).
- **Cooling:** the 5-6 °C at the bottom is tradition, not a measurement. A Cardiff study in
  Jodhpur is measuring it now (ICUC12 abstract); until it reports, the stepwell's cooling stays
  **assumed** and is not scored.
- **Mechanism:** reaches the water table through the year, stores and recharges, a shaded public
  room below the street.
- **Seed:** sunken court, length 40, width 15, depth 12, terraces 5, colonnade storeys 1.
  Scored on storage volume and recharge, not on cooling.

### Kalyani and the kere cascade (Bengaluru)
- **System:**
  - tanks linked by raja kaluves (main channels) down the valleys;
  - each bund has an overflow weir (kodi) and a sluice (toobu);
  - the overflow of one tank feeds the next: Parappana Agrahara, then Kudlu, then Haralur, the
    head of this project's Bengaluru site
  (Down To Earth, Citizen Matters; medium).
- **Kalyani:** a stepped temple tank, often below the water source. The Nandi Tirtha kalyani has a
  two-storey colonnade round it and drains to Jakkarayana kere (Wikipedia; medium). No measured
  sizes found.
- **Use here:** the water edge of the site's own tanks: bund, weir and sluice placed on the flow
  lines; kalyanis as sunken courts on the low points. This is the precedent with the strongest
  claim to belong on the site.

### East Kolkata Wetlands (water, food and waste in one loop)
- **Numbers:**
  - a 12,500 ha Ramsar site (2002);
  - about 4,000 ha of sewage-fed fish ponds (bheris), or 254 ponds on 5,852 ha by another count;
  - the city's 750-1,000 million litres a day of wastewater pass through them
  (India Water Portal, Mongabay India; medium; the figures disagree).
- **Derived:** about 4-8 ha of ponds per million litres a day. Low confidence, but enough to size
  a treatment wetland against a population's sewage.
- **Mechanism:** sun and algae treat sewage; fish and vegetables use the nutrients.
- **Use here:** the precedent for the flows readout (waste to food); a treatment wetland
  typology on low, wet ground.

## Food

### Hydroponic greenhouse
- **Lettuce, Yuma, Arizona (a model, not a farm):** 41 ± 6 kg/m²/yr hydroponic against 3.9 in a
  field; 20 L/kg of water (Barbosa et al. 2015; high as a model, low as a forecast for India).
- **India, closed-loop:** 85 L/kg of water against 1,146 L/kg in open furrow fields; 66 MJ/kg of
  energy (Karimzadeh and Rulli 2025; medium).
- **Mechanism:** food grown where people live, with a fraction of the water. In a warm climate
  the cooling energy is the cost.
- **Seed:** slab, one storey of 4.5 m, porosity high; or on roofs as a second layer.
- **Yield used:** 41 kg/m²/yr, labelled modelled, until an Indian figure is found.

## Mobility and commerce

### Sarai (caravanserai)
- **Numbers:**
  - Saadabad (Azad Kashmir, Mughal): 50 × 50 m, with 13, 13, 12 and 12 rooms on the four sides,
    each about 3 m square (Pakistan Department of Archaeology; medium);
  - Sarai Amanat Khan (Punjab): 168 × 165 m with gateways at the centres of two sides (Wikipedia;
    medium).
- **Mechanism:** a ring of cells round a court, one gate; a place to stop, trade and rest.
- **Use here:** a mobility hub at a busy junction (bus stop, shared bikes, charging, kiosks) built
  as a court ringed by small units.

### Bazaar street
- The pol's otla and projecting upper floors applied to a market street: a shaded arcade at the
  ground floor on busy frontage. Numbers from the pol (street H/W) and from the frontage types
  already in the engine. **Assumed** until a measured bazaar section is found.

## Education

### Laurie Baker's schools (Kerala)
- Classrooms each of their own shape round courtyards; brick jali walls; sloping roofs with
  vents (Arts Illustrated, Harvard GSD; low on numbers, none measured).
- **Seed** (assumed): cluster of rooms 7 × 8 m round a court of 12 × 12 m, one or two storeys,
  porosity 0.4.

## Energy and industry

No vernacular precedent. Massed in A as plain buildings of their use, sized by the norms below:
solar canopies over parking and markets; a biogas plant beside the waste site; workshops on
freight streets, downwind.

## Programme

### Where each goes

| Programme | Where | From |
|---|---|---|
| Water | flow lines, sinks, tank edges | `pc/hydro.py` lines, sinks, lake buffers |
| Food | flat ground that can flood, near water; roofs | flood depth, slope, distance to water |
| Waste | downstream and downwind of homes, on service streets, next to energy and food | wind axis, flow direction, street class |
| Energy | roofs, canopies over parking and markets; biogas beside waste | roof area, the waste site |
| Mobility | busiest junctions, so most homes are within 400-800 m | integration, junctions, existing transit |
| Commercial | busy frontage, near transit | frontage types |
| Residential | safe ground within a walk of school, park and stop | flood, slope, access |
| Education | spread by walking catchment, away from industry and arterials | population, access |
| Industrial | downwind, on freight roads, away from water and homes | wind, street class, buffers |
| Cultural | landmark junctions and water edges | landmarks, lake edges |

### How much

From the housing's population, through:
- **URDPFI Guidelines (2015):** schools, colleges, health and land-use shares;
- **CPHEEO Manual:** water supply of 135 litres per person per day, and sewage;
- **Solid Waste Management Rules 2016:** waste per person;
- **energy:** load per m² by use.

All of these are **to read in the source** before any figure enters the engine. The brief's own
mix wins where it gives one.

### Flows between the public systems

| From | To | Loop |
|---|---|---|
| waste | energy | biogas |
| grey water | food | irrigation |
| food scraps | food | compost |
| roof runoff | water | storage and recharge |
| sewage | food | treatment wetland and fish ponds (East Kolkata) |

A readout in A: the share of each flow that closes on the site, and the distance between the
programmes it links. An objective in B.

## Open

- Pol and nalukettu measured sizes: the PLEA 2017 paper (Rawal) and CEPT theses (Belgudri 2013)
  are behind CEPT's repository.
- Stepwell cooling: wait for the Cardiff Jodhpur measurements; not scored until then.
- Kalyani sizes in Bengaluru: a survey (INTACH, or the lake authority) would replace the
  assumed seed.
- An Indian hydroponic yield per m² to replace the Arizona model.
- More precedents for B: wind catchers (badgir), Jaisalmer havelis, Chettinad houses, Bhutanese
  and Ladakhi forms for cold sites, Hassan Fathy's New Gourna.

## Sources

- Agarwal, K. (2009). Residential Cluster, Ahmedabad: Housing based on the traditional Pols. PLEA 2009, Quebec. <https://web.faaad.ulaval.ca/plea2009/Papers/1.CHALLENGE/1.2%20City/POSTER/1-2-22-PLEA2009Quebec.pdf>
- Pol (housing), Wikipedia. <https://en.wikipedia.org/wiki/Pol_(housing)>
- Pol lecture deck (Scribd). <https://www.scribd.com/document/967974708/Lecture-16>
- Rawal, R. (2017). What do the traditional pol houses teach us for contemporary dwellings in India? PLEA 2017. <https://betarepo.cept.ac.in/items/7ce689da-c323-454b-92a6-3976589067f4>
- Fujian tulou, Wikipedia. <https://en.wikipedia.org/wiki/Fujian_tulou>
- Choudhary, M., Jaiswal, K., Sinha, R. Traditional rural house in Kutch region of India (bhonga). World Housing Encyclopedia report 72. <https://wheki-dev.globalquakemodel.org/reports/report_72>
- UNDRR, India's Mising community and flood adaptation. <https://www.preventionweb.net/news/indias-mising-community-seeks-expand-its-indigenous-adaptation-practices-response-climate>
- Dialogue Earth, Adapting to Brahmaputra floods. <https://dialogue.earth/en/livelihoods/adapting-to-brahmaputra-floods-assam-mising-miyah/>
- Charles Correa Foundation, Tube Housing. <https://charlescorreafoundation.org/2022/03/13/tube-housing/>
- Charles Correa Foundation, Incremental Housing (Belapur). <https://charlescorreafoundation.org/2022/03/13/incremental-housing/>
- Aga Khan Award, Aranya Community Housing. <https://the.akdn/en/how-we-work/our-agencies/aga-khan-trust-culture/akaa/aranya-community-housing>
- BDD chawls, court filing. <https://www.livelaw.in/pdf_upload/26680000043201915-453736.pdf>
- Rani ki Vav, Wikipedia. <https://en.wikipedia.org/wiki/Rani_ki_Vav>
- ICUC12 abstract, stepwell cooling in Jodhpur. <https://meetingorganizer.copernicus.org/ICUC12/ICUC12-1020.html>
- Down To Earth, When lakes were tanks. <https://www.downtoearth.org.in/environment/when-lakes-were-tanks-45815>
- Citizen Matters, Introduction to Bangalore's tanks. <https://citizenmatters.in/2386-bangalores-tanks/>
- Sri Dakshinamukha Nandi Tirtha Kalyani Kshetra, Wikipedia. <https://en.wikipedia.org/wiki/Sri_Dakshinamukha_Nandi_Tirtha_Kalyani_Kshetra>
- India Water Portal, East Kolkata wetland system. <https://www.indiawaterportal.org/health-and-sanitation/urban-sanitation/east-kolkata-wetland-system-low-cost-efficient-ecological-water-treatment>
- Mongabay India, East Kolkata Wetlands and carbon. <https://india.mongabay.com/2018/04/east-kolkata-wetlands-lock-down-over-60-percent-carbon-from-sewage-study/>
- Barbosa, G. L. et al. (2015). Comparison of Land, Water, and Energy Requirements of Lettuce Grown Using Hydroponic vs. Conventional Agricultural Methods. <https://pmc.ncbi.nlm.nih.gov/articles/PMC4483736/>
- Karimzadeh and Rulli (2025), lettuce water use by system and country. <https://re.public.polimi.it/handle/11311/1313676>
- Sarai Amanat Khan, Wikipedia. <https://en.wikipedia.org/wiki/Sarai_Amanat_Khan>
- Pakistan Department of Archaeology, Saadabad caravan sarai. <https://doam.gov.pk/sites/6680>
- Arts Illustrated, Laurie Baker. <https://artsillustrated.in/architecture/brick-by-brick/>
- Harvard GSD, Natural Ventilation in the Work of Laurie Baker. <https://www.gsd.harvard.edu/project/natural-ventilation-in-the-work-of-laurie-baker-1>
- ASHRAE 2018 Building Performance Analysis paper, India's climate zones (Bengaluru temperate). <https://www.ashrae.org/File%20Library/Conferences/Specialty%20Conferences/2018%20Building%20Performance%20Analysis%20Conference%20and%20SimBuild/Papers/C070.pdf>
