<script lang="ts">
  // A ready-made site's small map: its cells as a few dozen squares (water, design ground,
  // ground left as it is), from sites.json `thumb`.
  let { rows }: { rows: string[] } = $props();
  const W = $derived(rows[0]?.length ?? 0), H = $derived(rows.length);
  const fill: Record<string, string> = { w: "var(--pc-water)", d: "var(--pc-building-1)", c: "var(--pc-existing)" };
</script>

<svg viewBox="0 0 {W} {H}" preserveAspectRatio="xMidYMid meet" aria-hidden="true" shape-rendering="crispEdges">
  {#each rows as row, r}
    {#each row as ch, c}
      {#if ch !== "."}<rect x={c} y={r} width="1.02" height="1.02" fill={fill[ch]} />{/if}
    {/each}
  {/each}
</svg>
