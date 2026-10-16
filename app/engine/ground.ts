// The site's design ground, as the engine sees it (pc.export.ground_from_export).
import type { Ground, SiteExport } from "./types";

export function prepare(site: SiteExport): Ground {
  const d = site.design, n = d.x.length;
  let xmin = Infinity, ymin = Infinity, xmax = -Infinity, ymax = -Infinity;
  for (let i = 0; i < n; i++) {
    if (d.x[i] < xmin) xmin = d.x[i];
    if (d.x[i] > xmax) xmax = d.x[i];
    if (d.y[i] < ymin) ymin = d.y[i];
    if (d.y[i] > ymax) ymax = d.y[i];
  }
  return {
    n, x: Float64Array.from(d.x), y: Float64Array.from(d.y),
    nbr: Int32Array.from(d.nbr),
    canBuild: d.can.map((c) => (c & 1) > 0), canGreen: d.can.map((c) => (c & 2) > 0),
    canWater: d.can.map((c) => (c & 4) > 0),
    cap: Float64Array.from(d.cap), minPerm: Float64Array.from(d.min_perm),
    trees: Float64Array.from(d.trees), siteWater: Float64Array.from(d.site_water),
    cellArea: site.meta.cell_area, bounds: [xmin, ymin, xmax, ymax],
    meta: site.meta,
  };
}
