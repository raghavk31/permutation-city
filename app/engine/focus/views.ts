// Views as a measured limit (docs/architecture-v3.md section 15, F2): from an eye on the terrain, over
// the terrain and every building, how high can something stand in each cell before it spoils the view?
// Toward a monument, the limit is the sight line to its foot. Across a view, it is the skyline
// behind: nothing new rises above what is already there. Trees aren't counted, the terrain is
// satellite-derived, and an eye is one point, so these limits are rough; the note on each says so.
import type { Place, ViewDef } from "./place.js";

const PIXEL_M = 10;
const NEAR_EYE_M = 30;   // the ground and building an eye stands on don't block it
const HIGH_NEAR_M = 40;  // how far to look for the top of a plinth or tower an eye stands on

/** Ground and roofs on a 10 m raster. Water has no measured ground: it blocks nothing. */
export class Surface {
  readonly w: number; readonly h: number; readonly x0: number; readonly y0: number;
  readonly ground: Float32Array; readonly roof: Float32Array; readonly who: Int32Array;

  constructor(place: Place) {
    const [x0, y0, x1, y1] = place.meta.box;
    this.x0 = x0; this.y0 = y0;
    this.w = Math.ceil((x1 - x0) / PIXEL_M); this.h = Math.ceil((y1 - y0) / PIXEL_M);
    const size = this.w * this.h;
    this.ground = new Float32Array(size).fill(NaN);
    this.roof = new Float32Array(size).fill(NaN);
    this.who = new Int32Array(size).fill(-1);
    const best = new Float32Array(size).fill(Infinity);
    const { x, y, z } = place.cells, r = place.meta.grid.spacing;
    for (let i = 0; i < x.length; i++) {
      const px0 = Math.floor((x[i] - r - x0) / PIXEL_M), px1 = Math.ceil((x[i] + r - x0) / PIXEL_M);
      const py0 = Math.floor((y[i] - r - y0) / PIXEL_M), py1 = Math.ceil((y[i] + r - y0) / PIXEL_M);
      for (let v = Math.max(0, py0); v <= Math.min(this.h - 1, py1); v++) for (let u = Math.max(0, px0); u <= Math.min(this.w - 1, px1); u++) {
        const q = (x0 + (u + 0.5) * PIXEL_M - x[i]) ** 2 + (y0 + (v + 0.5) * PIXEL_M - y[i]) ** 2, k = v * this.w + u;
        if (q < best[k]) { best[k] = q; this.ground[k] = z[i] > 0 ? z[i] : NaN; }
      }
    }
    const { rings, h } = place.buildings;
    rings.forEach((ring, b) => {
      let lx = Infinity, hx = -Infinity, ly = Infinity, hy = -Infinity;
      for (let a = 0; a < ring.length; a += 2) { lx = Math.min(lx, ring[a]); hx = Math.max(hx, ring[a]); ly = Math.min(ly, ring[a + 1]); hy = Math.max(hy, ring[a + 1]); }
      const ux0 = Math.max(0, Math.floor((lx - x0) / PIXEL_M)), ux1 = Math.min(this.w - 1, Math.floor((hx - x0) / PIXEL_M));
      const vy0 = Math.max(0, Math.floor((ly - y0) / PIXEL_M)), vy1 = Math.min(this.h - 1, Math.floor((hy - y0) / PIXEL_M));
      for (let v = vy0; v <= vy1; v++) for (let u = ux0; u <= ux1; u++) {
        const px = x0 + (u + 0.5) * PIXEL_M, py = y0 + (v + 0.5) * PIXEL_M;
        let on = false;
        for (let a = 0, c = ring.length - 2; a < ring.length; c = a, a += 2) {
          if ((ring[a + 1] > py) !== (ring[c + 1] > py) && px < ((ring[c] - ring[a]) * (py - ring[a + 1])) / (ring[c + 1] - ring[a + 1]) + ring[a]) on = !on;
        }
        const k = v * this.w + u;
        if (on && Number.isFinite(this.ground[k]) && !(this.roof[k] >= this.ground[k] + h[b])) { this.roof[k] = this.ground[k] + h[b]; this.who[k] = b; }
      }
    });
  }

  private at(px: number, py: number): number {
    const u = Math.floor((px - this.x0) / PIXEL_M), v = Math.floor((py - this.y0) / PIXEL_M);
    return u < 0 || v < 0 || u >= this.w || v >= this.h ? -1 : v * this.w + u;
  }
  groundAt(px: number, py: number): number { const k = this.at(px, py); return k < 0 ? NaN : this.ground[k]; }
  /** The top of what's at a point: a roof, else the ground, else NaN over water. */
  topAt(px: number, py: number): number { const k = this.at(px, py); return k < 0 ? NaN : Number.isFinite(this.roof[k]) ? this.roof[k] : this.ground[k]; }
  whoAt(px: number, py: number): number { const k = this.at(px, py); return k < 0 ? -1 : this.who[k]; }
  /** The nearest measured ground to a point, for an eye or a target on or beside a building or water. */
  groundNear(px: number, py: number, within = 60): number {
    let best = NaN, bestD = Infinity;
    for (let dv = -within; dv <= within; dv += PIXEL_M) for (let du = -within; du <= within; du += PIXEL_M) {
      const z = this.groundAt(px + du, py + dv), d = du * du + dv * dv;
      if (Number.isFinite(z) && d < bestD) { best = z; bestD = d; }
    }
    return best;
  }
  /** The highest measured ground near a point: the top of a plinth or a tower as the terrain reads it. */
  groundHigh(px: number, py: number, within = HIGH_NEAR_M): number {
    let best = NaN;
    for (let dv = -within; dv <= within; dv += PIXEL_M) for (let du = -within; du <= within; du += PIXEL_M) {
      const z = this.groundAt(px + du, py + dv);
      if (Number.isFinite(z) && !(best >= z)) best = z;
    }
    return best;
  }
}

