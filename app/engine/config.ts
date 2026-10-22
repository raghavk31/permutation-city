// The engine's fixed schema and default settings (pc/genome.py, pc/fitness.py).
import type { Kind, Settings } from "./types.js";

// --- genome schema: fixed within a run ------------------------------------------------

export const N_ATTRACTORS = 8;
export const ATTRACTOR_GENES = 5;
// The four street genes come last (genome version 2, Phase 6b), so the first 47 numbers of a
// genome mean what they always did. A 47-number genome is a "pre-street genome": it grows
// with the default street genes.
export const GLOBAL_GENES = ["water_share", "green_share", "follow_water", "coverage", "peak", "intensity", "base",
  "street_spacing", "street_orientation", "street_pattern", "street_hierarchy"] as const;
export const STREET_GENES = 4;
export const LENGTH = N_ATTRACTORS * ATTRACTOR_GENES + GLOBAL_GENES.length;
export const PRE_STREET_LENGTH = LENGTH - STREET_GENES;
export const GENOME_VERSION = 3;  // what the page breeds; versions 1 and 2 still grow (genome.ts)
export const STREET_GENE_DEFAULT = 0.5;  // what a pre-street genome's street genes are read as
export const KINDS: Kind[] = ["core", "green", "water"];
export const USES = ["building", "landscape", "water"]; // use codes 1, 2, 3 (0 = none)
export const BUILDING = 1, LANDSCAPE = 2, WATER = 3;

// --- run config: how each gene (0..1) is read (pc.genome.RANGES) ----------------------
// A brief may narrow or move these; it never adds genes. Radius is a share of the design
// ground's diagonal.

export type Range = readonly [number, number];
export type Ranges = { radius: Range; weight: Range } & Record<keyof Settings, Range>;

export const DEFAULT_RANGES: Ranges = {
  radius: [0.04, 0.30],
  weight: [0.2, 1.0],
  water_share: [0.05, 0.30],
  green_share: [0.10, 0.45],
  follow_water: [0.0, 1.0],
  coverage: [0.35, 0.90],  // widened in Phase 6b: streets take part of each cell
  peak: [0.5, 3.0], // exponent on the core field
  intensity: [0.25, 1.0],
  base: [0.0, 0.6],
  street_spacing: [70, 180],     // metres between secondary streets
  street_orientation: [0, 1],    // 0..1/3 contours, 1/3..2/3 parallel to the valleys, 2/3..1 a bearing
  street_pattern: [0, 1],        // 0..1/3 grid, 1/3..2/3 loops, 2/3..1 branching (dead ends)
  street_hierarchy: [0, 1],      // narrow to wide secondary streets and lanes
};

// --- fitness constants ------------------------------------------------------------------

export const STORAGE_WATER = 1.0, STORAGE_LANDSCAPE = 0.10, PLOT_STORAGE = 0.05;
export const HEAT = { sealed: 5.0, roof: 4.0, unsealed: 1.0, landscape: 0.5, water: -2.0 };
export const HEAT_PER_LEVEL = 0.1;
export const CARBON_BASE = 400.0, CARBON_FREE_LEVELS = 6, CARBON_PER_LEVEL = 0.02;
export const STOREY_M = 3.2;
// Reaches in metres (pc/genome.py, pc/fitness.py); pc.grid.passes turns them into
// neighbour steps. On 20 m hexes: 3, 1, 3 and 3 steps, as before grids were abstracted.
export const SITE_WATER_REACH_M = 100.0, WATER_FIELD_REACH_M = 35.0, HEAT_REACH_M = 100.0;
export const DAYLIGHT_REACH_M = 100.0, DAYLIGHT_TAN = 0.4663076581549986; // tan(25°)
export const HUMAN_MAX_LEVELS = 8;
export const TARGET_TOLERANCE = 0.10;
export const DUPLICATE = 0.05;

// --- form metrics (app/engine/metrics, pc/metrics; docs/metrics.md) ---------------------

export const STREET_W_M = 12.0;          // assumed width where an existing road runs between two cells
export const ENCLOSED_MAX_M = 120.0;     // an open run longer than this encloses nothing
export const DH_BAND = [1.0, 3.0] as const; // street width over building height that feels enclosed
export const BLOCK_PERIMETER_M = 400.0;  // a walkable block's perimeter
export const LOW_FRONTAGE_LEVELS = 6;    // storeys you still read as a street face
export const GREEN_MIN_HA = 0.5, NATURE_WALK_M = 300.0, CATCHMENT_M = 400.0;
export const ACTIVE_REACH_M = 200.0, NEAR_NODE_M = 100.0, LEGIBLE_M = 300.0, CENTRE_REACH_M = 300.0;
export const RHYTHM_MIN_RUN = 16;        // cells: shorter runs along a row are too short for a rhythm
export const RIDGE_MIN_HA = 5.0;         // a strong ridge (pc/landform.py): streets "on a ridge" run beside one

