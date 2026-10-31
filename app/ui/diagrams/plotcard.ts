// One plot's design as a small isometric drawing (the /build page's cards): the plot and its
// street, the buildable line, the masses with their courts, ponds and trees, in the same
// projection, light and colour tokens as the library's drawings (iso.ts).
import type { Envelope } from "../../engine/massing/envelope";
import type { Source } from "../../engine/massing/precedent";
import { Scene, darker, type P3 } from "./iso";

type Pt = [number, number];
const STOREY = 3.2;
const BUILT = "var(--pc-building-0)", COURT = "color-mix(in srgb, var(--pc-ink) 22%, var(--pc-surface))";
const WATER = "var(--pc-water-storage)", PLANTED = "color-mix(in srgb, var(--pc-green) 45%, var(--pc-building-0))";

/** An upright prism over a ring: the faces toward the viewer shaded by which way they face,
 *  then the top, then its courts as dark holes. */
function prism(s: Scene, ring: Pt[], holes: Pt[][], z: number, h: number, top: string) {
  const a = ring.reduce((t, [x, y], i) => { const [u, v] = ring[(i + 1) % ring.length]; return t + x * v - u * y; }, 0), sg = a > 0 ? 1 : -1;
  const faces = ring.map(([x, y], i) => {
    const [u, v] = ring[(i + 1) % ring.length], L = Math.hypot(u - x, v - y) || 1, n: Pt = [(sg * (v - y)) / L, (-sg * (u - x)) / L];
    return { p: [[x, y, z], [u, v, z], [u, v, z + h], [x, y, z + h]] as P3[], n, d: x + u + y + v };
  }).filter((f) => f.n[0] + f.n[1] > 0).sort((p, q) => p.d - q.d);
  for (const f of faces) s.poly(f.p, darker(BUILT, 0.07 + 0.13 * Math.max(0, f.n[0])));
  s.poly(ring.map(([x, y]): P3 => [x, y, z + h]), top);
  for (const hole of holes) s.poly(hole.map(([x, y]): P3 => [x, y, z + h + 0.01]), COURT);
}

export function drawPlotCard(E: Envelope, outline: Pt[], src: Source, title: string): string {
  const s = new Scene(`plot-${Math.round(Math.random() * 1e9)}`), N = E.nx * E.ny;
  const xy = (q: number): Pt => [E.ox + ((q % E.nx) + 0.5) * E.res, E.oy + (Math.floor(q / E.nx) + 0.5) * E.res];
  // the street band and the plot
  for (let q = 0; q < N; q++) if (E.street[q]) { const [x, y] = xy(q), r = E.res / 2; s.poly([[x - r, y - r, 0], [x + r, y - r, 0], [x + r, y + r, 0], [x - r, y + r, 0]], "var(--pc-street)", "var(--pc-street)"); }
  s.poly(outline.map(([x, y]): P3 => [x, y, 0]), "var(--pc-surface-2)");
  for (const r of E.land ?? []) s.line([...r, r[0]].map(([x, y]): P3 => [x, y, 0.05]), "var(--pc-ink-2)", 0.6, { dash: "2 2", opacity: 0.6 });
  const n = src.nature;
  if (n) for (const q of n.water) { const [x, y] = xy(q), r = E.res / 2; s.poly([[x - r, y - r, 0.06], [x + r, y - r, 0.06], [x + r, y + r, 0.06], [x - r, y + r, 0.06]], WATER, WATER); }
  // masses and trees back to front
  const top = n && n.green > 0.3 ? PLANTED : BUILT;
  const items: { d: number; draw: () => void }[] = src.masses.map((m) => ({
    d: Math.min(...m.ring.map(([x, y]) => x + y)),
    draw: () => prism(s, m.ring as Pt[], (m.holes ?? []) as Pt[][], m.z, m.storeys * STOREY, top),
  }));
  // one tree in three, so crowns don't merge into a block
  if (n) n.trees.forEach((q, i) => { if (i % 3) return; const [x, y] = xy(q); items.push({ d: x + y, draw: () => s.tree({ kind: "tree", x, y, z: 0, s: 2.2 }) }); });
  items.sort((a, b) => a.d - b.d).forEach((it) => it.draw());
  return s.svg(title);
}
