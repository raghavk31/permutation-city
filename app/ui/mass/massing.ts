// The massing chapter's logic (the component is Massing.svelte): what a design hands over,
// how a confirmed brief sets the envelope and the priors, the block picker's plan, the ground
// under the 3D view, and the worker that breeds buildings.
import * as Comlink from "comlink";
import * as E from "../../engine";
import * as M from "../../engine/massing";
import type { MassResult, MassWorker } from "../../engine/massing/worker";
import * as Draw from "../draw";

/** A design picked for massing, with what it was grown under. */
export interface Source {
  siteId: string; site: E.SiteExport; G: E.Ground; skeletonOff: number[];
  name: string; genome: number[]; locks: number[] | null; ranges: E.Ranges; brief: E.Brief | null;
  fabric?: E.Fabric | null;   // a piecemeal design: what its last increment grew around
}

export const PATTERNS_FOR_WINGS = [107, 159];

/** Setbacks from the confirmed brief, or the defaults; and where they came from. */
export function setbacksOf(brief: E.Brief | null): { value: M.Setbacks; from: string } {
  const s = brief?.setbacks_m;
  if (s) return { value: { ...s.value }, from: s.sources.length ? `the brief (${s.sources.join(", ")})` : "the brief (assumed)" };
  return { value: { ...M.DEFAULT_SETBACKS }, from: "defaults (assumed)" };
}

/** The brief's typology priors as weights in typology.TYPES order (null: none). */
export function typeWeights(brief: E.Brief | null): number[] | null {
  const pri = brief?.typology_priors?.value;
  if (!pri?.length) return null;
  return E.TYPOLOGIES.map((t) => pri.find((p) => p.type === t)?.weight ?? 0);
}

export const narrowWings = (brief: E.Brief | null) => !!brief?.patterns.some((p) => PATTERNS_FOR_WINGS.includes(p.id));

export function setupOf(src: Source, block: number, setbacks: M.Setbacks, heights: Record<number, number> | null = null): M.MassSetup {
  return {
    genome: src.genome, locks: src.locks, ranges: src.ranges, block, setbacks,
    narrowWings: narrowWings(src.brief), typeWeights: typeWeights(src.brief), heights, fabric: src.fabric ?? null,
  };
}

/** The design grown as the worker grows it. */
export const designOf = (src: Source) => src.fabric ? E.growLast(src.genome, src.G, src.fabric, src.ranges)
  : E.grow(src.genome, src.G, src.locks ? Int8Array.from(src.locks) : null, src.ranges);

/** The design in plan with its blocks: the chosen one in ink, the rest pale. Returns the view
 *  and, per design cell, its block (-1: none), for picking. */
export function drawBlocks(canvas: HTMLCanvasElement, src: Source, d: E.Design, chosen: number, P: Draw.Palette) {
  const net = E.network(d, src.G);
  const roads = d.street && d.streetWidths ? { lines: E.centrelines(src.G, d.street), widths: d.streetWidths } : null;
  const v = Draw.plan(canvas, src.site, d, P, { aspect: aspect(src.site), roads });
  const ctx = canvas.getContext("2d")!, { corners: shape } = Draw.shapeOf(src.site);
  if (chosen >= 0) {
    const cells = net.blocks[chosen] ?? [];
    // The chosen block is the selection: the accent, as an outline over a light wash.
    const col: (string | null)[] = Array.from({ length: src.G.n }, () => null);
    for (const i of cells) col[i] = "chosen";
    Draw.fillRegions(ctx, v, src.site.design.x, src.site.design.y, col, shape,
      { chosen: { fill: false, edge: P.t.accent, width: 2.5 } });
  }
  return { v, block: net.block };
}

export const aspect = (site: E.SiteExport) => Math.min(Draw.aspectOf(site.design.x, site.design.y), 1.1);

