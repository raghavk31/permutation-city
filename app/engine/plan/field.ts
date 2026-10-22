// Local streets from a tensor field (Chen, Esch, Wonka, Müller and Zhang 2008, "Interactive
// procedural street modeling"; docs/streets.md; architecture-v3 5.2).
//
//   field       at every point a major street direction (an angle mod 180°), the weighted sum
//               of basis fields as 2θ vectors: the family's own field, contours and ridges
//               (f_landform), the coast, water edges, existing roads and the design's routes
//               (f_edges), and the prevailing wind (f_wind). Each line source pulls the field
//               along itself, fading with distance.
//   streets     streamlines of the major direction, spaced two plot depths and a street apart
//               (plots back to back), and of the minor direction (at right angles), spaced at
//               the block length (local_spacing). A streamline stops on meeting a street, which
//               makes a T junction, or on leaving the ground streets may use.
//   organic     no field: the edges of Voronoi cells round jittered seed points.
import { BUILDING, FAMILIES, HILL_LOCAL_SPACING, LANDSCAPE, RANGES_V3, type Family } from "../config.js";
import type { Design, Ground } from "../types.js";
import { dayOfYear, solarHour, sunAt } from "../massing/sun.js";
import { dist, fillet, length, resample, SegIndex, simplify, smoothTrace, type Line, type Pt } from "./geom.js";
import { locator, outline, skeletonLines, thinAndTrace } from "./ground.js";
import { makeRng } from "../rng.js";
import { planTimes } from "./grow.js";
const tk = (name: string, t0: number) => { if (planTimes.on) planTimes.t[name] = (planTimes.t[name] ?? 0) + performance.now() - t0; return performance.now(); };

export const FIELD = {
  STEP_M: 8,            // streamline step
  DECAY_M: 120,         // a line source's pull halves at about this distance
  MAX_LEN_M: 1500,
  MIN_LEN_M: 30,        // shorter streamlines are dropped
  SNAP_M: 4,            // a streamline this close to a street meets it
  SMOOTH_M: 12,         // Gaussian smoothing of a streamline along its length (smoothTrace): the tracer's wobble
  CORNER_R_M: 15,       // an organic street's corners become arcs of this radius (the local street's least)
  TEST: 0.5,            // stop when a parallel street of the same family is this share of the spacing away
};

export interface FieldGenes { f_landform: number; f_edges: number; f_wind: number; local_spacing: number; plot_depth: number; pattern: number }

export const familyOf = (pattern: number): Family => FAMILIES[Math.min(Math.floor(pattern * FAMILIES.length), FAMILIES.length - 1)];

interface Source { lines: Line[]; w: number }

/** Per site: contour direction per cell (NaN on flat land) and the water edges as lines. */
interface SiteField { contour: Float64Array; water: Line[]; flat: boolean }
const sfCache = new WeakMap<Ground, SiteField>();
function siteField(G: Ground): SiteField {
  const hit = sfCache.get(G);
  if (hit) return hit;
  const flat = (G.meta.landform?.relief.class ?? "flat") === "flat";
  const contour = new Float64Array(G.n).fill(NaN);
  if (G.z && !flat) {
    for (let i = 0; i < G.n; i++) {
      // Least-squares gradient over the neighbours; contours run across it.
      let sxx = 0, sxy = 0, syy = 0, sxz = 0, syz = 0;
      for (let k = 0; k < G.deg; k++) {
        const j = G.nbr[i * G.deg + k];
        if (j < 0) continue;
        const dx = G.x[j] - G.x[i], dy = G.y[j] - G.y[i], dz = G.z[j] - G.z[i];
        sxx += dx * dx; sxy += dx * dy; syy += dy * dy; sxz += dx * dz; syz += dy * dz;
      }
      const det = sxx * syy - sxy * sxy;
      if (Math.abs(det) < 1e-9) continue;
      const gx = (sxz * syy - syz * sxy) / det, gy = (syz * sxx - sxz * sxy) / det;
      if (Math.hypot(gx, gy) < 0.002) continue; // flatter than 0.2%: no contour to follow
      contour[i] = Math.atan2(gy, gx) + Math.PI / 2;
    }
  }
  // Water edges: the design ground's outline where it meets water is close enough (the ground
  // stops at the water's edge and its forbidden buffer).
  const water = outline(G).map((r) => [...r, r[0]]);
  const sf = { contour, water, flat };
  sfCache.set(G, sf);
  return sf;
}

