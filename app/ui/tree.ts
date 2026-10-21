// The family tree of a run: every design it made (the run's lineage, engine/evolve.ts), by
// generation, top to bottom. Lines run from parents to children; the parent that gave more of
// the genes where the two differ draws the heavier line. A ring marks a child the mutation
// changed; a square, a newcomer (an immigrant); a diamond, a design the run started from (the
// pen, or a typology seed). The designs the run kept are dark, its front (or MAP-Elites'
// archive) filled orange.
//
// Thousands of designs never survive. By default only the kept designs and their ancestors
// are drawn, and each generation says how many dead ends it hides; "show every design" draws
// all. Within a generation, designs are ordered by where their parents sit, then by where
// their children sit, then by parents again (barycentre ordering), so lines cross less.
import type { LineageNode } from "../engine";
import type { Palette } from "./draw";

export type Role = "front" | "kept" | "ancestor" | "dead";
export interface Placed { k: number; gen: number; x: number; role: Role }
export interface TreeLayout {
  placed: Placed[];                 // shown designs, in lineage order
  at: Map<number, number>;          // lineage index → index into placed
  rows: number[][];                 // per generation: indices into placed, left to right
  hidden: number[];                 // per generation: designs not shown
  edges: [number, number, number][];   // [parent, child (indices into placed), share of genes from that parent]
  generations: number;
}

/** Lay out a lineage. `kept`: names of the designs the run kept; `front`: those on its front
 *  (or in the archive). `all`: draw every design. */
export function layoutTree(nodes: LineageNode[], kept: Set<string>, front: Set<string>, all: boolean): TreeLayout {
  const byName = new Map(nodes.map((n, k) => [n.name, k]));
  const parentsOf = nodes.map((n) => (n.how === "bred" ? n.parents.map((p) => byName.get(p)).filter((v): v is number => v !== undefined) : []));
  // Ancestors of the kept designs.
  const live = new Uint8Array(nodes.length), stack: number[] = [];
  nodes.forEach((n, k) => { if (kept.has(n.name)) { live[k] = 1; stack.push(k); } });
  while (stack.length) for (const p of parentsOf[stack.pop()!]) if (!live[p]) { live[p] = 1; stack.push(p); }
  const gens = nodes.reduce((m, n) => Math.max(m, n.gen), 0) + 1;
  const placed: Placed[] = [], at = new Map<number, number>(), hidden = new Array(gens).fill(0);
  nodes.forEach((n, k) => {
    const role: Role = front.has(n.name) ? "front" : kept.has(n.name) ? "kept" : live[k] ? "ancestor" : "dead";
    if (!all && role === "dead") { hidden[n.gen]++; return; }
    at.set(k, placed.length);
    placed.push({ k, gen: n.gen, x: 0, role });
  });
  const rows: number[][] = Array.from({ length: gens }, () => []);
  placed.forEach((p, i) => rows[p.gen].push(i));
  const ups = placed.map((p) => parentsOf[p.k].map((q) => at.get(q)).filter((v): v is number => v !== undefined));
  const downs: number[][] = placed.map(() => []);
  ups.forEach((ps, i) => { for (const p of ps) downs[p].push(i); });
  // Every row keeps at least `gap` between neighbours (room for the fullest row), so a design
  // sits near its parents' mean where it can, and lineages run down rather than across.
  const widest = Math.max(...rows.map((r) => r.length), 1), gap = 1 / widest;
  const even = (row: number[]) => row.forEach((i, j) => { placed[i].x = (j + 0.5) / row.length; });
  const settle = (row: number[], want: Map<number, number>) => {
    // Push right from the left edge, then back in from the right edge: a row never holds more
    // than 1 / gap designs, so both edges hold and every gap stays.
    const xs = row.map((i) => want.get(i)!), n = xs.length;
    for (let j = 0; j < n; j++) xs[j] = Math.max(xs[j], j ? xs[j - 1] + gap : gap / 2);
    for (let j = n - 1; j >= 0; j--) xs[j] = Math.min(xs[j], j < n - 1 ? xs[j + 1] - gap : 1 - gap / 2);
    row.forEach((i, j) => { placed[i].x = xs[j]; });
  };
  const order = (row: number[], links: number[][]) => {
    const want = new Map(row.map((i) => {
      const l = links[i];
      return [i, l.length ? l.reduce((s, j) => s + placed[j].x, 0) / l.length : placed[i].x];
    }));
    row.sort((a, b) => want.get(a)! - want.get(b)! || a - b);
    settle(row, want);
  };
  // Newcomers and starting designs have no parents: they keep their place in birth order.
  even(rows[0]);
  for (let g = 1; g < gens; g++) { even(rows[g]); order(rows[g], ups); }
  for (let g = gens - 2; g >= 0; g--) order(rows[g], downs);
  for (let g = 1; g < gens; g++) order(rows[g], ups);
  // Stretch to the full width (the sweeps can leave one side empty); gaps only grow.
  const xs = placed.map((p) => p.x), lo = Math.min(...xs), hi = Math.max(...xs);
  if (hi > lo) for (const p of placed) p.x = gap / 2 + ((p.x - lo) / (hi - lo)) * (1 - gap);
  const edges: [number, number, number][] = [];
  ups.forEach((ps, i) => {
    const n = nodes[placed[i].k], a = byName.get(n.parents[0]);
    for (const p of ps) edges.push([p, i, ps.length === 1 ? 1 : placed[p].k === a ? n.fromA ?? 0.5 : 1 - (n.fromA ?? 0.5)]);
  });
  return { placed, at, rows, hidden, edges, generations: gens };
}

