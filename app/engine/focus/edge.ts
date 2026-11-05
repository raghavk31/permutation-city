// A river's edge as a line (docs/architecture-v3.md section 15.9, step E1). Each bank is traced from the
// mapped river's outline, read at stations along it, and cut into stretches that want different
// designs. Nothing is designed here: this is what a design has to fit.
import { length as lineLength, type Line, resample, smoothTrace } from "../plan/geom.js";
import { lineIndex, type Place } from "./place.js";
import { inRings, reachAt, riverYear } from "./river.js";
import { Surface, viewsOf } from "./views.js";

export const STATION_M = 50;       // how far apart a bank is read
export const STRETCH_MIN_M = 100;  // a stretch shorter than this isn't worth a design of its own
const SMOOTH_M = 40;               // the outline's small kinks aren't the river's shape
const BOX_M = 1.5;                 // an outline's point this close to the study box is the box's edge, not a bank
const STEP_M = 10;                 // how finely a section is read; the terrain itself is coarser
const MAX_REACH_M = 500;           // a section looks no further inland than this
const MAX_BED_M = 600;             // and no further out for the water
const OUT_LEAST_M = 100;            // a section shows at least this much past the bank
const CLEAR_OF_RIVER_M = 40;       // a smoothed line may sit a little off the outline: ignore the river this near it
const WET = 50;                    // a cell wet in this share of a month's looks counts as under water, as river.ts
const RAIL_AND_ROADS = new Set(["primary", "secondary", "tertiary", "trunk", "residential", "unclassified", "living_street"]);
const ROOM_NARROW_M = 60, ROOM_NONE_M = 15, ROOM_WIDE_M = 180;
const THIN = 20;                   // as river.ts: fewer looks than this is a thin month
export const VIEW_TREE_M = 10;     // a grown riverside tree, roughly (assumed): a view's limit under this holds trees down
const LEVEL_MIN_M = 144, LEVEL_MAX_M = 156, LEVEL_STEP_M = 0.25;
const LEVEL_NEAR = 0.03;           // levels agreeing this nearly as well as the best are just as likely
const LEVEL_TRUST = 0.4;           // agreement under this reads no level: the water seen isn't following the ground
const OFFSET_MAX_M = 3;            // how far to raise a reported level looking for it to reach what it's said to have reached

export type Stop = "rises" | "building" | "street" | "stays" | "water" | "box" | "far";
export type Room = "none" | "narrow" | "wide" | "broad";
export type Law = "prohibited" | "regulated" | "free";

export interface Station {
  bank: 1 | 2;
  /** Metres along the bank from its upstream end. */
  s: number;
  x: number; y: number;
  /** A unit vector pointing inland. */
  nx: number; ny: number;
  /** The ground inland of the bank, to a little past where it rises above the line. Null: no reading. */
  ground: { d: number; z: number | null; trees?: number }[];
  /** The surface out from the bank toward the water: flattened water or a bar, not a measured bed. */
  out: { d: number; z: number | null }[];
  /** Metres of ground a design could use here, and what ends it. */
  reach: number; stop: Stop;
  /** Metres to ground above the line, past any building or street in the way. Null if not within reach. */
  rise: number | null;
  law: Law; room: Room;
  /** The tightest view limit on this section, metres above ground; null where no view sets one. */
  view: number | null; viewLow: boolean;
  trees: number; hot: number | null;
  /** Days a year seen wet; null with no reading. */
  wetDays: number | null;
  /** Metres from the bank out to the water in the driest and wettest clear months; null if not seen. */
  toWaterLow: number | null; toWaterHigh: number | null;
}

export interface Stretch {
  id: string; bank: 1 | 2; from: number; to: number; length: number;
  stations: [number, number];
  room: Room; law: Law; viewLow: boolean;
  reach: { lo: number; mid: number; hi: number };
  /** Ground over the usable part, lowest and highest, middle station. */
  low: number | null; top: number | null;
  ha: number;
  stops: Partial<Record<Stop, number>>;
  toWaterLow: number | null; toWaterHigh: number | null;
  wetDays: number | null;
}

export interface Bank { id: 1 | 2; words: string; line: Line; stations: Station[]; stretches: Stretch[]; length: number }

