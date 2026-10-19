// Form metrics: readouts on any design (pc/metrics; definitions in docs/metrics.md).
//
// Each is a pure function of a design's network (network.ts), built once per design and
// only when asked for: the readout panel, or a metric promoted to an objective or a
// MAP-Elites trait. Wholeness is the list, never one number.
import type { Aesthetic } from "../brief.js";
import type { Design, Ground } from "../types.js";
import { coherence, heightEntropy, typeEntropy, useEntropy } from "./harmony.js";
import { greenCover, greenView, greenWalk, legibility, semilattice, waterWalk } from "./nature.js";
import { network, type Net } from "./network.js";
import {
  balance, boundaries, contrast, gradients, landmarkPlacement, levelsOfScale, localSymmetry, positiveSpace, rhythmBuilt,
  rhythmSkyline, roughness, strongCentres, symmetry, theVoid,
} from "./order.js";
import { deadEnds, heatFit, junctionDensity, lowStreets, meshedness, ridgeStreets, runoffPath, valleyFree } from "./land.js";
import { activeFrontage, blockSize, connections, dhEnclosure, lowFrontage } from "./scale.js";

/** label, the property it reads (the brief's vocabulary), higher is better (null: neither,
 *  shown but never optimised), format, what it measures. */
export interface Metric {
  label: string; property: Aesthetic; up: boolean | null; fmt: (v: number) => string; note: string;
  value: (net: Net) => number;
  range?: [number, number];  // where most designs fall, for MAP-Elites bins (default 0 to 1)
}

const pct = (v: number) => `${Math.round(v * 100)}%`;
const num = (dp: number) => (v: number) => v.toFixed(dp);

