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
export const GENOME_VERSION = 2;
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

// --- streets (streets.ts, pc/streets.py; docs/landform.md) ------------------------------

export const PRIMARY_W_M = 18.0;                          // primary streets
export const STREET_SECONDARY_W = [9.0, 15.0] as const;   // secondary, by the hierarchy gene
export const STREET_LANE_W = [6.0, 9.0] as const;         // lanes, by the hierarchy gene
export const STREET_SHARE_MAX = 0.6;                      // streets take at most this much of a cell
export const MIN_STREET_SLOPE = 0.003;                    // contour streets on flatter ground use this slope
export const STREET_FRONT_RISE = 1.1;                     // buildings on a street rise a little higher (capped)
