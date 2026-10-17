// Permutation City: the browser engine.
//
// A line-for-line port of pc/rules.py (the McHarg rules), pc/genome.py (growth), pc/fitness.py (scores, Pareto ranks,
// families) and pc/evolve.py (evolution), reading a site exported by `pc export`.
// test/parity checks that it grows and scores designs exactly as Python does.
//
// No dependencies. Runs in the browser (main thread or Web Worker) and in Node.
export * from "./config";
export * from "./types";
export { roundHalfEven, smooth } from "./num";
export {
  cellAreaOf, circumradius, corners, designGraph, gridLabel, gridOf, passes, siteGraph, type CellGraph,
} from "./graph";
export { prepare, prepareFromRules, designFromRules } from "./ground";
export {
  applyRules, evaluate as evaluateCondition, layersUsed, MissingLayer, STATES, FORBIDDEN, RETAINED, CONSTRAINED, OPEN,
  type RuleResult,
} from "./rules";
export { decode, grow, randomGenome, stats } from "./genome";
export { evaluate, floorAreaTarget, SCORES, SCORE_KEYS } from "./fitness";
export { paretoRanks, crowding, difference, families } from "./rank";
export { makeRng } from "./rng";
export { evolve, breed, frontFamilies, type Individual, type Run, type HistoryRow, type EvolveOptions } from "./evolve";
