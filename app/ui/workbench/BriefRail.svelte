<script lang="ts">
  // The Brief step's controls: describe the place and have a brief proposed (every figure cited
  // or marked assumed), or start from the site's own figures; edit it; choose Alexander's
  // patterns; confirm it, which locks it for the run.
  import { Lock, LockOpen, Sparkles } from "lucide";
  import { onMount } from "svelte";
  import type { Snippet } from "../../brief/chunk";
  import { summarise } from "../../brief/summary";
  import * as E from "../../engine";
  import * as B from "../new/brief";
  import * as Sites from "../sites";
  import { bench } from "./bench.svelte";
  import Icon from "./Icon.svelte";

  const site = $derived(bench.site!);
  const rules = $derived(bench.rules!);
  let description = $state("");
  let busy = $state(false);
  let error = $state("");
  let corpus = $state.raw<Snippet[]>([]);
  let controller: AbortController | null = null;

  onMount(() => { import("../../api/_corpus.js").then(({ CORPUS }) => (corpus = CORPUS)); });

  const patterns = $derived(corpus.filter((s) => s.kind === "pattern").map((s) => ({ id: Number(s.id.slice(8, 11)), s })));
  const sources = $derived(new Map([...corpus, ...bench.briefSources].map((s) => [s.id, s])));
  const b = $derived(bench.brief);
  const locked = $derived(bench.briefLocked);

  async function propose() {
    error = "";
    busy = true;
    controller = new AbortController();
    try {
      const res = Sites.withRules(site, rules).result;
      const out = await B.askCompiler(summarise(site, rules, res), description, [], "standard", controller.signal);
      bench.brief = out.brief;
      bench.briefSources = out.snippets;
    } catch (e) {
      if ((e as Error).name !== "AbortError") error = (e as Error).message;
    } finally {
      busy = false;
    }
  }

  /** A brief from the site's own figures, each saying so. */
  function fromSite() {
    const m = site.meta, note = "The site's own figure (site.yaml).";
    let x = B.emptyBrief(rules);
    x = { ...x, summary: description.trim() || `The site's own figures for ${m.name}.`,
      fsi: { value: m.target_far, sources: [], note },
      design_storm_mm: { value: m.design_storm_mm, sources: [], note },
      height_limit_levels: { value: rules.defaults.max_levels, sources: [], note: "The site's rules: the most levels anywhere." } };
    bench.brief = x;
  }

  type Field = "fsi" | "floor_area_ha" | "height_limit_levels" | "ground_coverage_max" | "design_storm_mm";
  // COPY: brief field labels
  const FIELDS: { key: Field; label: string; unit: string; scale: number; step: string }[] = [
    { key: "fsi", label: "Floor-area ratio", unit: "× the land", scale: 1, step: "0.1" },
    { key: "floor_area_ha", label: "Floor area to fit", unit: "ha (wins over the ratio)", scale: 1, step: "1" },
    { key: "height_limit_levels", label: "Height limit", unit: "levels", scale: 1, step: "1" },
    { key: "ground_coverage_max", label: "Ground covered, at most", unit: "%", scale: 100, step: "5" },
    { key: "design_storm_mm", label: "Design storm", unit: "mm in a day", scale: 1, step: "5" },
  ];
  function set(key: Field, raw: string, scale: number) {
    if (!b) return;
    const v = B.numberOf(raw, scale);
    bench.brief = B.setCited(b, key, v as never);
  }
  function tagOf(c: E.Cited<unknown> | null): { text: string; cls: string; title: string } {
    if (!c) return { text: "not set", cls: "is-assumed", title: "" };
    if (c.note === B.BY_HAND) return { text: "changed by hand", cls: "is-assumed", title: "" };
    if (c.sources.length) {
      const first = sources.get(c.sources[0]);
      return { text: c.sources.length === 1 ? "1 source" : `${c.sources.length} sources`, cls: "",
        title: c.sources.map((id) => sources.get(id)?.title ?? id).join("\n") + (c.note ? `\n${c.note}` : "") };
    }
    return { text: c.note.startsWith("The site") ? "from the site" : "assumed", cls: "is-assumed", title: c.note };
  }

  const SCORE_LABEL = Object.fromEntries(E.SCORE_KEYS.map((k) => [k, E.SCORES[k][0]]));
  function weight(k: E.ScoreKey, raw: string) {
    if (b) bench.brief = B.setWeight(b, "objective_weights", k, B.numberOf(raw));
  }
  function togglePattern(id: number) {
    if (!b) return;
    const on = b.patterns.some((p) => p.id === id);
    bench.brief = { ...b, patterns: on ? b.patterns.filter((p) => p.id !== id) : [...b.patterns, { id, sources: [`pattern-${String(id).padStart(3, "0")}#1`], note: B.BY_HAND }] };
  }
