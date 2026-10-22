<script lang="ts">
  // The inspector. Before a run there is no design to inspect, so it shows the step's intro
  // (a diagram and one sentence, folded to a line once read) and what the step is looking at.
  import * as Iso from "../diagrams/iso";
  import { bench, HILLY } from "./bench.svelte";
  import Thumb from "./Thumb.svelte";

  // COPY: step intros
  const INTRO: Record<string, { title: string; text: string; svg: () => string }> = {
    site: { title: "Site: the ground to design", text: "Pick a ready-made site or outline your own. Everything outside it stays as the city around it.", svg: () => Iso.site().svg },
    layers: { title: "Layers: what the land is like", text: "Each map of the site is a layer: ground, water, green, the city. Read together, they show what the land is like in every spot.", svg: () => Iso.layers().svg },
  };
  const intro = $derived(INTRO[bench.step]);
  const svg = $derived(intro ? intro.svg() : "");
  const folded = $derived(!!bench.introSeen[bench.step]);

  const card = $derived(bench.picked ? bench.index[bench.picked] : null);
  const meta = $derived(bench.site?.meta);
  const fmtHa = (v: number) => `${Math.round(v).toLocaleString("en-IN")} ha`;
  const TERRAIN: Record<string, string> = { fabdem: "FABDEM bare earth", "copernicus-surface": "Copernicus surface model (buildings and trees count as ground)" };
</script>

<div class="wb-insp-body">
  {#if intro}
    {#if !folded}
      <div class="wb-explain">
        <figure>{@html svg}</figure>
        <b>{intro.title}</b>
        <p>{intro.text}</p>
        <div class="wb-row"><button class="wb-btn is-quiet" type="button" onclick={() => bench.seen(bench.step)}>Got it</button></div>
      </div>
    {:else}
      <button class="wb-intro-line" type="button" onclick={() => bench.seen(bench.step, false)}>{intro.title}</button>
    {/if}
  {/if}

  {#if bench.step === "site"}
    {#if card && bench.picked}
      <div class="wb-sub">
        <span class="wb-label">Ready-made site</span>
        <b class="wb-insp-title">{card.name}</b>
        {#if card.thumb}<div class="wb-insp-thumb"><Thumb rows={card.thumb} /></div>{/if}
        <dl class="wb-facts">
          <dt>Design ground</dt><dd class="wb-num">{fmtHa(card.design_ha)}{card.cells ? ` · ${card.cells.toLocaleString("en-IN")} cells` : ""}</dd>
          <dt>Floor area to fit</dt><dd class="wb-num">{fmtHa(card.target_ha)}</dd>
          <dt>How hilly</dt><dd>{card.relief ? HILLY[card.relief] : "unknown"}{card.relief_m != null ? `, ${Math.round(card.relief_m)} m of relief` : ""}
            {#if card.confidence === "low"}<span class="wb-tag is-low">low confidence</span>{/if}</dd>
          <dt>Ground from</dt><dd>{card.terrain ? TERRAIN[card.terrain] ?? card.terrain : "unknown"}</dd>
        </dl>
        <button class="wb-btn is-primary" type="button" aria-busy={bench.loading} onclick={() => bench.open(bench.picked!)}>Open this site</button>
        {#if bench.error}<p class="wb-error" role="alert">{bench.error}</p>{/if}
      </div>
    {:else}
      <div class="wb-state">
        <b>No site picked</b>
        <!-- COPY: inspector empty, site step -->
        <span>Pick a ready-made site on the left or on the map, or draw your own. Its size, how hilly it is and where its data comes from appear here.</span>
      </div>
    {/if}
  {:else if bench.step === "layers" && meta}
    <div class="wb-sub">
      <span class="wb-label">The site</span>
      <b class="wb-insp-title">{meta.name}</b>
      <dl class="wb-facts">
        <dt>Design ground</dt><dd class="wb-num">{fmtHa(meta.design_ha)}</dd>
        {#if meta.landform}<dt>How hilly</dt><dd>{HILLY[meta.landform.relief.class]}, {Math.round(meta.landform.relief.relief_m)} m of relief
          {#if meta.landform.relief.confidence === "low"}<span class="wb-tag is-low">low confidence</span>{/if}</dd>{/if}
        <dt>Design storm</dt><dd class="wb-num">{meta.design_storm_mm} mm in a day</dd>
      </dl>
    </div>
    <div class="wb-sub">
      <span class="wb-label">Where the layers come from</span>
      <ul class="wb-credits">{#each meta.credits ?? [] as c}<li>{c}</li>{/each}</ul>
    </div>
  {/if}
</div>
