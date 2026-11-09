<script lang="ts">
  // A real section across the river from the Taj to Mehtab Bagh, with the reported river levels.
  import { type Place, profile } from "../../engine/focus/place";
  import { bench } from "./bench.svelte";

  let { place }: { place: Place } = $props();
  const f = bench.focus;
  const km = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`);

  const section = $derived.by(() => {
    const a = place.landmarks[place.brief.links[0]?.from], b = place.landmarks[place.brief.links[0]?.to];
    if (!a || !b) return null;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / len, uy = (b[1] - a[1]) / len;
    const pts = profile(place, a, [b[0] + ux * 200, b[1] + uy * 200]);
    const zs = pts.filter((p) => p.z !== null).map((p) => p.z!);
    if (!zs.length) return null;
    const W = 720, H = 300, pad = 24, marks = place.brief.marks;
    const lo = Math.floor(Math.min(...zs)) - 2, hi = Math.ceil(Math.max(...zs, ...marks.map((m) => m.m))) + 1, total = pts[pts.length - 1].d;
    const X = (d: number) => pad + (W - 2 * pad) * d / total, Y = (z: number) => H - pad - (H - 2 * pad) * (z - lo) / (hi - lo);
    let path = "", open = false;
    for (const p of pts) {
      if (p.z === null) { open = false; continue; }
      path += `${open ? "L" : "M"}${X(p.d).toFixed(1)} ${Y(p.z).toFixed(1)}`;
      open = true;
    }
    const river = pts.filter((p) => p.band === 0);
    return { W, H, pad, path, total, bottom: H - pad,
      marks: marks.map((m, k) => ({ words: m.words, y: Y(m.m), on: k === f.mark, below: k === 0 })),
      river: river.length ? { x0: X(river[0].d), x1: X(river[river.length - 1].d), y: Y(marks[0].m) } : null };
  });
</script>

<div class="wb-section-view">
  {#if section}
    <!-- COPY: the section -->
    <b>From the Taj across the river to Mehtab Bagh</b>
    <svg viewBox="0 0 {section.W} {section.H}" role="img" aria-label="Section across the river with the three reported river levels">
      {#if section.river}<rect x={section.river.x0} y={section.river.y} width={section.river.x1 - section.river.x0} height={section.bottom - section.river.y} class="s-river" />{/if}
      <path d={section.path} class="s-ground" />
      {#each section.marks as m}
        <line x1={section.pad} x2={section.W - section.pad} y1={m.y} y2={m.y} class="s-mark" class:on={m.on} />
        <text x={section.pad} y={m.below ? m.y + 13 : m.y - 4} class="s-text">{m.words}</text>
      {/each}
      <text x={section.pad} y={section.H - 8} class="s-text">Taj side</text>
      <text x={section.W - section.pad} y={section.H - 8} text-anchor="end" class="s-text">Mehtab Bagh side · {km(section.total)} across</text>
    </svg>
    <p class="wb-hint">Real ground heights from satellite terrain. The river bed isn't measured, so the river is drawn only up to the lowest level.</p>
  {:else}
    <p class="wb-hint">This brief names no two places to draw a section between.</p>
  {/if}
</div>
