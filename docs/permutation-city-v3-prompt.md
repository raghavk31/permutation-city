# Permutation City v3 - from working tool to research project

Read this whole brief before doing anything. Then read docs/v2-brief.md, docs/architecture-v2.md, docs/generative-method.md, docs/landform.md, docs/massing.md, docs/alexander.md and the open notes from Phase 9. Your first job is a plan and an estimate (section 9), not code.

(Note, 2026-10-21: the v2 brief is `docs/permutation-city-v2-prompt.md`; `docs/v2-brief.md` does not exist.)

---

## 1. Where we are

v2 works end to end: McHarg layers from open data, landform (valleys, ridges, LST), rules with overlapping memberships, a 51-gene attractor genome with street genes, NSGA-II / NSGA-III / MAP-Elites, thirty form metrics including Alexander's properties, angular segment analysis, building-scale massing with three representations, shade and neighbour scores, save and reload, family tree, shocks and piecemeal growth. Python and TypeScript agree.

What's wrong, from using it:
1. Streets don't look or behave like streets. They start and end anywhere, wander, and merge at odd angles. Ridges go into the network as raw zigzags.
2. Form is locked to the analysis grid. Everything is hex or square cells, so every design looks like a board game, and different sites or climates can't produce different urban patterns.
3. Massing is too restrictive: extruded cells and typologies, nothing that grows the way natural systems do.
4. The UI doesn't work for design. It's a long essay with controls embedded in it. The design scrolls away from its controls, colours mean different things in different chapters, maps waste half their area on grey context, Families shows thirty near-identical thumbnails, and the 3D view shows tile outlines with no streets, no context, no shadows and almost no height variation.

## 2. The goal

Make this a project that stands up as research, not just a good tool. That needs four things, and polish is only one of them:
1. A clear claim that can be tested.
2. A method that's new, with its ideas traced to their sources (McHarg, Alexander, Frei Otto, Neri Oxman, space syntax, quality-diversity search).
3. Evaluation: baselines, ablations, real sites, and designers using it.
4. A demo that makes people want to use it: fast, legible, beautiful.

### Working research claim
Write this into docs/research/claim.md in the planning step and refine it with me:

> Urban form generated from the land (landform-derived rules, street networks found the way Frei Otto found path systems, and block patterns chosen by search rather than fixed by a grid) gives a wider range of designs that perform well, are more legible, and hold up better under climate shocks than form generated on a fixed grid. Growing it in steps with foresight beats designing it all at once.

Every phase should produce evidence for or against parts of this. Report results that go against it.

## 3. Ground rules

- Everything from the v2 brief still holds: don't break working features, seeded and deterministic runs, fixed genome schema within a run, aesthetic metrics as readouts by default, every metric a documented pure function, API keys server-side, small commits, one PR per phase.
- New: the design is vector; the grid is for analysis only. Streets, blocks, plots and buildings become vector geometry. The hex or square grid stays for layers, rules and scoring; the design is rasterised onto it to be scored and is never drawn as cells. This reverses the Phase 6b decision to put streets on cell edges.
- Parity: street networks, blocks and plots are generated in both engines, with parity on topology (identical graph) and coordinates within a stated tolerance. Found-form massing is TypeScript only, like Phase 7 geometry; Python checks scores on exported geometry.
- Genome v3, versioned. Older runs load with their version label.
- UI copy: short and plain. Mark every piece of user-facing text that needs my rewrite with a COPY: comment. Don't write explanatory paragraphs in a marketing voice; I'll write those.
- No em dashes anywhere in copy or docs.

---

## 4. Milestone A - demo-ready by 25 November 2026

This is the version I'll show. Everything here must be finished, fast and polished, even if scope gets cut. If the estimate says it doesn't fit, propose cuts; don't move the date.

