<script lang="ts">
  // The Evolve step's controls: how to search, how long, which run; then run it, with progress,
  // time left and a way to stop. The map stays usable while it runs.
  import { Dice5, Download, FolderOpen, Play, Square } from "lucide";
  import * as E from "../../engine";
  import { poolSize } from "../../engine/pool";
  import { bench } from "./bench.svelte";
  import Icon from "./Icon.svelte";
  import RunFile from "./RunFile.svelte";

  const s = bench.settings;
  const cells = $derived(bench.site?.design.x.length ?? 0);
  const designs = $derived(s.pop * (s.generations + 1));
  // about 0.11 ms of growing per design cell (the A2 timings), shared over the workers
  const seconds = $derived(Math.round((designs * 0.11 * cells) / 1000 / poolSize()));
  const elapsed = $derived(bench.running && bench.runGen > 0 ? (performance.now() - bench.runStarted) / 1000 : 0);
  const left = $derived(bench.runGen > 0 ? Math.max(0, Math.round((elapsed / bench.runGen) * (s.generations - bench.runGen))) : seconds);
  const fmtTime = (t: number) => (t < 60 ? `${t} s` : `${Math.floor(t / 60)} min ${t % 60 ? `${t % 60} s` : ""}`);
  // COPY: search names
  const SEARCH = { auto: "Best trade-offs", "map-elites": "One of every kind" };

  function save() {
    const f = bench.saveFile();
    if (!f) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([f.text], { type: "application/json" }));
    a.download = f.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  const sizeKB = $derived(bench.result && !bench.running ? Math.max(1, Math.round((bench.saveFile()?.text.length ?? 0) / 1024)) : 0);
</script>

<div class="wb-panel">
  {#if bench.restoring}
    <div class="wb-progress is-indeterminate" aria-live="polite"><div class="wb-row"><span>{bench.restoring}</span></div><div class="wb-track"><b></b></div></div>
  {/if}
  {#each bench.notes as n (n)}<p class="wb-hint">{n}</p>{/each}
  {#if !bench.briefLocked}
    <!-- COPY: no brief note -->
    <p class="wb-hint">No confirmed brief: the run uses the site's own figures. <button class="wb-link" type="button" onclick={() => bench.go("brief")}>Set a brief</button></p>
  {/if}

  <div class="wb-field">
    <span class="wb-field-label">Search</span>
    <div class="wb-seg" role="group" aria-label="Search">
      {#each Object.entries(SEARCH) as [k, label]}
        <button type="button" aria-pressed={s.search === k} disabled={bench.running} onclick={() => (s.search = k as typeof s.search)}>{label}</button>
      {/each}
    </div>
    <span class="wb-hint">{s.search === "auto" ? "Keeps the designs nothing else beats on every count." : "Keeps the best design of each kind, for variety."}</span>
  </div>

  <div class="wb-field">
    <label for="wb-gens">Generations <output class="wb-num">{s.generations}</output></label>
    <input id="wb-gens" class="wb-range" type="range" min="5" max="40" step="1" bind:value={s.generations} disabled={bench.running} />
  </div>
  <div class="wb-field">
    <label for="wb-pop">Designs per generation <output class="wb-num">{s.pop}</output></label>
    <input id="wb-pop" class="wb-range" type="range" min="10" max="80" step="5" bind:value={s.pop} disabled={bench.running} />
    <span class="wb-hint wb-num">{designs.toLocaleString("en-IN")} designs, about {fmtTime(seconds)} here.</span>
  </div>
  <div class="wb-field">
    <label for="wb-seed">Run number</label>
    <span class="wb-row">
      <input id="wb-seed" class="wb-input wb-num-input" type="number" min="1" bind:value={s.seed} disabled={bench.running} />
      <button class="wb-icon-btn" type="button" aria-label="A new run number" title="A new run number" disabled={bench.running}
        onclick={() => (s.seed = 1 + Math.floor(Math.random() * 99999))}><Icon icon={Dice5} /></button>
    </span>
    <span class="wb-hint">The same number gives the same run.</span>
  </div>

  {#if Object.keys(bench.geneLocks).length}
    <!-- COPY: locked genes note -->
    <p class="wb-hint">{Object.keys(bench.geneLocks).length} gene{Object.keys(bench.geneLocks).length === 1 ? "" : "s"} locked from a design in Explore.
      <button class="wb-link" type="button" disabled={bench.running} onclick={() => (bench.geneLocks = {})}>Free them</button></p>
  {/if}

  <div class="wb-sub">
    <span class="wb-label">Scored on</span>
    <div class="wb-chips">{#each E.SCORE_KEYS as k}<span class="wb-tag">{E.SCORES[k][0]}</span>{/each}</div>
  </div>

  {#if bench.running}
    <div class="wb-progress" aria-live="polite">
      <div class="wb-row wb-between"><span class="wb-num">Generation {bench.runGen} of {s.generations}</span><span class="wb-num">about {fmtTime(left)} left</span></div>
      <div class="wb-track" style="--at: {Math.round((bench.runGen / s.generations) * 100)}%"><b></b></div>
      <button class="wb-btn" type="button" onclick={() => bench.cancel()}><Icon icon={Square} />Stop</button>
    </div>
  {:else}
    <button class="wb-btn is-primary" type="button" onclick={() => bench.run()}><Icon icon={Play} />Run {s.generations} generations</button>
  {/if}
  {#if bench.runError}<p class="wb-error" role="alert">{bench.runError}</p>{/if}
  {#if bench.result && !bench.running}
    <!-- COPY: run summary -->
    <p class="wb-hint wb-num">{bench.result.everyone.toLocaleString("en-IN")} designs bred; {bench.result.frontSize} on the front, in {bench.result.families.length} kinds.</p>
    <div class="wb-sub">
      <span class="wb-label">Keep this run</span>
      <!-- COPY: saving a run -->
      <span class="wb-hint">Share (top right) copies a link that breeds this run again. A file opens it as it is, with no wait.</span>
      <div class="wb-row">
        <button class="wb-btn" type="button" onclick={save}><Icon icon={Download} />Save the run · {sizeKB} KB</button>
        <RunFile><Icon icon={FolderOpen} />Open a run</RunFile>
      </div>
    </div>
  {:else if !bench.running}
    <RunFile quiet><Icon icon={FolderOpen} />Open a saved run</RunFile>
  {/if}
</div>
