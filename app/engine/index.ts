// Permutation City: the browser engine.
//
// A line-for-line port of pc/rules.py (the McHarg rules), pc/genome.py (growth), pc/fitness.py (scores, Pareto ranks,
// families) and pc/evolve.py (evolution), reading a site exported by `pc export`.
// test/parity checks that it grows and scores designs exactly as Python does.
//
// No dependencies. Runs in the browser (main thread or Web Worker) and in Node.
export * from "./config.js";
export * from "./types.js";
export { roundHalfEven, smooth } from "./num.js";
export {
  cellAreaOf, circumradius, corners, designGraph, gridLabel, gridOf, passes, siteGraph, type CellGraph,
} from "./graph.js";
export { prepare, prepareFromRules, designFromRules } from "./ground.js";
export {
  applyRules, evaluate as evaluateCondition, layersUsed, MissingLayer, STATES, FORBIDDEN, RETAINED, CONSTRAINED, OPEN,
  type RuleResult,
} from "./rules.js";
export { decode, grow, randomGenome, stats } from "./genome.js";
export { evaluate, floorAreaTarget, SCORES, SCORE_KEYS } from "./fitness.js";
export { paretoRanks, crowding, difference, families } from "./rank.js";
export { makeRng } from "./rng.js";
export * from "./brief.js";
export { evolve, breed, frontFamilies, type Individual, type Run, type HistoryRow, type EvolveOptions } from "./evolve.js";
