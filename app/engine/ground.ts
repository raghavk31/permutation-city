// The site's design ground, as the engine sees it: read from an export
// (pc.export.ground_from_export), or rebuilt in the browser from the layers and a rule
// set (pc.genome.prepare + pc.export._design), so edited rules need no server.
import { SITE_WATER_REACH_M } from "./config.js";
import { gridOf, passes } from "./graph.js";
import { norm, pyRound, smooth } from "./num.js";
import { CONSTRAINED, OPEN, type RuleResult } from "./rules.js";
import { sides } from "./streets.js";
import type { Ground, GroundSkeleton, SiteExport } from "./types.js";

export function prepare(site: SiteExport): Ground {
  const G = fromDesign(site, site.design);
  if (site.skeleton) G.skeleton = skeletonOn(G, site.skeleton, site.skeleton.sides, site.skeleton.crossings, site.skeleton.road_sides);
  return G;
}

/** The skeleton's sides ([cell, direction, ridge, class]) as sides of this ground. `off`:
 *  ridges a person has switched off (their sides go; the joins stay). */
function skeletonOn(G: Ground, sk: NonNullable<SiteExport["skeleton"]>, list: [number, number, number, number][],
  crossings: [number, number][], roads: [number, number][], off: ReadonlySet<number> = new Set()): GroundSkeleton {
  const sd = sides(G), D = G.deg;
  const side = (i: number, a: number) => (i >= 0 && i < G.n ? sd.at[i * D + a] : -1);
  const kept = list.filter(([i, a, r]) => side(i, a) >= 0 && !off.has(r));
  const ids = kept.map(([i, a]) => side(i, a));
  return {
    source: sk.source, note: sk.note,
    sides: Int32Array.from(ids), level: Int8Array.from(kept, (x) => x[3] ?? 3), ridge: Int32Array.from(kept, (x) => x[2]),
    crossings: crossings.filter(([i, a]) => side(i, a) >= 0).length, crossingCap: sk.crossing_cap, connected: sk.connected,
    ridges: sk.ridges, roadSides: Int32Array.from(roads.map(([i, a]) => side(i, a)).filter((s) => s >= 0)),
  };
}

/** The ground with some ridges of its skeleton switched off (the landform view). */
export function withSkeleton(site: SiteExport, G: Ground, off: ReadonlySet<number>): Ground {
  if (!site.skeleton) return G;
  const H = { ...G };
  H.skeleton = skeletonOn(H, site.skeleton, site.skeleton.sides, site.skeleton.crossings, site.skeleton.road_sides, off);
  return H;
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
    meta: site.meta, roads: site.context.roads, activities: site.context.activities,
    ...(d.z ? {
      z: Float64Array.from(d.z), valley: Int8Array.from(d.valley!), vbuf: Uint8Array.from(d.vbuf!),
      down: Int32Array.from(d.down!), ridge: Float64Array.from(d.ridge!),
      lst: d.lst ? Float64Array.from(d.lst, (v) => (v === null ? NaN : v)) : null,
    } : {}),
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
  // Format 4: the landform columns, and the cell each drains to as a design index.
  const landform = L.valley_order && g.down ? {
    z: cells.map((c) => L.ground[c] ?? 0), valley: cells.map((c) => L.valley_order[c] ?? 0),
    vbuf: cells.map((c) => ((L.valley_buffer[c] ?? 0) || (L.valley_order[c] ?? 0) >= 1 ? 1 : 0)),
    down: cells.map((c) => (g.down![c] >= 0 ? pos[g.down![c]] : -1)), ridge: cells.map((c) => L.ridge[c] ?? 0),
    ...(L.lst ? { lst: cells.map((c) => L.lst[c]) } : {}),
  } : {};
  return {
    x: cells.map((c) => g.x[c]), y: cells.map((c) => g.y[c]),
    nbr: Array.from(nbr),
    can: uses.map((u) => (u.includes("building") ? 1 : 0) | (u.includes("landscape") ? 2 : 0)
      | (u.includes("water") || u.includes("wetland") ? 4 : 0)),
    cap: cells.map((c) => res.maxLevels[c]),
    min_perm: cells.map((c) => pyRound(res.minPermeable[c], 3)),
    trees: Array.from(trees, (v) => pyRound(v, 3)),
    site_water: Array.from(siteWater, (v) => pyRound(v, 6)),
    ...landform,
  };
}

/** The engine's Ground from a rule result (the browser's own `prepare`). The skeleton is the
 *  site's own, mapped onto the new design ground from grid cells: sides whose cells are no
 *  longer design ground drop out (edited rules don't move the skeleton). */
export function prepareFromRules(site: SiteExport, res: RuleResult): Ground {
  const G = fromDesign(site, designFromRules(site, res));
  const sk = site.skeleton;
  if (sk?.grid_sides) {
    const pos = new Int32Array(res.n).fill(-1);
    let k = 0;
    const water = site.grid.layers!.water;
    for (let c = 0; c < res.n; c++) if (!water[c] && (res.state[c] === CONSTRAINED || res.state[c] === OPEN)) pos[c] = k++;
    const D = G.deg, gn = site.grid.nbr!;
    // A grid side [cell, direction] onto the design ground: from the cell if it is design
    // ground, else from its neighbour that way, looking back.
    const onto = (c: number, a: number): [number, number] => {
      if (pos[c] >= 0) return [pos[c], a];
      const sd = sides(G);
      for (let q = 0; q < D; q++) {
        const o = gn[c * D + q];
        if (o >= 0 && pos[o] >= 0) {
          const back = (a + D / 2) % D, sid = sd.at[pos[o] * D + back];
          const dx = G.x[pos[o]] - site.grid.x[c], dy = G.y[pos[o]] - site.grid.y[c];
          const dirTo = ((Math.floor(Math.atan2(dy, dx) / ((2 * Math.PI) / D) + 0.5) % D) + D) % D;
          if (dirTo === a && sid >= 0) return [pos[o], back];
        }
      }
      return [-1, 0];
    };
    const list = sk.grid_sides.map(([c, a, r, l]): [number, number, number, number] => [...onto(c, a), r, l]);
    G.skeleton = skeletonOn(G, sk, list, (sk.grid_crossings ?? []).map(([c, a]) => onto(c, a)),
      (sk.grid_road_sides ?? []).map(([c, a]) => onto(c, a)));
  }
  return G;
}
