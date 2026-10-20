// Representation 3: a CPPN (compositional pattern-producing network; Stanley 2007), evolved
// with NEAT-style mutation and crossover (Stanley and Miikkulainen 2002). docs/massing.md.
//
// One network for the whole block, run on every voxel of every plot, so the plots echo one
// another. Inputs:
//   u, v     plot frame, -1..1 over the plot's half length and half width
//   z        0..1 over the block's highest cap
//   water    distance to the nearest water cell, 0..1 over WATER_REACH_M
//   cap      the rules' cap for the column, 0..1 over the block's highest cap (the suitability)
//   sun      share of the winter suns the column gets past the context
//   bias     1
// One output (tanh): a voxel is built where it is above zero. Symmetry and repetition come
// from the activations: abs and gauss mirror, sin repeats.
//
// The topology grows: new links and new nodes (splitting a link) carry innovation numbers
// kept for the run, so crossover lines genes up by history. No speciation: NSGA-II does the
// selection, and the NEAT distance only groups designs into families.
import type { Rng } from "../types.js";
import type { MassContext, Representation } from "./context.js";
import { WATER_REACH_M } from "./envelope.js";
import { repair, type Massing } from "./voxels.js";

export const INPUTS = ["u", "v", "z", "water", "cap", "sun", "bias"] as const;
export const OUTPUT = INPUTS.length;                 // node id of the output
export const ACTIVATIONS = ["tanh", "sin", "gauss", "abs", "linear", "sigmoid"] as const;
export type Activation = (typeof ACTIVATIONS)[number];
export const WEIGHT_MAX = 4;
export const RATES = { weight: 0.8, reset: 0.1, link: 0.15, node: 0.08, toggle: 0.03, act: 0.05 };

export interface Node { id: number; act: Activation }
export interface Link { innov: number; from: number; to: number; w: number; on: boolean }
export interface Cppn { nodes: Node[]; links: Link[] }  // nodes: hidden only, by id

const ACT: Record<Activation, (x: number) => number> = {
  tanh: Math.tanh, sin: (x) => Math.sin(x * Math.PI), gauss: (x) => Math.exp(-x * x * 2),
  abs: Math.abs, linear: (x) => x, sigmoid: (x) => 1 / (1 + Math.exp(-4 * x)),
};

const clampW = (w: number) => Math.max(-WEIGHT_MAX, Math.min(WEIGHT_MAX, w));

function linkInnov(ctx: MassContext, from: number, to: number): number {
  const key = `${from}>${to}`, m = ctx.innov.conns;
  let k = m.get(key);
  if (k === undefined) { k = ctx.innov.nextConn++; m.set(key, k); }
  return k;
}

function nodeFor(ctx: MassContext, innov: number): number {
  const m = ctx.innov.nodes;
  let id = m.get(innov);
  if (id === undefined) { id = OUTPUT + 1 + ctx.innov.nextNode++; m.set(innov, id); }
  return id;
}

/** Nodes in an order where every link runs forwards (the hidden nodes, then the output). */
function order(c: Cppn): number[] {
  const ids = [...c.nodes.map((n) => n.id), OUTPUT], indeg = new Map(ids.map((i) => [i, 0]));
  for (const l of c.links) if (l.on && indeg.has(l.to) && l.from > -1) {
    if (indeg.has(l.from)) indeg.set(l.to, indeg.get(l.to)! + 1);
  }
  const out: number[] = [], ready = ids.filter((i) => !indeg.get(i)).sort((a, b) => a - b);
  while (ready.length) {
    const i = ready.shift()!;
    out.push(i);
    for (const l of c.links) if (l.on && l.from === i && indeg.has(l.to)) {
      indeg.set(l.to, indeg.get(l.to)! - 1);
      if (!indeg.get(l.to)) { ready.push(l.to); ready.sort((a, b) => a - b); }
    }
  }
  return out;
}

/** Would a link from → to close a loop? */
function loops(c: Cppn, from: number, to: number): boolean {
  if (from === to) return true;
  const stack = [to], seen = new Set<number>();
  while (stack.length) {
    const v = stack.pop()!;
    if (v === from) return true;
    if (seen.has(v)) continue;
    seen.add(v);
    for (const l of c.links) if (l.from === v) stack.push(l.to);
  }
  return false;
}

/** A compiled network: evaluate it on an input vector. */
export function compile(c: Cppn): (x: ArrayLike<number>) => number {
  const ord = order(c), act = new Map(c.nodes.map((n) => [n.id, ACT[n.act]]));
  act.set(OUTPUT, Math.tanh);
  const incoming = new Map<number, [number, number][]>();
  for (const l of c.links) if (l.on) {
    if (!incoming.has(l.to)) incoming.set(l.to, []);
    incoming.get(l.to)!.push([l.from, l.w]);
  }
  const plan = ord.map((id) => [id, act.get(id)!, incoming.get(id) ?? []] as const);
  const val = new Float64Array(OUTPUT + 2 + c.nodes.reduce((m, n) => Math.max(m, n.id), 0));
  return (x) => {
    for (let k = 0; k < INPUTS.length; k++) val[k] = x[k];
    for (const [id, f, ins] of plan) {
      let s = 0;
      for (const [from, w] of ins) s += val[from] * w;
      val[id] = f(s);
    }
    return val[OUTPUT];
  };
}

