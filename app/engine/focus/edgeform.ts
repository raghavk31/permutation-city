// A section on real ground (docs/architecture-v3.md section 15.9, step E2). A shape from the river-edge
// family becomes levels, treads and banks fitted to a stretch of bank: how far and how far down are read
// from the place, the rest are genes. Every limit is checked on the result, not assumed. A level is a
// design level relative to the others: the ground under it is satellite terrain, so a survey comes first.
import { type Line, smoothTrace } from "../plan/geom.js";
import { clampShape, edgeSection, type Shape } from "../typology/openshape.js";
import type { EdgeRead, Station, Stretch } from "./edge.js";
import { lineIndex, type Place } from "./place.js";

/** soft: the lawful design. hard: a what-if. Neither puts up a building. */
export type Works = "soft" | "hard";
/** reshape: levels are cut. plant: the ground stays and only planting is added. none: no room. */
export type Mode = "reshape" | "plant" | "none";

export const TREE_HOLD = 0.05;    // a cell with this much tree cover keeps its ground: only cover is known, not single trees
export const SOFT_BANK = 1 / 3;   // no steeper than this without stone: Buffalo Bayou's planted 1 in 2 failed in places in Harvey
export const PATH_M = 2.4;        // a path's width: the least footpath of a street that's also a place (plan/streetroles.ts)
const MIN_WINDOW_M = 15;          // less free ground than this isn't worth reshaping
const MIN_TREAD_M = 3;            // a level narrower than this is only a step in a bank (assumed)
const PATH_ABOVE_M = 1;           // a path stands this far above an ordinary day's river, at least (assumed)
const STEP_M = 1;                 // how finely earth is added up
const LEVEL_TOL_M = 0.05;         // differences under this aren't earthworks
const TREE_M = 10, SHRUB_M = 3, GRASS_M = 0.5, REED_M = 2;   // grown heights, assumed until species are chosen (F6)
const BISECT = 14;
const FACE_WATER_M = 50;           // the bank's face is regraded only where the water is this near: further off, it's sand, and the bed stays
const MIN_FREE_SHARE = 0.5;       // a stretch reshapes only if this much of it can take the levels (assumed)
const PATH_SMOOTH_M = 30;

export type Planting = "wet meadow and reeds" | "flood-tolerant trees" | "dry-ground trees" | "shrubs" | "grass";
export const PLANT_M: Record<Planting, number> = { "wet meadow and reeds": REED_M, "flood-tolerant trees": TREE_M, "dry-ground trees": TREE_M, shrubs: SHRUB_M, grass: GRASS_M };

export interface Element {
  kind: "tread" | "bank" | "wall" | "kept";
  /** none: existing ground. */
  works: "none" | Works;
  /** Metres from the bank, d0 nearer the water. */
  d0: number; d1: number; z0: number; z1: number;
  /** The first of the brief's marks that wets it; -1: an ordinary day's river does; null: none. */
  floodsAt: number | null;
  planting: Planting | null;
}

export interface SectionFit {
  /** Index into the bank's stations. */
  k: number;
  mode: Mode;
  /** The ground being reshaped, metres from the bank; null if none is. */
  window: [number, number] | null;
  /** The design's surface, water side first, from the bank to the usable ground's end. */
  vertices: { d: number; z: number }[];
  elements: Element[];
  path: { d: number; z: number } | null;
  cut: number; fill: number;
  /** Earth added minus taken, below the line, per metre of bank. */
  net: number;
  /** The bank's face is dug back, so the section ends at an ordinary day's river instead of today's ground. */
  face: boolean;
}

export interface Check { id: string; words: string; holds: boolean; found: string }
export interface StretchLine { kind: "level" | "path"; z: number | null; plan: Line }

export interface StretchFit {
  stretch: Stretch; works: Works; mode: Mode; shape: Shape;
  /** The stretch's levels, street first, metres. */
  levels: number[];
  sections: SectionFit[];
  /** Whole stretch, m³. */
  cut: number; fill: number; net: number;
  lines: StretchLine[];
  checks: Check[];
  /** What this rests on, in words. */
  notes: string[];
}

