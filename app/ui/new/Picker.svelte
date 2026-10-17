<script lang="ts">
  // Find a place, outline the site, choose the grid, and build its layers.
  import { Map as MapLibre, NavigationControl } from "maplibre-gl";
  import { onDestroy, onMount } from "svelte";
  import { TerraDraw, TerraDrawPolygonMode, TerraDrawSelectMode } from "terra-draw";
  import { TerraDrawMapLibreGLAdapter } from "terra-draw-maplibre-gl-adapter";
  import { cellAreaOf } from "../../engine";
  import * as Sites from "../sites";
  import { estimatedCells, polygonKm2 } from "./geo";
  import { search, type Place } from "./search";
  import * as Service from "./service";

  let { onbuilt }: { onbuilt: (key: string) => void } = $props();

  const IMAGERY = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
  let mapEl: HTMLDivElement;
  let map: MapLibre | null = null;
  let draw: TerraDraw | null = null;

  let limits = $state<Service.Limits | null>(null);
  let serviceError = $state("");
  let ready = $state<Record<string, { name: string; design_ha: number }>>({});

  let query = $state("");
  let places = $state<Place[]>([]);
  let searching: AbortController | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  let polygon = $state<number[][][] | null>(null);
  let drawing = $state(false);
  let imagery = $state(false);
  let name = $state("");
  type GridType = "hex" | "quad";
  const SIZES: Record<GridType, number[]> = { hex: [15, 20, 25, 30], quad: [15, 20, 25, 30, 35] };
  let gridType = $state<GridType>("hex");
  let cellSize = $state(20);
  let coastal = $state(false);

  let job = $state<Service.Job | null>(null);
  let submitError = $state("");
  let busy = $state(false);

  const km2 = $derived(polygon ? polygonKm2(polygon) : 0);
  const cells = $derived(estimatedCells(km2, gridType, cellSize));
  const offered = $derived(limits ? SIZES[gridType].filter((s) => s >= limits!.cell_size[0] && s <= limits!.cell_size[1]) : SIZES[gridType]);

  function setGridType(t: GridType) {
    gridType = t;
    if (!SIZES[t].includes(cellSize)) cellSize = 20;
  }
  const tooBig = $derived(!!limits && !!polygon && (km2 > limits.max_km2 || cells > limits.max_cells));

  onMount(() => {
    map = new MapLibre({
      container: mapEl, style: "https://tiles.openfreemap.org/styles/positron",
      center: [72.85, 18.96], zoom: 12, attributionControl: { compact: true },
    });
    map.addControl(new NavigationControl({ showCompass: false }), "top-right");
    map.on("load", () => {
      map!.addSource("imagery", { type: "raster", tiles: [IMAGERY], tileSize: 256, maxzoom: 19,
        attribution: "Imagery: Esri, Maxar, Earthstar Geographics, and the GIS User Community" });
      map!.addLayer({ id: "imagery", type: "raster", source: "imagery", layout: { visibility: "none" } });
      draw = new TerraDraw({
        adapter: new TerraDrawMapLibreGLAdapter({ map: map! }),
        modes: [
          new TerraDrawPolygonMode({ styles: { fillColor: "#eb6834", fillOpacity: 0.15, outlineColor: "#eb6834", outlineWidth: 2 } }),
          new TerraDrawSelectMode({ flags: { polygon: { feature: { draggable: true,
            coordinates: { midpoints: true, draggable: true, deletable: true } } } } }),
        ],
      });
      draw.start();
      const sync = () => {
        const f = draw!.getSnapshot().find((x) => x.geometry.type === "Polygon");
        polygon = f ? (f.geometry.coordinates as number[][][]) : null;
      };
      draw.on("finish", () => { sync(); drawing = false; draw!.setMode("select"); });
      draw.on("change", sync);
    });
    Service.limits().then((l) => (limits = l)).catch((e) => (serviceError = e.message));
    fetch(`${Sites.DATA}sites.json`).then((r) => r.json()).then((s) => (ready = s)).catch(() => {});
  });

  onDestroy(() => { draw?.stop(); map?.remove(); });

  function startDrawing() {
    if (!draw) return;
    draw.clear();
    polygon = null;
    draw.setMode("polygon");
    drawing = true;
  }

  function clearDrawing() {
    draw?.clear();
    draw?.setMode("select");
    polygon = null;
    drawing = false;
  }

  function toggleImagery() {
    imagery = !imagery;
    map?.setLayoutProperty("imagery", "visibility", imagery ? "visible" : "none");
  }

  function onQuery() {
    clearTimeout(timer);
    if (query.trim().length < 3) { places = []; return; }
    timer = setTimeout(async () => {
      searching?.abort();
      searching = new AbortController();
      try {
        const c = map?.getCenter();
        places = await search(query.trim(), c ? [c.lng, c.lat] : undefined, searching.signal);
      } catch (e) {
        if ((e as Error).name !== "AbortError") places = [];
      }
    }, 300);
  }

  function go(p: Place) {
    places = [];
    query = p.name;
    if (!name) name = p.name;
    if (p.bbox && p.bbox[2] - p.bbox[0] < 0.5) map?.fitBounds([[p.bbox[0], p.bbox[1]], [p.bbox[2], p.bbox[3]]], { padding: 40, maxZoom: 16 });
    else map?.flyTo({ center: p.center, zoom: 15 });
  }

  async function build() {
    if (!polygon) return;
    submitError = "";
    busy = true;
    try {
      job = await Service.submit({
        boundary: { type: "Polygon", coordinates: polygon }, grid: { type: gridType, size: cellSize },
        name: name.trim() || "My site", context_m: 250, sea_levels: coastal ? Service.COASTAL_SEA_LEVELS : {},
      });
      while (job.status === "queued" || job.status === "running") {
        await new Promise((r) => setTimeout(r, 3000));
        job = await Service.status(job.job!);
      }
      if (job.status === "failed") throw new Error(`The build failed: ${job.error}`);
      onbuilt(job.key);
    } catch (e) {
      submitError = (e as Error).message;
    } finally {
      busy = false;
    }
  }

  const fmtKm2 = (v: number) => (v < 1 ? `${Math.round(v * 100)} ha` : `${v.toFixed(2)} km²`);
  const stepIndex = $derived(job?.step && job.steps ? job.steps.indexOf(job.step) : -1);
