<script lang="ts">
  // The Landform step's map: valleys (kept open for water) and their buffers, the ground's
  // height faintly under them, and the main streets every design keeps; a readout of the cell.
  import * as E from "../../engine";
  import * as Draw from "../draw";
  import * as Cake from "../new/cake";
  import { bench } from "./bench.svelte";
  import MapCanvas from "./MapCanvas.svelte";
  import * as Paint from "./paint";

  let { site }: { site: E.SiteExport } = $props();
  const P = Draw.palette();
  // svelte-ignore state_referenced_locally
  const base = E.prepare(site);
  const G = $derived(bench.ridgesOff.size ? E.withSkeleton(site, base, bench.ridgesOff) : base);
  const paint = $derived((ctx: CanvasRenderingContext2D, v: Draw.View) => Paint.landform(ctx, v, site, G, P));
  const version = $derived([...bench.ridgesOff].join(","));

  const L = $derived(site.grid.layers!);
  const readout = $derived.by(() => {
    const i = bench.hover;
    if (i < 0) return null;
    const out: [string, string][] = [];
    const v = (n: string) => L[n]?.[i];
    if (v("water")) return [["Here", "water"]] as [string, string][];
    if (v("ground") != null) out.push(["ground", Cake.format(Cake.layerInfo("ground", site), v("ground") as number)]);
    if (v("slope") != null) out.push(["slope", `${Math.round((v("slope") as number) * 100)}%`]);
    // COPY: valley readout
    out.push(["valley", v("valley_order") ? `yes, stream order ${v("valley_order")}` : v("valley_buffer") ? "beside one" : "no"]);
    if (v("flow_acc_ha") != null) out.push(["drains through here", Cake.format(Cake.layerInfo("flow_acc_ha", site), v("flow_acc_ha") as number)]);
    return out;
  });
</script>

<MapCanvas {site} {paint} {version} onhover={(i) => (bench.hover = i)} label="Map of the site's valleys, ridges and main streets">
  {#if readout}
    <div class="wb-readout wb-over tr" aria-live="polite">
      {#each readout as [k, val]}<span>{k}</span><span>{val}</span>{/each}
    </div>
  {/if}
  <div class="wb-legend wb-over br">
    <div><i class="wb-ramp" style="background: linear-gradient(90deg, {P.t.elevation.join(', ')}); opacity: .6"></i><span>ground height</span></div>
    <div><i class="wb-ramp" style="background: linear-gradient(90deg, {P.t.water.storage}, {P.t.water.flood}, {P.t.water.deep})"></i><span>valleys, small to large</span></div>
    <div><i style="--c: transparent; background: repeating-linear-gradient(-45deg, {P.t.water.deep} 0 1px, transparent 1px 5px)"></i><span>valley buffer</span></div>
    <div><i class="is-line" style="--c: {G.skeleton?.source === 'roads' ? P.t.ink2 : P.ink}; --w: 3px"></i><span>main streets</span></div>
    {#if site.skeleton?.crossings?.length}<div><i style="--c: var(--pc-surface); border-radius: 50%; box-shadow: inset 0 0 0 2px var(--pc-water)"></i><span>crossing a valley</span></div>{/if}
  </div>
</MapCanvas>
