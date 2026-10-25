// Moves a designer draws on the map before a run (final stretch brief, section 2): a green
// spine, a main street, a plaza or square, a no-build zone, and an existing building kept.
// Evolution explores everything else and keeps every move: drawn streets join the street
// skeleton before the routes are laid (plan/ground.ts skeletonLines), and areas override the
// rules on the cells they cover (`can` and a forced use per design cell; genome.ts claimUses).
// A move that fights the rules (a plaza on ground the rules never build on) is a conflict,
// and a run waits until it is resolved.
import { BUILDING, LANDSCAPE } from "./config.js";
import { area, centroid, inside, length, toSegment, type Line, type Pt } from "./plan/geom.js";
import { FORBIDDEN, RETAINED } from "./rules.js";
import type { SiteExport } from "./types.js";

export type MoveKind = "spine" | "street" | "plaza" | "nobuild" | "keep";

export interface Move {
  id: number;
  kind: MoveKind;
  /** A line (spine, street) or a ring (plaza, no-build, a kept building's footprint), in the
   *  site's metres. */
  pts: Line;
  /** spine: metres across */
  width?: number;
  /** street: 3 a primary street, 2 a secondary one */
  cls?: 2 | 3;
  /** keep: the building's index in context.buildings.ground */
  building?: number;
}

// COPY: the moves' names
export const MOVE_NAMES: Record<MoveKind, string> = {
  spine: "Green spine", street: "Main street", plaza: "Plaza or square", nobuild: "No-build zone", keep: "Keep building",
};
export const SPINE_WIDTH_M = { min: 10, max: 80, default: 30 };
/** A street may cross ground the rules never build on for this far (a bridge, a culvert),
 *  in cells: two cells is a short crossing of a stream or a drain. */
const CROSSING_CELLS = 2;
const MIN_STREET_M = 20;

/** What the engine takes from the moves, carried on the site to the workers. */
export interface SiteMoves {
  /** per design cell: 0 free, -1 kept from any use (a plaza, a kept building), else a use code */
  forced: number[];
  streets: { pts: Line; cls: number }[];
  /** kept buildings: indexes into context.buildings.ground */
  kept: number[];
}

export interface Conflict { move: number; text: string }

export interface Moved {
  site: SiteExport;
  conflicts: Conflict[];
  /** per move, the design cells it covers (streets: none) */
  cells: Map<number, number[]>;
}

/** Grid cells (indexes into xs, ys) an area move covers: centres inside the ring, or, for a
 *  ring smaller than a cell, the cell nearest its middle. Lines: centres within `half` of it. */
