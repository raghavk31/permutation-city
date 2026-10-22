<script lang="ts">
  // The Layers step's controls: every layer with a switch, its opacity, and one line on what
  // it is (its source on hover).
  import { Play } from "lucide";
  import * as Cake from "../new/cake";
  import { bench } from "./bench.svelte";
  import Icon from "./Icon.svelte";

  const layers = $derived(bench.site ? Cake.layers(bench.site) : []);
  const on = $derived(layers.filter((l) => bench.layerOn[l.name]).length);

  function toggle(name: string) {
    bench.layerOn = { ...bench.layerOn, [name]: !bench.layerOn[name] };
  }
  function setOpacity(name: string, v: number) {
    bench.opacity = { ...bench.opacity, [name]: v };
  }
  const sourceOf = (note: string) => note.match(/\(([^)]*)\)/)?.[1] ?? "";
  const plainNote = (note: string) => note.replace(/\s*\([^)]*\)/, "");
</script>

<div class="wb-panel">
  <div class="wb-row wb-between">
    <span class="wb-label">{on} of {layers.length} shown</span>
    <button class="wb-btn is-quiet" type="button" onclick={() => (bench.layerView = "stack")}><Icon icon={Play} />Stack them</button>
  </div>
  <ul class="wb-layers">
    {#each layers as l (l.name)}
      {@const shown = !!bench.layerOn[l.name]}
      <li class="wb-layer" class:is-on={shown} title={sourceOf(l.note) ? `Source: ${sourceOf(l.note)}` : undefined}>
        <div class="wb-toggle-row">
          <button class="wb-switch" type="button" role="switch" aria-checked={shown} aria-label={l.label} onclick={() => toggle(l.name)}></button>
          <span><b>{l.label}</b><span class="wb-hint wb-one">{plainNote(l.note) || " "}</span></span>
        </div>
        {#if shown}
          <input class="wb-range" type="range" min="0.15" max="1" step="0.05" aria-label="Opacity of {l.label}"
            value={bench.opacity[l.name] ?? 0.85} oninput={(e) => setOpacity(l.name, +(e.target as HTMLInputElement).value)} />
        {/if}
      </li>
    {/each}
  </ul>
</div>
