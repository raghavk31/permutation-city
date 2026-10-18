<script lang="ts">
  // Two stages: pick a site (draw it, or take a ready-made one), then the layer cake.
  import { onMount } from "svelte";
  import type * as E from "../../engine";
  import * as Sites from "../sites";
  import Cake from "./Cake.svelte";
  import Picker from "./Picker.svelte";

  let id = $state<string | null>(null);
  let site = $state.raw<E.SiteExport | null>(null);
  let rules = $state.raw<E.RuleSet | null>(null);
  let error = $state("");
  let loading = $state(false);

  async function open(siteId: string, linkRules: string | null = null) {
    error = "";
    loading = true;
    try {
      const s = await Sites.fetchSite(siteId);
      if (!s.rules || !s.grid.layers) throw new Error("This site file is from an older export and has no layers to stack.");
      rules = linkRules ? Sites.decodeRules(linkRules, s.rules) : null;
      site = s;
      id = siteId;
      history.replaceState(null, "", Sites.query(siteId, rules, s.rules));
      window.scrollTo(0, 0);
    } catch (err) {
      error = (err as Error).message;
    } finally {
      loading = false;
    }
  }

  function back() {
    id = null;
    site = null;
    history.replaceState(null, "", location.pathname);
  }

  onMount(() => {
    const u = Sites.fromUrl();
    if (u.id) open(u.id, u.rules);
  });
</script>

<header class="pc-head">
  <p class="pc-kicker"><a href="./">Permutation City</a> · draw a site</p>
  {#if !site}
    <h1>Draw a site anywhere</h1>
    <p class="pc-lead">Search for a place and outline the ground you want to design. Its ground, water, flooding,
      green and buildings are read from open data and stacked as layers. Then you set the rules for what can be built
      where, and breed designs inside them.</p>
  {/if}
</header>

{#if error}<p class="pc-error" role="alert">{error}</p>{/if}
{#if loading}<p class="pc-muted">loading the site ...</p>{/if}

{#if site && id}
  {#key id}<Cake {id} {site} initialRules={rules} onback={back} />{/key}
{:else}
  <Picker onbuilt={(key: string) => open(key)} />
{/if}
