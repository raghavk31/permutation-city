<script lang="ts">
  // The view pinned beside the text (on a phone, above it): one per section, from the prepared
  // run. Until the run has loaded, the 3D sections show the hero still and the rest a quiet
  // "loading" line, so the text never waits for it.
  import { fade } from "svelte/transition";
  import * as E from "../../engine";
  import { layerCake } from "../diagrams/cake";
  import * as Draw from "../draw";
  import * as Paint from "../workbench/paint";
  import Canvas from "./Canvas.svelte";
  import Front from "./Front.svelte";
  import { growth, type GrowthStep, type Prepared } from "./prepared";
  import { TESTS, type Section } from "./sections";
  import Solid from "./Solid.svelte";

  let { s, p, failed }: { s: Section; p: Prepared | null; failed: string } = $props();
  const P = Draw.palette();
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const dur = still ? 0 : 200;
  const cake = layerCake({ notes: false });

  // The landform and the design's own streets over it.
  const drawLandform = (canvas: HTMLCanvasElement) => {
    if (!p) return;
    const { ctx, w, h } = Draw.fitCanvas(canvas);
    const v = Draw.view(p.site.design.x, p.site.design.y, w, h, 4, Draw.marginOf(p.site));
    ctx.fillStyle = P.paper; ctx.fillRect(0, 0, w, h);
    Paint.landform(ctx, v, p.site, p.G, P);
    ctx.save(); ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = P.ink; ctx.globalAlpha = 0.55;
    for (const st of p.chosen.plan?.streets ?? []) {
      ctx.beginPath();
      st.pts.forEach(([x, y], k) => (k ? ctx.lineTo(v.px(x), v.py(y)) : ctx.moveTo(v.px(x), v.py(y))));
      ctx.lineWidth = st.cls >= 3 ? 1.6 : 0.8; ctx.stroke();
    }
    ctx.restore();
  };
  const drawGenes = (canvas: HTMLCanvasElement) => { if (p) Draw.plan(canvas, p.site, p.chosen, P, { attractors: true }); };

  // Growth: grown when the section is first shown (three designs around the replayed fabric).
  let steps = $state<GrowthStep[] | null>(null);
  $effect(() => { if (p && s.pin === "growth" && !steps) steps = growth(p); });
  const drawStep = (k: number) => (canvas: HTMLCanvasElement) => {
    if (!p || !steps) return;
    const st = steps[k], D = p.site.design, { corners: shape } = Draw.shapeOf(p.site);
    const v = Draw.plan(canvas, p.site, st.design, P);
    const ctx = canvas.getContext("2d")!;
    Draw.fillRegions(ctx, v, D.x, D.y, Array.from({ length: p.G.n }, (_, i) => (!st.after.built[i] ? P.t.paper2 : null)), shape,
      { [P.t.paper2]: { edge: P.t.line } });
  };
  const sea = (c: E.Conditions) => (c.sea !== null ? `surge ${c.sea.toFixed(1)} m · ` : "");
</script>

<div class="st-pin-box">
  {#key s.pin}
    <div class="st-view" in:fade={{ duration: dur }} out:fade={{ duration: dur }}>
      {#if s.pin === "aerial" || s.pin === "street"}
        <img class="st-still" src="{import.meta.env.BASE_URL}hero.jpg" alt="" aria-hidden="true" />
        {#if p}<Solid {p} mode={s.pin} label={s.caption} />{/if}
      {:else if s.pin === "stack"}
        <div class="st-svg" role="img" aria-label={s.caption}>{@html cake.svg}</div>
      {:else if s.pin === "front"}
        {#if p}<Front {p} />{/if}
      {:else if s.pin === "landform"}
        {#if p}<Canvas draw={drawLandform} label={s.caption} />{/if}
      {:else if s.pin === "genes"}
        {#if p}<Canvas draw={drawGenes} label={s.caption} />{/if}
      {:else if s.pin === "growth"}
        {#if p && steps}
          <div class="st-growth">
            {#each steps as st, k (st.year)}
              {@const x = p.run.growth[k]}
              <figure>
                <div class="st-growth-map"><Canvas draw={drawStep(k)} label="The site in {st.year}" /></div>
                <figcaption>
                  <b class="wb-num">{st.year}</b>
                  <span class="wb-mono">{sea(x.conditions)}{Math.round(x.conditions.storm)} mm · +{x.conditions.heat.toFixed(1)}°C</span>
                </figcaption>
              </figure>
            {/each}
          </div>
        {/if}
      {:else if s.pin === "results"}
        <div class="st-results">
          <p class="wb-label">Being tested</p>
          <ol>
            {#each TESTS as [name, q] (name)}<li><b>{name}</b><span>{q}</span></li>{/each}
          </ol>
          <a class="wb-btn is-primary" href="{import.meta.env.BASE_URL}workbench">Try it on your own site</a>
        </div>
      {/if}
      {#if !p && s.pin !== "stack" && s.pin !== "results"}
        <p class="st-wait wb-mono">{failed || "loading the prepared run"}</p>
      {/if}
    </div>
  {/key}
  {#if s.pin !== "results"}<p class="st-cap wb-mono">{s.caption}</p>{/if}
</div>

<style>
  .st-pin-box { position: relative; height: 100%; }
  .st-view { position: absolute; inset: 0 0 32px; display: grid; place-items: center; padding: var(--wb-s5); }
  .st-view:has(.st-still) { padding: 0; }
  .st-still { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  .st-svg { width: 100%; height: 100%; display: grid; place-items: center; min-height: 0; }
  .st-svg :global(svg) { width: 100%; height: 100%; max-width: 680px; }
  .st-view > :global(canvas) { position: absolute; inset: var(--wb-s4); width: calc(100% - 2 * var(--wb-s4)); height: calc(100% - 2 * var(--wb-s4)); }
  .st-growth { width: 100%; height: 100%; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--wb-s3); }
  .st-growth figure { margin: 0; display: grid; grid-template-rows: 1fr auto; gap: var(--wb-s2); min-height: 0; }
  .st-growth-map { position: relative; min-height: 0; }
  .st-growth-map :global(canvas) { position: absolute; inset: 0; }
  .st-growth figcaption { display: grid; gap: 2px; text-align: center; }
  .st-growth figcaption span { color: var(--pc-muted); }
  .st-results { width: min(100%, 520px); display: grid; gap: var(--wb-s4); justify-items: start; }
  .st-results ol { width: 100%; }
  .st-results a { text-decoration: none; }
  .st-results ol { margin: 0; padding: 0; list-style: none; display: grid; gap: var(--wb-s3); counter-reset: t; }
  .st-results li { display: grid; grid-template-columns: 9rem 1fr; gap: var(--wb-s3); padding-bottom: var(--wb-s3); border-bottom: var(--wb-hair); }
  .st-results li span { color: var(--pc-ink-2); }
  .st-wait { position: absolute; left: 0; right: 0; bottom: var(--wb-s4); text-align: center; color: var(--pc-muted); }
  .st-cap { position: absolute; left: var(--wb-s4); right: var(--wb-s4); bottom: 8px; margin: 0; color: var(--pc-muted); text-align: center; }
  @media (max-width: 860px) {
    .st-cap { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; bottom: 6px; }
    .st-view { padding: var(--wb-s3); }
    .st-growth { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--wb-s2); }
    .st-growth figcaption span { display: none; }
    .st-results li { grid-template-columns: 1fr; gap: 2px; }
  }
</style>
