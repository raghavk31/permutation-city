<script lang="ts">
  // The design step, so far: each bank's stretches to choose from, and how far the heights hold.
  import { MONTHS } from "../../engine/focus/river";
  import { LIBRARY } from "../../engine/typology/library";
  import { EDGE_SECTIONS } from "../../engine/typology/library/edgesections";
  import { bench } from "./bench.svelte";
  import { LAW_WORDS, mainStop, ROOM_WORDS, STOP_WORDS } from "./edgewords";

  const f = bench.focus;
  const km = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`);
  const signed = (v: number) => `${v > 0 ? "+" : ""}${v}`;
  const members = Object.keys(EDGE_SECTIONS).map((id) => ({ id, name: LIBRARY.find((p) => p.id === id)?.name ?? id }));
</script>

{#if f.edge}
  <div class="wb-panel">
    <p class="wb-hint">Nothing is designed yet. Pick a stretch, or click the bank on the map, to see its real section, then try a precedent's section on it.</p>

    {#if f.stretchOn}
      <div class="wb-sub">
        <!-- COPY: trying a section -->
        <span class="wb-label">Try a section on {f.stretchOn}</span>
        <div class="wb-seg">
          <button type="button" aria-pressed={f.works === "soft"} onclick={() => (f.works = "soft")}>Lawful</button>
          <button type="button" aria-pressed={f.works === "hard"} onclick={() => (f.works = "hard")}>What-if</button>
        </div>
        <div class="wb-chips">
          <button class="wb-chip" type="button" aria-pressed={f.tryFrom === null} onclick={() => f.choose(null)}>Today</button>
          {#each members as m (m.id)}
            <button class="wb-chip" type="button" aria-pressed={f.tryFrom === m.id} onclick={() => f.choose(m.id)}>{m.name}</button>
          {/each}
        </div>
        <div class="wb-row-btns">
          <button class="wb-btn" type="button" disabled={!f.tryFrom} onclick={() => f.chooseAll(f.tryFrom)}>Use on every stretch</button>
          <button class="wb-btn" type="button" disabled={!Object.keys(f.choices).length} onclick={() => f.chooseAll(null)}>Clear all</button>
        </div>
        <p class="wb-hint">These are starting points, not designs: the search comes later. Most of their section numbers are assumed. The scores are on the right.</p>
        {#if f.fit}
          <ul class="wb-checks">
            {#each f.fit.checks as c (c.id)}
              <li class:broken={!c.holds}><b>{c.holds ? "Holds" : "Breaks"}: {c.words}</b><span>{c.found}</span></li>
            {/each}
          </ul>
          {#each f.fit.notes as n}<p class="wb-hint">{n}</p>{/each}
        {/if}
      </div>
    {/if}
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