/** The ground under the 3D view: one pixel per raster column. */
export function groundCanvas(Env: M.Envelope, G: E.Ground, d: E.Design, P: Draw.Palette): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = Env.nx; c.height = Env.ny;
  const ctx = c.getContext("2d")!, img = ctx.createImageData(Env.nx, Env.ny);
  const rgb = (s: string) => {
    const m = s.match(/\d+/g);
    if (s.startsWith("rgb") && m) return m.slice(0, 3).map(Number);
    const n = parseInt(s.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const t = P.t, paper = rgb(P.paper), street = rgb(t.street.onGround), green = rgb(t.green.proposed),
    water = rgb(t.water.storage), plot = rgb(t.building[0]), setback = rgb(t.paper2),
    built = rgb(t.existing.fill);
  // The site's water cells (lakes, rivers; mostly off the design ground), stamped as discs.
  const wet = new Uint8Array(Env.nx * Env.ny), R = G.grid.size, k0 = Math.ceil(R / Env.res);
  for (const [x, y] of G.water ?? []) {
    const c0 = Math.floor((x - Env.ox) / Env.res), r0 = Math.floor((y - Env.oy) / Env.res);
    for (let r = r0 - k0; r <= r0 + k0; r++) for (let c = c0 - k0; c <= c0 + k0; c++) {
      if (r < 0 || c < 0 || r >= Env.ny || c >= Env.nx) continue;
      if (Math.hypot(Env.ox + (c + 0.5) * Env.res - x, Env.oy + (r + 0.5) * Env.res - y) <= R) wet[r * Env.nx + c] = 1;
    }
  }
  for (let r = 0; r < Env.ny; r++) for (let col = 0; col < Env.nx; col++) {
    const q = r * Env.nx + col, i = Env.cellOf[q], u = i >= 0 ? d.use[i] : -1;
    const c3 = Env.street[q] ? street : Env.plotOf[q] >= 0 ? plot : Env.inPlot[q] >= 0 ? setback
      : u === E.WATER || (i < 0 && wet[q]) ? water : u === E.LANDSCAPE ? green : u === E.BUILDING ? built : paper;
    const k = ((Env.ny - 1 - r) * Env.nx + col) * 4;  // canvas rows run down; the frame's rows run north
    img.data[k] = c3[0]; img.data[k + 1] = c3[1]; img.data[k + 2] = c3[2]; img.data[k + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** The ground under the 3D view for a version 3 design, drawn from its vector plan at about
 *  3 px a metre: the column ground (groundCanvas) smoothed underneath, then the design's plots
 *  (this block's in the plot colour) and the streets on top. */
export function vectorGround(Env: M.Envelope, G: E.Ground, d: E.Design, P: Draw.Palette): HTMLCanvasElement {
  const base = groundCanvas(Env, G, d, P), plan = d.plan!;
  const W = Env.nx * Env.res, H = Env.ny * Env.res, k = Math.min(3, 4096 / Math.max(W, H));
  const c = document.createElement("canvas");
  c.width = Math.round(W * k); c.height = Math.round(H * k);
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(base, 0, 0, c.width, c.height);
  const X = (x: number) => (x - Env.ox) * k, Y = (y: number) => (Env.oy + H - y) * k;
  const path = (r: [number, number][]) => { ctx.beginPath(); r.forEach(([x, y], j) => (j ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y)))); ctx.closePath(); };
  const t = P.t;
  for (const p of plan.plots) {
    if (p.block === Env.block && p.use === E.BUILDING && p.levels > 0) continue;
    path(p.ring);
    ctx.fillStyle = p.use === E.BUILDING ? t.existing.fill : p.use === E.LANDSCAPE ? t.green.proposed : p.use === E.WATER ? t.water.storage : P.paper;
    ctx.fill();
  }
  for (const p of plan.plots) if (p.block === Env.block && p.use === E.BUILDING && p.levels > 0) { path(p.ring); ctx.fillStyle = t.building[0]; ctx.fill(); }
  // streets as their cross-sections (IRC:SP:118 templates: engine/config.ts sectionFor): each
  // part a band at its offset, trees marked along the planted strips
  const LOOK: Record<string, string> = { footpath: t.street.onDesign, planted: t.green.proposed, carriageway: t.street.primary, shared: t.street.onGround };
  ctx.lineCap = "butt"; ctx.lineJoin = "round";
  const trees: [number, number][] = [];
  for (const s of plan.streets) {
    let at = s.w / 2;
    for (const part of E.sectionFor(s.w).parts) {
      const mid = at - part.w / 2, line = offsetLine(s.pts, mid);
      ctx.strokeStyle = LOOK[part.kind]; ctx.lineWidth = part.w * k + 0.5;
      ctx.beginPath(); line.forEach(([x, y], j) => (j ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y)))); ctx.stroke();
      if (part.kind === "planted" && part.w >= 1.5) trees.push(...every(line, 15));
      at -= part.w;
    }
  }
  ctx.fillStyle = t.green.existing; ctx.globalAlpha = 0.45;
  for (const [x, y] of trees) { ctx.beginPath(); ctx.arc(X(x), Y(y), 2 * k, 0, 2 * Math.PI); ctx.fill(); }
  ctx.globalAlpha = 1;
  return c;
}

/** A polyline moved `o` metres to its left (negative: right). */
function offsetLine(pts: [number, number][], o: number): [number, number][] {
  return pts.map(([x, y], k) => {
    const [px, py] = pts[Math.max(0, k - 1)], [qx, qy] = pts[Math.min(pts.length - 1, k + 1)];
    const l = Math.hypot(qx - px, qy - py) || 1;
    return [x - ((qy - py) / l) * o, y + ((qx - px) / l) * o];
  });
}

/** Points every `step` metres along a polyline, starting half a step in. */
function every(pts: [number, number][], step: number): [number, number][] {
  const out: [number, number][] = [];
  let run = step / 2;
  for (let k = 1; k < pts.length; k++) {
    const [x0, y0] = pts[k - 1], [x1, y1] = pts[k], L = Math.hypot(x1 - x0, y1 - y0);
    if (!L) continue;
    for (; run < L; run += step) out.push([x0 + ((x1 - x0) / L) * run, y0 + ((y1 - y0) / L) * run]);
    run -= L;
  }
  return out;
}

/** A small plan of a massing's heights, for the gallery. */
export function thumb(canvas: HTMLCanvasElement, Env: M.Envelope, m: M.Massing, P: Draw.Palette) {
  const { ctx, w, h } = Draw.fitCanvas(canvas, 1);
  ctx.fillStyle = P.paper; ctx.fillRect(0, 0, w, h);
  let c0 = Env.nx, c1 = 0, r0 = Env.ny, r1 = 0;
  for (let q = 0; q < Env.nx * Env.ny; q++) if (Env.inPlot[q] >= 0) {
    const c = q % Env.nx, r = Math.floor(q / Env.nx);
    c0 = Math.min(c0, c); c1 = Math.max(c1, c); r0 = Math.min(r0, r); r1 = Math.max(r1, r);
  }
  const s = Math.min(w / (c1 - c0 + 3), h / (r1 - r0 + 3)), ox = (w - (c1 - c0 + 1) * s) / 2, oy = (h - (r1 - r0 + 1) * s) / 2;
  const N = Env.nx * Env.ny;
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
    const q = r * Env.nx + c;
    if (Env.inPlot[q] < 0) continue;
    let top = 0;
    for (let z = Env.nz - 1; z >= 0; z--) if (m.occ[z * N + q]) { top = z + 1; break; }
    ctx.fillStyle = top ? Draw.step(P.t.building, top / Math.max(1, Env.nz)) : P.t.paper2;
    ctx.fillRect(ox + (c - c0) * s, oy + (r1 - r) * s, Math.ceil(s), Math.ceil(s));
  }
}

