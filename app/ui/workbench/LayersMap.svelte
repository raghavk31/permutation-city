<script lang="ts">
  // The Layers step's centre: the switched-on layers on one map at their opacities, with a
  // readout of every layer under the pointer; or the Stack view, the layers lifted apart like
  // McHarg's cake (played once on a first visit).
  import { Box, Map as MapIcon } from "lucide";
  import { onMount } from "svelte";
  import type * as E from "../../engine";
  import * as Draw from "../draw";
  import * as Cake from "../new/cake";
  import { layerMap } from "../new/draw-cake";
  import { bench } from "./bench.svelte";
  import Icon from "./Icon.svelte";
  import MapCanvas from "./MapCanvas.svelte";
  import * as Paint from "./paint";

  let { site }: { site: E.SiteExport } = $props();

  const P = Draw.palette();
  // svelte-ignore state_referenced_locally
  const all = Cake.layers(site);
  const FIRST = /^(water|ground|trees|built)$|^flood_/;
  // svelte-ignore state_referenced_locally
  if (!Object.keys(bench.layerOn).length) bench.layerOn = Object.fromEntries(all.map((l) => [l.name, FIRST.test(l.name)]));

  const shown = $derived(all.filter((l) => bench.layerOn[l.name]));
  const opacityOf = (n: string) => bench.opacity[n] ?? 0.85;
  const paint = $derived((ctx: CanvasRenderingContext2D, v: Draw.View) => Paint.layers(ctx, v, site, shown, opacityOf, P));
  const version = $derived(JSON.stringify([shown.map((l) => l.name), bench.opacity]));

  onMount(() => {
    if (!bench.introSeen["layers-stack"]) { bench.layerView = "stack"; bench.seen("layers-stack" as never); }
  });

  const readout = $derived.by(() => {
    const i = bench.hover;
    if (i < 0) return null;
    return all.map((l) => ({ l, on: !!bench.layerOn[l.name], v: Cake.format(l, site.grid.layers![l.name][i]) }));
  });

  // the stack
  let playing = $state(false);
  let stackTimer: ReturnType<typeof setTimeout> | undefined;
  const drawPlane = (l: Cake.Layer) => (c: HTMLCanvasElement) => { layerMap(c, site, l, P); };
  $effect(() => {
    if (bench.layerView !== "stack") return;
    playing = true;
    clearTimeout(stackTimer);
    stackTimer = setTimeout(() => (playing = false), shown.length * 240 + 500);
  });
</script>

{#snippet viewSwitch()}
  <div class="wb-seg" role="group" aria-label="View">
    <button type="button" aria-pressed={bench.layerView === "map"} onclick={() => (bench.layerView = "map")}><Icon icon={MapIcon} size={14} />Map</button>
    <button type="button" aria-pressed={bench.layerView === "stack"} onclick={() => (bench.layerView = "stack")}><Icon icon={Box} size={14} />Stack</button>
  </div>
{/snippet}

<div class="wb-layers-centre">
  {#if bench.layerView === "map"}
    <MapCanvas {site} {paint} {version} tools={viewSwitch} onhover={(i) => (bench.hover = i)}
      label="Map of the site's layers: {shown.map((l) => l.label).join(', ')}">
      {#if readout}
        <div class="wb-readout wb-over tr" aria-live="polite">
          {#each readout.filter((r) => r.on) as r}<span>{r.l.label}</span><span>{r.v}</span>{/each}
          {#each readout.filter((r) => !r.on && r.v !== "no value") as r}<span class="wb-off">{r.l.label}</span><span class="wb-off">{r.v}</span>{/each}
        </div>
      {/if}
      <div class="wb-legend wb-over br">
        {#each shown as l (l.name)}
          {@const ramp = Cake.rampOf(l, P)}
          <div>{#if l.kind === "flag"}<i style="--c: {ramp[Math.min(3, ramp.length - 1)]}"></i>{:else}<i class="wb-ramp" style="background: linear-gradient(90deg, {ramp.join(', ')})"></i>{/if}<span>{l.label}</span></div>
        {/each}
      </div>
    </MapCanvas>
  {:else}
    <div class="wb-over tl">{@render viewSwitch()}</div>
    <div class="wb-stack-stage">
      <div class="wb-stack" class:is-playing={playing}>
        {#each shown as l, i (l.name)}
          <div class="wb-plane" style="--i: {shown.length - 1 - i}; --delay: {(shown.length - 1 - i) * 240}ms">
            <canvas {@attach drawPlane(l)}></canvas>
            <span class="wb-plane-label">{l.label}</span>
          </div>
        {/each}
      </div>
      <!-- COPY: stack caption -->
      <p class="wb-stack-note">Each map is a layer. Read together, they show what the land is like in every spot.
        <button class="wb-btn is-quiet" type="button" onclick={() => (bench.layerView = "map")}>See them on one map</button></p>
    </div>
  {/if}
</div>
