<script lang="ts">
  // The Landform step's controls: how hilly the site is (and how sure), where its main streets
  // come from, and each ridge street, which can be switched off before a run.
  import { bench, HILLY } from "./bench.svelte";

  const site = $derived(bench.site!);
  const relief = $derived(site.meta.landform?.relief);
  const sk = $derived(site.skeleton);
  const fromRoads = $derived(sk?.source === "roads");
  const valleyHa = $derived.by(() => {
    const o = site.grid.layers?.valley_order, w = site.grid.layers?.water;
    if (!o) return 0;
    let n = 0;
    for (let i = 0; i < o.length; i++) if (o[i] && !w?.[i]) n++;
    return (n * site.meta.cell_area) / 1e4;
  });
  const steep = $derived((relief as { steep_share?: number } | undefined)?.steep_share);
  const pct = (v: number) => `${(v * 100).toFixed(v < 0.01 ? 2 : 1)}%`;
</script>

<div class="wb-panel">
  {#if relief}
    <div class="wb-sub">
      <span class="wb-label">How hilly</span>
      <div class="wb-row">
        <b class="wb-big">{HILLY[relief.class]}</b>
        {#if relief.confidence === "low"}<span class="wb-tag is-low">low confidence</span>{:else}<span class="wb-tag">sure</span>{/if}
      </div>
      <dl class="wb-facts">
        {#if relief.relief_m !== undefined}<dt>Rise</dt><dd class="wb-num">{Math.round(relief.relief_m)} m, lowest to highest</dd>{/if}
        {#if relief.median_slope !== undefined}<!-- COPY: the median slope; "typical" read as wrong on a hill site with a flat valley floor -->
          <dt>Half the ground</dt><dd class="wb-num">flatter than {pct(relief.median_slope)}</dd>{/if}
        {#if steep !== undefined}<dt>Steeper than 8%</dt><dd class="wb-num">{pct(steep)} of the ground</dd>{/if}
        <dt>Valleys</dt><dd class="wb-num">{Math.round(valleyHa)} ha, kept open for water</dd>
      </dl>
      {#if relief.note}<p class="wb-hint">{relief.note}</p>{/if}
    </div>
  {/if}

  <div class="wb-sub">
    <span class="wb-label">Main streets</span>
    <!-- COPY: skeleton source -->
    {#if !sk}
      <p class="wb-hint">This site has no fixed main streets; every run lays its own.</p>
    {:else if fromRoads}
      <p class="wb-hint">Follow the existing major roads{sk.note?.includes("site's choice") ? ", as this site chose: it is built up, and its roads carry the city" : ", since the land is flat"}. Every design keeps them.</p>
    {:else}
      <p class="wb-hint">Follow the strong ridges, joined to the existing roads. Every design keeps the ones switched on.
        {#if sk.crossings?.length}They cross a valley {sk.crossings.length} time{sk.crossings.length === 1 ? "" : "s"} (rings on the map).{/if}</p>
      {#snippet ridgeList()}
        <ul class="wb-ridges">
          {#each sk.ridges ?? [] as r, k (r.id)}
            {@const on = !bench.ridgesOff.has(r.id)}
            <li class="wb-toggle-row">
              <button class="wb-switch" type="button" role="switch" aria-checked={on} aria-label="Ridge street {k + 1}" onclick={() => bench.toggleRidge(r.id)}></button>
              <span>Ridge {k + 1} <span class="wb-hint">divides {Math.round(r.strength_ha)} ha</span></span>
            </li>
          {/each}
        </ul>
      {/snippet}
      <!-- A long list (Bengaluru has 41) is folded, so the steps below stay in reach -->
      {#if (sk.ridges?.length ?? 0) > 8}
        {@const n = sk.ridges?.length ?? 0}
        <details class="wb-group"><summary>{n} ridge streets<span class="wb-meta">{n - bench.ridgesOff.size} on</span></summary>
          {@render ridgeList()}
        </details>
      {:else}
        {@render ridgeList()}
      {/if}
    {/if}
  </div>
</div>