### A1. Quick visual fixes (first, about a week, on the current app)
- Dissolve cells into shapes when drawing: merge neighbouring cells of the same use into one polygon, smooth the outline, no cell strokes. 2D and 3D.
- One meaning per colour, everywhere. Semantic colour tokens in one file: water, green, building (height ramp light to dark), street, existing city, forbidden, constrained. Constrained ground is a hatch or outline, not a fill. Elevation gets its own ramp that can't be mistaken for water.
- Calmer, less saturated palette, closer to architectural drawings. Building tops tinted by height.
- Frame every map to the site bounds with a modest margin. Context shown as streets and light footprints, not grey hexes.
- 3D: existing buildings as light grey extrusions, streets visible, sun with soft shadows and ambient occlusion, camera framed to the site, readable titles ("Design 12 · most flood storage", not "G7.33 (2)").
- Families: 5-7 representative designs (most distinct, by clustering), each with one line on what sets it apart and a small visual score glyph instead of text lines. Full list behind "show all".
- Genome chart: label the genes in plain words, or drop the chart and draw the attractors more boldly on the map.
- Fix the cross-reference error (chapter 06 says the metrics are in chapter 05).
- First screen leads with an image (a design in 3D or the layer stack), not a paragraph.

### A2. Vector design geometry and real streets
Pipeline, in order:

1. Clean the skeleton. Turn hydrology ridge and valley lines into smooth centrelines: simplify, fit splines, snap to the network. No raw zigzags.

2. Connectivity, found the way Frei Otto found path systems. His wool-thread experiments produced networks between points that merge into shared routes, trading total length against detour. Implement on a cost surface:
   - cheap along ridges and gentle slopes; expensive across valleys, steep ground, high LST and forbidden land; valleys crossed only at allowed crossings;
   - destinations: gates where existing roads meet the site, centres from the attractor genes, transit, schools and markets from Overture;
   - a detour-tolerance gene controls how strongly routes merge.
   Choose the method (edge bundling on the cost surface, or a Physarum solver such as the Tero model) and justify it. This gives the primary and secondary structure.

3. Infill from a tensor field. Local streets follow a field built from ridges, contours, coastline, existing roads and prevailing wind (after Chen et al. 2008, "Interactive procedural street modeling"). Field weights and spacing are genes.

4. Validate and repair. Hard rules, each a named setting documented with its source:
   - every street ends at another street, a gate or a designated destination; dead ends only where designated, with a maximum length;
   - junctions are T or X, angles roughly 60-120 degrees, minimum spacing by street class;
   - minimum curve radius and maximum gradient by street class;
   - hierarchy holds: primary streets continuous, lanes branch from secondary streets;
   - block perimeter within a range per block pattern.
   Repair by snapping, merging, straightening or deleting, and record the repairs. Sources: Stephen Marshall, Streets and Patterns; NACTO Global Street Design Guide; IRC codes for Indian widths; Allan Jacobs, Great Streets; Alexander's network patterns. Check every number against its source.

5. Blocks and plots. Blocks are the faces of the network. Subdivide recursively into plots (oriented bounding box splits, as CityEngine does), every plot fronting a street, plot width and depth ranges set by block pattern.

