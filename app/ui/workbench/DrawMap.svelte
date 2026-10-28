<script lang="ts">
  // The Draw step's map: what the rules allow, the main streets and today's buildings (the
  // canvas), with the moves and the one being drawn over it (an SVG in the same frame, so
  // drawing redraws nothing below). Click to add points; click the last point again (or
  // Enter) to finish a line, the first point to close an area; Backspace takes a point back,
  // Esc stops. The keep tool picks a building standing on the design ground.
  import * as E from "../../engine";
  import { inside, type Line, type Pt } from "../../engine/plan/geom";
  import * as Draw from "../draw";
  import * as Sites from "../sites";
  import { bench } from "./bench.svelte";
  import MapCanvas from "./MapCanvas.svelte";
  import * as Paint from "./paint";

  let { site }: { site: E.SiteExport } = $props();
  const P = Draw.palette();

  const res = $derived(Sites.withRules(site, bench.rules!).result);
  const G = $derived(Sites.groundOf(site, bench.ridgesOff));
  const paint = $derived((ctx: CanvasRenderingContext2D, v: Draw.View) => Paint.drawBase(ctx, v, site, res, G, P));
  const version = $derived(JSON.stringify([bench.rules, [...bench.ridgesOff]]));

  let view = $state<Draw.View | null>(null);
  let pointer = $state<Pt | null>(null);
  let sketch = $state<Pt[]>([]);
  // a tool picked again, or another step: start afresh
  $effect(() => { void bench.tool; sketch = []; });

  const isLine = (k: E.MoveKind | null) => k === "street" || k === "spine";
  const conflicted = $derived(new Set((bench.drawn?.conflicts ?? []).map((c) => c.move)));
  const ground = $derived(site.context.buildings?.ground);

  /** The building standing on the design ground at a point (inside it, or within 6 m). */
  function buildingAt(p: Pt): number {
    if (!ground) return -1;
    let best = -1, bd = 6;
    for (let k = 0; k < ground.rings.length; k++) {
      const r = ground.rings[k], ring: Line = Array.from({ length: r.length / 2 }, (_, i): Pt => [r[2 * i], r[2 * i + 1]]);
      if (inside(ring, p)) return k;
      for (const [x, y] of ring) { const d = Math.hypot(x - p[0], y - p[1]); if (d < bd) { bd = d; best = k; } }
    }
    return best;
  }
  const ringOf = (k: number): Line => { const r = ground!.rings[k]; return Array.from({ length: r.length / 2 }, (_, i): Pt => [r[2 * i], r[2 * i + 1]]); };

  function finish() {
    const t = bench.tool;
    if (!t) return;
    if (isLine(t) ? sketch.length < 2 : sketch.length < 3) return;
    // a plain copy: the moves travel to the run's workers, which can't take reactive state
    const pts = $state.snapshot(sketch) as Pt[];
    bench.addMove(t === "spine" ? { kind: t, pts, width: bench.spineWidth } : t === "street" ? { kind: t, pts, cls: bench.streetCls } : { kind: t, pts });
    sketch = [];
  }

  function pick(x: number, y: number) {
    const t = bench.tool;
    if (!t || !view) return;
    const p: Pt = [x, y], px = 10 / view.s;  // 10 pixels, in metres
    if (t === "keep") {
      const k = buildingAt(p);
      if (k < 0) return;
      const had = bench.moves.find((m) => m.kind === "keep" && m.building === k);
      if (had) bench.removeMove(had.id); else bench.addMove({ kind: "keep", building: k, pts: ringOf(k) });
      return;
    }
    const last = sketch[sketch.length - 1];
    if (last && Math.hypot(last[0] - x, last[1] - y) < px) return finish();
    if (!isLine(t) && sketch.length >= 3 && Math.hypot(sketch[0][0] - x, sketch[0][1] - y) < px) return finish();
    sketch = [...sketch, p];
  }

  function onKey(e: KeyboardEvent) {
    if (bench.step !== "draw" || !bench.tool || (e.target as HTMLElement).closest?.("input, select, textarea")) return;
    if (e.key === "Enter") finish();
    else if (e.key === "Escape") { if (sketch.length) sketch = []; else bench.tool = null; }
    else if (e.key === "Backspace") sketch = sketch.slice(0, -1);
    else return;
    e.preventDefault();
  }

  // drawing in the view's frame
  const xy = (v: Draw.View, pts: Line) => pts.map(([x, y]) => `${v.px(x).toFixed(1)},${v.py(y).toFixed(1)}`).join(" ");
  const WIDTH: Record<number, number> = { 2: 12, 3: 18 };  // street widths, metres (docs/streets.md)
  const hint = $derived.by(() => {
    // COPY: drawing hints
    const t = bench.tool;
    if (!t) return "";
    if (t === "keep") return "Click a building standing today to keep it; click it again to let it go.";
    if (isLine(t)) return sketch.length < 2 ? "Click points along it." : "Click the last point again, or press Enter, to finish. Esc stops.";
    return sketch.length < 3 ? "Click the corners." : "Click the first corner, or press Enter, to close it. Esc stops.";
  });
  const hoverBuilding = $derived(bench.tool === "keep" && pointer ? buildingAt(pointer) : -1);