</script>

<div class="wb-panel">
  {#if !b}
    <div class="wb-field">
      <label for="wb-desc">What should this place become?</label>
      <!-- COPY: brief prompt placeholder -->
      <textarea id="wb-desc" class="wb-input wb-textarea" rows="5" bind:value={description}
        placeholder="Homes for about 20,000 people, a market street, room for the river in a monsoon…"></textarea>
      <span class="wb-hint">A brief is proposed from this, the site and the regulations: every figure cited or marked assumed.</span>
    </div>
    <div class="wb-row">
      <button class="wb-btn is-primary" type="button" aria-busy={busy} disabled={busy} onclick={propose}><Icon icon={Sparkles} />Propose a brief</button>
      {#if busy}<button class="wb-btn is-quiet" type="button" onclick={() => controller?.abort()}>Stop</button>{/if}
    </div>
    <button class="wb-btn is-quiet wb-start" type="button" onclick={fromSite}>Or start from the site's own figures</button>
    {#if error}<p class="wb-error" role="alert">{error}</p>{/if}
  {:else}
    <div class="wb-row wb-between">
      <span class="wb-label">{locked ? "Confirmed" : "The brief"}</span>
      {#if locked}<span class="wb-pill wb-locked"><Icon icon={Lock} size={12} />locked for the run</span>{/if}
    </div>
    {#if b.summary}<p class="wb-why">{b.summary}</p>{/if}

    <div class="wb-brief-fields">
      {#each FIELDS as f}
        {@const c = b[f.key] as E.Cited<number> | null}
        {@const tag = tagOf(c)}
        <div class="wb-brief-row">
          <label for="wb-b-{f.key}">{f.label}</label>
          <span class="wb-row">
            <input id="wb-b-{f.key}" class="wb-input wb-num-input" type="number" step={f.step} disabled={locked}
              value={c ? +(c.value * f.scale).toFixed(2) : ""} placeholder="not set" onchange={(e) => set(f.key, (e.target as HTMLInputElement).value, f.scale)} />
            <span class="wb-hint">{f.unit}</span>
          </span>
          <span class="wb-tag {tag.cls}" title={tag.title}>{tag.text}</span>
        </div>
      {/each}
    </div>

    <div class="wb-sub">
      <span class="wb-label">What matters most</span>
      {#each E.SCORE_KEYS as k}
        {@const w = b.objective_weights?.value[k] ?? 0.5}
        <div class="wb-field">
          <label for="wb-w-{k}">{SCORE_LABEL[k]} <output class="wb-num">{Math.round(w * 100)}</output></label>
          <input id="wb-w-{k}" class="wb-range" type="range" min="0" max="1" step="0.05" value={w} disabled={locked}
            oninput={(e) => weight(k, (e.target as HTMLInputElement).value)} />
        </div>
      {/each}
      <span class="wb-hint">Used to order the designs a run finds, not to choose them for you.</span>
    </div>

    <div class="wb-sub">
      <span class="wb-label">Patterns</span>
      <div class="wb-chips">
        {#each patterns as { id, s } (id)}
          <button class="wb-chip" type="button" aria-pressed={b.patterns.some((p) => p.id === id)} disabled={locked}
            title={`${s.title}\n\n${s.text.slice(0, 260)}…`} onclick={() => togglePattern(id)}>
            <span class="wb-mono">{id}</span>{s.title.replace(/^Pattern \d+: /, "")}</button>
        {/each}
      </div>
      <span class="wb-hint">From Christopher Alexander's <i>A Pattern Language</i>. Hover a pattern to read it.</span>
    </div>

    {#if locked}
      <button class="wb-btn" type="button" onclick={() => (bench.briefLocked = false)}><Icon icon={LockOpen} />Edit again</button>
    {:else}
      <div class="wb-row">
        <button class="wb-btn is-primary" type="button" onclick={() => { bench.briefLocked = true; }}><Icon icon={Lock} />Confirm the brief</button>
        <button class="wb-btn is-quiet" type="button" onclick={() => (bench.brief = null)}>Start over</button>
      </div>
    {/if}
  {/if}
</div>
