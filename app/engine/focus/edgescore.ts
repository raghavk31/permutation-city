// How a river-edge design does against today (docs/architecture-v3.md section 15.9, step E3). The same
// measures read both, each says where it came from, and any that depends on the river's level runs
// with the river a metre lower and higher: a design claims only what holds at all three.
import type { Line } from "../plan/geom.js";
import type { EdgeRead, Station } from "./edge.js";
import { existingAt, PLANT_M, type StretchFit, surfaceAt } from "./edgeform.js";
import type { Place } from "./place.js";
import { type Evidence, NEAR_STREET_M, WALK_10_M } from "./today.js";
import { Walk } from "./walk.js";

export const RISES = [-1, 0, 1];       // the river's level is known to about this, in metres
const SEAT_LO_M = 0.3, SEAT_HI_M = 0.6;   // a rise this high can be sat on
const LINK_EVERY_M = 150;              // a way in from a street at most this often where one's in reach
const TREE_MIN_M = 5;                  // planting this tall gives shade
const SAMPLE_M = 5;
const WATER_NEAR_M = 50;               // the water is this close to the bank in its wettest clear month
const REACH_ABOVE_M = 1;               // ground this far above an ordinary day's river still reaches it, near enough

export interface Score {
  key: string; words: string; unit: string; evidence: Evidence;
  /** null: nobody has measured this today, which isn't the same as none. */
  today: number | null; design: number | null;
  /** Across the river a metre lower and higher, where the level matters. */
  todayBand?: [number, number]; designBand?: [number, number];
  /** Which way is better; null: it's a cost or a fact to weigh. */
  better: "up" | "down" | null;
  note: string;
}

/** Days a year the river stands above a level, with the river `rise` metres higher than estimated. */
export function daysAbove(place: Place, z: number, rise = 0): number {
  const t = place.flow?.days;
  if (!t?.length) return 0;
  const at = z - rise;
  if (at <= t[0].z) return t[0].days;
  for (let i = 1; i < t.length; i++) if (at <= t[i].z) {
    const f = (at - t[i - 1].z) / (t[i].z - t[i - 1].z);
    return t[i - 1].days + f * (t[i].days - t[i - 1].days);
  }
  return t[t.length - 1].days;
}

interface At { t: Station; fit: StretchFit | null; k: number; surface: { d: number; z: number }[] }

function eachStation(read: EdgeRead, fits: StretchFit[]): At[] {
  const out: At[] = [];
  const byStretch = new Map(fits.map((f) => [f.stretch.id, f]));
  for (const b of read.banks) for (const s of b.stretches) {
    const fit = byStretch.get(s.id) ?? null;
    for (let k = s.stations[0]; k <= s.stations[1]; k++) {
      const t = b.stations[k], sec = fit?.sections.find((x) => x.k === k);
      const today = t.ground.filter((g) => g.d <= t.reach && g.z !== null).map((g) => ({ d: g.d, z: g.z! }));
      out.push({ t, fit, k, surface: sec && sec.vertices.length ? sec.vertices : today });
    }
  }
  return out;
}

const section = (a: At) => a.fit?.sections.find((x) => x.k === a.k) ?? null;

/** Open volume below a level over the usable ground, m³, per metre width of station spacing. */
function roomBelow(a: At, level: number): number {
  let sum = 0;
  for (let d = 0; d < a.t.reach; d += SAMPLE_M) {
    const z = a.surface.length ? surfaceAt(a.surface, d + SAMPLE_M / 2) : null;
    if (z !== null) sum += Math.max(0, level - z) * SAMPLE_M;
  }
  return sum;
}

/** Where people can walk at a station: the design's path, or a mapped line near the bank today. */
function walkPoint(a: At, net: Walk): { d: number; z: number; design: boolean } | null {
  const p = section(a)?.path;
  if (p) return { d: p.d, z: p.z, design: true };
  if (net.nearest(a.t.x, a.t.y, NEAR_STREET_M) < 0 || a.t.reach <= 0) return null;
  const d = a.t.reach / 2, z = existingAt(a.t, d);
  return z === null ? null : { d, z, design: false };
}

