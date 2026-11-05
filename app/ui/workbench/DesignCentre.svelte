<script lang="ts">
  // The design step's centre: the banks on the map, cut into stretches, and the real section at a station.
  import { MONTHS } from "../../engine/focus/river";
  import type { Place } from "../../engine/focus/place";
  import * as Draw from "../draw";
  import { bench } from "./bench.svelte";
  import { existingAt, surfaceAt } from "../../engine/focus/edgeform";
  import { daysAbove, pathUnderAt, waterReach } from "../../engine/focus/edgescore";
  import { STOP_WORDS } from "./edgewords";
  import { paintPlace, placeFrame } from "./focuspaint";
  import MapCanvas from "./MapCanvas.svelte";

  let { place }: { place: Place } = $props();
  const f = bench.focus;
  const P = Draw.palette();
  const frame = $derived(placeFrame(place));
  const shape = $derived(Draw.shapeOf(frame));
  const ROOM_WIDTH = { none: 1, narrow: 2.5, wide: 4, broad: 6 };

  const paint = $derived((c: CanvasRenderingContext2D, v: Draw.View) => {
    paintPlace(c, v, place, { mark: f.mark, layer: "zone", near: null, stayOn: null, shape, released: f.released }, P);
    c.lineCap = "butt";
    for (const b of f.edge?.banks ?? []) for (const s of b.stretches) {
      const on = s.id === f.stretchOn;
      c.strokeStyle = on ? P.ink : P.t.accent;
      c.lineWidth = ROOM_WIDTH[s.room] + (on ? 1.5 : 0);
      c.setLineDash(s.room === "none" ? [3, 4] : []);
      c.beginPath();
      for (let k = s.stations[0]; k <= s.stations[1]; k++) {
        const t = b.stations[k];
        if (k === s.stations[0]) c.moveTo(v.px(t.x), v.py(t.y)); else c.lineTo(v.px(t.x), v.py(t.y));
      }
      c.stroke();
      c.setLineDash([]);
      // Stretches are told apart by a tick where each begins.
      const t = b.stations[s.stations[0]];
      c.strokeStyle = P.ink;
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(v.px(t.x - t.nx * 12), v.py(t.y - t.ny * 12));
      c.lineTo(v.px(t.x + t.nx * 12), v.py(t.y + t.ny * 12));
      c.stroke();
    }
    // The tried section's lines.
    for (const l of f.fits.flatMap((x) => x.lines)) {
      c.strokeStyle = l.kind === "path" ? P.ink : P.t.accent;
      c.lineWidth = l.kind === "path" ? 1.5 : 0.8;
      c.setLineDash(l.kind === "path" ? [4, 2] : []);
      c.beginPath();
      l.plan.forEach((p, k) => { if (k) c.lineTo(v.px(p[0]), v.py(p[1])); else c.moveTo(v.px(p[0]), v.py(p[1])); });
      c.stroke();
      c.setLineDash([]);
    }
    // The section on the map.
    if (station) {
      const t = station;
      c.strokeStyle = P.ink;
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(v.px(t.x - t.nx * (t.toWaterLow ?? 0)), v.py(t.y - t.ny * (t.toWaterLow ?? 0)));
      c.lineTo(v.px(t.x + t.nx * t.reach), v.py(t.y + t.ny * t.reach));
      c.stroke();
    }
  });

  const station = $derived.by(() => {
    const on = f.stationOn;
    return on ? f.edge?.banks.find((b) => b.id === on.bank)?.stations[on.k] ?? null : null;
  });
  const bank = $derived(f.edge?.banks.find((b) => b.id === f.stationOn?.bank) ?? null);
  const version = $derived(`${f.stretchOn}|${f.stationOn?.bank}|${f.stationOn?.k}|${!!f.edge}|${f.decisions.length}|${JSON.stringify(f.choices)}|${f.works}|${f.optionOn}`);
  /** The tried design at this station. */
  const fitHere = $derived(f.fit && f.stationOn ? f.fit.sections.find((s) => s.k === f.stationOn!.k) ?? null : null);
  const plantings = $derived([...new Set((fitHere?.elements ?? []).map((e) => e.planting).filter(Boolean))]);

  // The slider's range and its landmarks.
  const riverLo = $derived(Math.floor(f.edge?.datum.ordinary?.[0] ?? place.brief.marks[0].m - 5));
  const riverHi = $derived(Math.ceil(Math.max(...place.brief.marks.map((m) => m.m)) + 1));
  const under = $derived(pathUnderAt(f.fits, f.river));
  const markHere = $derived(place.brief.marks.find((m) => Math.abs(m.m - f.river) < 0.05) ?? null);
  const daysHere = $derived(daysAbove(place, f.river));

  /** A section as drawn: out to the water on the left, inland on the right. */
  const section = $derived.by(() => {
    const t = station, read = f.edge;
    if (!t || !read) return null;
    const land = t.ground.filter((g) => g.z !== null).map((g) => ({ d: g.d, z: g.z! }));
    const out = t.out.filter((g) => g.z !== null).map((g) => ({ d: -g.d, z: g.z! }));
    const marks = place.brief.marks, ordinary = read.datum.ordinary;
    const zs = [...land, ...out].map((g) => g.z).concat(marks.map((m) => m.m), ordinary ?? []);
    if (!zs.length) return null;
    const W = 900, H = 240, pad = 26;
    const x0 = Math.min(0, ...out.map((g) => g.d)), x1 = Math.max(60, ...land.map((g) => g.d));
    const lo = Math.floor(Math.min(...zs)) - 1, hi = Math.ceil(Math.max(...zs)) + 1;
    const X = (d: number) => pad + ((W - 2 * pad) * (d - x0)) / (x1 - x0), Y = (z: number) => H - pad - ((H - 2 * pad) * (z - lo)) / (hi - lo);
    const path = (pts: { d: number; z: number }[]) => pts.map((g, k) => `${k ? "L" : "M"}${X(g.d).toFixed(1)} ${Y(g.z).toFixed(1)}`).join("");
    // The design over today's ground, with the earth it moves as thin columns.
    const fit = fitHere?.mode === "reshape" ? fitHere : null;
    const earth: { x: number; y: number; h: number; cut: boolean }[] = [];
    if (fit?.window) for (let d = fit.window[0]; d < fit.window[1]; d += 2) {
      const e = existingAt(t, d + 1), z = surfaceAt(fit.vertices, d + 1);
      if (e === null || Math.abs(z - e) < 0.05) continue;
      earth.push({ x: X(d), y: Y(Math.max(z, e)), h: Math.abs(Y(z) - Y(e)), cut: z < e });
    }
    const w2 = Math.max(1, X(2) - X(0));
    // The river at the chosen height: over the bed, and inland to the first ground above it.
    const surface = fitHere?.vertices.length ? fitHere.vertices : land.filter((g) => g.d <= t.reach);
    const reached = waterReach(surface, f.river), bedSorted = [...out].sort((a, b) => a.d - b.d);
    const zAt = (d: number) => (d < 0 && bedSorted.length ? surfaceAt(bedSorted, d) : surface.length ? surfaceAt(surface, d) : f.river);
    const from = bedSorted.length ? x0 : 0, top = Y(f.river), low: string[] = [];
    for (let i = 0; i <= 200; i++) { const d = from + ((reached - from) * i) / 200; low.push(`L${X(d).toFixed(1)} ${Math.max(top, Y(Math.min(zAt(d), f.river))).toFixed(1)}`); }
    const water = reached > from ? `M${X(from).toFixed(1)} ${top.toFixed(1)}${low.join("")}L${X(reached).toFixed(1)} ${top.toFixed(1)}Z` : "";
    return { water, reached, W, H, pad, X, Y, x0, x1, lo, hi, ground: path(land), bed: path([...out].sort((a, b) => a.d - b.d)), marks, ordinary,
      design: fit ? path(fit.vertices) : "", earth, w2 };
  });
