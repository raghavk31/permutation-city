<script lang="ts">
  // The typology library (docs/typologies.md). Cards drawn from each precedent's seed; filters
  // by programme, climate, mechanism and kind; a precedent opens in a panel with its figures,
  // sources and the numbers its drawing was made from. The open precedent is in the URL hash,
  // so a link opens it.
  import { onMount } from "svelte";
  import { LIBRARY } from "../../engine/typology/library";
  import { CLIMATES, MECHANISMS, PROGRAMMES, type Climate, type Mechanism, type Precedent, type Programme } from "../../engine/typology/types";
  import { drawTypology, fmt } from "../diagrams/typology";

  const drawings = new Map(LIBRARY.map((p) => [p.id, drawTypology(p.seed, p.name)]));

  let q = $state("");
  let programme = $state<Programme | "">("");
  let climate = $state<Climate | "">("");
  let mechanism = $state<Mechanism | "">("");
  let kind = $state<"all" | "vernacular" | "modern">("all");
  let open = $state<Precedent | null>(null);
  let dialog: HTMLDialogElement;

  const matches = (p: Precedent) =>
    (!programme || p.programmes.includes(programme))
    && (!climate || p.climate === climate)
    && (!mechanism || p.mechanisms.includes(mechanism))
    && (kind === "all" || (kind === "modern") === !!p.modern)
    && (!q || `${p.name} ${p.local ?? ""} ${p.place} ${p.summary} ${p.materials.join(" ")}`.toLowerCase().includes(q.toLowerCase()));
  const shown = $derived(LIBRARY.filter(matches));
  const countBy = (k: Programme) => LIBRARY.filter((p) => p.programmes.includes(k)).length;
  const usedClimates = (Object.keys(CLIMATES) as Climate[]).filter((c) => LIBRARY.some((p) => p.climate === c));
  const usedMechs = (Object.keys(MECHANISMS) as Mechanism[]).filter((m) => LIBRARY.some((p) => p.mechanisms.includes(m)));
  const figures = LIBRARY.reduce((a, p) => a + p.figures.length, 0);
  const sourced = LIBRARY.reduce((a, p) => a + p.figures.filter((x) => x.conf === "high" || x.conf === "medium").length, 0);

  const CONF = { high: "Primary source", medium: "Reliable source", low: "One source, or sources disagree", assumed: "No source yet" } as const;

  function show(p: Precedent | null) {
    open = p;
    if (p) { history.replaceState(null, "", `#${p.id}`); dialog?.showModal(); }
    else { history.replaceState(null, "", location.pathname + location.search); dialog?.close(); }
  }

  onMount(() => {
    const fromHash = () => { const p = LIBRARY.find((x) => x.id === location.hash.slice(1)); if (p) show(p); };
    fromHash();
    addEventListener("hashchange", fromHash);
    return () => removeEventListener("hashchange", fromHash);
  });

  const seedRows = (p: Precedent) => Object.entries(p.seed)
    .filter(([k]) => k !== "arrangement")
    .map(([k, v]) => [SEED_WORDS[k] ?? k, typeof v === "object" ? `${v.width} × ${v.depth} m, ${v.storeys} storeys` : String(v)]);
  const SEED_WORDS: Record<string, string> = {
    footprint: "Unit shape", width: "Unit width (m)", depth: "Unit depth (m)", storeys: "Storeys", floorH: "Floor to floor (m)",
    count: "Units or rooms", rows: "Rows, rings or sides", court: "Court (m)", diameter: "Diameter (m)", street: "Street or lane (m)",
    gap: "Gap between units (m)", well: "Chowk or air well (share of plan)", raised: "Floor raised (m)", sunken: "Sunk below ground (m)",
    steps: "Steps or terraces", tower: "Tower", trees: "Trees", eave: "Eave or gallery (m)", roof: "Roof", porosity: "Façade open (share)", wall: "Wall thickness (m)", water: "Water held (m deep)",
  };
  const ARR_A: Record<string, string> = {
    row: "a row", ring: "a ring", court: "wings round a court", cluster: "a cluster round a yard", slab: "a slab", tower: "a podium and tower",
    sunken: "a pit sunk in the ground", terraces: "terraces", ponds: "ponds or beds", shed: "sheds", canopy: "a canopy",
  };
  const ARR: Record<string, string> = {
    row: "Row", ring: "Ring", court: "Court", cluster: "Cluster", slab: "Slab", tower: "Podium and tower",
    sunken: "Sunk in the ground", terraces: "Terraces", ponds: "Ponds or beds", shed: "Sheds", canopy: "Canopy",
  };
