<script lang="ts">
  // Nature's rules (engine/typology/nature.ts): what living things and landscapes do that a
  // building or a site can borrow, each as a gene with the range found in nature and the range
  // carried into the design. Cards drawn from the gene's diagram; a gene opens in a panel. The
  // open gene is in the URL hash as #gene-<id>.
  import { onMount } from "svelte";
  import { GENES, GENE_KINDS, GENE_SCALES, MEASURED, type Gene } from "../../engine/typology/nature";
  import { CLIMATES, MECHANISMS } from "../../engine/typology/types";
  import { drawGene } from "../diagrams/nature";

  const drawings = new Map(GENES.map((g) => [g.id, drawGene(g.id, `${g.element}: ${g.name}`)]));
  let kind = $state<keyof typeof GENE_KINDS | "">("");
  let scale = $state<keyof typeof GENE_SCALES | "">("");
  let q = $state("");
  const shown = $derived(GENES.filter((g) => (!kind || g.kind === kind) && (!scale || g.scale === scale)
    && (!q || `${g.element} ${g.name} ${g.nature} ${g.application}`.toLowerCase().includes(q.toLowerCase()))));
  const CONF = { high: "Primary source", medium: "Reliable source", low: "One source, or sources disagree", assumed: "No source yet" } as const;

  let open = $state<Gene | null>(null);
  let dialog: HTMLDialogElement;
  function show(g: Gene | null) {
    open = g;
    if (g) { history.replaceState(null, "", `#gene-${g.id}`); dialog?.showModal(); }
    else { history.replaceState(null, "", location.pathname + location.search); dialog?.close(); }
  }
  onMount(() => {
    const fromHash = () => { const g = GENES.find((x) => `gene-${x.id}` === location.hash.slice(1)); if (g) show(g); };
    fromHash();
    addEventListener("hashchange", fromHash);
    return () => removeEventListener("hashchange", fromHash);
  });
  const count = (k: string, v: string) => GENES.filter((g) => (g as unknown as Record<string, string>)[k] === v).length;
</script>

