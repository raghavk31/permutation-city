<script lang="ts">
  // Shaping open ground (engine/typology/openshape.ts; architecture-v3 section 14, step P2): each
  // family of public space as a few genes, with the limits the shape allows, the spread the
  // library's members take, and a drawing of the shape at each gene's two ends.
  import { LIBRARY } from "../../engine/typology/library";
  import { OPEN_FAMILIES } from "../../engine/typology/types";
  import { OPEN_AREA, OPEN_GENES, familySpread, measureShape, middleShape, shapeParams, type OpenGene, type ShapedFamily } from "../../engine/typology/openshape";
  import { drawTypology, fmt } from "../diagrams/typology";

  const FAMS = Object.keys(OPEN_GENES) as ShapedFamily[];
  const spread = familySpread(LIBRARY);
  const name = new Map(LIBRARY.map((p) => [p.id, p.name]));
  // the family is in the URL hash as #open-<family>, so a link opens it
  const fromHash = () => FAMS.find((f) => location.hash === `#open-${f}`);
  let family = $state<ShapedFamily>((typeof location !== "undefined" && fromHash()) || "stepped");
  const choose = (f: ShapedFamily) => { family = f; history.replaceState(null, "", `#open-${f}`); };
  const CONF = { high: "Primary source", medium: "Reliable source", low: "One source, or sources disagree", assumed: "No source yet" } as const;

  const mid = $derived(middleShape(family, spread[family]));
  const area = $derived(OPEN_AREA[family]);
  const draw = (change: Record<string, number>, wet = false) =>
    drawTypology(shapeParams(family, { ...mid, ...change }, area, wet), `${family} ${JSON.stringify(change)} ${wet}`).svg;
  const middle = $derived({ dry: draw({}), wet: draw({}, true), m: measureShape(family, mid, area) });
  // a gene that only shows when water stands is drawn on the wet day; basins are dry beds otherwise
  const onWet = (g: OpenGene) => family === "basin" || g.key === "wet" || g.key === "sunk";
  const ends = $derived(OPEN_GENES[family].map((g) => ({ g, wet: onWet(g), lo: draw({ [g.key]: g.lo }, onWet(g)), hi: draw({ [g.key]: g.hi }, onWet(g)) })));
  const val = (g: OpenGene, v: number) => g.whole ? String(Math.round(v)) : `${+v.toFixed(v < 0.1 ? 2 : v < 10 ? 2 : 0)}${g.unit ? ` ${g.unit}` : ""}`;
</script>

<section class="ty-filters" aria-label="Choose a kind of public space">
  <div class="wb-chips" role="group" aria-label="Kind of public space">
    {#each FAMS as f (f)}
      <button class="wb-chip" aria-pressed={family === f} onclick={() => choose(f)}>{OPEN_FAMILIES[f]} <span class="wb-mono">{OPEN_GENES[f].length}</span></button>
    {/each}
  </div>
</section>

<section class="ty-sec os-family">
  <h2>{OPEN_FAMILIES[family]}</h2>
  <!-- COPY: draft for the user to rewrite. -->
  <p class="ty-lead">
    Drawn at the middle of what the library's members take, on {fmt(area, 0)} m². Read from
    {spread[family].members.map((id) => name.get(id)).join(", ")}.
  </p>
  <div class="ty-days">
    <figure>{@html middle.dry}<figcaption><strong>Dry day.</strong></figcaption></figure>
    {#if family !== "canopy" && family !== "doorstep"}
      <figure>{@html middle.wet}<figcaption><strong>Wet day.</strong> Water held {fmt(middle.m.storage, 0)} m³; {fmt(middle.m.wetUse * 100, 0)}% still usable.</figcaption></figure>
    {/if}
  </div>
  <p class="ty-muted ty-small">
    Shade {fmt(middle.m.shade * 100, 0)}% of the ground (a plan share, not a sun model) · seats {fmt(middle.m.seats, 1)} m of step per 100 m²
    {#if middle.m.enclosure} · enclosure {fmt(middle.m.enclosure, 2)}{/if}. Stand-ins until the scores (step P5).
  </p>
</section>

<ul class="os-genes">
  {#each ends as { g, wet, lo, hi } (g.key)}
    <li class="os-gene">
      <div class="os-text">
        <h3>{g.name}</h3>
        <p class="wb-mono ty-small">{g.rule}</p>
        <dl class="ty-facts">
          <div><dt class="wb-label">The shape allows</dt><dd>{val(g, g.lo)} to {val(g, g.hi)}</dd></div>
          <div><dt class="wb-label">The library's members take</dt><dd>{val(g, spread[family].lo[g.key])} to {val(g, spread[family].hi[g.key])}</dd></div>
          <div><dt class="wb-label">Why</dt><dd>{g.why} <span class="wb-tag" class:is-low={g.conf === "low"} class:is-assumed={g.conf === "assumed"} title={CONF[g.conf]}>{g.conf}</span></dd></div>
        </dl>
      </div>
      <figure>{@html lo}<figcaption class="wb-mono">{val(g, g.lo)}{wet ? ", wet day" : ""}</figcaption></figure>
      <figure>{@html hi}<figcaption class="wb-mono">{val(g, g.hi)}{wet ? ", wet day" : ""}</figcaption></figure>
    </li>
  {/each}
</ul>

<style>
  .os-family h2 { margin: 0 0 var(--wb-s2); }
  .os-genes { list-style: none; margin: var(--wb-s4) 0 0; padding: 0; display: grid; gap: var(--wb-s4); }
  .os-gene { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr) minmax(0, 1fr); gap: var(--wb-s3); align-items: start; border-top: 1px solid var(--pc-line); padding-top: var(--wb-s3); }
  .os-gene h3 { margin: 0 0 var(--wb-s1); font-size: var(--pc-size-body); }
  .os-gene figure { margin: 0; display: grid; gap: var(--wb-s1); }
  .os-gene :global(svg) { width: 100%; height: auto; max-height: 220px; background: var(--pc-surface-2); border-radius: var(--pc-radius); padding: var(--wb-s2); box-sizing: border-box; }
  .os-gene figcaption { font-size: var(--pc-size-small); color: var(--pc-ink-2); text-align: center; }
  @media (max-width: 720px) { .os-gene { grid-template-columns: 1fr 1fr; } .os-text { grid-column: 1 / -1; } }
</style>
