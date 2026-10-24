// Families, shown as a few representatives: the most distinct designs of the front, each with
// a plain title (what sets it apart) and a small glyph of its five scores.
//
//   representatives  farthest-point sampling on land-use difference: start from the best
//                    family lead, then repeatedly take the lead least like any chosen so far.
//                    Every other family joins the representative it is closest to.
//   what sets it apart   among the representatives, each score (and two plain traits) as a
//                    z-score with the better end positive; the largest unused one names it.
import { difference, SCORE_KEYS, SCORES, stats, type Design, type Ground } from "../engine";

export interface Rep<T> { item: T; members: T[]; label: string }

/** The `k` most distinct designs (farthest-point sampling from the first, which is the best
 *  family lead), and which families each stands for. */
export function representatives<T extends { design: Design }>(items: T[], k = 6): { item: T; members: T[] }[] {
  if (!items.length) return [];
  const chosen = [0], dist = items.map((it) => difference(it.design.use, items[0].design.use));
  while (chosen.length < Math.min(k, items.length)) {
    let far = -1;
    dist.forEach((d, i) => { if (!chosen.includes(i) && (far < 0 || d > dist[far])) far = i; });
    if (far < 0 || dist[far] <= 0) break;
    chosen.push(far);
    items.forEach((it, i) => { dist[i] = Math.min(dist[i], difference(it.design.use, items[far].design.use)); });
  }
  const groups = chosen.map((c) => ({ item: items[c], members: [] as T[] }));
  items.forEach((it) => {
    let best = 0, bd = Infinity;
    chosen.forEach((c, g) => { const d = difference(it.design.use, items[c].design.use); if (d < bd) { bd = d; best = g; } });
    groups[best].members.push(it);
  });
  return groups;
}

// COPY: the phrases that name what sets a design apart.
const TRAITS: { key: string; up: boolean; phrase: string; get: (d: Design, G: Ground) => number }[] = [
  ...SCORE_KEYS.map((k) => ({
    key: k, up: SCORES[k][2],
    phrase: { storage: "most flood storage", heat: "coolest", carbon: "least embodied carbon", daylight: "most daylight",
      human: "most human in scale" }[k],
    get: (d: Design) => (d.scores as unknown as Record<string, number>)[k],
  })),
  { key: "tall", up: true, phrase: "tallest", get: (d, G) => stats(d, G).mean_levels },
  { key: "low", up: false, phrase: "lowest-rise", get: (d, G) => stats(d, G).mean_levels },
];

/** One plain phrase per design: the trait on which it stands out most among `designs`, each
 *  phrase used once (greedy, strongest first). */
export function apart(designs: Design[], G: Ground): string[] {
  const z = TRAITS.map((t) => {
    const v = designs.map((d) => t.get(d, G));
    if (!v.every(Number.isFinite)) return v.map(() => 0); // a trait that can't be read names nobody
    const m = v.reduce((a, b) => a + b, 0) / v.length;
    const sd = Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length) || 1;
    return v.map((x) => ((t.up ? 1 : -1) * (x - m)) / sd);
  });
  const pairs: [number, number, number][] = [];
  z.forEach((row, t) => row.forEach((val, d) => pairs.push([val, t, d])));
  pairs.sort((a, b) => b[0] - a[0]);
  const out: string[] = designs.map(() => "a balance of the scores"); // COPY:
  const usedT = new Set<number>(), usedD = new Set<number>();
  for (const [val, t, d] of pairs) {
    if (usedT.has(t) || usedD.has(d) || val <= 0.3) continue;
    // "tallest" and "lowest" are one trait seen from both ends.
    if ((TRAITS[t].key === "tall" && [...usedT].some((u) => TRAITS[u].key === "low"))
      || (TRAITS[t].key === "low" && [...usedT].some((u) => TRAITS[u].key === "tall"))) continue;
    out[d] = TRAITS[t].phrase; usedT.add(t); usedD.add(d);
  }
  return out;
}

/** The five scores as five small bars, each placed between the worst and best of `pool`
 *  (better is taller), as inline SVG with a text alternative. */
export function glyph(d: Design, pool: Design[]): string {
  const w = 54, h = 18, bw = 8, gap = (w - 5 * bw) / 4;
  const parts: string[] = [], said: string[] = [];
  SCORE_KEYS.forEach((k, n) => {
    const v = (d.scores as unknown as Record<string, number>)[k], vs = pool.map((p) => (p.scores as unknown as Record<string, number>)[k]);
    const lo = Math.min(...vs), hi = Math.max(...vs), up = SCORES[k][2];
    const t = hi > lo ? (up ? (v - lo) / (hi - lo) : (hi - v) / (hi - lo)) : 0.5;
    const bh = 2 + t * (h - 2), x = n * (bw + gap);
    parts.push(`<rect x="${x}" y="${h - bh}" width="${bw}" height="${bh}" rx="1"></rect>`);
    said.push(`${SCORES[k][0]} ${SCORES[k][1](v)}`);
  });
  return `<svg class="pc-glyph" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${said.join(", ")}">`
    + `<title>${said.join(" · ")}</title><line x1="0" x2="${w}" y1="${h - 0.5}" y2="${h - 0.5}"></line>${parts.join("")}</svg>`;
}
