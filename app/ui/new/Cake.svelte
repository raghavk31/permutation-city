<script lang="ts">
  // The layer cake: each layer as its own map, the rules that read them, and the map of
  // what the land allows. Rule edits re-run in the browser (app/engine/rules.ts).
  import * as E from "../../engine";
  import * as Draw from "../draw";
  import * as Sites from "../sites";
  import * as Cake from "./cake";
  import { cellAt, layerMap, rulesMap, STATE_COLOURS } from "./draw-cake";

  let { id, site, initialRules, onback, onbrief }: {
    id: string; site: E.SiteExport; initialRules: E.RuleSet | null; onback: () => void; onbrief: (rules: E.RuleSet) => void;
  } = $props();

  // Read once: App remounts this component for each site ({#key id}).
  // svelte-ignore state_referenced_locally
  const original = site.rules!;
  // svelte-ignore state_referenced_locally
  let rules = $state.raw<E.RuleSet>(initialRules ?? original);
  // svelte-ignore state_referenced_locally
  const all = Cake.layers(site);
  // A first stack that tells the site's story; the rest are a click away.
  const FIRST = /^(water|ground|flood_|pool|catchment_ha|trees|built|industrial)/;
  let shown = $state<Record<string, boolean>>(Object.fromEntries(all.map((l) => [l.name, FIRST.test(l.name)])));
  let highlight = $state<number | null>(null);
  let hover = $state<number>(-1);
  let copied = $state(false);

  const P = Draw.palette();

  const applied = $derived(Sites.withRules(site, rules));
  const res = $derived(applied.result);
  const ruleHa = $derived(Cake.ruleHectares(site, res));
  const totals = $derived(Cake.stateHectares(site, res));
  const edited = $derived(JSON.stringify(rules) !== JSON.stringify(original));
  const designHa = $derived(applied.site.meta.design_ha);

  // Keep the URL in step with the rules, so a reload or a shared link shows the same ground.
  $effect(() => {
    history.replaceState(null, "", Sites.query(id, rules, original));
  });

  // Canvases are drawn by attachments, which re-run when what they read changes.
  let rulesView: Draw.View | null = null;
  const drawRules = (canvas: HTMLCanvasElement) => {
    rulesView = rulesMap(canvas, site, res, P, highlight);
  };

  const drawLayer = (l: Cake.Layer) => (canvas: HTMLCanvasElement) => {
    const v = layerMap(canvas, site, l, P);
    canvas.onpointermove = (e) => (hover = cellAt(v, site, e));
    canvas.onpointerleave = () => (hover = -1);
  };

  const fmtHa = (v: number) => `${v < 10 ? Number(v.toFixed(1)) : Math.round(v).toLocaleString("en-IN")} ha`;
  const kindLabel = { forbidden: "forbidden", retained: "retained", constrained: "constrained" };

  function setValue(rule: E.Rule, leaf: Cake.Leaf, raw: string) {
    const value = Number(raw);
    if (raw.trim() === "" || !Number.isFinite(value)) return;
    rules = Cake.editLeaf(rules, rule.id, leaf.path, { value });
  }
  function setOp(rule: E.Rule, leaf: Cake.Leaf, op: string) {
    rules = Cake.editLeaf(rules, rule.id, leaf.path, { op });
  }
  function setLimit(rule: E.Rule, key: "max_levels" | "min_permeable", raw: string) {
    const v = raw.trim() === "" ? undefined : Number(raw);
    if (v !== undefined && !Number.isFinite(v)) return;
    rules = Cake.editLimit(rules, rule.id, key, key === "min_permeable" && v !== undefined ? Math.min(Math.max(v / 100, 0), 1) : v);
  }

  async function copyLink() {
    await navigator.clipboard.writeText(location.href);
    copied = true;
    setTimeout(() => (copied = false), 1500);
  }

  const cellInfo = $derived.by(() => {
    if (hover < 0) return null;
    const g = site.grid, L = g.layers!;
    const state = E.STATES[res.state[hover]];
    return {
      state, water: !!L.water[hover], reasons: res.reasons[hover], roles: res.roles[hover], uses: res.uses[hover],
      conflict: !!res.conflict[hover], cap: res.maxLevels[hover], perm: res.minPermeable[hover],
      values: all.map((l) => [l.label, Cake.format(l, L[l.name][hover])] as [string, string]),
    };
  });
</script>