export const METRICS = {
  // Human scale
  dh_enclosure: { label: "street enclosure", property: "human_scale", up: true, fmt: pct, value: dhEnclosure,
    note: "street faces with width over height between 1 and 3" },
  block_size: { label: "walkable blocks", property: "human_scale", up: true, fmt: pct, value: blockSize,
    note: "building cells in blocks with a perimeter of 400 m or less" },
  low_frontage: { label: "low street faces", property: "human_scale", up: true, fmt: pct, value: lowFrontage,
    note: "street faces on buildings of six storeys or fewer" },
  // Permeability and active edges
  junctions: { label: "junctions", property: "permeability", up: true, fmt: (v) => `${Math.round(v)}/km²`,
    value: junctionDensity, note: "corners where three streets meet, per km² (T and Y only on hexes)", range: [0, 150] },
  connections: { label: "connections per block", property: "permeability", up: true, fmt: num(1), value: connections,
    note: "different spaces each block opens onto", range: [2, 10] },
  active_frontage: { label: "active frontage", property: "permeability", up: true, fmt: pct, value: activeFrontage,
    note: "building faces on primary and secondary streets" },
  meshedness: { label: "meshedness", property: "permeability", up: true, fmt: pct, value: meshedness,
    note: "loops the street network has, of those it could (0: a tree)" },
  dead_ends: { label: "dead ends", property: "permeability", up: false, fmt: pct, value: deadEnds,
    note: "street ends inside the site, of all junctions and ends" },
  // Connection to nature
  green_walk: { label: "park within 300 m", property: "connection_to_nature", up: true, fmt: pct, value: greenWalk,
    note: "buildings within a 300 m walk of a park of 0.5 ha or more" },
  water_walk: { label: "water within 300 m", property: "connection_to_nature", up: true, fmt: pct, value: waterWalk,
    note: "buildings within a 300 m walk of water" },
  green_cover: { label: "landscape cover", property: "connection_to_nature", up: true, fmt: pct, value: greenCover,
    note: "landscape share of the design ground" },
  green_view: { label: "green view", property: "connection_to_nature", up: true, fmt: pct, value: greenView,
    note: "open cells within two steps of each building" },
  // Water and land fit (McHarg: valleys carry water, ridges carry movement)
  valley_free: { label: "valleys kept open", property: "connection_to_nature", up: true, fmt: pct, value: valleyFree,
    note: "valley channels and buffers free of buildings" },
  ridge_streets: { label: "streets on ridges", property: "connection_to_nature", up: true, fmt: pct, value: ridgeStreets,
    note: "streets beside a divide or on the highest quarter of the ground" },
  low_streets: { label: "streets in low ground", property: "connection_to_nature", up: false, fmt: pct, value: lowStreets,
    note: "streets across valleys or on the lowest quarter of the ground" },
  runoff_path: { label: "runoff path", property: "connection_to_nature", up: false, fmt: (v) => `${Math.round(v)} m`,
    value: runoffPath, note: "how far rain runs from a building to landscape or water", range: [0, 300] },
  heat_fit: { label: "cooling where it's hot", property: "connection_to_nature", up: true,
    fmt: (v) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}°C`, value: heatFit,
    note: "hot-season surface temperature of the open cells, against the site's mean (Landsat)", range: [-2, 2] },
  // Harmony and variety
  height_mix: { label: "mix of heights", property: "harmony_variety", up: null, fmt: pct, value: heightEntropy,
    note: "entropy of storeys (0 all alike, 1 evenly spread)" },
  use_mix: { label: "mix of uses", property: "harmony_variety", up: null, fmt: pct, value: useEntropy,
    note: "entropy of building, landscape and water" },
  type_mix: { label: "mix of types", property: "harmony_variety", up: null, fmt: pct, value: typeEntropy,
    note: "entropy of low, mid and tall buildings, landscape and water" },
  coherence: { label: "proportion palette", property: "harmony_variety", up: true, fmt: pct, value: coherence,
    note: "blocks sharing a few proportions of plan and massing" },
  // The fifteen properties
  levels_of_scale: { label: "levels of scale", property: "levels_of_scale", up: true, fmt: pct, value: levelsOfScale,
    note: "ground shared evenly among sizes of block and open space (e-fold steps)" },
  strong_centres: { label: "strong centres", property: "strong_centres", up: true, fmt: pct, value: strongCentres,
    note: "how strongly storeys fall away from each centre" },
  boundaries: { label: "defined edges", property: "boundaries", up: true, fmt: pct, value: boundaries,
    note: "edges of open spaces that buildings define" },
  rhythm_built: { label: "rhythm of built and open", property: "alternating_repetition", up: true, fmt: pct,
    value: rhythmBuilt, note: "strength of the strongest repeat along the rows" },
  rhythm_skyline: { label: "rhythm of the skyline", property: "alternating_repetition", up: true, fmt: pct,
    value: rhythmSkyline, note: "strength of the strongest repeat in storeys along the rows" },
  positive_space: { label: "positive space", property: "positive_space", up: true, fmt: pct, value: positiveSpace,
    note: "how convex the open spaces are" },
  local_symmetry: { label: "local symmetries", property: "local_symmetries", up: true, fmt: pct, value: localSymmetry,
    note: "mixed neighbourhoods that are mirror-symmetric" },
  symmetry: { label: "overall symmetry", property: "local_symmetries", up: null, fmt: pct, value: symmetry,
    note: "mirror correlation of the skyline about the best axis" },
  balance: { label: "balance", property: "local_symmetries", up: true, fmt: pct, value: balance,
    note: "centre of the floor area against the centre of the ground" },
  contrast: { label: "contrast", property: "contrast", up: true, fmt: pct, value: contrast,
    note: "neighbours that differ in use or height band" },
  landmarks: { label: "landmarks at nodes", property: "contrast", up: true, fmt: pct, value: landmarkPlacement,
    note: "landmarks within 100 m of a junction or centre" },
  gradients: { label: "gradients", property: "gradients", up: true, fmt: pct, value: gradients,
    note: "changes in height between neighbours that are one storey" },
  roughness: { label: "roughness", property: "roughness", up: null, fmt: pct, value: roughness,
    note: "variation of storeys within blocks (low but not zero)" },
  the_void: { label: "the void", property: "the_void", up: true, fmt: pct, value: theVoid,
    note: "the largest open space, as a share of the ground" },
  semilattice: { label: "semilattice richness", property: "semilattice_richness", up: true, fmt: pct,
    value: semilattice, note: "cells in more than one 400 m catchment (parks, water, centres, roads)" },
  legibility: { label: "legibility (placeholder)", property: "legibility", up: true, fmt: pct, value: legibility,
    note: "cells within 300 m of a landmark or centre; Phase 8 replaces it" },
} satisfies Record<string, Metric>;

export type MetricKey = keyof typeof METRICS;
export const METRIC_KEYS = Object.keys(METRICS) as MetricKey[];
/** Metrics with a better end: the ones that can become objectives. */
export const OBJECTIVE_KEYS = METRIC_KEYS.filter((k) => (METRICS[k] as Metric).up !== null);
/** Properties with no proxy here, and why (docs/metrics.md). */
export const NOT_MEASURED: Partial<Record<Aesthetic, string>> = {
  echoes: "building scale (Phase 7)",
  not_separateness: "needs the context's own cells next to the design; Phase 9",
};

export type Metrics = Record<MetricKey, number>;

/** Some or all metrics of a design. */
export function measure(d: Design, G: Ground, keys: readonly MetricKey[] = METRIC_KEYS): Partial<Metrics> {
  const net = network(d, G), out: Partial<Metrics> = {};
  for (const k of keys) out[k] = (METRICS[k] as Metric).value(net);
  return out;
}

export { network, type Net } from "./network.js";
