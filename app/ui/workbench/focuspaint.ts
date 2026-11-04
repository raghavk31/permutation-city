// Drawing a real place in the workbench's map (MapCanvas): what can change, what stays and what is
// there, from the place file's own geometry, or one of the analysis layers over it.
import type { Place, Rings } from "../../engine/focus/place";
import type { ViewResult } from "../../engine/focus/views";
import type { SiteExport } from "../../engine/types";
import * as Draw from "../draw";

export type FocusLayer = "zone" | "levels" | "year" | "rules" | "views" | "walk" | "heat" | "wet" | "trees";

// COPY: analysis layers
export const FOCUS_LAYERS: { id: FocusLayer; name: string; note: string }[] = [
  { id: "zone", name: "What can change", note: "Land the river reaches at the chosen level, except what stays." },
  { id: "levels", name: "River levels", note: "How far each recorded level reaches over the ground." },
  { id: "year", name: "River's year", note: "Where the satellite saw water, month by month." },
  { id: "rules", name: "Rules", note: "The limits that apply here, each with its source." },
  { id: "views", name: "Views", note: "How high something can stand before it spoils a view. Darker is lower." },
  { id: "walk", name: "10-minute walk", note: "Buildings within 800 m of the bank, by mapped streets and paths." },
  { id: "heat", name: "Hot ground", note: "Satellite surface temperature, March to May, 2023 to 2025." },
  { id: "wet", name: "Wet record", note: "How often the satellite saw water, end of the monsoon, 2019 to 2025." },
  { id: "trees", name: "Tree cover", note: "ESA WorldCover 2021." },
];

/** What MapCanvas reads of a site, from a place: its frame, its cells and their shape. */
export function placeFrame(place: Place): SiteExport {
  const [x0, y0, x1, y1] = place.meta.box;
  return { meta: { id: place.meta.id, name: place.meta.name, origin: place.meta.origin, grid: place.meta.grid },
    design: { x: [x0, x1], y: [y0, y1] }, grid: { x: place.cells.x, y: place.cells.y } } as unknown as SiteExport;
}

export interface PaintOptions {
  mark: number; layer: FocusLayer; near: Uint8Array | null; stayOn: string | null;
  shape: { corners: [number, number][]; r: number };
  /** Per cell, the tightest view limit on show, and the views on show with what crosses them. */
  viewLimit?: Float32Array | null; viewsOn?: ViewResult[];
  /** The river's year: a month's looks wet per cell (0-100), or dry days per cell. */
  monthWet?: number[] | null; dryDays?: Int16Array | null;
  ruleOn?: string | null;
  /** Cells a stakeholder has decided needn't stay. */
  released?: Uint8Array | null;
}

/** View limits on the map run from nothing to this, in metres, and anything above reads as this. */
export const VIEW_RAMP_M = 12;

export function heatRange(place: Place): [number, number] {
  let lo = Infinity, hi = -Infinity;
  for (const v of place.cells.lst) if (v !== null) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  return [lo, hi];
}