export interface Blocker { building: number; over: number; name?: string }

export interface ViewResult {
  def: ViewDef;
  eyeZ: number;
  /** Height of the sight line's end above sea level; null for a view with no target. */
  targetZ: number | null;
  /** Per cell, the most that can stand there, metres above ground; NaN where this view sets none. */
  limit: Float32Array;
  /** Per cell, 1 where its ground can be seen from the eye today. */
  seen: Uint8Array;
  /** Of the sight lines across the target's width, the share clear today. Null for a view with no target. */
  clear: number | null;
  /** What crosses the sight line today, tallest first. */
  blockers: Blocker[];
}

const RAYS = 11;

export function measureView(place: Place, def: ViewDef, s = new Surface(place)): ViewResult {
  const { x, y, z } = place.cells, n = x.length, half = place.meta.grid.spacing / 2;
  const [ex, ey] = def.eye, eyeGround = def.on_high ? s.groundHigh(ex, ey) : s.groundNear(ex, ey);
  if (!Number.isFinite(eyeGround)) throw new Error(`view ${def.id}: no ground near its eye`);
  const eyeZ = eyeGround + def.eye_m;
  const limit = new Float32Array(n).fill(NaN), seen = new Uint8Array(n);
  const [box0, box1, box2, box3] = place.meta.box;

  const t = def.target;
  const targetZ = t ? s.groundHigh(t.at[0], t.at[1], t.half_m) + t.foot_m : null;
  const toward = t ? t.at : def.looks!.at;
  const D = Math.hypot(toward[0] - ex, toward[1] - ey);
  const ux = (toward[0] - ex) / D, uy = (toward[1] - ey) / D;
  const cosFan = def.looks ? Math.cos((def.looks.fan_deg * Math.PI) / 180) : 0;

  for (let i = 0; i < n; i++) {
    const dx = x[i] - ex, dy = y[i] - ey, d = Math.hypot(dx, dy);
    if (d < NEAR_EYE_M || z[i] <= 0) continue;
    const vx = dx / d, vy = dy / d;
    // Seen: nothing on the way rises above the line to this cell's ground.
    const tanHere = (z[i] - eyeZ) / d;
    let clear = true;
    for (let a = NEAR_EYE_M; a < d - PIXEL_M; a += PIXEL_M) {
      const top = s.topAt(ex + vx * a, ey + vy * a);
      if (top > eyeZ + tanHere * a) { clear = false; break; }
    }
    if (clear) seen[i] = 1;

    if (t) {
      const along = dx * ux + dy * uy, across = Math.abs(dx * uy - dy * ux);
      if (along <= 0 || along >= D - t.half_m || across > (t.half_m * along) / D + half) continue;
      limit[i] = Math.max(0, eyeZ + ((targetZ! - eyeZ) * along) / D - z[i]);
    } else {
      if (vx * ux + vy * uy < cosFan) continue;
      // The skyline behind: the highest thing past this cell, as seen from the eye.
      let tan = -Infinity;
      for (let a = d + PIXEL_M; ; a += PIXEL_M) {
        const px = ex + vx * a, py = ey + vy * a;
        if (px < box0 || px > box2 || py < box1 || py > box3) break;
        const top = s.topAt(px, py);
        if (Number.isFinite(top)) tan = Math.max(tan, (top - eyeZ) / a);
      }
      limit[i] = Math.max(0, eyeZ + (tan === -Infinity ? tanHere : tan) * d - z[i]);
    }
  }

  let clear: number | null = null;
  const over = new Map<number, number>();
  if (t) {
    let good = 0;
    for (let r = 0; r < RAYS; r++) {
      const off = t.half_m * ((2 * r) / (RAYS - 1) - 1);
      const tx = t.at[0] + uy * off, ty = t.at[1] - ux * off;
      const L = Math.hypot(tx - ex, ty - ey), wx = (tx - ex) / L, wy = (ty - ey) / L;
      let ok = true;
      for (let a = NEAR_EYE_M; a < L - t.half_m; a += PIXEL_M) {
        const px = ex + wx * a, py = ey + wy * a, top = s.topAt(px, py), line = eyeZ + ((targetZ! - eyeZ) * a) / L;
        const b = s.whoAt(px, py);
        if (b >= 0 && place.buildings.names[b] === t.name) break;   // reached what it looks at
        if (top > line) {
          ok = false;
          if (b >= 0) over.set(b, Math.max(over.get(b) ?? 0, top - line));
        }
      }
      if (ok) good++;
    }
    clear = good / RAYS;
  }
  const blockers = [...over].sort((a, b) => b[1] - a[1]).map(([building, h]) => ({
    building, over: Math.round(h * 10) / 10, ...(place.buildings.names[building] ? { name: place.buildings.names[building] } : {}),
  }));
  return { def, eyeZ, targetZ, limit, seen, clear, blockers };
}

/** All of a brief's views, and per cell the tightest limit of any of them. */
export interface Views { results: ViewResult[]; limit: Float32Array }

const memo = new WeakMap<Place, Views>();

export function viewsOf(place: Place): Views {
  const had = memo.get(place);
  if (had) return had;
  const s = new Surface(place);
  const results = (place.brief.views ?? []).map((v) => measureView(place, v, s));
  const limit = new Float32Array(place.cells.x.length).fill(NaN);
  for (const r of results) for (let i = 0; i < limit.length; i++) {
    if (Number.isFinite(r.limit[i]) && !(limit[i] <= r.limit[i])) limit[i] = r.limit[i];
  }
  const out = { results, limit };
  memo.set(place, out);
  return out;
}
