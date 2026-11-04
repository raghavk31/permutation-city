// A real place and its focused brief (docs/architecture-v3.md section 15, step F1; pc/place.py).
// A brief says what may change, what stays and what judges it. What stays is a proposal until a
// stakeholder decides it: nothing here decides for them.

export interface Mark { id: string; words: string; m: number; note: string }
export interface Link { words: string; from: string; to: string; straight_note?: string }
/** Rings as [outer, hole, ...] of flat [x0, y0, x1, y1, ...], local metres. */
export type Rings = number[][][];

export interface Stay {
  id: string; words: string; why: string;
  applies?: "buildings_in_zone" | "river" | "limit" | null;
  outline?: string | null;
  /** A link, or null when it is this brief's own assumption. */
  source: string | null;
  status: string;
  rings?: Rings;
  /** Filled by a stakeholder, never by the tool. */
  decided_by: string | null;
  decision: "keep" | "change" | null;
}

/** What the river did, as reported; `check` holds the ground model against it. */
export interface RiverRecord {
  date: string; m: number; words: string; what: string; source: string; status: string;
  check?: { stay: string; reaches_edge?: boolean; depth_m?: [number, number] };
}

/** A rule that applies here. `whole`: everywhere in the study area; else its rings, or neither. */
export interface Rule {
  id: string; words: string; effect: string;
  kind: "no_build" | "permission" | "unconfirmed" | "trees" | "context";
  source: string; status: string; rings?: Rings; whole?: boolean;
}

export interface ViewDef {
  id: string; words: string; why: string; status: string;
  eye: [number, number]; eye_m: number; feature: string;
  /** The eye stands on the highest terrain beside it (a plinth or a tower), not the nearest. */
  on_high?: boolean;
  /** Toward a monument: keep the sight line to its foot, this far above its ground. */
  target?: { at: [number, number]; half_m: number; foot_m: number; name: string };
  /** Across a view: keep the skyline within this fan. */
  looks?: { at: [number, number]; fan_deg: number };
}

export interface Brief {
  title: string; kind: string; makes: string[]; detail: number;
  marks: Mark[]; mark_source: string; records?: RiverRecord[]; line: string;
  can_change: string; affects: string; reads: string;
  stays: Stay[]; rules?: Rule[]; views?: ViewDef[]; links: Link[]; open_checks: string[];
}

/** The river through its year: per month, per cell, the share of clear looks wet (0-100), -1 unseen. */
export interface YearRecord {
  years: [number, number]; source: string;
  months: { month: number; scenes: number; median_looks: number }[];
  wet: number[][];
}

export interface Place {
  meta: {
    id: string; name: string; origin: [number, number]; crs: string; cell_size: number; cell_area: number;
    /** The cell grid, as a site export carries it. */
    grid: { type: "hex" | "quad"; size: number; spacing: number; degree: number; edge: number };
    box: [number, number, number, number]; credits: string[]; dropped: string[]; storey_m: number;
  };
  brief: Brief;
  year?: YearRecord | null;
  cells: {
    x: number[]; y: number[]; z: number[];
    /** 0 the river; k the k-th mark reaches it (1-based); marks.length + 1 above them all. */
    band: number[];
    /** Bit k set: the cell is in brief.rules[k]. */
    rule?: number[];
    stay: number[]; bank: number[];
    /** 1 the first anchor's bank (the Taj's), 2 the second's (Mehtab Bagh's), 0 islands and the river. */
    side: number[];
    tank: number[]; seasonal: number[]; lst: (number | null)[]; trees: number[]; green: number[];
  };
  buildings: { rings: number[][]; h: number[]; src: number[]; cell: number[]; names: Record<string, string>; sources: string[] };
  streets: { pts: number[]; class: string; name?: string }[];
  rail: { pts: number[]; class: string }[];
  water: { subtype: string; rings: Rings }[];
  land_use: { class: string; name?: string; rings: Rings }[];
  landmarks: Record<string, [number, number]>;
  outlines: { mark: string; rings: Rings; reach_ha: number; zone_ha: number }[];
}

/** Which mark draws the line, as an index into brief.marks. */
export function lineIndex(brief: Brief): number {
  const k = brief.marks.findIndex((m) => m.id === brief.line);
  if (k < 0) throw new Error(`brief.line names no mark: ${brief.line}`);
  return k;
}

