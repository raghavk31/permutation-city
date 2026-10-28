<script lang="ts">
  // The Explore step's centre. Trade-offs: the kept designs plotted (a scatter matrix of the
  // five scores, or parallel lines across every measure, brushable), beside the plan of the
  // design selected; pointing at a design anywhere shows it on the plan. Compare: two plans on
  // one camera, and their scores against the run's range. Every kind: MAP-Elites' archive.
  import * as E from "../../engine";
  import type { Kept } from "../../engine/worker";
  import * as Draw from "../draw";
  import * as X from "../explore";
  import * as Tree from "../tree";
  import { tokens as T } from "../tokens";
  import { bench } from "./bench.svelte";
  import MapCanvas from "./MapCanvas.svelte";
  import * as Paint from "./paint";

  const P = Draw.palette();
  const r = $derived(bench.result!);
  const site = $derived(bench.runSite!);
  const kept = $derived(r.kept);
  const indexOf = (name: string | null) => (name ? kept.findIndex((k) => k.name === name) : -1);

  // what colours the points: front membership, or one measure (better is deeper)
  // COPY: colour-by names
  const COLOURS = [["front", "on the front"], ...X.AXES.map((a) => [a.key, a.label])];
  const colour = $derived.by(() => {
    const a = X.AXES.find((x) => x.key === bench.exColour);
    if (!a) return undefined;
    const vs = kept.map(a.get), lo = Math.min(...vs), hi = Math.max(...vs);
    return (k: number) => { const t = hi > lo ? (vs[k] - lo) / (hi - lo) : 0.5; return Draw.ramp(T.measure, 0.2 + 0.8 * (a.up === false ? 1 - t : t)); };
  });
  const passes = $derived(X.brushed(kept, X.AXES, bench.brush));

  // the plot
  let plotBox = $state<HTMLDivElement>();
  let plot = $state<HTMLCanvasElement>();
  let width = $state(0);
  let hit: ((x: number, y: number) => number) | X.ParallelHit | null = null;
  $effect(() => {
    if (!plot || !width) return;
    const marks = { selected: indexOf(bench.exSel), hover: indexOf(bench.exHover), colour, out: (k: number) => !passes[k] };
    hit = bench.exPlot === "matrix"
      ? X.scatterMatrix(plot, kept, P, marks)
      : X.parallel(plot, kept, P, marks, X.AXES, bench.brush, 0.75);
  });
  $effect(() => {
    if (!plotBox) return;
    const ro = new ResizeObserver(() => (width = plotBox!.clientWidth));
    ro.observe(plotBox);
    return () => ro.disconnect();
  });

  let brushing: { a: number; from: number } | null = null;
  const at = (e: PointerEvent) => { const b = plot!.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; };
  function down(e: PointerEvent) {
    if (!hit) return;
    const [x, y] = at(e);
    if (bench.exPlot === "parallel") {
      const h = hit as X.ParallelHit, a = h.axisAt(x);
      if (a >= 0) { brushing = { a, from: h.valueAt(a, y) }; plot!.setPointerCapture(e.pointerId); return; }
    }
    const k = hit(x, y);
    if (k >= 0) choose(kept[k].name);
  }
  function move(e: PointerEvent) {
    if (!hit) return;
    const [x, y] = at(e);
    if (brushing) {
      const v = (hit as X.ParallelHit).valueAt(brushing.a, y);
      bench.brush = { ...bench.brush, [X.AXES[brushing.a].key]: [brushing.from, v] };
      return;
    }
    const k = hit(x, y);
    bench.exHover = k >= 0 ? kept[k].name : null;
  }
  function up() {
    if (!brushing) return;
    // a click on an axis without a drag clears its brush
    const key = X.AXES[brushing.a].key, b = bench.brush[key];
    if (!b || Math.abs(b[1] - b[0]) < 1e-9) { const { [key]: _, ...rest } = bench.brush; bench.brush = rest; }
    brushing = null;
  }
  function choose(name: string) {
    if (bench.exView === "compare") bench.pair = [bench.pair[0] ?? bench.exSel, name];
    bench.exSel = name;
  }

  // the plan: the design pointed at if it has grown, else the selected one
  const hovered = $derived(bench.exHover ? bench.grown.get(bench.exHover) ?? null : null);
  const selected = $derived(bench.designOf(bench.exSel));
  const shown = $derived(hovered ? { name: bench.exHover!, d: hovered } : selected ? { name: bench.exSel!, d: selected } : null);
  const paintOf = (d: E.Design | null, layer: Draw.PlanLayer = "plan") => (ctx: CanvasRenderingContext2D, v: Draw.View) => { if (d) Paint.design(ctx, v, site, d, P, layer); };
  const sh = $derived(shown?.d.plan?.shared ?? null);
  const ty = $derived(shown?.d.plan?.types ? E.typeSummary(shown.d.plan.types) : null);

  // compare: one camera for both plans
  let cam = $state({ k: 1, tx: 0, ty: 0 });
  const A = $derived(bench.designOf(bench.pair[0])), B = $derived(bench.designOf(bench.pair[1]));
  const span = $derived(Object.fromEntries(E.SCORE_KEYS.map((k) => { const v = kept.map((d) => d.scores[k]); return [k, [Math.min(...v), Math.max(...v)]]; })));
  const place = (k: E.ScoreKey, v: number) => {
    const [lo, hi] = span[k], t = hi > lo ? (v - lo) / (hi - lo) : 1;
    return Math.round((E.SCORES[k][2] ? t : 1 - t) * 100);
  };
  const keptOf = (name: string | null): Kept | undefined => kept.find((k) => k.name === name);

  // the archive
  const rows = $derived(r.archive ? X.archiveRows(kept, r.archive.bins) : []);
  const axes = $derived(r.archive ? r.archive.axes.map((k) => E.DESCRIPTORS[k]) : []);
  const aspect = $derived(Math.min(1.25, Draw.aspectOf(site.design.x, site.design.y)));
  $effect(() => { if (bench.exView === "archive") bench.growMany(kept.map((k) => k.name)); });
  const fmt = (v: number) => String(+v.toFixed(2));

  // the family tree: the kept designs and their ancestors (or every design), by generation
  let treeAll = $state(false);
  let treeCanvas = $state<HTMLCanvasElement>();
  let treeHover = $state(-1);
  let treeHit: ((x: number, y: number) => number) | null = null;
  const layout = $derived.by(() => {
    if (bench.exView !== "tree") return null;
    const front = new Set(kept.filter((k) => r.archive || k.rank === 1).map((k) => k.name));
    return Tree.layoutTree(r.lineage, new Set(kept.map((k) => k.name)), front, treeAll);
  });
  const placedOf = (name: string | null) => (layout && name ? layout.placed.findIndex((p) => r.lineage[p.k].name === name) : -1);
  $effect(() => {
    if (!layout || !treeCanvas || !width) return;
    treeHit = Tree.drawTree(treeCanvas, layout, r.lineage, P, { selected: placedOf(bench.exSel), hover: treeHover, shock: null });
  });
  const nameAt = (e: PointerEvent) => {
    const i = treeHit?.(e.offsetX, e.offsetY) ?? -1;
    return i >= 0 && layout ? r.lineage[layout.placed[i].k].name : null;
  };
