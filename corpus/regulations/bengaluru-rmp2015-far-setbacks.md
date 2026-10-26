---
id: bengaluru-rmp2015-far-setbacks
title: "Bengaluru RMP 2015 Zoning Regulations: FAR, coverage, setbacks, layouts (Tables 8-10, 20; 3.6; 6.1; 7.1)"
place: bengaluru
kind: regulation
source: "Revised Master Plan 2015 Bangalore, Volume III: Zoning of Landuse and Regulations (BDA, approved G.O. UDD 540 BEM AA SE 2004, 22-06-2007)"
ref: "Table 8 and 9 (printed pp. 19-20); 3.4, 3.6 (pp. 20-21); Table 10 and notes (p. 27); 6.1 (p. 43); 7.1 and Table 20 (p. 45)"
file: corpus/_sources/bengaluru-rmp2015-zoning.pdf
licence: "Government notification"
checked: "2026-10-27, read against the PDF (BBMP's copy, via the Internet Archive snapshot of 2025-03-25; the BBMP and BDA sites did not answer)"
---

## FAR and ground coverage on a plot (Residential (Main), Table 10)

The table pairs two independent scales: ground coverage by plot size, FAR by the width of
the road the plot faces.

| Plot size | Most ground coverage | Road width | FAR |
|---|---:|---|---:|
| up to 360 m² | 75% | up to 12 m | 1.75 |
| 360-1,000 m² | 65% | 12-18 m | 2.25 |
| 1,000-2,000 m² | 60% | 18-24 m | 2.50 |
| 2,000-4,000 m² | 55% | 24-30 m | 3.00 |
| 4,000-20,000 m² | 50% | over 30 m | 3.25 |

Notes to Table 10: on roads under 9 m, at most 11.5 m or stilt + ground + 2 floors,
whatever the FAR. Apartments only on plots over 360 m² (rings I and II) or 750 m² (ring
III), and only on roads over 9 m. A plot on a narrower road than its FAR row takes that
road's FAR (3.4 iii). Residential (Mixed) (Table 12) uses the same FAR by road width.

## A development plan on a site over 20,000 m² (7.1, Table 20)

10% of the land is reserved as park and open space and at least 5% for civic amenities.
FAR is reckoned on the land after the civic amenity site is taken out.

| Road width | Coverage | FAR |
|---|---:|---:|
| under 12 m | 60% | 2.00 |
| 12-18 m | 55% | 2.25 |
| 18-24 m | 55% | 2.50 |
| 24-30 m | 50% | 3.00 |
| over 30 m | 50% | 3.25 |

## A residential layout (subdivision, 6.1)

- Roads at least 9 m wide, and no narrower than the plots facing them. Every fourth road
  at least 12 m.
- Residential plots at most **55% of the land**. Parks, open spaces and playgrounds at
  least **15%**. Civic amenity sites take the rest after roads and parks.
- Commercial uses up to 3% of the land in layouts over 10 ha, in one or two blocks.
- A bifurcated plot is at least 50 m² with 6 m of frontage.

## Setbacks

Up to 11.5 m high and up to 4,000 m² (Table 8): as shares of the site's depth and width,
front 12%, rear 8%, each side 8% for sites over 9 m; 1 m or 0 on narrower sites. Over
4,000 m²: at least 5 m on all sides. Corner plots take a front setback on both roads (3.1
vii).

Over 11.5 m (Table 9), all round:

| Height | Setback |
|---|---:|
| 11.5-15 m | 5 m |
| 15-18 m | 6 m |
| 18-21 m | 7 m |
| 21-24 m | 8 m |
| 24-27 m | 9 m |
| 27-30 m | 10 m |
| 30-35 m | 11 m |
| 35-40 m | 12 m |
| 40-45 m | 13 m |
| 45-50 m | 14 m |
| over 50 m | 16 m |

Two or more buildings on one site stand at least **half the height of the taller one**
apart (3.6 i).

## Height

No height table: height follows from FAR, coverage and setbacks (and the 11.5 m cap on
roads under 9 m). A high-rise building is 24 m or more (definition 25); it needs a Fire
Force NOC (3.12 ii).

## Later amendments

- **2018** (UDD 112 MNJ 2015, 29-09-2018): Impact Zone Premium FAR, one extra unit of FAR
  within the impact zone of metro, LRT or Peripheral Ring Road projects, on roads of 12 m or
  more. Read in the BDA compilation (`bengaluru-bda-zoning-amendments.pdf`). The design site
  is not known to lie in an impact zone: not applied.
- **2026** (UDD/235/MNJ 2025(E), 05-01-2026), **secondary source only** (Cyril Amarchand
  Mangaldas blog, February 2026): new Table 8 for small plots (under 250 m², fixed setbacks
  in metres; 250-4,000 m² unchanged at 12/8/8%; over 4,000 m², 5 m all round); on roads under
  9 m the height cap becomes 15 m including stilts. The notification itself was not found.
- The rest of the BDA compilation is scanned Kannada text and was not read.

## Using these numbers in Permutation City

`engine/plotrules.ts` (to come) applies Table 10 per plot (coverage by plot size, FAR by
the widest street the plot fronts), Table 8 or 9 by the building's height, and 3.6 between
buildings on one plot. The site's capacity follows 6.1: 55% of the land as plots at most,
15% as parks, which is far below FAR 2.0 over the whole site.
