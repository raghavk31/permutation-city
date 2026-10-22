<script lang="ts">
  // The Layers step's centre: the switched-on layers stacked on one map at their opacities,
  // with zoom, pan and a readout of every layer under the pointer; or the Stack view, the
  // layers lifted apart like McHarg's cake (played once on a first visit).
  import { Box, Map as MapIcon, Scan } from "lucide";
  import { onDestroy, onMount } from "svelte";
  import type * as E from "../../engine";
  import * as Draw from "../draw";
  import * as Cake from "../new/cake";
  import { layerMap } from "../new/draw-cake";
  import { bench } from "./bench.svelte";
  import Icon from "./Icon.svelte";

  let { site }: { site: E.SiteExport } = $props();

  const P = Draw.palette();
  // svelte-ignore state_referenced_locally
  const all = Cake.layers(site);
  const FIRST = /^(water|ground|flood_|trees|built)$|^flood_/;
  // svelte-ignore state_referenced_locally
  if (!Object.keys(bench.layerOn).length) bench.layerOn = Object.fromEntries(all.map((l) => [l.name, FIRST.test(l.name)]));

  const shown = $derived(all.filter((l) => bench.layerOn[l.name]));
  const opacityOf = (n: string) => bench.opacity[n] ?? 0.85;

  // --- the map: a base view that fits the design ground, then zoom k and pan (tx, ty) ---
  let wrap: HTMLDivElement;
  let canvas: HTMLCanvasElement;
  let W = $state(0), H = $state(0);
  let k = $state(1), tx = $state(0), ty = $state(0);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  // svelte-ignore state_referenced_locally
  const shape = Draw.shapeOf(site);

  const base = $derived(W && H ? Draw.view(site.design.x, site.design.y, W, H, 28, Draw.marginOf(site)) : null);
  const view = $derived.by((): Draw.View | null => {
    if (!base) return null;
    return { s: base.s * k, px: (x) => base.px(x) * k + tx, py: (y) => base.py(y) * k + ty, bounds: base.bounds };
  });

  // Full drawing is slow-ish (regions are dissolved per layer), so while zooming or panning the
  // last drawing is moved and scaled, and redrawn crisply once the pointer rests.
  let last: { img: HTMLCanvasElement; k: number; tx: number; ty: number } | null = null;
  let idle: ReturnType<typeof setTimeout> | undefined;

  function render() {
    if (!view || !canvas) return;
    canvas.width = W * dpr; canvas.height = H * dpr;
    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = P.paper; ctx.fillRect(0, 0, W, H);
    const off = document.createElement("canvas");
    off.width = W * dpr; off.height = H * dpr;
    const o = off.getContext("2d")!;
    for (const l of [...shown].reverse()) {
      o.setTransform(1, 0, 0, 1, 0, 0); o.clearRect(0, 0, off.width, off.height); o.setTransform(dpr, 0, 0, dpr, 0, 0);
      const colourOf = Cake.colours(site, l, P);
      Draw.fillRegions(o, view, site.grid.x, site.grid.y, site.grid.x.map((_, i) => colourOf(i)), shape.corners);
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = opacityOf(l.name); ctx.drawImage(off, 0, 0); ctx.restore();
    }
    Draw.context(ctx, view, site.context, P, { labels: true });
    const keep = document.createElement("canvas");
    keep.width = canvas.width; keep.height = canvas.height;
    keep.getContext("2d")!.drawImage(canvas, 0, 0);
    last = { img: keep, k, tx, ty };
  }

  function quick() {
    if (!last || !canvas) return render();
    const ctx = canvas.getContext("2d")!, r = k / last.k;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = P.paper; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(last.img, (tx - last.tx * r) * dpr, (ty - last.ty * r) * dpr, canvas.width * r, canvas.height * r);
    clearTimeout(idle);
    idle = setTimeout(render, 160);
  }

  // redraw when the layers, their opacity or the size change
  $effect(() => {
    void shown; void bench.opacity; void base;
    if (bench.layerView === "map") requestAnimationFrame(render);
  });

  let ro: ResizeObserver;
  onMount(() => {
    ro = new ResizeObserver(() => { W = wrap.clientWidth; H = wrap.clientHeight; });
    ro.observe(wrap);
    if (!bench.introSeen["layers-stack"]) { bench.layerView = "stack"; bench.seen("layers-stack" as never); }
  });
  onDestroy(() => { ro?.disconnect(); clearTimeout(idle); });

  function onWheel(e: WheelEvent) {
    e.preventDefault();
    const f = Math.exp(-e.deltaY * 0.0015), nk = Math.min(Math.max(k * f, 0.6), 12);
    const r = nk / k;
    tx = e.offsetX - (e.offsetX - tx) * r; ty = e.offsetY - (e.offsetY - ty) * r; k = nk;
    quick();
  }
  let drag: { x: number; y: number; tx: number; ty: number } | null = null;
  function onDown(e: PointerEvent) { drag = { x: e.clientX, y: e.clientY, tx, ty }; canvas.setPointerCapture(e.pointerId); }
  function onMove(e: PointerEvent) {
    if (drag) { tx = drag.tx + e.clientX - drag.x; ty = drag.ty + e.clientY - drag.y; quick(); return; }
    if (view) bench.hover = Draw.cellAt(view, site.grid.x, site.grid.y, e.offsetX, e.offsetY, shape.r);
  }
  function onUp() { drag = null; }
  function fit() { k = 1; tx = 0; ty = 0; render(); }

  // --- readout, legend, scale ---
  const readout = $derived.by(() => {
    const i = bench.hover;
    if (i < 0) return null;
    return all.map((l) => ({ l, on: !!bench.layerOn[l.name], v: Cake.format(l, site.grid.layers![l.name][i]) }));
  });
  const scale = $derived.by(() => {
    if (!view) return null;
    const target = 90 / view.s, nice = [10, 20, 50, 100, 200, 500, 1000, 2000].find((n) => n >= target * 0.6) ?? 2000;
    return { m: nice, px: nice * view.s };
  });

  // --- the stack ---
  let playing = $state(false);
  let stackTimer: ReturnType<typeof setTimeout> | undefined;
  const drawPlane = (l: Cake.Layer) => (c: HTMLCanvasElement) => { layerMap(c, site, l, P); };
  $effect(() => {
    if (bench.layerView !== "stack") return;
    playing = true;
    clearTimeout(stackTimer);
    stackTimer = setTimeout(() => (playing = false), shown.length * 240 + 500);
  });
  const fmtM = (m: number) => (m >= 1000 ? `${m / 1000} km` : `${m} m`);
