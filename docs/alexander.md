# Christopher Alexander in Permutation City

Alexander shapes four parts of the tool: how the rules overlap, the vocabulary the brief
is written in, the aesthetic metrics, and a second, step-by-step way of growing a site. He
is cited as a critic as well as a source. After *Notes on the Synthesis of Form* (1964) he
turned away from the design-methods movement the book helped start (see the preface to the
1971 paperback edition), and later argued for unfolding, piece-by-piece processes. A tool
that breeds whole designs at once is close to what he argued against. The piecemeal growth
mode (Phase 9) is the tool's answer to that, and this note says so plainly.

Nothing from the books is quoted in the repo, the prompts or the app. Patterns and
properties are paraphrased with references, and their numbers are checked against the
books before they become code (see "Checking" below).

## Notes on the Synthesis of Form: fitness as misfit

How it's used: the scores are read as misfits, ways a form fails its context, and the
requirements are grouped by how they interact (water, climate, material, scale). See
`docs/generative-method.md`, "Fitness as misfit". No engine change: the scores were already
minimised internally, and the floor-area gap is already a misfit.

Where: `docs/generative-method.md`; the grouping is shown in the UI in Phase 6.

## A City is Not a Tree: overlapping rules

How it's used: a cell can belong to several rules at once (a rain hollow that is also a
drainage line), with roles such as flood storage and public open space that overlap rather
than nest. Forbidden stays absolute. A semilattice-richness metric (Phase 6) will score how
much the walking catchments of different activities overlap.

Where: `pc/rules.py`, `app/engine/rules.ts` (Phase 2); `docs/architecture-v2.md` 6.2.

## A Pattern Language: the fixed vocabulary

How it's used: the brief compiler can switch patterns on, but only patterns that have a
card in `corpus/patterns/`. It cannot invent patterns. Each card gives the pattern's number,
name and scale, a paraphrase of its intent, how the tool uses it, and what it maps to:

| Pattern | Use | What it changes |
|---|---|---|
| 21 Four-Story Limit | constraint | caps heights at 4 storeys over the design ground, unless the brief sets its own cap |
| 60 Accessible Green | metric | recorded; a Phase 6 metric (walking distance to a green patch of a minimum size) |
| 61 Small Public Squares | metric | recorded; a Phase 6 metric on open-space patches |
| 106 Positive Outdoor Space | metric | recorded; the positive-space metric of Phase 6 |
| 107 Wings of Light | prior | building-scale massing: wings of 9 to 12 m in the typology grammar, and courtyard, L, U and slab favoured in its first generation (the width is assumed until checked against the book) |
| 159 Light on Two Sides of Every Room | prior | building-scale massing: as 107; the readout "floor within 6 m of a window wall" shows how much of a plan is shallow (a rule of thumb, not the book's numbers) |

The brief panel lists the active patterns, why each is on (a cited snippet, or assumed),
and links to each card.

Where: `corpus/patterns/`, `app/engine/brief.ts` (`FOUR_STORY_PATTERN`), the brief panel.

## The Nature of Order: the main aesthetic framework

How it's used: the fifteen properties replace the brief's generic aesthetic list where
they overlap. Those with a defensible proxy are computed in Phase 6 (levels of scale,
strong centres, boundaries, alternating repetition, positive space, local symmetries,
contrast, gradients, roughness, the void, not-separateness; echoes at building scale).
Good shape, deep interlock, simplicity and inner calm are documented as not measured.
Wholeness stays a vector, never one number. Salingaros's work is the reference for the
formulas.

The brief can already name the properties a person wants to watch
(`aesthetic_priorities`); they are recorded until the metrics exist.

Where: `docs/architecture-v2.md` 6.4; `docs/metrics.md` (Phase 6).

## A New Theory of Urban Design and The Oregon Experiment: piecemeal growth

How it's used: a growth mode (Phase 9) that develops a site in increments (2025, 2035,
2050). Each increment evolves only new interventions on land not yet committed, and must
not make the wholeness properties of the existing fabric worse. It will be compared with
one-shot evolution in `docs/experiments/`.

Where: `docs/architecture-v2.md` 6.6.

## Checking

The pattern cards were written from the books' structure and widely known content, not
from a copy at hand, so:

- every card's `page` and `checked` fields are empty
- the brief compiler is told the numbers are unchecked, and the panel says so
- the only number the engine applies is pattern 21's four storeys, and only when the
  pattern is switched on

To check a card: confirm the page, the intent and any dimension against *A Pattern
Language* (1977), correct the card, and fill in `page` and `checked` (who, when). Then run
`npm run corpus` in `app/`.

## Sources

- Christopher Alexander, *Notes on the Synthesis of Form* (Harvard University Press, 1964;
  paperback 1971, with the new preface).
- Christopher Alexander, "A City is Not a Tree", *Architectural Forum* 122 (1965).
- Christopher Alexander, Sara Ishikawa, Murray Silverstein et al., *A Pattern Language*
  (Oxford University Press, 1977).
- Christopher Alexander, *The Oregon Experiment* (Oxford University Press, 1975).
- Christopher Alexander, Hajo Neis, Artemis Anninou and Ingrid King, *A New Theory of
  Urban Design* (Oxford University Press, 1987).
- Christopher Alexander, *The Nature of Order*, 4 volumes (Center for Environmental
  Structure, 2002 to 2005).
- Nikos A. Salingaros, work on quantifying the fifteen properties, cited in
  `docs/metrics.md` when the metrics are built.
