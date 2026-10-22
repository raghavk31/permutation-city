<script lang="ts">
  // The Brief step's map: what the land allows under the brief (its height limit and rule
  // changes applied), with what the brief asks for beside it.
  import type * as E from "../../engine";
  import * as Draw from "../draw";
  import { bench } from "./bench.svelte";
  import MapCanvas from "./MapCanvas.svelte";
  import * as Paint from "./paint";

  let { site }: { site: E.SiteExport } = $props();
  const P = Draw.palette();
  const u = $derived(bench.underBrief());
  const paint = $derived((ctx: CanvasRenderingContext2D, v: Draw.View) => { if (u) Paint.rules(ctx, v, u.site, u.result, P, null); });
  const version = $derived(JSON.stringify([bench.rules, bench.brief]));
  const meta = $derived(u?.site.meta);
  // the site's own target (on buildable ground, pc/fitness.py) scaled by the brief's ratio,
  // unless the brief names a floor area outright
  const target = $derived(meta ? (meta.target_floor_area_ha ?? site.meta.target_ha * (meta.target_far / site.meta.target_far)) : 0);
  const fmt = (v: number) => Math.round(v).toLocaleString("en-IN");
</script>

<MapCanvas {site} {paint} {version} onhover={(i) => (bench.hover = i)} label="Map of what the land allows under the brief">
  {#if meta}
    <div class="wb-readout wb-over tr">
      <!-- COPY: brief summary on the map -->
      <span>Floor area to fit</span><span><b>{fmt(target)} ha</b></span>
      <span>on design ground of</span><span>{fmt(meta.design_ha)} ha</span>
      {#if bench.brief?.height_limit_levels}<span>Height limit</span><span>{bench.brief.height_limit_levels.value} levels</span>{/if}
      <span>Design storm</span><span>{meta.design_storm_mm} mm in a day</span>
      {#if bench.brief?.rule_changes?.length}<span>Rules changed</span><span>{bench.brief.rule_changes.length}</span>{/if}
    </div>
  {/if}
  <div class="wb-legend wb-over br">
    <div><i class="wb-hatch-forbidden" style="box-shadow: inset 0 0 0 1px var(--pc-forbidden)"></i><span>never built</span></div>
    <div><i class="wb-hatch-constrained" style="box-shadow: inset 0 0 0 1px var(--pc-constrained)"></i><span>built with limits</span></div>
    <div><i style="--c: var(--pc-surface-2); box-shadow: inset 0 0 0 1px var(--pc-ink-2)"></i><span>free to design</span></div>
  </div>
</MapCanvas>
