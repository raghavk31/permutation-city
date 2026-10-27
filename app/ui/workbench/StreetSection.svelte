<script lang="ts">
  // A street's cross-section, drawn to scale (engine/config.ts sectionFor: IRC:SP:118 templates):
  // each part a band, its width beneath, and a tree over the planted strips.
  import * as E from "../../engine";
  import * as Draw from "../draw";

  let { w, label }: { w: number; label: string } = $props();
  const P = Draw.palette();
  const s = $derived(E.sectionFor(w));
  const LOOK: Record<string, string> = { footpath: P.t.street.onDesign, planted: P.t.green.proposed, carriageway: P.t.street.primary, shared: P.t.street.onGround };
  const W = 240, scale = $derived(W / w);
  const bands = $derived.by(() => {
    let x = 0;
    return s.parts.map((p) => { const b = { ...p, x, px: p.w * scale }; x += b.px; return b; });
  });
  const fmt = (v: number) => (Math.abs(v - Math.round(v)) < 0.05 ? String(Math.round(v)) : v.toFixed(1));
</script>

<figure class="wb-section">
  <figcaption><b>{label}</b> <span class="wb-quiet">{fmt(w)} m, {s.template}</span></figcaption>
  <svg viewBox="0 -26 {W} 48" width="100%" role="img" aria-label="Cross-section of a {fmt(w)} m street: {s.parts.map((p) => `${p.label} ${fmt(p.w)} m`).join(', ')}">
    {#each bands as b}
      {#if b.kind === "planted" && b.w >= 1.5}
        <line x1={b.x + b.px / 2} y1="0" x2={b.x + b.px / 2} y2="-10" stroke={P.t.green.existing} stroke-width="1.5" />
        <circle cx={b.x + b.px / 2} cy="-16" r="8" fill={P.t.green.existing} opacity="0.85" />
      {/if}
      <rect x={b.x} y={b.kind === "footpath" ? -2 : 0} width={Math.max(b.px - 0.6, 0.5)} height={b.kind === "footpath" ? 8 : 6} fill={LOOK[b.kind]} stroke={P.t.street.primary} stroke-width="0.4">
        <title>{b.label}, {fmt(b.w)} m</title>
      </rect>
      {#if b.px > 18}<text x={b.x + b.px / 2} y="18" text-anchor="middle" font-size="8" fill="currentColor">{fmt(b.w)}</text>{/if}
    {/each}
  </svg>
</figure>