/** Tree cover over a walking point. Planted cover is the design's; what's there stays. */
function coverAt(a: At, d: number): number {
  const g = a.t.ground.reduce((p, q) => (Math.abs(q.d - d) < Math.abs(p.d - d) ? q : p), a.t.ground[0]);
  const there = g?.trees ?? 0;
  const e = section(a)?.elements.find((x) => d >= x.d0 && d <= x.d1);
  const planted = e?.planting && PLANT_M[e.planting] >= TREE_MIN_M ? a.fit!.shape.trees : 0;
  return 1 - (1 - there) * (1 - planted);
}

const band = (f: (rise: number) => number): { mid: number; band: [number, number] } => {
  const v = RISES.map(f);
  return { mid: f(0), band: [Math.min(...v), Math.max(...v)] };
};

const r0 = (v: number) => Math.round(v);
const r1 = (v: number) => Math.round(v * 10) / 10;

/** Today's streets and paths plus the design's paths, joined to the streets they pass. */
function networkWith(place: Place, stations: At[], base: Walk): { net: Walk; ways: number } {
  const lines: number[][] = place.streets.map((s) => s.pts);
  for (const a of stations) if (a.fit) for (const l of a.fit.lines) if (l.kind === "path") lines.push(flat(l.plan));
  let ways = 0, since = Infinity, lastBank = 0;
  for (const a of stations) {
    if (a.t.bank !== lastBank) { since = Infinity; lastBank = a.t.bank; }
    since += 50;
    const p = section(a)?.path;
    if (!p || since < LINK_EVERY_M) continue;
    const px = a.t.x + a.t.nx * p.d, py = a.t.y + a.t.ny * p.d;
    const node = base.nearestMain(px, py, a.t.reach - p.d + NEAR_STREET_M);
    if (node < 0) continue;
    lines.push([px, py, base.x[node], base.y[node]]);
    ways++;
    since = 0;
  }
  return { net: new Walk(lines), ways };
}

const flat = (l: Line) => l.flatMap((p) => [p[0], p[1]]);

