// Shapes shared by the engine and the UI.

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
  };
  rules?: RuleSet;          // format 2
  design: {
    x: number[]; y: number[];
    nbr: number[];        // n × degree, -1 where there is no neighbour
    can: number[];        // bits: 1 building, 2 landscape, 4 water
    cap: number[]; min_perm: number[]; trees: number[]; site_water: number[];
  };
  context: {
    roads: [number, number][][];
    rail: [number, number][][];
    boundary: [number, number][][];
    places: { name: string; x: number; y: number }[];
  };
}

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
  /** Sites built for someone who drew them: the data used, and anything a person should know. */
  service?: { overture: string | null; layers: number; terrain?: string; warnings?: string[] };
}

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
}

export type Kind = "core" | "green" | "water";

export interface Attractor { x: number; y: number; radius: number; weight: number; kind: Kind }

export interface Settings {
  water_share: number; green_share: number; follow_water: number; coverage: number;
  peak: number; intensity: number; base: number;
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
  floorArea: Float64Array;
  attractors: Attractor[];
  settings: Settings;
  scores: Scores | null;
  floorHa?: number;
}

export interface Stats {
  floor_area_ha: number; far: number; building: number; landscape: number; water: number;
  mean_levels: number; max_levels: number;
}

export interface Rng { random: () => number; normal: (mu?: number, sigma?: number) => number }
