// Drawing the layer cake: one small map per layer, and the rules map they add up to.
import * as E from "../../engine";
import * as Draw from "../draw";
import { colours, type Layer } from "./cake";

/** Legend swatches for the rule states (Draw.RULE_LOOK). */
export const STATE_SWATCHES = Draw.RULE_LOOK.map((r) => r.swatch);

/** One layer on its own. Returns the view, for hover. */
export function layerMap(canvas: HTMLCanvasElement, site: E.SiteExport, l: Layer, P: Draw.Palette): Draw.View {
  const colourOf = colours(site, l, P);
  const water = site.grid.layers!.water;
  const aspect = Draw.aspectOf(site.design.x, site.design.y);
  return Draw.layer(canvas, site, (i) => colourOf(i) ?? (water[i] && l.name !== "water" ? P.t.water.deep : null), P,
    { aspect, buildings: l.ramp !== "existing" });
}

/** The rules map: each cell's state, conflicts marked with a dot, one rule's cells outlined
 *  in the accent when `highlight` is set. */
export function rulesMap(canvas: HTMLCanvasElement, site: E.SiteExport, res: E.RuleResult, P: Draw.Palette,
  highlight: number | null = null): Draw.View {
  const g = site.grid, water = g.layers!.water, shape = Draw.shapeOf(site).corners;
  const aspect = Draw.aspectOf(site.design.x, site.design.y);
  const v = Draw.layer(canvas, site, (i) => (water[i] ? P.t.water.deep : Draw.RULE_LOOK[res.state[i]].colour), P,
    { aspect, labels: true, styles: Draw.RULE_STYLES, buildings: false });
  const ctx = canvas.getContext("2d")!;
  if (highlight !== null) {
    // The rule being read is the selection: its cells outlined in the accent.
    const hits = res.hits[highlight];
    Draw.fillRegions(ctx, v, g.x, g.y, g.x.map((_, i) => (hits[i] && !water[i] ? "hit" : null)), shape,
      { hit: { fill: false, edge: P.t.accent, width: 2 } });
  }
  Draw.dots(ctx, v, g.x, g.y, (i) => !!res.conflict[i], P.ink, 1.4);
  return v;
}

export function cellAt(v: Draw.View, site: E.SiteExport, e: PointerEvent): number {
  return Draw.cellAt(v, site.grid.x, site.grid.y, e.offsetX, e.offsetY, Draw.shapeOf(site).r);
}
