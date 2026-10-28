// Shapes shared by the engine and the UI.
import type { SiteMoves } from "./moves.js";

/** A site as `pc export` writes it (app/public/sites/<id>.json). */
export interface SiteExport {
  meta: SiteMeta;
  grid: {
    x: number[]; y: number[];
    water: number[]; state: number[];
    ground: number[]; flood: number[]; pool: number[]; green: number[]; built: number[];
    industrial: number[]; reasons: string[];
    // format 2
    nbr?: number[];         // n × degree over the whole grid, -1 where there is no neighbour
    memberships?: number[]; // bit k: the cell matches rule k
    layers?: LayerTable;    // every layer column as built
    down?: number[];        // format 4: the grid cell each drains to (-1: an outlet)
  };
  rules?: RuleSet;          // format 2
  design: {
    x: number[]; y: number[];
    nbr: number[];        // n × degree, -1 where there is no neighbour
    can: number[];        // bits: 1 building, 2 landscape, 4 water
    cap: number[]; min_perm: number[]; trees: number[]; site_water: number[];
    // format 4 (landform)
    z?: number[]; valley?: number[]; vbuf?: number[]; down?: number[]; lst?: (number | null)[]; ridge?: number[];
  };
  skeleton?: SkeletonExport;
  /** Moves drawn on the map, as the engine takes them (moves.ts applyMoves); not in exports. */
  moves?: SiteMoves;
  /** Flow lines traced on the terrain's own pixels over the site's upstream catchment
   *  (pc/hydro.py), in the grid's local metres. confidence "low": the ground falls under 1 m
   *  over the next kilometre of flow, less than the terrain model resolves. */
  flow_lines?: { pts: [number, number][]; order: number; upstream_ha: number; confidence: "high" | "low" | "mapped" }[];
  /** Existing streets to 1 km round the site, as segments (pc/syntax.py). */
  syntax?: { buffer_m: number; simplify_m: number; segments: number[][] };
  context: {
    roads: [number, number][][];
    rail: [number, number][][];
    boundary: [number, number][][];
    places: { name: string; x: number; y: number }[];
    /** Where activities are today (Overture places): points in local metres. Missing on older exports. */
    activities?: Activities;
    /** Existing buildings near the design ground (pc/export.py `existing_buildings`). */
    buildings?: ExistingBuildings;
  };
}

/** Existing buildings: outer rings as flat [x0, y0, x1, y1, ...] in local metres, a height in
 *  metres each, and where the height came from (an index into `sources`). */
export interface ExistingBuildings {
  within_m: number; rings: number[][]; h: number[]; src: number[]; sources: string[]; counts: Record<string, number>;
  /** the buildings on the design ground, which the design replaces unless one is kept (moves.ts) */
  ground?: { rings: number[][]; h: number[]; src: number[] };
}

export type Activities = Record<"shops" | "schools" | "transit", [number, number][]>;

/** Layer name → one value per grid cell (yes/no layers as 1/0; null for no value). */
export type LayerTable = Record<string, (number | null)[]>;

/** A rule condition (pc.rules): a comparison, a yes/no layer, or a combination. */
export type Condition =
  | { layer: string; op?: ">" | ">=" | "<" | "<=" | "==" | "!="; value?: number }
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition };

export interface RuleLimits {
  max_levels?: number; min_permeable?: number; uses?: string[];
  raised_ground?: boolean; remediate?: boolean;
}

export interface Rule {
  id: number;               // membership bit
  kind: "forbidden" | "retained" | "constrained";
  name: string; when: Condition; limits: RuleLimits; roles: string[];
  why: string; source: string;
}

export interface RuleSet {
  defaults: { max_levels: number; min_permeable: number; uses: string[] };
  list: Rule[];
}

/** The cell grid (pc.grid): hex size is centre to corner, quad size is the side. */
export interface GridInfo {
  type: "hex" | "quad";
  size: number;     // m
  spacing: number;  // m between neighbouring centres
  degree: number;   // neighbours of an interior cell (hex 6, quad 4)
  edge: number;     // m of edge two neighbours share
}