/** Ground at a distance from the bank, from the section's readings. */
export function existingAt(t: Station, d: number): number | null {
  const g = t.ground;
  for (let i = 1; i < g.length; i++) if (d <= g[i].d) {
    const a = g[i - 1], b = g[i];
    if (a.z === null || b.z === null) return a.z ?? b.z;
    return a.z + ((b.z - a.z) * (d - a.d)) / (b.d - a.d);
  }
  return g.length ? g[g.length - 1].z : null;
}

/** The surface at a distance, from vertices in order of distance. */
export function surfaceAt(v: { d: number; z: number }[], d: number): number {
  if (d <= v[0].d) return v[0].z;
  for (let i = 1; i < v.length; i++) if (d <= v[i].d) {
    const span = v[i].d - v[i - 1].d;
    return span > 0 ? v[i - 1].z + ((v[i].z - v[i - 1].z) * (d - v[i - 1].d)) / span : v[i].z;
  }
  return v[v.length - 1].z;
}

/** The longest run of ground with a reading and no trees on it. */
export function freeWindow(t: Station): [number, number] | null {
  let best: [number, number] | null = null, from: number | null = null, last = 0;
  const end = () => { if (from !== null && (!best || last - from > best[1] - best[0])) best = [from, last]; from = null; };
  for (const g of t.ground) {
    if (g.d > t.reach) break;
    if (g.z === null || (g.trees ?? 0) >= TREE_HOLD) { end(); continue; }
    if (from === null) from = g.d;
    last = g.d;
  }
  end();
  return best && (best as [number, number])[1] - (best as [number, number])[0] >= MIN_WINDOW_M ? best : null;
}

interface Budget { line: number; ordinary: number; marks: number[]; viewHeight: number | null }

const floods = (z: number, b: Budget): number | null => {
  if (z <= b.ordinary) return -1;
  const k = b.marks.findIndex((m) => z <= m);
  return k < 0 ? null : k;
};

/** What can grow here: by how often it's wet, and under what a view allows. */
function plantingAt(z: number, raised: number, b: Budget, trees: number): Planting | null {
  if (trees <= 0) return null;
  const wet = z <= b.ordinary + PATH_ABOVE_M;
  const wanted: Planting = wet ? "wet meadow and reeds" : z <= b.line ? "flood-tolerant trees" : "dry-ground trees";
  if (b.viewHeight === null) return wanted;
  const room = b.viewHeight - raised;
  if (PLANT_M[wanted] <= room) return wanted;
  return SHRUB_M <= room ? "shrubs" : GRASS_M <= room ? "grass" : null;
}

/** The ground left as it is, with planting added. */
function keptSection(t: Station, k: number, mode: Mode, b: Budget, trees: number): SectionFit {
  const vertices = t.ground.filter((g) => g.d <= t.reach && g.z !== null).map((g) => ({ d: g.d, z: g.z! }));
  const z0 = vertices[0]?.z ?? 0, z1 = vertices[vertices.length - 1]?.z ?? z0, mid = (z0 + z1) / 2;
  const elements: Element[] = vertices.length > 1 ? [{ kind: "kept", works: "none", d0: 0, d1: t.reach, z0, z1, floodsAt: floods(mid, b), planting: plantingAt(mid, 0, b, trees) }] : [];
  return { k, mode, window: null, vertices, elements, path: null, cut: 0, fill: 0, net: 0, face: false };
}

interface Plan { t: Station; k: number; a: number; b: number; toe: number; top: number; tiers: number; face: number | null }

