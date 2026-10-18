// The site's design ground, as the engine sees it: read from an export
// (pc.export.ground_from_export), or rebuilt in the browser from the layers and a rule
// set (pc.genome.prepare + pc.export._design), so edited rules need no server.
import { SITE_WATER_REACH_M } from "./config.js";
import { gridOf, passes } from "./graph.js";
import { norm, pyRound, smooth } from "./num.js";
import { CONSTRAINED, OPEN, type RuleResult } from "./rules.js";
import type { Ground, SiteExport } from "./types.js";

export function prepare(site: SiteExport): Ground {
  return fromDesign(site, site.design);
}

function fromDesign(site: SiteExport, d: SiteExport["design"]): Ground {
  const n = d.x.length;
  let xmin = Infinity, ymin = Infinity, xmax = -Infinity, ymax = -Infinity;
  for (let i = 0; i < n; i++) {
    if (d.x[i] < xmin) xmin = d.x[i];
    if (d.x[i] > xmax) xmax = d.x[i];
    if (d.y[i] < ymin) ymin = d.y[i];
    if (d.y[i] > ymax) ymax = d.y[i];
  }
  const grid = gridOf(site.meta);
  return {
    n, x: Float64Array.from(d.x), y: Float64Array.from(d.y),
    grid, deg: grid.degree, nbr: Int32Array.from(d.nbr),
    canBuild: d.can.map((c) => (c & 1) > 0), canGreen: d.can.map((c) => (c & 2) > 0),
    canWater: d.can.map((c) => (c & 4) > 0),
    cap: Float64Array.from(d.cap), minPerm: Float64Array.from(d.min_perm),
    trees: Float64Array.from(d.trees), siteWater: Float64Array.from(d.site_water),
    cellArea: site.meta.cell_area, bounds: [xmin, ymin, xmax, ymax],
    meta: site.meta,
  };
}

/** The design ground a rule result gives: cells on land that are constrained or open,
 *  in grid order, exactly as Python exports it. Needs a format-2 export. */
export function designFromRules(site: SiteExport, res: RuleResult): SiteExport["design"] {
  const g = site.grid, L = g.layers, gn = g.nbr;
  if (!L || !gn) throw new Error("this site file is format 1: re-export it to edit rules in the browser");
  const water = L.water;
  const cells: number[] = [];
  for (let i = 0; i < res.n; i++) {
    if (!water[i] && (res.state[i] === CONSTRAINED || res.state[i] === OPEN)) cells.push(i);
  }
  const n = cells.length;
  const pos = new Int32Array(res.n).fill(-1);
  cells.forEach((c, k) => { pos[c] = k; });

  // Neighbours within the design ground, in the grid's neighbour order.
  const grid = gridOf(site.meta), D = grid.degree;
  const nbr = new Int32Array(n * D).fill(-1);
  cells.forEach((c, k) => {
    let w = 0;
    for (let j = 0; j < D; j++) {
      const o = gn[c * D + j];
      if (o >= 0 && pos[o] >= 0) nbr[k * D + w++] = pos[o];
    }
  });

  const col = (name: string) => Float64Array.from(cells, (c) => (L[name][c] ?? NaN));
  const floodNames = Object.keys(L).filter((k) => k.includes("flood_"));
  const flood = new Float64Array(n);
  if (floodNames.length) {
    const cols = floodNames.map(col);
    for (let k = 0; k < n; k++) {
      let m = -Infinity;
      for (const f of cols) if (f[k] > m) m = f[k];
      flood[k] = m;
    }
  }
  const pool = norm(col("pool")), up = norm(col("upstream").map(Math.log1p)), fl = norm(flood);
  const raw = new Float64Array(n);
  for (let k = 0; k < n; k++) raw[k] = pool[k] + up[k] + fl[k];
  const siteWater = norm(smooth(raw, nbr, D, passes(SITE_WATER_REACH_M, grid.spacing)));

  const uses = cells.map((c) => res.uses[c]);
  const trees = col("trees");
  return {
    x: cells.map((c) => g.x[c]), y: cells.map((c) => g.y[c]),
    nbr: Array.from(nbr),
    can: uses.map((u) => (u.includes("building") ? 1 : 0) | (u.includes("landscape") ? 2 : 0)
      | (u.includes("water") || u.includes("wetland") ? 4 : 0)),
    cap: cells.map((c) => res.maxLevels[c]),
    min_perm: cells.map((c) => pyRound(res.minPermeable[c], 3)),
    trees: Array.from(trees, (v) => pyRound(v, 3)),
    site_water: Array.from(siteWater, (v) => pyRound(v, 6)),
  };
}

/** The engine's Ground from a rule result (the browser's own `prepare`). */
export function prepareFromRules(site: SiteExport, res: RuleResult): Ground {
  return fromDesign(site, designFromRules(site, res));
}