export interface SiteMeta {
  format?: number;
  id: string; name: string; origin: [number, number];
  grid?: GridInfo;      // format 3; read through gridOf()
  hex_radius?: number;  // hex sites (all that formats 1 and 2 had)
  cell_area: number;
  design_storm_mm: number; target_far: number; target_floor_area_ha: number | null;
  target_ha: number; design_ha: number;
  sea_levels: Record<string, number>; states: string[]; credits: string[];
  /** Format 4: the landform summary (pc/landform.py) and the hot-season LST scenes (pc/lst.py). */
  landform?: { relief: SkeletonExport["relief"]; valley_ha: number; valley_buffer_m: Record<string, number>;
    buffers_provisional: boolean; mapped_channel_cells: number; valley_cells: number; max_order: number; catchments: number;
    ridge_min_ha: number; ridge_min_consistency: number;
    /** pc/hydro.py: flow traced on the terrain's pixels this far (m) beyond the site's box. */
    flow_lines?: { catchment_m: number; segments: number; low_confidence: number; max_upstream_ha: number } };
  lst?: { source: string; months: number[]; years: number[]; scenes: { id: string; date: string; clear: number }[];
    median_clear_scenes_per_pixel: number; note: string };
  /** The regional wind (pc/wind.py): ERA5 via Open-Meteo, per season; streets read the axis
   *  `bearing_deg` (degrees from north, mod 180) of the season `bearing_from`. */
  wind?: { source: string; years: number[]; grid_point: [number, number]; grid_point_km: number; regional: true;
    bearing_deg: number | null; bearing_from: string; credit: string;
    seasons: Record<string, { hours: number; calm: number; mean_ms?: number; prevailing_from_deg?: number; rose?: number[];
      axis_deg?: number; consistency?: number }> };
  /** Sites built for someone who drew them: the data used, and anything a person should know. */
  service?: { overture: string | null; layers: number; terrain?: string; warnings?: string[] };
  /** Hours from UTC of local clock time (shade hours, the sun study), and where it came from. */
  utc_offset_h?: number; utc_offset_source?: string;
  /** What the plot rules let plans on this ground hold, measured on the page after a rule was
   *  edited (engine/capacity.ts). */
  capacity?: Capacity | null;  // null: don't apply the plot rules' capacity (parity with Python)
}

/** A measurement of what a site's plot rules let its plans hold (engine/capacity.ts): the
 *  ground's fingerprint, the target (m², the sample's 90th percentile), its median, the sample,
 *  and a note on the rules it was measured under. */
export interface Capacity { key: string; floor_m2: number; median_m2: number; n: number; seed: number; note: string }

/** The engine's view of a site's design ground (pc.genome.Ground). */
export interface Ground {
  n: number;
  x: Float64Array; y: Float64Array;
  grid: GridInfo;
  deg: number;             // nbr is n × deg
  nbr: Int32Array;
  canBuild: boolean[]; canGreen: boolean[]; canWater: boolean[];
  cap: Float64Array; minPerm: Float64Array; trees: Float64Array; siteWater: Float64Array;
  cellArea: number;
  bounds: [number, number, number, number];
  meta: SiteMeta;
  roads?: [number, number][][];  // existing major roads, same frame as x, y (the metrics' streets)
  activities?: Activities;       // shops, schools, transit points, same frame (semilattice richness)
  buildings?: ExistingBuildings; // existing buildings near the design ground, same frame (building-scale shade)
  water?: [number, number][];    // centres of the site's water cells (any grid cell), same frame (building-scale massing)
  /** Centres of the land cells the rules keep unbuilt off the design ground (a lake buffer, deep
   *  flooding): open ground the design's people can walk to (plan/shared.ts). */
  openLand?: [number, number][];
  syntaxStreets?: number[][];    // existing streets to 1 km round the site, [x0, y0, x1, y1] (space syntax)
  // Landform (export format 4; pc/landform.py): per cell, and the street skeleton
  z?: Float64Array;              // ground height (m)
  valley?: Int8Array;            // valley order (0: none)
  vbuf?: Uint8Array;             // 1: valley channel or its buffer
  down?: Int32Array;             // the design cell it drains to (-1: off the design ground)
  lst?: Float64Array | null;     // hot-season land surface temperature (°C; NaN: none)
  ridge?: Float64Array;          // strength of the strongest divide on its edges (ha)
  skeleton?: GroundSkeleton;
  // Drawn moves (moves.ts): per cell 0 free, -1 kept from any use, else the use; drawn streets
  forced?: Int8Array;
  drawn?: { pts: [number, number][]; cls: number }[];
}

/** The primary streets on this design ground (sides from streets.ts), and what they came from. */
export interface GroundSkeleton {
  source: "landform" | "roads" | "none"; note: string;
  sides: Int32Array; level: Int8Array; ridge: Int32Array;  // per skeleton side
  crossings: number; crossingCap: number; connected: boolean;
  ridges: { id: number; strength_ha: number; consistency: number }[];
  roadSides: Int32Array;
}

