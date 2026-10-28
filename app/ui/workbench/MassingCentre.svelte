<script lang="ts">
  // The Massing step's centre. Plan: the design, its massable blocks faintly outlined and the
  // chosen one in the accent; click a block to mass it. 3D: the chosen massing in its block,
  // the design's other buildings and the existing city round it, with the sun and a section;
  // camera presets, and a presentation mode that hides the rest of the workbench.
  import { Maximize2, Minimize2 } from "lucide";
  import { onDestroy } from "svelte";
  import * as E from "../../engine";
  import * as M from "../../engine/massing";
  import { inside } from "../../engine/plan/geom";
  import * as Draw from "../draw";
  import * as Mass from "../mass/massing";
  import type { Section, Viewer } from "../mass/viewer";
  import { bench } from "./bench.svelte";
  import Icon from "./Icon.svelte";
  import MapCanvas from "./MapCanvas.svelte";
  import * as Paint from "./paint";

  const m = bench.mass;
  const P = Draw.palette();
  const s = $derived(m.source!);
  const site = $derived(s.src.site);
  const plan = $derived(s.design.plan ?? null);
  const massable = $derived(new Set(m.blocks.map((b) => b.id)));

  const paint = $derived((ctx: CanvasRenderingContext2D, v: Draw.View) => {
    Paint.design(ctx, v, site, s.design, P);
    if (!plan) return;
    const ring = (r: [number, number][]) => { ctx.beginPath(); r.forEach(([x, y], k) => (k ? ctx.lineTo(v.px(x), v.py(y)) : ctx.moveTo(v.px(x), v.py(y)))); ctx.closePath(); };
    ctx.lineJoin = "round";
    for (const p of plan.plots) {
      if (p.block !== m.block || p.use !== E.BUILDING || p.levels <= 0) continue;
      ring(p.ring); ctx.fillStyle = P.t.accent; ctx.globalAlpha = 0.18; ctx.fill(); ctx.globalAlpha = 1;
      ctx.strokeStyle = P.t.accent; ctx.lineWidth = 1.5; ctx.stroke();
    }
  });
  function pickAt(x: number, y: number) {
    if (!plan || m.running) return;
    const p = plan.plots.find((q) => massable.has(q.block) && inside(q.ring, [x, y]));
    const b = p ? p.block : plan.blocks.findIndex((r, k) => massable.has(k) && inside(r, [x, y]));
    if (b >= 0 && b !== m.block) m.block = b;
  }

  // the 3D view
  let canvas = $state<HTMLCanvasElement | null>(null);
  let viewer: Viewer | null = null;
  let shown = "";
  const env = $derived(m.prepared?.E ?? null);
  const contextMesh = $derived(env ? M.contextMesh(env, s.src.G, s.design) : null);
  const existingMesh = $derived(env && m.prepared ? M.existingMesh(env, m.prepared.G) : null);
  const ground = $derived(env ? (s.design.plan ? Mass.vectorGround : Mass.groundCanvas)(env, s.src.G, s.design, P) : null);
  const section = $derived<Section>(m.sectionMode === "plan" ? { mode: "plan", height: m.sectionAt * (env?.nz ?? 1) * E.STOREY_M }
    : m.sectionMode === "cut" ? { mode: "cut", at: m.sectionAt } : { mode: "none" });
  let camera = $state<"aerial" | "street" | "plan">("aerial");

  $effect(() => {
    const k = m.chosen, c = canvas, e = env, ctxMesh = contextMesh, g = ground, sun = m.sun, sec = section;
    if (!k || !c || !e || !ctxMesh || !g || m.view !== "3d") return;
    void (async () => {
      const { Viewer } = await import("../mass/viewer");
      if (!viewer || viewer.canvas !== c) { viewer?.dispose(); viewer = new Viewer(c); shown = ""; }
      const tag = `${m.resultKey}|${k.name}`, mesh = m.meshOf(k);
      if (shown !== tag && mesh) { viewer.show({ E: e, mass: mesh, context: ctxMesh, existing: existingMesh!, ground: g, look: Mass.look(P), guessed: m.prepared ? Mass.guessedOf(e, m.prepared.G) : undefined }, shown.startsWith(`${m.resultKey}|`)); shown = tag; }
      viewer.sun(sun ? sun.dir : null);
      viewer.section(sec);
    })();
  });
  function preset(k: typeof camera) { camera = k; viewer?.preset(k); }
  onDestroy(() => { viewer?.dispose(); viewer = null; m.presenting = false; });
  // COPY: camera presets
  const CAMERAS = [["aerial", "Aerial"], ["street", "Street"], ["plan", "Plan"]] as const;
</script>

<svelte:window onkeydown={(e) => { if (e.key === "Escape" && m.presenting) m.presenting = false; }} />

{#if m.view === "3d" && m.chosen}
  <div class="wb-mass-3d">
    <canvas bind:this={canvas} aria-label="The massing in 3D: drag to turn, scroll to zoom, right-drag to pan"></canvas>
  </div>
{:else}
  {#key s}
    <MapCanvas {site} {paint} version={`${m.block}|${s.src.name}`} label="Plan of the design: click a block to mass it" onpick={pickAt} />
  {/key}
{/if}
<div class="wb-over tr wb-mass-tools">
  <div class="wb-seg" role="group" aria-label="View">
    <button type="button" aria-pressed={m.view === "plan"} onclick={() => (m.view = "plan")}>Plan</button>
    <button type="button" aria-pressed={m.view === "3d"} disabled={!m.chosen} title={m.chosen ? undefined : "Breed buildings first"} onclick={() => (m.view = "3d")}>3D</button>
  </div>
  {#if m.view === "3d" && m.chosen}
    <div class="wb-seg" role="group" aria-label="Camera">
      {#each CAMERAS as [k, label]}<button type="button" aria-pressed={camera === k} onclick={() => preset(k)}>{label}</button>{/each}
    </div>
    <button class="wb-btn" type="button" onclick={() => (m.presenting = !m.presenting)} title="Presentation (Esc to leave)">
      <Icon icon={m.presenting ? Minimize2 : Maximize2} />{m.presenting ? "Leave" : "Present"}</button>
  {/if}
</div>
{#if m.view === "3d" && m.chosen}
  <div class="wb-over br">
    <div class="wb-legend">
      <div><i style="--c: {P.t.building[2]}"></i><span>the bred massing</span></div>
      <!-- COPY: 3D legend -->
      <div><i style="--c: {P.t.building[0]}"></i><span>the design's other buildings</span></div>
      <div><i style="--c: {P.t.existingRamp[3]}"></i><span>existing buildings</span></div>
      <div><i style="--c: repeating-linear-gradient(135deg, {P.t.existingRamp[3]} 0 3px, {P.t.existingRamp[4]} 3px 5px)"></i><span>existing, height estimated</span></div>
    </div>
  </div>
{/if}
