<script lang="ts">
  // The Massing step's controls: the design and block being massed; how the buildings are
  // written (the representation) and the setbacks; breeding them; the massings that survived;
  // the sun and a section for the 3D view; downloads with their sizes.
  import { Download, Play, Square } from "lucide";
  import * as M from "../../engine/massing";
  import { downloadGlb, downloadObj, downloadRhino, objText, type Part } from "../mass/exports";
  import * as Mass from "../mass/massing";
  import * as Draw from "../draw";
  import { bench } from "./bench.svelte";
  import Icon from "./Icon.svelte";
  import { DATES, KINDS } from "./mass.svelte";

  const m = bench.mass;
  const P = Draw.palette();
  const info = $derived(m.blocks.find((b) => b.id === m.block) ?? null);
  const env = $derived(m.prepared?.E ?? null);
  const massings = $derived(m.population * (m.generations + 1));
  // about 15 ms a massing on a block of 0.2 ha (the A3 timings), more on bigger blocks
  const seconds = $derived(Math.max(1, Math.round(massings * 0.015 * Math.max(1, (info?.ha ?? 0.2) / 0.2))));
  const ranked = $derived(m.result && !m.stale ? m.result.kept.map((k, i) => ({ k, i })).sort((a, b) => a.k.rank - b.k.rank || a.i - b.i)
    .filter(({ k }, n) => k.rank === 1 || n < 6) : []);
  const fmtHour = (h: number) => `${String(Math.floor(h)).padStart(2, "0")}:${String(Math.round((h % 1) * 60)).padStart(2, "0")}`;
  const sunLine = $derived(m.sun ? (m.sun.altitude > 0
    ? `Sun ${Math.round((m.sun.altitude * 180) / Math.PI)}° up, from ${Math.round((m.sun.azimuth * 180) / Math.PI)}° (clockwise from north)`
    : "The sun is down") : "");

  // downloads: the chosen massing with the design's other buildings and the existing ones
  const parts = $derived.by((): Part[] => {
    const k = m.chosen, mesh = k ? m.meshOf(k) : null;
    if (!k || !mesh || !env || !m.source || !m.prepared) return [];
    return [{ name: k.name, layer: "massing", mesh },
      { name: "context", layer: "context", mesh: M.contextMesh(env, m.source.src.G, m.source.design) },
      { name: "existing", layer: "existing", mesh: M.existingMesh(env, m.prepared.G) }];
  });
  const fmtMB = (b: number) => (b < 1e6 ? `${Math.max(1, Math.round(b / 1e3))} kB` : `${(b / 1e6).toFixed(1)} MB`);
  // OBJ exactly; glTF and Rhino from the mesh's numbers (positions and indices, plus headers)
  const sizes = $derived.by(() => {
    if (!parts.length) return null;
    const raw = parts.reduce((s, p) => s + p.mesh.positions.byteLength + p.mesh.indices.byteLength * 3, 0);
    return { obj: new Blob([objText(parts)]).size, glb: raw * 1.1 + 2000, rhino: raw * 1.3 + 40000 };
  });
  const file = $derived(m.chosen && m.source ? `${bench.siteId}-${m.source.src.name}-block${m.block + 1}-${m.chosen.name}`.replace(/[^a-zA-Z0-9.-]+/g, "_") : "massing");
  let busy = $state("");
  async function download(fmt: "glb" | "obj" | "3dm") {
    busy = fmt;
    try {
      if (fmt === "obj") downloadObj(parts, file); else if (fmt === "glb") await downloadGlb(parts, file); else await downloadRhino(parts, file);
    } catch (e) { m.error = `The download failed: ${(e as Error).message}`; } finally { busy = ""; }
  }
  const thumb = (k: (typeof ranked)[number]["k"]) => (c: HTMLCanvasElement) => { const ms = m.massingOf(k); if (ms && env) Mass.thumb(c, env, ms, P); };
</script>

