<script lang="ts">
  // The Evolve step's centre: before a run, what a run does; while it runs, the best designs so
  // far, updated each generation (the live strip), the first of them large; afterwards, one
  // design of each kind the run found.
  import * as E from "../../engine";
  import * as Iso from "../diagrams/iso";
  import * as Draw from "../draw";
  import { bench } from "./bench.svelte";
  import MapCanvas from "./MapCanvas.svelte";
  import * as Paint from "./paint";

  let { site }: { site: E.SiteExport } = $props();
  const P = Draw.palette();
  const runSite = $derived(bench.runSite ?? site);

  // COPY: names in the strip
  const shown = $derived.by((): { name: string; note: string; d: E.Design }[] => {
    if (bench.result) return bench.result.families.filter((f) => f.design).map((f) => ({ name: f.name, note: `${f.size} like it`, d: f.design! }));
    return bench.leaders.map((d, k) => ({ name: `Best now ${k + 1}`, note: `generation ${bench.runGen}`, d }));
  });
  const current = $derived(shown[Math.min(bench.picked3, shown.length - 1)]?.d ?? null);
  const paint = $derived((ctx: CanvasRenderingContext2D, v: Draw.View) => { if (current) Paint.design(ctx, v, runSite, current, P); });
  const version = $derived(current ? current.genome.join(",") : "");
  // thumbnails in the site's own proportions, so a tall site isn't shrunk into a wide frame
  const aspect = $derived(Math.min(1.25, Draw.aspectOf(runSite.design.x, runSite.design.y)));
  const thumb = (d: E.Design) => (c: HTMLCanvasElement) => { Draw.plan(c, runSite, d, P, { aspect }); };
  const evo = Iso.evolution().svg;
</script>

{#if !shown.length}
  <div class="wb-centre-empty">
    <div class="wb-state">
      <figure>{@html evo}</figure>
      {#if bench.running}
        <b>Breeding the first generation</b>
        <span>The best designs appear here as soon as the first generation is scored.</span>
      {:else}
        <b>No run yet</b>
        <!-- COPY: evolve empty state -->
        <span>Designs breed: the better ones become parents, so each generation does a little better. Set the run on the left and start it.</span>
      {/if}
    </div>
  </div>
{:else}
  {#key runSite}
    <MapCanvas site={runSite} {paint} {version} onhover={(i) => (bench.hover = i)} label="Plan of the design shown: {shown[bench.picked3]?.name ?? ''}" />
  {/key}
  <div class="wb-strip-over" aria-live="polite">
    <span class="wb-label">{bench.result ? "One of each kind" : `Best so far · generation ${bench.runGen}`}</span>
    <div class="wb-strip">
      {#each shown as s, k (s.name + k)}
        <button class="wb-thumb" type="button" aria-pressed={k === bench.picked3} onclick={() => (bench.picked3 = k)}>
          <span class="wb-pic"><canvas {@attach thumb(s.d)}></canvas></span>
          <span class="wb-cap"><span>{s.name}</span><span>{s.note}</span></span>
        </button>
      {/each}
    </div>
  </div>
{/if}
