<script lang="ts">
  // One plot, one building (architecture-v3 section 13, B5): a place, a plot and a brief in;
  // buildings evolved from the typology library's precedents out, each traced to its precedent,
  // what moved from it, and the nature's rules it took. The search runs in a worker
  // (engine/massing/plotworker.ts); one design opens in the massing chapter's 3D viewer.
  import * as Comlink from "comlink";
  import { onDestroy, onMount } from "svelte";
  import { CLIMATE, type Normals } from "../../engine/typology/climate";
  import { CHALLENGES, type Challenge } from "../../engine/typology/challenges";
  import { LIBRARY } from "../../engine/typology/library";
  import { PROGRAMMES, PROGRAMME_LABELS, type ProgrammeKey } from "../../engine/plan/programme";
  import { plotEnvelope, rectPlot, type PlotSpec } from "../../engine/massing/plot";
  import { SETTING_WORDS, type Change } from "../../engine/massing/precedent";
  import { MASS_SCORES } from "../../engine/massing/scores";
  import { dayOfYear, sunAt } from "../../engine/massing/sun";
  import { DESIGN_RAIN_MM, PLOT_SCORES } from "../../engine/massing/plotnature";
  import type { PlotDesign, PlotResult, PlotWorker } from "../../engine/massing/plotworker";
  import { drawPlotCard } from "../diagrams/plotcard";
  import * as Draw from "../draw";
  import type { Viewer } from "../mass/viewer";

  // Places with climate data: the sites, then the library's places by name.
  const NAME = new Map(LIBRARY.map((p) => [p.id, `${p.place} (${p.name})`]));
  const PLACES = Object.entries(CLIMATE.places)
    .map(([id, n]) => ({ id, name: id.startsWith("site:") ? (n.name ?? id).split(":")[0] + (id.includes("quad") ? " (wide)" : "") : NAME.get(id) ?? id, n }))
    .filter((p, i, a) => a.findIndex((q) => q.name === p.name) === i)
    .sort((a, b) => Number(b.id.startsWith("site:")) - Number(a.id.startsWith("site:")) || a.name.localeCompare(b.name));
  const SIDES = [{ k: "south", turn: 0 }, { k: "east", turn: 90 }, { k: "north", turn: 180 }, { k: "west", turn: 270 }] as const;

  // The form (defaults: a Bengaluru plot of homes).
  let place = $state("site:bengaluru-cascade");
  let width = $state(48), depth = $state(36), side = $state<(typeof SIDES)[number]["k"]>("south"), streetW = $state(12);
  let storeys = $state(5), fsi = $state(1.0), front = $state(3), sideSet = $state(1.5), rear = $state(3);
  let programme = $state<ProgrammeKey>("homes");
  let floods = $state(false), short = $state(false);
  let size = $state<"quick" | "thorough">("quick");

  const normals = $derived(CLIMATE.places[place] as Normals);
  const spec = $derived<PlotSpec>({
    ...rectPlot(width, depth, SIDES.find((s) => s.k === side)!.turn, streetW), storeys, target: Math.round(width * depth * fsi),
    setbacks: { front, side: sideSet, rear },
  });

  let running = $state(false), progress = $state(0), error = $state("");
  let result = $state<PlotResult | null>(null);
  let shown = $state<{ spec: PlotSpec; E: ReturnType<typeof plotEnvelope> } | null>(null);
  let open = $state<PlotDesign | null>(null);

  let raw: Worker | null = null, api: Comlink.Remote<PlotWorker> | null = null;
  function stop() { raw?.terminate(); raw = null; api = null; running = false; }
  onDestroy(() => { stop(); viewer?.dispose(); });
  // /build?run starts a search with the defaults (a link that shows results)
  onMount(() => { if (new URLSearchParams(location.search).has("run")) run(); });

  async function run() {
    stop();
    raw = new Worker(new URL("../../engine/massing/plotworker.ts", import.meta.url), { type: "module" });
    api = Comlink.wrap<PlotWorker>(raw);
    running = true; progress = 0; error = ""; open = null;
    const [lon, lat] = normals.at, utc = lon >= 68 && lon <= 97.5 && lat >= 6 && lat <= 37.5 ? 5.5 : Math.round(lon / 15);
    const extra: Partial<Record<Challenge, number>> = { ...(floods ? { flood: 1 } : {}), ...(short ? { "water-short": 1 } : {}) };
    const s = $state.snapshot(spec) as PlotSpec;
    const opts = size === "quick" ? { population: 24, generations: 8, seed: 1 } : { population: 40, generations: 16, seed: 1 };
    try {
      const r = await api.run(s, { lat, lon, utc }, { programme, normals: $state.snapshot(normals) as Normals, extra }, opts,
        Comlink.proxy((gen: number, of: number) => { progress = gen / of; }));
      result = r; shown = { spec: s, E: plotEnvelope(s) };
      open = r.designs[0] ?? null;
    } catch (e) { error = String(e); }
    running = false; raw?.terminate(); raw = null; api = null;
  }

  // 3D: the massing chapter's viewer, loaded when a design is opened.
  let canvas = $state<HTMLCanvasElement | null>(null), viewer: Viewer | null = null, framed: PlotSpec | null = null;
  $effect(() => {
    const d = open, c = canvas, sh = shown;
    if (!d || !c || !sh) return;
    (async () => {
      const [{ Viewer }, S3] = await Promise.all([import("../mass/viewer"), import("./scene3d")]);
      if (!viewer || viewer.canvas !== c) { viewer?.dispose(); viewer = new Viewer(c); framed = null; }
      viewer.resize();
      const P = Draw.palette();
      viewer.show({
        E: sh.E, mass: S3.massesMesh(d.source.masses), context: S3.treesMesh(sh.E, d.source.nature), existing: S3.emptyMesh(),
        ground: S3.plotGround(sh.E, d.source.nature, P),
        look: { mass: P.t.building[1], context: P.t.green.existing, existing: P.t.existingRamp[3], ground: P.paper, ink: P.ink, background: P.paper },
      }, framed === sh.spec);
      framed = sh.spec;
      // a hot-season afternoon sun (15 April, 15:00 solar time), as the shade scores read it
      const sun = sunAt(normals.at[1], dayOfYear(4, 15), 15);
      viewer.sun(sun.altitude > 0 ? sun.dir : null);
    })();
  });

  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const precedentName = (id: string) => LIBRARY.find((p) => p.id === id)?.name ?? id;
  const unit = (w: Change["what"]) => (w === "count" || w === "rows" ? "" : " m");
  const changeWords = (c: Change) => c.what === "storeys" ? `${c.to} storeys (its own: ${c.from})`
    : c.what === "units" ? `units from ${c.to}` : `${SETTING_WORDS[c.what]} ${c.from} → ${c.to}${unit(c.what)}`;
  const SCORE_ROWS: [string, string, (v: number) => string][] = [
    ["rain", PLOT_SCORES.rain[0], PLOT_SCORES.rain[1]], ["plotShade", PLOT_SCORES.plotShade[0], PLOT_SCORES.plotShade[1]],
    ["fit", PLOT_SCORES.fit[0], PLOT_SCORES.fit[1]], ["shade", "shade on the street", MASS_SCORES.shade[1]],
    ["sky", MASS_SCORES.sky[0], MASS_SCORES.sky[1]], ["wind", "wind blocked", MASS_SCORES.wind[1]],
  ];
  const cards = $derived(result && shown ? result.designs.map((d) => ({ d, svg: drawPlotCard(shown!.E, shown!.spec.outline, d.source, precedentName(d.source.precedent)) })) : []);
  const target = $derived(Math.round(width * depth * fsi));
