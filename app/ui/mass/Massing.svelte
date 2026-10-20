<script lang="ts">
  // 09 Massing: breed buildings inside one block of a design picked on the page (docs/massing.md).
  // The engine is app/engine/massing; this shows the block, runs the worker, and puts two
  // results side by side in 3D with a sun study, a section and downloads.
  import * as E from "../../engine";
  import * as M from "../../engine/massing";
  import { bench } from "../../engine/massing/bench";
  import type { MassKept, MassResult } from "../../engine/massing/worker";
  import * as Draw from "../draw";
  import { downloadGlb, downloadObj, downloadRhino, type Part } from "./exports";
  import * as Mass from "./massing";
  import { mass } from "./store.svelte";
  import type { Section, Viewer } from "./viewer";

  const KINDS: { kind: M.RepKind; label: string; note: string }[] = [
    { kind: "typology", label: "typology grammar", note: "courtyard, L, U, tower, slab, podium and tower, with their dimensions as genes" },
    { kind: "field", label: "voxel field, smooth skin", note: "metaballs fill voxels; a smoothed skin is drawn over them" },
    { kind: "cppn", label: "CPPN (NEAT)", note: "a small network turns position, water, cap and sun into density; it grows new links and nodes" },
  ];
  const DATES = [
    { label: "21 December", month: 12, day: 21 }, { label: "15 March (hot season)", month: 3, day: 15 },
    { label: "15 April (hot season)", month: 4, day: 15 }, { label: "15 May (hot season)", month: 5, day: 15 },
    { label: "21 June", month: 6, day: 21 },
  ];

  let P = Draw.palette();
  const breeder = new Mass.Breeder();

  const src = $derived(mass.src);
  const design = $derived(src ? Mass.designOf(src) : null);
  const blocks = $derived(src && design ? M.blocksOf(design, src.G) : []);
  let block = $state(-1);
  let setbacks = $state<M.Setbacks>({ ...M.DEFAULT_SETBACKS });
  let setbacksFrom = $state("defaults (assumed)");
  let kind = $state<M.RepKind>("typology");
  let population = $state(24), generations = $state(12), seed = $state(1);
  let running = $state(false), gen = $state(0), error = $state("");
  let result = $state.raw<MassResult | null>(null);
  let resultKey = $state("");
  let pickA = $state(-1), pickB = $state(-1);
  let date = $state(0), hour = $state(15);
  let sectionMode = $state<Section["mode"]>("none"), sectionAt = $state(0.5);

  // A new design: start over, with the brief's setbacks.
  $effect(() => {
    const s = src;
    breeder.cancel();
    running = false; result = null; pickA = pickB = -1; error = "";
    const sb = Mass.setbacksOf(s?.brief ?? null);
    setbacks = sb.value; setbacksFrom = sb.from;
    // Start on a mid-sized block with enough room for a courtyard.
    const pool = blocks.filter((b) => b.ha >= 0.3).sort((a, b) => b.ha - a.ha || a.id - b.id);
    block = pool.length ? pool[Math.floor(pool.length / 3)].id : blocks[0]?.id ?? -1;
  });

  const key = $derived(src ? `${src.name}|${block}|${setbacks.front},${setbacks.side},${setbacks.rear}` : "");
  const prepared = $derived(src && block >= 0 ? M.prepareBlock(src.G, Mass.setupOf(src, block, setbacks)) : null);
  const env = $derived(prepared?.E ?? null);
  const stale = $derived(!!result && resultKey !== key);

  const fmtM2 = (v: number) => `${Math.round(v).toLocaleString("en-IN")} m²`;
  const fmtHa = (v: number) => `${v.toFixed(2)} ha`;

  // --- the block picker -------------------------------------------------------------------
  let pick: ((x: number, y: number) => number) | null = null;
  const drawPlan = (canvas: HTMLCanvasElement) => {
    if (!src || !design) return;
    const { v, block: of } = Mass.drawBlocks(canvas, src, design, block, P);
    const r = Draw.shapeOf(src.site).r;
    pick = (x, y) => { const i = Draw.cellAt(v, Array.from(src.G.x), Array.from(src.G.y), x, y, r); return i >= 0 ? of[i] : -1; };
  };
  function onPlanClick(e: MouseEvent) {
    const b = pick?.(e.offsetX, e.offsetY) ?? -1;
    if (b >= 0 && b !== block) { block = b; }
  }

  // --- breeding ---------------------------------------------------------------------------
  async function breed() {
    if (!src || block < 0 || running) return;
    running = true; gen = 0; error = "";
    // Plain values only: a Svelte state proxy can't be posted to a worker.
    const req: M.MassRequest = { ...Mass.setupOf(src, block, $state.snapshot(setbacks)), kind, population, generations, seed };
    const k = key;
    try {
      const r = await breeder.run(src, req, (g) => (gen = g));
      runId++; meshes.clear(); built.clear();
      result = r; resultKey = k;
      const order = r.kept.map((_, i) => i).sort((a, b) => r.kept[a].rank - r.kept[b].rank || a - b);
      pickA = order[0] ?? -1; pickB = order.find((i) => i !== pickA && r.kept[i].rank === 1) ?? -1;
    } catch (err) {
      if (running) error = `The run stopped: ${(err as Error).message}`;
    } finally {
      running = false;
    }
  }
  function cancel() { breeder.cancel(); running = false; }

  // The front first; past it, ten more unless asked.
  let showAll = $state(false);
  const ranked = $derived(result ? result.kept.map((k, i) => ({ k, i })).sort((a, b) => a.k.rank - b.k.rank || a.i - b.i) : []);
  const sorted = $derived(showAll ? ranked : ranked.filter(({ k }, n) => k.rank === 1 || n < 10));

  // Massings rebuilt on the page from their genomes (identical to the worker's).
  const built = new Map<string, M.Massing>();
  function massingOf(k: MassKept): M.Massing | null {
    if (!prepared || !result) return null;
    let m = built.get(k.name);
    if (!m) { m = M.REPRESENTATIONS[result.kind].build(k.genome, prepared.ctx); built.set(k.name, m); }
    return m;
  }

  const drawThumb = (k: MassKept) => (canvas: HTMLCanvasElement) => {
    const m = massingOf(k);
    if (m && env) Mass.thumb(canvas, env, m, P);
  };

  const scoreLine = (s: M.MassScores) => M.MASS_SCORE_KEYS.map((k) => `${M.MASS_SCORES[k][0]} ${M.MASS_SCORES[k][1](s[k])}`).join(" · ");

  // --- 3D -------------------------------------------------------------------------------
  let viewA: Viewer | null = null, viewB: Viewer | null = null;
  let canvasA = $state<HTMLCanvasElement | null>(null), canvasB = $state<HTMLCanvasElement | null>(null);
  // Names repeat from run to run (M0.1, …), so caches and views go by run and name.
  let runId = 0;
  const tag = (k: MassKept) => `${runId}|${k.name}`;
  const meshes = new Map<string, M.Mesh>();
  function meshOf(k: MassKept) {
    let m = meshes.get(tag(k));
    if (!m && env) { m = M.massingMesh(env, massingOf(k)!); meshes.set(tag(k), m); }
    return m!;
  }
  const contextMesh = $derived(env && src && design ? M.contextMesh(env, src.G, design) : null);
  const existingMesh = $derived(env && src ? M.existingMesh(env, src.G) : null);
  const ground = $derived(env && src && design ? Mass.groundCanvas(env, src.G, design, P) : null);

  const A = $derived(result && pickA >= 0 ? result.kept[pickA] : null);
  const B = $derived(result && pickB >= 0 ? result.kept[pickB] : null);
  const where = $derived(src ? M.whereOf(src.G.meta) : null);
  // The slider is local clock time; the sun is placed in solar time.
  const sun = $derived.by(() => {
    if (!where) return null;
    const doy = M.dayOfYear(DATES[date].month, DATES[date].day);
    return M.sunAt(where.lat, doy, M.solarHour(hour, where.lon, where.utc, doy));
  });
  const section = $derived<Section>(sectionMode === "plan" ? { mode: "plan", height: sectionAt * (env?.nz ?? 1) * E.STOREY_M }
    : sectionMode === "cut" ? { mode: "cut", at: sectionAt } : { mode: "none" });

  async function ensure(which: "A" | "B"): Promise<Viewer | null> {
    const canvas = which === "A" ? canvasA : canvasB;
    if (!canvas) return null;
    const { Viewer } = await import("./viewer");
    // A canvas Svelte has replaced gets a new viewer, which has shown nothing yet.
    if (which === "A") {
      if (!viewA || viewA.canvas !== canvas) { viewA?.dispose(); viewA = new Viewer(canvas); shownA = ""; camA = -1; }
      return viewA;
    }
    if (!viewB || viewB.canvas !== canvas) { viewB?.dispose(); viewB = new Viewer(canvas); shownB = ""; camB = -1; }
    return viewB;
  }

  // What each view shows (run and name), and the run its camera was set for.
  let shownA = "", shownB = "", camA = -1, camB = -1;
  $effect(() => {
    const a = A, b = B, ctxMesh = contextMesh, g = ground, e = env, s = sun, sec = section;
    if (!e || !ctxMesh || !g || stale) return;
    void (async () => {
      const look = Mass.look(P);
      const va = a ? await ensure("A") : null;
      if (va && a) {
        if (shownA !== tag(a)) { va.show({ E: e, mass: meshOf(a), context: ctxMesh, existing: existingMesh!, ground: g, look }, camA === runId); shownA = tag(a); camA = runId; }
        va.sun(s ? s.dir : null); va.section(sec);
      }
      const vb = b ? await ensure("B") : null;
      if (vb && b) {
        if (shownB !== tag(b)) { vb.show({ E: e, mass: meshOf(b), context: ctxMesh, existing: existingMesh!, ground: g, look }, camB === runId); shownB = tag(b); camB = runId; }
        vb.sun(s ? s.dir : null); vb.section(sec);
      }
      va?.link(b ? vb : null);
    })();
  });

  const readA = $derived(A && env ? M.readouts(env, massingOf(A)!, meshOf(A)) : null);
  const readB = $derived(B && env ? M.readouts(env, massingOf(B)!, meshOf(B)) : null);

  // --- downloads ------------------------------------------------------------------------
  const fileName = (k: MassKept) => `${src?.siteId}-${src?.name}-block${block}-${k.name}`.replace(/[^a-zA-Z0-9.-]+/g, "_");
  function parts(k: MassKept): Part[] {
    const out: Part[] = [{ name: k.name, layer: "massing", mesh: meshOf(k) }];
    if (contextMesh) out.push({ name: "context", layer: "context", mesh: contextMesh });
    if (existingMesh) out.push({ name: "existing", layer: "existing", mesh: existingMesh });
    return out;
  }
  let busy = $state("");
  async function download(fmt: "glb" | "obj" | "3dm" | "bench") {
    if (!A || !env || !prepared) return;
    busy = fmt;
    try {
      if (fmt === "obj") downloadObj(parts(A), fileName(A));
      else if (fmt === "glb") await downloadGlb(parts(A), fileName(A));
      else if (fmt === "3dm") await downloadRhino(parts(A), fileName(A));
      else {
        const data = bench(env, massingOf(A)!, prepared.ctx.where, A.scores, { site: src!.siteId, kind: result!.kind, massGenome: A.genome });
        const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: "application/json" }));
        const a = document.createElement("a");
        a.href = url; a.download = `${fileName(A)}-bench.json`; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } catch (err) {
      error = `The download failed: ${(err as Error).message}`;
    } finally {
      busy = "";
    }
  }

  const blockInfo = $derived(blocks.find((b) => b.id === block) ?? null);
  const sunLine = $derived(sun ? (sun.altitude > 0
    ? `sun ${Math.round((sun.altitude * 180) / Math.PI)}° up, from ${Math.round((sun.azimuth * 180) / Math.PI)}° (clockwise from north)`
    : "the sun is down") : "");
  const fmtHour = (h: number) => `${String(Math.floor(h)).padStart(2, "0")}:${String(Math.round((h % 1) * 60)).padStart(2, "0")}`;