export function look(P: Draw.Palette) {
  // The massing in the building ramp's mid tone, the design's other buildings in its lightest
  // (warm sand: the same design, quieter), the existing city in grey (a different hue, so the
  // two never read as one).
  return { mass: P.t.building[2], context: P.t.building[0], existing: P.t.existingRamp[3], ground: P.paper, ink: P.ink,
    background: P.paper };
}

/** "UTC+5:30" for a UTC offset in hours. */
export function utcLabel(h: number): string {
  const sign = h < 0 ? "−" : "+", a = Math.abs(h), m = Math.round((a % 1) * 60);
  return `UTC${sign}${Math.floor(a)}${m ? `:${String(m).padStart(2, "0")}` : ""}`;
}

/** Where an existing building's height came from, in words (pc/export.py HEIGHT_SOURCES). */
export const HEIGHT_FROM: Record<string, string> = {
  height: "Overture's height", floors: "floor count", open_buildings: "Google Open Buildings (satellite)",
  nearby: "median of known buildings within 300 m", default: "assumed 2 storeys", user: "set by you",
};
/** Sources that guess a building's height from others, not from the building itself. */
export const GUESSED_FROM = ["nearby", "default"];
/** The scores that read existing buildings' heights. */
export const HEIGHT_SCORES: M.MassScoreKey[] = ["shade", "neighbours"];