// --- the field as a raster ------------------------------------------------------------------

interface Frame { x0: number; y0: number; res: number; W: number; H: number }
const RES_M = 40;  // the field varies over ~DECAY_M, so 40 m pixels hold it
const frameCache = new WeakMap<Ground, Frame>();
function rasterFrame(G: Ground): Frame {
  const hit = frameCache.get(G);
  if (hit) return hit;
  const [x0, y0, x1, y1] = G.bounds, pad = 2 * FIELD.DECAY_M;
  const f = { x0: x0 - pad, y0: y0 - pad, res: RES_M, W: Math.ceil((x1 - x0 + 2 * pad) / RES_M), H: Math.ceil((y1 - y0 + 2 * pad) / RES_M) };
  frameCache.set(G, f);
  return f;
}

/** Lines painted as length-weighted 2θ vectors and blurred (a separable Gaussian of
 *  DECAY_M/√2, so the weight falls as exp(-d²/DECAY_M²) as in Chen et al.'s decay). */
function blurred(R: Frame, groups: Line[][]): [Float64Array, Float64Array] {
  const c = new Float64Array(R.W * R.H), s = new Float64Array(R.W * R.H);
  for (const lines of groups) for (const l of lines) for (let k = 1; k < l.length; k++) {
    const a = l[k - 1], b = l[k], len = dist(a, b);
    if (len < 1e-9) continue;
    const th = Math.atan2(b[1] - a[1], b[0] - a[0]), steps = Math.max(1, Math.ceil(len / R.res));
    for (let t = 0; t < steps; t++) {
      const u = (t + 0.5) / steps, x = a[0] + u * (b[0] - a[0]), y = a[1] + u * (b[1] - a[1]);
      const i = Math.floor((x - R.x0) / R.res), j = Math.floor((y - R.y0) / R.res);
      if (i < 0 || j < 0 || i >= R.W || j >= R.H) continue;
      const w = len / steps / 30;
      c[j * R.W + i] += w * Math.cos(2 * th); s[j * R.W + i] += w * Math.sin(2 * th);
    }
  }
  const sigma = FIELD.DECAY_M / Math.SQRT2 / R.res, rad = Math.ceil(3 * sigma), ker: number[] = [];
  for (let k = -rad; k <= rad; k++) ker.push(Math.exp(-(k * k) / (2 * sigma * sigma)));
  const pass = (src: Float64Array, horiz: boolean) => {
    const out = new Float64Array(src.length);
    for (let j = 0; j < R.H; j++) for (let i = 0; i < R.W; i++) {
      let v = 0;
      for (let k = -rad; k <= rad; k++) {
        const ii = horiz ? i + k : i, jj = horiz ? j : j + k;
        if (ii < 0 || jj < 0 || ii >= R.W || jj >= R.H) continue;
        v += src[jj * R.W + ii] * ker[k + rad];
      }
      out[j * R.W + i] = v;
    }
    return out;
  };
  // The kernel's peak is 1 at the line, as the per-segment sum it replaces.
  return [pass(pass(c, true), false), pass(pass(s, true), false)];
}

const siteRasterCache = new WeakMap<Ground, { land: [Float64Array, Float64Array]; water: [Float64Array, Float64Array]; roads: [Float64Array, Float64Array] }>();
function siteRasters(G: Ground, landWater: Line[][], roads: Line[][]) {
  const hit = siteRasterCache.get(G);
  if (hit) return hit;
  const R = rasterFrame(G);
  const r = { land: blurred(R, [landWater[0]]), water: blurred(R, [landWater[1]]), roads: blurred(R, roads) };
  siteRasterCache.set(G, r);
  return r;
}

