<script lang="ts">
  // The inspector. Before a run there is no design to inspect, so it shows the step's intro
  // (a diagram and one sentence, folded to a line once read) and what the step is looking at.
  import * as E from "../../engine";
  import * as Iso from "../diagrams/iso";
  import * as X from "../explore";
  import * as M from "../../engine/massing";
  import * as Mass from "../mass/massing";
  import { bench, HILLY } from "./bench.svelte";
  import Thumb from "./Thumb.svelte";

  // COPY: step intros
  const INTRO: Record<string, { title: string; text: string; svg: () => string }> = {
    site: { title: "Site: the ground to design", text: "Pick a ready-made site or outline your own. Everything outside it stays as the city around it.", svg: () => Iso.site().svg },
    layers: { title: "Layers: what the land is like", text: "Each map of the site is a layer: ground, water, green, the city. Read together, they show what the land is like in every spot.", svg: () => Iso.layers().svg },
    rules: { title: "Rules: what the land allows", text: "Rules sort the ground: some is never built on, some is built with limits, and the rest is free for designs to use. Change a number and the map follows.", svg: () => Iso.rules().svg },
    brief: { title: "Brief: what to build", text: "The brief says how much to build and how high, and what matters most. Every figure says where it comes from, or that it is assumed.", svg: () => Iso.brief().svg },
    evolve: { title: "Evolve: breed designs", text: "Designs breed. The better ones become parents, so each generation tends to do a little better. You choose among what it finds.", svg: () => Iso.evolution().svg },
    massing: { title: "Massing: buildings in a block", text: "Pick a block of the design. Its plots, setbacks and height limits make an envelope, and buildings breed inside it, scored on sun, shade and sky.", svg: () => Iso.massing().svg },
    explore: { title: "Explore: weigh the trade-offs", text: "No design is best at everything: more water storage can mean more heat. These are the designs nothing else beats on every count; pick the balance you want.", svg: () => Iso.tradeoff().svg },
    landform: { title: "Landform: valleys and ridges", text: "Water gathers in the valleys, so they stay open; the ridges between them are where the main streets go.", svg: () => Iso.landform().svg },
  };
  const intro = $derived(INTRO[bench.step]);
  const svg = $derived(intro ? intro.svg() : "");
  const folded = $derived(!!bench.introSeen[bench.step]);

  const card = $derived(bench.picked ? bench.index[bench.picked] : null);

  // the design shown large on the Evolve step, and where each score sits in the run
  const chosen = $derived.by(() => {
    if (bench.result) { const f = bench.result.families.filter((x) => x.design)[bench.picked3]; return f ? { name: f.name, d: f.design! } : null; }
    const d = bench.leaders[bench.picked3];
    return d ? { name: `Best now ${bench.picked3 + 1}`, d } : null;
  });
  const span = $derived.by(() => {
    const all = bench.result ? bench.result.kept.map((k) => k.scores) : bench.leaders.map((d) => d.scores!).filter(Boolean);
    return Object.fromEntries(E.SCORE_KEYS.map((k) => [k, [Math.min(...all.map((s) => s[k])), Math.max(...all.map((s) => s[k]))]]));
  });
  /** A score's place between the run's worst (0) and best (100). */
  function at(k: E.ScoreKey, v: number) {
    const [lo, hi] = span[k] ?? [v, v], t = hi > lo ? (v - lo) / (hi - lo) : 1;
    return Math.round((E.SCORES[k][2] ? t : 1 - t) * 100);
  }
  // the design selected on the Explore step, among everything the run kept
  const ex = $derived(bench.step === "explore" && bench.result ? bench.result.kept.find((k) => k.name === bench.exSel) ?? null : null);
  const exSpan = $derived.by(() => {
    const all = bench.result?.kept ?? [];
    return Object.fromEntries(E.SCORE_KEYS.map((k) => [k, [Math.min(...all.map((d) => d.scores[k])), Math.max(...all.map((d) => d.scores[k]))]]));
  });
  function exAt(k: E.ScoreKey, v: number) {
    const [lo, hi] = exSpan[k] ?? [v, v], t = hi > lo ? (v - lo) / (hi - lo) : 1;
    return Math.round((E.SCORES[k][2] ? t : 1 - t) * 100);
  }
  // the massing shown on the Massing step, against the rest of its run
  const mass = bench.mass;
  const mEnv = $derived(bench.step === "massing" ? mass.prepared?.E ?? null : null);
  const mk = $derived(bench.step === "massing" ? mass.chosen : null);
  const mSpan = $derived.by(() => {
    const all = mass.result?.kept ?? [];
    return Object.fromEntries(M.MASS_SCORE_KEYS.map((k) => [k, [Math.min(...all.map((d) => d.scores[k])), Math.max(...all.map((d) => d.scores[k]))]]));
  });
  const mAt = (k: M.MassScoreKey, v: number) => {
    const [lo, hi] = mSpan[k] ?? [v, v], t = hi > lo ? (v - lo) / (hi - lo) : 1;
    return Math.round((M.MASS_SCORES[k][2] ? t : 1 - t) * 100);
  };
  const mRead = $derived.by(() => {
    if (!mk || !mEnv) return null;
    const ms = mass.massingOf(mk), mesh = mass.meshOf(mk);
    return ms && mesh ? M.readouts(mEnv, ms, mesh) : null;
  });
  const lowHeights = $derived(mEnv && mass.prepared ? Mass.heightsLow(mEnv, mass.prepared.G) : false);
  const meta = $derived(bench.site?.meta);
  const fmtHa = (v: number) => `${Math.round(v).toLocaleString("en-IN")} ha`;
  const TERRAIN: Record<string, string> = { fabdem: "FABDEM bare earth", "copernicus-surface": "Copernicus surface model (buildings and trees count as ground)" };