</script>

<header class="ty-top">
  <a class="ty-mark" href="./">Permutation City</a>
  <nav aria-label="Pages">
    <a href="./" class="wb-btn is-quiet">Story</a>
    <a href="workbench" class="wb-btn">Open the workbench</a>
  </nav>
</header>

<main class="ty-main">
  <section class="ty-intro">
    <p class="wb-label">Typology library</p>
    <!-- COPY: title and lead are drafts for the user to rewrite. -->
    <h1>What people built for their climate</h1>
    <p class="ty-lead">
      Houses, water systems, farms and markets that people shaped over centuries for a climate, a material or a need,
      and a few modern buildings that did the same with new means. Each one is written down as numbers, and every
      drawing here is made from those numbers. The design search will start from these forms and adapt them to a site.
    </p>
    <p class="ty-stats wb-mono">{LIBRARY.length} precedents · {figures} figures, {sourced} from reliable sources · every figure says where it came from</p>
  </section>

  <section class="ty-filters" aria-label="Filter the library">
    <div class="wb-chips" role="group" aria-label="Programme">
      <button class="wb-chip" aria-pressed={programme === ""} onclick={() => (programme = "")}>All <span class="wb-mono">{LIBRARY.length}</span></button>
      {#each Object.entries(PROGRAMMES) as [k, label] (k)}
        {@const n = countBy(k as Programme)}
        {#if n}<button class="wb-chip" aria-pressed={programme === k} onclick={() => (programme = programme === k ? "" : (k as Programme))}>{label} <span class="wb-mono">{n}</span></button>{/if}
      {/each}
    </div>
    <div class="ty-row">
      <label class="ty-field"><span class="wb-label">Search</span><input class="wb-input" type="search" placeholder="Name, place or material" bind:value={q}></label>
      <label class="ty-field"><span class="wb-label">Climate</span>
        <select class="wb-select" bind:value={climate}>
          <option value="">Any climate</option>
          {#each usedClimates as c (c)}<option value={c}>{CLIMATES[c].label}</option>{/each}
        </select>
      </label>
      <label class="ty-field"><span class="wb-label">How it works</span>
        <select class="wb-select" bind:value={mechanism}>
          <option value="">Any</option>
          {#each usedMechs as m (m)}<option value={m}>{MECHANISMS[m]}</option>{/each}
        </select>
      </label>
      <div class="ty-field"><span class="wb-label">Made by</span>
        <div class="wb-seg" role="group" aria-label="Made by">
          <button aria-pressed={kind === "all"} onclick={() => (kind = "all")}>All</button>
          <button aria-pressed={kind === "vernacular"} onclick={() => (kind = "vernacular")}>Tradition</button>
          <button aria-pressed={kind === "modern"} onclick={() => (kind = "modern")}>Architects</button>
        </div>
      </div>
    </div>
  </section>

  {#if shown.length}
    <ul class="ty-grid">
      {#each shown as p (p.id)}
        {@const d = drawings.get(p.id)!}
        <li>
          <button class="ty-card" onclick={() => show(p)} aria-label="{p.name}, {p.place}">
            <span class="ty-draw" aria-hidden="true">{@html d.svg}</span>
            <span class="ty-scale wb-mono">bar 10 m · plot {fmt(d.plot.w, 0)} × {fmt(d.plot.d, 0)} m</span>
            <span class="ty-name">{p.name}</span>
            <span class="ty-place">{p.place}</span>
            <span class="ty-tags">
              {#each p.programmes as k (k)}<span class="wb-tag">{PROGRAMMES[k]}</span>{/each}
            </span>
            <span class="ty-mech">{p.mechanisms.slice(0, 3).map((m) => MECHANISMS[m]).join(" · ")}</span>
          </button>
        </li>
      {/each}
    </ul>
  {:else}
    <p class="ty-empty">Nothing matches. <button class="wb-btn is-quiet" onclick={() => { q = ""; programme = ""; climate = ""; mechanism = ""; kind = "all"; }}>Clear the filters</button></p>
  {/if}
</main>

<dialog class="ty-dialog" bind:this={dialog} onclose={() => open && show(null)} onclick={(e) => { if (e.target === dialog) show(null); }}>
  {#if open}
    {@const p = open}
    {@const d = drawings.get(p.id)!}
    <article class="ty-detail">
      <header class="ty-dhead">
        <div>
          <p class="wb-label">{p.programmes.map((k) => PROGRAMMES[k]).join(" · ")}{p.modern ? " · by an architect" : ""}</p>
          <h2>{p.name}{#if p.local}<span class="ty-local"> ({p.local})</span>{/if}</h2>
          <p class="ty-place">{p.place} · {p.era}</p>
        </div>
        <button class="wb-btn is-quiet" onclick={() => show(null)} aria-label="Close">Close</button>
      </header>

      <div class="ty-dbody">
        <figure class="ty-big">
          {@html d.svg}
          <figcaption>Drawn from the numbers below, as {ARR_A[p.seed.arrangement]}. The bar is 10 m; the plot is {fmt(d.plot.w, 0)} × {fmt(d.plot.d, 0)} m. {p.seedNote}</figcaption>
        </figure>

        <div class="ty-text">
          <p class="ty-lead">{p.summary}</p>
          <p>{p.how}</p>
          <dl class="ty-facts">
            <div><dt class="wb-label">Climate</dt><dd>{CLIMATES[p.climate].label} <span class="wb-mono ty-muted">{CLIMATES[p.climate].koppen}</span></dd></div>
            <div><dt class="wb-label">Materials</dt><dd>{p.materials.join(", ")}</dd></div>
            <div><dt class="wb-label">How it works</dt><dd>{p.mechanisms.map((m) => MECHANISMS[m]).join(" · ")}</dd></div>
          </dl>
        </div>

        <section class="ty-sec">
          <h3 class="wb-label">What we know</h3>
          <table class="ty-table">
            <tbody>
              {#each p.figures as x, i (i)}
                <tr>
                  <th scope="row">{x.what}</th>
                  <td>{x.value}</td>
                  <td><span class="wb-tag" class:is-low={x.conf === "low"} class:is-assumed={x.conf === "assumed"} title={CONF[x.conf]}>{x.conf}</span></td>
                  <td>{#if x.src != null}<a href={p.sources[x.src].url} target="_blank" rel="noopener">source {x.src + 1}</a>{:else}<span class="ty-muted">derived</span>{/if}</td>
                </tr>
              {/each}
            </tbody>
          </table>
          {#if p.gaps}<p class="ty-gap"><span class="wb-label">Still missing</span> {p.gaps}</p>{/if}
        </section>

        <section class="ty-sec">
          <h3 class="wb-label">The drawing's numbers</h3>
          <table class="ty-table is-seed">
            <tbody>
              <tr><th scope="row">Arrangement</th><td>{ARR[p.seed.arrangement]}</td></tr>
              {#each seedRows(p) as [k, v] (k)}<tr><th scope="row">{k}</th><td class="wb-mono">{v}</td></tr>{/each}
            </tbody>
          </table>
          {#if d.floorArea > 0 && (p.programmes.includes("housing") || p.programmes.includes("commercial") || p.programmes.includes("education"))}
            <p class="ty-muted">Measured from the drawing: floor area {fmt(d.floorArea, 0)} m² on a plot of {fmt(d.plot.w, 0)} × {fmt(d.plot.d, 0)} m, so a floor space index of {fmt(d.fsi, 2)} and ground covered {fmt(d.gsi * 100, 0)}%.</p>
          {/if}
        </section>

        <section class="ty-sec">
          <h3 class="wb-label">Sources</h3>
          <ol class="ty-sources">
            {#each p.sources as s, i (i)}<li><a href={s.url} target="_blank" rel="noopener">{s.title}</a></li>{/each}
          </ol>
        </section>
      </div>
    </article>
  {/if}
</dialog>
