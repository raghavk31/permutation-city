<script lang="ts">
  // The Draw step's controls: the five moves to draw with, what a spine and a street take, and
  // the moves drawn so far, each with its size, any conflict with the rules, and a way to remove
  // it. A run waits until no move conflicts.
  import { Ban, Building2, Route, Square, Trash2, Trees } from "lucide";
  import * as E from "../../engine";
  import { length } from "../../engine/plan/geom";
  import { bench } from "./bench.svelte";
  import Icon from "./Icon.svelte";

  // COPY: the tools
  const TOOLS: { kind: E.MoveKind; icon: typeof Route; hint: string }[] = [
    { kind: "street", icon: Route, hint: "A street every design keeps; the others join it." },
    { kind: "spine", icon: Trees, hint: "A band of green across the site, kept unbuilt." },
    { kind: "plaza", icon: Square, hint: "An open square: no buildings, no planting." },
    { kind: "nobuild", icon: Ban, hint: "Nothing built here; green or water may be." },
    { kind: "keep", icon: Building2, hint: "Click a building standing today to keep it." },
  ];

  const conflicts = $derived(bench.drawn?.conflicts ?? []);
  const cells = $derived(bench.drawn?.cells);
  const cellArea = $derived(bench.site?.meta.cell_area ?? 0);
  const size = (m: E.Move) => {
    if (m.kind === "street" || m.kind === "spine") return `${Math.round(length(m.pts)).toLocaleString("en-IN")} m`;
    const a = E.moveArea(m);
    return a >= 1000 ? `${(a / 1e4).toFixed(2)} ha` : `${Math.round(a).toLocaleString("en-IN")} m²`;
  };
  const covers = (m: E.Move) => {
    const n = cells?.get(m.id)?.length;
    return n ? `, ${((n * cellArea) / 1e4).toFixed(1)} ha of the grid` : "";
  };
  const pick = (k: E.MoveKind) => (bench.tool = bench.tool === k ? null : k);
</script>

<div class="wb-sub">
  <!-- COPY: what the Draw step is -->
  <p class="wb-hint">Draw the moves you are sure of. Every design keeps them; evolution explores everything else.</p>

  <div class="wb-tools" role="group" aria-label="Moves to draw">
    {#each TOOLS as t (t.kind)}
      <button class="wb-tool" type="button" aria-pressed={bench.tool === t.kind} onclick={() => pick(t.kind)}>
        <Icon icon={t.icon} /><span>{E.MOVE_NAMES[t.kind]}</span><span class="wb-hint">{t.hint}</span>
      </button>
    {/each}
  </div>

  {#if bench.tool === "spine"}
    <div class="wb-field">
      <label for="wb-spine">Spine width <output class="wb-num">{bench.spineWidth} m</output></label>
      <input id="wb-spine" class="wb-range" type="range" min={E.SPINE_WIDTH_M.min} max={E.SPINE_WIDTH_M.max} step="5" bind:value={bench.spineWidth} />
    </div>
  {:else if bench.tool === "street"}
    <div class="wb-field">
      <span class="wb-field-label">Street</span>
      <!-- COPY: street classes (docs/streets.md widths) -->
      <div class="wb-seg" role="group" aria-label="Street class">
        <button type="button" aria-pressed={bench.streetCls === 3} onclick={() => (bench.streetCls = 3)}>Primary, 18 m</button>
        <button type="button" aria-pressed={bench.streetCls === 2} onclick={() => (bench.streetCls = 2)}>Secondary, 12 m</button>
      </div>
    </div>
  {/if}

  {#if bench.moves.length}
    <span class="wb-label">Drawn</span>
    <ul class="wb-moves">
      {#each bench.moves as m (m.id)}
        {@const bad = conflicts.filter((c) => c.move === m.id)}
        <li class="wb-move-row" class:is-bad={bad.length > 0} onpointerenter={() => (bench.moveHover = m.id)} onpointerleave={() => (bench.moveHover = null)}>
          <span>{E.MOVE_NAMES[m.kind]} <span class="wb-hint wb-num">{size(m)}{covers(m)}</span></span>
          <button class="wb-icon-btn" type="button" aria-label="Remove {E.MOVE_NAMES[m.kind]}" title="Remove" onclick={() => bench.removeMove(m.id)}><Icon icon={Trash2} /></button>
          {#if m.kind === "spine"}
            <label class="wb-hint" style="grid-column: 1 / -1">Width
              <input class="wb-range" type="range" min={E.SPINE_WIDTH_M.min} max={E.SPINE_WIDTH_M.max} step="5" value={m.width}
                onchange={(e) => bench.updateMove(m.id, { width: +(e.currentTarget as HTMLInputElement).value })} /> {m.width} m</label>
          {:else if m.kind === "street"}
            <div class="wb-seg" role="group" aria-label="Street class" style="grid-column: 1 / -1">
              <button type="button" aria-pressed={m.cls !== 2} onclick={() => bench.updateMove(m.id, { cls: 3 })}>Primary</button>
              <button type="button" aria-pressed={m.cls === 2} onclick={() => bench.updateMove(m.id, { cls: 2 })}>Secondary</button>
            </div>
          {/if}
          {#each bad as c}<span class="wb-warn">{c.text}</span>{/each}
        </li>
      {/each}
    </ul>
    <!-- COPY: conflicts hold the run -->
    {#if conflicts.length}
      <p class="wb-hint" style="color: var(--pc-forbidden)">The run waits until no move conflicts with the rules: move it, remove it, or change the rule on the Rules step.</p>
    {:else}
      <p class="wb-hint">No conflicts with the rules. Every design in the next run keeps these.</p>
    {/if}
    <button class="wb-btn" type="button" onclick={() => bench.setMoves([])}>Clear all</button>
  {/if}
</div>
