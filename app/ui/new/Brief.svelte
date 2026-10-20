<script lang="ts">
  // Context and brief: describe the site, add documents, and let the compiler propose a
  // brief from them and the corpus, every value cited or marked assumed. Edit it, then
  // evolve designs under it.
  import type { Snippet } from "../../brief/chunk";
  import { readDocument, type ReadDocument } from "../../brief/read";
  import { summarise } from "../../brief/summary";
  import * as E from "../../engine";
  import * as Sites from "../sites";
  import * as B from "./brief";

  let { id, site, rules, original, initial, onback }: {
    id: string; site: E.SiteExport; rules: E.RuleSet; original: E.RuleSet;
    initial: Sites.LinkedBrief | null; onback: () => void;
  } = $props();

  let description = $state("");
  let docs = $state<ReadDocument[]>([]);
  let reading = $state(false);
  let docError = $state("");
  let quality = $state<"standard" | "careful">("standard");
  let busy = $state(false);
  let error = $state("");
  // svelte-ignore state_referenced_locally
  let brief = $state.raw<E.Brief | null>(initial ? Sites.recheck(initial.brief, rules).brief : null);
  // svelte-ignore state_referenced_locally
  let seeds = $state(initial?.seeds ?? false);
  let snippets = $state.raw<Snippet[]>([]);
  let warnings = $state<string[]>([]);
  let model = $state("");
  let sent = $state("");
  let open = $state<Snippet | null>(null);
  let copied = $state(false);
  let controller: AbortController | null = null;

  const byId = $derived(new Map(snippets.map((s) => [s.id, s])));
  const changeable = $derived(rules.list.filter((r) => r.kind === "constrained"));
  const under = $derived(brief ? Sites.withBrief(site, rules, brief) : null);
  const linked = $derived(brief ? { brief, seeds: seeds && !!brief.typology_priors } : null);
  const patternCards = $derived([...new Set([...snippets.filter((s) => s.kind === "pattern").map((s) => Number(s.id.slice(8, 11))),
    ...(brief?.patterns.map((p) => p.id) ?? [])])].sort((a, b) => a - b));

  $effect(() => {
    history.replaceState(null, "", `${Sites.query(id, rules, original, linked)}#brief`);
  });

  // A brief opened from a link carries only snippet ids. Corpus snippets can be looked up
  // again (a small chunk, loaded only then); passages from uploads can't, and keep their id.
  $effect(() => {
    if (!brief || snippets.length) return;
    import("../../api/_corpus.js").then(({ CORPUS }) => { if (!snippets.length) snippets = CORPUS; });
  });

  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    docError = "";
    reading = true;
    for (const f of files) {
      try {
        const d = await readDocument(f);
        docs = [...docs.filter((x) => x.name !== d.name), d];
      } catch (e) {
        docError = (e as Error).message;
      }
    }
    reading = false;
  }

  async function propose() {
    error = "";
    busy = true;
    controller = new AbortController();
    try {
      const res = Sites.withRules(site, rules).result;
      const up = B.uploadsToSend(docs, description);
      sent = up.of ? `${up.snippets.length} of ${up.of} passages from your documents` : "";
      const out = await B.askCompiler(summarise(site, rules, res), description, up.snippets, quality, controller.signal);
      brief = out.brief;
      snippets = out.snippets;
      warnings = out.warnings;
      model = out.model;
      seeds = !!out.brief.typology_priors;
    } catch (e) {
      if ((e as Error).name !== "AbortError") error = (e as Error).message;
    } finally {
      busy = false;
      controller = null;
    }
  }

  function writeMyself() {
    brief = B.emptyBrief(rules);
    snippets = [];
    warnings = [];
    model = "";
  }

  function download() {
    if (!brief) return;
    const blob = new Blob([JSON.stringify(B.briefFile(id, brief, snippets), null, 1)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${site.meta.name.replace(/[^A-Za-z0-9]+/g, "-").toLowerCase()}-brief.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function copyLink() {
    await navigator.clipboard.writeText(location.href);
    copied = true;
    setTimeout(() => (copied = false), 1500);
  }

  /** "Mumbai DCPR 2034: Height by road width"; a heading that already names the document stands alone. */
  const citeLabel = (s: Snippet) => {
    const doc = s.title.split(":")[0];
    return s.heading.startsWith(doc) ? s.heading : `${doc}: ${s.heading}`;
  };
  const pctOf = (v: number | undefined) => (v === undefined ? "" : String(Math.round(v * 100)));
  const label = (s: string) => s.replace(/_/g, " ");
  const set = (next: E.Brief) => { brief = next; };
  const NUMBERS: { key: "fsi" | "floor_area_ha" | "height_limit_levels" | "ground_coverage_max" | "design_storm_mm";
    label: string; unit: string; step: number; scale: number }[] = [
    { key: "fsi", label: "FSI over the design ground", unit: "", step: 0.1, scale: 1 },
    { key: "floor_area_ha", label: "Floor area target", unit: "ha", step: 1, scale: 1 },
    { key: "height_limit_levels", label: "Height cap", unit: "storeys", step: 1, scale: 1 },
    { key: "ground_coverage_max", label: "Most of a plot a building covers", unit: "%", step: 5, scale: 100 },
    { key: "design_storm_mm", label: "Design storm", unit: "mm", step: 10, scale: 1 },
  ];
</script>

{#snippet evidence(c: { sources: string[]; note: string } | null)}
  {#if c}
    <span class="pcn-evidence">
      {#if c.sources.length}
        {#each c.sources as sid}
          {@const s = byId.get(sid)}
          <button type="button" class="pcn-cite" onclick={() => (open = s ?? null)} title={s ? `${s.title}: ${s.heading}` : sid}>
            {s ? citeLabel(s) : sid}</button>
        {/each}
      {:else}<span class="pcn-assumed">assumed</span>{/if}
      {#if c.note}<span class="pc-muted">{c.note}</span>{/if}
    </span>
  {/if}
{/snippet}

<section class="pcn-brief">
  <div class="pcn-cake-head">
    <h1>{site.meta.name}: the brief</h1>
    <p class="pc-muted">What to build, how high, what matters. The compiler reads your description, your documents and the
      corpus (Mumbai and Ahmedabad regulations, the CEPT studios, building types, Alexander's patterns) and cites what each
      value rests on. You confirm it. · <button type="button" class="pcn-link" onclick={onback}>back to the layers and rules</button></p>
  </div>

  <div class="pcn-brief-body">
    <form class="pcn-context" onsubmit={(e) => { e.preventDefault(); propose(); }}>
      <h2>Context</h2>
      <label for="pcn-desc">Describe the site and what you want from it</label>
      <textarea id="pcn-desc" rows="7" maxlength="4000" bind:value={description}
        placeholder="Who lives here, what the city plans for it, what should stay, what you're worried about."></textarea>
      <label class="pcn-file">Add documents (PDF with text, or plain text): bylaws, a client brief, a report
        <input type="file" multiple accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown"
          onchange={(e) => { addFiles(e.currentTarget.files); e.currentTarget.value = ""; }} /></label>
      {#if reading}<p class="pc-muted">reading ...</p>{/if}
      {#if docError}<p class="pc-error" role="alert">{docError}</p>{/if}
      {#if docs.length}
        <ul class="pcn-docs">
          {#each docs as d}
            <li>{d.name} <span class="pc-muted">{d.pages.length} page{d.pages.length > 1 ? "s" : ""}</span>
              <button type="button" class="pcn-link" onclick={() => (docs = docs.filter((x) => x !== d))}>remove</button></li>
          {/each}
        </ul>
        <p class="pc-muted">Documents are read in your browser. Only the passages chosen for the brief are sent, and nothing is
          stored.</p>
      {/if}
      <label>Model
        <select bind:value={quality}>
          <option value="standard">Claude Sonnet 5.5 (about half a minute)</option>
          <option value="careful">Claude Opus 5.5 (slower, more careful)</option>
        </select></label>
      <div class="pcn-actions">
        <button type="submit" disabled={busy || reading}>{brief && model ? "Propose again" : "Propose a brief"}</button>
        <button type="button" onclick={writeMyself} disabled={busy}>Write it myself</button>
        {#if busy}<button type="button" onclick={() => controller?.abort()}>Cancel</button>{/if}
      </div>
      {#if busy}<p class="pc-muted" aria-live="polite">Reading the regulations and writing the brief{sent ? ` (with ${sent})` : ""}.
        This takes 20 to 90 seconds.</p>{/if}
      {#if error}<p class="pc-error" role="alert">{error}</p>{/if}
    </form>

    {#if brief}
      <div class="pcn-proposal">
        <h2>The brief</h2>
        {#if model}<p class="pc-muted">Proposed by {model}. Values with a source are cited; click one to read it. Change
          anything: a value you change loses its citation.</p>{/if}
        <label class="pcn-summary">In short
          <textarea rows="3" maxlength="800" value={brief.summary} onchange={(e) => set({ ...brief!, summary: e.currentTarget.value })}></textarea></label>

        <h3>Targets and limits</h3>
        <div class="pcn-fields">
          {#each NUMBERS as f}
            {@const c = brief[f.key]}
            <div class="pcn-field">
              <label>{f.label}
                <span><input type="number" step={f.step} value={c ? Math.round(c.value * f.scale * 100) / 100 : ""} placeholder="not set"
                  onchange={(e) => set(B.setCited(brief!, f.key, B.numberOf(e.currentTarget.value, f.scale)))} /> {f.unit}</span></label>
              {@render evidence(c)}
              <span class="pcn-applies">{E.APPLIES[f.key]}</span>
            </div>
          {/each}
          {#if !brief.height_limit_levels && E.heightLimit(brief) !== null}
            <p class="pc-muted">Pattern 21 caps heights at {E.heightLimit(brief)} storeys.</p>
          {/if}
        </div>

        <h3>How genes are read</h3>
        <div class="pcn-fields">
          {#each E.RANGE_KEYS as k}
            {@const r = brief.gene_ranges?.value[k]}
            {@const step = k === "street_spacing" ? 5 : 0.05}
            {@const street = k.startsWith("street_")}
            {@const locked = !!r && r[0] === r[1]}
            <div class="pcn-field">
              <label>{label(k)} <span>
                <input type="number" {step} value={r ? r[0] : ""} placeholder={String(E.DEFAULT_RANGES[k][0])}
                  onchange={(e) => { const v = B.numberOf(e.currentTarget.value); set(B.setRange(brief!, k, v, locked ? v : r ? r[1] : null)); }} />
                {#if !locked} to
                <input type="number" {step} value={r ? r[1] : ""} placeholder={String(E.DEFAULT_RANGES[k][1])}
                  onchange={(e) => set(B.setRange(brief!, k, r ? r[0] : null, B.numberOf(e.currentTarget.value)))} />{/if}</span></label>
              {#if street}
                <label class="pcn-check"><input type="checkbox" checked={locked}
                  onchange={(e) => {
                    const [lo, hi] = E.DEFAULT_RANGES[k], v = r ? r[0] : (lo + hi) / 2;
                    set(e.currentTarget.checked ? B.setRange(brief!, k, v, v) : B.setRange(brief!, k, null, null));
                  }} /> lock (leave free to let evolution choose)</label>
              {/if}
            </div>
          {/each}
          {@render evidence(brief.gene_ranges)}
        </div>

        <h3>Rules</h3>
        <div class="pcn-fields">
          {#each brief.rule_changes as ch}
            <div class="pcn-field">
              <span><b>{ch.rule}</b></span>
              <span class="pcn-inline">
                <label class="pcn-check"><input type="checkbox" checked={ch.enabled !== false}
                  onchange={(e) => set(B.setRuleChange(brief!, ch.rule, { enabled: e.currentTarget.checked ? undefined : false }))} /> on</label>
                <label>cap <input type="number" min="1" max="60" value={ch.max_levels ?? ""} placeholder="as is"
                  onchange={(e) => set(B.setRuleChange(brief!, ch.rule, { max_levels: B.numberOf(e.currentTarget.value) ?? undefined }))} /></label>
                <label>unsealed <input type="number" min="0" max="100" step="5" value={pctOf(ch.min_permeable)} placeholder="as is"
                  onchange={(e) => set(B.setRuleChange(brief!, ch.rule, { min_permeable: B.numberOf(e.currentTarget.value, 100) ?? undefined }))} />%</label>
                <button type="button" class="pcn-link" onclick={() => set(B.setRuleChange(brief!, ch.rule, null))}>undo</button>
              </span>
              {@render evidence(ch)}
            </div>
          {/each}
          <label>Change a rule
            <select onchange={(e) => { if (e.currentTarget.value) set(B.setRuleChange(brief!, e.currentTarget.value, { enabled: true })); e.currentTarget.value = ""; }}>
              <option value="">choose ...</option>
              {#each changeable.filter((r) => !brief!.rule_changes.some((c) => c.rule === r.name)) as r}<option>{r.name}</option>{/each}
            </select></label>
          <p class="pc-muted">Forbidden and retained rules can't be changed by a brief.</p>
        </div>

        <h3>Priorities</h3>
        <div class="pcn-fields">
          <div class="pcn-field"><span>Which scores matter (orders the families shown first)</span>
            <span class="pcn-inline">{#each E.SCORE_KEYS as k}
              <label>{E.SCORES[k][0]} <input type="number" min="0" max="100" step="10" value={pctOf(brief.objective_weights?.value[k])}
                placeholder="-" onchange={(e) => set(B.setWeight(brief!, "objective_weights", k, B.numberOf(e.currentTarget.value, 100)))} />%</label>
            {/each}</span>
            {@render evidence(brief.objective_weights)}</div>
          <div class="pcn-field"><span>Building types</span>
            <span class="pcn-inline">{#each E.TYPOLOGIES as t}
              {@const w = brief.typology_priors?.value.find((x) => x.type === t)?.weight}
              <label>{label(t)} <input type="number" min="0" max="100" step="10" value={pctOf(w)} placeholder="-"
                onchange={(e) => set(B.setRanked(brief!, "typology_priors", "type", t, B.numberOf(e.currentTarget.value, 100)))} />%</label>
            {/each}</span>
            {@render evidence(brief.typology_priors)}
            <span class="pcn-applies">{E.APPLIES.typology_priors}</span></div>
          {#if brief.typology_priors}
            <label class="pcn-check"><input type="checkbox" bind:checked={seeds} /> Start half of the first generation from these
              building types (typology seeds: a site-scale reading of each type, labelled in the run)</label>
          {/if}
          <div class="pcn-field"><span>Programme mix (share of floor area)</span>
            <span class="pcn-inline">{#each E.PROGRAMMES as k}
              <label>{label(k)} <input type="number" min="0" max="100" step="5" value={pctOf(brief.programme_mix?.value[k])} placeholder="-"
                onchange={(e) => set(B.setWeight(brief!, "programme_mix", k, B.numberOf(e.currentTarget.value, 100)))} />%</label>
            {/each}</span>
            {@render evidence(brief.programme_mix)}
            <span class="pcn-applies">{E.APPLIES.programme_mix}</span></div>
          <div class="pcn-field"><span>Form qualities to watch</span>
            <span class="pcn-inline">{#each E.AESTHETICS as k}
              {@const w = brief.aesthetic_priorities?.value.find((x) => x.metric === k)?.weight}
              <label class="pcn-check"><input type="checkbox" checked={w !== undefined}
                onchange={(e) => set(B.setRanked(brief!, "aesthetic_priorities", "metric", k, e.currentTarget.checked ? 1 : null))} /> {label(k)}</label>
            {/each}</span>
            {@render evidence(brief.aesthetic_priorities)}
            <span class="pcn-applies">{E.APPLIES.aesthetic_priorities}</span></div>
          <div class="pcn-field"><span>Setbacks (m)</span>
            <span class="pcn-inline">{#each ["front", "side", "rear"] as const as k}
              <label>{k} <input type="number" min="0" max="30" step="0.5" value={brief.setbacks_m?.value[k] ?? ""} placeholder="-"
                onchange={(e) => {
                  const v = B.numberOf(e.currentTarget.value);
                  const cur = brief!.setbacks_m?.value ?? { front: 0, side: 0, rear: 0 };
                  set(B.setCited(brief!, "setbacks_m", v === null && !brief!.setbacks_m ? null : { ...cur, [k]: v ?? 0 }));
                }} /></label>
            {/each}</span>
            {@render evidence(brief.setbacks_m)}
            <span class="pcn-applies">{E.APPLIES.setbacks_m}</span></div>
          <label>Materials and textures (comma-separated)
            <input type="text" value={brief.tags.join(", ")} onchange={(e) => set(B.setTags(brief!, e.currentTarget.value))} /></label>
        </div>

        {#if patternCards.length}
          <h3>Patterns (A Pattern Language)</h3>
          <div class="pcn-fields">
            {#each patternCards as n}
              {@const p = brief.patterns.find((x) => x.id === n)}
              {@const card = snippets.find((s) => s.id === `pattern-${String(n).padStart(3, "0")}#1`)}
              <div class="pcn-field">
                <label class="pcn-check"><input type="checkbox" checked={!!p} onchange={(e) => set(B.togglePattern(brief!, n, e.currentTarget.checked))} />
                  {card ? card.heading : `Pattern ${n}`}</label>
                {#if card}<button type="button" class="pcn-cite" onclick={() => (open = card)}>read the card</button>{/if}
                {#if p}{@render evidence(p)}{/if}
              </div>
            {/each}
            <p class="pc-muted">Pattern numbers and dimensions are paraphrased and not yet checked against the book.</p>
          </div>
        {/if}

        {#if warnings.length}
          <details class="pcn-warnings"><summary>{warnings.length} thing{warnings.length > 1 ? "s" : ""} the checker left out</summary>
            <ul>{#each warnings as w}<li>{w}</li>{/each}</ul></details>
        {/if}

        {#if under}
          <p class="pcn-under">Under this brief: {Math.round(under.site.meta.target_ha).toLocaleString("en-IN")} ha of floor area
            (±10%) on {under.site.meta.design_ha} ha of design ground · design storm {under.config.design_storm_mm} mm ·
            heights up to {under.config.rules.defaults.max_levels} storeys on open ground.</p>
        {/if}
        <div class="pcn-actions">
          <a class="pcn-go" href={Sites.evolveLink(id, rules, original, linked)}>Evolve designs with this brief</a>
          <button type="button" onclick={download}>Download the brief (JSON)</button>
          <button type="button" onclick={copyLink}>{copied ? "Link copied" : "Copy a link"}</button>
        </div>
        <p class="pc-muted">The download keeps the brief with the passages it cites. To save it with a site in the Python
          tools: <code>uv run pc brief &lt;site&gt; &lt;file&gt;</code>.</p>
      </div>
    {/if}
  </div>

  {#if open}
    <aside class="pcn-snippet" aria-label="Source">
      <button type="button" class="pcn-link pcn-close" onclick={() => (open = null)}>close</button>
      <h3>{open.title}</h3>
      <p><b>{open.heading}</b>{#if open.ref} · <span class="pc-muted">{open.ref}</span>{/if}</p>
      <p class="pcn-snippet-text">{open.text}</p>
      <p class="pc-muted">{open.source}</p>
    </aside>
  {/if}
</section>
