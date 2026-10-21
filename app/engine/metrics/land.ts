// The street network, and how the design fits the land (pc/metrics/land.py; docs/metrics.md).
//
// The street graph: the sides of cells that carry a street (streets.ts), joined at the
// cells' corners. On hexes, three sides meet at a corner, so every junction is a T or a Y,
// never a crossroads; junction density and meshedness are only comparable between designs
// on the same kind of grid (as heat is).
import { BUILDING, LANDSCAPE, RIDGE_MIN_HA, WATER } from "../config.js";
import { sides } from "../streets.js";
import type { Net } from "./network.js";

/** Street degree of each corner, and which corners sit on the edge of the design ground.
 *  A version 3 design reads its own network: vertices and street edges of its plan, the edge
 *  of the ground being its class-0 edges. */
function graph(net: Net): { deg: Int32Array; edge: Uint8Array; sides: number } {
  const plan = net.d.plan;
  if (plan) {
    const deg = new Int32Array(plan.vx.length), edge = new Uint8Array(plan.vx.length);
    let count = 0;
    for (const e of plan.edges) {
      if (e.cls === 0) { edge[e.u] = 1; edge[e.v] = 1; continue; }
      deg[e.u]++; deg[e.v]++; count++;
    }
    return { deg, edge, sides: count };
  }
  const sd = sides(net.G), nv = sd.vx.length, deg = new Int32Array(nv), edge = new Uint8Array(nv);
  let count = 0;
  for (let s = 0; s < sd.cell.length; s++) {
    if (sd.other[s] < 0) { edge[sd.v0[s]] = 1; edge[sd.v1[s]] = 1; }
    if (!net.d.street?.[s]) continue;
    deg[sd.v0[s]]++; deg[sd.v1[s]]++; count++;
  }
  return { deg, edge, sides: count };
}

/** Junctions (corners where three or more street sides meet) per km² of design ground. */
export function junctionDensity(net: Net): number {
  const { deg } = graph(net);
  let j = 0;
  for (const d of deg) if (d >= 3) j++;
  return j / ((net.G.n * net.G.cellArea) / 1e6);
}

/** Connected parts of the street graph (by corners). */
function partsOf(net: Net): number {
  const plan = net.d.plan;
  if (plan) {
    const parent = new Int32Array(plan.vx.length).map((_, k) => k), used = new Uint8Array(plan.vx.length);
    const find = (v: number) => { while (parent[v] !== v) { parent[v] = parent[parent[v]]; v = parent[v]; } return v; };
    for (const e of plan.edges) {
      if (e.cls === 0) continue;
      used[e.u] = 1; used[e.v] = 1;
      const a = find(e.u), b = find(e.v);
      if (a !== b) parent[Math.max(a, b)] = Math.min(a, b);
    }
    let c = 0;
    for (let v = 0; v < used.length; v++) if (used[v] && find(v) === v) c++;
    return c;
  }
  const sd = sides(net.G), parent = new Int32Array(sd.vx.length).map((_, k) => k);
  const find = (v: number) => { while (parent[v] !== v) { parent[v] = parent[parent[v]]; v = parent[v]; } return v; };
  const used = new Uint8Array(sd.vx.length);
  for (let s = 0; s < sd.cell.length; s++) {
    if (!net.d.street?.[s]) continue;
    used[sd.v0[s]] = 1; used[sd.v1[s]] = 1;
    const a = find(sd.v0[s]), b = find(sd.v1[s]);
    if (a !== b) parent[Math.max(a, b)] = Math.min(a, b);
  }
  let c = 0;
  for (let v = 0; v < used.length; v++) if (used[v] && find(v) === v) c++;
  return c;
}

/** Meshedness (Buhl et al. 2006): the share of the loops a planar network could have that it
 *  has, (E − V + C) / (2V − 5), counted on junctions and ends (corners where a street only
 *  passes through are merged away). 0 is a tree; 1 a full triangulation. */
export function meshedness(net: Net): number {
  const { deg, sides: e } = graph(net);
  let v = 0, through = 0;
  for (const d of deg) { if (d === 2) through++; else if (d > 0) v++; }
  if (v < 3) return 0;
  const m = (e - through - v + partsOf(net)) / (2 * v - 5);
  return Math.min(Math.max(m, 0), 1);
}

/** Of the street graph's junctions and ends, the share that are dead ends (ends inside the
 *  design ground; an end at its edge carries on outside). Many dead ends read as a tree. */
