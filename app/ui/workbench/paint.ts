// What the workbench's maps draw, step by step, into a canvas at a view (MapCanvas).
import * as E from "../../engine";
import { skeletonLines } from "../../engine/plan/ground";
import * as Draw from "../draw";
import * as Cake from "../new/cake";

type Ctx = CanvasRenderingContext2D;

/** Layers: each switched-on layer dissolved into regions, laid over the ones below it at its
 *  opacity (the first in the list on top), then the roads, boundary and names. */
export function layers(ctx: Ctx, v: Draw.View, site: E.SiteExport, shown: Cake.Layer[], opacity: (n: string) => number, P: Draw.Palette) {
  const shape = Draw.shapeOf(site).corners, dpr = ctx.getTransform().a;
  const off = document.createElement("canvas");
  off.width = ctx.canvas.width; off.height = ctx.canvas.height;
  const o = off.getContext("2d")!;
  for (const l of [...shown].reverse()) {
    o.setTransform(1, 0, 0, 1, 0, 0); o.clearRect(0, 0, off.width, off.height); o.setTransform(dpr, 0, 0, dpr, 0, 0);
    const colourOf = Cake.colours(site, l, P);
    Draw.fillRegions(o, v, site.grid.x, site.grid.y, site.grid.x.map((_, i) => colourOf(i)), shape);
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = opacity(l.name); ctx.drawImage(off, 0, 0); ctx.restore();
  }
  Draw.context(ctx, v, site.context, P, { labels: true });
}

/** Rules: each cell's state (never built hatched red, kept as it is grey, built with limits
 *  hatched grey, free paper), water in blue; one rule's cells outlined in the accent while it
 *  is pointed at; conflicts as dots. */
export function rules(ctx: Ctx, v: Draw.View, site: E.SiteExport, res: E.RuleResult, P: Draw.Palette, highlight: number | null) {
  const g = site.grid, water = g.layers!.water, shape = Draw.shapeOf(site).corners;
  Draw.fillRegions(ctx, v, g.x, g.y, g.x.map((_, i) => (water[i] ? P.t.water.deep : Draw.RULE_LOOK[res.state[i]].colour)), shape, Draw.RULE_STYLES);
  Draw.footprints(ctx, v, site);
  if (highlight !== null) {
    const hits = res.hits[highlight];
    Draw.fillRegions(ctx, v, g.x, g.y, g.x.map((_, i) => (hits[i] && !water[i] ? "hit" : null)), shape,
      { hit: { fill: false, edge: P.t.accent, width: 2.2 } });
  }
  Draw.dots(ctx, v, g.x, g.y, (i) => !!res.conflict[i], P.ink, 1.4);
  Draw.context(ctx, v, site.context, P, { labels: true });
}

/** Landform: the ground's height, faint; valleys by stream order in the water family, their
 *  buffers hatched; the street skeleton on top (ridges in ink, existing roads grey), crossings
 *  of a valley as rings. */