/** The family's own field and the line sources, for one design. */
function sources(G: Ground, g: FieldGenes, fam: Family, routes: Line[], centres: Pt[]) {
  const sf = siteField(G), sk = skeletonLines(G);
  const landLines = G.skeleton?.source === "landform" ? sk.map((l) => l.points) : [];
  const roadLines = [...(G.roads ?? []), ...(G.skeleton?.source === "roads" ? sk.map((l) => l.points) : []), ...routes];
  const lines: Source[] = [
    { lines: landLines, w: g.f_landform },
    { lines: sf.water, w: g.f_edges * 0.6 },
    { lines: roadLines, w: g.f_edges },
  ];
  // The wind: the site's regional hot-afternoon wind axis when known (pc/wind.py, ERA5), else
  // no pull. Its pull is scaled by how steady it is, so a wind with no clear axis steers little
  // (docs/streets.md).
  const wind = G.meta.wind?.bearing_deg != null ? G.meta.wind : null;
  const windTheta = wind ? (90 - wind.bearing_deg!) * Math.PI / 180 : null;
  const windSteady = wind?.seasons[wind.bearing_from]?.consistency ?? 1;
  // The family's own field.
  let own: (p: Pt) => number | null;
  const name = fam.name;
  if (name === "radial") {
    const c = centres[0] ?? [(G.bounds[0] + G.bounds[2]) / 2, (G.bounds[1] + G.bounds[3]) / 2] as Pt;
    own = (p) => Math.atan2(p[1] - c[1], p[0] - c[0]);
  } else if (name === "tight and shaded") {
    // Streets across the hot afternoon sun (15 April, 15:30 local), so their own buildings shade them.
    const [lon, lat] = G.meta.origin, doy = dayOfYear(4, 15);
    const sun = sunAt(lat, doy, solarHour(15.5, lon, G.meta.utc_offset_h ?? 5.5, doy));
    const th = Math.atan2(sun.dir[1], sun.dir[0]) + Math.PI / 2;
    own = () => th;
  } else if (name === "contour-following") {
    own = () => null; // the landform does the work
    lines[0].w = Math.max(lines[0].w, 0.8);
  } else {
    // Rotated orthogonal: one bearing, the wind's if known, else the longest edge's.
    let th = windTheta ?? dominant(roadLines.length ? roadLines : sf.water);
    if (windTheta !== null && g.f_wind < 0.5) th = dominant(roadLines.length ? roadLines : sf.water);
    own = () => th;
  }
  return { lines, own, windTheta, windSteady, sf };
}

/** The length-weighted mean direction of some lines (mod 180°). */
function dominant(lines: Line[]): number {
  let c = 0, s = 0;
  for (const l of lines) for (let k = 1; k < l.length; k++) {
    const dx = l[k][0] - l[k - 1][0], dy = l[k][1] - l[k - 1][1], len = Math.hypot(dx, dy), th = Math.atan2(dy, dx);
    c += len * Math.cos(2 * th); s += len * Math.sin(2 * th);
  }
  return c || s ? Math.atan2(s, c) / 2 : 0;
}

export interface Infill { lines: Line[]; theta: (p: Pt) => number }

