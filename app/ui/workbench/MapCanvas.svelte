<script lang="ts">
  // The workbench's site map: a canvas framed to the design ground, with zoom (wheel), pan
  // (drag), fit, a scale bar and north, and the cell under the pointer reported for readouts.
  // What is drawn comes from `paint`; overlays (legend, readout, tools) are children.
  import { Scan } from "lucide";
  import { onDestroy, onMount, type Snippet } from "svelte";
  import type * as E from "../../engine";
  import * as Draw from "../draw";
  import Icon from "./Icon.svelte";

  // k, tx, ty (zoom and pan) can be bound, so two maps share one camera (Explore's compare)
  // onpick: a click (not a drag) on the map, in site metres
  // bottom: pixels along the bottom that something sits over (Evolve's strip), left out of the fit
  let { site, paint, version, label, onhover, onpick, tools, children, k = $bindable(1), tx = $bindable(0), ty = $bindable(0), bottom = 0 }: {
    site: E.SiteExport; paint: (ctx: CanvasRenderingContext2D, v: Draw.View) => void; version: unknown;
    label: string; onhover?: (i: number) => void; onpick?: (x: number, y: number) => void; tools?: Snippet; children?: Snippet;
    k?: number; tx?: number; ty?: number; bottom?: number;
  } = $props();

  let wrap: HTMLDivElement;
  let canvas: HTMLCanvasElement;
  let W = $state(0), H = $state(0);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const P = Draw.palette();
  // svelte-ignore state_referenced_locally
  const shape = Draw.shapeOf(site);

  const base = $derived(W && H ? Draw.view(site.design.x, site.design.y, W, Math.max(H / 2, H - bottom), 28, Draw.marginOf(site)) : null);
  const view = $derived.by((): Draw.View | null => base
    ? { s: base.s * k, px: (x) => base.px(x) * k + tx, py: (y) => base.py(y) * k + ty, bounds: base.bounds } : null);

  // Full drawing dissolves regions per layer, so while zooming or panning the last drawing is
  // moved and scaled, and redrawn crisply once the pointer rests.
  let last: { img: HTMLCanvasElement; k: number; tx: number; ty: number } | null = null;
  let idle: ReturnType<typeof setTimeout> | undefined;

  function render() {
    if (!view || !canvas) return;
    canvas.width = W * dpr; canvas.height = H * dpr;
    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = P.paper; ctx.fillRect(0, 0, W, H);
    paint(ctx, view);
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

  $effect(() => {
    void version; void base; void paint;
    requestAnimationFrame(render);
  });

  // a camera moved from outside (a bound twin) is followed quickly, then redrawn crisply
  $effect(() => {
    void k; void tx; void ty;
    if (last && (last.k !== k || last.tx !== tx || last.ty !== ty)) quick();
  });

  let ro: ResizeObserver;
  onMount(() => {
    ro = new ResizeObserver(() => { W = wrap.clientWidth; H = wrap.clientHeight; });
    ro.observe(wrap);
    // a font that arrives later (Noto Sans Bengali for place names) needs a fresh drawing
    document.fonts.addEventListener("loadingdone", render);
  });
  onDestroy(() => { ro?.disconnect(); clearTimeout(idle); document.fonts.removeEventListener("loadingdone", render); });

  function onWheel(e: WheelEvent) {
    e.preventDefault();
    const nk = Math.min(Math.max(k * Math.exp(-e.deltaY * 0.0015), 0.6), 12), r = nk / k;
    tx = e.offsetX - (e.offsetX - tx) * r; ty = e.offsetY - (e.offsetY - ty) * r; k = nk;
    quick();
  }
  let drag: { x: number; y: number; tx: number; ty: number } | null = null;
  function onDown(e: PointerEvent) { drag = { x: e.clientX, y: e.clientY, tx, ty }; canvas.setPointerCapture(e.pointerId); }
  function onMove(e: PointerEvent) {
    if (drag) { tx = drag.tx + e.clientX - drag.x; ty = drag.ty + e.clientY - drag.y; quick(); return; }
    if (view && onhover) onhover(Draw.cellAt(view, site.grid.x, site.grid.y, e.offsetX, e.offsetY, shape.r));
  }
  function onUp(e?: PointerEvent) {
    if (e && drag && onpick && view && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 4) {
      // the view is linear in each axis: invert it from two points
      const ax = view.px(1) - view.px(0), ay = view.py(1) - view.py(0);
      onpick((e.offsetX - view.px(0)) / ax, (e.offsetY - view.py(0)) / ay);
    }
    drag = null;
  }
  function fit() { k = 1; tx = 0; ty = 0; render(); }
  function onKey(e: KeyboardEvent) {
    const step = 40;
    if (e.key === "ArrowLeft") tx += step; else if (e.key === "ArrowRight") tx -= step;
    else if (e.key === "ArrowUp") ty += step; else if (e.key === "ArrowDown") ty -= step;
    else if (e.key === "+" || e.key === "=") { k = Math.min(k * 1.25, 12); } else if (e.key === "-") { k = Math.max(k / 1.25, 0.6); }
    else if (e.key === "0") return fit();
    else return;
    e.preventDefault(); quick();
  }

  const scale = $derived.by(() => {
    if (!view) return null;
    const target = 90 / view.s, nice = [10, 20, 50, 100, 200, 500, 1000, 2000].find((n) => n >= target * 0.6) ?? 2000;
    return { m: nice, px: nice * view.s };
  });
  const fmtM = (m: number) => (m >= 1000 ? `${m / 1000} km` : `${m} m`);
</script>

<div class="wb-canvas-wrap" bind:this={wrap}>
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <canvas bind:this={canvas} style="width: {W}px; height: {H}px" aria-label={label} tabindex="0"
    onwheel={onWheel} onpointerdown={onDown} onpointermove={onMove} onpointerup={onUp} onkeydown={onKey}
    onpointerleave={() => { onUp(); onhover?.(-1); }}></canvas>
</div>
<div class="wb-over tl">
  {@render tools?.()}
  <button class="wb-btn" type="button" onclick={fit} title="Fit to the site (0)"><Icon icon={Scan} />Fit</button>
</div>
<div class="wb-over bl">
  <div class="wb-north" role="img" aria-label="North is up"><span>N</span></div>
  {#if scale}<div class="wb-scalebar" style="--w: {Math.round(scale.px)}px"><b></b><span><span>0</span><span>{fmtM(scale.m)}</span></span></div>{/if}
</div>
{@render children?.()}
