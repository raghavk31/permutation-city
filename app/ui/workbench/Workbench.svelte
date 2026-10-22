<script lang="ts">
  // The workbench frame (brief 10.4): top bar; the steps on the left, the active one open with
  // its controls; the map in the centre; the inspector on the right; the pen below.
  import { ChevronLeft, ChevronRight, CircleHelp, Redo2, Share2, Undo2 } from "lucide";
  import { bench, STEPS } from "./bench.svelte";
  import Icon from "./Icon.svelte";
  import Inspector from "./Inspector.svelte";
  import LayersMap from "./LayersMap.svelte";
  import LayersRail from "./LayersRail.svelte";
  import SiteMap from "./SiteMap.svelte";
  import SiteRail from "./SiteRail.svelte";

  let copied = $state(false);
  let toast = $state("");
  let toastTimer: ReturnType<typeof setTimeout> | undefined;

  function say(text: string) {
    toast = text;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toast = ""), 2200);
  }

  async function share() {
    try {
      await navigator.clipboard.writeText(location.href);
      copied = true;
      say("Link copied");
      setTimeout(() => (copied = false), 1500);
    } catch {
      say("Copy the address bar to share this view");
    }
  }

  const stepMeta = (id: string) => {
    if (id === "site" && bench.site) return `${Math.round(bench.site.meta.design_ha)} ha`;
    if (id === "layers" && bench.site) return `${Object.keys(bench.site.grid.layers ?? {}).length}`;
    return "";
  };
  // COPY: why a step is blocked
  const blockedWhy = (id: string) => (STEPS.find((s) => s.id === id)!.built ? "Pick a site first" : "Built next, in A3");
</script>

<div class="wb-narrow">
  <!-- COPY: phone note -->
  <p><b>The workbench needs a wider screen.</b> On a phone, the story walks through the same ideas with prepared runs.</p>
  <a class="wb-btn is-primary" href="./">Read the story</a>
</div>

<div class="wb-app" class:no-rail={!bench.railOpen} class:no-insp={!bench.inspOpen}>
  <header class="wb-top">
    <a class="wb-brand" href="./">Permutation City</a>
    <span class="wb-crumb">{bench.site ? bench.site.meta.name : "No site yet"}</span>
    <div class="wb-top-right">
      <!-- COPY: run status -->
      <span class="wb-pill">No run yet</span>
      <button class="wb-icon-btn" type="button" aria-label="Undo" title="Undo (Ctrl Z)" disabled><Icon icon={Undo2} /></button>
      <button class="wb-icon-btn" type="button" aria-label="Redo" title="Redo (Ctrl Shift Z)" disabled><Icon icon={Redo2} /></button>
      <button class="wb-btn" type="button" onclick={share}><Icon icon={Share2} />{copied ? "Copied" : "Share"}</button>
      <button class="wb-icon-btn" type="button" aria-label="Help" title="What this step does"
        onclick={() => bench.seen(bench.step, false)}><Icon icon={CircleHelp} /></button>
    </div>
  </header>

  <aside class="wb-rail" aria-label="Steps">
    <ol class="wb-steps">
      {#each STEPS as s (s.id)}
        {@const st = bench.stateOf(s.id)}
        <li class="wb-step" data-state={st}>
          <button type="button" aria-current={st === "now" ? "step" : undefined} aria-disabled={st === "blocked"}
            title={st === "blocked" ? blockedWhy(s.id) : undefined} onclick={() => bench.go(s.id)}>
            <span class="wb-dot"></span>{s.name}<span class="wb-meta">{stepMeta(s.id)}</span>
          </button>
          {#if st === "now"}
            <div class="wb-rail-panel">
              {#if s.id === "site"}<SiteRail />
              {:else if s.id === "layers"}<LayersRail />
              {/if}
            </div>
          {/if}
        </li>
      {/each}
    </ol>
    <button class="wb-icon-btn wb-fold" type="button" aria-label={bench.railOpen ? "Fold the steps" : "Open the steps"}
      title="Fold the steps ([)" onclick={() => (bench.railOpen = !bench.railOpen)}><Icon icon={bench.railOpen ? ChevronLeft : ChevronRight} /></button>
  </aside>

  <main class="wb-centre">
    {#if bench.step === "site"}
      <SiteMap />
    {:else if bench.step === "layers" && bench.site}
      <LayersMap site={bench.site} />
    {/if}
    {#if bench.loading}
      <div class="wb-centre-note"><div class="wb-progress is-indeterminate"><div class="wb-row"><span>Opening the site</span></div><div class="wb-track"><b></b></div></div></div>
    {/if}
    {#if toast}<div class="wb-toast wb-toast-at" role="status">{toast}</div>{/if}
  </main>

  <aside class="wb-insp" aria-label="Inspector">
    <Inspector />
    <button class="wb-icon-btn wb-fold" type="button" aria-label={bench.inspOpen ? "Fold the inspector" : "Open the inspector"}
      title="Fold the inspector (])" onclick={() => (bench.inspOpen = !bench.inspOpen)}><Icon icon={bench.inspOpen ? ChevronRight : ChevronLeft} /></button>
  </aside>

  <footer class="wb-tray">
    <span class="wb-label">Pen</span>
    <!-- COPY: empty pen -->
    <span class="wb-quiet">Designs you keep appear here, once a run has bred some.</span>
  </footer>
</div>

<svelte:window onkeydown={(e) => {
  if ((e.target as HTMLElement).closest("input, select, textarea")) return;
  if (e.key === "[") bench.railOpen = !bench.railOpen;
  if (e.key === "]") bench.inspOpen = !bench.inspOpen;
}} />
