<script lang="ts">
  // The Rules step's map: each cell's state under the rules as they stand, or as the site
  // first had them ("Before"); the rule pointed at in the rail outlined; a readout of the cell.
  import * as E from "../../engine";
  import * as Draw from "../draw";
  import * as Sites from "../sites";
  import { bench } from "./bench.svelte";
  import MapCanvas from "./MapCanvas.svelte";
  import * as Paint from "./paint";

  let { site }: { site: E.SiteExport } = $props();
  const P = Draw.palette();

  const shownRules = $derived(bench.showBefore && bench.edited ? site.rules! : bench.rules!);
  const res = $derived(Sites.withRules(site, shownRules).result);
  const paint = $derived((ctx: CanvasRenderingContext2D, v: Draw.View) => Paint.rules(ctx, v, site, res, P, bench.ruleHover));
  const version = $derived(JSON.stringify([shownRules, bench.ruleHover]));

  // COPY: state names (as in the rail)
  const STATE = ["Never built", "Kept as it is", "Built with limits", "Free to design"];
  const readout = $derived.by(() => {
    const i = bench.hover;
    if (i < 0) return null;
    if (site.grid.layers!.water[i]) return { state: "Water", rules: [] as string[], limits: [] as string[] };
    const hits = shownRules.list.filter((_, k) => res.hits[k][i]).map((r) => r.name);
    const lim: string[] = [];
    if (res.state[i] === E.CONSTRAINED || res.state[i] === E.OPEN) {
      lim.push(`at most ${res.maxLevels[i]} levels`);
      if (res.minPermeable[i] > 0) lim.push(`${Math.round(res.minPermeable[i] * 100)}% unsealed`);
    }
    return { state: STATE[res.state[i]], rules: hits, limits: lim, conflict: !!res.conflict[i] };
  });
</script>

{#snippet beforeAfter()}
  {#if bench.edited}
    <div class="wb-seg" role="group" aria-label="Rules shown">
      <button type="button" aria-pressed={bench.showBefore} onclick={() => (bench.showBefore = true)}>Before</button>
      <button type="button" aria-pressed={!bench.showBefore} onclick={() => (bench.showBefore = false)}>After</button>
    </div>
  {/if}
{/snippet}

<MapCanvas {site} {paint} {version} tools={beforeAfter} onhover={(i) => (bench.hover = i)} label="Map of what the land allows under the rules">
  {#if readout}
    <div class="wb-readout wb-over tr" aria-live="polite">
      <span>Here</span><span><b>{readout.state}</b></span>
      {#each readout.rules as r}<span class="wb-off">rule</span><span>{r}</span>{/each}
      {#each readout.limits as l}<span class="wb-off">limit</span><span>{l}</span>{/each}
      {#if readout.conflict}<span class="wb-off">note</span><span>rules disagree here</span>{/if}
    </div>
  {/if}
  <div class="wb-legend wb-over br">
    <div><i class="wb-hatch-forbidden" style="box-shadow: inset 0 0 0 1px var(--pc-forbidden)"></i><span>never built</span></div>
    <div><i style="--c: var(--pc-retained)"></i><span>kept as it is</span></div>
    <div><i class="wb-hatch-constrained" style="box-shadow: inset 0 0 0 1px var(--pc-constrained)"></i><span>built with limits</span></div>
    <div><i style="--c: var(--pc-surface-2); box-shadow: inset 0 0 0 1px var(--pc-ink-2)"></i><span>free to design</span></div>
    <div><i style="--c: var(--pc-water)"></i><span>water</span></div>
    {#if bench.ruleHover !== null}<div><i style="--c: transparent; box-shadow: inset 0 0 0 2px var(--pc-accent)"></i><span>{shownRules.list[bench.ruleHover]?.name}</span></div>{/if}
  </div>
</MapCanvas>
