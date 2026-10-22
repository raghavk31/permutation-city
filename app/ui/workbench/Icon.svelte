<script lang="ts">
  // A Lucide line icon (ISC licence), 16 px at 1.75 stroke (design system, "Icons").
  import type { IconNode } from "lucide";

  let { icon, size = 16 }: { icon: IconNode; size?: number } = $props();
</script>

<svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
  stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  {#each icon as [tag, attrs]}
    <svelte:element this={tag} {...attrs} />
  {/each}
</svg>
