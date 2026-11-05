<script lang="ts">
  // Asking the agents, wherever a step offers it. They read through the engine's measures and can't change
  // anything; each report says what was on show when it ran.
  import { AGENTS, type AgentId } from "../../agents/roles";
  import { bench } from "./bench.svelte";

  let { agents, intro }: { agents: AgentId[]; intro: string } = $props();
  const f = bench.focus;
  const KIND = { measured: "measured", sourced: "from a source", assumed: "assumed", question: "for a person to answer" } as const;
</script>

<div class="wb-sub">
  <span class="wb-label">Ask the agents</span>
  <p class="wb-hint">{intro} A finding with a number no measure returned, or a source not on record, is taken out and shown to you. Each run costs money on the model account.</p>
  {#each agents as a (a)}
    {@const run = f.runs[a]}
    <div class="wb-agent">
      <button class="wb-btn is-quiet" type="button" disabled={!!f.running} onclick={() => f.ask(a)}>
        {f.running === a ? `${AGENTS[a].words}: reading${f.progress ? ` (${f.progress})` : ""}` : run ? `Ask the ${AGENTS[a].words.toLowerCase()} again` : `Ask the ${AGENTS[a].words.toLowerCase()}`}
      </button>
      {#if !run}<p class="wb-hint">{AGENTS[a].does}</p>{/if}
      {#if run}
        <p class="wb-hint">{f.runRead[a] ? `Had this option on show: ${f.runRead[a]}.` : "No design option was on show."}</p>
        <p>{run.summary}</p>
        <ul class="wb-stays">
          {#each run.findings as x}
            <li>
              <p>{x.claim}</p>
              <span class="wb-tag">{KIND[x.kind]}</span>
              {#if x.source}<a class="wb-hint" href={x.source} target="_blank" rel="noreferrer">Source</a>{/if}
            </li>
          {/each}
        </ul>
        {#if run.removed.length}
          <details class="wb-group"><summary>Taken out by the check<span class="wb-meta">{run.removed.length}</span></summary>
            <ul class="wb-plain">{#each run.removed as r}<li>{r.claim} <b>{r.why}</b></li>{/each}</ul>
          </details>
        {/if}
      {/if}
    </div>
  {/each}
  {#if f.agentError}<p class="wb-hint" role="alert">{f.agentError}</p>{/if}
</div>