/** A section's vertices and elements for levels `z`, or null if they don't fit its ground. */
function reshape(plan: Plan, shape: Shape, zs: number[], works: Works, budget: Budget): SectionFit | null {
  const { t, k, a, b, toe, top } = plan, W = b - a, n = zs.length, foot = plan.face ?? toe;
  const levels: number[] = [];
  for (let i = 0; i < n; i++) levels.push(Math.max(toe, Math.min(i ? levels[i - 1] : top, zs[i])));
  // Falls: into each level from above, and out of the last to the foot.
  const falls = levels.map((z, i) => (i ? levels[i - 1] : top) - z).concat(levels[n - 1] - foot);
  const wall = works === "hard" ? shape.wall : 0, slope = works === "hard" ? shape.bank : Math.min(shape.bank, SOFT_BANK);
  const runs = falls.map((f) => (f * (1 - wall)) / slope);
  const level = W - runs.reduce((p, q) => p + q, 0);
  if (level < n * MIN_TREAD_M) return plan.face !== null ? reshape({ ...plan, face: null }, shape, zs, works, budget) : null;
  const tiers = edgeSection({ ...shape, reach: W, drop: Math.max(top - toe, 0.1), tiers: n });
  const shareSum = tiers.reduce((p, q) => p + q.tread, 0) || 1;
  const treads = tiers.map((q) => Math.max(MIN_TREAD_M, (q.tread / shareSum) * level));
  const over = treads.reduce((p, q) => p + q, 0) - level;
  if (over > 0) { const big = treads.indexOf(Math.max(...treads)); treads[big] -= over; }

  // Inland first, then turned round so the water comes first.
  const inland: { d: number; z: number }[] = [{ d: b, z: top }];
  const elements: Element[] = [];
  let d = b, z = top;
  const stoneTread = works === "hard" && shape.trees < 0.15;
  const addFall = (i: number) => {
    const to = i < n ? levels[i] : foot;
    if (falls[i] <= 1e-9) return;
    const run = runs[i], isWall = works === "hard" && wall > 0.5;
    const stone = isWall || falls[i] / run > SOFT_BANK + 1e-6;   // too steep to stay up as earth, so it's faced
    d -= run;
    inland.push({ d, z: to });
    const mid = (z + to) / 2;
    elements.push({ kind: isWall ? "wall" : "bank", works: stone ? "hard" : "soft", d0: d, d1: d + run, z0: to, z1: z, floodsAt: floods(mid, budget),
      planting: null });
    z = to;
  };
  for (let i = 0; i < n; i++) {
    addFall(i);
    d -= treads[i];
    inland.push({ d, z });
    elements.push({ kind: "tread", works: stoneTread ? "hard" : "soft", d0: d, d1: d + treads[i], z0: z, z1: z, floodsAt: floods(z, budget), planting: null });
  }
  addFall(n);
  const middle = inland.reverse();

  // Ground outside the window stays, and its planting is added.
  const before = t.ground.filter((g) => g.d < a && g.z !== null).map((g) => ({ d: g.d, z: g.z! }));
  const after = t.ground.filter((g) => g.d > b && g.d <= t.reach && g.z !== null).map((g) => ({ d: g.d, z: g.z! }));
  for (const [from, to, set] of [[0, a, before], [b, t.reach, after]] as const) {
    if (to - from < 1 || !set.length) continue;
    const zm = set[Math.floor(set.length / 2)].z;
    elements.push({ kind: "kept", works: "none", d0: from, d1: to, z0: set[0].z, z1: set[set.length - 1].z, floodsAt: floods(zm, budget), planting: null });
  }
  elements.sort((p, q) => p.d0 - q.d0);
  const vertices = [...before, ...middle, ...after];
  // What grows on each piece, now the surface is known: a view counts what's raised under it too.
  for (const e of elements) {
    if (e.kind === "wall" || (e.kind === "tread" && stoneTread)) continue;
    e.planting = plantingAt((e.z0 + e.z1) / 2, raisedOver(t, vertices, e.d0, e.d1), budget, shape.trees);
  }
  const sums = earth(t, vertices, a, b, budget.line);
  return { k, mode: "reshape", window: [a, b], vertices, elements, path: null, ...sums, face: plan.face !== null };
}

/** The most the surface stands above today's ground along a piece. */
function raisedOver(t: Station, v: { d: number; z: number }[], d0: number, d1: number): number {
  let most = 0;
  for (let d = d0; d <= d1; d += STEP_M) { const e = existingAt(t, d); if (e !== null) most = Math.max(most, surfaceAt(v, d) - e); }
  return most;
}

