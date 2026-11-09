// The river in a place: how far a level reaches, how that compares with what was reported at that
// level, and the river's year as the satellite saw it (docs/architecture-v3.md section 15, F2).
import type { Place, RiverRecord, Rings } from "./place.js";

/** Land reached at a level: over ground at or below it, joined to the river. As pc/place.py's bands. */
export function reachAt(place: Place, level: number): Uint8Array {
  const { x, y, z, band } = place.cells;
  const n = x.length, size = place.meta.grid.spacing, near = (size * 1.2) ** 2;
  const key = (px: number, py: number) => `${Math.floor(px / size)},${Math.floor(py / size)}`;
  const grid = new Map<string, number[]>();
  for (let i = 0; i < n; i++) { const k = key(x[i], y[i]); (grid.get(k) ?? grid.set(k, []).get(k)!).push(i); }
  const out = new Uint8Array(n), seen = new Uint8Array(n), stack: number[] = [];
  for (let i = 0; i < n; i++) if (band[i] === 0) { seen[i] = 1; stack.push(i); }
  while (stack.length) {
    const i = stack.pop()!;
    const cx = Math.floor(x[i] / size), cy = Math.floor(y[i] / size);
    for (let u = cx - 2; u <= cx + 2; u++) for (let v = cy - 2; v <= cy + 2; v++) for (const j of grid.get(`${u},${v}`) ?? []) {
      if (seen[j] || z[j] <= 0 || z[j] > level || (x[j] - x[i]) ** 2 + (y[j] - y[i]) ** 2 > near) continue;
      seen[j] = 1; out[j] = 1; stack.push(j);
    }
  }
  return out;
}

export function inRings(rings: Rings, px: number, py: number): boolean {
  for (const poly of rings) {
    let on = false;
    for (const ring of poly) {
      for (let a = 0, b = ring.length - 2; a < ring.length; b = a, a += 2) {
        if ((ring[a + 1] > py) !== (ring[b + 1] > py) && px < ((ring[b] - ring[a]) * (py - ring[a + 1])) / (ring[b + 1] - ring[a + 1]) + ring[a]) on = !on;
      }
    }
    if (on) return true;
  }
  return false;
}

export interface RecordCheck { record: RiverRecord; model: string; agrees: boolean | null }

/** Where a level's reach ends near a thing that stays: its share wet, how deep, and how close. */
function nearStay(place: Place, id: string, level: number) {
  const { x, y, z } = place.cells;
  const rings = place.brief.stays.find((s) => s.id === id)?.rings;
  if (!rings) throw new Error(`a record checks a stay with no outline: ${id}`);
  const reach = reachAt(place, level);
  const inside: number[] = [];
  for (let i = 0; i < x.length; i++) if (z[i] > 0 && inRings(rings, x[i], y[i])) inside.push(i);
  const wet = inside.filter((i) => reach[i]);
  const depth = wet.length ? wet.reduce((a, i) => a + level - z[i], 0) / wet.length : 0;
  let gap = Infinity;
  for (let i = 0; i < x.length; i++) if (reach[i]) for (const j of inside) gap = Math.min(gap, Math.hypot(x[i] - x[j], y[i] - y[j]));
  return { share: wet.length / Math.max(1, inside.length), depth, gap };
}

const TOUCHING_M = 60;  // a reach this close to an approximate outline counts as at its edge

/** Each record that can be tested, held against the ground model at the same level. */
export function checkRecords(place: Place): RecordCheck[] {
  return (place.brief.records ?? []).map((record) => {
    const c = record.check;
    if (!c) return { record, model: "", agrees: null };
    const s = nearStay(place, c.stay, record.m);
    if (c.depth_m) {
      const near = s.share > 0 && s.depth >= c.depth_m[0] - 0.5 && s.depth <= c.depth_m[1] + 0.5;
      return { record, agrees: near, model: `Our ground model wets ${Math.round(s.share * 100)}% of it at this level, on average ${s.depth.toFixed(1)} m deep where it's wet.` };
    }
    const at = s.gap <= TOUCHING_M;
    return { record, agrees: at, model: s.gap === 0 || s.share > 0 ? "Our ground model puts water inside its outline at this level." : `Our ground model stops ${Math.round(s.gap)} m from its outline at this level.` };
  });
}

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const WET = 50;           // a cell wet in at least this share of a month's looks counts as under water that month
export const THIN_LOOKS = 20;    // fewer clear looks than this, over the years, and a month is a thin reading

export interface RiverYear {
  /** Hectares wet per month, of the whole study area. */
  months: { month: number; words: string; ha: number; looks: number; thin: boolean }[];
  low: number; high: number;
  /** Days a year each cell was dry, from the share of looks wet by month; -1 with no reading. */
  dry: Int16Array;
}

export function riverYear(place: Place): RiverYear | null {
  const y = place.year;
  if (!y) return null;
  const n = place.cells.x.length, ha = place.meta.cell_area / 1e4;
  const months = y.wet.map((row, m) => ({
    month: m, words: MONTHS[m], ha: Math.round(row.reduce((a, v) => a + (v >= WET ? 1 : 0), 0) * ha),
    looks: y.months[m].median_looks, thin: y.months[m].median_looks < THIN_LOOKS,
  }));
  const dry = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    let d = 0, known = true;
    for (let m = 0; m < 12 && known; m++) {
      const v = y.wet[m][i];
      if (v < 0) known = false;
      else d += DAYS[m] * (1 - v / 100);
    }
    dry[i] = known ? Math.round(d) : -1;
  }
  const has = months.map((m) => m.ha);
  return { months, low: Math.min(...has), high: Math.max(...has), dry };
}
