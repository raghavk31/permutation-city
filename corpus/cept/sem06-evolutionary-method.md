---
id: sem06-evolutionary-method
title: "CEPT Sem 06: evolutionary computation workshop and block evolution"
place: any
kind: studio
source: "Evolutionary Computation workshop (with Jaimin Bali and Ishita Singh) and Raghav Kohli's final report, Generative Techniques for Urban Place Making studio, CEPT University, Semester 6, 2020. Tutors: Radhika Amin, Arpi Maheshwari, Anuradha Ramchandani. Summarised in docs/generative-method.md."
ref: "Workshop presentation (evo-comp); final report pp. 46-62"
licence: "Student work, quoted with credit to the studio, semester and tutors"
checked: "2026-10-17, read from the workshop presentation and the report"
---

## Breeding by hand

The workshop ran a genetic algorithm by hand on a box: a genome of six operations
(twist, move, rotate, polar array, mirror, scale) with intensifiers, two fitness criteria,
single-point 60/40 crossover, and killing the weakest. By the second generation the
population had collapsed onto a few genomes. Small populations converge fast and stop
exploring, so the method needs immigrants, mutation and larger populations.

## Fitness kept apart

Averaging the fitness criteria hid trade-offs; ranking on each criterion and reading the
results as Pareto fronts showed them. Permutation City keeps its scores separate for the
same reason.

## Block evolution

At block scale the studio evolved typologies (single courtyard, L, U, tower) with genes for
grid size (3 to 7.5 m), building depth (12 to 18 m), height (0 to 24 m), voids and scaling,
judged on eight criteria: shade in the court, built volume, sun on the roof, height
difference, and open space on the ground and roof among them. Blocks of larger unit cells
were more porous and accessible, with larger open spaces, suited to commercial and mixed
use. Blocks of smaller cells were compact and private, with small voids for community
gatherings, suited to housing.

## Using this in Permutation City

Population about 60 with immigrants (about 10 per cent) and mutation; scores as a Pareto
front; typologies as a second, building-scale gene pool (Phase 7).