</script>

{#if bench.exView === "compare"}
  <div class="wb-ex-compare">
    <div class="wb-ex-pair">
      {#each [[bench.pair[0], A], [bench.pair[1], B]] as [name, d], s}
        <div class="wb-ex-map">
          {#if d}
            <MapCanvas {site} paint={paintOf(d)} version={name} label="Plan of {bench.titleOf(name)}" bind:k={cam.k} bind:tx={cam.tx} bind:ty={cam.ty} />
          {/if}
          <div class="wb-over tr"><span class="wb-pill" class:is-b={s === 1}>{name ? bench.titleOf(name) : "Pick a design on the left"}{name && !d ? " · growing" : ""}</span></div>
        </div>
      {/each}
    </div>
    {#if keptOf(bench.pair[0]) && keptOf(bench.pair[1])}
      {@const a = keptOf(bench.pair[0])!}
      {@const b = keptOf(bench.pair[1])!}
      <div class="wb-ex-diff">
        <div class="wb-scores">
          {#each E.SCORE_KEYS as k}
            <div class="wb-score is-compare"><span>{E.SCORES[k][0]}</span>
              <span class="wb-track"><i style="left: {place(k, a.scores[k])}%"></i><i style="left: {place(k, b.scores[k])}%"></i></span>
              <span class="wb-v">{E.SCORES[k][1](b.scores[k])}</span></div>
          {/each}
          <!-- COPY: compare axis -->
          <div class="wb-axis"><span>run's worst</span><span>best</span></div>
        </div>
        <p class="wb-hint">Black marks the left design, colour the right; figures are the right design's. Zoom or pan either plan and the other follows.</p>
      </div>
    {/if}
  </div>
{:else}
  <div class="wb-ex">
    <div class="wb-ex-side">
      {#if bench.exView === "tree"}
        <div class="wb-row wb-between">
          <!-- COPY: tree summary -->
          <span class="wb-quiet wb-num">{r.lineage.length.toLocaleString("en-IN")} designs; {layout?.placed.length.toLocaleString("en-IN")} shown</span>
          <label class="wb-row wb-colour-by"><input type="checkbox" bind:checked={treeAll} /> every design</label>
        </div>
        <div class="wb-plot wb-tree" bind:this={plotBox}>
          <canvas bind:this={treeCanvas} aria-label="The family tree of the run, Generation 0 at the top"
            onpointermove={(e) => { const n = nameAt(e); treeHover = n ? placedOf(n) : -1; bench.exHover = n; }}
            onpointerleave={() => { treeHover = -1; bench.exHover = null; }}
            onclick={(e) => { const n = nameAt(e); if (n) choose(n); }}></canvas>
        </div>
        <!-- COPY: tree legend -->
        <p class="wb-hint">Each row is a generation. Lines run from parents to children, heavier from the parent that gave more. Orange: on the front; dark: kept. A ring: changed by mutation; a square: a newcomer. Click any design to open it.</p>
      {:else if bench.exView === "archive" && r.archive}
        <!-- COPY: archive note -->
        <p class="wb-hint">Each square holds the best design of its kind. An empty one is a kind the run never found.</p>
        <div class="wb-archive" style="grid-template-columns: 1.4em repeat({r.archive.bins}, 1fr)">
          <span class="wb-ylab" style="grid-row: span {r.archive.bins}">{axes[1].label}: {fmt(axes[1].range[0])} to {fmt(axes[1].range[1])} →</span>
          {#each rows.flat() as k, i (i)}
            {#if k < 0}<span class="wb-cell is-empty" style="aspect-ratio: {1 / aspect}"></span>
            {:else}
              {@const name = kept[k].name}
              {@const d = bench.grown.get(name)}
              <button class="wb-cell" type="button" aria-pressed={name === bench.exSel} title="{name}: quality {kept[k].quality?.toFixed(2)}"
                onclick={() => (bench.exSel = name)} onpointerenter={() => (bench.exHover = name)} onpointerleave={() => (bench.exHover = null)}>
                {#if d}<canvas {@attach (c: HTMLCanvasElement) => { Draw.plan(c, site, d, P, { aspect }); }}></canvas>{:else}<span class="wb-cell-wait" style="aspect-ratio: {1 / aspect}"></span>{/if}
              </button>
            {/if}
          {/each}
          <span></span><span class="wb-xlab" style="grid-column: span {r.archive.bins}">{axes[0].label}: {fmt(axes[0].range[0])} to {fmt(axes[0].range[1])} →</span>
        </div>
      {:else}
        <div class="wb-row wb-between">
          <div class="wb-seg" role="group" aria-label="Plot">
            <button type="button" aria-pressed={bench.exPlot === "matrix"} onclick={() => (bench.exPlot = "matrix")}>Every pair</button>
            <button type="button" aria-pressed={bench.exPlot === "parallel"} onclick={() => (bench.exPlot = "parallel")}>Every measure</button>
          </div>
          <label class="wb-row wb-colour-by"><span class="wb-quiet">Colour by</span>
            <select class="wb-input" bind:value={bench.exColour}>{#each COLOURS as [k, label]}<option value={k}>{label}</option>{/each}</select></label>
        </div>
        <div class="wb-plot" bind:this={plotBox}>
          <canvas bind:this={plot} aria-label="The designs the run kept, plotted by their scores"
            onpointerdown={down} onpointermove={move} onpointerup={up} onpointerleave={() => { if (!brushing) bench.exHover = null; }}></canvas>
        </div>
        <div class="wb-ex-key wb-row">
          {#if colour}<span class="wb-ex-ramp"></span><span class="wb-quiet">worse to better {X.AXES.find((a) => a.key === bench.exColour)?.label}</span>
          {:else}<span class="wb-dot-key"></span><span class="wb-quiet">on the front</span><span class="wb-dot-key is-off"></span><span class="wb-quiet">beaten</span><span class="wb-dot-key is-ring"></span><span class="wb-quiet">off the brief</span>{/if}
        </div>
        <!-- COPY: plot hints -->
        <p class="wb-hint">{bench.exPlot === "matrix"
          ? "Each square plots one score against another, better towards the top and right. Point at a design to see it; click to open it."
          : "Each line is a design, better towards the top. Drag along an axis to keep only the designs in that band; click the axis to clear it."}</p>
      {/if}
    </div>
    <div class="wb-ex-map">
      {#if shown}
        <MapCanvas {site} paint={paintOf(shown.d, bench.exLayer)} version={`${shown.name}|${bench.exLayer}`} label="Plan of {bench.titleOf(shown.name)}" />
      {/if}
      <!-- COPY: what the plan shows -->
      <div class="wb-over bl wb-ex-layer">
        <div class="wb-seg" role="group" aria-label="The plan shows">
          {#each [["plan", "Plan"], ["shared", "Shared ground"], ["frontage", "Frontage"], ["types", "Building types"]] as [k, label]}
            <button type="button" aria-pressed={bench.exLayer === k} onclick={() => (bench.exLayer = k as typeof bench.exLayer)}>{label}</button>
          {/each}
        </div>
        {#if bench.exLayer === "shared" && sh}
          <div class="wb-legend">
            <div><i style="--c: {P.t.green.proposed}"></i><span>shared ground, {Math.round(sh.share * 100)}% of the land</span></div>
            <div><i style="--c: transparent; box-shadow: inset 0 0 0 2px {P.t.green.existing}"></i><span>{sh.parks.length} parks reserved</span></div>
            <div><i style="--c: transparent; border: 1px dashed {P.t.green.existing}"></i><span>{sh.squares.length} squares at junctions</span></div>
            <span class="wb-quiet" title="Share of the design's floor area within a walk of each size of open space (sizes from URDPFI 2015 as NIUA gives them; walks assumed)">within a walk: doorstep green {Math.round(sh.access.doorstep * 100)}%, park {Math.round(sh.access.housing * 100)}%, neighbourhood park {Math.round(sh.access.neighbourhood * 100)}%</span>
          </div>
        {:else if bench.exLayer === "frontage"}
          <div class="wb-legend">
            <div><i class="is-line" style="--c: {P.t.frontage.active}"></i><span>active: shops at ground</span></div>
            <div><i class="is-line" style="--c: {P.t.frontage.residential}"></i><span>residential</span></div>
            <div><i class="is-line" style="--c: {P.t.frontage.green}"></i><span>green edge</span></div>
            <div><i class="is-line" style="--c: {P.t.frontage.lake}"></i><span>lake edge</span></div>
          </div>
        {:else if bench.exLayer === "types"}
          <div class="wb-legend">
            {#if ty}
              {#each E.BLOCK_TYPES as t, k}
                <div><i style="--c: {P.t.blockType[t.key]}"></i><span>{t.name}: {ty.blocks[k]} block{ty.blocks[k] === 1 ? "" : "s"}{t.key === "towers" && ty.towers ? `, ${ty.towers} tower${ty.towers === 1 ? "" : "s"}` : ""}</span></div>
              {/each}
              {#if ty.none}<div><i style="--c: {P.t.blockType.none}"></i><span>no type fits: {ty.none}</span></div>{/if}
              <span class="wb-quiet" title="Floor area over building land (FSI): what the genes asked of the typed blocks, and what their types give within the plot rules (Spacematrix)">density asked {ty.asked.toFixed(2)}, given {ty.given.toFixed(2)}</span>
            {:else}
              <span class="wb-quiet">This design was bred before building types (genome version 3).</span>
            {/if}
          </div>
        {/if}
      </div>
      <div class="wb-over tr"><span class="wb-pill">{bench.exSel ? bench.titleOf(shown?.name ?? bench.exSel) : "Click a design"}{bench.exSel && !shown ? " · growing" : ""}</span></div>
    </div>
  </div>
{/if}