export interface EdgeRead {
  banks: Bank[];
  /** The months the river's edge is read at. */
  months: { low: number; high: number } | null;
  /** The river's level through the year, as far as the satellite can read it. */
  levels: MonthLevel[];
  /** How far the terrain and the river's levels can be trusted against each other. */
  datum: DatumCheck;
}

/** A way of testing the terrain against the river's levels. */
export interface DatumClue { words: string; found: string; offset: number | null }
export interface DatumCheck {
  clues: DatumClue[];
  /** The spread of the offsets found, metres; positive: the terrain reads too high. */
  range: [number, number] | null;
  /** The river's level on an ordinary day, in the terrain's heights. Null if nothing could be read. */
  ordinary: [number, number] | null;
}

/** One month's river level, in the terrain's heights. `read` false: this month can't give a level. */
export interface MonthLevel { month: number; level: number; lo: number; hi: number; agree: number; looks: number; read: boolean }

/** Cells by bucket: nearest ground, for reading a section. */
class Cells {
  private grid = new Map<string, number[]>();
  private size: number;
  constructor(private place: Place) {
    this.size = place.meta.grid.spacing;
    const { x, y } = place.cells;
    for (let i = 0; i < x.length; i++) { const k = this.key(x[i], y[i]); (this.grid.get(k) ?? this.grid.set(k, []).get(k)!).push(i); }
  }
  private key(px: number, py: number) { return `${Math.floor(px / this.size)},${Math.floor(py / this.size)}`; }
  /** The nearest cell, or -1 if none is near. */
  nearest(px: number, py: number, ok?: (i: number) => boolean): number {
    const { x, y } = this.place.cells, cx = Math.floor(px / this.size), cy = Math.floor(py / this.size);
    let best = -1, bestD = (this.size * 1.5) ** 2;
    for (let u = cx - 2; u <= cx + 2; u++) for (let v = cy - 2; v <= cy + 2; v++) for (const i of this.grid.get(`${u},${v}`) ?? []) {
      const q = (x[i] - px) ** 2 + (y[i] - py) ** 2;
      if (q < bestD && (!ok || ok(i))) { bestD = q; best = i; }
    }
    return best;
  }
  /** Ground at a point, from the land cells around it. The cells are 35 m apart and the terrain
   *  behind them about 30 m, so this draws a smooth line, not a finer measurement. */
  ground(px: number, py: number): number | null {
    const { x, y, z, band, tank } = this.place.cells, cx = Math.floor(px / this.size), cy = Math.floor(py / this.size);
    let sum = 0, weight = 0;
    for (let u = cx - 1; u <= cx + 1; u++) for (let v = cy - 1; v <= cy + 1; v++) for (const i of this.grid.get(`${u},${v}`) ?? []) {
      if (z[i] <= 0 || band[i] === 0 || tank[i]) continue;
      const q = (x[i] - px) ** 2 + (y[i] - py) ** 2;
      if (q > (this.size * 1.2) ** 2) continue;
      const w = 1 / (q + 25);
      sum += z[i] * w; weight += w;
    }
    return weight ? sum / weight : null;
  }
}

/** Street segments by bucket, to see where a section crosses one. */
class Crossings {
  private grid = new Map<string, number[][]>();
  private static SIZE = 40;
  constructor(lines: number[][]) {
    for (const pts of lines) for (let k = 0; k + 3 < pts.length; k += 2) {
      const seg = [pts[k], pts[k + 1], pts[k + 2], pts[k + 3]], s = Crossings.SIZE;
      for (let u = Math.floor(Math.min(seg[0], seg[2]) / s); u <= Math.floor(Math.max(seg[0], seg[2]) / s); u++)
        for (let v = Math.floor(Math.min(seg[1], seg[3]) / s); v <= Math.floor(Math.max(seg[1], seg[3]) / s); v++) {
          const key = `${u},${v}`;
          (this.grid.get(key) ?? this.grid.set(key, []).get(key)!).push(seg);
        }
    }
  }
  crosses(ax: number, ay: number, bx: number, by: number): boolean {
    const s = Crossings.SIZE;
    for (let u = Math.floor(Math.min(ax, bx) / s); u <= Math.floor(Math.max(ax, bx) / s); u++)
      for (let v = Math.floor(Math.min(ay, by) / s); v <= Math.floor(Math.max(ay, by) / s); v++)
        for (const q of this.grid.get(`${u},${v}`) ?? []) {
          const d1 = (bx - ax) * (q[1] - ay) - (by - ay) * (q[0] - ax), d2 = (bx - ax) * (q[3] - ay) - (by - ay) * (q[2] - ax);
          const d3 = (q[2] - q[0]) * (ay - q[1]) - (q[3] - q[1]) * (ax - q[0]), d4 = (q[2] - q[0]) * (by - q[1]) - (q[3] - q[1]) * (bx - q[0]);
          if (d1 * d2 < 0 && d3 * d4 < 0) return true;
        }
    return false;
  }
}

