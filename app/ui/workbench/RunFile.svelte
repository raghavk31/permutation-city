<script lang="ts">
  // A button that opens a saved run file (saved.ts): the file is read here and handed to the
  // workbench, which opens its site and shows the run.
  import type { Snippet } from "svelte";
  import { bench } from "./bench.svelte";

  let { children, quiet = false }: { children: Snippet; quiet?: boolean } = $props();
  let input = $state<HTMLInputElement>();

  async function pick() {
    const f = input?.files?.[0];
    if (!f) return;
    const text = await f.text();
    input!.value = "";
    await bench.openFile(text);
  }
</script>

<button class="wb-btn" class:is-quiet={quiet} type="button" disabled={bench.running || !!bench.restoring} onclick={() => input?.click()}>{@render children()}</button>
<input bind:this={input} type="file" accept=".json,application/json" hidden onchange={pick} />
