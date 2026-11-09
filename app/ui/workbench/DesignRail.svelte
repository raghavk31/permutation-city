<script lang="ts">
  // The design step, so far: each bank's stretches to choose from, and how far the heights hold.
  import { stretchSums, type StretchSums } from "../../engine/focus/edgescore";
  import { type Alternative, closestMember, DIRECTIONS, type EdgeOption, type Values } from "../../engine/focus/edgesearch";
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
  // COPY: what a search can value
  const VALUES: { key: keyof Values; words: string; max: number; step: number }[] = [
    { key: "days", words: "A path that stays dry", max: 1.5, step: 0.05 },
    { key: "close", words: "A path beside the bank", max: 1.5, step: 0.05 },
    { key: "water", words: "Bank reaching the water", max: 2, step: 0.05 },
    { key: "room", words: "Room for flood water", max: 1.5, step: 0.05 },
    { key: "planted", words: "New planting", max: 1.5, step: 0.05 },
    { key: "seats", words: "Places to sit", max: 1.5, step: 0.05 },
    { key: "earth", words: "The cost of moving earth", max: 4, step: 0.25 },
  ];
  const unlocked = $derived((f.edge?.banks.reduce((a, b) => a + b.stretches.length, 0) ?? 0) - f.locks.length);
  const sumsHere = $derived(f.place && f.edge && f.walk && f.fit ? stretchSums(f.place, f.edge, f.fit, f.walk) : null);
  const showOthers = $derived(f.others && f.others.stretch === f.stretchOn ? f.others.list : null);
  /** One alternative in words on this stretch, against what's there now. Dry days are at the river's worst of three levels. */
  function otherLine(a: Alternative, now: StretchSums | null) {
    const km = Math.max(0.05, (f.fit?.stretch.length ?? f.edge?.banks.flatMap((b) => b.stretches).find((s) => s.id === f.stretchOn)?.length ?? 50) / 1000);
    const days = (s: StretchSums) => (s.days / km) * 365;
    const part = (words: string, of: (s: StretchSums) => number, unit: string, digits = 0) => {
      const k = 10 ** digits, round = (x: number) => Math.round(x * k) / k;
      const v = round(of(a.sums)), was = now ? round(of(now)) : null;
      if (v === 0 && (was === null || was === 0)) return "";
      const change = was !== null && v !== was ? ` (${v > was ? "+" : ""}${n(round(v - was))})` : "";
      return `${words} ${n(v)}${unit}${change}`;
    };
    return [
      part("dry", days, " days"),
      part("beside the bank", (s) => s.close * 1000, " m"),
      part("flood room", (s) => s.room, " m³"),
      part("earth moved", (s) => s.earth, " m³"),
      part("planted", (s) => s.planted, " ha", 1),
      part("to sit on", (s) => s.seats, " m"),
      a.steep ? `${a.steep} too steep for a wheelchair` : "",
    ].filter(Boolean).join(", ");
  }
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
        <div class="wb-row-btns">
          <button class="wb-btn" type="button" aria-pressed={f.locks.includes(f.stretchOn)} onclick={() => f.toggleLock(f.stretchOn!)}>{f.locks.includes(f.stretchOn) ? "Locked: free it" : "Lock this stretch"}</button>
          <button class="wb-btn" type="button" aria-busy={f.othersBusy} disabled={f.othersBusy || f.searching} onclick={() => f.otherWays()}>{f.othersBusy ? "Looking" : "Other ways to do this"}</button>
        </div>
        {#if showOthers}
          {#if showOthers.length}
            <p class="wb-hint">Each is the best the search found at something, {f.others?.works === "hard" ? "as a what-if" : "lawfully"}. Numbers are for this stretch{sumsHere ? ", with the change from what's here now in brackets" : ""}; dry days are with the river a metre higher.</p>
            <ul class="wb-stretches">
              {#each showOthers as a, i (i)}
                <li>
                  <button type="button" onclick={() => f.useOther(a)}>
                    <b>{a.best[0][0].toUpperCase() + a.best[0].slice(1)}{a.best.length > 1 ? `, and ${a.best.slice(1).join(", ")}` : ""}</b>
                    <span>{a.mode === "reshape" ? `Reshaped into ${a.levels} ${a.levels === 1 ? "level" : "levels"}${a.like ? `, closest to ${nameOf(a.like)}` : ""}.` : a.mode === "none" ? "No room, left as it is." : "The ground stays as it is."}</span>
                    <span>{otherLine(a, sumsHere) || "Nothing to measure here."}</span>
                  </button>
                </li>
              {/each}
            </ul>
          {:else}
            <p class="wb-hint">Nothing here can differ: there's no room, or the law leaves only one thing to do.</p>
          {/if}
        {/if}
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
    {#if f.design}
      <div class="wb-sub">
        <!-- COPY: searching around what's locked -->
        <span class="wb-label">Search around what you've locked</span>
        <p class="wb-hint">{f.locks.length ? `Locked: ${f.locks.join(", ")}. These stay exactly as they are.` : "Nothing locked yet, so this searches every stretch again."} {f.works === "hard" ? "The rest are searched as a what-if." : "The rest are searched lawfully."} Undo brings back what's there now.</p>
        <div class="wb-chips">
          {#each DIRECTIONS as d (d.id)}
            <button class="wb-chip" type="button" aria-pressed={f.aim === d.id} onclick={() => f.aimAt(d.id)}>{d.words}</button>
          {/each}
        </div>
        <details class="wb-group">
          <summary>What this search values</summary>
          <p class="wb-hint">These are choices, not findings, and a design keeps the ones that made it. They start from the direction chosen above.</p>
          <div class="wb-values">
            {#each VALUES as v (v.key)}
              <label><span>{v.words}</span><input type="range" min="0" max={v.max} step={v.step} value={Math.max(0, f.values[v.key])} oninput={(e) => f.setValue(v.key, +e.currentTarget.value)} /><b>{Math.max(0, f.values[v.key]).toFixed(2)}</b></label>
            {/each}
          </div>
        </details>
        <button class="wb-btn is-primary" type="button" aria-busy={f.searching} disabled={f.searching || unlocked === 0} onclick={() => f.searchRest()}>{f.searching ? "Searching, up to 15 seconds" : `Search the other ${unlocked} ${unlocked === 1 ? "stretch" : "stretches"}`}</button>
        {#if f.design.searched?.locked.length}<p class="wb-hint">This design came from a search around {f.design.searched.locked.length} locked {f.design.searched.locked.length === 1 ? "stretch" : "stretches"}.</p>{/if}
        {#if f.searchError}<p class="wb-hint" role="alert">{f.searchError}</p>{/if}
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
                <b>{s.id}: {ROOM_WORDS[s.room]}, {km(s.length)}{f.locks.includes(s.id) ? ", locked" : ""}</b>
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
