<script lang="ts">
  // Reading a real place: the river level the line is drawn at, which analysis is on the map, and
  // for each what it rests on: the river's records, the rules, the views.
  import { bench } from "./bench.svelte";
  import { FOCUS_LAYERS } from "./focuspaint";

  const f = bench.focus;
  const note = $derived(FOCUS_LAYERS.find((l) => l.id === f.layer)?.note ?? "");
  const peak = $derived(f.year ? Math.max(1, ...f.year.months.map((m) => m.ha)) : 1);
  const AGREE = (a: boolean | null) => (a === null ? null : a ? "Our model agrees" : "Our model disagrees");
  // COPY: how a view stands today
  const standing = (clear: number | null) =>
    clear === null ? "" : clear === 1 ? "Clear today, down to the foot." : clear === 0 ? "Nothing clear today, down to the foot." : `${Math.round(clear * 100)}% of the width clear today, down to the foot.`;
</script>

{#if f.place}
  <div class="wb-panel">
    <div class="wb-sub">
      <span class="wb-label">Draw the line at this river level</span>
      <div class="wb-seg">
        {#each f.place.brief.marks as m, k}
          <button type="button" aria-pressed={f.mark === k} onclick={() => { f.mark = k; bench.sync(); }}>{m.words}</button>
        {/each}
      </div>
      <p class="wb-hint">{f.place.brief.marks[f.mark].note}.</p>
    </div>

    <div class="wb-sub">
      <span class="wb-label">See</span>
      <div class="wb-seg">
        <button type="button" aria-pressed={f.view === "plan"} onclick={() => (f.view = "plan")}>Plan</button>
        <button type="button" aria-pressed={f.view === "section"} onclick={() => (f.view = "section")}>Section</button>
      </div>
    </div>

    {#if f.view === "plan"}
      <div class="wb-sub">
        <span class="wb-label">On the map</span>
        <div class="wb-chips">
          {#each FOCUS_LAYERS as l (l.id)}
            <button class="wb-chip" type="button" aria-pressed={f.layer === l.id} onclick={() => (f.layer = l.id)}>{l.name}</button>
          {/each}
        </div>
        <p class="wb-hint">{note}</p>
      </div>

      {#if f.layer === "year" && f.year && f.place.year}
        <div class="wb-sub">
          <span class="wb-label">Water seen in the study area, {f.place.year.years[0]} to {f.place.year.years[1]}</span>
          <div class="wb-months" role="group" aria-label="Pick a month">
            {#each f.year.months as m (m.month)}
              <button type="button" class:thin={m.thin} aria-pressed={f.month === m.month} title="{m.words}: {m.ha} ha wet, {m.looks} clear looks" onclick={() => (f.month = f.month === m.month ? null : m.month)}>
                <i style="height: {Math.max(4, (m.ha / peak) * 56)}px"></i><span>{m.words[0]}</span>
              </button>
            {/each}
          </div>
          <p class="wb-hint">
            {#if f.month === null}Showing days a year each spot is dry. Pick a month to see that month.
            {:else}{f.year.months[f.month].words}: {f.year.months[f.month].ha} ha wet, from a middle of {f.year.months[f.month].looks} clear looks.{f.year.months[f.month].thin ? " Few clear looks, so read this one lightly." : ""}{/if}
          </p>
          <p class="wb-hint">This shows where water is on clear days, not how deep. Cloud hides short floods and muddy floodwater reads weakly, so the monsoon looks smaller than it is. A daily gauge record is still to find.</p>
        </div>
      {/if}

      {#if f.layer === "levels"}
        <div class="wb-sub">
          <span class="wb-label">What the river has done</span>
          <ul class="wb-stays">
            {#each f.records as r (r.record.date)}
              <li>
                <b>{r.record.date}: {r.record.m} m</b>
                <p>{r.record.what}</p>
                {#if r.model}<p>{r.model}</p>{/if}
                {#if AGREE(r.agrees)}<span class="wb-tag">{AGREE(r.agrees)}</span>{/if}
                <p class="wb-hint"><a href={r.record.source} target="_blank" rel="noreferrer">Source</a> · {r.record.status}</p>
              </li>
            {/each}
          </ul>
        </div>
      {/if}

      {#if f.layer === "rules"}
        <div class="wb-sub">
          <span class="wb-label">Rules that apply here</span>
          <ul class="wb-stays">
            {#each f.place.brief.rules ?? [] as r (r.id)}
              <li onpointerenter={() => (f.ruleOn = r.id)} onpointerleave={() => (f.ruleOn = null)}>
                <b>{r.words}</b>
                <p>{r.effect}</p>
                {#if r.whole}<span class="wb-tag">The whole study area</span>{/if}
                <p class="wb-hint"><a href={r.source} target="_blank" rel="noreferrer">Source</a> · {r.status}</p>
              </li>
            {/each}
          </ul>
          <p class="wb-hint">This is a study, not legal advice.</p>
        </div>
      {/if}

      {#if f.layer === "views" && f.views}
        <div class="wb-sub">
          <span class="wb-label">Which view</span>
          <div class="wb-chips">
            <button class="wb-chip" type="button" aria-pressed={f.viewOn === null} onclick={() => (f.viewOn = null)}>All</button>
            {#each f.views.results as r (r.def.id)}
              <button class="wb-chip" type="button" aria-pressed={f.viewOn === r.def.id} onclick={() => (f.viewOn = r.def.id)}>{r.def.words}</button>
            {/each}
          </div>
          <ul class="wb-stays">
            {#each f.views.results.filter((r) => !f.viewOn || r.def.id === f.viewOn) as r (r.def.id)}
              <li>
                <b>{r.def.words}</b>
                <p>{r.def.why}</p>
                {#if r.clear !== null}<p>{standing(r.clear)}</p>{/if}
                {#if r.blockers.length}<p>{r.blockers.length} {r.blockers.length === 1 ? "building crosses" : "buildings cross"} the sight line{r.blockers[0].name ? `, most of all ${r.blockers[0].name}` : ""}, by up to {Math.round(r.blockers[0].over)} m.</p>{/if}
                <p class="wb-hint">{r.def.status}</p>
              </li>
            {/each}
          </ul>
          <p class="wb-hint">Measured on satellite terrain and every mapped building. Trees are left out. Some building heights are guesses, so treat a limit as a first reading.</p>
        </div>
      {/if}
    {/if}

    <div class="wb-sub">
      <span class="wb-label">How sure is this line</span>
      <!-- COPY: the line's uncertainty -->
      <p class="wb-hint">Uttar Pradesh is reported to have notified the floodplain in January 2025, but we haven't found its map. So this line is a stand-in: ground at or below a recorded river level, joined to the river, from satellite terrain. A couple of metres' error moves it a long way on ground this flat, so try each level.</p>
    </div>
  </div>
{/if}