/** The mapped river, largest piece. */
function riverOf(place: Place) {
  const rivers = place.water.filter((w) => w.subtype === "river");
  if (!rivers.length) throw new Error(`${place.meta.id} has no mapped river`);
  return rivers.reduce((a, b) => (b.rings[0][0].length > a.rings[0][0].length ? b : a));
}

/** Each side's longest run of the river's outline that isn't the study box's edge, upstream first
 *  (the end nearest the first anchor's bank's start: west here, the way the Yamuna runs at Agra). */
export function bankLines(place: Place, cells = new Cells(place)): { id: 1 | 2; line: Line }[] {
  const ring = riverOf(place).rings[0][0], [x0, y0, x1, y1] = place.meta.box, n = ring.length / 2;
  const onBox = (k: number) => {
    const x = ring[2 * k], y = ring[2 * k + 1];
    return x <= x0 + BOX_M || x >= x1 - BOX_M || y <= y0 + BOX_M || y >= y1 - BOX_M;
  };
  let start = 0;
  while (start < n && !onBox(start)) start++;
  if (start === n) throw new Error(`${place.meta.id}: the river's outline never reaches the study box's edge, so it has no two banks`);
  const runs: Line[] = [];
  let run: Line = [];
  for (let c = 1; c <= n; c++) {
    const k = (start + c) % n;
    if (onBox(k)) { if (run.length > 2) runs.push(run); run = []; }
    else run.push([ring[2 * k], ring[2 * k + 1]]);
  }
  const { side, band } = place.cells;
  const sideOf = (l: Line): 1 | 2 | 0 => {
    const votes = [0, 0, 0];
    for (const [px, py] of l) { const i = cells.nearest(px, py, (j) => band[j] !== 0); if (i >= 0) votes[side[i]]++; }
    return votes[1] === 0 && votes[2] === 0 ? 0 : votes[1] >= votes[2] ? 1 : 2;
  };
  const out: { id: 1 | 2; line: Line }[] = [];
  for (const id of [1, 2] as const) {
    const mine = runs.filter((l) => sideOf(l) === id);
    if (!mine.length) continue;
    const longest = mine.reduce((a, b) => (lineLength(b) > lineLength(a) ? b : a));
    const westFirst = longest[0][0] <= longest[longest.length - 1][0] ? longest : [...longest].reverse();
    out.push({ id, line: smoothTrace(westFirst, SMOOTH_M) });
  }
  return out;
}

const median = (v: number[]) => { if (!v.length) return 0; const s = [...v].sort((a, b) => a - b); return s[Math.floor((s.length - 1) / 2)]; };
const round1 = (v: number) => Math.round(v * 10) / 10;

interface Shared {
  place: Place; cells: Cells; surface: Surface; roads: Crossings; river: ReturnType<typeof riverOf>;
  line: number; released?: Uint8Array | null; viewLimit: Float32Array; dry: Int16Array | null; months: { low: number; high: number } | null;
}

