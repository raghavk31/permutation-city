// Shapes shared by the engine and the UI.

/** A site as `pc export` writes it (app/public/sites/<id>.json). */
export interface SiteExport {
  meta: SiteMeta;
  grid: {
    x: number[]; y: number[];
    water: number[]; state: number[];
    ground: number[]; flood: number[]; pool: number[]; green: number[]; built: number[];
    industrial: number[]; reasons: string[];
  };
  design: {
    x: number[]; y: number[];
    nbr: number[];        // n × 6, -1 where there is no neighbour
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

export interface SiteMeta {
  id: string; name: string; origin: [number, number];
  hex_radius: number; cell_area: number;
  design_storm_mm: number; target_far: number; target_floor_area_ha: number | null;
  target_ha: number; design_ha: number;
  sea_levels: Record<string, number>; states: string[]; credits: string[];
}

/** The engine's view of a site's design ground (pc.genome.Ground). */
export interface Ground {
  n: number;
  x: Float64Array; y: Float64Array;
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