</script>

<header class="ty-top">
  <a class="ty-mark" href="./">Permutation City</a>
  <nav aria-label="Pages">
    <a href="typologies" class="wb-btn is-quiet">Typology library</a>
    <a href="workbench" class="wb-btn">Open the workbench</a>
  </nav>
</header>

<main class="bd-main">
  <section class="bd-intro">
    <p class="wb-label">One plot</p>
    <!-- COPY: title and lead are drafts for the user to rewrite. -->
    <h1>Buildings for one plot, from what people built</h1>
    <p class="ty-lead">
      Choose a place, draw the plot and say what it is for. The search reads the climate's problems, picks the houses, courts
      and halls from the library that answer them, and changes them to fit: their size, their height, how they sit, and the
      ponds, trees and roofs around them. Every result says where it came from and what moved.
    </p>
  </section>

  <div class="bd-layout">
    <form class="bd-form" onsubmit={(e) => { e.preventDefault(); run(); }}>
      <fieldset>
        <legend class="wb-label">Place</legend>
        <label class="wb-field"><span class="wb-field-label">Climate from</span>
          <select class="wb-select" bind:value={place}>
            {#each PLACES as p (p.id)}<option value={p.id}>{p.name}</option>{/each}
          </select>
        </label>
        <p class="bd-hint">Places with climate data: the sites and the library's places. Any place comes next.</p>
      </fieldset>

      <fieldset>
        <legend class="wb-label">Plot</legend>
        <div class="bd-pair">
          <label class="wb-field"><span class="wb-field-label">Along the street <span class="wb-mono">m</span></span><input class="wb-input" type="number" min="10" max="200" bind:value={width}></label>
          <label class="wb-field"><span class="wb-field-label">Deep <span class="wb-mono">m</span></span><input class="wb-input" type="number" min="10" max="200" bind:value={depth}></label>
        </div>
        <div class="bd-pair">
          <label class="wb-field"><span class="wb-field-label">Street on the</span>
            <select class="wb-select" bind:value={side}>{#each SIDES as s (s.k)}<option value={s.k}>{s.k} side</option>{/each}</select>
          </label>
          <label class="wb-field"><span class="wb-field-label">Street width <span class="wb-mono">m</span></span><input class="wb-input" type="number" min="3" max="60" bind:value={streetW}></label>
        </div>
        <div class="bd-three">
          <label class="wb-field"><span class="wb-field-label">Front <span class="wb-mono">m</span></span><input class="wb-input" type="number" min="0" max="20" step="0.5" bind:value={front}></label>
          <label class="wb-field"><span class="wb-field-label">Sides <span class="wb-mono">m</span></span><input class="wb-input" type="number" min="0" max="20" step="0.5" bind:value={sideSet}></label>
          <label class="wb-field"><span class="wb-field-label">Rear <span class="wb-mono">m</span></span><input class="wb-input" type="number" min="0" max="20" step="0.5" bind:value={rear}></label>
        </div>
        <p class="bd-hint">Setbacks: the ground kept clear from each edge.</p>
      </fieldset>

      <fieldset>
        <legend class="wb-label">Brief</legend>
        <label class="wb-field"><span class="wb-field-label">For</span>
          <select class="wb-select" bind:value={programme}>{#each PROGRAMMES as k (k)}<option value={k}>{PROGRAMME_LABELS[k]}</option>{/each}</select>
        </label>
        <div class="bd-pair">
          <label class="wb-field"><span class="wb-field-label">Floor ÷ plot area</span><input class="wb-input" type="number" min="0.2" max="5" step="0.1" bind:value={fsi}></label>
          <label class="wb-field"><span class="wb-field-label">Storeys allowed</span><input class="wb-input" type="number" min="1" max="30" bind:value={storeys}></label>
        </div>
        <p class="bd-hint">{target.toLocaleString()} m² of floor on a {(width * depth).toLocaleString()} m² plot.</p>
        <div class="bd-checks">
          <span class="wb-field-label">Problems the climate doesn't show</span>
          <label><input type="checkbox" bind:checked={floods}> Floods here</label>
          <label><input type="checkbox" bind:checked={short}> Water in short supply</label>
        </div>
      </fieldset>

      <div class="bd-go">
        <div class="wb-seg" role="group" aria-label="Search size">
          <button type="button" aria-pressed={size === "quick"} onclick={() => (size = "quick")}>Quick</button>
          <button type="button" aria-pressed={size === "thorough"} onclick={() => (size = "thorough")}>Thorough</button>
        </div>
        {#if running}
          <button type="button" class="wb-btn" onclick={stop}>Stop</button>
        {:else}
          <button type="submit" class="wb-btn is-primary">Find buildings</button>
        {/if}
      </div>
      {#if running}<div class="bd-progress" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin="0" aria-valuemax="100"><span style="width: {progress * 100}%"></span></div>{/if}
      {#if error}<p class="bd-error">{error}</p>{/if}
    </form>

    <section class="bd-results" aria-live="polite">
      {#if !result}
        <div class="bd-empty">
          <p>Set the plot and the brief, then <strong>Find buildings</strong>. A quick search takes a few seconds.</p>
        </div>
      {:else}
        <div class="bd-asks">
          <h2 class="wb-label">What this climate asks</h2>
          <ul class="bd-needs">
            {#each result.needs as n (n.key)}
              <li><span class="bd-bar"><span style="width: {n.weight * 100}%"></span></span><strong>{CHALLENGES[n.key]}</strong> <span class="ty-muted">{n.why}</span></li>
            {/each}
          </ul>
          <h2 class="wb-label">Precedents tried, best answer first</h2>
          <p class="bd-cands">
            {#each result.candidates as c (c.id)}<a class="wb-tag" href="typologies#{c.id}" title="{c.place}: answers {c.answers.map((a) => CHALLENGES[a as Challenge]).join(', ')}{c.against.length ? `; works against ${c.against.map((a) => CHALLENGES[a as Challenge]).join(', ')}` : ''}">{c.name} {pct(c.fit)}</a>{/each}
          </p>
          {#each result.note as n (n)}<p class="bd-note">{n}</p>{/each}
        </div>

        {#if open && shown}
          {@const s = open.source}
          <article class="bd-open">
            <div class="bd-3d"><canvas bind:this={canvas}></canvas></div>
            <div class="bd-detail">
              <p class="wb-label">Opened</p>
              <h2>{precedentName(s.precedent)}{#if s.donor}<span class="ty-muted"> with the units of {precedentName(s.donor)}</span>{/if}</h2>
              <p>{Math.round(open.floor).toLocaleString()} m² of floor for {shown.spec.target.toLocaleString()} m² asked ({pct(Math.abs(open.floor - shown.spec.target) / shown.spec.target)} {open.floor < shown.spec.target ? "short" : "over"}).</p>
              {#if s.drift.length}<p><span class="wb-label">What moved</span> {s.drift.map(changeWords).join("; ")}.</p>{:else}<p class="ty-muted">As the precedent was built.</p>{/if}
              {#if s.keep < 0.99}<p class="ty-muted">{pct(1 - s.keep)} of its buildings left out, spread evenly.</p>{/if}
              {#if s.nature}
                <p><span class="wb-label">Nature's rules</span>
                  ponds {Math.round(s.nature.water.length * 4)} m² · trees over {Math.round(s.nature.trees.length * 4)} m² · {pct(s.nature.green)} of roofs planted · eaves {s.nature.eave} m · façade {pct(s.nature.porosity)} open
                </p>
              {/if}
              <table class="ty-table">
                <tbody>
                  {#each SCORE_ROWS as [k, label, f] (k)}<tr><th scope="row">{label}</th><td class="wb-mono">{f(open.scores[k])}</td></tr>{/each}
                </tbody>
              </table>
              <p class="bd-hint">Rain held is for a {DESIGN_RAIN_MM} mm storm; it and the climate fit are stand-ins until checked against models (docs/massing.md).</p>
            </div>
          </article>
        {/if}

        <h2 class="wb-label bd-count">{result.designs.length} designs · {(result.ms / 1000).toFixed(1)} s{result.hybrids ? " · hybrids allowed" : ""}</h2>
        <ul class="ty-grid bd-grid">
          {#each cards as { d, svg } (d.name)}
            {@const s = d.source}
            <li>
              <button class="ty-card bd-card" aria-pressed={open?.name === d.name} onclick={() => (open = d)}>
                <span class="ty-draw" aria-hidden="true">{@html svg}</span>
                <span class="ty-name">{precedentName(s.precedent)}{#if s.donor} + {precedentName(s.donor)}{/if}</span>
                <span class="ty-place">{Math.round(d.floor).toLocaleString()} m² · {s.storeys} storeys{d.rank === 1 ? " · on the front" : ""}</span>
                <span class="bd-scores wb-mono">rain {pct(d.scores.rain)} · shade {pct(d.scores.plotShade)} · fit {pct(d.scores.fit)}</span>
                <span class="ty-mech">{s.drift.slice(0, 3).map(changeWords).join("; ") || "as built"}</span>
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  </div>
</main>
