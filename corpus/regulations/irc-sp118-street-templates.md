---
id: irc-sp118-street-templates
title: "IRC:SP:118-2018 street templates: cross-sections of 18 m, 12 m, 9 m and 6 m streets (Annexure 3)"
place: any
kind: regulation
source: "Indian Roads Congress, IRC:SP:118-2018, Manual for Planning and Development of Urban Roads and Streets"
ref: "Annexure 3, templates 18A (printed p. 66), 12A (p. 68), 9A (p. 71), 6A (p. 72)"
file: corpus/_sources/irc-sp-118-2018.pdf
licence: "Published by Public.Resource.Org (law.resource.org); Indian standard"
checked: "2026-10-27, widths read off the template drawings in the PDF"
---

## The templates, as drawn (metres, one kerb to the other)

| Template | Street | Components, left to right |
|---|---|---|
| 18A | collector, 18 m, footpaths both sides | footpath 3.5-3.75; parking or multi-utility zone (trees, vending) 2; carriageway 6.5-7; footpath with bus stop or multi-utility zone 5.5-5.75 (the engine splits it: trees 1.5, footpath 4) |
| 12A | local, 12 m, footpaths both sides | footpath 3; multi-utility zone (trees, parking) 2; carriageway, two lanes, 6; buffer (planted) 1 |
| 9A | local, 9 m, footpath one side | buffer 0.5; mixed traffic lane 4.5; footpath with tree pits 4 |
| 6A | local, 6 m, shared street | buffer 1.5 (paved, parking and vending); shared traffic lane 3; tree pit 1.5 |

Templates 12B and 12C (12 m with a cycle track, and a 12 m shared street) are alternatives
not used here. Trees stand in the multi-utility zone, the buffer or the tree pits.

## Using these in Permutation City

`engine/config.ts` `CROSS_SECTIONS`: one section per street width the engine draws (18, 12,
9 and 6 m as above). The organic family's 7.5 m street has no template; its section (buffer
1 paved, shared lane 4, tree pit 2.5) is **assumed**, between 6A and 9A. SP:118 draws no swale; the
planted zones (multi-utility zone, buffer, tree pits) are where a swale would go, a **design
choice** shown as "trees and swale".
