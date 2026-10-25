<script lang="ts">
  // The Site step's map: the ready-made sites as outlines (the picked one in the accent, as
  // the selection), and the drawing tool for a new site.
  import { Map as MapLibre, NavigationControl, setWorkerUrl, type GeoJSONSource } from "maplibre-gl";
  // MapLibre looks for its worker next to its own module, which a bundle doesn't have.
  import mapWorker from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
  import { onDestroy, onMount } from "svelte";
  import { TerraDraw, TerraDrawPolygonMode, TerraDrawSelectMode } from "terra-draw";
  import { TerraDrawMapLibreGLAdapter } from "terra-draw-maplibre-gl-adapter";
  import { Satellite, Scan } from "lucide";
  import { tokens } from "../tokens";
  import { bench } from "./bench.svelte";
  import Icon from "./Icon.svelte";

  // active: the Site step is showing (the workbench hides this map on other steps, not destroys it)
  let { active = true }: { active?: boolean } = $props();

  setWorkerUrl(mapWorker);
  const IMAGERY = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

  let el: HTMLDivElement;
  let map: MapLibre | null = null;
  let draw: TerraDraw | null = null;
  let ready = $state(false);
  let imagery = $state(false);

  const outlines = $derived({
    type: "FeatureCollection" as const,
    features: Object.entries(bench.index).filter(([id, c]) => !id.endsWith("-quad") && c.outline?.length).map(([id, c]) => ({
      type: "Feature" as const, id: undefined,
      properties: { id, name: c.name.replace(/ \(.*\)$/, ""), picked: id === bench.picked ? 1 : 0 },
      geometry: { type: "Polygon" as const, coordinates: [c.outline!] },
    })),
  });

  function allBounds(): [number, number, number, number] | null {
    const pts = outlines.features.flatMap((f) => f.geometry.coordinates[0]);
    if (!pts.length) return null;
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  }

  function fit() {
    const b = bench.picked && bench.index[bench.picked]?.outline ? (() => {
      const o = bench.index[bench.picked!].outline!, xs = o.map((p) => p[0]), ys = o.map((p) => p[1]);
      return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] as [number, number, number, number];
    })() : allBounds();
    if (b) map?.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: 60, maxZoom: 15, duration: 600 });
  }

  onMount(() => {
    map = new MapLibre({
      container: el, style: "https://tiles.openfreemap.org/styles/positron",
      center: [80, 21], zoom: 4.2, attributionControl: { compact: true },
    });
    map.addControl(new NavigationControl({ showCompass: false }), "top-right");
    map.on("load", () => {
      map!.addSource("imagery", { type: "raster", tiles: [IMAGERY], tileSize: 256, maxzoom: 19,
        attribution: "Imagery: Esri, Maxar, Earthstar Geographics, and the GIS User Community" });
      map!.addLayer({ id: "imagery", type: "raster", source: "imagery", layout: { visibility: "none" } });
      map!.addSource("sites", { type: "geojson", data: outlines });
      map!.addLayer({ id: "sites-fill", type: "fill", source: "sites",
        paint: { "fill-color": ["case", ["==", ["get", "picked"], 1], tokens.accent, tokens.ink], "fill-opacity": ["case", ["==", ["get", "picked"], 1], 0.12, 0.06] } });
      map!.addLayer({ id: "sites-line", type: "line", source: "sites",
        paint: { "line-color": ["case", ["==", ["get", "picked"], 1], tokens.accent, tokens.ink2], "line-width": ["case", ["==", ["get", "picked"], 1], 2.5, 1.2] } });
      map!.addLayer({ id: "sites-name", type: "symbol", source: "sites",
        layout: { "text-field": ["get", "name"], "text-font": ["Noto Sans Regular"], "text-size": 12, "text-offset": [0, 0], "text-max-width": 10 },
        paint: { "text-color": tokens.ink, "text-halo-color": tokens.paper, "text-halo-width": 1.6 } });
      map!.on("click", "sites-fill", (e) => { const id = e.features?.[0]?.properties?.id; if (id && !bench.drawing) bench.picked = id; });
      map!.on("dblclick", "sites-fill", (e) => { const id = e.features?.[0]?.properties?.id; if (id) { e.preventDefault(); bench.open(id); } });
      map!.on("mouseenter", "sites-fill", () => (map!.getCanvas().style.cursor = "pointer"));
      map!.on("mouseleave", "sites-fill", () => (map!.getCanvas().style.cursor = ""));

      draw = new TerraDraw({
        adapter: new TerraDrawMapLibreGLAdapter({ map: map! }),
        modes: [
          new TerraDrawPolygonMode({ styles: { fillColor: tokens.accent as `#${string}`, fillOpacity: 0.1, outlineColor: tokens.accent as `#${string}`, outlineWidth: 2,
            closingPointColor: tokens.accent as `#${string}`, closingPointWidth: 5 } }),
          new TerraDrawSelectMode({ flags: { polygon: { feature: { draggable: true, coordinates: { midpoints: true, draggable: true, deletable: true } } } },
            styles: { selectedPolygonColor: tokens.accent as `#${string}`, selectedPolygonOutlineColor: tokens.accent as `#${string}`, selectedPolygonFillOpacity: 0.1,
              selectionPointColor: tokens.paper as `#${string}`, selectionPointOutlineColor: tokens.accent as `#${string}`, selectionPointWidth: 5,
              midPointColor: tokens.accent as `#${string}`, midPointWidth: 3 } }),
        ],
      });
      draw.start();
      const sync = () => {
        const f = draw!.getSnapshot().find((x) => x.geometry.type === "Polygon");
        bench.polygon = f ? (f.geometry.coordinates as number[][][]) : null;
      };
      draw.on("finish", (id) => { sync(); bench.drawing = false; draw!.setMode("select"); draw!.selectFeature(id); });
      draw.on("change", sync);
      ready = true;
      fit();
    });
    bench.map = {
      flyTo: (c, zoom = 15) => map?.flyTo({ center: c, zoom }),
      fitBounds: (b) => map?.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: 60, maxZoom: 16, duration: 700 }),
      startDrawing: () => { if (!draw) return; draw.clear(); bench.polygon = null; draw.setMode("polygon"); bench.drawing = true; bench.picked = null; },
      clearDrawing: () => { draw?.clear(); draw?.setMode("select"); bench.polygon = null; bench.drawing = false; },
      center: () => { const c = map?.getCenter(); return c ? [c.lng, c.lat] : undefined; },
    };
  });

  // keep the outlines (and which is picked) in step
  $effect(() => {
    const data = outlines;
    if (ready) (map?.getSource("sites") as GeoJSONSource | undefined)?.setData(data);
  });

  // shown again: the container was hidden, so MapLibre measures it afresh; hidden: stop drawing
  $effect(() => {
    if (active) map?.resize();
    else if (bench.drawing) { draw?.setMode("select"); bench.drawing = false; }
  });

  onDestroy(() => { draw?.stop(); map?.remove(); bench.map = null; bench.drawing = false; });

  function toggleImagery() {
    imagery = !imagery;
    map?.setLayoutProperty("imagery", "visibility", imagery ? "visible" : "none");
  }
</script>

<div class="wb-map" bind:this={el}></div>
<div class="wb-over tl">
  <button class="wb-btn" type="button" onclick={fit}><Icon icon={Scan} />Fit</button>
  <button class="wb-btn" type="button" aria-pressed={imagery} onclick={toggleImagery}><Icon icon={Satellite} />Satellite</button>
</div>
<p class="wb-attrib">Search by Photon · map data © OpenStreetMap contributors, OpenFreeMap</p>
