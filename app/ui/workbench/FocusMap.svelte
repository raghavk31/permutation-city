<script lang="ts">
  // The centre of a focused brief: the real place in the workbench's map, or a real section across
  // the river; a readout of the spot under the pointer.
  import type { Place } from "../../engine/focus/place";
  import { MONTHS } from "../../engine/focus/river";
  import * as Draw from "../draw";
  import { bench } from "./bench.svelte";
  import FocusSection from "./FocusSection.svelte";
  import { heatRange, paintPlace, placeFrame, VIEW_RAMP_M } from "./focuspaint";
  import MapCanvas from "./MapCanvas.svelte";

  let { place }: { place: Place } = $props();
  const f = bench.focus;
  const P = Draw.palette();
  const frame = $derived(placeFrame(place));
  const shape = $derived(Draw.shapeOf(frame));
  const viewsOn = $derived.by(() => (f.views?.results ?? []).filter((r) => !f.viewOn || r.def.id === f.viewOn));
  const viewLimit = $derived(f.viewOn ? viewsOn[0]?.limit ?? null : f.views?.limit ?? null);
  const paint = $derived((ctx: CanvasRenderingContext2D, v: Draw.View) =>
    paintPlace(ctx, v, place, { mark: f.mark, layer: f.layer, near: f.today?.near ?? null, stayOn: f.stayOn, shape,
      viewLimit, viewsOn, ruleOn: f.ruleOn, released: f.released,
      monthWet: f.month !== null ? place.year?.wet[f.month] ?? null : null, dryDays: f.month === null ? f.year?.dry ?? null : null }, P));
  const version = $derived(`${f.mark}|${f.layer}|${f.stayOn}|${!!f.today}|${f.month}|${f.viewOn}|${f.ruleOn}|${f.decisions.length}`);
  const heat = $derived(heatRange(place));
  const viewRamp = [...P.t.elevation].reverse();

  const readout = $derived.by((): [string, string][] | null => {
    const i = bench.hover, c = place.cells;
    if (i < 0 || i >= c.x.length) return null;
    if (c.band[i] === 0) return [["Here", "the river"]];
    if (c.tank[i]) return [["Here", "a tank or pond"]];
    const marks = place.brief.marks;
    const out: [string, string][] = [["ground", `${c.z[i].toFixed(1)} m above sea level`]];
    // COPY: readout of a spot
    out.push(["river reaches it at", c.band[i] <= marks.length ? marks[c.band[i] - 1].words : "none of the levels"]);
    if (f.today?.zone[i]) out.push(["status", "can change"]);
    else if (c.stay[i]) out.push(["status", "stays"]);
    out.push(["trees", `${Math.round(c.trees[i] * 100)}%`]);
    if (c.seasonal[i] > 0) out.push(["seen wet", `${Math.round(c.seasonal[i] * 100)}% of looks`]);
    if (c.lst[i] !== null) out.push(["hot-season ground", `${c.lst[i]!.toFixed(1)} °C`]);
    if (f.layer === "views" && viewLimit && Number.isFinite(viewLimit[i])) out.push(["a view limits it to", `about ${Math.round(viewLimit[i])} m`]);
    if (f.layer === "year") {
      if (f.month !== null) { const w = place.year?.wet[f.month][i] ?? -1; out.push([`wet in ${MONTHS[f.month]}`, w < 0 ? "no clear look" : `${w}% of looks`]); }
      else if (f.year && f.year.dry[i] >= 0) out.push(["dry", `about ${f.year.dry[i]} days a year`]);
    }
    if (f.layer === "rules") {
      const rules = place.brief.rules ?? [];
      const here = rules.filter((r, k) => (c.rule?.[i] ?? 0) & (1 << k) && r.rings);
      out.push(["rules", here.length ? here.map((r) => r.words).join(", ") : "none drawn here"]);
    }
    return out;
  });
</script>

{#if f.view === "section" && bench.step === "read"}
  <FocusSection {place} />
{:else}
  <MapCanvas site={frame} {paint} {version} onhover={(i) => (bench.hover = i)} label="Map of the study area: the river, what can change, what stays, and every building and street">
    {#if readout}
      <div class="wb-readout wb-over tr" aria-live="polite">
        {#each readout as [k, val]}<span>{k}</span><span>{val}</span>{/each}
      </div>
    {/if}
    <div class="wb-legend wb-over br">
      {#if f.layer === "zone"}
        <div><i style="--c: color-mix(in srgb, {P.t.accent} 22%, transparent); box-shadow: inset 0 0 0 1.5px {P.t.accent}"></i><span>can change</span></div>
        <div><i style="--c: {P.ink}"></i><span>buildings in it, staying for now</span></div>
      {:else if f.layer === "levels"}
        {#each place.brief.marks as m, k}<div><i style="--c: {[P.t.water.storage, P.t.water.flood, '#6f97c4'][place.brief.marks.length - 1 - k]}"></i><span>reached at {m.words}</span></div>{/each}
      {:else if f.layer === "year"}
        <div><i class="wb-ramp" style="background: linear-gradient(90deg, {P.blues.join(', ')})"></i><span>{f.month === null ? "dry most of the year to wet most of it" : "seldom to always wet"}</span></div>
      {:else if f.layer === "rules"}
        <div><i style="--c: transparent; background: repeating-linear-gradient(135deg, {P.t.forbidden} 0 1px, transparent 1px 4px); box-shadow: inset 0 0 0 1px {P.t.forbidden}"></i><span>no construction</span></div>
        <div><i style="--c: transparent; background: repeating-linear-gradient(45deg, {P.t.constrained} 0 1px, transparent 1px 5px); box-shadow: inset 0 0 0 1px {P.t.constrained}"></i><span>needs permission</span></div>
        <div><i style="--c: transparent; box-shadow: inset 0 0 0 1px {P.t.constrained}"></i><span>dotted: not confirmed</span></div>
      {:else if f.layer === "views"}
        <div><i class="wb-ramp" style="background: linear-gradient(90deg, {viewRamp.join(', ')})"></i><span>0 to {VIEW_RAMP_M} m or more</span></div>
        <div><i style="--c: {P.t.forbidden}"></i><span>building crossing the sight line today</span></div>
      {:else if f.layer === "walk"}
        <div><i style="--c: {P.ink}"></i><span>within a 10-minute walk of the bank</span></div>
      {:else if f.layer === "heat"}
        <div><i class="wb-ramp" style="background: linear-gradient(90deg, {P.t.heat.join(', ')})"></i><span>{heat[0].toFixed(0)} to {heat[1].toFixed(0)} °C</span></div>
      {:else if f.layer === "wet"}
        <div><i class="wb-ramp" style="background: linear-gradient(90deg, {P.blues.join(', ')})"></i><span>seldom to always wet</span></div>
      {:else}
        <div><i style="--c: {P.t.green.existing}"></i><span>darker: more trees</span></div>
      {/if}
      <div><i style="--c: transparent; box-shadow: inset 0 0 0 1.5px {P.ink}"></i><span>dashed: what stays</span></div>
      <div><i style="--c: {P.t.water.deep}"></i><span>water</span></div>
    </div>
  </MapCanvas>
{/if}