/** The design's local streets. `existing`: the streets already laid (skeleton, routes). */
export function infill(G: Ground, d: Design, g: FieldGenes, existing: Line[], routes: Line[], centres: Pt[], seed: number): Infill {
  const fam = familyOf(g.pattern);
  const depth = fam.depth[0] + (fam.depth[1] - fam.depth[0]) * g.plot_depth;
  const [lo, hi] = RANGES_V3.local_spacing;
  const spacing = G.meta.landform?.relief.class === "pronounced"
    ? lo + (g.local_spacing - lo) * (HILL_LOCAL_SPACING - lo) / (hi - lo) : g.local_spacing;
  const majorGap = 2 * depth + fam.local_w, minorGap = spacing * fam.spacing;
  const loc = locator(G);
  const ok = (p: Pt) => { const c = loc.cell(p); return c >= 0 && (d.use[c] === BUILDING || d.use[c] === LANDSCAPE); };
  const { lines: srcs, own, windTheta, windSteady, sf } = sources(G, g, fam, routes, centres);
  // The line sources as a raster of 2θ vectors (length-weighted), blurred to the field's
  // reach: per site for the fixed sources, per design for its routes. Read by interpolation.
  let t0 = performance.now();
  const R = rasterFrame(G);
  const fixed = siteRasters(G, srcs.slice(0, 2).map((x) => x.lines), [srcs[2].lines.slice(0, srcs[2].lines.length - routes.length)]);
  t0 = tk("  infill.site", t0);
  const mine = blurred(R, [routes]);
  t0 = tk("  infill.blur", t0);
  const wl = srcs[0].w, we = srcs[1].w > 0 ? srcs[1].w / 0.6 : 0, wr = srcs[2].w;
  const fc = new Float64Array(R.W * R.H), fs = new Float64Array(R.W * R.H);
  for (let k = 0; k < R.W * R.H; k++) {
    fc[k] = wl * fixed.land[0][k] + we * 0.6 * fixed.water[0][k] + wr * (fixed.roads[0][k] + mine[0][k]);
    fs[k] = wl * fixed.land[1][k] + we * 0.6 * fixed.water[1][k] + wr * (fixed.roads[1][k] + mine[1][k]);
  }
  // Everything else added at each raster point once: the family's own field, the contours,
  // the wind. A step then reads the field by interpolation.
  for (let j = 0; j < R.H; j++) for (let i = 0; i < R.W; i++) {
    const k = j * R.W + i, p: Pt = [R.x0 + (i + 0.5) * R.res, R.y0 + (j + 0.5) * R.res];
    const o = own(p);
    if (o !== null) { fc[k] += Math.cos(2 * o); fs[k] += Math.sin(2 * o); }
    const cell = loc.cell(p);
    if (cell >= 0 && !Number.isNaN(sf.contour[cell])) {
      const w = srcs[0].w * 1.5;
      fc[k] += w * Math.cos(2 * sf.contour[cell]); fs[k] += w * Math.sin(2 * sf.contour[cell]);
    }
    if (windTheta !== null && g.f_wind > 0) { const w = g.f_wind * windSteady; fc[k] += w * Math.cos(2 * windTheta); fs[k] += w * Math.sin(2 * windTheta); }
  }
  t0 = tk("  infill.field", t0);
  const theta = (p: Pt): number => {
    const fx = (p[0] - R.x0) / R.res - 0.5, fy = (p[1] - R.y0) / R.res - 0.5;
    const i0 = Math.max(0, Math.min(R.W - 2, Math.floor(fx))), j0 = Math.max(0, Math.min(R.H - 2, Math.floor(fy)));
    const tx = Math.min(Math.max(fx - i0, 0), 1), ty = Math.min(Math.max(fy - j0, 0), 1);
    const k = j0 * R.W + i0;
    const c = (fc[k] * (1 - tx) + fc[k + 1] * tx) * (1 - ty) + (fc[k + R.W] * (1 - tx) + fc[k + R.W + 1] * tx) * ty;
    const sn = (fs[k] * (1 - tx) + fs[k + 1] * tx) * (1 - ty) + (fs[k + R.W] * (1 - tx) + fs[k + R.W + 1] * tx) * ty;
    return c || sn ? Math.atan2(sn, c) / 2 : 0;
  };
  if (fam.name === "organic") { const v = voronoi(G, ok, existing, minorGap, seed); tk("  infill.voronoi", t0); return { lines: v, theta }; }

  // Streets laid so far, for meeting them; and one index per family for spacing.
  const streets = new SegIndex(40);
  for (const l of existing) streets.addLine(l, -1);
  const fams = [new SegIndex(Math.max(20, majorGap / 2)), new SegIndex(Math.max(20, minorGap / 2))];
  const out: Line[] = [];
  const dirAt = (p: Pt, minor: number) => theta(p) + minor * Math.PI / 2;

  const traceOne = (seedPt: Pt, minor: number, gap: number): Line | null => {
    const fi = fams[minor], half: Line[] = [];
    for (const sgn of [1, -1]) {
      const pts: Line = [seedPt];
      let p = seedPt, prevDir: [number, number] | null = null;
      for (let s = 0; s * FIELD.STEP_M < FIELD.MAX_LEN_M; s++) {
        let th = dirAt(p, minor), dx = Math.cos(th), dy = Math.sin(th);
        if (prevDir) { if (dx * prevDir[0] + dy * prevDir[1] < 0) { dx = -dx; dy = -dy; } } else { dx *= sgn; dy *= sgn; }
        // RK2: look half a step ahead.
        const mid: Pt = [p[0] + dx * FIELD.STEP_M / 2, p[1] + dy * FIELD.STEP_M / 2];
        th = dirAt(mid, minor);
        let ex = Math.cos(th), ey = Math.sin(th);
        if (ex * dx + ey * dy < 0) { ex = -ex; ey = -ey; }
        const q2: Pt = [p[0] + ex * FIELD.STEP_M, p[1] + ey * FIELD.STEP_M];
        // Meets a street: end there (a T junction).
        const hit = streets.firstCross(p, q2);
        if (hit && s > 0) { pts.push(hit.at); break; }
        if (!ok(q2)) break;
        if (s > 1 && fi.nearest(q2, gap * FIELD.TEST)) break;  // too close to a parallel street
        pts.push(q2); prevDir = [ex, ey]; p = q2;
      }
      half.push(pts);
    }
    const line = [...half[1].slice(1).reverse(), ...half[0]];
    return length(line) >= FIELD.MIN_LEN_M ? line : null;
  };

  // Seeds: along the streets laid so far and then on a regular grid, both families in turn,
  // major first. A seed is used when no street of its family is within the spacing.
  const rng = makeRng(seed);
  const [x0, y0, x1, y1] = G.bounds;
  const grid: Pt[] = [];
  const gs = Math.min(majorGap, minorGap);
  for (let y = y0 + gs / 2; y < y1; y += gs) for (let x = x0 + gs / 2; x < x1; x += gs) grid.push([x + (rng.random() - 0.5) * gs * 0.3, y + (rng.random() - 0.5) * gs * 0.3]);
  // Seeds along the streets laid so far, about every half spacing.
  const along: Pt[] = [];
  for (const l of existing) { const r = resample(l, Math.max(12, gs / 2)); for (let k = 1; k < r.length; k++) along.push(r[k]); }
  for (const minor of [0, 1]) {
    const gap = minor ? minorGap : majorGap;
    for (const sp of [...along, ...grid]) {
      if (!ok(sp) || fams[minor].nearest(sp, gap)) continue;
      const line = traceOne(sp, minor, gap);
      if (!line) continue;
      const sm = smoothTrace(line, FIELD.SMOOTH_M, 8);
      out.push(sm);
      fams[minor].addLine(sm, minor);
      streets.addLine(sm, out.length - 1);
    }
  }
  tk("  infill.trace", t0);
  return { lines: out, theta };
}

