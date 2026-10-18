// The engine's fixed schema and default settings (pc/genome.py, pc/fitness.py).
import type { Kind, Settings } from "./types.js";

// --- genome schema: fixed within a run ------------------------------------------------

export const N_ATTRACTORS = 8;
export const ATTRACTOR_GENES = 5;
export const GLOBAL_GENES = ["water_share", "green_share", "follow_water", "coverage", "peak", "intensity", "base"] as const;
export const LENGTH = N_ATTRACTORS * ATTRACTOR_GENES + GLOBAL_GENES.length;
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
  coverage: [0.35, 0.80],
  peak: [0.5, 3.0], // exponent on the core field
  intensity: [0.25, 1.0],
  base: [0.0, 0.6],
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
