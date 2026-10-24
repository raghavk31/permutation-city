<script lang="ts">
  // Every design of the prepared run by flood storage (more to the right) and heat (cooler
  // lower), as in the trade-off diagram. Earlier generations fainter; the survivors in ink;
  // the design shown elsewhere on the page ringed in the accent.
  import { SCORES } from "../../engine";
  import type { Prepared } from "./prepared";

  let { p }: { p: Prepared } = $props();
  const W = 600, H = 420, L = 56, R = 16, T = 28, B = 48;
  const run = $derived(p.run);
  const pts = $derived(run.everyone.filter((r) => r[6] <= 0.1));   // on the floor-area brief
  const xs = $derived(pts.map((r) => r[1])), ys = $derived(pts.map((r) => r[2]));
  const span = (v: number[]) => { const lo = Math.min(...v), hi = Math.max(...v), m = (hi - lo) * 0.06 || 0.1; return [lo - m, hi + m]; };
  const [x0, x1] = $derived(span(xs)), [y0, y1] = $derived(span(ys));
  const px = (v: number) => L + ((v - x0) / (x1 - x0)) * (W - L - R);
  const py = (v: number) => H - B - ((v - y0) / (y1 - y0)) * (H - T - B);
  const last = $derived(run.generations);
  const chosen = $derived(run.front.find((f) => f.name === run.chosen));
  const ticks = (lo: number, hi: number) => { const s = (hi - lo) / 4; return [0, 1, 2, 3, 4].map((k) => lo + s * k + s / 2).slice(0, 4); };
</script>

<figure class="st-front">
  <svg viewBox="0 0 {W} {H}" role="img"
    aria-label="{pts.length} designs on the brief plotted by flood storage and heat; {run.front.length} survivors, the best trade-offs, along the lower right edge.">
    <line x1={L} y1={H - B} x2={W - R} y2={H - B} class="axis" />
    <line x1={L} y1={T} x2={L} y2={H - B} class="axis" />
    {#each ticks(x0, x1) as t (t)}<text x={px(t)} y={H - B + 18} text-anchor="middle" class="tick">{SCORES.storage[1](t)}</text>{/each}
    {#each ticks(y0, y1) as t (t)}<text x={L - 8} y={py(t) + 4} text-anchor="end" class="tick">{SCORES.heat[1](t)}</text>{/each}
    <text x={W - R} y={H - 10} text-anchor="end" class="name">more rain stored →</text>
    <text x={L} y={T - 4} class="name">↑ hotter</text>
    {#each pts as r, k (k)}
      <circle cx={px(r[1])} cy={py(r[2])} r="2.4" class="dot" style="opacity: {0.18 + 0.5 * (r[0] / last)}" />
    {/each}
    {#each run.front as f (f.name)}
      <circle cx={px(f.scores.storage)} cy={py(f.scores.heat)} r="3.6" class="front" />
    {/each}
    {#if chosen}
      <circle cx={px(chosen.scores.storage)} cy={py(chosen.scores.heat)} r="9" class="ring" />
    {/if}
  </svg>
  <figcaption class="wb-mono">{run.everyone.length.toLocaleString("en-IN")} designs in {run.generations + 1} generations of {run.pop} · {run.front.length} survive</figcaption>
</figure>

<style>
  .st-front { margin: 0; width: min(100%, 680px); display: grid; gap: var(--wb-s2); }
  svg { width: 100%; height: auto; overflow: visible; }
  .axis { stroke: var(--pc-line); }
  .tick, .name { font: 11px var(--pc-mono); fill: var(--pc-muted); }
  .name { fill: var(--pc-ink-2); }
  .dot { fill: var(--pc-muted); }
  .front { fill: var(--pc-ink); }
  .ring { fill: none; stroke: var(--pc-accent); stroke-width: 2; }
  figcaption { color: var(--pc-muted); text-align: center; }
</style>
