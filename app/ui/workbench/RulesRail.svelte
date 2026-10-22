<script lang="ts">
  // The Rules step's controls: what the land allows (hectares in each state), then every rule
  // as a sentence whose numbers can be changed in place; the map follows at once. Pointing at a
  // rule outlines its ground on the map.
  import { RotateCcw } from "lucide";
  import type * as E from "../../engine";
  import * as Cake from "../new/cake";
  import * as Sites from "../sites";
  import { bench } from "./bench.svelte";
  import Icon from "./Icon.svelte";
  import * as Words from "./words";

  const site = $derived(bench.site!);
  const rules = $derived(bench.rules!);
  const original = $derived(site.rules!);
  const res = $derived(Sites.withRules(site, rules).result);
  const ruleHa = $derived(Cake.ruleHectares(site, res));
  const totals = $derived(Cake.stateHectares(site, res));
  const land = $derived(totals.states.reduce((a, b) => a + b, 0) || 1);

  // COPY: state names
  const STATE = [
    { name: "Never built", cls: "wb-hatch-forbidden" }, { name: "Kept as it is", cls: "is-kept" },
    { name: "Built with limits", cls: "wb-hatch-constrained" }, { name: "Free to design", cls: "is-free" },
  ];
  const groups: E.Rule["kind"][] = ["forbidden", "retained", "constrained"];
  const fmtHa = (v: number) => `${v < 10 ? Number(v.toFixed(1)) : Math.round(v).toLocaleString("en-IN")} ha`;

  const originalOf = (r: E.Rule) => original.list.find((o) => o.id === r.id);
  const changed = (r: E.Rule) => JSON.stringify(r) !== JSON.stringify(originalOf(r));

  function setNumber(r: E.Rule, p: Extract<Words.Part, { leaf: Cake.Leaf }>, raw: string) {
    const v = Number(raw);
    if (raw.trim() === "" || !Number.isFinite(v)) return;
    bench.setRules(Cake.editLeaf(rules, r.id, p.leaf.path, { value: v / p.scale }));
  }
  function setLimit(r: E.Rule, key: "max_levels" | "min_permeable", raw: string) {
    const v = Number(raw);
    if (raw.trim() === "" || !Number.isFinite(v)) return;
    bench.setRules(Cake.editLimit(rules, r.id, key, key === "min_permeable" ? Math.min(Math.max(v / 100, 0), 1) : Math.max(0, Math.round(v))));
  }
  function reset(r: E.Rule) {
    const o = originalOf(r);
    if (o) bench.setRules({ ...rules, list: rules.list.map((x) => (x.id === r.id ? o : x)) });
  }
  const width = (n: number) => `${Math.max(2, String(n).length) + 1.2}ch`;
</script>

<div class="wb-panel">
  <div class="wb-sub">
    <span class="wb-label">What the land allows</span>
    <div class="wb-states">
      {#each STATE as s, k}
        <div class="wb-state-row">
          <i class={s.cls}></i><span>{s.name}</span>
          <span class="wb-bar"><b style="width: {(totals.states[k] / land) * 100}%"></b></span>
          <span class="wb-num">{fmtHa(totals.states[k])}</span>
        </div>
      {/each}
    </div>
    {#if totals.conflict > 0}
      <!-- COPY: conflicts -->
      <p class="wb-hint">{fmtHa(totals.conflict)} where rules disagree on what may go there (dots on the map).</p>
    {/if}
    {#if bench.edited}
      <button class="wb-btn is-quiet" type="button" onclick={() => bench.setRules(original)}><Icon icon={RotateCcw} />Back to the site's rules</button>
    {/if}
  </div>

  {#each groups as kind}
    {@const list = rules.list.map((r, idx) => ({ r, idx })).filter((x) => x.r.kind === kind)}
    {#if list.length}
      <div class="wb-sub">
        <span class="wb-label">{Words.VERB[kind]}</span>
        {#each list as { r, idx } (r.id)}
          {@const off = Cake.isOff(r)}
          {@const skipped = res.skipped.includes(r.name)}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="wb-sentence" class:is-changed={changed(r)} class:is-off={off || skipped}
            onpointerenter={() => (bench.ruleHover = idx)} onpointerleave={() => (bench.ruleHover = null)}
            onfocusin={() => (bench.ruleHover = idx)} onfocusout={() => (bench.ruleHover = null)}>
            <div class="wb-head">
              <b class="wb-rule-name" title={r.why}>{r.name[0].toUpperCase() + r.name.slice(1)}</b>
              <!-- COPY: a rule this site has no layer for -->
              <span class="wb-meta">{skipped ? "doesn't apply here" : off ? "off" : fmtHa(ruleHa[idx] ?? 0)}</span>
              {#if !skipped}<button class="wb-switch" type="button" role="switch" aria-checked={!off} aria-label="{r.name}: on"
                onclick={() => bench.setRules(Cake.setOff(rules, r.id, !off))}></button>{/if}
            </div>
            {#if skipped}
              <span class="wb-hint">This site has no {r.name.includes("flood") ? "sea flooding" : "layer for it"}, so the rule is skipped.</span>
            {:else if !off}
              <span>
                {#each Words.sentence(r, site) as p}
                  {#if "leaf" in p}<input class="wb-inline-num" type="number" step="any" value={p.shown} style="width: {width(p.shown)}"
                      aria-label="{r.name}: value" onchange={(e) => setNumber(r, p, (e.target as HTMLInputElement).value)} />{p.unit}{:else}{p.text}{/if}
                {/each}.
              </span>
              {#if r.limits.max_levels !== undefined || r.limits.min_permeable !== undefined}
                <span class="wb-limits">
                  {#if r.limits.max_levels !== undefined}At most <input class="wb-inline-num" type="number" min="0" max="40" value={r.limits.max_levels}
                    style="width: {width(r.limits.max_levels)}" aria-label="{r.name}: most levels"
                    onchange={(e) => setLimit(r, "max_levels", (e.target as HTMLInputElement).value)} /> levels{/if}{#if r.limits.max_levels !== undefined && r.limits.min_permeable !== undefined}, {/if}{#if r.limits.min_permeable !== undefined}<input class="wb-inline-num" type="number" min="0" max="100" value={Math.round(r.limits.min_permeable * 100)}
                    style="width: {width(Math.round(r.limits.min_permeable * 100))}" aria-label="{r.name}: share left unsealed"
                    onchange={(e) => setLimit(r, "min_permeable", (e.target as HTMLInputElement).value)} />% left unsealed{/if}{#if r.limits.uses?.length}; only {r.limits.uses.join(", ")}{/if}.
                </span>
              {:else if r.limits.uses?.length}
                <span class="wb-limits">Only {r.limits.uses.join(", ")}.</span>
              {/if}
            {/if}
            {#if changed(r)}
              <button class="wb-btn is-quiet wb-reset" type="button" onclick={() => reset(r)}><Icon icon={RotateCcw} />Back to the original</button>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  {/each}
</div>
