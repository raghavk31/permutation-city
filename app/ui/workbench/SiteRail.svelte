<script lang="ts">
  // The Site step's controls: find a place, pick a ready-made site, or draw one and build its
  // layers (the same builder as new.html: ui/new/service.ts).
  import { PenTool, Search, X } from "lucide";
  import { onMount } from "svelte";
  import { estimatedCells, polygonKm2 } from "../../sites/geo";
  import { search, type Place } from "../new/search";
  import * as Service from "../new/service";
  import { bench, HILLY } from "./bench.svelte";
  import Icon from "./Icon.svelte";
  import Thumb from "./Thumb.svelte";

  let query = $state("");
  let places = $state<Place[]>([]);
  let active = $state(-1);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let searching: AbortController | null = null;

  let limits = $state<Service.Limits | null>(null);
  let serviceError = $state("");
  let name = $state("");
  let job = $state<Service.Job | null>(null);
  let busy = $state(false);
  let buildError = $state("");

  const km2 = $derived(bench.polygon ? polygonKm2(bench.polygon) : 0);
  const cells = $derived(estimatedCells(km2, "hex", 20));
  const tooBig = $derived(!!limits && !!bench.polygon && (km2 > limits.max_km2 || cells > limits.max_cells));
  const stepIndex = $derived(job?.step && job.steps ? job.steps.indexOf(job.step) : -1);
  const cards = $derived(Object.entries(bench.index).filter(([id]) => !id.endsWith("-quad")));

  onMount(() => {
    Service.limits().then((l) => {
      limits = l;
      if (l.available === false) serviceError = "Building new sites isn't set up for this copy of the app.";
    }).catch((e) => (serviceError = (e as Error).message));
  });

  function onQuery() {
    clearTimeout(timer);
    active = -1;
    if (query.trim().length < 3) { places = []; return; }
    timer = setTimeout(async () => {
      searching?.abort();
      searching = new AbortController();
      try { places = await search(query.trim(), bench.map?.center(), searching.signal); }
      catch (e) { if ((e as Error).name !== "AbortError") places = []; }
    }, 280);
  }

  function go(p: Place) {
    places = [];
    query = p.name;
    if (!name) name = p.name;
    if (p.bbox && p.bbox[2] - p.bbox[0] < 0.5) bench.map?.fitBounds(p.bbox);
    else bench.map?.flyTo(p.center, 15);
  }

  function onKey(e: KeyboardEvent) {
    if (!places.length) return;
    if (e.key === "ArrowDown") { active = (active + 1) % places.length; e.preventDefault(); }
    else if (e.key === "ArrowUp") { active = (active - 1 + places.length) % places.length; e.preventDefault(); }
    else if (e.key === "Enter" && active >= 0) { go(places[active]); e.preventDefault(); }
    else if (e.key === "Escape") places = [];
  }

  function pick(id: string) {
    bench.picked = id;
    const c = bench.index[id];
    if (c?.outline?.length) {
      const xs = c.outline.map((p) => p[0]), ys = c.outline.map((p) => p[1]);
      bench.map?.fitBounds([Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]);
    }
  }

  async function build() {
    if (!bench.polygon) return;
    buildError = "";
    busy = true;
    try {
      job = await Service.submit({
        boundary: { type: "Polygon", coordinates: bench.polygon }, grid: { type: "hex", size: 20 },
        name: name.trim() || "My site", context_m: 250, sea_levels: {},
      });
      while (job.status === "queued" || job.status === "running") {
        await new Promise((r) => setTimeout(r, 3000));
        job = await Service.status(job.job!);
      }
      if (job.status === "failed") throw new Error(`The build failed: ${job.error}`);
      bench.open(job.key);
    } catch (e) {
      buildError = (e as Error).message;
    } finally {
      busy = false;
    }
  }

  const fmtArea = (v: number) => (v < 1 ? `${Math.round(v * 100)} ha` : `${v.toFixed(2)} km²`);
</script>

