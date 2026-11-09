<script lang="ts">
  // What stays: proposed from the brief, each with its reason and source. A stakeholder decides each
  // one and the decision is kept as a record; the agents read and argue, and can't decide
  // (docs/architecture-v3.md section 15, F3).
  import { AGENTS, type AgentId } from "../../agents/roles";
  import { effectOf, roleWords, ROLES, standing } from "../../engine/focus/decisions";
  import AgentPanel from "./AgentPanel.svelte";
  import { bench } from "./bench.svelte";

  const f = bench.focus;
  const AGENT_IDS = Object.keys(AGENTS) as AgentId[];

  // The form open on one stay at a time.
  let open = $state<string | null>(null);
  let choice = $state<"keep" | "change">("keep");
  let because = $state("");
  let wrong = $state("");

  function start(id: string, c: "keep" | "change") { open = id; choice = c; because = ""; wrong = ""; }
  function save() {
    try { f.decide(open!, choice, because); open = null; } catch (e) { wrong = e instanceof Error ? e.message : "That couldn't be saved."; }
  }
  function reopen(id: string) {
    try { f.decide(id, "reopen", `Reopened by ${roleWords(f.asRole)}.`); } catch (e) { wrong = e instanceof Error ? e.message : ""; }
  }
  const now = $derived(standing(f.decisions));
  const when = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  /** What the agents suggest about a stay, newest reports as they stand. */
  const suggestions = (id: string) => AGENT_IDS.flatMap((a) => (f.runs[a]?.findings ?? []).filter((x) => x.about === id && x.suggests).map((x) => ({ agent: AGENTS[a].words, ...x })));
</script>

{#if f.place}
  <div class="wb-panel">
    <!-- COPY: what stays -->
    <div class="wb-sub">
      <p class="wb-hint">Proposed from the brief. A stakeholder decides each one; agents can only argue.</p>
      <span class="wb-label">Deciding as</span>
      <select class="wb-input" bind:value={f.asRole} aria-label="The stakeholder you're deciding as">
        {#each ROLES as r (r.id)}<option value={r.id}>{r.words}</option>{/each}
      </select>
      <p class="wb-hint">One person acting in each role for now, so the record says the role, not who.</p>
    </div>

    <ul class="wb-stays">
      {#each f.stays as s (s.id)}
        {@const d = now.get(s.id)}
        <li onpointerenter={() => (f.stayOn = s.id)} onpointerleave={() => (f.stayOn = null)}>
          <b>{s.words}</b>
          <p>{s.why}</p>
          <p class="wb-hint">{#if s.source}<a href={s.source} target="_blank" rel="noreferrer">Source</a>{" · "}{/if}{s.status}{s.outline ? ` · outline ${s.outline}` : ""}</p>
          {#each suggestions(s.id) as x}
            <p class="wb-hint">{x.agent} suggests {x.suggests === "keep" ? "keeping" : "changing"} this: {x.claim}</p>
          {/each}
          {#if d}
            <span class="wb-tag">{d.choice === "keep" ? "Kept" : "To change"} · {roleWords(d.by)}</span>
            <p>{d.because}</p>
            <p class="wb-hint">{when(d.at)}. {d.changed}</p>
            <button class="wb-link" type="button" onclick={() => reopen(s.id)}>Reopen</button>
          {:else if open === s.id}
            <span class="wb-tag">{choice === "keep" ? "Keep" : "Change"} · {roleWords(f.asRole)}</span>
            <p class="wb-hint">{effectOf(f.place, s.id, choice)}</p>
            <textarea class="wb-input wb-textarea" rows="3" bind:value={because} placeholder="Why? This goes on the record." aria-label="The reason for this decision"></textarea>
            {#if wrong}<p class="wb-hint" role="alert">{wrong}</p>{/if}
            <div class="wb-row">
              <button class="wb-btn" type="button" onclick={save}>Record it</button>
              <button class="wb-btn is-quiet" type="button" onclick={() => (open = null)}>Cancel</button>
            </div>
          {:else}
            <span class="wb-tag">Waiting for a decision</span>
            <div class="wb-row">
              <button class="wb-btn is-quiet" type="button" onclick={() => start(s.id, "keep")}>Keep</button>
              <button class="wb-btn is-quiet" type="button" onclick={() => start(s.id, "change")}>Change</button>
            </div>
          {/if}
        </li>
      {/each}
    </ul>

    <div class="wb-sub">
      <span class="wb-label">The record</span>
      {#if f.decisions.length}
        <details class="wb-group"><summary>Every decision so far<span class="wb-meta">{f.decisions.length}</span></summary>
          <ul class="wb-plain">
            {#each f.decisions as d}<li>{when(d.at)}, {roleWords(d.by)}: {d.choice} {d.stay}. {d.because}</li>{/each}
          </ul>
        </details>
        <button class="wb-btn is-quiet" type="button" onclick={() => f.download()}>Download the record</button>
        <p class="wb-hint">Kept in this browser only, so download it to keep or share it.</p>
      {:else}
        <p class="wb-hint">Nothing decided yet.</p>
      {/if}
    </div>

    <AgentPanel agents={AGENT_IDS} intro="Each reads the place through the engine's measures." />
  </div>
{/if}
