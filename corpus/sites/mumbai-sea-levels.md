---
id: mumbai-sea-levels
title: "Mumbai: tide, storm surge and sea-level rise figures"
place: mumbai
kind: site-data
source: "Secondary reports of two official sources: (1) Minister of Earth Sciences, Rajya Sabha answer, December 2019, citing INCOIS, as reported by The Quint, 4 December 2019; (2) Maharashtra Maritime Board shoreline management plan, as reported by ICSF ('Maharashtra: State's sea levels may rise by 0.38 metre by 2050', date not given)"
ref: "https://www.thequint.com/news/india/mumbai-wont-submerge-trust-indian-scientists-data-union-minister-harsh-vardhan-rajya-sabha ; https://icsf.net/?p=21160"
licence: "Short factual figures from news reports"
checked: "2026-10-17, read from the two articles; the primary INCOIS and MMB documents were not found"
---

## Sea-level rise by 2050: two official figures that disagree

INCOIS, from the long-term trend at the Apollo Bandar tide gauge (about 0.74 mm a year,
1878 to 2005), estimated a rise of 33.3 mm at the Mumbai coast by 2050, as told to the
Rajya Sabha in 2019. The Maharashtra Maritime Board's shoreline management plan uses a
uniform 0.38 m rise along the state's 720 km coast by 2050. The first extrapolates a past
trend; the second is a planning allowance that includes accelerating rise. For design, the
larger allowance is the safer one.

## Tide and storm surge

The same plan, as reported, gives the maximum reported tidal level in Mumbai as 2.83 m
above mean sea level, and a maximum possible storm surge of 2.09 m above prevailing sea
level, a rare event. It asks that construction near the coast in Mumbai rise to at least
7.59 m above mean sea level by 2050.

## How these compare with the sites' sea levels

The Mumbai sites use a high tide of +2.5 m, a surge today of +3.5 m and a surge in 2050 of
+3.8 m above mean sea level (working assumptions in `site.yaml`). The reported maximum
tide (2.83 m) is a little higher than +2.5 m. A 2.09 m surge on top of a 2.83 m tide would
reach about +4.9 m, well above +3.5 m, and +5.3 m with 0.38 m of rise by 2050. These are
worst-case stacks (the highest tide and the largest surge together); the sites' levels are
closer to a common monsoon surge. The 7.59 m construction level includes freeboard above
any of them.

## Using these figures in Permutation City

Changing sea levels means rebuilding the site's flood layers, which the brief cannot do.
A brief can cite these figures to argue for raised ground floors and larger water and
landscape shares on low land, and the site's `sea_levels` can be raised by hand
(`site.yaml`, then `pc build`).