function readStation(ctx: Shared, bank: 1 | 2, s: number, x: number, y: number, nx: number, ny: number): Station {
  const { place, cells, surface, roads, river, line } = ctx, c = place.cells;
  const ground: Station["ground"] = [];
  let reach = -1, stop: Stop = "far", rise: number | null = null, above = 0;
  const used = new Set<number>();
  for (let d = 0; d <= MAX_REACH_M; d += STEP_M) {
    const px = x + nx * d, py = y + ny * d, [bx0, by0, bx1, by1] = place.meta.box;
    if (px < bx0 || px > bx1 || py < by0 || py > by1) { if (reach < 0) { reach = d; stop = "box"; } break; }
    const i = cells.nearest(px, py);
    ground.push({ d, z: cells.ground(px, py), trees: i >= 0 ? c.trees[i] : 0 });
    const wet = d >= CLEAR_OF_RIVER_M && (inRings(river.rings, px, py) || (i >= 0 && !!c.tank[i]));
    if (wet) { if (reach < 0) { reach = d; stop = "water"; } break; }
    const isAbove = i >= 0 && c.band[i] > line + 1;
    above = isAbove ? above + 1 : 0;
    if (above >= 2 || (isAbove && d === 0)) { rise = d - (above >= 2 ? STEP_M : 0); if (reach < 0) { reach = rise; stop = "rises"; } break; }
    if (reach < 0) {
      if (i >= 0 && c.stay[i] && !ctx.released?.[i]) { reach = d; stop = "stays"; }
      else if (surface.whoAt(px, py) >= 0) { reach = d; stop = "building"; }
      else if (d > 0 && roads.crosses(px - nx * STEP_M, py - ny * STEP_M, px, py)) { reach = d; stop = "street"; }
      else if (i >= 0) used.add(i);
    }
  }
  if (reach < 0) reach = MAX_REACH_M;

  // Over what a design could use, or the first cell at the bank when there's no room.
  if (!used.size) { const i = cells.nearest(x + nx * 15, y + ny * 15, (j) => c.band[j] !== 0); if (i >= 0) used.add(i); }
  const ids = [...used], rules = place.brief.rules ?? [], has = (id: string) => {
    const k = rules.findIndex((r) => r.id === id);
    return k >= 0 && ids.filter((i) => (c.rule?.[i] ?? 0) & (1 << k)).length * 2 >= Math.max(1, ids.length);
  };
  const limits = ids.map((i) => ctx.viewLimit[i]).filter(Number.isFinite);
  const view = limits.length ? Math.min(...limits) : null;
  const heats = ids.map((i) => c.lst[i]).filter((v): v is number => v !== null);
  // A section narrower than two cells shares a cell with the river, so what the satellite saw there isn't the ground's.
  const wets = ctx.dry && reach >= 2 * place.meta.grid.spacing ? ids.map((i) => ctx.dry![i]).filter((v) => v >= 0).map((v) => 365 - v) : [];
  const room: Room = reach < ROOM_NONE_M ? "none" : reach < ROOM_NARROW_M ? "narrow" : reach < ROOM_WIDE_M ? "wide" : "broad";

  // Out to the water, in the driest and wettest clear months.
  const toWater = (month: number | undefined) => {
    if (month === undefined) return null;
    const wet = place.year!.wet[month];
    for (let d = 0; d <= MAX_BED_M; d += STEP_M) {
      const i = cells.nearest(x - nx * d, y - ny * d);
      if (i >= 0 && wet[i] >= WET && !c.tank[i]) return d;
    }
    return null;
  };

  const toWaterLow = toWater(ctx.months?.low), toWaterHigh = toWater(ctx.months?.high);
  const out: Station["out"] = [];
  for (let d = STEP_M; d <= Math.max(toWaterLow ?? 0, toWaterHigh ?? 0, OUT_LEAST_M); d += STEP_M) {
    const i = cells.nearest(x - nx * d, y - ny * d), h = i >= 0 ? c.bed?.[i] ?? c.z[i] : 0;
    out.push({ d, z: h > 0 ? h : null });
  }

  return { bank, s, x, y, nx, ny, ground, out, reach, stop, rise,
    law: has("prohibited") ? "prohibited" : has("regulated") ? "regulated" : "free", room,
    view: view === null ? null : round1(view), viewLow: view !== null && view < VIEW_TREE_M,
    trees: ids.length ? ids.reduce((a, i) => a + c.trees[i], 0) / ids.length : 0,
    hot: heats.length ? round1(heats.reduce((a, b) => a + b, 0) / heats.length) : null,
    wetDays: wets.length ? Math.round(wets.reduce((a, b) => a + b, 0) / wets.length) : null,
    toWaterLow, toWaterHigh };
}

/** The bank's own run of a label, freed of flicker: each station takes the commonest of those around it. */
function steady<T>(v: T[], radius = 2): T[] {
  return v.map((_, k) => {
    const tally = new Map<T, number>();
    for (let j = Math.max(0, k - radius); j <= Math.min(v.length - 1, k + radius); j++) tally.set(v[j], (tally.get(v[j]) ?? 0) + 1);
    return [...tally].reduce((a, b) => (b[1] > a[1] || (b[1] === a[1] && b[0] === v[k]) ? b : a))[0];
  });
}