/** The can-change zone, per cell: land the mark's water reaches, except what stays. `released`
 *  marks cells a stakeholder has decided needn't stay (decisions.ts). */
export function zoneOf(place: Place, mark = lineIndex(place.brief), released?: Uint8Array | null): Uint8Array {
  const { band, stay } = place.cells;
  const z = new Uint8Array(band.length);
  for (let i = 0; i < band.length; i++) z[i] = band[i] >= 1 && band[i] <= mark + 1 && (!stay[i] || released?.[i]) ? 1 : 0;
  return z;
}

const STAY_APPLIES = new Set(["buildings_in_zone", "river", "limit"]);

/** What is wrong with a brief, in words. Nothing may claim a decision without someone behind it,
 *  and everything that stays says why and where that came from. */
export function checkBrief(b: Brief): string[] {
  const out: string[] = [];
  if (!b.marks.length) out.push("no river marks");
  for (let i = 1; i < b.marks.length; i++) if (b.marks[i].m <= b.marks[i - 1].m) out.push(`mark ${b.marks[i].id} is not above ${b.marks[i - 1].id}`);
  if (!b.marks.some((m) => m.id === b.line)) out.push(`the line names no mark: ${b.line}`);
  const seen = new Set<string>();
  for (const s of b.stays) {
    if (seen.has(s.id)) out.push(`two stays called ${s.id}`);
    seen.add(s.id);
    if (!s.why?.trim()) out.push(`${s.id}: no reason`);
    if (!s.status?.trim()) out.push(`${s.id}: no status`);
    if (s.source === null && s.status !== "assumed") out.push(`${s.id}: no source, so it must say "assumed"`);
    if (s.source !== null && !/^https?:\/\//.test(s.source)) out.push(`${s.id}: source is not a link`);
    if (s.applies && !STAY_APPLIES.has(s.applies)) out.push(`${s.id}: applies to something unknown (${s.applies})`);
    if (!s.rings && !s.applies) out.push(`${s.id}: neither a place on the map nor a rule`);
    if ((s.decision === null) !== (s.decided_by === null)) out.push(`${s.id}: a decision needs someone who made it`);
  }
  // Rules, records and views each say where they come from and how sure we are.
  for (const r of b.rules ?? []) {
    if (!/^https?:\/\//.test(r.source ?? "")) out.push(`rule ${r.id}: source is not a link`);
    if (!r.status?.trim() || !r.effect?.trim()) out.push(`rule ${r.id}: no status or effect`);
  }
  for (const r of b.records ?? []) if (!/^https?:\/\//.test(r.source ?? "")) out.push(`record ${r.date}: source is not a link`);
  for (const v of b.views ?? []) {
    if (!v.status?.trim()) out.push(`view ${v.id}: no status`);
    if (!v.target === !v.looks) out.push(`view ${v.id}: needs a target or a direction, not both or neither`);
  }
  return out;
}

/** The ground along a straight line, at each cell it passes: for drawing a real section. The
 *  river has no height here (the bed isn't measured), so z is null there. */
export function profile(place: Place, a: [number, number], b: [number, number], stepM = 20): { d: number; z: number | null; band: number }[] {
  const { x, y, z, band } = place.cells;
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const size = place.meta.cell_size;
  // Cells by coarse square, for lookups along the line.
  const key = (px: number, py: number) => `${Math.floor(px / (size * 2))},${Math.floor(py / (size * 2))}`;
  const grid = new Map<string, number[]>();
  for (let i = 0; i < x.length; i++) { const k = key(x[i], y[i]); (grid.get(k) ?? grid.set(k, []).get(k)!).push(i); }
  const out: { d: number; z: number | null; band: number }[] = [];
  for (let d = 0; d <= len; d += stepM) {
    const px = a[0] + (b[0] - a[0]) * d / len, py = a[1] + (b[1] - a[1]) * d / len;
    const cx = Math.floor(px / (size * 2)), cy = Math.floor(py / (size * 2));
    let best = -1, bestD = size * size * 4;
    for (let u = cx - 1; u <= cx + 1; u++) for (let v = cy - 1; v <= cy + 1; v++) for (const i of grid.get(`${u},${v}`) ?? []) {
      const q = (x[i] - px) ** 2 + (y[i] - py) ** 2;
      if (q < bestD) { bestD = q; best = i; }
    }
    if (best >= 0) out.push({ d, z: z[best] > 0 ? z[best] : null, band: band[best] });
  }
  return out;
}