/** The ancestors of one shown design (indices into placed), itself included. */
export function ancestry(L: TreeLayout, i: number): Set<number> {
  const ups: number[][] = L.placed.map(() => []);
  for (const [p, c] of L.edges) ups[c].push(p);
  const seen = new Set([i]), stack = [i];
  while (stack.length) for (const p of ups[stack.pop()!]) if (!seen.has(p)) { seen.add(p); stack.push(p); }
  return seen;
}

export const ROW_H = 18, GUTTER = 44, PAD = 10, RIGHT = 70;

/** Draw the tree. Returns a hit test: (x, y) in CSS pixels → index into placed, or -1. */
export function drawTree(canvas: HTMLCanvasElement, L: TreeLayout, nodes: LineageNode[], P: Palette,
  opts: { selected: number; hover: number; shock: number | null }): (x: number, y: number) => number {
  const w = canvas.clientWidth || canvas.parentElement!.clientWidth, h = PAD * 2 + L.generations * ROW_H;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); canvas.style.height = `${h}px`;
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = P.paper; ctx.fillRect(0, 0, w, h);
  const inner = w - GUTTER - RIGHT;
  const X = (p: Placed) => GUTTER + p.x * inner, Y = (g: number) => PAD + (g + 0.5) * ROW_H;
  // Generations: a label every fifth, the shock's generation marked.
  ctx.font = `11px ${P.t.font.text}`; ctx.textBaseline = "middle";
  for (let g = 0; g < L.generations; g++) {
    if (g === opts.shock) {
      ctx.fillStyle = P.paper2; ctx.fillRect(GUTTER - 4, Y(g) - ROW_H / 2, inner + 8, ROW_H);
      ctx.fillStyle = P.ink2; ctx.textAlign = "right"; ctx.fillText("shock", GUTTER - 6, Y(g));
    } else if (g % 5 === 0 || g === L.generations - 1) {
      ctx.fillStyle = P.muted; ctx.textAlign = "right"; ctx.fillText(`G${g}`, GUTTER - 6, Y(g));
    }
    if (L.hidden[g]) { ctx.fillStyle = P.muted; ctx.textAlign = "left"; ctx.fillText(`+${L.hidden[g]}`, GUTTER + inner + 8, Y(g)); }
  }
  const focus = opts.hover >= 0 ? opts.hover : opts.selected;
  const line = focus >= 0 ? ancestry(L, focus) : null;
  // Lines: pale, then the focused design's ancestry in ink over them.
  const many = L.placed.length > 600;
  for (const pass of [0, 1]) {
    for (const [p, c, share] of L.edges) {
      const on = !!line && line.has(p) && line.has(c);
      if ((pass === 1) !== on) continue;
      const a = L.placed[p], b = L.placed[c];
      ctx.strokeStyle = on ? P.ink : P.muted;
      ctx.globalAlpha = on ? 0.9 : (many ? 0.12 : 0.22) + 0.3 * share * (many ? 0.5 : 1);
      ctx.lineWidth = on ? 0.6 + 1.6 * share : 0.4 + 1.2 * share;
      ctx.beginPath(); ctx.moveTo(X(a), Y(a.gen)); ctx.lineTo(X(b), Y(b.gen)); ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
  const R: Record<Role, number> = { front: 4, kept: 3, ancestor: 2.2, dead: 1.6 };
  // The front is the darkest and largest mark; the accent stays for the selected design.
  const fill: Record<Role, string> = { front: P.ink, kept: P.ink2, ancestor: P.muted, dead: P.line };
  L.placed.forEach((p, i) => {
    const n = nodes[p.k], x = X(p), y = Y(p.gen), r = R[p.role] + (i === focus ? 1.5 : 0);
    ctx.fillStyle = fill[p.role];
    ctx.globalAlpha = p.role === "dead" ? 0.6 : 1;
    ctx.beginPath();
    if (n.how === "immigrant") ctx.rect(x - r, y - r, 2 * r, 2 * r);
    else if (n.how === "start") { ctx.moveTo(x, y - r - 1); ctx.lineTo(x + r + 1, y); ctx.lineTo(x, y + r + 1); ctx.lineTo(x - r - 1, y); ctx.closePath(); }
    else ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    if (n.mutated) {
      // Thin for one gene, heavier for three or more.
      ctx.strokeStyle = fill[p.role]; ctx.lineWidth = Math.min(0.4 + 0.3 * n.mutated, 1.4);
      ctx.globalAlpha = p.role === "dead" ? 0.35 : 0.55;
      ctx.beginPath(); ctx.arc(x, y, r + 1.8, 0, Math.PI * 2); ctx.stroke();
    }
    if (i === opts.selected) {
      ctx.globalAlpha = 1; ctx.strokeStyle = P.t.accent; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, r + 3.5, 0, Math.PI * 2); ctx.stroke();
    }
  });
  ctx.globalAlpha = 1;
  return (mx, my) => {
    const g = Math.floor((my - PAD) / ROW_H);
    if (g < 0 || g >= L.generations) return -1;
    let best = -1, bd = 8;
    for (const i of L.rows[g]) {
      const d = Math.abs(X(L.placed[i]) - mx);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  };
}

/** One line on a design in the tree. */
export function describeNode(n: LineageNode, role: Role, scoreText: string): string {
  const how = n.how === "bred" ? `bred from ${n.parents.join(" × ")}: ${Math.round((n.fromA ?? 0.5) * 100)}% of the differing genes from ${n.parents[0]}`
      + `, ${n.mutated ? `${n.mutated} gene${n.mutated > 1 ? "s" : ""} mutated` : "no mutation"}`
    : n.how === "immigrant" ? "a newcomer (random genes)" : n.how === "start" ? "a starting design (the pen or a typology seed)" : "random, Generation 0";
  const where = role === "front" ? "on the final front" : role === "kept" ? "kept to the end" : role === "ancestor" ? "an ancestor of the kept designs" : "left no descendants that survived";
  return `${n.name} · ${how} · ${where} · when made: ${scoreText}`;
}
