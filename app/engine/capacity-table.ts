// Written by scripts/capacity.ts (npm run capacity -- --write): what each site's plot rules let
// its plans hold, per ground (engine/capacity.ts). Don't edit by hand.
import type { Capacity } from "./types.js";

export const CAPACITY_TABLE: Record<string, Capacity[]> = {
  "bengaluru-cascade": [
    {
      "key": "bengaluru-cascade:2308:36a4986c",
      "floor_m2": 1809657,
      "median_m2": 1402527,
      "n": 48,
      "seed": 20261027,
      "note": "the site's rules"
    },
    {
      "key": "bengaluru-cascade:2843:82274810",
      "floor_m2": 2216609,
      "median_m2": 1711664,
      "n": 48,
      "seed": 20261027,
      "note": "the law's lake buffer only"
    }
  ]
};