</script>

<svelte:window onkeydown={onKey} />

<MapCanvas {site} {paint} {version} onpick={pick} onpoint={(x, y) => (pointer = [x, y])} onview={(v) => (view = v)}
  label="Map for drawing moves: what the rules allow, the main streets and today's buildings">
  {#if view}
    {@const v = view}
    <svg class="wb-draw-svg" class:is-tool={!!bench.tool} aria-hidden="true">
      {#each bench.moves as m (m.id)}
        {@const bad = conflicted.has(m.id)}
        {@const hot = bench.moveHover === m.id}
        <g class="wb-move" data-kind={m.kind} class:is-bad={bad} class:is-hot={hot}>
          {#if m.kind === "street"}
            <polyline points={xy(v, m.pts)} class="case" style="stroke-width: {Math.max(WIDTH[m.cls ?? 3] * v.s, 3) + 3}px" />
            <polyline points={xy(v, m.pts)} class="body" style="stroke-width: {Math.max(WIDTH[m.cls ?? 3] * v.s, 3)}px" />
          {:else if m.kind === "spine"}
            <polyline points={xy(v, m.pts)} class="band" style="stroke-width: {Math.max((m.width ?? 30) * v.s, 4)}px" />
            <polyline points={xy(v, m.pts)} class="mid" />
          {:else}
            <polygon points={xy(v, m.pts)} />
          {/if}
          {#if bad}
            {@const [x, y] = m.pts[0]}
            <circle class="flag" cx={v.px(x)} cy={v.py(y)} r="7" /><text class="flag-t" x={v.px(x)} y={v.py(y) + 4}>!</text>
          {/if}
        </g>
      {/each}
      {#if hoverBuilding >= 0}
        <polygon class="wb-move-hover" points={xy(v, ringOf(hoverBuilding))} />
      {/if}
      {#if sketch.length}
        <polyline class="wb-sketch" points={xy(v, pointer ? [...sketch, pointer] : sketch)} />
        {#if !isLine(bench.tool) && sketch.length >= 2 && pointer}
          <polyline class="wb-sketch is-close" points={xy(v, [pointer, sketch[0]])} />
        {/if}
        {#each sketch as [x, y], k}
          <rect class="wb-vertex" class:is-first={k === 0 && !isLine(bench.tool)} x={v.px(x) - 4} y={v.py(y) - 4} width="8" height="8" rx="1.5" />
        {/each}
      {/if}
    </svg>
  {/if}
  {#if hint}<div class="wb-readout wb-over tr" aria-live="polite"><span>{E.MOVE_NAMES[bench.tool!]}</span><span>{hint}</span></div>{/if}
  <div class="wb-legend wb-over br">
    <div><i class="wb-hatch-forbidden" style="box-shadow: inset 0 0 0 1px var(--pc-forbidden)"></i><span>never built</span></div>
    <div><i class="wb-hatch-constrained" style="box-shadow: inset 0 0 0 1px var(--pc-constrained)"></i><span>built with limits</span></div>
    <div><i style="--c: transparent; box-shadow: inset 0 0 0 1px var(--pc-ink-2)"></i><span>a building today</span></div>
    <div><i style="--c: var(--pc-ink-2); height: 3px"></i><span>main streets</span></div>
  </div>
</MapCanvas>
