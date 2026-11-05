<script lang="ts">
  // The design step, so far: each bank's stretches to choose from, and how far the heights hold.
  import { closestMember, type EdgeOption } from "../../engine/focus/edgesearch";
  import { MONTHS } from "../../engine/focus/river";
  import { LIBRARY } from "../../engine/typology/library";
  import { EDGE_SECTIONS } from "../../engine/typology/library/edgesections";
  import AgentPanel from "./AgentPanel.svelte";
  import { bench } from "./bench.svelte";
  import { LAW_WORDS, mainStop, ROOM_WORDS, STOP_WORDS } from "./edgewords";

  const f = bench.focus;
  const km = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`);
  const signed = (v: number) => `${v > 0 ? "+" : ""}${v}`;
  const members = Object.keys(EDGE_SECTIONS).map((id) => ({ id, name: LIBRARY.find((p) => p.id === id)?.name ?? id }));
  const nameOf = (id: string) => members.find((m) => m.id === id)?.name ?? id;
  const lawful = $derived(f.options?.filter((o) => o.works === "soft") ?? []);
  const whatIf = $derived(f.options?.filter((o) => o.works === "hard") ?? []);
  const at = (o: EdgeOption, key: string) => o.scores.find((s) => s.key === key)?.design ?? 0;
  const n = (v: number) => v.toLocaleString("en-IN");
  /** An option's numbers in a line, leaving out what it doesn't touch. */
  const line = (o: EdgeOption) => [
    `${n(at(o, "days_walkable"))} days walkable`,
    `${at(o, "path_close")} of ${at(o, "path_km")} km of path beside the river`,
    at(o, "earth_moved") ? `${n(at(o, "earth_moved"))} m³ of earth moved` : "no earth moved",
    at(o, "flood_room") >= 1000 ? `${n(at(o, "flood_room"))} m³ more flood room` : "",
    at(o, "planted") >= 1 ? `${at(o, "planted")} ha planted` : "",
    at(o, "paved") ? `${at(o, "paved")} ha of stone` : "",
  ].filter(Boolean).join(", ");
</script>

{#if f.edge}
  <div class="wb-panel">
    {#if f.design}
      <div class="wb-sub">
        <!-- COPY: the design held -->
        <span class="wb-label">Your design</span>
        <p class="wb-hint">{f.option ? `Started from "${f.option.words}".` : "Tried by hand."} {f.whatIf.length ? `A what-if, because of ${f.whatIf.length > 6 ? `${f.whatIf.length} stretches` : f.whatIf.join(", ")}: one such stretch makes the whole design one.` : "Lawful, on the assumption that planting, earth paths and reshaping with no earth added aren't construction."} Ctrl Z undoes a change.</p>
        {#if f.changes}
          {#if f.changes.stretches.length}
            <p class="wb-hint">Changed from the option: {f.changes.stretches.join(", ")}.</p>
            <ul class="wb-checks">
              {#each f.changes.measures as m (m.key)}
                <li class:broken={m.better === false}><b>{m.words}</b><span>{m.from === null ? "none" : n(m.from)} to {m.to === null ? "none" : n(m.to)}{m.unit ? ` ${m.unit}` : ""}{m.better === null ? "" : m.better ? ", better" : ", worse"}</span></li>
              {/each}
            </ul>
            {#if f.changes.steeper.length}<p class="wb-hint" role="status">Newly too steep for a wheelchair: {f.changes.steeper.join("; ")}.</p>{/if}
            <button class="wb-btn is-quiet" type="button" onclick={() => f.restoreOption()}>Back to the option</button>
          {:else}
            <p class="wb-hint">Nothing changed yet. Pick a stretch below or on the map, and change it without touching the rest.</p>
          {/if}
        {/if}
      </div>
    {/if}

    {#if !f.stretchOn}<p class="wb-hint">Pick a stretch, or click the bank on the map, to see its real section.</p>{/if}

    {#if f.stretchOn}
      <div class="wb-sub">
        <!-- COPY: changing a stretch -->
        <span class="wb-label">{f.stretchOn}{f.design ? " in your design" : ""}</span>
        {#if f.fit}
          <p class="wb-hint">{f.fit.mode === "none" ? "No room here, so it's left as it is." : f.fit.mode === "reshape" ? `Ground reshaped into ${f.fit.levels.length} ${f.fit.levels.length === 1 ? "level" : "levels"}, its section closest to ${nameOf(closestMember(f.fit.shape))}.` : "The ground stays as it is."}</p>
        {:else if f.design}
          <p class="wb-hint">Left as it is today, with no path.</p>
        {/if}
        <span class="wb-label">Change this stretch</span>
        <div class="wb-seg">
          <button type="button" aria-pressed={f.works === "soft"} onclick={() => f.setWorks("soft")}>Lawful</button>
          <button type="button" aria-pressed={f.works === "hard"} onclick={() => f.setWorks("hard")}>What-if</button>
        </div>
        <div class="wb-chips">
          <button class="wb-chip" type="button" aria-pressed={f.design !== null && !f.choiceHere} onclick={() => f.choose(null)}>Today</button>
          <button class="wb-chip" type="button" aria-pressed={f.tryFrom === "kept"} onclick={() => f.keepGround()}>Keep the ground, add a path</button>
          {#each members as m (m.id)}
            <button class="wb-chip" type="button" aria-pressed={f.tryFrom === m.id} onclick={() => f.choose(m.id)}>{m.name}</button>
          {/each}
        </div>
        <div class="wb-row-btns">
          {#if f.option && f.changes?.stretches.includes(f.stretchOn)}<button class="wb-btn is-quiet" type="button" onclick={() => f.restoreStretch()}>Back to the option here</button>{/if}
          <button class="wb-btn is-quiet" type="button" disabled={!members.some((m) => m.id === f.tryFrom)} onclick={() => f.chooseAll(f.tryFrom)}>Use on every stretch</button>
          <button class="wb-btn is-quiet" type="button" disabled={!f.design} onclick={() => f.chooseAll(null)}>Clear the design</button>
        </div>
        <p class="wb-hint">Precedents are starting points, and most of their section numbers are assumed. Limits are checked on whatever you choose.</p>
        {#if f.fit}
          <ul class="wb-checks">
            {#each f.fit.checks as c (c.id)}
              <li class:broken={!c.holds}><b>{c.holds ? "Holds" : "Breaks"}: {c.words}</b><span>{c.found}</span></li>
            {/each}
          </ul>
          {#each f.fit.notes as t}<p class="wb-hint">{t}</p>{/each}
        {/if}
      </div>
    {/if}
    <div class="wb-sub">
      <!-- COPY: the search's options -->
      <span class="wb-label">Options for the whole edge</span>
      {#if !f.options}
        <p class="wb-hint">The search starts each stretch from the library's river edges and from the ground left alone, then finds a few distinct ways to join them along each bank.</p>
        <button class="wb-btn is-primary" type="button" aria-busy={f.searching} disabled={f.searching} onclick={() => f.search()}>{f.searching ? "Searching, about 15 seconds" : "Find options"}</button>
        {#if f.searchError}<p class="wb-hint" role="alert">{f.searchError}</p>{/if}
      {:else}
        <details class="wb-group" open={!f.design}>
        <summary>All {f.options.length} options<span class="wb-meta">{f.design ? "choosing one replaces your design; undo brings it back" : ""}</span></summary>
        {#each [{ words: "Lawful", hint: "Planting, earth paths and reshaping with no earth added. This assumes those aren't construction, which nobody has read in the rules yet.", list: lawful }, { words: "What-if", hint: "Go beyond the rules as reported, so each needs a decision someone else would have to make.", list: whatIf }] as g (g.words)}
          <span class="wb-label">{g.words}</span>
          <p class="wb-hint">{g.hint}</p>
          <ul class="wb-stretches">
            {#each g.list as o (o.id)}
              <li>
                <button type="button" aria-pressed={f.design?.basedOn === o.id} onclick={() => f.showOption(f.design?.basedOn === o.id && !f.changes?.stretches.length ? null : o.id)}>
                  <b>{o.words}</b>
                  <span>{o.why}</span>
                  <span>{line(o)}.</span>
                </button>
              </li>
            {/each}
          </ul>
        {/each}
        <p class="wb-hint">What a direction values is assumed, and being down at the water or how a place feels isn't scored, so choose with that in mind. The measures on the right compare options; none is a survey or a flood model.</p>
        </details>
      {/if}
    </div>

    {#each f.edge.banks as b (b.id)}
      <div class="wb-sub">
        <span class="wb-label">{b.words}, {km(b.length)}</span>
        <ul class="wb-stretches">
          {#each b.stretches as s (s.id)}
            <li>
              <button type="button" aria-pressed={f.stretchOn === s.id} onclick={() => f.pickStretch(s.id)}>
                <!-- COPY: one stretch -->
                <b>{s.id}: {ROOM_WORDS[s.room]}, {km(s.length)}</b>
                <span>{s.room === "none" ? "" : `About ${s.reach.mid} m of ground, up to ${STOP_WORDS[mainStop(s)]}. `}{LAW_WORDS[s.law]}{s.viewLow ? "; a view holds trees down" : ""}.</span>
              </button>
            </li>
          {/each}
        </ul>
      </div>
    {/each}

    {#if f.options}
      <AgentPanel agents={["rules", "critic"]} intro="The rules checker and the critic can read the options and any stretch in them. Neither can change a design." />
    {/if}

    <details class="wb-group">
      <summary>How far the heights hold<span class="wb-meta">{f.edge.datum.range ? `${signed(f.edge.datum.range[0])} to ${signed(f.edge.datum.range[1])} m` : ""}</span></summary>
      <!-- COPY: the height check -->
      <p class="wb-hint">Every section hangs from satellite terrain and reported river levels. Where a report can be tested against the terrain, this is how far apart they are. So a design has to hold with the river a metre higher or lower than drawn, and a survey comes before anything is used.</p>
      <ul class="wb-stays">
        {#each f.edge.datum.clues as c (c.words)}
          <li>
            <b>{c.words}</b>
            <p>{c.found}</p>
            {#if c.offset !== null}<span class="wb-tag">{signed(c.offset)} m</span>{/if}
          </li>
        {/each}
      </ul>
    </details>

    <details class="wb-group">
      <summary>The river's level by month<span class="wb-meta">{f.edge.levels.filter((l) => l.read).length} of 12 read</span></summary>
      <ul class="wb-plain">
        {#each f.edge.levels as l (l.month)}
          <li>{MONTHS[l.month]}: {l.read ? `${l.lo} to ${l.hi} m` : "can't be read"}</li>
        {/each}
      </ul>
      <p class="wb-hint">The level that best sorts what the satellite saw wet from what it saw dry, on the terrain's heights. It sees clear days, and cloud and muddy water hide floods, so this is the river on an ordinary day. The monsoon's peaks aren't in it.</p>
    </details>
  </div>
{/if}