<section class="pcn-cake">
  <div class="pcn-cake-head">
    <h1>{site.meta.name}</h1>
    <p class="pc-muted">{site.grid.x.length.toLocaleString("en-IN")} cells, {E.gridLabel(E.gridOf(site.meta))} ·
      design ground {fmtHa(designHa)} · <button type="button" class="pcn-link" onclick={onback}>pick another site</button></p>
    {#each site.meta.service?.warnings ?? [] as w}<p class="pcn-warn" role="note">{w}</p>{/each}
  </div>

  <div class="pcn-cake-body">
    <div class="pcn-stack">
      <h2>The layers</h2>
      <p class="pc-muted">What is here, one layer at a time. Hover any map to read every layer for that cell.</p>
      <div class="pcn-toggles" role="group" aria-label="Layers to show">
        {#each all as l}
          <button type="button" aria-pressed={shown[l.name]} onclick={() => (shown[l.name] = !shown[l.name])}>{l.label}</button>
        {/each}
      </div>
      <div class="pcn-layers">
        {#each all.filter((l) => shown[l.name]) as l (l.name)}
          <figure>
            <canvas {@attach drawLayer(l)}></canvas>
            <figcaption><b>{l.label}</b>{#if l.note}{" · "}<span class="pc-muted">{l.note}</span>{/if}</figcaption>
          </figure>
        {/each}
      </div>
    </div>

    <div class="pcn-allows">
      <div class="pcn-sticky">
        <h2>What the land allows</h2>
        <canvas class="pc-map" {@attach drawRules} onpointermove={(e) => rulesView && (hover = cellAt(rulesView, site, e))}
          onpointerleave={() => (hover = -1)}></canvas>
        <p class="pc-legend">
          {#each [0, 2, 3, 1] as s}
            <span><i style="background:{STATE_COLOURS(P)[s]}"></i>{E.STATES[s]}: {Cake.STATE_NOTES[s]} · {fmtHa(totals.states[s])}</span>
          {/each}
          {#if totals.conflict > 0}<span><i class="pcn-dot"></i>conflict: its rules allow no common use · {fmtHa(totals.conflict)}</span>{/if}
        </p>
        <div class="pcn-cell" aria-live="polite">
          {#if cellInfo}
            {#if cellInfo.water}<b>water</b>{:else}
              <b>{cellInfo.state}</b>{#if cellInfo.reasons}: {cellInfo.reasons}{/if}
              {#if cellInfo.state === "constrained" || cellInfo.state === "open"}
                <br>up to {cellInfo.cap} storeys · at least {Math.round(cellInfo.perm * 100)}% unsealed · allows {cellInfo.uses.replace(/,/g, ", ")}
                {#if cellInfo.conflict}<br><span class="pc-error">conflict: these rules share no use, so any of their uses is allowed until you decide</span>{/if}
              {/if}
              {#if cellInfo.roles}<br>roles: {cellInfo.roles.replace(/_/g, " ").replace(/,/g, ", ")}{/if}
            {/if}
            <br><span class="pc-muted">{cellInfo.values.map(([k, v]) => `${k} ${v}`).join(" · ")}</span>
          {:else}<span class="pc-muted">Hover a cell.</span>{/if}
        </div>
      </div>
    </div>
  </div>

  <div class="pcn-rules">
    <h2>The rules</h2>
    <p>Rules overlap: a cell belongs to every rule it matches, its limits are the strictest of them, and its roles add up
      (a rain hollow by the water is both flood storage and public edge). Forbidden always wins. Change a number and the
      map above redraws.</p>
    {#if res.skipped.length}<p class="pc-muted">Skipped (this site has no such layer): {res.skipped.join(", ")}.</p>{/if}
    <ol class="pcn-rule-list">
      {#each rules.list as r (r.id)}
        {@const off = Cake.isOff(r)}
        <li class="pcn-rule pcn-{r.kind}" class:off onpointerenter={() => (highlight = r.id)} onpointerleave={() => (highlight = null)}>
          <div class="pcn-rule-head">
            <label class="pcn-check"><input type="checkbox" checked={!off} onchange={(e) => (rules = Cake.setOff(rules, r.id, !e.currentTarget.checked))} />
              <span class="pcn-kind">{kindLabel[r.kind]}</span> <b>{r.name}</b></label>
            <span class="pc-muted">{fmtHa(ruleHa[r.id])}</span>
          </div>
          {#if r.why}<p class="pc-muted">{r.why}</p>{/if}
          {#if !off}
            <div class="pcn-when">
              when {#each Cake.leaves(r.when) as leaf, k}
                {#if k}<span class="pc-muted"> · </span>{/if}
                {leaf.negated ? "not " : ""}{Cake.layerInfo(leaf.layer, site).label}
                {#if leaf.op !== undefined}
                  <select value={leaf.op} onchange={(e) => setOp(r, leaf, e.currentTarget.value)} aria-label="comparison">
                    {#each Cake.OPS as op}<option value={op}>{op}</option>{/each}
                  </select>
                  <input type="number" step="any" value={leaf.value} aria-label="threshold"
                    onchange={(e) => setValue(r, leaf, e.currentTarget.value)} />
                {/if}
              {/each}
            </div>
            {#if r.kind === "constrained"}
              <div class="pcn-limits">
                <label>height cap <input type="number" min="0" max="40" step="1" value={r.limits.max_levels ?? ""}
                  placeholder="none" onchange={(e) => setLimit(r, "max_levels", e.currentTarget.value)} /> storeys</label>
                <label>unsealed <input type="number" min="0" max="100" step="5"
                  value={r.limits.min_permeable !== undefined ? Math.round(r.limits.min_permeable * 100) : ""}
                  placeholder="none" onchange={(e) => setLimit(r, "min_permeable", e.currentTarget.value)} />%</label>
                {#if r.limits.uses}<span class="pc-muted">allows {r.limits.uses.join(", ")}</span>{/if}
                {#if r.roles.length}<span class="pc-muted">roles: {r.roles.join(", ").replace(/_/g, " ")}</span>{/if}
              </div>
            {/if}
          {/if}
        </li>
      {/each}
    </ol>
    <div class="pcn-actions">
      <button type="button" class="pcn-go" onclick={() => onbrief(rules)}>Write a brief</button>
      <a href={Sites.evolveLink(id, rules, original)}>Evolve without a brief</a>
      <button type="button" onclick={copyLink}>{copied ? "Link copied" : "Copy a link to these rules"}</button>
      {#if edited}<button type="button" onclick={() => (rules = original)}>Back to the site's rules</button>{/if}
    </div>
  </div>

  <p class="pc-muted pc-credits">Data: {site.meta.credits.join(" · ")}.</p>
</section>