function covered(m: Move, xs: ArrayLike<number>, ys: ArrayLike<number>, spacing: number): number[] {
  const out: number[] = [];
  if (m.kind === "spine") {
    const half = Math.max((m.width ?? SPINE_WIDTH_M.default) / 2, spacing / 2);
    for (let i = 0; i < xs.length; i++) {
      const p: Pt = [xs[i], ys[i]];
      for (let k = 1; k < m.pts.length; k++) if (toSegment(p, m.pts[k - 1], m.pts[k]).d <= half) { out.push(i); break; }
    }
    return out;
  }
  if (m.kind === "street") return out;
  for (let i = 0; i < xs.length; i++) if (inside(m.pts, [xs[i], ys[i]])) out.push(i);
  if (!out.length && m.pts.length >= 3) {
    const [cx, cy] = centroid(m.pts);
    let best = -1, bd = spacing * spacing;
    for (let i = 0; i < xs.length; i++) {
      const d = (xs[i] - cx) ** 2 + (ys[i] - cy) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    if (best >= 0) out.push(best);
  }
  return out;
}

/** The commonest reason among some cells, for a conflict's sentence ("steep hillside"): of
 *  the rules that never build (`never`), when given; a cell lists every rule it matches. */
function reasonOf(cells: number[], reasons: ArrayLike<string>, never: ReadonlySet<string> | null): string {
  const count = new Map<string, number>();
  for (const c of cells) for (const r of String(reasons[c] ?? "").split(/;\s*/).filter(Boolean)) {
    if (!never || never.has(r)) count.set(r, (count.get(r) ?? 0) + 1);
  }
  return [...count].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
}

const ha = (cells: number, cellArea: number) => {
  const v = (cells * cellArea) / 1e4;
  return v < 0.1 ? `${Math.round(cells * cellArea).toLocaleString("en-IN")} m²` : `${v.toFixed(1)} ha`;
};

/**
 * The site with the moves applied, on top of its rules. `state` and `reasons` are the rules'
 * result over the whole grid (site.grid's cells); the site's design ground is the one those
 * rules made. `never`: the names of the rules that never build, to say why in a conflict.
 * Later moves win where moves overlap.
 */
export function applyMoves(site: SiteExport, moves: Move[], state: ArrayLike<number>, reasons: ArrayLike<string>,
  never: ReadonlySet<string> | null = null): Moved {
  const conflicts: Conflict[] = [], cells = new Map<number, number[]>();
  if (!moves.length) return { site, conflicts, cells };
  const gx = site.grid.x, gy = site.grid.y, D = site.design, n = D.x.length;
  const spacing = Math.sqrt(site.meta.cell_area);
  const cellArea = site.meta.cell_area;
  // design cell of each grid cell, by position (the design ground's cells are grid cells)
  const key = (x: number, y: number) => `${Math.round(x * 10)},${Math.round(y * 10)}`;
  const designAt = new Map<string, number>();
  for (let k = 0; k < n; k++) designAt.set(key(D.x[k], D.y[k]), k);

  const can = D.can.slice(), forced = new Array<number>(n).fill(0);
  const streets: SiteMoves["streets"] = [], kept: number[] = [];
  // COPY: conflict sentences
  for (const m of moves) {
    const name = MOVE_NAMES[m.kind];
    if (m.kind === "street") {
      if (m.pts.length < 2 || length(m.pts) < MIN_STREET_M) { conflicts.push({ move: m.id, text: `${name} is too short to be a street.` }); continue; }
      // walk the line a third of a cell at a time; a run of never-built cells longer than a
      // crossing, or a stretch off the grid, is a conflict
      const step = spacing / 3, run: number[] = [], bad: number[] = [];
      let off = 0, longest = 0;
      const flush = () => { if (run.length > longest) longest = run.length; if (run.length > CROSSING_CELLS) bad.push(...run); run.length = 0; };
      for (let k = 1; k < m.pts.length; k++) {
        const [a, b] = [m.pts[k - 1], m.pts[k]], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        for (let t = 0; t <= L; t += step) {
          const p: Pt = [a[0] + ((b[0] - a[0]) * t) / L, a[1] + ((b[1] - a[1]) * t) / L];
          const c = nearestCell(gx, gy, p, spacing);
          if (c < 0) { off++; flush(); continue; }
          if (state[c] === FORBIDDEN || state[c] === RETAINED) { if (run[run.length - 1] !== c) run.push(c); }
          else flush();
        }
      }
      flush();
      if (off * step > spacing) conflicts.push({ move: m.id, text: `${name} runs off the site.` });
      if (bad.length) {
        const why = reasonOf(bad, reasons, never);
        conflicts.push({ move: m.id, text: `${name} runs ${Math.round(longest * spacing)} m over ground the rules never build on${why ? ` (${why})` : ""}; a crossing may be ${CROSSING_CELLS * Math.round(spacing)} m.` });
      }
      streets.push({ pts: m.pts, cls: m.cls ?? 3 });
      continue;
    }
    const grid = covered(m, gx, gy, spacing);
    if (!grid.length) { conflicts.push({ move: m.id, text: `${name} doesn't cover any of the site.` }); cells.set(m.id, []); continue; }
    const neverCells = grid.filter((c) => state[c] === FORBIDDEN), outside = grid.filter((c) => state[c] === RETAINED);
    // a green spine and a no-build zone build nothing, so never-built ground under them is no conflict
    if (m.kind === "plaza" || m.kind === "keep") {
      if (neverCells.length) {
        const why = reasonOf(neverCells, reasons, never);
        conflicts.push({ move: m.id, text: `${name} is on ground the rules never build on: ${ha(neverCells.length, cellArea)}${why ? `, ${why}` : ""}.` });
      }
      if (outside.length) conflicts.push({ move: m.id, text: `${name} is outside the ground the design can change: ${ha(outside.length, cellArea)}.` });
    }
    const mine: number[] = [];
    for (const c of grid) {
      const k = designAt.get(key(gx[c], gy[c]));
      if (k === undefined) continue;
      mine.push(k);
      if (m.kind === "spine") { can[k] = 2; forced[k] = LANDSCAPE; }
      else if (m.kind === "plaza" || m.kind === "keep") { can[k] = 0; forced[k] = -1; }
      else if (m.kind === "nobuild") { can[k] = can[k] & ~1 || 2; if (forced[k] === BUILDING) forced[k] = 0; }
    }
    cells.set(m.id, mine);
    if (m.kind === "keep" && m.building !== undefined) kept.push(m.building);
  }
  const moved: SiteMoves = { forced, streets, kept };
  return { site: { ...site, design: { ...D, can }, moves: moved }, conflicts, cells };
}

/** The grid cell a point is in (the nearest centre within a cell's reach), or -1. */
function nearestCell(xs: ArrayLike<number>, ys: ArrayLike<number>, [x, y]: Pt, spacing: number): number {
  let best = -1, bd = (spacing * 0.75) ** 2;
  for (let i = 0; i < xs.length; i++) {
    const d = (xs[i] - x) ** 2 + (ys[i] - y) ** 2;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

/** A ring's area in m² (for the list of moves). */
export const moveArea = (m: Move) => (m.kind === "street" || m.kind === "spine" ? 0 : Math.abs(area(m.pts)));
