<script lang="ts">
  // The typology library (docs/typologies.md). Cards drawn from each precedent's seed; filters
  // by programme, climate, mechanism and kind; a precedent opens in a panel with its figures,
  // sources and the numbers its drawing was made from. The open precedent is in the URL hash,
  // so a link opens it.
  import { onMount } from "svelte";
  import { LIBRARY } from "../../engine/typology/library";
  import { CLIMATES, MECHANISMS, PROGRAMMES, REGIONS, type Climate, type Mechanism, type Precedent, type Programme, type Region } from "../../engine/typology/types";
  import type { Feature } from "../../engine/typology/grammar";
  import { drawTypology, fmt } from "../diagrams/typology";
  import { CLIMATE, climateSites, differences, distance, matchLabel, profile } from "../../engine/typology/climate";
  import ClimateChart from "./ClimateChart.svelte";
  import NatureGenes from "./NatureGenes.svelte";
  import { GENES } from "../../engine/typology/nature";

  const drawings = new Map(LIBRARY.map((p) => [p.id, drawTypology(p.seed, p.name)]));

  let q = $state("");
  let programme = $state<Programme | "">("");
  let climate = $state<Climate | "">("");
  let mechanism = $state<Mechanism | "">("");
  let kind = $state<"all" | "vernacular" | "modern">("all");
  let region = $state<Region | "">("");
  // Climate match: the precedents ordered by how close their measured climate is to a site's
  // (engine/typology/climate.ts). Bengaluru by default; "" turns it off.
  const SITES = climateSites();
  let compare = $state(SITES.some(([id]) => id === "bengaluru-cascade") ? "bengaluru-cascade" : "");
  let sort = $state<"climate" | "region" | "name">("climate");
  const siteNormals = $derived(compare ? CLIMATE.places[`site:${compare}`] : undefined);
  // the site's short name for sentences ("Bengaluru: Haralur to Saul Kere tank cascade" → "Bengaluru")
  const siteName = $derived((SITES.find(([id]) => id === compare)?.[1] ?? "").split(":")[0].trim());
  const siteProfile = $derived(siteNormals ? profile(siteNormals) : undefined);
  const match = $derived.by(() => {
    const m = new Map<string, { d: number; label: string; diffs: string[] }>();
    if (!siteProfile) return m;
    for (const p of LIBRARY) {
      const n = CLIMATE.places[p.id];
      if (!n) continue;
      const pr = profile(n), d = distance(pr, siteProfile);
      m.set(p.id, { d, label: matchLabel(d), diffs: differences(pr, siteProfile) });
    }
    return m;
  });
  // Two views: the precedents, and nature's rules (genes; NatureGenes.svelte). A #gene- link
  // opens the second.
  let view = $state<"precedents" | "nature">(typeof location !== "undefined" && location.hash.startsWith("#gene-") ? "nature" : "precedents");
  let open = $state<Precedent | null>(null);
  let dialog: HTMLDialogElement;

  const matches = (p: Precedent) =>
    (!programme || p.programmes.includes(programme))
    && (!climate || p.climate === climate)
    && (!mechanism || p.mechanisms.includes(mechanism))
    && (kind === "all" || (kind === "modern") === !!p.modern)
    && (!region || p.region === region)
    && (!q || `${p.name} ${p.local ?? ""} ${p.place} ${p.summary} ${p.materials.join(" ")}`.toLowerCase().includes(q.toLowerCase()));
  const shown = $derived.by(() => {
    const list = LIBRARY.filter(matches);
    if (sort === "name") return [...list].sort((a, b) => a.name.localeCompare(b.name));
    if (sort === "climate" && match.size) return [...list].sort((a, b) => (match.get(a.id)?.d ?? 99) - (match.get(b.id)?.d ?? 99));
    return list;
  });
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
    const fromHash = () => {
      if (location.hash.startsWith("#gene-")) { view = "nature"; return; }
      const p = LIBRARY.find((x) => x.id === location.hash.slice(1)); if (p) { view = "precedents"; show(p); }
    };
    fromHash();
    addEventListener("hashchange", fromHash);
    return () => removeEventListener("hashchange", fromHash);
  });

  const seedRows = (p: Precedent) => Object.entries(p.seed)
    .filter(([k]) => k !== "arrangement")
    .map(([k, v]) => [SEED_WORDS[k] ?? k, Array.isArray(v) ? v.map(featureWords).join("; ") : typeof v === "object" ? `${v.width} × ${v.depth} m, ${v.storeys} storeys` : String(v)]);
  const featureWords = (f: Feature) =>
    f.kind === "windcatcher" ? `windcatcher ${f.height} m` : f.kind === "stack" ? `stacks ${f.height} m` : f.kind === "dome" ? "dome"
    : f.kind === "vault" ? "vault over the street" : f.kind === "arcade" ? `arcade ${f.depth} m deep` : `roof rising ${f.rise} m`;
  const SEED_WORDS: Record<string, string> = {
    footprint: "Unit shape", width: "Unit width (m)", depth: "Unit depth (m)", storeys: "Storeys", floorH: "Floor to floor (m)",
    count: "Units or rooms", rows: "Rows, rings or sides", court: "Court (m)", diameter: "Diameter (m)", street: "Street or lane (m)",
    gap: "Gap between units (m)", well: "Chowk or air well (share of plan)", raised: "Floor raised (m)", sunken: "Sunk below ground (m)",
    steps: "Steps or terraces", tower: "Tower", trees: "Trees", features: "Features", eave: "Eave or gallery (m)", roof: "Roof", porosity: "Façade open (share)", wall: "Wall thickness (m)", water: "Water held (m deep)",
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
    <div class="wb-seg ty-views" role="group" aria-label="Library view">
      <button aria-pressed={view === "precedents"} onclick={() => (view = "precedents")}>What people built <span class="wb-mono">{LIBRARY.length}</span></button>
      <button aria-pressed={view === "nature"} onclick={() => (view = "nature")}>Nature's rules <span class="wb-mono">{GENES.length}</span></button>
    </div>
    <!-- COPY: titles and leads are drafts for the user to rewrite. -->
    {#if view === "nature"}
    <h1>What nature does that a building can borrow</h1>
    <p class="ty-lead">
      Rivers, forests, leaves and animals solve the problems a city has: shedding heat, holding rain, moving air, carrying load,
      and making a place people want to stay. Each rule here is kept as a ratio, an angle or a share, because a termite mound
      does not work at a building's size but its proportions can. Each has the range found in nature and the range the design
      search may use, and says where the popular story goes beyond the evidence.
    </p>
    <p class="ty-stats wb-mono">{GENES.length} rules · {GENES.filter((g) => g.scale === "building").length} for one building, {GENES.filter((g) => g.scale === "site").length} for a whole site · {GENES.reduce((a, g) => a + g.figures.length, 0)} figures, every one says where it came from</p>
    {:else}
    <h1>What people built for their climate</h1>
    <p class="ty-lead">
      Houses, water systems, farms, markets and public spaces that people shaped over centuries for a climate, a material or a need,
      and a few modern buildings that did the same with new means. Each one is written down as numbers, and every
      drawing here is made from those numbers. The design search will start from these forms and adapt them to a site.
    </p>
    <p class="ty-stats wb-mono">{LIBRARY.length} precedents from {new Set(LIBRARY.map((p) => p.region)).size} regions and {new Set(LIBRARY.map((p) => p.climate)).size} climates · {figures} figures, {sourced} from reliable sources · every figure says where it came from</p>
    {#if shown.length !== LIBRARY.length}<p class="ty-stats wb-mono">Showing {shown.length}</p>{/if}
    {/if}
  </section>

  {#if view === "nature"}
    <NatureGenes />
  {:else}

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
      <label class="ty-field"><span class="wb-label">Region</span>
        <select class="wb-select" bind:value={region}>
          <option value="">Anywhere</option>
          {#each REGIONS as r (r)}{@const n = LIBRARY.filter((p) => p.region === r).length}{#if n}<option value={r}>{r} ({n})</option>{/if}{/each}
        </select>
      </label>
      <label class="ty-field"><span class="wb-label">Compare climate with</span>
        <select class="wb-select" bind:value={compare}>
          <option value="">No site</option>
          {#each SITES as [id, name] (id)}<option value={id}>{name}</option>{/each}
        </select>
      </label>
      <label class="ty-field"><span class="wb-label">Order</span>
        <select class="wb-select" bind:value={sort}>
          {#if compare}<option value="climate">Closest climate first</option>{/if}
          <option value="region">By region</option>
          <option value="name">A to Z</option>
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
            {#if match.get(p.id)}
              {@const mt = match.get(p.id)!}
              <span class="ty-match" data-d={mt.d < 0.5 ? "a" : mt.d < 1 ? "b" : mt.d < 1.8 ? "c" : "d"}>
                <strong>{mt.label}</strong>&nbsp;· {#if mt.diffs.length}{mt.diffs[0]}{:else}much like {siteName}{/if}
              </span>
            {/if}
          </button>
        </li>
      {/each}
    </ul>
  {:else}
    <p class="ty-empty">Nothing matches. <button class="wb-btn is-quiet" onclick={() => { q = ""; programme = ""; climate = ""; mechanism = ""; kind = "all"; region = ""; }}>Clear the filters</button></p>
  {/if}
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
          <p class="ty-lesson"><span class="wb-label">For a future city</span>{p.lesson}</p>
          <dl class="ty-facts">
            <div><dt class="wb-label">Climate</dt><dd>{CLIMATES[p.climate].label} <span class="wb-mono ty-muted">{CLIMATES[p.climate].koppen}</span></dd></div>
            <div><dt class="wb-label">Materials</dt><dd>{p.materials.join(", ")}</dd></div>
            <div><dt class="wb-label">How it works</dt><dd>{p.mechanisms.map((m) => MECHANISMS[m]).join(" · ")}</dd></div>
          </dl>
        </div>

        {#if siteNormals && CLIMATE.places[p.id]}
          {@const mt = match.get(p.id)}
          <section class="ty-sec">
            <h3 class="wb-label">Its climate against {siteName}</h3>
            <p class="ty-climate-lead"><strong>{mt?.label}.</strong> {#if mt?.diffs.length}Compared with {siteName}: {mt.diffs.join("; ")}.{:else}Much like {siteName} on every count.{/if}</p>
            <ClimateChart site={siteNormals} place={CLIMATE.places[p.id]} {siteName} placeName={p.name} />
            <p class="ty-muted ty-small">Monthly normals {CLIMATE.years[0]}-{CLIMATE.years[1]} from NASA POWER (MERRA-2 reanalysis, cells about 50 km across, so a region's climate, not a street's). Daily highs and lows are the monthly mean plus or minus half the mean daily range.</p>
          </section>
        {/if}

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