</script>

<div class="wb-layers-centre">
  <div class="wb-over tl">
    <div class="wb-seg" role="group" aria-label="View">
      <button type="button" aria-pressed={bench.layerView === "map"} onclick={() => (bench.layerView = "map")}><Icon icon={MapIcon} size={14} />Map</button>
      <button type="button" aria-pressed={bench.layerView === "stack"} onclick={() => (bench.layerView = "stack")}><Icon icon={Box} size={14} />Stack</button>
    </div>
    {#if bench.layerView === "map"}<button class="wb-btn" type="button" onclick={fit}><Icon icon={Scan} />Fit</button>{/if}
  </div>

  <div class="wb-canvas-wrap" bind:this={wrap} hidden={bench.layerView !== "map"}>
    <canvas bind:this={canvas} style="width: {W}px; height: {H}px" aria-label="Map of the site's layers: {shown.map((l) => l.label).join(', ')}"
      onwheel={onWheel} onpointerdown={onDown} onpointermove={onMove} onpointerup={onUp} onpointerleave={() => { onUp(); bench.hover = -1; }}></canvas>
  </div>

  {#if bench.layerView === "map"}
    {#if readout}
      <div class="wb-readout wb-over tr" aria-live="polite">
        {#each readout.filter((r) => r.on) as r}<span>{r.l.label}</span><span>{r.v}</span>{/each}
        {#each readout.filter((r) => !r.on && r.v !== "no value") as r}<span class="wb-off">{r.l.label}</span><span class="wb-off">{r.v}</span>{/each}
      </div>
    {/if}
    <div class="wb-over bl">
      <div class="wb-north" role="img" aria-label="North is up"><span>N</span></div>
      {#if scale}<div class="wb-scalebar" style="--w: {Math.round(scale.px)}px"><b></b><span><span>0</span><span>{fmtM(scale.m)}</span></span></div>{/if}
    </div>
    <div class="wb-legend wb-over br">
      {#each shown as l (l.name)}
        {@const ramp = Cake.rampOf(l, P)}
        <div>{#if l.kind === "flag"}<i style="--c: {ramp[Math.min(3, ramp.length - 1)]}"></i>{:else}<i class="wb-ramp" style="background: linear-gradient(90deg, {ramp.join(', ')})"></i>{/if}<span>{l.label}</span></div>
      {/each}
    </div>
  {:else}
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