</script>

<section class="pcn-picker">
  <div class="pcn-search">
    <label for="pcn-q" class="pc-muted">Find a place</label>
    <input id="pcn-q" type="search" placeholder="a neighbourhood, a street, a landmark" autocomplete="off"
      bind:value={query} oninput={onQuery} />
    {#if places.length}
      <ul class="pcn-results" role="listbox">
        {#each places as p}
          <li><button type="button" onclick={() => go(p)}><b>{p.name}</b> <span class="pc-muted">{p.detail}</span></button></li>
        {/each}
      </ul>
    {/if}
  </div>

  <div class="pcn-map-wrap">
    <div class="pcn-map" bind:this={mapEl}></div>
    <div class="pcn-map-tools">
      <button type="button" onclick={startDrawing} aria-pressed={drawing}>{polygon ? "Draw again" : "Draw the site"}</button>
      {#if polygon}<button type="button" onclick={clearDrawing}>Clear</button>{/if}
      <button type="button" onclick={toggleImagery} aria-pressed={imagery}>Satellite</button>
    </div>
  </div>
  <p class="pc-muted pcn-hint">
    {#if drawing}Click to place corners. Click the first corner (or double-click) to close the shape.
    {:else if polygon}Drag corners to adjust; drag a midpoint to add a corner.
    {:else}Search, then press <b>Draw the site</b> and click around the ground you want to design.{/if}
    Search by <a href="https://photon.komoot.io">Photon</a>, map data © OpenStreetMap contributors, OpenFreeMap.
  </p>

  <form class="pcn-form" onsubmit={(e) => { e.preventDefault(); build(); }}>
    <label>Name <input type="text" bind:value={name} maxlength="80" placeholder="My site" /></label>
    <fieldset class="pcn-grid">
      <legend>Grid</legend>
      {#each [["hex", "Hexes"], ["quad", "Squares"]] as [t, label]}
        <label class="pcn-check"><input type="radio" name="pcn-grid" value={t} checked={gridType === t}
          disabled={!!limits && !limits.grid_types.includes(t)} onchange={() => setGridType(t as GridType)} /> {label}</label>
      {/each}
      <label>Cell size
        <select bind:value={cellSize}>
          {#each offered as s}
            <option value={s}>{s} m · {Math.round(cellAreaOf({ type: gridType, size: s })).toLocaleString("en-IN")} m²</option>
          {/each}
        </select>
      </label>
      <div class="pcn-grid-note"><p class="pc-muted">A hex's size is centre to corner, a square's is its side. Hexes touch 6 neighbours,
        squares 4. Scores compare designs on the same grid, not across grids.</p></div>
    </fieldset>
    <label class="pcn-check"><input type="checkbox" bind:checked={coastal} /> On the coast (model sea flooding with
      Mumbai's sea levels: +2.5 m tide, +3.5 m surge, +3.8 m surge in 2050)</label>
    <p class="pcn-size">
      {#if polygon}
        {fmtKm2(km2)} · about {cells.toLocaleString("en-IN")} cells
        {#if tooBig && limits}<span class="pc-error">: over the limit ({limits.max_km2} km², {limits.max_cells.toLocaleString("en-IN")} cells). Draw a smaller site or use bigger cells.</span>{/if}
      {:else}No site drawn yet.{/if}
    </p>
    <button type="submit" disabled={!polygon || tooBig || busy || !!serviceError}>Build the layers</button>
  </form>

  {#if serviceError}<p class="pc-error" role="alert">{serviceError}</p>{/if}
  {#if submitError}<p class="pc-error" role="alert">{submitError}</p>{/if}

  {#if job && busy}
    <div class="pcn-progress" aria-live="polite">
      {#if job.status === "queued"}
        <p>Waiting for the jobs ahead of yours ({job.position} in the queue).</p>
      {/if}
      <ol>
        {#each job.steps ?? [] as s, k}
          <li class:done={k < stepIndex} class:now={k === stepIndex}>{s}{#if k === stepIndex && job.detail}: {job.detail}{/if}</li>
        {/each}
      </ol>
      <p class="pc-muted">{job.seconds ?? 0} s so far. A new site usually takes 5 to 10 minutes, most of it downloading
        Overture's map data. You can leave this page open and come back.</p>
    </div>
  {/if}

  {#if Object.keys(ready).length}
    <p class="pcn-ready">Or open a ready-made site:
      {#each Object.entries(ready) as [rid, s]}
        <button type="button" onclick={() => onbuilt(rid)}>{s.name}</button>
      {/each}
    </p>
  {/if}
</section>
