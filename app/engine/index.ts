// Permutation City: the browser engine.
//
// A line-for-line port of pc/rules.py (the McHarg rules), pc/genome.py (growth), pc/fitness.py (scores, Pareto ranks,
// families), pc/evolve.py and pc/niche.py (evolution: NSGA-II or NSGA-III) and pc/elites.py (MAP-Elites), reading
// a site exported by `pc export`.
// test/parity checks that it grows and scores designs exactly as Python does.
//
// No dependencies. Runs in the browser (main thread or Web Worker) and in Node.
export * from "./config.js";
export * from "./types.js";
export { roundHalfEven, smooth } from "./num.js";
export {
  cellAreaOf, circumradius, corners, designGraph, gridLabel, gridOf, passes, siteGraph, type CellGraph,
} from "./graph.js";
export { prepare, prepareFromRules, designFromRules, withSkeleton } from "./ground.js";
export { sides, streets, centrelines, LANE, SECONDARY, PRIMARY, type Sides, type Streets } from "./streets.js";
export {
  applyRules, evaluate as evaluateCondition, layersUsed, MissingLayer, STATES, FORBIDDEN, RETAINED, CONSTRAINED, OPEN,
  type RuleResult,
} from "./rules.js";
export { decode, grow, randomGenome, stats, upgrade } from "./genome.js";
export { briefFloorArea, evaluate, floorAreaTarget, heatField, storageDepth, SCORES, SCORE_KEYS } from "./fitness.js";
export { capacityOf, groundKey } from "./capacity.js";
export { BENGALURU, coverageFor, farFor, highSetback, lowSetbacks, plotRulesOf, roadStoreys, type PlotRules } from "./regs.js";
export { paretoRanks, crowding, difference, families, asMin } from "./rank.js";
export { referencePoints, divisionsFor, nicheSelect } from "./niche.js";
export { makeRng } from "./rng.js";
export * from "./brief.js";
export { evolve, breed, frontFamilies, type Individual, type Run, type HistoryRow, type EvolveOptions, type Search, type LineageNode } from "./evolve.js";
export { mapElites, quality, binOf, searchOf, DESCRIPTORS, DESCRIPTOR_KEYS, QUALITY_RANGE, type Descriptor,
  type ArchiveInfo, type EliteOptions, type SearchChoice } from "./elites.js";
export { measure, network, METRICS, METRIC_KEYS, OBJECTIVE_KEYS, NOT_MEASURED, SYNTAX_KEYS, type Metric, type MetricKey,
  type Metrics, type Net } from "./metrics/index.js";
export * from "./shocks.js";
export * from "./scenarios.js";
export * from "./piecemeal.js";