export function deadEnds(net: Net): number {
  const { deg, edge } = graph(net);
  let nodes = 0, dead = 0;
  for (let v = 0; v < deg.length; v++) {
    if (deg[v] === 0 || deg[v] === 2) continue;
    nodes++;
    if (deg[v] === 1 && !edge[v]) dead++;
  }
  return nodes ? dead / nodes : 0;
}

/** Of the valley channels and their buffers, the share kept free of buildings (1 where the
 *  site has no valleys). */
export function valleyFree(net: Net): number {
  const { G, d } = net;
  if (!G.vbuf) return 1;
  let all = 0, free = 0;
  for (let i = 0; i < G.n; i++) if (G.vbuf[i]) { all++; if (d.use[i] !== BUILDING) free++; }
  return all ? free / all : 1;
}

/** The quartiles of ground height on the design ground (kept per ground). */
const quartiles = new WeakMap<object, [number, number]>();
function heightQuartiles(net: Net): [number, number] {
  const G = net.G;
  let q = quartiles.get(G);
  if (!q) {
    const z = Array.from(G.z!).sort((a, b) => a - b), at = (p: number) => z[Math.floor(p * (z.length - 1))];
    q = [at(0.25), at(0.75)];
    quartiles.set(G, q);
  }
  return q;
}

function streetShare(net: Net, on: (i: number, j: number) => boolean): number {
  const { G, d } = net;
  if (!d.street || !G.z) return 0;
  const sd = sides(G);
  let all = 0, hit = 0;
  for (let s = 0; s < sd.cell.length; s++) {
    if (!d.street[s] || sd.other[s] < 0) continue;
    all++;
    if (on(sd.cell[s], sd.other[s])) hit++;
  }
  return all ? hit / all : 0;
}

/** Share of the streets on ridges or high ground: beside a strong divide (5 ha or more on its
 *  smaller side; pc/landform.py), or with both sides in the top quarter of the ground's
 *  height. Ridges carry movement (McHarg). */
export function ridgeStreets(net: Net): number {
  const { G } = net;
  const [, q3] = G.z ? heightQuartiles(net) : [0, 0];
  return streetShare(net, (i, j) => (G.ridge?.[i] ?? 0) >= RIDGE_MIN_HA || (G.ridge?.[j] ?? 0) >= RIDGE_MIN_HA
    || (G.z![i] >= q3 && G.z![j] >= q3));
}

/** Share of the streets in low ground: between two valley cells (a crossing), or with both
 *  sides in the bottom quarter of the ground's height. Valleys carry water. */
export function lowStreets(net: Net): number {
  const { G } = net;
  const [q1] = G.z ? heightQuartiles(net) : [0, 0];
  return streetShare(net, (i, j) => (!!G.vbuf?.[i] && !!G.vbuf?.[j]) || (G.z![i] <= q1 && G.z![j] <= q1));
}

/** How far rain runs off a building before it reaches storage (landscape or water), along
 *  the ground's flow (pc/landform.py), in metres, averaged over building cells. A path that
 *  leaves the design ground stops there. */
export function runoffPath(net: Net): number {
  const { G, d } = net;
  if (!G.down) return 0;
  let sum = 0, nb = 0;
  for (let i = 0; i < G.n; i++) {
    if (d.use[i] !== BUILDING) continue;
    let c = i, steps = 0;
    while (steps < G.n) {
      const nxt = G.down[c];
      if (nxt < 0) break;
      steps++;
      c = nxt;
      if (d.use[c] === LANDSCAPE || d.use[c] === WATER) break;
    }
    sum += steps * G.grid.spacing; nb++;
  }
  return nb ? sum / nb : 0;
}

/** Cooling where it's hot: the mean hot-season land surface temperature (Landsat; pc/lst.py)
 *  of the cells the design keeps open (landscape and water), less the mean over the design
 *  ground, in °C. Above 0: greening and water go to today's hot spots. 0 without LST. */
export function heatFit(net: Net): number {
  const { G, d } = net;
  if (!G.lst) return 0;
  let all = 0, na = 0, open = 0, no = 0;
  for (let i = 0; i < G.n; i++) {
    const t = G.lst[i];
    if (!Number.isFinite(t)) continue;
    all += t; na++;
    if (d.use[i] === LANDSCAPE || d.use[i] === WATER) { open += t; no++; }
  }
  return na && no ? open / no - all / na : 0;
}