/** Stretches: runs of stations alike in room, law and whether a view holds trees down. `total`: the bank's length. */
export function cutStretches(bank: 1 | 2, stations: Station[], total: number, stepM = STATION_M): Stretch[] {
  if (!stations.length) return [];
  const room = steady(stations.map((t) => t.room)), law = steady(stations.map((t) => t.law)), viewLow = steady(stations.map((t) => t.viewLow));
  const label = (k: number) => `${room[k]}|${law[k]}|${viewLow[k]}`;
  let runs: { a: number; b: number }[] = [];
  for (let k = 0; k < stations.length; k++) {
    if (runs.length && label(runs[runs.length - 1].b) === label(k)) runs[runs.length - 1].b = k;
    else runs.push({ a: k, b: k });
  }
  const lengthOf = (r: { a: number; b: number }) => Math.min(total, stations[r.b].s + stepM) - stations[r.a].s;
  // The shortest run under the least length joins the neighbour it most resembles, or the longer.
  for (;;) {
    const short = runs.map((r, k) => ({ k, len: lengthOf(r) })).filter((o) => o.len < STRETCH_MIN_M).sort((p, q) => p.len - q.len)[0];
    if (!short || runs.length === 1) break;
    const k = short.k, p = runs[k - 1], q = runs[k + 1];
    const alike = (o?: { a: number; b: number }) => {
      if (!o) return -1;
      const u = runs[k].a, w = o.a;
      return (room[u] === room[w] ? 1 : 0) + (law[u] === law[w] ? 1 : 0) + (viewLow[u] === viewLow[w] ? 1 : 0);
    };
    const toP = !q || (p && (alike(p) > alike(q) || (alike(p) === alike(q) && lengthOf(p) >= lengthOf(q))));
    runs = toP ? [...runs.slice(0, k - 1), { a: p!.a, b: runs[k].b }, ...runs.slice(k + 1)]
      : [...runs.slice(0, k), { a: runs[k].a, b: q!.b }, ...runs.slice(k + 2)];
  }
  const commonest = <T,>(v: T[]) => {
    const tally = new Map<T, number>();
    for (const x of v) tally.set(x, (tally.get(x) ?? 0) + 1);
    return [...tally].reduce((a, b) => (b[1] > a[1] ? b : a))[0];
  };
  const out: Stretch[] = runs.map((r, k) => {
    const span = stations.slice(r.a, r.b + 1), reaches = span.map((t) => t.reach);
    const lows: number[] = [], tops: number[] = [], stops: Partial<Record<Stop, number>> = {};
    for (const t of span) {
      const zs = t.ground.filter((g) => g.d <= t.reach && g.z !== null).map((g) => g.z!);
      if (zs.length) { lows.push(Math.min(...zs)); tops.push(Math.max(...zs)); }
      stops[t.stop] = (stops[t.stop] ?? 0) + 1;
    }
    const known = (v: (number | null)[]) => { const n = v.filter((a): a is number => a !== null); return n.length ? median(n) : null; };
    return {
      id: `${bank === 1 ? "A" : "B"}${k + 1}`, bank, from: stations[r.a].s, to: Math.round(Math.min(total, stations[r.b].s + stepM)), length: Math.round(lengthOf(r)), stations: [r.a, r.b],
      room: commonest(room.slice(r.a, r.b + 1)), law: commonest(law.slice(r.a, r.b + 1)), viewLow: commonest(viewLow.slice(r.a, r.b + 1)),
      reach: { lo: Math.min(...reaches), mid: median(reaches), hi: Math.max(...reaches) },
      low: lows.length ? round1(median(lows)) : null, top: tops.length ? round1(median(tops)) : null,
      ha: round1(reaches.reduce((a, b) => a + b * stepM, 0) / 1e4), stops,
      toWaterLow: known(span.map((t) => t.toWaterLow)), toWaterHigh: known(span.map((t) => t.toWaterHigh)), wetDays: known(span.map((t) => t.wetDays)),
    };
  });
  return out;
}

/** Height of each cell's surface, the river's bars and flattened water included. */
const surfaceOf = (place: Place, i: number) => place.cells.bed?.[i] ?? place.cells.z[i];