export function buildCppn(c: Cppn, ctx: MassContext): Massing {
  const E = ctx.E, N = E.nx * E.ny, occ = new Uint8Array(N * E.nz), field = new Float32Array(N * E.nz).fill(-1);
  const f = compile(c), x = new Float64Array(INPUTS.length);
  const top = Math.max(1, E.nz);
  for (let q = 0; q < N; q++) {
    const k = E.plotOf[q];
    if (k < 0) continue;
    const p = E.plots[k], ux = Math.cos(p.axis), uy = Math.sin(p.axis);
    const dx = E.ox + ((q % E.nx) + 0.5) * E.res - p.cx, dy = E.oy + (Math.floor(q / E.nx) + 0.5) * E.res - p.cy;
    x[0] = (dx * ux + dy * uy) / p.half[0];
    x[1] = (-dx * uy + dy * ux) / p.half[1];
    x[3] = Math.min(1, E.water[q] / WATER_REACH_M);
    x[4] = E.capZ[q] / top;
    x[5] = ctx.exposure[q];
    x[6] = 1;
    for (let z = 0; z < E.capZ[q]; z++) {
      x[2] = (z + 0.5) / top;
      const o = f(x);
      field[z * N + q] = o;
      if (o > 0) occ[z * N + q] = 1;
    }
  }
  const repairs = repair(E, occ, field);
  return { occ, field, repairs, rejected: occ.some((v) => v) ? null : "the network builds nothing inside the envelope" };
}

const pick = <T>(rng: Rng, xs: readonly T[]) => xs[Math.min(xs.length - 1, Math.floor(rng.random() * xs.length))];

export const cppn: Representation<Cppn> = {
  kind: "cppn", label: "CPPN (NEAT)",
  random(rng, ctx) {
    // Every input to the output, plus one hidden node on a random input, so the first
    // generation already has some pattern.
    const links: Link[] = INPUTS.map((_, i) => ({ innov: linkInnov(ctx, i, OUTPUT), from: i, to: OUTPUT, w: rng.normal(0, 1.5), on: true }));
    let c: Cppn = { nodes: [], links };
    c = addNode(c, rng, ctx);
    return c;
  },
  mutate(g, rng, ctx) {
    let c: Cppn = { nodes: g.nodes.map((n) => ({ ...n })), links: g.links.map((l) => ({ ...l })) };
    for (const l of c.links) {
      if (rng.random() < RATES.weight) l.w = clampW(rng.random() < RATES.reset ? rng.normal(0, 1.5) : l.w + rng.normal(0, 0.5));
      if (rng.random() < RATES.toggle) l.on = !l.on;
    }
    for (const n of c.nodes) if (rng.random() < RATES.act) n.act = pick(rng, ACTIVATIONS);
    if (rng.random() < RATES.link) c = addLink(c, rng, ctx);
    if (rng.random() < RATES.node) c = addNode(c, rng, ctx);
    return c;
  },
  cross(a, b, rng) {
    // Matching genes from either parent; disjoint and excess genes from the better parent, a.
    const bl = new Map(b.links.map((l) => [l.innov, l]));
    const links = a.links.map((l) => {
      const o = bl.get(l.innov);
      const src = o && rng.random() < 0.5 ? o : l;
      return { ...src, on: l.on && (!o || o.on) ? true : rng.random() < 0.75 ? false : true };
    });
    const bn = new Map(b.nodes.map((n) => [n.id, n]));
    const nodes = a.nodes.map((n) => ({ ...(bn.has(n.id) && rng.random() < 0.5 ? bn.get(n.id)! : n) }));
    return { nodes, links };
  },
  build: buildCppn,
  distance(a, b) {
    const am = new Map(a.links.map((l) => [l.innov, l])), bm = new Map(b.links.map((l) => [l.innov, l]));
    let unmatched = 0, dw = 0, m = 0;
    for (const [k, l] of am) { const o = bm.get(k); if (o) { dw += Math.abs(l.w - o.w); m++; } else unmatched++; }
    for (const k of bm.keys()) if (!am.has(k)) unmatched++;
    const n = Math.max(a.links.length, b.links.length, 1);
    return unmatched / n + 0.4 * (m ? dw / m : 0);
  },
};

function addLink(c: Cppn, rng: Rng, ctx: MassContext): Cppn {
  const sources = [...INPUTS.map((_, i) => i), ...c.nodes.map((n) => n.id)];
  const targets = [...c.nodes.map((n) => n.id), OUTPUT];
  for (let tries = 0; tries < 20; tries++) {
    const from = pick(rng, sources), to = pick(rng, targets);
    if (c.links.some((l) => l.from === from && l.to === to) || loops(c, from, to)) continue;
    return { nodes: c.nodes, links: [...c.links, { innov: linkInnov(ctx, from, to), from, to, w: rng.normal(0, 1.5), on: true }] };
  }
  return c;
}

function addNode(c: Cppn, rng: Rng, ctx: MassContext): Cppn {
  const live = c.links.filter((l) => l.on);
  if (!live.length) return c;
  const l = pick(rng, live), id = nodeFor(ctx, l.innov);
  if (c.nodes.some((n) => n.id === id)) return c;
  const links = c.links.map((x) => (x === l ? { ...x, on: false } : x));
  links.push({ innov: linkInnov(ctx, l.from, id), from: l.from, to: id, w: 1, on: true });
  links.push({ innov: linkInnov(ctx, id, l.to), from: id, to: l.to, w: l.w, on: true });
  return { nodes: [...c.nodes, { id, act: pick(rng, ACTIVATIONS) }], links };
}
