// Building-scale massing (Phase 7, TS only; docs/massing.md).
export { envelope, blocksOf, columnXY, RES_M, DEFAULT_SETBACKS, PLOT_MAX_HA, PLOT_MIN_HA, type Envelope, type Plot,
  type Setbacks } from "./envelope.js";
export { massContext, type MassContext, type Representation, type RepKind } from "./context.js";
export { floorArea, footprints, heights, describeRepairs, type Massing, type Box, type Repair } from "./voxels.js";
export { massScores, probe, MASS_SCORES, MASS_SCORE_KEYS, WINTER, HOT, type MassScores, type MassScoreKey } from "./scores.js";
export { sunAt, sunPath, dayOfYear, type Sun } from "./sun.js";
export { evolveMassing, REPRESENTATIONS, MASS_OBJECTIVES, type MassRun, type MassIndividual, type MassOptions } from "./evolve.js";
export { TYPES } from "./typology.js";
export { boxesMesh, skinMesh, massingMesh, contextMesh, boxRing, type Mesh } from "./mesh.js";
export { readouts, READOUTS, DAYLIT_M, type MassReadouts } from "./readouts.js";
export { prepareBlock, type MassSetup, type MassRequest } from "./setup.js";
