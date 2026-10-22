<script lang="ts">
  // The workbench frame (brief 10.4): top bar; the steps on the left, the active one open with
  // its controls; the map in the centre; the inspector on the right; the pen below.
  import { ChevronLeft, ChevronRight, CircleHelp, Redo2, Share2, Undo2 } from "lucide";
  import { bench, STEPS } from "./bench.svelte";
  import Icon from "./Icon.svelte";
  import Inspector from "./Inspector.svelte";
  import LayersMap from "./LayersMap.svelte";
  import * as Draw from "../draw";
  import BriefMap from "./BriefMap.svelte";
  import BriefRail from "./BriefRail.svelte";
  import EvolveCentre from "./EvolveCentre.svelte";
  import EvolveRail from "./EvolveRail.svelte";
  import ExploreCentre from "./ExploreCentre.svelte";
  import ExploreRail from "./ExploreRail.svelte";
  import MassingCentre from "./MassingCentre.svelte";
  import MassingRail from "./MassingRail.svelte";
  import LandformMap from "./LandformMap.svelte";
  import LandformRail from "./LandformRail.svelte";
  import LayersRail from "./LayersRail.svelte";
  import RulesMap from "./RulesMap.svelte";
  import RulesRail from "./RulesRail.svelte";
  import SiteMap from "./SiteMap.svelte";
  import SiteRail from "./SiteRail.svelte";

  const P = Draw.palette();
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
    if (id === "rules" && bench.rules) return bench.edited ? "changed" : `${bench.rules.list.length}`;
    if (id === "brief") return bench.briefLocked ? "confirmed" : bench.brief ? "draft" : "";
    if (id === "evolve") return bench.running ? `${bench.runGen} of ${bench.settings.generations}` : bench.result ? `${bench.result.frontSize} on front` : "";
    if (id === "explore" && bench.result) return `${bench.result.kept.length} kept`;
    if (id === "massing" && bench.mass.source && bench.mass.block >= 0) return bench.mass.running ? `${bench.mass.gen} of ${bench.mass.generations}` : `block ${bench.mass.block + 1}`;
    if (id === "landform" && bench.site?.meta.landform) return { flat: "flat", gentle: "gentle", pronounced: "hilly" }[bench.site.meta.landform.relief.class];
    return "";
  };
  // COPY: why a step is blocked
  const blockedWhy = (id: string) => (!STEPS.find((s) => s.id === id)!.built ? "Built next, in A3" : bench.site ? "Run an evolution first" : "Pick a site first");
</script>

<div class="wb-narrow">
  <!-- COPY: phone note -->
  <p><b>The workbench needs a wider screen.</b> On a phone, the story walks through the same ideas with prepared runs.</p>
  <a class="wb-btn is-primary" href="./">Read the story</a>
</div>

<div class="wb-app" class:no-rail={!bench.railOpen} class:no-insp={!bench.inspOpen} class:is-presenting={bench.step === "massing" && bench.mass.presenting}>
  <header class="wb-top">
    <a class="wb-brand" href="./">Permutation City</a>
    <span class="wb-crumb">{bench.site ? bench.site.meta.name : "No site yet"}</span>
    <div class="wb-top-right">
      <!-- COPY: run status -->
      <span class="wb-pill">{bench.running ? `Running: generation ${bench.runGen} of ${bench.settings.generations}` : bench.result ? `Run done: ${bench.result.frontSize} on the front` : "No run yet"}</span>
      <button class="wb-icon-btn" type="button" aria-label="Undo" title="Undo (Ctrl Z)" disabled={!bench.past.length} onclick={() => bench.undo()}><Icon icon={Undo2} /></button>
      <button class="wb-icon-btn" type="button" aria-label="Redo" title="Redo (Ctrl Shift Z)" disabled={!bench.future.length} onclick={() => bench.redo()}><Icon icon={Redo2} /></button>
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
              {:else if s.id === "rules"}<RulesRail />
              {:else if s.id === "landform"}<LandformRail />
              {:else if s.id === "brief"}<BriefRail />
              {:else if s.id === "evolve"}<EvolveRail />
              {:else if s.id === "explore" && bench.result}<ExploreRail />
              {:else if s.id === "massing" && bench.result}<MassingRail />
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
    {:else if bench.step === "rules" && bench.site && bench.rules}
      <RulesMap site={bench.site} />
    {:else if bench.step === "landform" && bench.site}
      <LandformMap site={bench.site} />
    {:else if bench.step === "brief" && bench.site && bench.rules}
      <BriefMap site={bench.site} />
    {:else if bench.step === "evolve" && bench.site}
      <EvolveCentre site={bench.site} />
    {:else if bench.step === "explore" && bench.result && bench.runSite}
      <ExploreCentre />
    {:else if bench.step === "massing" && bench.mass.source}
      <MassingCentre />
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

  <footer class="wb-tray" class:has-pen={bench.pen.length > 0}>
    <span class="wb-label">Pen</span>
    {#if bench.pen.length}
      <div class="wb-pen">
        {#each bench.pen as p (p.name)}
          <span class="wb-pen-item" title={p.name}><canvas {@attach (c: HTMLCanvasElement) => { Draw.plan(c, p.site, p.design, P, { aspect: Math.min(1.25, Draw.aspectOf(p.site.design.x, p.site.design.y)) }); }}></canvas><span>{p.name}</span></span>
        {/each}
      </div>
    {:else}
      <!-- COPY: empty pen -->
      <span class="wb-quiet">Designs you keep appear here, once a run has bred some.</span>
    {/if}
  </footer>
</div>

<svelte:window onkeydown={(e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !(e.target as HTMLElement).closest("input, textarea")) {
    e.preventDefault();
    if (e.shiftKey) bench.redo(); else bench.undo();
    return;
  }
  if ((e.target as HTMLElement).closest("input, select, textarea")) return;
  if (e.key === "[") bench.railOpen = !bench.railOpen;
  if (e.key === "]") bench.inspOpen = !bench.inspOpen;
}} />