/** Each month, the level that best sorts what the satellite saw wet from what it saw dry, on the
 *  terrain's own heights. Clear days only: cloud and muddy water hide the monsoon's floods. */
export function monthlyLevels(place: Place): MonthLevel[] {
  const year = place.year, c = place.cells;
  if (!year) return [];
  const marks = place.brief.marks.length, cells: number[] = [];
  for (let i = 0; i < c.x.length; i++) if (!c.tank[i] && c.band[i] <= marks && surfaceOf(place, i) > 0) cells.push(i);
  return year.wet.map((wet, month) => {
    const tried: { L: number; f: number }[] = [];
    for (let L = LEVEL_MIN_M; L <= LEVEL_MAX_M; L += LEVEL_STEP_M) {
      let tp = 0, fp = 0, fn = 0;
      for (const i of cells) {
        if (wet[i] < 0) continue;
        const w = wet[i] >= WET, under = surfaceOf(place, i) <= L;
        if (w && under) tp++; else if (under) fp++; else if (w) fn++;
      }
      tried.push({ L, f: (2 * tp) / Math.max(1, 2 * tp + fp + fn) });
    }
    const best = tried.reduce((p, q) => (q.f > p.f ? q : p)), near = tried.filter((t) => t.f >= best.f - LEVEL_NEAR).map((t) => t.L);
    const looks = year.months[month].median_looks;
    return { month, level: best.L, lo: Math.min(...near), hi: Math.max(...near), agree: Math.round(best.f * 100) / 100, looks, read: looks >= THIN && best.f >= LEVEL_TRUST };
  });
}

/** How the terrain and the river's reported levels stand against each other. A clue that can give a
 *  number gives one: positive means the terrain reads too high against the report. */
export function datumCheck(place: Place, levels = monthlyLevels(place)): DatumCheck {
  const c = place.cells, clues: DatumClue[] = [], n = c.x.length, year = place.year;

  for (const r of place.brief.records ?? []) {
    const stay = r.check && place.brief.stays.find((t) => t.id === r.check!.stay);
    if (!stay?.rings) continue;
    // A flood reported with its depth: the depth the terrain gives at that level, against the report.
    if (r.check?.depth_m) {
      let sum = 0, wet = 0;
      for (let i = 0; i < n; i++) if (c.z[i] > 0 && c.z[i] <= r.m && inRings(stay.rings, c.x[i], c.y[i])) { sum += r.m - c.z[i]; wet++; }
      if (!wet) continue;
      const model = sum / wet, [lo, hi] = r.check.depth_m;
      clues.push({ words: `${stay.words}, ${r.date}`, offset: round1((lo + hi) / 2 - model),
        found: `At ${r.m} m the terrain gives ${model.toFixed(1)} m of water where it's wet. ${lo} to ${hi} m was reported.` });
    }
    // A flood reported as reaching something: how much higher the level must be, on this terrain.
    if (r.check?.reaches_edge) {
      let extra: number | null = null;
      for (let up = 0; up <= OFFSET_MAX_M && extra === null; up += LEVEL_STEP_M) {
        const reach = reachAt(place, r.m + up);
        for (let i = 0; i < n; i++) if (reach[i] && inRings(stay.rings, c.x[i], c.y[i])) { extra = up; break; }
      }
      clues.push({ words: `${stay.words}, ${r.date}`, offset: extra,
        found: extra === null ? `Reported to reach it at ${r.m} m. Even ${OFFSET_MAX_M} m higher, the terrain keeps the water out of our outline, which is only approximate.`
          : extra === 0 ? `Reported to reach it at ${r.m} m, and on this terrain it does.` : `Reported to reach it at ${r.m} m. On this terrain the water needs ${extra} m more to get inside our outline, which is only approximate.` });
    }
  }

  // Where the terrain says the water stands, in its own heights.
  const bed = (c.bed ?? []).filter((v, i): v is number => v !== null && c.band[i] === 0);
  const tally = new Map<number, number>();
  for (const v of bed) tally.set(v, (tally.get(v) ?? 0) + 1);
  const flat = [...tally].reduce((p, q) => (q[1] > p[1] ? q : p), [0, 0]);
  const read = levels.filter((l) => l.read);
  const ordinary: [number, number] | null = read.length ? [Math.min(...read.map((l) => l.lo)), Math.max(...read.map((l) => l.hi))] : null;
  if (ordinary) clues.push({ words: "The river on an ordinary day", offset: null,
    found: `The terrain flattens water, and ${flat[1]} of ${bed.length} river cells read ${flat[0]} m. In the ${read.length} months the satellite can read, the water fits a level of ${ordinary[0]} to ${ordinary[1]} m. These are the terrain's own heights, so they don't depend on the gauge.` });

  // Ground below the lowest reported level that the satellite never saw wet.
  const records = (place.brief.records ?? []).map((r) => r.m);
  if (year && records.length) {
    const level = Math.min(...records);
    let low = 0, dry = 0;
    for (let i = 0; i < n; i++) {
      if (!c.bank[i] || !c.side[i] || c.z[i] <= 0 || c.z[i] >= level) continue;
      low++;
      if (year.wet.every((m, k) => m[i] < WET || year.months[k].median_looks < THIN)) dry++;
    }
    clues.push({ words: `Bank below the ${level} m reported on a monsoon day`, offset: null,
      found: `${low} cells on the two banks read lower than that, and the satellite saw ${dry} of them wet in no clear month. That fits a river that usually stands well below that reading and rises for short spells cloud hides. It doesn't show the terrain is wrong.` });
  }

  clues.push({ words: "The gauge's own zero", offset: null,
    found: "Whether the gauge's metres and the terrain's start from the same zero hasn't been read, and neither has how far the river falls between the gauge and this stretch. The clues above can't separate these from the terrain's own error." });
  const offs = clues.map((k) => k.offset).filter((v): v is number => v !== null);
  return { clues, range: offs.length ? [Math.min(...offs), Math.max(...offs)] : null, ordinary };
}