/** The skeleton as exported (pc/skeleton.py): sides as [cell, direction, ...]. */
export interface SkeletonExport {
  source: "landform" | "roads" | "none"; note: string;
  relief: { class: "pronounced" | "gentle" | "flat"; confidence: "high" | "low"; relief_m?: number;
    median_slope?: number; source: string; rebuild?: boolean; note?: string };
  sides: [number, number, number, number][]; crossings: [number, number][]; crossing_cap: number;
  connected: boolean; ridges: { id: number; strength_ha: number; consistency: number }[];
  road_sides: [number, number][];
  grid_sides?: [number, number, number, number][]; grid_crossings?: [number, number][];
  grid_road_sides?: [number, number][];
}

export type Kind = "core" | "green" | "water";

export interface Attractor { x: number; y: number; radius: number; weight: number; kind: Kind }

export interface Settings {
  water_share: number; green_share: number; follow_water: number; coverage: number;
  peak: number; intensity: number; base: number;
  street_spacing: number; street_orientation: number; street_pattern: number; street_hierarchy: number;
}

/** A version 3 genome's site-wide genes (config.ts GENES_V3), as read. */
export interface SettingsV3 {
  water_share: number; green_share: number; follow_water: number; coverage: number;
  peak: number; intensity: number; base: number;
  detour: number; w_gates: number; w_centres: number; w_transit: number; w_schools: number; w_markets: number;
  f_landform: number; f_edges: number; f_wind: number; local_spacing: number; pattern: number; plot_depth: number;
}

/** A version 3 design's vector plan (plan/grow.ts): streets by class with their widths, the
 *  blocks (faces of the network), the plots, and what the rules repaired or flagged. */
export interface VectorPlan {
  family: string;
  /** frontage: index into plan/shared.ts FRONTAGES (active, residential, green, lake). */
  streets: { pts: [number, number][]; cls: number; w: number; frontage?: number }[];
  vx: number[]; vy: number[]; edges: { u: number; v: number; cls: number }[];
  blocks: [number, number][][];
  plots: { ring: [number, number][]; block: number; use: number; levels: number; frontage: number; road?: number }[];
  repairs: { kind: string; at: [number, number] }[];
  flags: { rule: string; at: [number, number]; value: number; limit: number }[];
  destinations: { kind: string; at: [number, number] }[];
  /** Under the site's plot rules (engine/regs.ts), where it has them: the floor area its plots
   *  may hold (m²), the share of its land in building plots and in parks, and the floor area
   *  the rules took off what the genes asked for (m²). */
  rules?: { capacity: number; plotShare: number; parkShare: number; trimmed: number };
  /** Shared ground reserved before buildings (plan/shared.ts): squares at junctions, parks
   *  (blocks) by open-space level, the share of floor area within a walk of each level, and
   *  the share of the land that is shared ground. */
  shared?: { squares: { at: [number, number]; plot: number }[]; parks: { level: "doorstep" | "housing" | "neighbourhood"; block: number; area: number }[];
    access: Record<"doorstep" | "housing" | "neighbourhood", number>; share: number };
}

export interface Scores {
  storage: number; heat: number; carbon: number; daylight: number; human: number; gap: number;
}

export type ScoreKey = Exclude<keyof Scores, "gap">;

export interface Design {
  genome: number[];
  use: Int8Array;          // 0 none, 1 building, 2 landscape, 3 water
  levels: Int32Array;
  coverage: Float64Array;
  floorArea: Float64Array;       // net: after streets
  grossFloorArea?: number;       // m², as if streets took nothing (what streets cost: gross - net)
  street?: Int8Array;            // per side (streets.ts): 0 none, 1 lane, 2 secondary, 3 primary
  streetWidths?: [number, number, number, number];
  preStreet?: boolean;           // grown from a 47-gene genome, with default street genes
  // Piecemeal growth (piecemeal.ts): cells this increment builds, cells not built yet (open
  // ground for now), and the design's wholeness.
  fresh?: Uint8Array; fallow?: Uint8Array; wholeness?: number;
  attractors: Attractor[];
  settings: Settings | SettingsV3;
  plan?: VectorPlan;             // genome version 3: the vector design (rasterised into the arrays above)
  scores: Scores | null;
  floorHa?: number;
}

export interface Stats {
  floor_area_ha: number; far: number; building: number; landscape: number; water: number;
  mean_levels: number; max_levels: number;
}

export interface Rng { random: () => number; normal: (mu?: number, sigma?: number) => number }