/** Earth moved in a section, per metre of bank; `net` counts only what's below the line. */
function earth(t: Station, v: { d: number; z: number }[], a: number, b: number, line: number) {
  let cut = 0, fill = 0, net = 0;
  for (let d = a; d < b; d += STEP_M) {
    const e = existingAt(t, d + STEP_M / 2), s = surfaceAt(v, d + STEP_M / 2);
    if (e === null) continue;
    if (s > e) fill += (s - e) * STEP_M; else cut += (e - s) * STEP_M;
    net += (Math.min(s, line) - Math.min(e, line)) * STEP_M;
  }
  return { cut, fill, net };
}

const mid = (v: number[]) => { const s = [...v].sort((p, q) => p - q); return s[Math.floor((s.length - 1) / 2)]; };

/** Fit a shape to a stretch. The levels hold along the stretch, as a terrace does, and sink together
 *  until no earth is added below the line. What can't take them keeps its ground. */
export function fitStretch(place: Place, read: EdgeRead, bankId: number, stretchId: string, shape0: Shape, works: Works): StretchFit {
  const bank = read.banks.find((b) => b.id === bankId);
  const stretch = bank?.stretches.find((s) => s.id === stretchId);
  if (!bank || !stretch) throw new Error(`no stretch ${stretchId} on bank ${bankId}`);
  const marks = place.brief.marks.map((m) => m.m), line = marks[lineIndex(place.brief)];
  const ordinary = read.datum.ordinary ? read.datum.ordinary[1] : Math.min(...marks);
  const stations = bank.stations.slice(stretch.stations[0], stretch.stations[1] + 1);
  const span = stations.map((t, i) => ({ t, k: stretch.stations[0] + i }));
  const shape = clampShape("edge", shape0);
  const budget = (t: Station): Budget => ({ line, ordinary, marks, viewHeight: t.view });
  const lawOnlyPlants = stretch.law === "prohibited" && works === "soft";
  const hardHere = works === "hard" && stretch.law !== "prohibited";   // nothing hard beside a monument, even as a what-if
  const worksHere: Works = hardHere ? "hard" : "soft";

  const plans: Plan[] = [];
  if (stretch.room !== "none" && !lawOnlyPlants) for (const { t, k } of span) {
    const w = freeWindow(t);
    if (!w) continue;
    const toe = existingAt(t, w[0]), top = existingAt(t, w[1]);
    if (toe === null || top === null || top <= toe) continue;   // ground falling away from the river is left as it is
    // Down the bank's face to the water, in earth only, where the water is close and nothing's in the way.
    const near = t.toWaterHigh !== null && t.toWaterHigh <= FACE_WATER_M && w[0] === 0 && toe > ordinary;
    plans.push({ t, k, a: w[0], b: w[1], toe, top, tiers: 0, face: near ? ordinary : null });
  }

  const keepAll = (mode: Mode) => span.map(({ t, k }) => keptSection(t, k, mode, budget(t), mode === "none" ? 0 : shape.trees));
  let sections: SectionFit[] = [], levels: number[] = [];
  let mode: Mode = stretch.room === "none" ? "none" : "plant";
  // A stretch reshapes as one, or not at all: a single free section isn't a terrace, only a big hole.
  if (plans.length >= MIN_FREE_SHARE * span.length) {
    const T = mid(plans.map((p) => p.top)), B = mid(plans.map((p) => p.toe)), W = mid(plans.map((p) => p.b - p.a));
    // As many of the shape's levels as the middle of the stretch has room for.
    const fracsFor = (n: number) => { const q = edgeSection({ ...shape, reach: W, drop: Math.max(T - B, 0.1), tiers: n }); return q.map((u) => u.z / Math.max(T - B, 0.1)); };
    const build = (n: number, sink: number) => {
      const zs = fracsFor(n).map((f) => B + f * (T - B) - sink);
      return { zs, fits: plans.map((p) => reshape(p, shape, zs, worksHere, budget(p.t))) };
    };
    let n = Math.round(shape.tiers), trial = build(n, 0);
    const enough = (fits: (SectionFit | null)[]) => fits.filter(Boolean).length >= MIN_FREE_SHARE * span.length;
    while (n > 1 && !enough(trial.fits)) { n--; trial = build(n, 0); }
    const netOf = (fits: (SectionFit | null)[]) => fits.reduce((a, f) => a + (f ? f.net : 0), 0);
    if (enough(trial.fits)) {
      if (netOf(trial.fits) > 0) {
        // Sink the levels together until nothing is added below the line.
        let lo = 0, hi = Math.max(T - B, 0.1);
        for (let i = 0; i < BISECT; i++) {
          const at = (lo + hi) / 2;
          if (netOf(build(n, at).fits) > 0) lo = at; else hi = at;
        }
        trial = build(n, hi);
      }
      if (netOf(trial.fits) <= 0) {
        levels = trial.zs;
        const byK = new Map(plans.map((p, i) => [p.k, trial.fits[i]]));
        sections = span.map(({ t, k }) => byK.get(k) ?? keptSection(t, k, "plant", budget(t), shape.trees));
        mode = "reshape";
      }
    }
  }
  if (!sections.length) sections = keepAll(mode);

  // The path: on the lowest level clear of an ordinary day's river, or at grade, never beside a monument's own ground.
  const pathLevel = levels.length ? [...levels].reverse().find((z) => z >= ordinary + PATH_ABOVE_M) ?? levels[0] : null;
  if (mode !== "none" && !lawOnlyPlants) for (const s of sections) {
    const t = span[s.k - stretch.stations[0]].t;
    const onLevel = s.mode === "reshape" && pathLevel !== null
      ? s.elements.find((e) => e.kind === "tread" && Math.abs(e.z0 - pathLevel) < 0.5 && e.d1 - e.d0 >= PATH_M) ?? s.elements.filter((e) => e.kind === "tread" && e.d1 - e.d0 >= PATH_M).sort((p, q) => Math.abs(p.z0 - pathLevel) - Math.abs(q.z0 - pathLevel))[0] : undefined;
    if (onLevel) s.path = { d: (onLevel.d0 + onLevel.d1) / 2, z: onLevel.z0 };
    else if (t.reach >= PATH_M) { const d = t.reach / 2, z = existingAt(t, d); if (z !== null) s.path = { d, z }; }
  }

  const len = stretch.length / Math.max(1, span.length);
  const cut = sections.reduce((a, s) => a + s.cut * len, 0), fill = sections.reduce((a, s) => a + s.fill * len, 0), net = sections.reduce((a, s) => a + s.net * len, 0);

  // Lines along the stretch: where each level's tread begins, and the path.
  const lines: StretchLine[] = [];
  const along = (pick: (s: SectionFit, t: Station) => number | null) => {
    const pts: Line = [];
    for (const s of sections) { const t = span[s.k - stretch.stations[0]].t, d = pick(s, t); if (d !== null) pts.push([t.x + t.nx * d, t.y + t.ny * d]); }
    return pts.length > 1 ? smoothTrace(pts, PATH_SMOOTH_M) : null;
  };
  levels.forEach((z) => {
    const plan = along((s) => s.elements.find((e) => e.kind === "tread" && Math.abs(e.z0 - z) < 0.5)?.d1 ?? null);
    if (plan) lines.push({ kind: "level", z, plan });
  });
  const pathPlan = along((s) => s.path?.d ?? null);
  if (pathPlan) lines.push({ kind: "path", z: pathLevel, plan: pathPlan });

  const fit: StretchFit = { stretch, works: worksHere, mode, shape, levels, sections, cut, fill, net, lines, checks: [], notes: [] };
  fit.checks = checkFit(fit, span.map((x) => x.t), { lawOnlyPlants, ordinary, line });
  if (mode === "none") fit.notes.push("There's no room here, so the design leaves this stretch as it is.");
  if (lawOnlyPlants) fit.notes.push("Next to a monument: the lawful design only plants, and adds no path.");
  else if (works === "hard" && stretch.law === "prohibited") fit.notes.push("Next to a monument: even as a what-if, nothing here is hard.");
  if (sections.some((s) => s.face)) fit.notes.push("The bank's face is dug back to an ordinary day's river. The terrain barely shows this drop, so these are the least certain levels here and need a survey.");
  if (worksHere === "soft" && mode !== "none") fit.notes.push("Assumes planting, earth paths and reshaping with no earth added aren't construction. Nobody has read that in the rules yet.");
  if (worksHere === "hard") fit.notes.push("A what-if: stone and walls aren't allowed by the rules as reported.");
  if (stretch.law === "regulated" && mode !== "none") fit.notes.push("Near a monument: this would need permission.");
  if (mode === "plant" && !lawOnlyPlants && stretch.room !== "none") fit.notes.push("The ground here can't take these levels (trees, or too steep or flat for them), so it stays as it is.");
  return fit;
}

