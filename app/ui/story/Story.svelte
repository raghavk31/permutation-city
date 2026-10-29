<script lang="ts">
  // The story page (brief 10.13; docs/ui/wireframes/story.html): the text scrolls, and the view
  // beside it changes with the section in the middle of the screen. On a phone the view sits
  // above the text. Every view comes from one prepared run (prepared.ts), loaded after the
  // text is up.
  import { onMount } from "svelte";
  import * as Iso from "../diagrams/iso";
  import Pin from "./Pin.svelte";
  import { load, type Prepared } from "./prepared";
  import { SECTIONS } from "./sections";

  let active = $state(0);
  let p = $state.raw<Prepared | null>(null);
  let failed = $state("");
  const diagrams = Object.fromEntries(Iso.DIAGRAMS().map((d) => [d.id, d]));
  let secs: HTMLElement[] = [];

  onMount(() => {
    // The section crossing the middle of the screen is the one shown.
    const io = new IntersectionObserver((es) => {
      for (const e of es) if (e.isIntersecting) active = +(e.target as HTMLElement).dataset.k!;
    }, { rootMargin: "-45% 0px -45% 0px" });
    secs.forEach((el) => io.observe(el));
    // After first paint, so the text is readable while the run loads.
    requestAnimationFrame(() => setTimeout(() => {
      load().then((r) => (p = r)).catch((err) => { failed = "The prepared run didn't load."; console.error(err); });
    }, 50));
    return () => io.disconnect();
  });
</script>

<header class="st-top">
  <a class="st-mark" href="./">Permutation City</a>
  <nav aria-label="Pages">
    <a href="#found" class="wb-btn is-quiet">Results</a>
    <a href="typologies" class="wb-btn is-quiet">Typologies</a>
    <a href="workbench" class="wb-btn">Open the workbench</a>
  </nav>
</header>

<main class="st-grid">
  <div class="st-text">
    {#each SECTIONS as s, k (s.id)}
      <section id={s.id} class="st-sec" class:is-first={k === 0} data-k={k} bind:this={secs[k]} aria-labelledby="{s.id}-h">
        <p class="st-n wb-mono">{String(k + 1).padStart(2, "0")} / {String(SECTIONS.length).padStart(2, "0")}</p>
        {#if k === 0}<h1 id="{s.id}-h">{s.title}</h1>{:else}<h2 id="{s.id}-h">{s.title}</h2>{/if}
        <p class="st-lead">{s.lead}</p>
        {#each s.body as para, j (j)}<p>{para}</p>{/each}
        {#each s.diagrams as id (id)}
          {@const d = diagrams[id]}
          {#if d}
            <figure class="st-diagram">
              {@html d.svg}
              <figcaption><b>{d.title}.</b> {d.caption}</figcaption>
            </figure>
          {/if}
        {/each}
        {#if s.id === "found"}
          <p><a class="wb-btn is-primary" href="workbench">Try it on your own site</a></p>
          <p class="st-small">The earlier version of this page, with growth over time and every chapter on one page, is at
            <a href="classic">/classic</a>. The code is at <a href="https://github.com/raghavk31/permutation-city">github.com/raghavk31/permutation-city</a>.</p>
        {/if}
      </section>
    {/each}
  </div>
  <div class="st-pin" aria-live="polite">
    <Pin s={SECTIONS[active]} {p} {failed} />
  </div>
</main>