6. Block pattern families, chosen by a gene: rotated orthogonal (aligned to wind or coast), contour-following, radial, organic (from seed points), and tight and shaded (after Ahmedabad's pols). The island search waits for Milestone B.

7. Rasterise the vector design onto the analysis grid for scoring. All existing metrics keep working; street and block metrics now use the real network.

Genome v3 replaces the four street genes with: detour tolerance, destination weights, field weights, local street spacing, block pattern family, plot depth range. Update MAP-Elites traits, the brief's gene ranges and the search comparison.

### A3. Workbench and story page
Split into two pages sharing one engine.

Story page (today's page, tightened): scroll-through explanation with pre-run examples (McHarg, landform, streets, genes, evolution, Alexander, massing). Mobile-friendly. Ends with "try it on your own site", which opens the workbench. Match raghavkohli.xyz's typography and warm off-white palette so they read as one body of work.

Workbench (desktop; on mobile, a short note and a link to the story):
- Centre: map or 3D view, always on screen.
- Left: the process as steps: Site, Layers, Rules, Brief, Evolve, Explore, Massing. Each step shows only its own controls. Site drawing lives here, not on a separate page.
- Right: inspector for the selected design: five scores first, then form metrics grouped and collapsed, then genes and lineage.
- Bottom: the pen as a tray that persists across steps, plus a generation slider to scrub through a run.
- Linked views: hovering a point on the trade-off chart highlights the design on the map and the reverse; selecting anywhere selects everywhere.
- Compare: two designs side by side with a difference view.
- Plain labels on controls; technical names (NSGA-III, NACH, Rn) in tooltips.
- Performance: interactions under 100 ms, evolution never blocks the UI, 3D at 60 fps on a mid-range laptop.

### A4. Evaluation, video and write-up
- Benchmark sites: mumbai-ewf, ahmedabad-wadaj, the Bengaluru valley site, plus one site with pronounced relief if FABDEM allows. Report each site's relief and data confidence.
- Baselines: v2 grid-based design, random designs within the rules, one-shot vs piecemeal (with and without wholeness as an objective, per Phase 9 notes).
- Ablations, one at a time: no landform rules, no Otto connectivity (plain grid network), no tensor field, no block pattern families, no quality-diversity search.
- Measures: five scores, legibility and intelligibility, network measures, archive diversity, shock performance. 10 seeds per condition, medians and interquartile ranges, a simple significance test.
- Against reality: if a public masterplan exists for a benchmark site (for example the Mumbai Eastern Waterfront plan), roughly digitise its street network and score it with the same metrics. Tell me what's publicly available before digitising anything.
- One script regenerates every figure and table from saved runs.
- docs/research/paper-draft.md: 6-8 pages in the shape of an ACADIA / CAADRIA / SimAUD paper (claim, related work, method, experiments, results, limits). Get structure, figures, tables and method description right; I'll rewrite the prose.
- Video: script and shot list for a 2-3 minute screen recording, plus a demo mode in the workbench that plays a prepared run smoothly.

---

## 5. Milestone B - after 25 November

### B1. Block patterns as islands
Run each block pattern family as its own subpopulation, migrating only within a family (crossing a radial plan with an organic one means nothing). Report which pattern does best under which climate and landform. This is a central result for the claim.

### B2. Found-form massing (Frei Otto and Neri Oxman)
A new massing approach behind the existing interface:
- Form-finding (Otto): dynamic relaxation of particle-spring systems. Massing as a membrane or mesh anchored to the plot, pulled by forces: rise towards winter sun, give way along wind corridors, stretch to shade public space. Also canopies and gridshells over public space, and hanging-chain vaults.
- Graded fields (Oxman, material ecology): porosity, depth and thickness vary continuously across one building with sun, wind, view and heat, instead of being assembled from parts. Draw on Indian precedents that are environmental gradients in material: jaali, chhajja, courtyard. Extend the CPPN or distance-field representation with these fields as inputs.
- Growth processes as optional generators: space colonisation, differential growth, reaction-diffusion for porosity patterns, Voronoi foam for cellular massing.
- Buildability guardrails: floor-to-floor 3.0-3.6 m, maximum depth from facade about 12-15 m, floor plates by slicing the found form, minimum usable floor plate, overhang limit as a structural proxy. Add a buildability score.
- A slider from "typology" through "relaxed typology" to "found form", so users see what buildability costs.
- Runs only on designs the user picks. Export glTF and .3dm.

### B3. Designer study
Protocol for 6-8 urban designers or students: two tasks on a benchmark site (workbench vs their usual tools or v2), think-aloud, the Creativity Support Index, a short interview, consent forms. I run the sessions; you build opt-in anonymous interaction logging and an analysis notebook.

### B4. Paper
Turn the draft into a submission once B1-B3 are in.

---

## 6. Carry forward
- Phase 9 items as agreed: phased brief, open-ground split, banded ranking, foresight setting, wholeness caching, matched comparison with 10 seeds.
- Open Buildings 2.5D heights test and user height overrides.
- FABDEM for the Bengaluru and hilly sites; never build hydrology on Copernicus.
- Mumbai storm-water drains if I can supply them.

## 7. Out of scope
Accounts, collaboration, server-side run storage, mobile workbench, agent-based simulation of people and traffic, any claim that the tool optimises beauty.

## 8. Done for Milestone A means
- A first-time visitor gets from the story page to drawing a site, running an evolution and comparing three designs in under five minutes without help.
- Streets on every benchmark site pass validation with no manual fixes, and look like streets.
- No cell outlines anywhere in design views.
- Every paper figure regenerates from one script.
- All tests pass in both engines; the live site works in current Chrome, Safari and Firefox.

## 9. Start here: plan and estimate, then stop
1. Draft docs/research/claim.md and docs/architecture-v3.md: what changes, what stays, what the vector layer replaces, how parity works for vector geometry.
2. Estimate each Milestone A item in working days against 25 November. If it doesn't fit, propose cuts or moves to Milestone B, in order of least damage to the demo.
3. Choose and justify: connectivity method, tensor field approach, plot subdivision method, 3D shadow and occlusion approach.
4. List risks, especially anything in the vector change that breaks saved runs, metrics or piecemeal mode.
5. List your questions for me.

Wait for my go-ahead. Start A1 only after I approve the plan.

## 10. UI and visual design

The UI is half of what people judge this project on. Treat it as a design project with its own process, not as a layer added at the end. A1 and A3 deliver against this section.

### 10.1 Principles
1. The design never leaves the screen. The map or 3D view is the centre of every step.
2. One thing at a time. Each step shows only what that step needs. Everything else is one click away, never on screen by default.
3. Show, then explain. Every number has a visual next to it; every concept is shown on the map before it's described in words.
4. Colour carries meaning, and the meaning never changes.
5. The machine proposes, the designer decides. Selecting, keeping, locking and breeding are the main actions; running the optimiser is supporting.
6. Honest about uncertainty. Low-confidence data and guessed values are always marked where they appear.

### 10.2 Process
- Wireframes first. Before building A3, produce low-fidelity wireframes of every workbench step and the story page as static HTML pages in docs/ui/wireframes/, and stop for my review.
- Then a design system page (docs/ui/system.html or a Storybook) showing every token, component and state. Build components there before using them in the app.
- Checkpoints: after wireframes, after the design system, after the first two workbench steps are working.

### 10.3 Visual language
Colour tokens, defined once in one file and used everywhere. Every map, chart, 3D material and legend reads from them.
- Water: one blue family. Deep for permanent water, lighter for flood extent, lightest for storage.
- Green: one muted green family, darker for retained or existing green, lighter for proposed.
- Building: warm neutral ramp from light (low) to dark (tall), so height reads in plan.
- Street: off-white or pale grey on dark ground, mid grey on light ground, with width by hierarchy.
- Existing city: light grey, always quieter than the design.
- Forbidden: muted red hatch. Constrained: thin outline or hatch, never a fill.
- Elevation and heat: their own sequential ramps (elevation in earth tones, heat in a perceptually uniform warm ramp such as magma or inferno), never sharing hues with water or building.
- Selection and highlight: one accent colour, used for nothing else.
- Check every ramp for colour-blind readability (deuteranopia and protanopia) and record the check.

Typography: match raghavkohli.xyz. One display face for titles, one text face for UI and body, tabular numerals for all scores. Define a type scale with no more than five sizes.

Spacing and shape: a 4 or 8 px spacing scale, one corner radius, one border weight. Panels separated by space and subtle borders, not boxes and shadows.

Iconography: one consistent line icon set, used sparingly and always with a label or tooltip.

### 10.4 Workbench layout
- Top bar: project name, site name, run status, save and share, undo and redo.
- Left rail (about 280 px): the steps as a vertical list with completion state. The active step expands to show its controls. Collapsible.
- Centre: map or 3D, with a small toggle between 2D, 3D and split. A legend that only lists what's currently visible. Scale bar and north arrow in 2D.
- Right inspector (about 340 px): the selected design. Collapsible. Empty state explains what will appear here.
- Bottom tray (about 140 px, collapsible): the pen as thumbnails, plus the generation slider when a run exists.
- Minimum supported width 1280 px. Panels collapse in a fixed order as space shrinks: tray, then inspector, then left rail to icons.

### 10.5 Each step
Site
- Search box with suggestions, map, and a polygon tool with clear vertex handles, undo per vertex, area shown live, and a warning when the site exceeds the cell cap.
- Preset sites as cards with a small image, relief class and data confidence.

Layers
- Layer list with toggles, opacity sliders and a one-line description each. The source and date of each layer is visible on hover.
- A "stack" animation that builds the layer cake in order on first visit, skippable.
- Hover any point to see every layer's value there in a compact readout.

Rules
- The result map (forbidden, retained, constrained, open) with areas per class.
- Rules shown as readable sentences ("No building where flood depth over 0.5 m in a 100-year storm"), each editable with a slider or dropdown, re-running live.
- A before and after toggle when a rule changes.

Landform
- Valleys, ridges, crossings and the street skeleton on the map, with relief class and confidence clearly labelled.
- Toggle ridge streets on or off, drag crossings.

Brief
- The proposed brief as a form: each value with its source citation or "assumed", editable.
- Patterns (Alexander) as chips, toggled on or off, each with its card on hover.
- A confirm action that freezes the brief, with a visible lock state.

Evolve
- Search mode, generations, population and objectives as a compact form with plain labels.
- While running: a live strip of the current best designs updating each generation, a progress bar with time remaining, and a cancel button. The UI stays usable.

Explore
- Trade-off view: scatter matrix and parallel coordinates, switchable. Points coloured by front membership or by any chosen metric. Brushing on any axis filters the map and the gallery.
- Gallery: representative designs (5-7 clusters) by default, each with a one-line summary of what sets it apart and a score glyph; "show all" for the full set.
- MAP-Elites archive as a grid of thumbnails with axis labels in plain words.
- Extremes: one click to jump to the best design on any single score or metric.
- Compare: pick two designs; side by side with synced camera, a difference map, and score differences as bars.

Massing
- Pick a block on the plan; the 3D view frames it.
- Representation picker (typology, voxel field, found form) with the typology-to-found-form slider when B2 lands.
- Sun study: date and time slider with live shadows. Section cut tool.
- Export buttons with file sizes.

### 10.6 Inspector
Order, top to bottom:
1. Design name (plain, editable), family and generation.
2. Five scores as horizontal bars against the run's range, best end marked.
3. Brief fit: floor area against target, gross and net.
4. Form metrics grouped (human scale, permeability, nature, legibility, Alexander's properties), collapsed by default, each with a one-line definition on hover and a confidence mark where data is guessed.
5. Genes in plain words, with lock toggles.
6. Lineage: parents and a link to the family tree.
7. Actions: keep in pen, breed with, shock test, mass a block, export.

### 10.7 Maps
- Vector rendering of the design (no cells), with the grid available only as a debug overlay.
- Street hierarchy by width and tone, labels for named existing streets only.
- Smooth zoom and pan, fit-to-site button, and a minimap only when zoomed in.
- Hover tooltips are short: what this is and one or two numbers.

### 10.8 3D
- Physically based lighting with a real sun position for the site, soft shadows and ambient occlusion.
- Existing context as light grey massing, the design in the building ramp, water with subtle reflection, green with a slight texture.
- Camera presets: aerial, eye level from a chosen street, plan. Smooth transitions between them.
- A clean "presentation" mode with UI hidden, for screenshots and the video.
- Performance: instancing or merged geometry, level of detail for context, 60 fps on a mid-range laptop at default quality, with a quality toggle.

### 10.9 Charts
- Built from the same colour tokens, direct labels instead of legends where possible, no chart junk.
- Axes say what better means ("more storage →").
- All charts linked to the selection.

### 10.10 States, feedback and motion
- Every panel has a designed empty, loading and error state. No blank boxes.
- Long tasks show progress and an estimate; short tasks under 300 ms show nothing.
- Motion is short (150-250 ms) and only used to show change: a design morphing between generations, a layer sliding into the stack, the camera moving to a selection. Respect reduced-motion settings.

### 10.11 Onboarding
- First visit: a three-step overlay pointing to the map, the steps and the inspector, dismissable and never shown again.
- A "load an example run" option on the Site step so someone can explore results without running anything.
- Every technical term has a tooltip in one plain sentence.

### 10.12 Keyboard and power use
- Shortcuts: undo and redo, next and previous design, keep in pen, toggle 2D and 3D, toggle panels. A shortcut list on "?".
- URL reflects the current step, site and selected design, so any view can be shared.

### 10.13 Story page
- Scrolling text on one side, a pinned map or 3D view on the other that changes with each section (scrollytelling).
- Sections: the question, the layers, the rules, the landform, the streets, the genome, evolution, the trade-offs, wholeness, massing, growing over time, what we found (from A4), try it yourself.
- Mobile: the pinned view sits above the text and updates per section.
- Each section uses a prepared run, so the page loads fast and never runs evolution itself.

### 10.14 Accessibility
- WCAG AA contrast for text and controls.
- All controls reachable and usable by keyboard, with visible focus.
- Charts and maps have a text summary for screen readers.
- No information carried by colour alone: patterns or labels back up colour.

### 10.15 Quality checks
- Visual regression tests (for example Playwright screenshots) on key views for every PR.
- Performance budget checked in CI: initial load of the story page under 2 s on a fast connection, workbench interactive under 4 s.
- Before Milestone A is done, run a quick hallway test with 3 people who haven't seen the tool: can they reach the five-minute goal in section 8? Record where they get stuck and fix the top three issues.