/** Each limit, measured on the finished stretch. */
function checkFit(fit: StretchFit, stations: Station[], o: { lawOnlyPlants: boolean; ordinary: number; line: number }): Check[] {
  let intoRiver = 0, beyond = 0, overView = 0, treeLost = 0, steep = 0, hardWorks = 0, worstView = Infinity;
  fit.sections.forEach((s, i) => {
    const t = stations[i];
    for (const e of s.elements) {
      if (e.d0 < -1e-6) intoRiver++;
      if (e.d1 > t.reach + 1e-6) beyond++;
      if (e.works === "hard") hardWorks++;
      if (e.kind === "bank" && e.works === "soft") { const run = e.d1 - e.d0; if (run > 0 && (e.z1 - e.z0) / run > SOFT_BANK + 1e-6) steep++; }
      if (t.view !== null) {
        const over = raisedOver(t, s.vertices, e.d0, e.d1) + (e.planting ? PLANT_M[e.planting] : 0);
        if (over > t.view + 1e-6) overView++;
        worstView = Math.min(worstView, t.view - over);
      }
    }
    for (const g of t.ground) {
      if (g.d > t.reach || g.z === null || (g.trees ?? 0) < TREE_HOLD || !s.window) continue;
      if (Math.abs(surfaceAt(s.vertices, g.d) - g.z) > LEVEL_TOL_M && g.d > s.window[0] && g.d < s.window[1]) treeLost++;
    }
  });
  const m3 = (v: number) => Math.round(v).toLocaleString("en-IN");
  // COPY: the limits a section is held to
  return [
    { id: "river", words: "Stays out of the river", holds: intoRiver === 0, found: intoRiver ? `${intoRiver} pieces reach past the bank.` : "Nothing passes the mapped bank." },
    { id: "buildings", words: "Touches no building, street or monument", holds: beyond === 0, found: beyond ? `${beyond} pieces pass the end of the usable ground.` : "Everything stops where the usable ground ends." },
    { id: "earth", words: "Adds no earth below the record flood", holds: fit.net <= 1, found: `${m3(fit.cut)} m³ dug, ${m3(fit.fill)} m³ placed, so ${m3(Math.max(0, -fit.net))} m³ more room for water than today.` },
    { id: "views", words: "Under every view's limit", holds: overView === 0, found: overView ? `${overView} pieces stand too high.` : worstView === Infinity ? "No view sets a limit here." : `${worstView.toFixed(1)} m to spare at the tightest.` },
    { id: "trees", words: "Loses no tree cover", holds: treeLost === 0, found: treeLost ? `${treeLost} readings with trees would be reshaped.` : "Ground with trees on it keeps its level." },
    { id: "banks", words: "Earth banks no steeper than 1 in 3", holds: steep === 0, found: steep ? `${steep} banks are too steep.` : "Buffalo Bayou's banks failed in places at 1 in 2." },
    { id: "law", words: o.lawOnlyPlants ? "Only plants, beside a monument" : fit.works === "soft" ? "Nothing hard in the lawful design" : "A what-if, labelled",
      holds: fit.works === "hard" || hardWorks === 0, found: fit.works === "hard" ? "Stone or walls here go beyond the rules as reported." : hardWorks ? `${hardWorks} hard pieces.` : "Planting, earth paths and reshaping only." },
  ];
}