</script>

<div class="wb-insp-body">
  {#if intro}
    {#if !folded}
      <div class="wb-explain">
        <figure>{@html svg}</figure>
        <b>{intro.title}</b>
        <p>{intro.text}</p>
        <div class="wb-row"><button class="wb-btn is-quiet" type="button" onclick={() => bench.seen(bench.step)}>Got it</button></div>
      </div>
    {:else}
      <button class="wb-intro-line" type="button" onclick={() => bench.seen(bench.step, false)}>{intro.title}</button>
    {/if}
  {/if}

  {#if bench.step === "massing" && mEnv}
    {#if mk}
      <div class="wb-sub">
        <span class="wb-label">{mk.rank === 1 ? "On the front" : "Beaten on every count by another"}</span>
        <b class="wb-insp-title">Massing {mk.name}</b>
        <div class="wb-scores">
          {#each M.MASS_SCORE_KEYS as k}
            <div class="wb-score"><span>{M.MASS_SCORES[k][0]}{lowHeights && Mass.HEIGHT_SCORES.includes(k) ? " *" : ""}</span>
              <span class="wb-track" style="--at: {mAt(k, mk.scores[k])}%"><b></b><i></i></span>
              <span class="wb-v">{M.MASS_SCORES[k][1](mk.scores[k])}</span></div>
          {/each}
          <div class="wb-axis"><span>run's worst</span><span>best</span></div>
        </div>
        <!-- COPY: low-confidence heights -->
        {#if lowHeights}<p class="wb-hint">* Most neighbouring buildings' heights are guessed, so these are low confidence.</p>{/if}
        <dl class="wb-facts">
          <dt>Floor area</dt><dd class="wb-num">{Math.round(mk.floor).toLocaleString("en-IN")} m², {Math.round((mk.floor / Math.max(1, mEnv.target)) * 100)}% of what the block should fit</dd>
          <dt>Envelope</dt><dd>{mk.rejected ?? M.describeRepairs(mk.repairs, mEnv.plots.length)}</dd>
        </dl>
      </div>
      {#if mRead}
        <details class="wb-group"><summary>Readouts, not bred on<span class="wb-meta">{Object.keys(M.READOUTS).length}</span></summary>
          <dl class="wb-facts wb-metrics">
            {#each Object.keys(M.READOUTS) as r}
              {@const key = r as keyof M.MassReadouts}
              <dt>{M.READOUTS[key][0]}</dt><dd class="wb-num">{M.READOUTS[key][1](mRead[key])}</dd>
            {/each}
          </dl>
        </details>
      {/if}
    {:else}
      <div class="wb-sub">
        <span class="wb-label">Block {mass.block + 1}: its plots</span>
        <table class="wb-table wb-num">
          <thead><tr><th>plot</th><th>m²</th><th>storeys</th><th>cover</th><th>to fit</th></tr></thead>
          <tbody>
            {#each mEnv.plots as p}
              <tr><td>{p.id + 1}</td><td>{Math.round(p.area)}</td><td>{p.capLevels}</td><td>{Math.round(p.maxCover * 100)}%</td><td>{Math.round(p.target)}</td></tr>
            {/each}
          </tbody>
        </table>
        <!-- COPY: block notes -->
        <p class="wb-hint">Storeys and cover are the most the rules allow; "to fit" is the floor area the design put on the plot. {Mass.neighbourLine(mEnv, mass.prepared!.G)}</p>
        {#if mEnv.note.length}<p class="wb-hint">{mEnv.note.join("; ")}.</p>{/if}
      </div>
    {/if}
  {:else if bench.step === "explore"}
    {#if ex}
      {@const grown = bench.grown.get(ex.name)}
      <div class="wb-sub">
        <span class="wb-label">{X.onFront(ex) ? "On the front" : X.onBrief(ex) ? "Beaten on every count by another" : "Off the brief"}</span>
        <b class="wb-insp-title">{bench.titleOf(ex.name)}</b>
        <div class="wb-scores">
          {#each E.SCORE_KEYS as k}
            <div class="wb-score"><span>{E.SCORES[k][0]}</span>
              <span class="wb-track" style="--at: {exAt(k, ex.scores[k])}%"><b></b><i></i></span>
              <span class="wb-v">{E.SCORES[k][1](ex.scores[k])}</span></div>
          {/each}
          <div class="wb-axis"><span>run's worst</span><span>best</span></div>
        </div>
        <dl class="wb-facts">
          <dt>Floor area</dt><dd class="wb-num">{Math.round(ex.floorArea).toLocaleString("en-IN")} ha{grown?.grossFloorArea ? ` net, ${Math.round(grown.grossFloorArea / 1e4).toLocaleString("en-IN")} ha gross` : ""}</dd>
          <!-- COPY: brief fit -->
          <dt>Against the brief</dt><dd>{ex.scores.gap <= 0.1 ? "within it" : `${Math.round(ex.scores.gap * 100)}% off`}</dd>
          <dt>Average storeys</dt><dd class="wb-num">{ex.levels.toFixed(1)}</dd>
          {#if ex.parents.length}<dt>Bred from</dt><dd>{ex.parents.join(" × ")}</dd>{/if}
        </dl>
      </div>
      <div class="wb-sub">
        <span class="wb-label">Form</span>
        <div>
          {#each X.GROUPS as [g, ks]}
            {@const shown = ks.filter((k) => ex.metrics[k] !== undefined)}
            {#if shown.length}
              <details class="wb-group"><summary>{g}<span class="wb-meta">{shown.length}</span></summary>
                <dl class="wb-facts wb-metrics">
                  {#each shown as k}
                    {@const m = E.METRICS[k] as E.Metric}
                    <dt title={m.note}>{m.label}</dt><dd class="wb-num">{m.fmt(ex.metrics[k])}</dd>
                  {/each}
                </dl>
              </details>
            {/if}
          {/each}
        </div>
      </div>
      <div class="wb-row">
        <button class="wb-btn is-primary" type="button" disabled={!grown || bench.pen.some((p) => p.name === ex.name)}
          onclick={() => grown && bench.keep(ex.name, grown)}>{bench.pen.some((p) => p.name === ex.name) ? "In the pen" : "Keep in pen"}</button>
        <button class="wb-btn" type="button" onclick={() => { bench.pair = [ex.name, bench.pair[1] && bench.pair[1] !== ex.name ? bench.pair[1] : null]; bench.exView = "compare"; }}>Compare with…</button>
        {#if bench.stateOf("massing") !== "blocked"}<button class="wb-btn" type="button" onclick={() => bench.go("massing")}>Mass a block</button>{/if}
      </div>
    {:else}
      <div class="wb-state">
        <b>Nothing selected</b>
        <!-- COPY: inspector empty, explore step -->
        <span>Click a design in a plot, the list or the archive. Its scores, form and parents show here.</span>
      </div>
    {/if}
  {:else if bench.step === "evolve"}
    {#if chosen}
      <div class="wb-sub">
        <span class="wb-label">{bench.result ? "Design" : "Best so far"}</span>
        <b class="wb-insp-title">{chosen.name}</b>
        {#if chosen.d.scores}
          <div class="wb-scores">
            {#each E.SCORE_KEYS as k}
              <div class="wb-score"><span>{E.SCORES[k][0]}</span>
                <span class="wb-track" style="--at: {at(k, chosen.d.scores[k])}%"><b></b><i></i></span>
                <span class="wb-v">{E.SCORES[k][1](chosen.d.scores[k])}</span></div>
            {/each}
            <div class="wb-axis"><span>run's worst</span><span>best</span></div>
          </div>
          <div class="wb-fit">
            <span class="wb-label">Floor area against the brief</span>
            <!-- COPY: brief fit -->
            <div class="wb-row wb-between"><span class="wb-quiet">{chosen.d.scores.gap <= 0.1 ? "within the brief" : `${Math.round(chosen.d.scores.gap * 100)}% off the brief`}</span></div>
          </div>
        {/if}
        <button class="wb-btn is-primary" type="button" disabled={bench.pen.some((p) => p.name === chosen.name)}
          onclick={() => bench.keep(chosen.name, chosen.d)}>{bench.pen.some((p) => p.name === chosen.name) ? "In the pen" : "Keep in pen"}</button>
      </div>
    {:else}
      <div class="wb-state">
        <b>No design yet</b>
        <!-- COPY: inspector empty, evolve step -->
        <span>Run an evolution. The design shown large appears here with its scores against the rest of the run.</span>
      </div>
    {/if}
  {:else if bench.step === "rules" && bench.rules}
    {@const r = bench.ruleHover !== null ? bench.rules.list[bench.ruleHover] : null}
    {#if r}
      <div class="wb-sub">
        <span class="wb-label">Why this rule</span>
        <b class="wb-insp-title">{r.name}</b>
        <p class="wb-why">{r.why || "No reason recorded."}</p>
        {#if r.source}<span class="wb-tag" title="Where the rule comes from">{r.source}</span>{/if}
        {#if r.roles.length}<p class="wb-hint">What this ground does: {r.roles.map((x) => x.replace(/_/g, " ")).join(", ")}.</p>{/if}
      </div>
    {:else}
      <div class="wb-state">
        <b>Point at a rule</b>
        <!-- COPY: inspector empty, rules step -->
        <span>Its ground is outlined on the map, and why it is there appears here. Change any underlined number; Ctrl Z undoes it.</span>
      </div>
    {/if}
  {:else if bench.step === "landform" && meta}
    <div class="wb-sub">
      <span class="wb-label">How it was read</span>
      <!-- COPY: landform method note -->
      <p class="wb-why">Valleys are where water from {meta.landform?.valley_ha ?? 10} ha or more runs; mapped streams count even where the ground disagrees. Each valley keeps a buffer either side, wider for bigger streams.</p>
      {#if meta.landform}<p class="wb-hint">Buffers are provisional: {Object.entries(meta.landform.valley_buffer_m).map(([o, m]) => `${m} m for order ${o}`).join(", ")}, to be checked against drain margins in the local rules.</p>{/if}
    </div>
  {:else if bench.step === "site"}
    {#if card && bench.picked}
      <div class="wb-sub">
        <span class="wb-label">Ready-made site</span>
        <b class="wb-insp-title">{card.name}</b>
        {#if card.thumb}<div class="wb-insp-thumb"><Thumb rows={card.thumb} /></div>{/if}
        <dl class="wb-facts">
          <dt>Design ground</dt><dd class="wb-num">{fmtHa(card.design_ha)}{card.cells ? ` · ${card.cells.toLocaleString("en-IN")} cells` : ""}</dd>
          <dt>Floor area to fit</dt><dd class="wb-num">{fmtHa(card.target_ha)}</dd>
          <dt>How hilly</dt><dd>{card.relief ? HILLY[card.relief] : "unknown"}{card.relief_m != null ? `, ${Math.round(card.relief_m)} m of relief` : ""}
            {#if card.confidence === "low"}<span class="wb-tag is-low">low confidence</span>{/if}</dd>
          <dt>Ground from</dt><dd>{card.terrain ? TERRAIN[card.terrain] ?? card.terrain : "unknown"}</dd>
        </dl>
        <button class="wb-btn is-primary" type="button" aria-busy={bench.loading} onclick={() => bench.open(bench.picked!)}>Open this site</button>
        {#if bench.error}<p class="wb-error" role="alert">{bench.error}</p>{/if}
      </div>
    {:else}
      <div class="wb-state">
        <b>No site picked</b>
        <!-- COPY: inspector empty, site step -->
        <span>Pick a ready-made site on the left or on the map, or draw your own. Its size, how hilly it is and where its data comes from appear here.</span>
      </div>
    {/if}
  {:else if bench.step === "layers" && meta}
    <div class="wb-sub">
      <span class="wb-label">The site</span>
      <b class="wb-insp-title">{meta.name}</b>
      <dl class="wb-facts">
        <dt>Design ground</dt><dd class="wb-num">{fmtHa(meta.design_ha)}</dd>
        {#if meta.landform}<dt>How hilly</dt><dd>{HILLY[meta.landform.relief.class]}, {Math.round(meta.landform.relief.relief_m)} m of relief
          {#if meta.landform.relief.confidence === "low"}<span class="wb-tag is-low">low confidence</span>{/if}</dd>{/if}
        <dt>Design storm</dt><dd class="wb-num">{meta.design_storm_mm} mm in a day</dd>
      </dl>
    </div>
    <div class="wb-sub">
      <span class="wb-label">Where the layers come from</span>
      <ul class="wb-credits">{#each meta.credits ?? [] as c}<li>{c}</li>{/each}</ul>
    </div>
  {/if}
</div>