/** Every measure, for today and for a design made of these fitted stretches. */
export function scoreEdge(place: Place, read: EdgeRead, fits: StretchFit[], base: Walk): Score[] {
  const none = eachStation(read, []), withD = eachStation(read, fits);
  const n = none.length, stepKm = 50 / 1000;

  const walkDays = (all: At[]) => (rise: number) => {
    let sum = 0;
    for (const a of all) { const w = walkPoint(a, base); if (w) sum += 365 - daysAbove(place, w.z, rise); }
    return sum / n;
  };
  const dT = band(walkDays(none)), dD = band(walkDays(withD));

  const marks = place.brief.marks;
  const room = (all: At[], m: number, rise: number) => all.reduce((s, a) => s + roomBelow(a, m + rise) * 50, 0);
  const recordM = marks[marks.length - 1].m;
  const gain = band((rise) => room(withD, recordM, rise) - room(none, recordM, rise));
  const worstLoss = Math.min(0, ...withD.map((a, i) => roomBelow(a, recordM) - roomBelow(none[i], recordM)));

  const pathStations = withD.filter((a) => section(a)?.path);
  let longest = 0, run = 0, lastK = -2, lastB = 0;
  for (const a of withD) {
    const on = !!section(a)?.path && a.k === lastK + 1 && a.t.bank === lastB;
    if (section(a)?.path) { run = on ? run + 1 : 1; longest = Math.max(longest, run); } else run = 0;
    lastK = a.k; lastB = a.t.bank;
  }

  const { net, ways } = networkWith(place, withD, base);
  const buildingsNear = (w: Walk, starts: { x: number; y: number }[]) => {
    const src = new Set<number>();
    // On the joined network: a length of path that joins nothing is no way to reach anyone.
    for (const p of starts) { const k = w.nearestMain(p.x, p.y, NEAR_STREET_M); if (k >= 0) src.add(k); }
    if (!src.size) return 0;
    const dist = w.from([...src], WALK_10_M);
    let near = 0, all = 0;
    place.buildings.rings.forEach((ring, b) => {
      if (place.buildings.cell[b] < 0) return;
      all++;
      let x = 0, y = 0;
      for (let i = 0; i < ring.length; i += 2) { x += ring[i]; y += ring[i + 1]; }
      const node = w.nearestMain(x / (ring.length / 2), y / (ring.length / 2), 60);
      if (node >= 0 && dist[node] <= WALK_10_M) near++;
    });
    return (100 * near) / Math.max(1, all);
  };
  // A design's starting points are today's and its path's: a path adds ways to the edge, and replaces none.
  const todayStarts = none.flatMap((a) => {
    if (!walkPoint(a, base)) return [];
    const k = base.nearestMain(a.t.x, a.t.y, NEAR_STREET_M);
    return k >= 0 ? [{ x: base.x[k], y: base.y[k] }] : [];
  });
  const pathStarts = withD.flatMap((a) => { const p = section(a)?.path; return p ? [{ x: a.t.x + a.t.nx * p.d, y: a.t.y + a.t.ny * p.d }] : []; });
  const nearT = buildingsNear(base, todayStarts), nearD = buildingsNear(net, [...todayStarts, ...pathStarts]);

  const walkBetween = (w: Walk) => {
    const link = place.brief.links.find((l) => /Fort/.test(l.words));
    const a = link && place.landmarks[link.from], b = link && place.landmarks[link.to];
    if (!a || !b) return null;
    const na = w.nearestMain(a[0], a[1], 300), nb = w.nearestMain(b[0], b[1], 300);
    if (na < 0 || nb < 0) return null;
    const d = w.from([na])[nb];
    return Number.isFinite(d) ? d : null;
  };

  // A way along, the water close by, and ground at the bank that comes down to an ordinary day's river.
  const ordinary = read.datum.ordinary?.[1] ?? -Infinity;
  const toWater = (all: At[]) => (rise: number) => all.filter((a) => {
    const foot = a.surface[0]?.z;
    return walkPoint(a, base) && a.t.toWaterHigh !== null && a.t.toWaterHigh <= WATER_NEAR_M && foot !== undefined && foot <= ordinary + REACH_ABOVE_M + rise;
  }).length * stepKm;
  const waterT = band(toWater(none)), waterD = band(toWater(withD));
  const dug = withD.filter((a) => section(a)?.face).length * stepKm;

  const shadeOver = (all: At[]) => {
    let sum = 0, count = 0;
    for (const a of all) { const w = walkPoint(a, base); if (w) { sum += coverAt(a, w.d); count++; } }
    return count ? (100 * sum) / count : 0;
  };

  let seats = 0, planted = 0, paved = 0, cut = 0, fill = 0, netEarth = 0, margin = Infinity, viewsHold = true;
  for (const f of fits) {
    cut += f.cut; fill += f.fill; netEarth += f.net;
    const v = f.checks.find((c) => c.id === "views");
    if (v && !v.holds) viewsHold = false;
    const len = f.stretch.length / Math.max(1, f.sections.length);
    for (const s of f.sections) for (const e of s.elements) {
      const w = e.d1 - e.d0;
      if (e.planting) planted += (w * len * f.shape.trees) / 1e4;
      if (e.works === "hard") paved += (w * len) / 1e4;
      const rise = e.z1 - e.z0;
      if ((e.kind === "wall" || e.kind === "bank") && rise >= SEAT_LO_M && rise <= SEAT_HI_M) seats += len;
    }
  }
  for (const a of withD) if (section(a)?.path && a.t.view !== null) margin = Math.min(margin, a.t.view);

  // COPY: the measures a design is held to
  return [
    { key: "days_walkable", words: "Days a year you can walk the edge", unit: "days", evidence: "estimate", better: "up",
      today: r0(dT.mid), design: r0(dD.mid), todayBand: [r0(dT.band[0]), r0(dT.band[1])], designBand: [r0(dD.band[0]), r0(dD.band[1])],
      note: `Averaged along both banks, counting 0 where there's no way along at all. From modelled river flow tied to reported levels, so rough${place.flow ? `: the fit misses reported floods by up to ${Math.max(...place.flow.anchors.map((x) => Math.abs(x.miss)))} m` : ""}. Today's counts any mapped line within ${NEAR_STREET_M} m of the bank, whether or not you may walk it.` },
    { key: "flood_room", words: "More room for flood water", unit: "m³", evidence: "estimate", better: "up",
      today: 0, design: r0(gain.mid), designBand: [r0(gain.band[0]), r0(gain.band[1])],
      note: `Below the record flood, over the usable ground only. It's a volume, not a hydraulic model, so it says nothing about flood heights. The tightest single section ${worstLoss < -0.5 ? `loses ${r0(-worstLoss)} m² of cross-section` : "loses none"}: earth is balanced over a stretch, not in each section.` },
    { key: "path_km", words: "Path along the river", unit: "km", evidence: "map", better: "up",
      today: null, design: r1(pathStations.length * stepKm),
      note: `Longest unbroken run ${r1(longest * stepKm)} km. Today's isn't counted: the map can't say which lines along the bank you may walk. Nothing passes the Taj's own stretch without a decision there.` },
    { key: "ways_in", words: "Ways in from a street", unit: "", evidence: "map", better: "up",
      today: null, design: ways, note: `At most one per ${LINK_EVERY_M} m, from the nearest mapped street. Gates and fences aren't on the map.` },
    { key: "buildings_10", words: "Buildings within a 10-minute walk of the edge", unit: "%", evidence: "map", better: "up",
      today: r0(nearT), design: r0(nearD), note: "On the mapped streets and paths, plus the design's path and ways in." },
    { key: "fort_taj", words: "Taj Mahal to Agra Fort, on foot", unit: "m", evidence: "map", better: "down",
      today: nullable(walkBetween(base)), design: nullable(walkBetween(net)), note: "By the shortest way on the mapped lines and the design's path." },
    { key: "to_water", words: "Bank you can walk down to the water", unit: "km", evidence: "estimate", better: "up",
      today: r1(waterT.mid), design: r1(waterD.mid), todayBand: [r1(waterT.band[0]), r1(waterT.band[1])], designBand: [r1(waterD.band[0]), r1(waterD.band[1])],
      note: `Where there's a way along, the water is within ${WATER_NEAR_M} m and the ground comes within ${REACH_ABOVE_M} m of an ordinary day's river. ${r1(dug)} km of that is the bank's face dug back. Most of the bank near the water has trees on it, which stay, so this stays short. The terrain barely shows this drop, so it needs a survey.` },
    { key: "shade", words: "Tree cover along the way", unit: "%", evidence: "estimate", better: "up",
      today: r0(shadeOver(none)), design: r0(shadeOver(withD)), note: "Cover overhead, standing in for hot-afternoon shade: the street-shade model reads streets and buildings, not this." },
    { key: "seats", words: "Edges to sit on", unit: "m", evidence: "estimate", better: "up",
      today: null, design: r0(seats), note: `Rises of ${SEAT_LO_M} to ${SEAT_HI_M} m along the bank. Today's aren't measured.` },
    { key: "planted", words: "New planting, as cover", unit: "ha", evidence: "estimate", better: "up",
      today: 0, design: r1(planted), note: "Trees, shrubs, grass or reeds by how often it's wet, at the design's cover. Species come later. Much of this ground is farmed or used today: the map doesn't say by whom, so planting it is a question for stakeholders." },
    { key: "paved", words: "Hard ground and walls", unit: "ha", evidence: "estimate", better: "down",
      today: null, design: r1(paved), note: "Stone and faced banks. None in the lawful design. Today's isn't measured." },
    { key: "earth_moved", words: "Earth moved", unit: "m³", evidence: "estimate", better: "down",
      today: 0, design: r0(cut + fill), note: `${r0(cut)} m³ dug, ${r0(fill)} m³ placed, ${r0(Math.max(0, -netEarth))} m³ to take away from the floodplain. Terrain is too rough for quantities: this compares designs, it doesn't price one.` },
    { key: "views_kept", words: "Tightest view limit on the path", unit: "m", evidence: "estimate", better: null,
      today: null, design: margin === Infinity ? null : r1(margin), note: viewsHold ? "Every view's limit holds along every section." : "A view's limit breaks: see the stretch's checks." },
  ];
}

const nullable = (v: number | null) => (v === null ? null : r0(v));