<section class="ty-filters" aria-label="Filter nature's rules">
  <div class="ty-row is-genes">
    <div class="ty-field"><span class="wb-label">What it does</span>
      <div class="wb-seg" role="group" aria-label="What it does">
        <button aria-pressed={kind === ""} onclick={() => (kind = "")}>Both</button>
        {#each Object.entries(GENE_KINDS) as [k, label] (k)}<button aria-pressed={kind === k} onclick={() => (kind = k as typeof kind)}>{label} <span class="wb-mono">{count("kind", k)}</span></button>{/each}
      </div>
    </div>
    <div class="ty-field"><span class="wb-label">Scale</span>
      <div class="wb-seg" role="group" aria-label="Scale">
        <button aria-pressed={scale === ""} onclick={() => (scale = "")}>Both</button>
        {#each Object.entries(GENE_SCALES) as [k, label] (k)}<button aria-pressed={scale === k} onclick={() => (scale = k as typeof scale)}>{label} <span class="wb-mono">{count("scale", k)}</span></button>{/each}
      </div>
    </div>
    <label class="ty-field"><span class="wb-label">Search</span><input class="wb-input" type="search" placeholder="Leaf, river, shade" bind:value={q}></label>
  </div>
</section>

{#if shown.length}
  <ul class="ty-grid">
    {#each shown as g (g.id)}
      <li>
        <button class="ty-card is-gene" onclick={() => show(g)} aria-label="{g.element}: {g.name}">
          <span class="ty-draw" aria-hidden="true">{@html drawings.get(g.id)}</span>
          <span class="ty-place">{g.element}</span>
          <span class="ty-name">{g.name}</span>
          <span class="ty-tags"><span class="wb-tag">{GENE_KINDS[g.kind]}</span><span class="wb-tag">{GENE_SCALES[g.scale]}</span></span>
          <span class="ty-range"><span class="wb-label">In nature</span> {g.natural.value}</span>
          <span class="ty-range"><span class="wb-label">In the design</span> {g.built.value}</span>
          <span class="ty-mech">{MEASURED[g.measured]}{g.myth ? " · read the caveat" : ""}</span>
        </button>
      </li>
    {/each}
  </ul>
{:else}
  <p class="ty-empty">Nothing matches. <button class="wb-btn is-quiet" onclick={() => { q = ""; kind = ""; scale = ""; }}>Clear the filters</button></p>
{/if}

<dialog class="ty-dialog" bind:this={dialog} onclose={() => open && show(null)} onclick={(e) => { if (e.target === dialog) show(null); }}>
  {#if open}
    {@const g = open}
    <article class="ty-detail">
      <header class="ty-dhead">
        <div>
          <p class="wb-label">{GENE_KINDS[g.kind]} · {GENE_SCALES[g.scale]}</p>
          <h2>{g.name}</h2>
          <p class="ty-place">{g.element}</p>
        </div>
        <button class="wb-btn is-quiet" onclick={() => show(null)} aria-label="Close">Close</button>
      </header>
      <div class="ty-dbody">
        <figure class="ty-big">
          {@html drawings.get(g.id)}
          <figcaption>{g.application}</figcaption>
        </figure>
        <div class="ty-text">
          <p class="ty-lead">{g.nature}</p>
          <p class="ty-lesson"><span class="wb-label">The rule</span>{g.rule}</p>
          <dl class="ty-facts">
            <div><dt class="wb-label">In nature</dt><dd>{g.natural.what}: {g.natural.value} <span class="wb-tag" class:is-low={g.natural.conf === "low"} class:is-assumed={g.natural.conf === "assumed"} title={CONF[g.natural.conf]}>{g.natural.conf}</span></dd></div>
            <div><dt class="wb-label">In the design</dt><dd>{g.built.what}: {g.built.value} <span class="wb-tag" class:is-low={g.built.conf === "low"} class:is-assumed={g.built.conf === "assumed"} title={CONF[g.built.conf]}>{g.built.conf}</span></dd></div>
            <div><dt class="wb-label">Changes</dt><dd>{g.built.drives}</dd></div>
            <div><dt class="wb-label">Should improve</dt><dd>{g.moves}{#if g.metric} <span class="wb-mono ty-muted">({g.metric})</span>{/if}</dd></div>
            <div><dt class="wb-label">Checked by</dt><dd>{MEASURED[g.measured]}</dd></div>
            <div><dt class="wb-label">How it works</dt><dd>{g.jobs.map((m) => MECHANISMS[m]).join(" · ")}</dd></div>
            {#if g.climates}<div><dt class="wb-label">Climates</dt><dd>{g.climates.map((c) => CLIMATES[c].label).join(" · ")}</dd></div>{/if}
          </dl>
          {#if g.myth}<p class="ty-gap"><span class="wb-label">Caveat</span> {g.myth}</p>{/if}
        </div>
        <section class="ty-sec">
          <h3 class="wb-label">What we know</h3>
          <table class="ty-table">
            <tbody>
              {#each g.figures as x, i (i)}
                <tr>
                  <th scope="row">{x.what}</th>
                  <td>{x.value}</td>
                  <td><span class="wb-tag" class:is-low={x.conf === "low"} class:is-assumed={x.conf === "assumed"} title={CONF[x.conf]}>{x.conf}</span></td>
                  <td>{#if x.src != null}<a href={g.sources[x.src].url} target="_blank" rel="noopener">source {x.src + 1}</a>{:else}<span class="ty-muted">not yet cited</span>{/if}</td>
                </tr>
              {/each}
            </tbody>
          </table>
          {#if g.gaps}<p class="ty-gap"><span class="wb-label">Still missing</span> {g.gaps}</p>{/if}
        </section>
        <section class="ty-sec">
          <h3 class="wb-label">Sources</h3>
          <ol class="ty-sources">
            {#each g.sources as s, i (i)}<li><a href={s.url} target="_blank" rel="noopener">{s.title}</a></li>{/each}
          </ol>
        </section>
      </div>
    </article>
  {/if}
</dialog>