export const sourceOf = (G: E.Ground, k: number) => G.buildings!.sources[G.buildings!.src[k]];

/** The existing buildings in an envelope's frame, by where their heights came from. */
export function neighbourLine(Env: M.Envelope, G: E.Ground): string {
  const B = G.buildings;
  // COPY: existing buildings round the block
  if (!B || !Env.neighbours.length) return `No existing buildings stand within ${Math.round(M.MARGIN_M)} m of this block; the buildings round it are the design's own.`;
  const counts = new Map<string, number>();
  for (const k of Env.neighbours) counts.set(sourceOf(G, k), (counts.get(sourceOf(G, k)) ?? 0) + 1);
  const parts = B.sources.filter((s) => counts.get(s)).map((s) => `${counts.get(s)} ${HEIGHT_FROM[s] ?? s}`);
  return `${Env.neighbours.length} existing buildings stand round this block (grey, hatched where the height is estimated), casting shade and receiving it. Heights: ${parts.join(", ")}.`;
}

/** The existing buildings in the frame whose heights are estimated (drawn hatched). */
export function guessedOf(Env: M.Envelope, G: E.Ground): Set<number> {
  return new Set(G.buildings ? Env.neighbours.filter((k) => GUESSED_FROM.includes(sourceOf(G, k))) : []);
}

/** Low confidence: most of the block's existing neighbours have guessed heights, so the
 *  scores that read them (shade, sun taken from neighbours) rest on guesses. */
export function heightsLow(Env: M.Envelope, G: E.Ground): boolean {
  if (!G.buildings || !Env.neighbours.length) return false;
  const guessed = Env.neighbours.filter((k) => GUESSED_FROM.includes(sourceOf(G, k))).length;
  return guessed * 2 > Env.neighbours.length;
}

/** A footprint's area (m²) from its flat ring. */
export function ringArea(r: number[]): number {
  let a = 0;
  for (let j = 0; j < r.length; j += 2) { const k = (j + 2) % r.length; a += r[j] * r[k + 1] - r[k] * r[j + 1]; }
  return Math.abs(a) / 2;
}

/** The worker that breeds buildings: started on first use, restarted to cancel. */
export class Breeder {
  private raw: Worker | null = null;
  private api: Comlink.Remote<MassWorker> | null = null;
  private siteKey = "";

  private start() {
    this.raw = new Worker(new URL("../../engine/massing/worker.ts", import.meta.url), { type: "module" });
    this.api = Comlink.wrap<MassWorker>(this.raw);
    this.siteKey = "";
  }

  async run(src: Source, req: M.MassRequest, onGen: (gen: number) => void): Promise<MassResult> {
    if (!this.api) this.start();
    const key = `${src.siteId}|${src.skeletonOff.join(",")}`;
    if (key !== this.siteKey) { await this.api!.setSite(src.site, src.skeletonOff); this.siteKey = key; }
    return this.api!.evolve(req, Comlink.proxy((gen: number) => onGen(gen)));
  }

  cancel() { this.raw?.terminate(); this.raw = null; this.api = null; }
}