</script>

<div class="wb-edge">
  <div class="wb-edge-map">
    <MapCanvas site={frame} {paint} {version} onpick={(x, y) => f.pickNear(x, y)} label="Map of the river's two banks, cut into stretches that differ in room, law and views">
      <div class="wb-legend wb-over br">
        <!-- COPY: legend of stretches -->
        <div><i style="--c: {P.t.accent}"></i><span>the bank: thicker has more room</span></div>
        <div><i style="--c: transparent; box-shadow: inset 0 0 0 1px {P.ink}"></i><span>a tick where each stretch begins</span></div>
      </div>
    </MapCanvas>
  </div>
  <div class="wb-edge-section">
    {#if section && station && bank}
      <b>{bank.words} {f.stretchOn}, {Math.round(station.s)} m along. Water to the left, inland to the right.</b>
      <svg viewBox="0 0 {section.W} {section.H}" role="img" aria-label="Real section from the water to where the usable ground ends, with the river's levels">
        {#if section.ordinary}<rect x={section.pad} y={section.Y(section.ordinary[1])} width={section.W - 2 * section.pad} height={section.Y(section.ordinary[0]) - section.Y(section.ordinary[1])} class="s-level" />{/if}
        <rect x={section.X(0)} y={section.pad} width={section.X(station.reach) - section.X(0)} height={section.H - 2 * section.pad} class="s-usable" />
        {#each section.marks as m}
          <line x1={section.pad} x2={section.W - section.pad} y1={section.Y(m.m)} y2={section.Y(m.m)} class="s-mark" />
          <text x={section.W - section.pad} y={section.Y(m.m) - 3} text-anchor="end" class="s-text">{m.words}</text>
        {/each}
        {#if section.water}<path d={section.water} class="s-river" />{/if}
        {#if section.bed}<path d={section.bed} class="s-bed" />{/if}
        {#each section.earth as e}<rect x={e.x} y={e.y} width={section.w2} height={e.h} class={e.cut ? "s-cut" : "s-fill"} />{/each}
        <path d={section.ground} class={section.design ? "s-ground was" : "s-ground"} />
        {#if section.design}<path d={section.design} class="s-design" />{/if}
        {#if fitHere?.path}<circle cx={section.X(fitHere.path.d)} cy={section.Y(fitHere.path.z)} r="3.5" class="s-path" /><text x={section.X(fitHere.path.d)} y={section.Y(fitHere.path.z) - 7} text-anchor="middle" class="s-text">path</text>{/if}
        <line x1={section.X(0)} x2={section.X(0)} y1={section.pad} y2={section.H - section.pad} class="s-stop" />
        <text x={section.X(0) + 4} y={section.pad + 10} class="s-text">bank</text>
        {#if station.reach > 0}<text x={section.X(station.reach) + (section.X(station.reach) > section.W * 0.6 ? -4 : 4)} y={section.pad + 22} text-anchor={section.X(station.reach) > section.W * 0.6 ? "end" : "start"} class="s-text">{station.reach} m: {STOP_WORDS[station.stop]}</text>{/if}
        {#if f.edge?.months && station.toWaterLow !== null}<line x1={section.X(-station.toWaterLow)} x2={section.X(-station.toWaterLow)} y1={section.H - section.pad - 14} y2={section.H - section.pad} class="s-water" /><text x={section.X(-station.toWaterLow)} y={section.H - 8} text-anchor={section.X(-station.toWaterLow) < 90 ? "start" : "middle"} class="s-text">{MONTHS[f.edge.months.low]} water</text>{/if}
        {#if f.edge?.months && station.toWaterHigh !== null && station.toWaterHigh !== station.toWaterLow}<line x1={section.X(-station.toWaterHigh)} x2={section.X(-station.toWaterHigh)} y1={section.H - section.pad - 14} y2={section.H - section.pad} class="s-water" /><text x={section.X(-station.toWaterHigh)} y={section.H - 20} text-anchor={section.X(-station.toWaterHigh) < 90 ? "start" : "middle"} class="s-text">{MONTHS[f.edge.months.high]} water</text>{/if}
      </svg>
      <!-- COPY: the river's level on a section -->
      <div class="wb-river">
        <label for="wb-river-at">River at {f.river.toFixed(1)} m</label>
        <input id="wb-river-at" type="range" min={riverLo} max={riverHi} step="0.1" value={f.river} oninput={(e) => (f.riverAt = +e.currentTarget.value)} />
        <div class="wb-row-btns">
          {#if f.edge?.datum.ordinary}<button class="wb-chip" type="button" onclick={() => (f.riverAt = null)}>An ordinary day</button>{/if}
          {#each place.brief.marks as m (m.m)}<button class="wb-chip" type="button" title={m.note} onclick={() => (f.riverAt = m.m)}>{m.words}</button>{/each}
        </div>
        {#if markHere?.note}<p class="wb-hint">{markHere.note}.</p>{/if}
        <p class="wb-hint">{section.reached > 0 ? `Here the water comes ${Math.round(section.reached)} m in from the bank.` : "Here the water stays below the bank."}{fitHere?.path ? ` The path is ${fitHere.path.z < f.river ? `${(f.river - fitHere.path.z).toFixed(1)} m under water` : `${(fitHere.path.z - f.river).toFixed(1)} m clear of the water`}.` : ""}{under.all > 0 ? ` Along this design, ${under.under.toFixed(1)} of ${under.all.toFixed(1)} km of path is under.` : ""} {daysHere < 1 ? "The river stands this high or higher on less than one day a year on average" : `The river stands this high or higher on about ${Math.round(daysHere)} days a year`}, from modelled flow, so roughly. A level, not a flood model: water is drawn flat across the section, and only as far as the first higher ground.</p>
      </div>
      <!-- COPY: what a section rests on -->
      {#if fitHere}
        <!-- COPY: the tried section's pieces -->
        <p class="wb-hint">{fitHere.mode === "reshape" ? "The heavy line is the design, the thin one today's ground: darker where earth is dug, lighter where it's placed." : "The ground stays as it is here."}{plantings.length ? ` Planting: ${plantings.join(", ")}.` : ""}</p>
      {/if}
      <p class="wb-hint">The tinted band is the ground a design could use here. The pale blue band is the river on an ordinary day. The dotted line past the bank is the terrain's flattened water and bars, not a measured bed. Cells are 35 m across and the terrain is satellite-derived, so read the shape, not the centimetres.{station.view !== null ? ` A view limits things here to about ${Math.round(station.view)} m.` : ""}</p>
    {:else}
      <p class="wb-hint">Pick a stretch on the left, or click the bank on the map, to draw its real section here.</p>
    {/if}
  </div>
</div>