/** Organic: the edges of Voronoi cells round seed points jittered about a hexagonal lattice at
 *  the block length, inside the ground streets may use, traced like the skeleton. The traced
 *  pixels are simplified back to the cells' straight edges, and each corner becomes an arc. */
function voronoi(G: Ground, ok: (p: Pt) => boolean, existing: Line[], gap: number, seed: number): Line[] {
  const rng = makeRng(seed), [x0, y0, x1, y1] = G.bounds, seeds: Pt[] = [];
  const row = gap * Math.sqrt(3) / 2;
  for (let j = 0, y = y0; y <= y1; y += row, j++) for (let x = x0 + (j % 2) * gap / 2; x <= x1; x += gap) {
    const p: Pt = [x + (rng.random() - 0.5) * gap * 0.6, y + (rng.random() - 0.5) * gap * 0.6];
    if (ok(p)) seeds.push(p);
  }
  if (seeds.length < 2) return [];
  const res = 6, W = Math.ceil((x1 - x0) / res) + 1, H = Math.ceil((y1 - y0) / res) + 1;
  // Label each pixel with its nearest seed (buckets of one gap).
  const bk = new Map<number, number[]>(), key = (i: number, j: number) => (i + 32768) * 65536 + (j + 32768);
  seeds.forEach((p, k) => { const kk = key(Math.floor(p[0] / gap), Math.floor(p[1] / gap)), b = bk.get(kk); if (b) b.push(k); else bk.set(kk, [k]); });
  const lab = new Int32Array(W * H).fill(-1);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const p: Pt = [x0 + (i + 0.5) * res, y0 + (j + 0.5) * res];
    if (!ok(p)) continue;
    const bi = Math.floor(p[0] / gap), bj = Math.floor(p[1] / gap);
    let best = -1, bd = Infinity;
    for (let a = bi - 2; a <= bi + 2; a++) for (let b = bj - 2; b <= bj + 2; b++) for (const k of bk.get(key(a, b)) ?? []) {
      const dd = (seeds[k][0] - p[0]) ** 2 + (seeds[k][1] - p[1]) ** 2;
      if (dd < bd) { bd = dd; best = k; }
    }
    lab[j * W + i] = best;
  }
  // Boundary pixels: next to a pixel of another cell.
  const img = new Uint8Array(W * H);
  for (let j = 1; j < H - 1; j++) for (let i = 1; i < W - 1; i++) {
    const l = lab[j * W + i];
    if (l < 0) continue;
    if ((lab[j * W + i + 1] >= 0 && lab[j * W + i + 1] !== l) || (lab[(j + 1) * W + i] >= 0 && lab[(j + 1) * W + i] !== l)) img[j * W + i] = 1;
  }
  const lines = thinAndTrace(img, W, H, 0).map((l) => l.map((p) => [x0 + ((p % W) + 0.5) * res, y0 + (Math.floor(p / W) + 0.5) * res] as Pt));
  void existing;
  return lines.filter((l) => length(l) >= FIELD.MIN_LEN_M).map((l) => fillet(simplify(l, res), FIELD.CORNER_R_M));
}