export function landform(ctx: Ctx, v: Draw.View, site: E.SiteExport, G: E.Ground, P: Draw.Palette) {
  const g = site.grid, L = g.layers!, shape = Draw.shapeOf(site).corners;
  const ground = Cake.layerInfo("ground", site), colourOf = Cake.colours(site, ground, P);
  ctx.save(); ctx.globalAlpha = 0.45;
  Draw.fillRegions(ctx, v, g.x, g.y, g.x.map((_, i) => colourOf(i)), shape);
  ctx.restore();
  const order = L.valley_order, buffer = L.valley_buffer, water = L.water;
  const blues = [P.t.water.storage, P.t.water.flood, P.t.water.deep];
  Draw.fillRegions(ctx, v, g.x, g.y, g.x.map((_, i) => (water?.[i] ? P.t.water.deep : order?.[i] ? blues[Math.min(2, (order[i] as number) - 1)] : null)), shape);
  if (buffer) Draw.fillRegions(ctx, v, g.x, g.y, g.x.map((_, i) => (buffer[i] && !order?.[i] ? "buf" : null)), shape,
    { buf: { fill: false, pattern: "/", ink: P.t.water.deep, gap: 5 } });
  Draw.context(ctx, v, site.context, P, { labels: true, roads: false });
  // the skeleton: ridge streets in ink, the existing roads it keeps in grey
  ctx.save(); ctx.lineCap = "round"; ctx.lineJoin = "round";
  for (const l of skeletonLines(G)) {
    ctx.beginPath();
    l.points.forEach(([x, y], k) => (k ? ctx.lineTo(v.px(x), v.py(y)) : ctx.moveTo(v.px(x), v.py(y))));
    ctx.strokeStyle = P.paper; ctx.lineWidth = 6; ctx.stroke();
    ctx.strokeStyle = G.skeleton?.source === "roads" ? P.t.ink2 : P.ink; ctx.lineWidth = l.cls >= 3 ? 3.4 : 2.2; ctx.stroke();
  }
  ctx.restore();
  // crossings: where the skeleton has to cross a valley, a ring on the side between two cells.
  // Crossings next to each other are one ring, at the middle one: a road that runs along a
  // valley (Guwahati's) crosses it at every cell, and a ring for each was a chain of dozens.
  const pts: [number, number][] = [];
  for (const [i, a] of site.skeleton?.crossings ?? []) {
    if (i >= G.n) continue;
    const j = G.nbr[i * G.deg + a];
    pts.push(j >= 0 ? [(G.x[i] + G.x[j]) / 2, (G.y[i] + G.y[j]) / 2] : [G.x[i], G.y[i]]);
  }
  const near = (1.6 * G.grid.spacing) ** 2, group = pts.map((_, k) => k);
  const root = (k: number): number => (group[k] === k ? k : (group[k] = root(group[k])));
  for (let a = 0; a < pts.length; a++) for (let b = a + 1; b < pts.length; b++) {
    if ((pts[a][0] - pts[b][0]) ** 2 + (pts[a][1] - pts[b][1]) ** 2 < near) group[root(a)] = root(b);
  }
  const groups = new Map<number, [number, number][]>();
  pts.forEach((p, k) => { const r = root(k); const g = groups.get(r); if (g) g.push(p); else groups.set(r, [p]); });
  ctx.save(); ctx.strokeStyle = P.t.water.deep; ctx.fillStyle = P.paper; ctx.lineWidth = 2;
  for (const g of groups.values()) {
    // the member nearest the group's centre
    const cx = g.reduce((s, p) => s + p[0], 0) / g.length, cy = g.reduce((s, p) => s + p[1], 0) / g.length;
    const [x, y] = g.reduce((b, p) => ((p[0] - cx) ** 2 + (p[1] - cy) ** 2 < (b[0] - cx) ** 2 + (b[1] - cy) ** 2 ? p : b));
    ctx.beginPath(); ctx.arc(v.px(x), v.py(y), 5, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
  }
  ctx.restore();
}

/** A design: the existing city round it, its plan (plots, streets, green and water), then
 *  the boundary and names. */
export function design(ctx: Ctx, v: Draw.View, site: E.SiteExport, d: E.Design, P: Draw.Palette) {
  Draw.footprints(ctx, v, site);
  if (d.plan) Draw.vectorPlan(ctx, v, d);
  Draw.groundBuildings(ctx, v, site, "kept", P);
  moveOutlines(ctx, v, site, P);
  Draw.context(ctx, v, site.context, P, { labels: true, roads: false });
}

/** The areas and spines drawn before the run, dashed over a design, so it reads where the
 *  moves were kept (streets show as streets, kept buildings as buildings). */
function moveOutlines(ctx: Ctx, v: Draw.View, site: E.SiteExport, P: Draw.Palette) {
  const shapes = site.moves?.shapes.filter((m) => m.kind === "plaza" || m.kind === "nobuild" || m.kind === "spine") ?? [];
  if (!shapes.length) return;
  ctx.save(); ctx.setLineDash([5, 4]); ctx.lineWidth = 1.4; ctx.strokeStyle = P.t.accent; ctx.lineJoin = "round";
  for (const m of shapes) {
    ctx.beginPath();
    m.pts.forEach(([x, y], k) => (k ? ctx.lineTo(v.px(x), v.py(y)) : ctx.moveTo(v.px(x), v.py(y))));
    if (m.kind !== "spine") ctx.closePath();
    ctx.stroke();
  }
  ctx.restore();
}

/** Draw: what the rules allow (as on the Rules map), the main streets, and the buildings on the
 *  design ground outlined, to keep one. The moves themselves are drawn over it (DrawMap). */
export function drawBase(ctx: Ctx, v: Draw.View, site: E.SiteExport, res: E.RuleResult, G: E.Ground, P: Draw.Palette) {
  rules(ctx, v, site, res, P, null);
  Draw.groundBuildings(ctx, v, site, "all", P);
  ctx.save(); ctx.lineJoin = "round"; ctx.lineCap = "round";
  for (const l of skeletonLines(G)) {
    if (l.drawn) continue;
    ctx.beginPath();
    l.points.forEach(([x, y], k) => (k ? ctx.lineTo(v.px(x), v.py(y)) : ctx.moveTo(v.px(x), v.py(y))));
    ctx.strokeStyle = P.paper; ctx.lineWidth = 5; ctx.stroke();
    ctx.strokeStyle = P.t.ink2; ctx.lineWidth = 2.2; ctx.stroke();
  }
  ctx.restore();
}