<div class="wb-panel">
  {#if !m.source}
    <!-- COPY: massing without a design -->
    <p class="wb-hint">Open a design in Explore first, then come back to mass one of its blocks.</p>
    <button class="wb-btn wb-start" type="button" onclick={() => bench.go("explore")}>Go to Explore</button>
  {:else}
    <div class="wb-sub">
      <span class="wb-label">Design</span>
      <b>{m.source.title}</b>
      <button class="wb-link wb-start" type="button" onclick={() => bench.go("explore")}>Pick another in Explore</button>
    </div>

    <div class="wb-sub">
      {#if info && env}
        <span class="wb-label">Block {m.block + 1}</span>
        <!-- COPY: block line -->
        <span class="wb-num">{info.ha.toFixed(2)} ha · {env.plots.length} plot{env.plots.length === 1 ? "" : "s"} · {Math.round(env.target).toLocaleString("en-IN")} m² to fit</span>
        <span class="wb-hint">Click another block on the plan to switch.</span>
      {:else}
        <span class="wb-hint">This design has no building plots to mass.</span>
      {/if}
    </div>

    <div class="wb-field">
      <span class="wb-field-label">Written as</span>
      <div class="wb-seg" role="group" aria-label="Written as">
        {#each KINDS as k}<button type="button" aria-pressed={m.kind === k.kind} disabled={m.running} onclick={() => (m.kind = k.kind)}>{k.label}</button>{/each}
      </div>
      <span class="wb-hint">{KINDS.find((k) => k.kind === m.kind)!.note}</span>
    </div>

    <div class="wb-field">
      <span class="wb-field-label">Setbacks, metres</span>
      <span class="wb-row">
        {#each [["front", "front"], ["side", "side"], ["rear", "rear"]] as [k, label]}
          <label class="wb-setback">{label}<input class="wb-input wb-num-input" type="number" min="0" max="30" step="0.5"
            bind:value={m.setbacks[k as keyof M.Setbacks]} disabled={m.running} /></label>
        {/each}
      </span>
      <span class="wb-hint">From {m.setbacksFrom}.</span>
    </div>

    <div class="wb-field">
      <label for="wb-mpop">Massings per generation <output class="wb-num">{m.population}</output></label>
      <input id="wb-mpop" class="wb-range" type="range" min="8" max="48" step="4" bind:value={m.population} disabled={m.running} />
    </div>
    <div class="wb-field">
      <label for="wb-mgen">Generations <output class="wb-num">{m.generations}</output></label>
      <input id="wb-mgen" class="wb-range" type="range" min="2" max="30" step="1" bind:value={m.generations} disabled={m.running} />
      <span class="wb-hint wb-num">{massings.toLocaleString("en-IN")} massings, about {seconds} s.</span>
    </div>
    {#if m.running}
      <div class="wb-progress" aria-live="polite">
        <div class="wb-row wb-between"><span class="wb-num">Generation {m.gen} of {m.generations}</span></div>
        <div class="wb-track" style="--at: {Math.round((m.gen / m.generations) * 100)}%"><b></b></div>
        <button class="wb-btn" type="button" onclick={() => m.cancel()}><Icon icon={Square} />Stop</button>
      </div>
    {:else}
      <button class="wb-btn is-primary" type="button" disabled={!env} onclick={() => m.breed()}><Icon icon={Play} />Breed buildings</button>
    {/if}
    {#if m.error}<p class="wb-error" role="alert">{m.error}</p>{/if}
    {#if m.stale}<p class="wb-hint">The block or setbacks changed since this run: breed again to see them.</p>{/if}

    {#if ranked.length}
      <div class="wb-sub">
        <span class="wb-label">What survived</span>
        <div class="wb-mass-list">
          {#each ranked as { k, i } (k.name)}
            <button class="wb-thumb" type="button" aria-pressed={i === m.pick} onclick={() => (m.pick = i)}>
              <span class="wb-pic"><canvas {@attach thumb(k)}></canvas></span>
              <span class="wb-cap"><span>{k.rank === 1 ? "on the front" : "beaten"}</span><span>{Math.round((k.floor / Math.max(1, env?.target ?? 1)) * 100)}%</span></span>
            </button>
          {/each}
        </div>
        <span class="wb-hint">The figure is floor area against what the block should fit.</span>
      </div>

      <div class="wb-field">
        <span class="wb-field-label">Sun</span>
        <select class="wb-input" aria-label="Date" bind:value={m.date}>{#each DATES as d, k}<option value={k}>{d.label}</option>{/each}</select>
        <label for="wb-hour" class="wb-row wb-between"><span>Local time</span><output class="wb-num">{fmtHour(m.hour)} {m.where ? Mass.utcLabel(m.where.utc) : ""}</output></label>
        <input id="wb-hour" class="wb-range" type="range" min="6" max="19" step="0.25" bind:value={m.hour} />
        <span class="wb-hint">{sunLine}.</span>
      </div>
      <div class="wb-field">
        <span class="wb-field-label">Section</span>
        <div class="wb-seg" role="group" aria-label="Section">
          {#each [["none", "None"], ["plan", "Plan cut"], ["cut", "Across"]] as [k, label]}
            <button type="button" aria-pressed={m.sectionMode === k} onclick={() => (m.sectionMode = k as typeof m.sectionMode)}>{label}</button>
          {/each}
        </div>
        {#if m.sectionMode !== "none"}
          <input class="wb-range" type="range" min="0" max="1" step="0.01" aria-label={m.sectionMode === "plan" ? "Cut height" : "Cut position"} bind:value={m.sectionAt} />
        {/if}
      </div>
      {#if sizes}
        <div class="wb-sub">
          <span class="wb-label">Download, with its surroundings</span>
          <div class="wb-row">
            <button class="wb-btn" type="button" disabled={!!busy} aria-busy={busy === "glb"} onclick={() => download("glb")}><Icon icon={Download} />glTF · {fmtMB(sizes.glb)}</button>
            <button class="wb-btn" type="button" disabled={!!busy} aria-busy={busy === "obj"} onclick={() => download("obj")}><Icon icon={Download} />OBJ · {fmtMB(sizes.obj)}</button>
            <button class="wb-btn" type="button" disabled={!!busy} aria-busy={busy === "3dm"} onclick={() => download("3dm")}><Icon icon={Download} />Rhino · {fmtMB(sizes.rhino)}</button>
          </div>
          <span class="wb-hint">glTF and Rhino sizes are estimates.</span>
        </div>
      {/if}
    {/if}
  {/if}
</div>