export function paintPlace(c: CanvasRenderingContext2D, v: Draw.View, place: Place, o: PaintOptions, P: ReturnType<typeof Draw.palette>): void {
  const X = v.px, Y = v.py, t = P.t;
  const [x0, y0, x1, y1] = place.meta.box;
  const trace = (ring: number[]) => {
    c.moveTo(X(ring[0]), Y(ring[1]));
    for (let i = 2; i < ring.length; i += 2) c.lineTo(X(ring[i]), Y(ring[i + 1]));
    c.closePath();
  };
  const rings = (r: Rings) => { c.beginPath(); for (const poly of r) for (const ring of poly) trace(ring); };
  const line = (pts: number[]) => {
    c.beginPath();
    c.moveTo(X(pts[0]), Y(pts[1]));
    for (let i = 2; i < pts.length; i += 2) c.lineTo(X(pts[i]), Y(pts[i + 1]));
    c.stroke();
  };
  const cell = (i: number, colour: string) => {
    const cx = place.cells.x[i], cy = place.cells.y[i];
    c.fillStyle = colour;
    c.beginPath();
    o.shape.corners.forEach(([a, b], k) => { if (k) c.lineTo(X(cx + a), Y(cy + b)); else c.moveTo(X(cx + a), Y(cy + b)); });
    c.closePath();
    c.fill();
  };

  c.save();
  c.beginPath();
  c.rect(X(x0), Y(y1), (x1 - x0) * v.s, (y1 - y0) * v.s);
  c.clip();

  c.fillStyle = t.green.light;
  c.globalAlpha = 0.55;
  for (const l of place.land_use) { rings(l.rings); c.fill("evenodd"); }
  c.globalAlpha = 1;

  // The chosen layer, under the water and the city.
  const n = place.cells.x.length, cells = place.cells;
  if (o.layer === "zone") {
    c.fillStyle = t.accent;
    c.globalAlpha = 0.2;
    rings(place.outlines[o.mark].rings);
    c.fill("evenodd");
    if (o.released) for (let i = 0; i < n; i++) if (o.released[i] && cells.band[i] >= 1 && cells.band[i] <= o.mark + 1) cell(i, t.accent);
    c.globalAlpha = 1;
  } else if (o.layer === "levels") {
    const ramp = [t.water.storage, t.water.flood, "#6f97c4"];
    for (let i = 0; i < n; i++) if (cells.band[i] >= 1 && cells.band[i] <= ramp.length) cell(i, ramp[ramp.length - cells.band[i]]);
  } else if (o.layer === "heat") {
    const [lo, hi] = heatRange(place);
    for (let i = 0; i < n; i++) { const h = cells.lst[i]; if (h !== null) cell(i, Draw.step(t.heat, (h - lo) / Math.max(1e-6, hi - lo))); }
  } else if (o.layer === "wet") {
    for (let i = 0; i < n; i++) if (cells.seasonal[i] > 0.02) cell(i, Draw.step(P.blues, Math.min(1, cells.seasonal[i])));
  } else if (o.layer === "trees") {
    for (let i = 0; i < n; i++) if (cells.trees[i] > 0.05) { c.globalAlpha = Math.min(1, cells.trees[i] + 0.1); cell(i, t.green.existing); }
    c.globalAlpha = 1;
  } else if (o.layer === "year") {
    if (o.monthWet) {
      for (let i = 0; i < n; i++) if (o.monthWet[i] > 2) cell(i, Draw.step(P.blues, o.monthWet[i] / 100));
    } else if (o.dryDays) {
      for (let i = 0; i < n; i++) if (cells.band[i] >= 1 && o.dryDays[i] >= 0 && o.dryDays[i] < 360) cell(i, Draw.step(P.blues, 1 - o.dryDays[i] / 365));
    }
  } else if (o.layer === "rules") {
    // The tokens' own language: no construction a red hatch, permission a thin grey one, never a fill.
    const looks = { no_build: ["/", t.forbidden, 6], permission: ["\\", t.constrained, 9] } as const;
    for (const r of place.brief.rules ?? []) {
      if (!r.rings || (r.kind !== "no_build" && r.kind !== "permission")) continue;
      const [kind, col, gap] = looks[r.kind];
      c.fillStyle = Draw.pattern(c, kind, col, r.id === o.ruleOn ? gap - 3 : gap);
      rings(r.rings);
      c.fill("evenodd");
    }
  } else if (o.layer === "views" && o.viewLimit) {
    const ramp = [...t.elevation].reverse();
    for (let i = 0; i < n; i++) if (Number.isFinite(o.viewLimit[i])) cell(i, Draw.step(ramp, Math.min(1, o.viewLimit[i] / VIEW_RAMP_M)));
  }

  c.fillStyle = t.water.deep;
  for (const f of place.water) { rings(f.rings); c.fill("evenodd"); }

  c.strokeStyle = t.line;
  c.lineWidth = 0.6;
  for (const s of place.streets) line(s.pts);
  c.strokeStyle = t.muted;
  c.lineWidth = 1.1;
  for (const s of place.streets) if (s.class === "primary" || s.class === "secondary") line(s.pts);
  c.setLineDash([4, 3]);
  c.lineWidth = 0.8;
  for (const s of place.rail) line(s.pts);
  c.setLineDash([]);

  // Buildings: what the layer is about in ink, the rest quiet.
  const { rings: br, cell: bc } = place.buildings;
  for (let b = 0; b < br.length; b++) {
    const k = bc[b];
    const hit = o.layer === "walk" ? !!o.near?.[b]
      : o.layer === "zone" && k >= 0 && cells.band[k] >= 1 && cells.band[k] <= o.mark + 1 && (!cells.stay[k] || !!o.released?.[k]);
    c.fillStyle = hit ? P.ink : t.existing.fill;
    c.beginPath();
    trace(br[b]);
    c.fill();
  }
  // What crosses a sight line today.
  c.fillStyle = t.forbidden;
  for (const r of o.layer === "views" ? o.viewsOn ?? [] : []) for (const b of r.blockers) {
    c.beginPath();
    trace(br[b.building]);
    c.fill();
  }

  // Rings of the rules that have an outline but no fill, and the rules' own outlines.
  if (o.layer === "rules") {
    for (const r of place.brief.rules ?? []) {
      if (!r.rings) continue;
      c.strokeStyle = r.kind === "no_build" ? t.forbidden : t.constrained;
      c.lineWidth = r.id === o.ruleOn ? 2.5 : 1;
      c.setLineDash(r.kind === "unconfirmed" ? [2, 3] : []);
      rings(r.rings);
      c.stroke();
    }
    c.setLineDash([]);
  }

  // Sight lines: the eye, and the edges of what it looks at.
  if (o.layer === "views") {
    c.strokeStyle = P.ink;
    c.fillStyle = P.ink;
    for (const r of o.viewsOn ?? []) {
      const [ex, ey] = r.def.eye;
      const to = r.def.target?.at ?? r.def.looks!.at;
      c.lineWidth = 1;
      c.setLineDash([2, 3]);
      c.beginPath();
      if (r.def.target) {
        const D = Math.hypot(to[0] - ex, to[1] - ey), ux = (to[0] - ex) / D, uy = (to[1] - ey) / D, h = r.def.target.half_m;
        for (const s of [-1, 1]) { c.moveTo(X(ex), Y(ey)); c.lineTo(X(to[0] + uy * h * s), Y(to[1] - ux * h * s)); }
      } else {
        const a = Math.atan2(to[1] - ey, to[0] - ex), f = (r.def.looks!.fan_deg * Math.PI) / 180, L = 3000;
        for (const s of [-1, 1]) { c.moveTo(X(ex), Y(ey)); c.lineTo(X(ex + Math.cos(a + s * f) * L), Y(ey + Math.sin(a + s * f) * L)); }
      }
      c.stroke();
      c.setLineDash([]);
      c.beginPath();
      c.arc(X(ex), Y(ey), 4, 0, Math.PI * 2);
      c.fill();
    }
  }

  if (o.layer === "zone") {
    c.strokeStyle = t.accent;
    c.lineWidth = 1.5;
    rings(place.outlines[o.mark].rings);
    c.stroke();
  }

  // What stays, on top; the one pointed at, heavier.
  const stays = place.brief.stays.filter((s) => s.rings);
  c.setLineDash([5, 3]);
  for (const s of stays) {
    c.strokeStyle = P.ink;
    c.lineWidth = s.id === o.stayOn ? 3 : 1.5;
    rings(s.rings!);
    c.stroke();
  }
  c.setLineDash([]);
  c.restore();

  c.font = `500 12px ${t.font.text}`;
  c.textAlign = "center";
  for (const s of stays) {
    const ring = s.rings![0][0];
    let sx = 0, sy = 0;
    for (let i = 0; i < ring.length; i += 2) { sx += ring[i]; sy += ring[i + 1]; }
    const label = s.words.replace(/^The /, "").replace(/ complex$/, ""), m = ring.length / 2;
    c.lineWidth = 3;
    c.strokeStyle = P.paper;
    c.strokeText(label, X(sx / m), Y(sy / m));
    c.fillStyle = P.ink;
    c.fillText(label, X(sx / m), Y(sy / m));
  }
}
