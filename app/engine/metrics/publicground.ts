// Public ground's scores (architecture-v3 section 14.7, step P5): stand-ins for Gehl's quality
// criteria and NACTO's street guidance, read off the plan the rules placed (plan/shared.ts,
// streetroles.ts, publicform.ts). None is a measurement of public life, which Gehl counts on the
// street; each says what the design gives that public life needs.
//
//   storm held          protection: of the water the public spaces were placed to hold, the share
//                       their shapes hold
//   usable in a storm   protection: of the public ground that holds water, the share still usable
//                       when it is full (area-weighted)
//   places to sit       sitting: steps and banks low enough to sit on, metres per hectare of public space
//   shade on streets    good climate: share of street width in shade on hot afternoons
//   doors on spaces     standing and staying: share of the public spaces' edges with building
//                       plots on them (doors and windows onto the space)
//   canopy cover        3-30-300's thirty: tree crowns over the design ground (lots, public
//                       spaces, streets)
//   safe to walk        protection from traffic: street length where every footpath is at least
//                       its role's clear path (GSDG), or the street is shared at walking pace
import { ROLES, CROWN_REACH_M, CROWN_SHADE, TREE_STRIP_M, type RoleKey } from "../plan/streetroles.js";
import type { Net } from "./network.js";

type Plan = NonNullable<Net["d"]["plan"]>;
const len = (l: [number, number][]) => { let s = 0; for (let k = 1; k < l.length; k++) s += Math.hypot(l[k][0] - l[k - 1][0], l[k][1] - l[k - 1][1]); return s; };
const spacesOf = (p: Plan) => p.shared?.spaces ?? [];

export function stormHeld(net: Net): number {
  const w = net.d.plan?.shared?.water;
  if (!w || w.need <= 0) return 1;
  // what the spaces there are hold, against what they were placed for (a space taken away
  // leaves its rain unheld)
  let held = 0;
  for (const s of spacesOf(net.d.plan!)) if (s.need) held += s.storage;
  return Math.min(1, held / w.need);
}

export function stormUsable(net: Net): number {
  let a = 0, u = 0;
  for (const s of net.d.plan ? spacesOf(net.d.plan) : []) if (s.need && s.measures) { a += s.area; u += s.area * s.measures.wetUse; }
  return a ? u / a : 1;
}

export function placesToSit(net: Net): number {
  let a = 0, m = 0;
  for (const s of net.d.plan ? spacesOf(net.d.plan) : []) { a += s.area; if (s.measures) m += (s.measures.seats * s.area) / 100; }
  return a ? m / (a / 1e4) : 0;
}

export function streetShade(net: Net): number {
  let L = 0, s = 0;
  for (const st of net.d.plan?.streets ?? []) { if (st.shade === undefined) continue; const l = len(st.pts); L += l; s += l * st.shade; }
  return L ? s / L : 0;
}

/** Share of the public spaces' plot edges (sampled at each edge's middle) with a building plot's
 *  centre within DOOR_M: a building faces the space there. */
export const DOOR_M = 30;
export function doorsOnSpaces(net: Net): number {
  const plan = net.d.plan;
  if (!plan) return 0;
  const built = plan.plots.map((p, k) => k).filter((k) => plan.plots[k].use === 1);
  const cen = built.map((k) => { const r = plan.plots[k].ring; let x = 0, y = 0; for (const q of r) { x += q[0]; y += q[1]; } return [x / r.length, y / r.length]; });
  let all = 0, door = 0;
  for (const s of spacesOf(plan)) for (const k of s.plots) {
    const r = plan.plots[k]?.ring;
    if (!r) continue;
    for (let e = 0; e < r.length; e++) {
      const a = r[e], b = r[(e + 1) % r.length], l = Math.hypot(b[0] - a[0], b[1] - a[1]), m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      all += l;
      if (cen.some((c) => Math.hypot(c[0] - m[0], c[1] - m[1]) <= DOOR_M)) door += l;
    }
  }
  return all ? door / all : 0;
}

export function canopyCover(net: Net): number {
  const { G, d } = net, plan = d.plan;
  let land = 0, crowns = 0;
  for (let i = 0; i < G.n; i++) { land += G.cellArea; if (d.nature) crowns += d.nature.canopy[i] * G.cellArea; }
  if (plan) {
    for (const s of spacesOf(plan)) if (s.measures) crowns += s.measures.shade * s.area;
    for (const st of plan.streets) {
      let w = 0;
      for (const p of st.section ?? []) if (p.kind === "planted" && p.w >= TREE_STRIP_M) w += p.w + 2 * CROWN_REACH_M;
      crowns += len(st.pts) * Math.min(st.w, w * CROWN_SHADE);
    }
  }
  return land ? Math.min(1, crowns / land) : 0;
}

export function safeToWalk(net: Net): number {
  let L = 0, ok = 0;
  for (const st of net.d.plan?.streets ?? []) {
    const R = ROLES[st.role as RoleKey];
    if (!R || !st.section) continue;
    const l = len(st.pts);
    L += l;
    if (R.shared || st.section.filter((p) => p.kind === "footpath").every((p) => p.w >= R.foot - 1e-6)) ok += l;
  }
  return L ? ok / L : 0;
}