<div class="wb-panel">
  <div class="wb-field wb-search">
    <label for="wb-q">Find a place</label>
    <div class="wb-search-box">
      <Icon icon={Search} />
      <input id="wb-q" class="wb-input" type="search" placeholder="a neighbourhood, a street" autocomplete="off"
        role="combobox" aria-expanded={places.length > 0} aria-controls="wb-q-list" aria-autocomplete="list"
        bind:value={query} oninput={onQuery} onkeydown={onKey} />
    </div>
    {#if places.length}
      <ul class="wb-suggest" id="wb-q-list" role="listbox">
        {#each places as p, k}
          <li role="option" aria-selected={k === active}><button type="button" onclick={() => go(p)}><b>{p.name}</b> <span>{p.detail}</span></button></li>
        {/each}
      </ul>
    {/if}
  </div>

  <div class="wb-sub">
    <span class="wb-label">Ready-made sites</span>
    <div class="wb-cards">
      {#each cards as [id, c] (id)}
        <button type="button" class="wb-card" aria-pressed={bench.picked === id} onclick={() => pick(id)} ondblclick={() => bench.open(id)}>
          <span class="wb-card-pic">{#if c.thumb}<Thumb rows={c.thumb} />{/if}</span>
          <span class="wb-card-text">
            <b>{c.name.replace(/ \(.*\)$/, "")}</b>
            <span class="wb-num">{Math.round(c.design_ha)} ha · {c.relief ? HILLY[c.relief] : "relief unknown"}</span>
            {#if c.confidence === "low" || (c.terrain && c.terrain !== "fabdem")}<span class="wb-tag is-low">low confidence</span>{/if}
          </span>
        </button>
      {/each}
    </div>
  </div>

  <div class="wb-sub">
    <span class="wb-label">Or draw your own</span>
    <div class="wb-row">
      <button class="wb-btn" type="button" aria-pressed={bench.drawing} onclick={() => bench.map?.startDrawing()}>
        <Icon icon={PenTool} />{bench.polygon ? "Draw again" : "Draw the site"}</button>
      {#if bench.polygon}<button class="wb-btn is-quiet" type="button" onclick={() => bench.map?.clearDrawing()}><Icon icon={X} />Clear</button>{/if}
    </div>
    <!-- COPY: drawing hints -->
    <p class="wb-hint">
      {#if bench.drawing}Click to place corners; click the first corner to close.
      {:else if bench.polygon}Drag a corner to move it, drag a midpoint to add one, right-click a corner to remove it.
      {:else}Outline the ground you want to design on the map.{/if}
    </p>
    {#if bench.polygon}
      <p class="wb-num wb-size">{fmtArea(km2)} · about {cells.toLocaleString("en-IN")} cells</p>
      {#if tooBig && limits}
        <p class="wb-error" role="alert">Over the limit of {limits.max_km2} km² or {limits.max_cells.toLocaleString("en-IN")} cells. Draw a smaller site.</p>
      {/if}
      <div class="wb-field"><label for="wb-name">Name</label><input id="wb-name" class="wb-input" type="text" maxlength="80" placeholder="My site" bind:value={name} /></div>
      <button class="wb-btn is-primary" type="button" disabled={tooBig || busy || !!serviceError} aria-busy={busy} onclick={build}>Build its layers</button>
      {#if serviceError}<p class="wb-hint">{serviceError}</p>{/if}
    {/if}
    {#if buildError}<p class="wb-error" role="alert">{buildError}</p>{/if}
    {#if job && busy}
      <div class="wb-progress" aria-live="polite">
        <div class="wb-row"><span>{job.status === "queued" ? `Waiting: ${job.position} in the queue` : job.step ?? "Starting"}</span>
          <span>{job.seconds ?? 0} s</span></div>
        <div class="wb-track" style="--at: {job.steps ? Math.round(((stepIndex + 1) / job.steps.length) * 100) : 5}%"><b></b></div>
        <span class="wb-hint">A new site usually takes 5 to 10 minutes. You can keep this tab open and come back.</span>
      </div>
    {/if}
  </div>
</div>
