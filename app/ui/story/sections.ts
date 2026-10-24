// The story page's sections (brief 10.13, eight per cut 9; docs/ui/wireframes/story.html).
// Each has a title, a one-line lead, its paragraphs, the diagram that explains its idea
// (ui/diagrams/iso.ts) and the view pinned beside it. The paragraphs are working copy, marked
// COPY for the author to rewrite; the leads are the approved wireframe's.

export type PinView = "aerial" | "stack" | "landform" | "genes" | "front" | "street" | "growth" | "results";

export interface Section {
  id: string; title: string; lead: string; body: string[];
  diagrams: string[];   // iso.ts diagram ids, in the text column
  pin: PinView; caption: string;
}

export const SECTIONS: Section[] = [
  {
    id: "question", title: "What could be here, if the land wrote the rules?",
    lead: "A sandbox for designing a piece of city with its ground, water and climate, not against them.",
    // COPY: the question
    body: [
      "Pick a site. Everything known about its ground is read from open data: how high it is, where water runs and pools, where the sea reaches in a storm, what is green, what is built.",
      "From that, the land sets the rules, and thousands of designs are bred inside them and scored on flood storage, heat, embodied carbon, daylight and human scale. You choose among them, as the urban designer.",
    ],
    diagrams: [], pin: "aerial", caption: "A design bred for the Mumbai Eastern Waterfront, under the sun of 15 March at 16:00",
  },
  {
    id: "layers", title: "The layers and the rules",
    lead: "Ground, water, green and the existing city, stacked as McHarg did, become rules for what can be built where.",
    // COPY: layers and rules
    body: [
      "Ian McHarg drew each fact about a place on its own sheet and laid the sheets over each other (Design with Nature, 1969). Read together, they show where building would do harm.",
      "Here the stack decides each piece of ground: forbidden (water, deep flooding, the water's edge), kept as it is (the city outside the design area), allowed with limits (height caps, ground left open to soak up rain), or open. Designs explore inside these rules and never break them.",
    ],
    diagrams: ["layers", "rules"], pin: "stack", caption: "The layers, from the ground up",
  },
  {
    id: "streets", title: "Landform and streets",
    lead: "Valleys carry water, ridges carry movement. Streets are found between destinations, the way Frei Otto's threads found paths.",
    // COPY: landform and streets
    body: [
      "Water's paths are traced over the ground. Where enough land drains through, a valley starts and is kept open, with a strip either side. The high ground between valleys carries the main streets.",
      "Frei Otto let wet threads find their shortest shared paths between points. Streets here are found the same way: routes between the site's gates, its centres and places people go to, bundled where sharing a route costs little extra walking. Local streets then fill each area along the grain of the land, the water's edge or the wind.",
    ],
    diagrams: ["landform", "streets"], pin: "landform", caption: "Ground height in rose, water in blue, the main streets in ink, and one design's own streets over them",
  },
  {
    id: "genes", title: "A design as genes",
    lead: "Attractors pull building, green and water; a few genes set the streets and the blocks.",
    // COPY: the genome
    body: [
      "A design is 59 numbers. Eight attractors, each a place, a reach, a strength and a kind: some pull buildings and height towards them, some pull green, some pull water. Seven numbers set the whole site's character.",
      "Twelve more set the streets: how far a route may bend to share another, which destinations draw routes, what the local streets follow, how far apart they are, and the kind of blocks and plots between them. Change a number and the whole plan regrows.",
    ],
    diagrams: ["recipe"], pin: "genes", caption: "One design, with its attractors drawn as circles",
  },
  {
    id: "evolution", title: "Evolution and the trade-offs",
    lead: "Thousands of designs bred and scored; the ones no other beats on every score survive.",
    // COPY: evolution
    body: [
      "Each generation, designs are scored. Those that meet the floor-area brief come first. Among them, a design survives if no other design is better on every score at once. Survivors swap attractors, a few numbers change at random, and the next generation grows.",
      "No single design wins. Storing more rain means more open ground, which means taller buildings and less daylight. The survivors are the best trade-offs, and choosing between them is your job.",
    ],
    diagrams: ["evolution", "tradeoff"], pin: "front", caption: "Every design of one run that meets the brief, by heat and flood storage; the survivors in ink",
  },
  {
    id: "buildings", title: "Buildings",
    lead: "One block at building scale, under the site's sun.",
    // COPY: massing
    body: [
      "Any block of a design can be taken down to buildings. Each plot gets a building that fits its rules, and the buildings are bred again: for sun in winter, shade in the hot afternoons, daylight inside and the views between them.",
      "The sun is the site's own, at its latitude, on the date and hour you choose.",
    ],
    diagrams: ["massing"], pin: "street", caption: "The same design closer in, on a March afternoon",
  },
  {
    id: "growth", title: "Growing over time",
    lead: "2025, 2035, 2050: each step builds on the last, under its year's sea, storm and heat.",
    // COPY: growth over time
    body: [
      "Cities are not built in one go. Christopher Alexander argued that each small step should repair the whole. A site can be grown in three steps: each keeps what was built before and adds to it, scored under the sea level, storms and heat of its own year.",
      "A step that makes the whole less coherent pays a penalty, but is not banned. Whether this ends better than designing everything at once is one of the questions being tested.",
    ],
    diagrams: ["growth"], pin: "growth", caption: "The same site after each step: built ground in colour, ground not yet built in grey",
  },
  {
    id: "found", title: "What we found, and try it",
    lead: "The results of the comparison, then your own site.",
    // COPY: findings (A4 results replace the list once the runs are in)
    body: [
      "The comparisons are running now: whether streets found from the land beat a plain grid, whether breeding for variety finds more kinds of good design, and whether growing in steps can match designing at once. The results go here when they are in.",
    ],
    diagrams: [], pin: "results", caption: "What is being tested",
  },
];

/** What section 8 lists until the A4 results exist (docs/research/claim.md, H1 to H4). */
export const TESTS: [string, string][] = [
  ["Range", "Do streets found from the land give a wider range of good designs than a grid?"],
  ["Trade-offs", "Do they reach better trade-offs between the five scores?"],
  ["Heat and water", "Do designs that follow the land hold more rain and run cooler?"],
  ["Growing in steps", "Does a site grown in three steps end at least as well as one designed at once?"],
];
