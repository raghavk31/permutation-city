<script lang="ts">
  // The prepared design in 3D (ui/scene/design3d.ts, loaded when first shown). "aerial": framed
  // to the site from the south-west, turning slowly unless motion is reduced. "street": closer
  // in over the tallest buildings, on a March afternoon.
  import { onDestroy, onMount } from "svelte";
  import type { DesignView } from "../scene/design3d";
  import type { Prepared } from "./prepared";

  let { p, mode, label }: { p: Prepared; mode: "aerial" | "street"; label: string } = $props();
  let canvas: HTMLCanvasElement;
  let view: DesignView | null = null;
  let ready = $state(false);
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /** Closer in: over the design's tallest building, from the south-west and lower than the
   *  aerial, from the south-east, with a lower sun, so streets, plots and shadows read. */
  function closeView(v: DesignView) {
    const plots = p.chosen.plan?.plots.filter((q) => q.use === 1) ?? [];
    if (!plots.length) return v.frameSite();
    const top = plots.reduce((a, b) => (b.levels > a.levels ? b : a));
    const cx = top.ring.reduce((s, q) => s + q[0], 0) / top.ring.length, cy = top.ring.reduce((s, q) => s + q[1], 0) / top.ring.length;
    v.camera.position.set(cx + 300, cy - 480, 300);
    v.controls.target.set(cx, cy, 0);
    v.controls.update();
    v.render();
  }

  function place() {
    if (!view) return;
    view.controls.autoRotate = mode === "aerial" && !still;
    view.controls.autoRotateSpeed = 0.35;
    view.setSun({ month: 3, day: 15, clock: mode === "street" ? 17 : 16 }, p.site);
    if (mode === "street") closeView(view); else view.frameSite();
  }

  onMount(async () => {
    const { DesignView } = await import("../scene/design3d");
    // No WebGL (an old device, a locked-down browser): the still under the canvas stays.
    try { view = new DesignView(canvas); } catch (err) { console.warn("3D view unavailable", err); return; }
    view.show({ site: p.site, G: p.G, d: p.chosen, roads: null });
    place();
    ready = true;
  });
  $effect(() => { void mode; place(); });
  onDestroy(() => view?.dispose());
</script>

<div class="st-solid" class:is-ready={ready}>
  <canvas bind:this={canvas} role="img" aria-label={label}></canvas>
</div>

<style>
  .st-solid { position: absolute; inset: 0; opacity: 0; transition: opacity var(--wb-slow); }
  .st-solid.is-ready { opacity: 1; }
  canvas { display: block; width: 100%; height: 100%; }
  @media (prefers-reduced-motion: reduce) { .st-solid { transition: none; } }
</style>
