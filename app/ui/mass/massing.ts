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
    const col: (string | null)[] = Array.from({ length: src.G.n }, () => null);
    for (const i of cells) col[i] = P.ink;
    ctx.save(); ctx.globalAlpha = 0.85;
    Draw.cells(ctx, v, Array.from(src.G.x), Array.from(src.G.y), col, shape, 0.7);
    ctx.restore();
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
  const paper = rgb(P.paper), street = rgb(Draw.shade(P.paper, 0.8)), green = rgb(Draw.shade(P.green, 1.35)),
    water = rgb(P.water), plot = rgb(Draw.shade(P.oranges[0], 1.02)), setback = rgb(Draw.shade(P.oranges[0], 1.1)),
    built = rgb(Draw.shade(P.paper, 0.9));
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
    ctx.fillStyle = top ? Draw.ramp(P.oranges, top / Math.max(1, Env.nz)) : P.retained;
    ctx.fillRect(ox + (c - c0) * s, oy + (r1 - r) * s, Math.ceil(s), Math.ceil(s));
  }
}

export function look(P: Draw.Palette) {
  return { mass: P.oranges[1], context: Draw.shade(P.paper, 0.82), existing: Draw.shade(P.paper, 0.68), ground: P.paper, ink: P.ink,
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
  if (!B || !Env.neighbours.length) return "No existing buildings near this block are mapped.";
  const counts = new Map<string, number>();
  for (const k of Env.neighbours) counts.set(sourceOf(G, k), (counts.get(sourceOf(G, k)) ?? 0) + 1);
  const parts = B.sources.filter((s) => counts.get(s)).map((s) => `${counts.get(s)} ${HEIGHT_FROM[s] ?? s}`);
  return `${Env.neighbours.length} existing buildings stand round this block (darker grey), casting shade and receiving it. Heights: ${parts.join(", ")}.`;
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