// --- streets (streets.ts, pc/streets.py; docs/landform.md) ------------------------------

export const PRIMARY_W_M = 18.0;                          // primary streets (IRC:SP:118 template 18A; IRC:86 collector 15-30 m)
export const STREET_SECONDARY_W = [9.0, 15.0] as const;   // secondary, by the hierarchy gene
export const STREET_LANE_W = [6.0, 9.0] as const;         // lanes, by the hierarchy gene
export const STREET_SHARE_MAX = 0.6;                      // streets take at most this much of a cell
export const MIN_STREET_SLOPE = 0.003;                    // contour streets on flatter ground use this slope
export const STREET_FRONT_RISE = 1.1;                     // buildings on a street rise a little higher (capped)

// --- genome version 3 (A2, docs/architecture-v3.md section 4; docs/streets.md) -----------
// The 8 attractors and 7 site-wide genes stay; the four street genes give way to twelve that
// grow a vector street network, blocks and plots. A genome of LENGTH_V3 numbers is version 3;
// 47 and 51 numbers are versions 1 and 2, grown as before.

export const GENES_V3 = ["water_share", "green_share", "follow_water", "coverage", "peak", "intensity", "base",
  "detour", "w_gates", "w_centres", "w_transit", "w_schools", "w_markets",
  "f_landform", "f_edges", "f_wind", "local_spacing", "pattern", "plot_depth"] as const;
export const LENGTH_V3 = N_ATTRACTORS * ATTRACTOR_GENES + GENES_V3.length;
export type GeneV3 = (typeof GENES_V3)[number];

export const RANGES_V3: Record<Exclude<GeneV3, keyof Settings>, Range> = {
  detour: [0, 0.6],         // Otto's excess length: how far a route may run over its shortest path to share another
  w_gates: [0, 1], w_centres: [0, 1], w_transit: [0, 1], w_schools: [0, 1], w_markets: [0, 1],
  f_landform: [0, 1], f_edges: [0, 1], f_wind: [0, 1],
  local_spacing: [50, 125], // metres between local streets (IRC:SP:118 3.2: a walking route at least every 125 m)
  pattern: [0, 1],          // five bands: the block pattern family (FAMILIES)
  plot_depth: [0, 1],       // where plot depth sits inside the family's range
};
// On a site whose relief is pronounced, local_spacing maps onto 50-80 m instead
// (IRC:SP:118 3.2: in hilly areas a walking route at least every 80 m).
export const HILL_LOCAL_SPACING = 80;

/** Block pattern families (the `pattern` gene's five bands). Widths and ranges in metres;
 *  docs/streets.md gives the source of each, or says it is a design value. */
export const FAMILIES = [
  { name: "rotated orthogonal", local_w: 9, frontage: [12, 30], depth: [15, 40], perimeter: [240, 500], spacing: 1 },
  { name: "contour-following", local_w: 9, frontage: [12, 30], depth: [15, 35], perimeter: [240, 500], spacing: 1 },
  { name: "radial", local_w: 9, frontage: [12, 30], depth: [15, 35], perimeter: [240, 500], spacing: 1 },
  { name: "organic", local_w: 7.5, frontage: [8, 20], depth: [12, 30], perimeter: [160, 500], spacing: 0.85 },
  { name: "tight and shaded", local_w: 6, frontage: [6, 15], depth: [15, 30], perimeter: [120, 360], spacing: 0.6 },
] as const;
export type Family = (typeof FAMILIES)[number];

export const SECONDARY_W_M = 12.0;  // Otto routes (IRC:SP:118 template 12A; IRC:86 Table 4.1 local street 10-15 m)

/** A genome's version, from its length (1: 47 numbers, 2: 51, 3: LENGTH_V3). */
export const versionOf = (genome: ArrayLike<number>): 1 | 2 | 3 =>
  genome.length === LENGTH_V3 ? 3 : genome.length === PRE_STREET_LENGTH ? 1 : 2;
/** How many numbers a genome of a version has. */
export const lengthOf = (version: number) => (version >= 3 ? LENGTH_V3 : version === 1 ? PRE_STREET_LENGTH : LENGTH);
