<script lang="ts">
  // The Explore step's controls: which view; the representatives (the most distinct designs on
  // the front, each with why it stands apart and a glyph of its scores), or every family; a
  // jump to the best design on any one score or measure; the filters set by brushing.
  import * as E from "../../engine";
  import * as Draw from "../draw";
  import * as X from "../explore";
  import * as Fam from "../families";
  import { bench } from "./bench.svelte";

  const P = Draw.palette();
  const r = $derived(bench.result!);
  const site = $derived(bench.runSite!);
  const aspect = $derived(Math.min(1.25, Draw.aspectOf(site.design.x, site.design.y)));
  const pool = $derived(bench.reps.map((x) => x.design));
  const fams = $derived((r.families ?? []).filter((f) => f.design));
  const shown = $derived(bench.showAll
    ? fams.map((f) => ({ name: f.name, title: bench.titleOf(f.name), design: f.design!, like: f.size }))
    : bench.reps);
  const keep = $derived(X.brushed(r.kept, [...X.AXES, ...metricAxes()], bench.brush));
  const matching = $derived(keep.filter(Boolean).length);
  const brushes = $derived(Object.keys(bench.brush).length);

  function metricAxes() { return X.GROUPS.flatMap(([, ks]) => X.metricAxes(ks.filter((k) => k in (r.kept[0]?.metrics ?? {})))); }

  // COPY: view names
  const VIEWS = $derived([["tradeoffs", "Trade-offs"], ["compare", "Compare"], ...(r.archive ? [["archive", "Every kind"]] : [])] as [typeof bench.exView, string][]);

  function pick(name: string) {
    if (bench.exView === "compare") bench.pair = [bench.pair[0] ?? bench.exSel, name];
    bench.exSel = name;
  }

  /** The best design on one measure (among those on the brief, if any are). */
  function best(axis: X.Axis) {
    const e = X.extremes(r.kept, [axis])[0];
    if (!e) return;
    pick(r.kept[axis.up === false ? e.lo : e.hi].name);
  }
  let measure = $state("");
</script>

<div class="wb-panel">
  <div class="wb-seg" role="group" aria-label="View">
    {#each VIEWS as [k, label]}
      <button type="button" aria-pressed={bench.exView === k} onclick={() => {
        if (k === "compare" && !bench.pair[0]) bench.pair = [bench.exSel, bench.reps.find((x) => x.name !== bench.exSel)?.name ?? null];
        bench.exView = k;
      }}>{label}</button>
    {/each}
  </div>
  {#if bench.exView === "compare"}
    <!-- COPY: compare hint -->
    <p class="wb-hint">The left map is the design you had open. Pick a design below for the right.</p>
  {/if}

  <div class="wb-sub">
    <span class="wb-label">{bench.showAll ? `All ${fams.length} families` : "The most distinct"}</span>
    <div class="wb-cards">
      {#each shown as s (s.name)}
        <button class="wb-card wb-rep" type="button" aria-pressed={s.name === (bench.exView === "compare" ? bench.pair[1] : bench.exSel)}
          onclick={() => pick(s.name)} onpointerenter={() => (bench.exHover = s.name)} onpointerleave={() => (bench.exHover = null)}>
          <span class="wb-card-pic"><canvas {@attach (c: HTMLCanvasElement) => { Draw.plan(c, site, s.design, P, { aspect }); }}></canvas></span>
          <span class="wb-card-text">
            <b>{s.title}</b>
            {@html Fam.glyph(s.design, pool.length ? pool : [s.design])}
            <!-- COPY: family size -->
            <span class="wb-num">{s.like} like it on the front</span>
          </span>
        </button>
      {/each}
    </div>
    {#if fams.length > bench.reps.length}
      <button class="wb-btn is-quiet wb-start" type="button" onclick={() => (bench.showAll = !bench.showAll)}>
        {bench.showAll ? `Only the ${bench.reps.length} most distinct` : `Show all ${fams.length} families`}</button>
    {/if}
  </div>

  <div class="wb-sub">
    <span class="wb-label">Jump to the best on</span>
    <div class="wb-chips">
      {#each X.SCORE_AXES as a}
        <button class="wb-chip" type="button" onclick={() => best(a)}>{a.label}</button>
      {/each}
    </div>
    <select class="wb-input" aria-label="Jump to the best on any measure" bind:value={measure}
      onchange={() => { const a = metricAxes().find((x) => x.key === measure); if (a && a.up !== null) best(a); measure = ""; }}>
      <option value="">any other measure…</option>
      {#each X.GROUPS as [g, ks]}
        <optgroup label={g}>
          {#each X.metricAxes(ks.filter((k) => k in (r.kept[0]?.metrics ?? {}) && (E.METRICS[k] as E.Metric).up !== null)) as a}
            <option value={a.key}>{a.label}</option>
          {/each}
        </optgroup>
      {/each}
    </select>
  </div>

  {#if brushes}
    <div class="wb-sub">
      <span class="wb-label">Filters</span>
      <!-- COPY: brush summary -->
      <p class="wb-hint wb-num">{matching} of {r.kept.length} designs pass {brushes === 1 ? "the filter" : `all ${brushes} filters`}.</p>
      <button class="wb-btn wb-start" type="button" onclick={() => (bench.brush = {})}>Clear the filters</button>
    </div>
  {/if}
</div>
