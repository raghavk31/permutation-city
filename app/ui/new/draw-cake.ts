// Drawing the layer cake: one small map per layer, and the rules map they add up to.
import * as E from "../../engine";
import * as Draw from "../draw";
import { colours, type Layer } from "./cake";

export const STATE_COLOURS = (P: Draw.Palette) => [P.water, P.retained, P.build, P.green];

/** One layer on its own. Returns the view, for hover. */
export function layerMap(canvas: HTMLCanvasElement, site: E.SiteExport, l: Layer, P: Draw.Palette): Draw.View {
  const colourOf = colours(site, l, P);
  const water = site.grid.layers!.water;
  const aspect = Draw.aspectOf(site.grid.x, site.grid.y);
  return Draw.layer(canvas, site, (i) => colourOf(i) ?? (water[i] && l.name !== "water" ? P.sea : null), P, { aspect });
}

/** The rules map: each cell's state, conflicts marked with a dot, one rule's cells outlined
 *  in ink when `highlight` is set. */
export function rulesMap(canvas: HTMLCanvasElement, site: E.SiteExport, res: E.RuleResult, P: Draw.Palette,
  highlight: number | null = null): Draw.View {
  const g = site.grid, water = g.layers!.water, cols = STATE_COLOURS(P), shape = Draw.shapeOf(site).corners;
  const aspect = Draw.aspectOf(g.x, g.y);
  const v = Draw.layer(canvas, site, (i) => (water[i] ? P.sea : cols[res.state[i]]), P, { aspect, labels: true });
  const ctx = canvas.getContext("2d")!;
  if (highlight !== null) {
    const hits = res.hits[highlight];
    ctx.save();
    ctx.globalAlpha = 0.55;
    Draw.cells(ctx, v, g.x, g.y, g.x.map((_, i) => (hits[i] && !water[i] ? P.ink : null)), shape);
    ctx.restore();
  }
  Draw.cells(ctx, v, g.x, g.y, g.x.map((_, i) => (res.conflict[i] ? P.ink : null)), shape, 0.3);
  return v;
}

export function cellAt(v: Draw.View, site: E.SiteExport, e: PointerEvent): number {
  return Draw.cellAt(v, site.grid.x, site.grid.y, e.offsetX, e.offsetY, Draw.shapeOf(site).r);
}