</script>

{#if !src}
  <p class="pc-muted">Pick a design in Families (07) or the pen (08), then press <b>mass a block</b> under its plan.</p>
{:else}
  <p>Massing <b>{src.name}</b>. Click a block on the plan; its plots and envelopes are set from the design and the
    rules, and buildings are bred inside them. Neighbouring blocks stand as simple prisms for shade and sky.</p>
  <div class="pc-two">
    <canvas class="pc-map pc-mass-plan" {@attach drawPlan} onclick={onPlanClick} title="click a block"></canvas>
    <div>
      {#if blockInfo && env}
        <p><b>Block {block + 1}</b>: {fmtHa(blockInfo.ha)}, {env.plots.length} plot{env.plots.length > 1 ? "s" : ""};
          floor-area target {fmtM2(env.target)} (what the urban design put here).
          {Mass.neighbourLine(env, src.G)}
          {#if blockInfo.ha > 3}A large block: a run takes longer, up to a minute.{/if}
          {#if env.note.length}<span class="pc-muted">{env.note.join("; ")}.</span>{/if}</p>
        <table class="pc-mass-plots">
          <thead><tr><th>plot</th><th>area</th><th>cap</th><th>most cover</th><th>target</th><th>street front</th></tr></thead>
          <tbody>
            {#each env.plots as p}
              <tr><td>{p.id + 1}</td><td>{fmtHa(p.area / 1e4)}</td><td>{p.capLevels} storeys</td>
                <td>{Math.round(p.maxCover * 100)}%</td><td>{fmtM2(p.target)}</td><td>{Math.round(p.frontage)} m</td></tr>
            {/each}
          </tbody>
        </table>
        <form class="pc-controls" onsubmit={(e) => { e.preventDefault(); breed(); }}>
          <fieldset class="pc-mass-setbacks">
            <legend>setbacks (m), from {setbacksFrom}</legend>
            <label>front <input type="number" min="0" max="30" step="0.5" bind:value={setbacks.front}></label>
            <label>side <input type="number" min="0" max="30" step="0.5" bind:value={setbacks.side}></label>
            <label>rear <input type="number" min="0" max="30" step="0.5" bind:value={setbacks.rear}></label>
          </fieldset>
          <label>written as <select bind:value={kind}>
            {#each KINDS as k}<option value={k.kind}>{k.label}</option>{/each}
          </select></label>
          <label>population <input type="number" min="8" max="60" step="4" bind:value={population}></label>
          <label>generations <input type="number" min="1" max="40" bind:value={generations}></label>
          <label>seed <input type="number" min="1" bind:value={seed}></label>
          {#if running}
            <button type="button" onclick={cancel}>stop</button>
          {:else}
            <button type="submit">breed buildings</button>
          {/if}
        </form>
        <p class="pc-muted">{KINDS.find((k) => k.kind === kind)!.note}.
          {#if Mass.narrowWings(src.brief)} The brief's Pattern 107 or 159 keeps wings at 12 m or less.{/if}
          {#if Mass.typeWeights(src.brief)} The brief's typology priors shape the first generation.{/if}</p>
        {#if running}<p class="pc-status" role="status">Breeding: generation {gen} of {generations}.</p>{/if}
      {:else}
        <p class="pc-muted">This design has no blocks to mass.</p>
      {/if}
      {#if error}<p class="pc-status" role="alert">{error}</p>{/if}
    </div>
  </div>

  {#if result}
    <h3>What survived</h3>
    <p class="pc-muted">
      {result.everyone} massings in {(result.ms / 1000).toFixed(1)} s, written as {KINDS.find((k) => k.kind === result!.kind)!.label}.
      {result.kept.filter((k) => k.rank === 1).length} on the front (within 10% of the floor-area target, then the five scores).
      {#if stale}<b>The block or setbacks changed since this run: breed again to see them.</b>{/if}
    </p>
    {#if !stale}
      <div class="pc-gallery pc-mass-gallery">
        {#each sorted as { k, i } (k.name)}
          <figure class="pc-card" class:is-on={i === pickA || i === pickB}>
            <canvas {@attach drawThumb(k)}></canvas>
            <figcaption>
              <b>{k.name}</b>{k.rank === 1 ? " · front" : ""} · {fmtM2(k.floor)} ({Math.round((k.floor / Math.max(1, env?.target ?? 1)) * 100)}% of target)<br>
              <span class="pc-muted">{scoreLine(k.scores)}</span><br>
              <span class="pc-muted">{k.rejected ?? M.describeRepairs(k.repairs, env?.plots.length ?? 1)}</span>
            </figcaption>
            <p class="pc-actions">
              <button type="button" onclick={() => (pickA = i)} aria-pressed={i === pickA}>view as A</button>
              <button type="button" onclick={() => (pickB = i === pickB ? -1 : i)} aria-pressed={i === pickB}>{i === pickB ? "drop B" : "compare as B"}</button>
            </p>
          </figure>
        {/each}
      </div>
      {#if ranked.length > sorted.length || showAll}
        <button type="button" onclick={() => (showAll = !showAll)}>{showAll ? "show fewer" : `show all ${ranked.length}`}</button>
      {/if}

      <h3>In 3D</h3>
      <form class="pc-controls" onsubmit={(e) => e.preventDefault()}>
        <label>date <select bind:value={date}>{#each DATES as d, k}<option value={k}>{d.label}</option>{/each}</select></label>
        <label>local time {fmtHour(hour)} ({where ? Mass.utcLabel(where.utc) : ""}) <input type="range" min="6" max="19" step="0.25" bind:value={hour}></label>
        <label>section <select bind:value={sectionMode}>
          <option value="none">none</option><option value="plan">plan cut</option><option value="cut">cut across</option>
        </select></label>
        {#if sectionMode !== "none"}
          <label>{sectionMode === "plan" ? "height" : "position"} <input type="range" min="0" max="1" step="0.01" bind:value={sectionAt}></label>
        {/if}
      </form>
      <p class="pc-muted">{sunLine}. Drag to turn, scroll to zoom, right-drag to pan. The two views move together.</p>
      <div class="pc-mass-views" class:pc-mass-two={!!B}>
        <figure>
          <canvas class="pc-mass-3d" bind:this={canvasA}></canvas>
          <figcaption>A: {A?.name ?? "none"}</figcaption>
        </figure>
        {#if B}
          <figure>
            <canvas class="pc-mass-3d" bind:this={canvasB}></canvas>
            <figcaption>B: {B.name}</figcaption>
          </figure>
        {/if}
      </div>
      {#if A}
        <p class="pc-actions">
          <span class="pc-muted">Download A with its context:</span>
          <button type="button" onclick={() => download("glb")} disabled={!!busy}>glTF</button>
          <button type="button" onclick={() => download("obj")} disabled={!!busy}>OBJ</button>
          <button type="button" onclick={() => download("3dm")} disabled={!!busy}>{busy === "3dm" ? "loading Rhino…" : "Rhino .3dm"}</button>
          <button type="button" onclick={() => download("bench")} disabled={!!busy} title="for pc/massing_check.py">bench file</button>
        </p>
      {/if}

      {#if A && readA}
        <table class="pc-mass-read">
          <thead><tr><th></th><th>A · {A.name}</th>{#if B && readB}<th>B · {B.name}</th>{/if}</tr></thead>
          <tbody>
            <tr><th colspan="3" class="pc-muted">scores (bred on)</th></tr>
            {#each M.MASS_SCORE_KEYS as s}
              <tr><td>{M.MASS_SCORES[s][0]} {M.MASS_SCORES[s][2] ? "↑" : "↓"}</td><td>{M.MASS_SCORES[s][1](A.scores[s])}</td>
                {#if B && readB}<td>{M.MASS_SCORES[s][1](B.scores[s])}</td>{/if}</tr>
            {/each}
            <tr><td>floor area vs target</td><td>{fmtM2(A.floor)}</td>{#if B && readB}<td>{fmtM2(B.floor)}</td>{/if}</tr>
            <tr><th colspan="3" class="pc-muted">readouts (not bred on)</th></tr>
            {#each Object.keys(M.READOUTS) as r}
              {@const key = r as keyof M.MassReadouts}
              <tr><td>{M.READOUTS[key][0]}</td><td>{M.READOUTS[key][1](readA[key])}</td>
                {#if B && readB}<td>{M.READOUTS[key][1](readB[key])}</td>{/if}</tr>
            {/each}
            <tr><td>envelope</td><td>{A.rejected ?? M.describeRepairs(A.repairs, env?.plots.length ?? 1)}</td>
              {#if B && readB}<td>{B.rejected ?? M.describeRepairs(B.repairs, env?.plots.length ?? 1)}</td>{/if}</tr>
          </tbody>
        </table>
      {/if}
    {/if}
  {/if}
{/if}
