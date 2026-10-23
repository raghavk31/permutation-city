<script lang="ts">
  // The workbench frame (brief 10.4): top bar; the steps on the left, the active one open with
  // its controls; the map in the centre; the inspector on the right; the pen below.
  import { ChevronLeft, ChevronRight, CircleHelp, Keyboard, Redo2, Share2, Undo2 } from "lucide";
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
  let keys = $state<HTMLDialogElement>();
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
    if (id === "explore" && bench.result) return `${bench.result.kept.length} designs`;
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
      <button class="wb-icon-btn" type="button" aria-label="Keyboard shortcuts" title="Keyboard shortcuts (?)"
        onclick={() => keys?.showModal()}><Icon icon={Keyboard} /></button>
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
          <button class="wb-pen-item" type="button" title="Open {p.name} in Explore"
            onclick={() => { if (!bench.openPen(p.name)) say("This design is from an earlier run"); }}><canvas {@attach (c: HTMLCanvasElement) => { Draw.plan(c, p.site, p.design, P, { aspect: Math.min(1.25, Draw.aspectOf(p.site.design.x, p.site.design.y)) }); }}></canvas><span>{bench.titleOf(p.name)}</span></button>
        {/each}
      </div>
    {:else}
      <!-- COPY: empty pen -->
      <span class="wb-quiet">Designs you keep appear here, once a run has bred some.</span>
    {/if}
  </footer>
</div>

<svelte:window onkeydown={(e) => {
  if (keys?.open) { if (e.key === "Escape") keys.close(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !(e.target as HTMLElement).closest("input, textarea")) {
    e.preventDefault();
    if (e.shiftKey) bench.redo(); else bench.undo();
    return;
  }
  if ((e.target as HTMLElement).closest("input, select, textarea") || e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key.toLowerCase();
  if (e.key === "[") bench.railOpen = !bench.railOpen;
  else if (e.key === "]") bench.inspOpen = !bench.inspOpen;
  else if (k === "j") bench.nextDesign(1);
  else if (k === "k") bench.nextDesign(-1);
  else if (k === "p") bench.keepCurrent();
  else if (e.key === "2" && bench.step === "massing") bench.mass.view = "plan";
  else if (e.key === "3" && bench.step === "massing" && bench.mass.chosen) bench.mass.view = "3d";
  else if (e.key === "?") keys?.showModal();
  else return;
  e.preventDefault();
}} />

<dialog class="wb-dialog" bind:this={keys} aria-labelledby="wb-keys-title" onclick={(e) => { if (e.target === keys) keys.close(); }}>
  <div class="wb-dialog-body">
    <b id="wb-keys-title">Keyboard shortcuts</b>
    <!-- COPY: shortcuts -->
    <dl class="wb-keys">
      <dt><kbd>J</kbd> <kbd>K</kbd></dt><dd>next and previous design</dd>
      <dt><kbd>P</kbd></dt><dd>keep the open design in the pen</dd>
      <dt><kbd>2</kbd> <kbd>3</kbd></dt><dd>plan or 3D, on the Massing step</dd>
      <dt><kbd>Ctrl</kbd> <kbd>Z</kbd></dt><dd>undo a rule change; with <kbd>Shift</kbd>, redo</dd>
      <dt><kbd>[</kbd> <kbd>]</kbd></dt><dd>fold the steps, fold the inspector</dd>
      <dt><kbd>+</kbd> <kbd>-</kbd> <kbd>0</kbd></dt><dd>zoom the map in, out, and fit it (arrows pan)</dd>
      <dt><kbd>Esc</kbd></dt><dd>leave presentation, or close this</dd>
      <dt><kbd>?</kbd></dt><dd>this list</dd>
    </dl>
    <form method="dialog"><button class="wb-btn">Close</button></form>
  </div>
</dialog>
