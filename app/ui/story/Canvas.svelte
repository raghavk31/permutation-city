<script lang="ts">
  // A canvas that fills its box and redraws when the box changes size. `draw` does the
  // drawing (it sizes the canvas itself, as ui/draw.ts's plan and layer do).
  import { onDestroy, onMount } from "svelte";

  let { draw, label }: { draw: (canvas: HTMLCanvasElement) => void; label: string } = $props();
  let canvas: HTMLCanvasElement;
  let ro: ResizeObserver | undefined, frame = 0;
  const redraw = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => { if (canvas.clientWidth) draw(canvas); }); };
  onMount(() => { ro = new ResizeObserver(redraw); ro.observe(canvas); });
  onDestroy(() => { ro?.disconnect(); cancelAnimationFrame(frame); });
  $effect(() => { void draw; redraw(); });
</script>

<canvas bind:this={canvas} role="img" aria-label={label}></canvas>

<style>
  canvas { display: block; width: 100%; height: 100%; }
</style>