const memo = new WeakMap<Place, EdgeRead>();

/** Both banks, read. Slow enough (a section per 50 m against every building) to keep once made. */
export function readEdge(place: Place, released?: Uint8Array | null): EdgeRead {
  const had = released ? undefined : memo.get(place);
  if (had) return had;
  const cells = new Cells(place), year = riverYear(place);
  const clear = year?.months.filter((m) => !m.thin);
  const months = clear?.length ? {
    low: clear.reduce((a, b) => (b.ha < a.ha ? b : a)).month,
    high: clear.reduce((a, b) => (b.ha > a.ha ? b : a)).month,
  } : null;
  const ctx: Shared = { place, cells, surface: new Surface(place), river: riverOf(place), line: lineIndex(place.brief), released,
    roads: new Crossings([...place.streets.filter((s) => RAIL_AND_ROADS.has(s.class)).map((s) => s.pts), ...place.rail.map((s) => s.pts)]),
    viewLimit: viewsOf(place).limit, dry: year?.dry ?? null, months };
  const banks: Bank[] = bankLines(place, cells).map(({ id, line }) => {
    const pts = resample(line, STATION_M);
    // Inland is the side away from the river, for the whole bank: test both sides at every point.
    let sign = 0;
    const tangent = (k: number) => {
      const p = pts[Math.max(0, k - 1)], q = pts[Math.min(pts.length - 1, k + 1)], L = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
      return [(q[0] - p[0]) / L, (q[1] - p[1]) / L];
    };
    pts.forEach((p, k) => {
      const [tx, ty] = tangent(k);
      sign += (inRings(ctx.river.rings, p[0] - ty * 30, p[1] + tx * 30) ? -1 : 0) + (inRings(ctx.river.rings, p[0] + ty * 30, p[1] - tx * 30) ? 1 : 0);
    });
    const left = sign >= 0;
    const stations = pts.map((p, k) => {
      const [tx, ty] = tangent(k);
      const nx = left ? -ty : ty, ny = left ? tx : -tx;
      return readStation(ctx, id, k * STATION_M, p[0], p[1], nx, ny);
    });
    return { id, line, stations, stretches: cutStretches(id, stations, lineLength(line)), length: lineLength(line),
      words: id === 1 ? "The Taj's bank" : "Mehtab Bagh's bank" };
  });
  const levels = monthlyLevels(place);
  const read: EdgeRead = { banks, months, levels, datum: datumCheck(place, levels) };
  if (!released) memo.set(place, read);
  return read;
}
