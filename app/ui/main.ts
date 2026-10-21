// Permutation City: the page. Chapters: layers, rules, landform, one genome, evolution,
// explore, families, breeding, massing (a Svelte component, ui/mass). Data: public/sites/<site>.json from `pc export`; engine: app/engine (same as Python).
import * as Comlink from "comlink";
import * as E from "../engine";
import type { EngineWorker, EvolveResult, FamilyLead, Grown, IncrementSummary, Kept, PiecemealResult, RunRequest, SyntaxDetail } from "../engine/worker";
import * as Draw from "./draw";
import * as X from "./explore";
import { describe as describeBrief } from "./new/brief";
import * as Runs from "./runs";
import * as Sites from "./sites";
import "./style.css";
import * as Tree from "./tree";

const root = document.querySelector<HTMLElement>("[data-pc]")!;
const DATA = Sites.DATA; // where sites.json and <site>.json live
const $ = <T extends HTMLElement = HTMLElement>(sel: string) => root.querySelector<T>(sel)!;
const $$ = (sel: string) => [...root.querySelectorAll<HTMLElement>(sel)];

/** A design shown in a gallery: a family lead, a design in the pen, or a child. */
interface Item { name: string; title: string; genome: number[]; design: E.Design; size?: number; parents?: string[]; fabric?: E.Fabric }
interface PenEntry { name: string; genome: number[]; title?: string; parents?: string[] }
interface RunSummary { history: E.HistoryRow[]; everyone: number; frontSize: number; opts: RunOptions; seconds: number | null }
/** Every design a run made: how each came to be, and its genome (LENGTH numbers each). */
interface Lineage { nodes: E.LineageNode[]; genomes: Float64Array; length: number }
type RunOptions = Omit<RunRequest, "locked"> & { locked: number[] | null; typologySeeds?: number; growth?: "piecemeal"; scenario?: E.Scenario };
/** A piecemeal run: its increments, and the fabric before each (replayed from the built genomes). */
interface Piecemeal { increments: IncrementSummary[]; fabrics: E.Fabric[] }
type ExploreView = "matrix" | "parallel" | "archive";

const state = {
  sites: {} as Record<string, { name: string }>, id: null as string | null,
  site: null as E.SiteExport | null, G: null as E.Ground | null, baseG: null as E.Ground | null,
  skeletonOff: new Set<number>(),  // ridges of the street skeleton switched off (the landform chapter)
  worker: null as { raw: Worker; api: Comlink.Remote<EngineWorker> } | null,
  genome: [] as number[], run: null as RunSummary | null, lineage: null as Lineage | null, piecemeal: null as Piecemeal | null,
  families: [] as Item[], selected: null as Item | null,
  pen: [] as PenEntry[], children: [] as PenEntry[], brood: 0, locks: null as Int8Array | null, lockNote: [] as string[],
  bearing: -0.55, layer: "ground" as LayerKey, showAll: false,
  // A confirmed brief from the link: how genes are read, and whether to seed by typology.
  brief: null as Sites.LinkedBrief | null, ranges: E.DEFAULT_RANGES as E.Ranges, linkRules: null as string | null,
  // What the last run kept, for Explore; designs regrown as they're drawn.
  // Space syntax arrives from the worker: the kept designs' readouts after a run, one at a time
  // (`token` stops an old loop), and the opened design's segments.
  syntax: { token: 0, read: 0, detail: null as (SyntaxDetail & { name: string }) | null, measure: "nain_rn", choice: null as { nach: Float64Array; mean: number; choice: number } | null },
  explore: { kept: [] as Kept[], archive: null as E.ArchiveInfo | null, view: "matrix" as ExploreView, measures: "scores",
    selected: -1, hover: -1, grown: new Map<number, E.Design>(), hit: null as ((x: number, y: number) => number) | null },
  // The family tree: its layout (made again when the run or "show every design" changes).
  tree: { all: false, layout: null as Tree.TreeLayout | null, of: null as Lineage | null, hover: -1, selected: -1,
    hit: null as ((x: number, y: number) => number) | null },
};
let P = Draw.palette();
const rng = E.makeRng(Date.now() % 2 ** 31);
const site = () => state.site!;
const G = () => state.G!;

// --- helpers --------------------------------------------------------------------------

const fmtHa = (v: number) => `${Math.round(v).toLocaleString("en-IN")} ha`;
const pct = (v: number) => `${Math.round(v * 100)}%`;
function scoreLine(d: E.Design) {
  const s = d.scores!, st = E.stats(d, G());
  const gross = (d.grossFloorArea ?? 0) / 1e4;
  const streets = gross > 0 ? ` <span class="pc-muted" title="floor area as if streets took nothing: ${fmtHa(gross)}">`
    + `(streets take ${pct(1 - st.floor_area_ha / gross)} of ${fmtHa(gross)} gross)</span>` : "";
  return `<b>${fmtHa(st.floor_area_ha)}</b> net${streets} · ${st.mean_levels.toFixed(1)} storeys avg`
    + `${d.preStreet ? ` · <span class="pc-tag" title="a 47-number genome from before streets: grown with the default street genes">pre-street genome</span>` : ""}<br>`
    + `storage ${pct(s.storage)} · +${s.heat.toFixed(1)}°C · ${Math.round(s.carbon)} kg/m²<br>`
    + `daylight ${pct(s.daylight)} · human scale ${pct(s.human)}`;
}
function grown(genome: number[]) {
  const d = E.grow(genome, G(), state.locks, state.ranges);
  E.evaluate(d, G());
  return d;
}
/** A design's streets for drawing: centrelines, smoothed (metrics use the true edges). */
const streetCache = new WeakMap<E.Design, Draw.StreetLines | null>();
function roadsOf(d: E.Design): Draw.StreetLines | null {
  if (!streetCache.has(d)) {
    streetCache.set(d, d.street && d.streetWidths ? { lines: E.centrelines(G(), d.street), widths: d.streetWidths } : null);
  }
  return streetCache.get(d)!;
}
const aspect = () => Draw.aspectOf(site().design.x, site().design.y);
const gridAspect = () => Draw.aspectOf(site().grid.x, site().grid.y);
const form = (sel: string) => $<HTMLFormElement>(sel);
const input = (f: HTMLFormElement, name: string) => f.elements.namedItem(name) as HTMLInputElement;
const select = (f: HTMLFormElement, name: string) => f.elements.namedItem(name) as HTMLSelectElement;

// --- site -----------------------------------------------------------------------------

async function loadSites() {
  state.sites = await (await fetch(`${DATA}sites.json`)).json();
  // A site from a link (?site=<id or layer-service key>&rules=...): shown first, with its rules.
  const u = Sites.fromUrl();
  const linked = u.id ? { id: u.id, rules: u.rules, brief: u.brief } : null;
  if (linked && !state.sites[linked.id]) state.sites = { [linked.id]: { name: "Your site" }, ...state.sites };
  const bar = $(".pc-sites");
  bar.innerHTML = Object.entries(state.sites)
    .map(([id, s]) => `<button type="button" data-site="${id}">${s.name}</button>`).join("");
  bar.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("[data-site]");
    if (!b) return;
    // A link's run and rules belong to its site: picking another leaves them behind.
    history.replaceState(null, "", `?site=${b.dataset.site}${location.hash}`);
    loadSite(b.dataset.site!);
  });
  await loadSite(linked ? linked.id : Object.keys(state.sites)[0], linked?.rules ?? null, linked?.brief ?? null);
  if (linked && location.hash) document.querySelector(location.hash)?.scrollIntoView();
  if (linked && state.id === linked.id) await runFromLink();
}

function startWorker(s: E.SiteExport) {
  state.worker?.raw.terminate();
  const raw = new Worker(new URL("../engine/worker.ts", import.meta.url), { type: "module" });
  const api = Comlink.wrap<EngineWorker>(raw);
  api.setSite(s, [...state.skeletonOff]);
  state.worker = { raw, api };
}

async function loadSite(id: string, rules: string | null = null, brief: string | null = null) {
  $$(".pc-sites button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.site === id)));
  $(".pc-status").textContent = "loading the site ...";
  try {
    let s = await Sites.fetchSite(id);
    const own = s.rules;
    const base = rules && own ? Sites.decodeRules(rules, own) : own;
    state.brief = null;
    state.ranges = E.DEFAULT_RANGES;
    if (brief && base) {
      const linked = Sites.decodeBrief(brief);
      const checked = Sites.recheck(linked.brief, base).brief;
      const under = Sites.withBrief(s, base, checked);
      s = under.site;
      state.brief = { brief: checked, seeds: linked.seeds && !!checked.typology_priors };
      state.ranges = under.config.ranges;
    } else if (rules && base) s = Sites.withRules(s, base).site;
    state.site = s;
    state.linkRules = rules;
  } catch (err) {
    $(".pc-status").textContent = (err as Error).message;
    return;
  }
  state.id = id;
  const btn = root.querySelector<HTMLElement>(`.pc-sites [data-site="${id}"]`);
  if (btn && state.sites[id]?.name === "Your site") btn.textContent = site().meta.name;
  state.baseG = E.prepare(site());
  state.G = state.baseG;
  state.skeletonOff = new Set();
  Object.assign(state, { run: null, lineage: null, piecemeal: null, families: [], selected: null, pen: [], children: [], locks: null, lockNote: [] });
  massing?.closeMassing();
  resetExplore([], null);
  startWorker(site());
  const m = site().meta;
  $(".pc-status").textContent = `${m.name} · design ground ${fmtHa(m.design_ha)} · brief ${fmtHa(m.target_ha)} of floor area (±10%) · `
    + `design storm ${m.design_storm_mm} mm · ${E.gridLabel(E.gridOf(m))}`;
  const grid = E.gridOf(m);
  $(".pc-grid-note").textContent = grid.type === "hex" && grid.size === 20
    ? "a 20 m hex (centre to corner), the unit of the studio this grew from"
    : `a ${grid.size} m ${grid.type === "hex" ? "hex (centre to corner)" : "square"}, ${Math.round(m.cell_area).toLocaleString("en-IN")} m²`;
  $(".pc-credits").textContent = `Data: ${m.credits.join(" · ")}.`;
  const warnings = [...(m.service?.warnings ?? [])];
  if (m.landform?.relief.rebuild) {
    warnings.push("This site's terrain is the Copernicus surface model, which includes buildings and trees: unsuitable for "
      + "hydrology in a city. Landform is treated as flat (low confidence); rebuild the site once FABDEM is back.");
  }
  $(".pc-site-warning").hidden = !warnings.length;
  $(".pc-site-warning").textContent = warnings.join(" ");
  drawBriefLine();
  state.genome = E.randomGenome(rng);
  drawAll();
}

function drawBriefLine() {
  const line = $(".pc-brief-line"), b = state.brief;
  line.hidden = !b;
  if (!b) return;
  const parts = describeBrief(b.brief);
  const q = new URLSearchParams({ site: state.id!, ...(state.linkRules ? { rules: state.linkRules } : {}), brief: Sites.encodeBrief(b) });
  const edit = `new.html?${q}#brief`;
  line.innerHTML = `<b>Brief</b>: ${parts.length ? parts.join(" · ") : "no values set"}`
    + `${b.seeds ? " · starts from typology seeds" : ""} · <a href="${edit}">edit the brief</a>`;
}

function drawAll() {
  P = Draw.palette();
  drawLayer();
  drawRules();
  drawLandform();
  drawGenome();
  drawEvolve();
  drawTree();
  drawExplore();
  drawFamilies();
  drawBreed();
}

// --- 01 layers ------------------------------------------------------------------------

type Grid = E.SiteExport["grid"];
interface LayerDef {
  label: string; note: string; unit: (v: number) => string;
  value: (g: Grid, i: number) => number; range: (g: Grid) => [number, number];
}
const LAYERS = {
  ground: { label: "ground", note: "bare-earth height above sea level (FABDEM)", unit: (v) => `${v.toFixed(1)} m`,
    value: (g, i) => g.ground[i], range: (g) => quantiles(g.ground.filter((_, i) => !g.water[i]), 0.02, 0.98) },
  flood: { label: "sea flooding", note: "depth in a 2050 monsoon surge (spring tide + surge + 0.3 m sea-level rise)",
    unit: (v) => `${v.toFixed(1)} m`, value: (g, i) => g.flood[i], range: () => [0, 3] },
  pool: { label: "rain", note: "rainwater pooling in hollows", unit: (v) => `${v.toFixed(2)} m`,
    value: (g, i) => g.pool[i], range: () => [0, 1] },
  green: { label: "green", note: "trees and other vegetation (ESA WorldCover)", unit: pct,
    value: (g, i) => g.green[i], range: () => [0, 1] },
  built: { label: "buildings", note: "footprint cover (Google Open Buildings + OSM, via Overture)", unit: pct,
    value: (g, i) => g.built[i], range: () => [0, 1] },
  industrial: { label: "industry", note: "industrial and rail land: a stand-in for contaminated ground", unit: (v) => (v ? "yes" : "no"),
    value: (g, i) => g.industrial[i], range: () => [0, 1] },
  lst: { label: "surface heat", note: "hot-season land surface temperature (Landsat 8/9): surface, not air; about 100 m native",
    unit: (v) => (Number.isFinite(v) ? `${v.toFixed(1)} °C` : "none"), value: (g, i) => col(g, "lst", i),
    range: (g) => quantiles(layerValues(g, "lst"), 0.02, 0.98) },
  flow: { label: "flow", note: "area draining through each cell, on the conditioned ground (log scale)",
    unit: (v) => `${v < 10 ? v.toFixed(1) : Math.round(v)} ha`, value: (g, i) => col(g, "flow_acc_ha", i), range: () => [0.1, 100] },
  valleys: { label: "valleys", note: "drainage lines and mapped streams, darker by stream order; pale: their buffer (provisional)",
    unit: (v) => (v > 0 ? `order ${v}` : "none"), value: (g, i) => col(g, "valley_order", i), range: () => [0, 4] },
  catchments: { label: "catchments", note: "where each cell's water goes: the valley segment or outlet it drains to",
    unit: (v) => (v >= 0 ? `#${v}` : "none"), value: (g, i) => col(g, "catchment_id", i), range: () => [0, 1] },
  ridges: { label: "ridges", note: "divides between catchments; darker divides more land (the smaller side, ha)",
    unit: (v) => (v > 0 ? `${v.toFixed(1)} ha` : "none"), value: (g, i) => col(g, "ridge", i), range: () => [0, 30] },
} satisfies Record<string, LayerDef>;
/** A layer column from the site's full layer table (format 2 and later); NaN where missing. */
function col(g: Grid, name: string, i: number): number {
  const v = g.layers?.[name]?.[i];
  return v === null || v === undefined ? NaN : v;
}
const layerValues = (g: Grid, name: string) => (g.layers?.[name] ?? []).filter((v): v is number => v !== null && Number.isFinite(v));
const LAYER_COLUMN: Partial<Record<string, string>> = { lst: "lst", flow: "flow_acc_ha", valleys: "valley_order", catchments: "catchment_id", ridges: "ridge" };
type LayerKey = keyof typeof LAYERS;

function quantiles(a: number[], q0: number, q1: number): [number, number] {
  const s = [...a].sort((x, y) => x - y);
  return [s[Math.floor(q0 * (s.length - 1))], s[Math.floor(q1 * (s.length - 1))]];
}

function drawLayer() {
  const g = site().grid;
  let L: LayerDef = LAYERS[state.layer];
  const hasSea = Object.keys(site().meta.sea_levels || {}).length > 0;
  const missing = (k: string) => !!LAYER_COLUMN[k] && !g.layers?.[LAYER_COLUMN[k]!];
  if (missing(state.layer)) state.layer = "ground";
  $$(".pc-layer-tabs button").forEach((b) => {
    b.setAttribute("aria-pressed", String(b.dataset.layer === state.layer));
    b.hidden = (b.dataset.layer === "flood" && !hasSea) || missing(b.dataset.layer!);
  });
  L = LAYERS[state.layer];
  const [lo, hi] = L.range(g);
  const colourOf = (i: number) => {
    if (g.water[i]) return P.sea;
    const v = L.value(g, i);
    if (state.layer === "industrial") return v ? P.blues[3] : P.retained;
    if (state.layer === "flood" && v <= 0) return P.retained;
    if (!Number.isFinite(v)) return P.retained;
    if (state.layer === "lst") return Draw.ramp(P.oranges, (v - lo) / (hi - lo || 1));
    if (state.layer === "flow") return Draw.ramp(P.blues, Math.log10(Math.max(v, 0.1) / 0.1) / 3);
    if (state.layer === "valleys") return v > 0 ? P.blues[Math.min(v, 4)] : col(g, "valley_buffer", i) ? P.blues[0] : P.retained;
    if (state.layer === "catchments") return v < 0 ? P.retained : CATCHMENT_COLOURS[v % CATCHMENT_COLOURS.length];
    if (state.layer === "ridges") return v > 0 ? Draw.ramp(P.oranges, Math.min(v / hi, 1)) : P.retained;
    return Draw.ramp(P.blues, (v - lo) / (hi - lo || 1));
  };
  const canvas = $<HTMLCanvasElement>(".pc-layer canvas");
  const v = Draw.layer(canvas, site(), colourOf, P, { aspect: gridAspect(), labels: true });
  const plain = ["industrial", "catchments", "valleys"].includes(state.layer);
  $(".pc-layer .pc-note").textContent = `${L.note}${plain ? "" : ` · ${L.unit(lo)} to ${L.unit(hi)}`}`;
  $(".pc-relief").innerHTML = reliefLine();
  canvas.onpointermove = (e) => {
    const i = Draw.cellAt(v, g.x, g.y, e.offsetX, e.offsetY, Draw.shapeOf(site()).r);
    $(".pc-layer .pc-readout").textContent = i < 0 ? "" : g.water[i] ? "water"
      : (Object.entries(LAYERS) as [LayerKey, LayerDef][]).filter(([k]) => k !== "flood" || hasSea)
        .map(([, l]) => `${l.label} ${l.unit(l.value(g, i))}`).join(" · ");
  };
}

const CATCHMENT_COLOURS = ["#cde2fb", "#d8ead0", "#f6dcc8", "#e4d8f0", "#f3ecc2", "#cfe9e6", "#f0d0d8", "#dcdcdc"];

/** What the landform reading says about this site, and how sure it is. */
function reliefLine(): string {
  const lf = site().meta.landform, lst = site().meta.lst;
  if (!lf) return "";
  const r = lf.relief, src = r.source === "fabdem" ? "FABDEM bare earth" : "the Copernicus surface model (includes buildings)";
  const parts = [`<b>Landform: ${r.class}</b> (${r.confidence} confidence): ${r.relief_m} m of relief, median slope `
    + `${((r.median_slope ?? 0) * 100).toFixed(2)}%, from ${src}`];
  parts.push(lf.valley_cells ? `${lf.valley_cells} valley cells, up to order ${lf.max_order}${lf.mapped_channel_cells ? `, ${lf.mapped_channel_cells} on mapped streams and drains` : ""}`
    : r.class === "flat" ? "flat: valleys come only from mapped water, and none is mapped here" : "no valleys");
  if (r.rebuild) parts.push(`<span class="pc-warn">surface model: flat by rule; rebuild once FABDEM is back</span>`);
  if (lst) {
    const months = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    parts.push(`surface heat: median of ${lst.scenes.length} clear Landsat scenes, ${months[lst.months[0]]} to `
      + `${months[lst.months[1]]} ${lst.years[0]} to ${lst.years[1]} (${lst.scenes[0]?.date} to ${lst.scenes[lst.scenes.length - 1]?.date})`);
  }
  return parts.join(" · ");
}

// --- 02 rules -------------------------------------------------------------------------

const STATE_NAMES = ["forbidden", "retained", "constrained", "open"] as const;
function drawRules() {
  const g = site().grid, cols = [P.water, P.retained, P.build, P.green];
  const canvas = $<HTMLCanvasElement>(".pc-rules canvas");
  const v = Draw.layer(canvas, site(), (i) => (g.water[i] ? P.sea : cols[g.state[i]]), P, { aspect: gridAspect() });
  const area = site().meta.cell_area / 1e4;
  const ha = [0, 0, 0, 0];
  g.state.forEach((s, i) => { if (!g.water[i]) ha[s] += area; });
  const notes = { forbidden: "never built on", retained: "kept as context", constrained: "buildable with limits", open: "the genes decide" };
  $(".pc-rules .pc-legend").innerHTML = [0, 2, 3, 1].map((s) => `<span><i style="background:${cols[s]}"></i>`
    + `${STATE_NAMES[s]}: ${notes[STATE_NAMES[s]]} · ${fmtHa(ha[s])}</span>`).join("");
  canvas.onpointermove = (e) => {
    const i = Draw.cellAt(v, g.x, g.y, e.offsetX, e.offsetY, Draw.shapeOf(site()).r);
    $(".pc-rules .pc-readout").textContent = i < 0 ? "" : g.water[i] ? "water"
      : `${STATE_NAMES[g.state[i]]}${g.reasons[i] ? `: ${g.reasons[i]}` : ""}`;
  };
}

// --- 03 landform ----------------------------------------------------------------------

/** The skeleton's sides as lines for drawing (smoothed), by class. */
function skeletonLines(): Draw.StreetLines | null {
  const sk = G().skeleton;
  if (!sk) return null;
  const cls = new Int8Array(E.sides(G()).cell.length);
  sk.sides.forEach((s, k) => { cls[s] = sk.level[k]; });
  return { lines: E.centrelines(G(), cls), widths: [0, 6, 12, 18] };
}

function drawLandform() {
  const g = site().grid, sec = $(".pc-landform"), sk = G().skeleton;
  sec.hidden = !site().meta.landform;
  if (sec.hidden) return;
  const design = (i: number) => !g.water[i] && (g.state[i] === 2 || g.state[i] === 3);
  const colourOf = (i: number) => {
    if (g.water[i]) return P.sea;
    const o = col(g, "valley_order", i);
    if (o > 0) return P.blues[Math.min(o + 1, 4)];
    if (col(g, "valley_buffer", i)) return P.blues[0];
    return design(i) ? P.paper : P.retained;
  };
  const canvas = $<HTMLCanvasElement>(".pc-landform canvas");
  const v = Draw.layer(canvas, site(), colourOf, P, { aspect: gridAspect() });
  const ctx = canvas.getContext("2d")!;
  const lines = skeletonLines();
  if (lines) {
    // The skeleton in ink, at its widths, so it reads as the frame the designs grow in.
    ctx.save(); ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = P.ink;
    for (const l of lines.lines) {
      ctx.beginPath();
      l.points.forEach(([x, y], k) => (k ? ctx.lineTo(v.px(x), v.py(y)) : ctx.moveTo(v.px(x), v.py(y))));
      ctx.lineWidth = Math.max(lines.widths[l.cls] * v.s * 0.6, 1.2);
      ctx.stroke();
    }
    ctx.restore();
  }
  // Valley crossings: rings at the middle of each crossing side.
  const sd = E.sides(G()), cross = site().skeleton?.crossings ?? [];
  ctx.save(); ctx.strokeStyle = P.build; ctx.lineWidth = 2;
  for (const [i, a] of cross) {
    const s = i < G().n ? sd.at[i * G().deg + a] : -1;
    if (s < 0) continue;
    const x = (sd.vx[sd.v0[s]] + sd.vx[sd.v1[s]]) / 2, y = (sd.vy[sd.v0[s]] + sd.vy[sd.v1[s]]) / 2;
    ctx.beginPath(); ctx.arc(v.px(x), v.py(y), 5, 0, 2 * Math.PI); ctx.stroke();
  }
  ctx.restore();
  const lf = site().meta.landform!;
  $(".pc-landform-legend").innerHTML = [
    [P.blues[3], "valley (darker: higher stream order)"], [P.blues[0], "valley buffer (provisional)"],
    [P.ink, "primary streets: the skeleton"], [P.paper, "design ground"],
  ].map(([c, t]) => `<span><i style="background:${c}"></i>${t}</span>`).join("")
    + (cross.length ? `<span><i style="border:2px solid ${P.build};border-radius:50%"></i>valley crossing</span>` : "");
  const notes: string[] = [];
  if (sk) {
    notes.push(`<b>${sk.note[0].toUpperCase()}${sk.note.slice(1)}.</b>`);
    if (sk.source === "landform") {
      notes.push(`${sk.ridges.length - state.skeletonOff.size} of ${sk.ridges.length} strong ridges in use`
        + ` (${lf.ridge_min_ha} ha or more on the smaller side).`);
      notes.push(`Valley crossings: ${sk.crossings} of the ${sk.crossingCap} allowed${sk.crossings > sk.crossingCap ? " (over the cap)" : ""}.`);
    }
    notes.push(sk.connected ? "Joined to the existing roads." : `<span class="pc-warn">Not joined to the existing roads: the network is invalid.</span>`);
  } else notes.push("No street skeleton: this site was exported before landform (format 4).");
  if (lf.buffers_provisional) notes.push("Valley buffers (0, 20 and 40 m each side by stream order) are provisional until checked against the DCPR and CGDCR nallah margins.");
  if (lf.relief.rebuild) notes.push(`<span class="pc-warn">Terrain from the Copernicus surface model: unsuitable for urban hydrology; flat by rule until FABDEM is back.</span>`);
  $(".pc-landform-note").innerHTML = notes.join(" ");
  const box = $(".pc-ridges");
  const open = (box.querySelector("details") as HTMLDetailsElement | null)?.open ?? false;
  box.innerHTML = sk?.source === "landform" && site().skeleton ? `<details${open ? " open" : ""}><summary>Switch ridges off `
    + `(${state.skeletonOff.size} off)</summary><p class="pc-muted">A ridge switched off takes its street out of the skeleton; runs start again.</p>`
    + `<div class="pc-ridge-list">` + site().skeleton!.ridges.map((r) => `<label class="pc-check"><input type="checkbox" data-ridge="${r.id}" `
      + `${state.skeletonOff.has(r.id) ? "" : "checked"}> ridge ${r.id}: ${r.strength_ha.toFixed(1)} ha, ${Math.round(r.consistency * 100)}% on headwater</label>`).join("")
    + "</div></details>" : "";
}

/** Switch ridges of the skeleton on or off: the ground changes, so runs start again. */
function setSkeleton(off: Set<number>) {
  state.skeletonOff = off;
  state.G = off.size ? E.withSkeleton(site(), state.baseG!, off) : state.baseG!;
  Object.assign(state, { run: null, lineage: null, piecemeal: null, families: [], selected: null, children: [] });
  resetExplore([], null);
  startWorker(site());
  drawAll();
}

// --- 04 one genome --------------------------------------------------------------------

function drawGenome() {
  const d = grown(state.genome);
  Draw.plan($<HTMLCanvasElement>(".pc-genome canvas"), site(), d, P, { aspect: aspect(), attractors: true, roads: roadsOf(d) });
  const s = d.settings;
  const orient = s.street_orientation < 1 / 3 ? "along the contours" : s.street_orientation < 2 / 3 ? "along the valleys"
    : `on a bearing of ${Math.round((s.street_orientation * 3 - 2) * 180)}°`;
  const pattern = ["a grid", "loops", "branching, with dead ends"][Math.min(Math.floor(s.street_pattern * 3), 2)];
  $(".pc-genome .pc-scores").innerHTML = scoreLine(d)
    + `<br><span class="pc-muted">water ${pct(s.water_share)} · green ${pct(s.green_share)} · follows the site's water ${pct(s.follow_water)} · `
    + `coverage ${pct(s.coverage)}<br>streets every ${Math.round(s.street_spacing)} m, ${orient}, as ${pattern}; `
    + `secondary ${d.streetWidths![2].toFixed(1)} m, lanes ${d.streetWidths![1].toFixed(1)} m wide</span>`;
  // The 51 numbers, as a strip: attractor slots in 8 groups of 5, the 7 site-wide genes, then the 4 street genes.
  $(".pc-genes").innerHTML = state.genome.map((gv, k) => {
    const slot = k < 40 ? Math.floor(k / 5) : -1;
    const kind = slot >= 0 ? d.attractors[slot].kind : k >= E.PRE_STREET_LENGTH ? "street" : "site";
    return `<i title="${k < 40 ? `attractor ${slot + 1} (${kind}): ${["x", "y", "reach", "weight", "kind"][k % 5]}` : E.GLOBAL_GENES[k - 40]} = ${gv.toFixed(2)}" `
      + `class="g-${kind}" style="--v:${gv}"></i>`;
  }).join("");
}

// --- 05 evolution ---------------------------------------------------------------------

/** The run the form describes. `seed`: a link's, else a new one. */
function evolveOptions(seed = Math.floor(rng.random() * 1e9)): RunOptions {
  const f = form(".pc-evolve form");
  const gens = +select(f, "gens").value;
  const shock: [number, number] | null = input(f, "shock").checked
    ? [Math.min(+input(f, "shockAt").value, gens), +input(f, "shockX").value] : null;
  const pop = +select(f, "pop").value;
  if (select(f, "growth").value === "piecemeal") {
    return { search: "nsga3", objectives: [], generations: gens, pop, seed, shock: null, locked: null, start: null, ranges: state.ranges,
      growth: "piecemeal", scenario: select(f, "scenario").value as E.Scenario };
  }
  const pen = input(f, "fromPen").checked ? state.pen.map((p) => p.genome) : [];
  const priors = state.brief?.seeds ? state.brief.brief.typology_priors?.value ?? [] : [];
  // Typology seeds fill up to half of Generation 0 (after any designs from the pen).
  const seeds = E.typologySeeds(priors, Math.max(0, Math.floor(pop / 2) - pen.length), seed + 1);
  const start = [...pen, ...seeds];
  const search = select(f, "search").value as RunOptions["search"];
  const objectives = search === "map-elites" ? []
    : [...new Set([select(f, "promote1").value, select(f, "promote2").value].filter(Boolean))] as E.MetricKey[];
  const elite = search === "map-elites" ? {
    axes: [select(f, "ax").value, select(f, "ay").value] as [string, string], bins: +select(f, "bins").value,
    weights: state.brief?.brief.objective_weights?.value ?? null,
  } : {};
  return {
    search, objectives, generations: gens, pop, seed, shock, locked: state.locks ? Array.from(state.locks) : null,
    start: start.length ? start : null, ranges: state.ranges, typologySeeds: seeds.length, ...elite,
  };
}

/** The form set to a run's settings (from a link or a file). A value the form doesn't offer
 *  (a population of 45, say) is added to it. */
function applySettings(s: Runs.RunSettings, fromPen = false) {
  const f = form(".pc-evolve form");
  const pick = (name: string, v: string) => {
    const el = select(f, name);
    if (![...el.options].some((o) => o.value === v)) el.add(new Option(v, v));
    el.value = v;
  };
  pick("search", s.search);
  select(f, "search").dispatchEvent(new Event("change"));
  pick("gens", String(s.gens));
  pick("pop", String(s.pop));
  select(f, "promote1").value = s.objectives[0] ?? "";
  select(f, "promote2").value = s.objectives[1] ?? "";
  if (s.axes) { select(f, "ax").value = s.axes[0]; select(f, "ay").value = s.axes[1]; }
  if (s.bins) pick("bins", String(s.bins));
  input(f, "shock").checked = !!s.shock;
  $(".pc-shock-opts").hidden = !s.shock;
  if (s.shock) { input(f, "shockAt").value = String(s.shock[0]); input(f, "shockX").value = String(s.shock[1]); }
  input(f, "fromPen").checked = fromPen && state.pen.length > 0;
  select(f, "growth").value = s.growth ?? "oneshot";
  if (s.scenario) select(f, "scenario").value = s.scenario;
  select(f, "growth").dispatchEvent(new Event("change"));
}

/** The settings a run was made with (what a link carries). */
function settingsOf(o: RunOptions): Runs.RunSettings {
  return {
    search: (o.search ?? "auto") as Runs.SearchSetting, gens: o.generations ?? 30, pop: o.pop ?? 60, seed: o.seed ?? 1,
    objectives: (o.objectives ?? []) as string[], axes: o.axes ?? null, bins: o.bins ?? null, shock: o.shock ?? null,
    ...(o.growth === "piecemeal" ? { growth: "piecemeal" as const, scenario: o.scenario ?? "ssp245" } : {}),
  };
}

/** The page's link for a run: site, rules and brief, then the run's settings. */
function runQuery(o: RunOptions): URLSearchParams {
  const q = new URLSearchParams({ site: state.id! });
  if (state.linkRules) q.set("rules", state.linkRules);
  if (state.brief) q.set("brief", Sites.encodeBrief(state.brief));
  const fromPen = (o.start?.length ?? 0) - (o.typologySeeds ?? 0);
  return Runs.writeLink(q, {
    settings: settingsOf(o), off: [...state.skeletonOff].sort((a, b) => a - b), locks: o.locked ? Int8Array.from(o.locked) : null,
    pen: Math.max(0, fromPen), genomeVersion: E.GENOME_VERSION, build: Runs.BUILD,
  });
}

/** One line on what a run did. */
function runLine(opts: RunOptions, m: { everyone: number; frontSize: number; kept: Kept[]; archive: E.ArchiveInfo | null },
  seconds: number | null, prefix = ""): string {
  if (opts.growth === "piecemeal") {
    return `${prefix}Piecemeal growth (${opts.scenario === "ssp585" ? "SSP5-8.5" : "SSP2-4.5"}): ${E.YEARS.join(", ")}, NSGA-III, `
      + `${m.everyone.toLocaleString("en-IN")} designs grown${seconds !== null ? ` in ${seconds.toFixed(0)} s` : ""} · `
      + `the 2050 increment has ${m.frontSize} on its front, in ${state.families.length} families`;
  }
  const w = state.brief?.brief.objective_weights?.value;
  const filled = m.archive ? ` · ${m.kept.length} of ${m.archive.bins ** 2} archive cells filled` : "";
  const ran = E.searchOf(opts), promoted = opts.objectives?.length
    ? ` · ${opts.objectives.map((k) => (E.METRICS[k] as E.Metric).label).join(" and ")} promoted, ${5 + opts.objectives.length} objectives` : "";
  return `${prefix}${SEARCH_NAMES[ran]}${promoted} · ${m.everyone.toLocaleString("en-IN")} designs grown`
    + `${seconds !== null ? ` in ${seconds.toFixed(1)} s` : ""}${filled} · `
    + `${m.frontSize} on the front, in ${state.families.length} families`
    + (opts.typologySeeds ? ` · Generation 0 had ${opts.typologySeeds} typology seeds` : "")
    + (w ? ` · ${m.archive ? "elites judged and " : ""}families ordered by the brief's weights` : "");
}

async function runEvolution(seed?: number, note = "") {
  const opts = evolveOptions(seed);
  const btn = $<HTMLButtonElement>(".pc-evolve button[type=submit]");
  btn.disabled = true;
  const rows: E.HistoryRow[] = [];
  const t0 = performance.now();
  const onProgress = (gen: number, row: E.HistoryRow) => {
    rows.push(row);
    $(".pc-progress").textContent = `generation ${gen} of ${opts.generations}`;
    drawCharts(rows, opts);
  };
  let step = -1;
  const onIncrement = (k: number, gen: number, row: E.HistoryRow) => {
    if (k !== step) { step = k; rows.length = 0; }
    rows.push(row);
    $(".pc-progress").textContent = `the ${E.YEARS[k]} increment: generation ${gen} of ${opts.generations}`;
    drawCharts(rows, opts);
  };
  let m: EvolveResult | PiecemealResult;
  try {
    if (opts.growth === "piecemeal") {
      m = await state.worker!.api.piecemeal({ generations: opts.generations ?? 15, pop: opts.pop ?? 40, seed: opts.seed ?? 1,
        scenario: opts.scenario ?? "ssp245", ranges: opts.ranges ?? E.DEFAULT_RANGES }, Comlink.proxy(onIncrement));
    } else {
      const { typologySeeds: _, growth: _g, scenario: _s, ...engineOpts } = opts;
      m = await state.worker!.api.evolve(engineOpts, Comlink.proxy(onProgress));
    }
  } catch (err) {
    $(".pc-progress").textContent = `The run failed: ${(err as Error).message}`;
    btn.disabled = false;
    return;
  }
  btn.disabled = false;
  const secs = (performance.now() - t0) / 1000;
  state.run = { history: m.history, everyone: m.everyone, frontSize: m.frontSize, opts, seconds: secs };
  state.lineage = { nodes: m.lineage, genomes: m.genomes, length: E.LENGTH };
  state.piecemeal = "increments" in m ? piecemealOf(m.increments, opts) : null;
  state.families = m.families.map((f: FamilyLead) => ({ ...f, title: f.name, design: runGrown(f.genome), fabric: lastFabric() }));
  const w = state.brief?.brief.objective_weights?.value;
  if (w && Object.values(w).some((x) => x > 0)) {
    const higher = Object.fromEntries(E.SCORE_KEYS.map((k) => [k, E.SCORES[k][2]])) as Record<E.ScoreKey, boolean>;
    const order = E.weightedOrder(state.families.map((f) => f.design.scores!), w, higher);
    state.families = order.map((k) => state.families[k]);
  }
  state.selected = state.families[0] || null;
  state.showAll = false;
  resetExplore(m.kept, m.archive);
  $(".pc-progress").textContent = runLine(opts, m, secs) + (note ? ` · ${note}` : "");
  // The address now names this run, so it can be shared or opened again.
  history.replaceState(null, "", `?${runQuery(opts)}${location.hash}`);
  drawSaveBar();
  drawGrowth();
  drawTree();
  drawExplore();
  drawFamilies();
  readSyntax();
}

// --- piecemeal growth (engine/piecemeal.ts) ---------------------------------------------

function piecemealOf(increments: IncrementSummary[], opts: RunOptions): Piecemeal {
  return { increments, fabrics: E.replayFabric(G(), increments.map((x) => x.chosen.genome), E.SHARES, opts.ranges ?? E.DEFAULT_RANGES) };
}

/** The fabric a piecemeal run's last increment grew around (undefined for a plain run). */
const lastFabric = () => (state.piecemeal ? state.piecemeal.fabrics[state.piecemeal.fabrics.length - 2] : undefined);

/** A design of the run, grown as the run grew it. A piecemeal design grows around the fabric
 *  before the last increment and is scored as that increment was, under 2050's conditions. */
function runGrown(genome: number[]): E.Design {
  const f = lastFabric(), o = state.run?.opts;
  if (!f || !o) return grown(genome);
  const d = E.growLast(genome, G(), f, o.ranges ?? E.DEFAULT_RANGES);
  E.evaluate(d, G());
  const S = shockSiteOf(), c = E.conditionsFor(site().meta, E.YEARS[E.YEARS.length - 1], o.scenario ?? "ssp245");
  E.scoreUnder(d, G(), S, c, E.floorAreaTarget(G()), c.sea !== null && S.coastal ? E.seaDepth(S, c.sea) : null);
  return d;
}

function drawGrowth() {
  const box = $(".pc-growth"), pm = state.piecemeal;
  box.hidden = !pm;
  if (!pm) return;
  const o = state.run!.opts, steps = $(".pc-growth-steps");
  steps.innerHTML = pm.increments.map((x, k) => {
    const c = x.conditions, pen = x.penalty > 0.0005 ? `<b>penalty ${x.penalty.toFixed(3)}</b>` : "no penalty";
    return `<figure class="pc-card"><canvas></canvas><figcaption><b>${x.year}</b>${x.chosen.name} built ${x.chosen.built} cells,`
      + ` the fabric to ${pct(x.share)} of the brief<br>`
      + `<span class="pc-muted">${c.sea !== null ? `surge +${c.sea} m · ` : ""}storm ${c.storm} mm · hot season +${c.heat.toFixed(2)}°C`
      + ` (${c.scenario === "ssp585" ? "SSP5-8.5" : "SSP2-4.5"}, ${c.warming.toFixed(2)}°C of warming since 2025)</span><br>`
      + `wholeness ${x.wholeness.before.toFixed(3)} → ${x.wholeness.after.toFixed(3)} · ${pen}<br>`
      + `<span class="pc-muted">${x.everyone.toLocaleString("en-IN")} designs in ${x.seconds.toFixed(0)} s</span>`
      + `${k === pm.increments.length - 1 ? `<br><span class="pc-muted">Explore, Families and the tree show this increment.</span>` : ""}</figcaption></figure>`;
  }).join("");
  const { corners: shape } = Draw.shapeOf(site());
  steps.querySelectorAll<HTMLCanvasElement>("canvas").forEach((canvas, k) => {
    const before = pm.fabrics[k], after = pm.fabrics[k + 1];
    const d = E.growIncrement(pm.increments[k].chosen.genome, G(), before, 0, false, o.ranges ?? E.DEFAULT_RANGES);
    // Draw the fabric after this increment: built cells by use, earlier ones washed, unbuilt grey.
    for (let i = 0; i < G().n; i++) {
      if (after.built[i]) { d.use[i] = after.use[i]; d.levels[i] = after.levels[i]; d.coverage[i] = after.coverage[i]; }
    }
    const view = Draw.plan(canvas, site(), d, P, { aspect: aspect(), roads: roadsOf(d) });
    const ctx = canvas.getContext("2d")!;
    const col = Array.from({ length: G().n }, (_, i) => (!after.built[i] ? P.retained : null));
    Draw.cells(ctx, view, Array.from(G().x), Array.from(G().y), col, shape, 1);
    ctx.save(); ctx.globalAlpha = 0.55;
    Draw.cells(ctx, view, Array.from(G().x), Array.from(G().y), Array.from({ length: G().n }, (_, i) => (before.built[i] ? P.paper : null)), shape, 1);
    ctx.restore();
  });
}

// --- saving and reloading runs (ui/runs.ts) -------------------------------------------

function drawSaveBar() {
  $(".pc-run-save").hidden = !state.run;
  $(".pc-run-note").textContent = "";
}

async function copyRunLink() {
  if (!state.run) return;
  const url = `${location.origin}${location.pathname}?${runQuery(state.run.opts)}#pc-evolve`;
  const fromPen = state.run.opts.start?.length ? (state.run.opts.start.length - (state.run.opts.typologySeeds ?? 0)) : 0;
  try {
    await navigator.clipboard.writeText(url);
    $(".pc-run-note").textContent = "Link copied: it grows this run again."
      + (fromPen ? ` It can't carry the ${fromPen} designs from the pen this run started from; download the run for those.` : "");
  } catch {
    $(".pc-run-note").textContent = url;
  }
}

function savedRun(): Runs.SavedRun {
  const r = state.run, L = state.lineage;
  const pen = (p: PenEntry): Runs.PenEntry => ({ name: p.name, genome: p.genome, title: p.title, parents: p.parents });
  return {
    format: Runs.RUN_FORMAT, version: Runs.RUN_VERSION, build: Runs.BUILD, genomeVersion: E.GENOME_VERSION, saved: new Date().toISOString(),
    site: { id: state.id!, name: site().meta.name, rules: state.linkRules, brief: state.brief ? Sites.encodeBrief(state.brief) : null },
    off: [...state.skeletonOff].sort((a, b) => a - b), locks: state.locks ? Runs.encodeLocks(state.locks) : null, lockNote: state.lockNote,
    pen: state.pen.map(pen), children: state.children.map(pen), brood: state.brood,
    settings: r ? settingsOf(r.opts) : null, start: r?.opts.start ?? null, typologySeeds: r?.opts.typologySeeds ?? 0, ranges: r?.opts.ranges ?? null,
    result: r && L ? {
      history: r.history, everyone: r.everyone, frontSize: r.frontSize, seconds: r.seconds,
      families: state.families.map((f) => ({ name: f.name, size: f.size ?? 1, genome: f.genome, parents: f.parents ?? [] })),
      kept: state.explore.kept, archive: state.explore.archive,
      lineage: L.nodes, genomes: Runs.f64ToBase64(L.genomes), genomeLength: L.length,
      ...(state.piecemeal ? { increments: state.piecemeal.increments } : {}),
    } : null,
    selected: state.selected?.name ?? null,
    heights: massing?.mass.heights[state.id!] ?? null,
  };
}

function downloadRun() {
  const blob = new Blob([JSON.stringify(savedRun())], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${state.id}-${state.run ? `seed${state.run.opts.seed}` : "state"}-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** A saved file, shown as it was: its site, rules, brief, skeleton and locks, the run's
 *  result and lineage, the pen and the children. Nothing is run again. */
async function loadRun(file: File) {
  const note = $(".pc-run-load-note");
  let s: Runs.SavedRun;
  try { s = Runs.readSaved(await file.text()); } catch (err) { note.textContent = (err as Error).message; return; }
  note.textContent = "loading …";
  if (!state.sites[s.site.id]) {
    state.sites = { [s.site.id]: { name: s.site.name }, ...state.sites };
    $(".pc-sites").insertAdjacentHTML("afterbegin", `<button type="button" data-site="${s.site.id}">${s.site.name}</button>`);
  }
  await loadSite(s.site.id, s.site.rules, s.site.brief);
  if (state.id !== s.site.id) { note.textContent = "The file's site couldn't be loaded."; return; }
  if (s.off.length) setSkeleton(new Set(s.off));
  try {
    state.locks = s.locks ? Runs.decodeLocks(s.locks, G().n) : null;
  } catch (err) { note.textContent = (err as Error).message; return; }
  state.lockNote = s.lockNote;
  state.pen = s.pen; state.children = s.children; state.brood = s.brood;
  if (s.ranges) state.ranges = s.ranges;
  if (s.settings) applySettings(s.settings, false);
  if (s.heights && Object.keys(s.heights).length) {
    const store = await import("./mass/store.svelte");
    store.setHeights(state.id!, s.heights);
  }
  const notes = Runs.versionNotes(s.genomeVersion, s.build);
  const r = s.result;
  if (r && s.settings) {
    const st = s.settings;
    const opts: RunOptions = {
      search: st.search, objectives: st.objectives as E.MetricKey[], generations: st.gens, pop: st.pop, seed: st.seed, shock: st.shock,
      locked: state.locks ? Array.from(state.locks) : null, start: s.start, ranges: state.ranges, typologySeeds: s.typologySeeds,
      ...(st.search === "map-elites" ? { axes: st.axes ?? undefined, bins: st.bins ?? undefined,
        weights: state.brief?.brief.objective_weights?.value ?? null } : {}),
      ...(st.growth === "piecemeal" ? { growth: "piecemeal" as const, scenario: st.scenario ?? "ssp245", locked: null } : {}),
    };
    state.run = { history: r.history, everyone: r.everyone, frontSize: r.frontSize, opts, seconds: r.seconds };
    state.lineage = { nodes: r.lineage, genomes: Runs.base64ToF64(r.genomes), length: r.genomeLength };
    state.piecemeal = r.increments ? piecemealOf(r.increments, opts) : null;
    state.families = r.families.map((f) => ({ ...f, title: f.name, design: runGrown(f.genome), fabric: lastFabric() }));
    resetExplore(r.kept, r.archive);
    const pens = [...state.families, ...state.pen.map((p) => ({ ...p, title: p.name, design: grown(p.genome) }))];
    state.selected = pens.find((it) => it.name === s.selected) ?? state.families[0] ?? null;
    $(".pc-progress").textContent = runLine(opts, { ...r, kept: r.kept, archive: r.archive }, r.seconds, `From ${file.name} (saved ${s.saved.slice(0, 10)}): `);
    history.replaceState(null, "", `?${runQuery(opts)}#pc-evolve`);
    // Space syntax readouts saved with the run are kept; any missing are read again.
    const all = r.kept.every((k) => E.SYNTAX_KEYS.every((key) => key in k.metrics));
    state.syntax.token++;
    if (all) state.syntax.read = r.kept.length;
    else {
      await state.worker!.api.keep(r.kept.map((k) => ({ genome: k.genome, locked: opts.locked, ranges: opts.ranges ?? E.DEFAULT_RANGES })));
      readSyntax();
    }
  }
  drawAll();
  drawSaveBar();
  note.textContent = [r ? "Loaded." : "Loaded (no run in the file).", ...notes].join(" ");
}

// --- the family tree (ui/tree.ts) ------------------------------------------------------

function treeLayout(): Tree.TreeLayout | null {
  const t = state.tree, L = state.lineage;
  if (!L) { t.layout = null; t.of = null; return null; }
  if (t.of !== L || !t.layout || (t.layout.placed.length === L.nodes.length) !== t.all) {
    const kept = new Set(state.explore.kept.map((k) => k.name));
    const front = new Set(state.explore.kept.filter((k) => state.explore.archive || k.rank === 1).map((k) => k.name));
    t.layout = Tree.layoutTree(L.nodes, kept, front, t.all);
    if (t.of !== L) t.selected = -1;
    t.of = L; t.hover = -1;
    $(".pc-tree-readout").textContent = "";
  }
  return t.layout;
}

function drawTree() {
  const box = $(".pc-tree"), L = state.lineage, layout = treeLayout();
  box.hidden = !L || !layout;
  if (!L || !layout) return;
  $(".pc-tree-count").textContent = `${L.nodes.length.toLocaleString("en-IN")}; ${layout.placed.length.toLocaleString("en-IN")} shown`;
  $(".pc-tree-front").textContent = state.explore.archive ? "the archive's elites" : "its front";
  $<HTMLInputElement>(".pc-tree-all").checked = state.tree.all;
  state.tree.hit = Tree.drawTree($<HTMLCanvasElement>(".pc-tree-canvas"), layout, L.nodes, P, {
    selected: state.tree.selected, hover: state.tree.hover, shock: state.run?.opts.shock?.[0] ?? null,
  });
}

const treeScores = (s: number[]) => {
  const [storage, heat, carbon, daylight, human, gap] = s;
  return `storage ${pct(storage)} · +${heat.toFixed(1)}°C · ${Math.round(carbon)} kg/m² · daylight ${pct(daylight)} · human scale ${pct(human)}`
    + ` · floor area ${gap <= E.TARGET_TOLERANCE ? "on brief" : `${pct(gap)} off the brief`}`;
};

/** Open a design from the tree, grown as the run grew it. */
function openTreeNode(i: number) {
  const L = state.lineage, layout = state.tree.layout, o = state.run?.opts;
  if (!L || !layout || !o) return;
  const p = layout.placed[i], n = L.nodes[p.k];
  const genome = Runs.lineageGenome(L.genomes, L.length, p.k);
  const design = runGrown(genome);
  state.tree.selected = i;
  drawTree();
  choose({ name: n.name, title: `${n.name} · from the family tree, Generation ${n.gen}`, genome, design,
    parents: n.how === "bred" ? n.parents : [], fabric: lastFabric() });
}

/** A run from the link (?seed=…): its settings, skeleton and locks set, then grown again. */
async function runFromLink() {
  let link: Runs.RunLink | null;
  try { link = Runs.readLink(new URLSearchParams(location.search), G().n); } catch (err) {
    $(".pc-progress").textContent = (err as Error).message;
    return;
  }
  if (!link) return;
  if (link.off.length) setSkeleton(new Set(link.off));
  if (link.locks) { state.locks = link.locks; state.lockNote = ["cells locked in the link"]; }
  applySettings(link.settings);
  drawEvolve();
  const notes = Runs.versionNotes(link.genomeVersion, link.build);
  if (link.pen) {
    notes.push(`This run started from ${link.pen} designs in the pen, which a link can't carry, so it was grown without them`
      + " and won't match. The run's file keeps them.");
  }
  $(".pc-progress").textContent = "Growing the run from the link …";
  document.querySelector("#pc-evolve")?.scrollIntoView();
  await runEvolution(link.settings.seed, notes.join(" "));
}

/** Space syntax for the designs a run kept: asked of the worker one design at a time, so the
 *  opened design's request can slip in between. Explore shows the group once all are read. */
async function readSyntax() {
  const sx = state.syntax, token = ++sx.token, kept = state.explore.kept, line = $(".pc-syntax-progress");
  sx.read = 0;
  line.hidden = false;
  for (let k = 0; k < kept.length; k++) {
    line.textContent = `Reading space syntax for the designs the run kept: ${k} of ${kept.length}.`;
    let m: Partial<E.Metrics> | null;
    try { m = await state.worker!.api.syntaxKept(k); } catch { return; }
    if (token !== sx.token) return;
    if (m) Object.assign(kept[k].metrics, m);
    sx.read = k + 1;
  }
  line.hidden = true;
  drawExplore();
}

/** Are the kept designs' space syntax readouts all in? */
const syntaxReady = () => state.syntax.read >= state.explore.kept.length;

function drawCharts(rows: E.HistoryRow[], opts: RunOptions) {
  const charts: [keyof E.HistoryRow, string, (v: number) => string][] = [
    ["on_brief", "designs on brief", (v) => `${v}`],
    ...E.SCORE_KEYS.map((k): [keyof E.HistoryRow, string, (v: number) => string] => {
      const [label, fmt, up] = E.SCORES[k];
      return [k, `best ${label}${up ? "" : " (lower is better)"}`, fmt];
    }),
    ...(opts.objectives ?? []).map((k): [keyof E.HistoryRow, string, (v: number) => string] => {
      const m = E.METRICS[k] as E.Metric;
      return [k as keyof E.HistoryRow, `best ${m.label} (promoted)`, m.fmt];
    }),
    ...(rows.some((r) => r.filled !== undefined)
      ? [["filled", "archive cells filled", (v: number) => `${v}`] as [keyof E.HistoryRow, string, (v: number) => string]] : []),
  ];
  const box = $(".pc-charts"), sig = charts.map(([k]) => k).join(",");
  if (box.dataset.sig !== sig) {
    box.dataset.sig = sig;
    box.innerHTML = charts.map(([k, t]) => `<figure><figcaption>${t}</figcaption><canvas data-k="${k}"></canvas></figure>`).join("");
  }
  for (const [k, , fmt] of charts) {
    Draw.sparkline(box.querySelector<HTMLCanvasElement>(`[data-k="${k}"]`)!, rows.map((r) => r[k] as number | null), P,
      { format: fmt, marker: opts?.shock ? opts.shock[0] : null });
  }
}

function drawEvolve() {
  $(".pc-run-save").hidden = !state.run;
  $(".pc-locks").textContent = state.locks ? `Locked: ${state.lockNote.join("; ")}.` : "";
  $(".pc-locks-clear").hidden = !state.locks;
  const f = form(".pc-evolve form");
  input(f, "fromPen").disabled = !state.pen.length;
  f.querySelector(".pc-pen-count")!.textContent = String(state.pen.length);
  if (!state.run) { $(".pc-charts").innerHTML = ""; $(".pc-charts").dataset.sig = ""; $(".pc-progress").textContent = ""; }
  else drawCharts(state.run.history, state.run.opts);
}

// --- 06 explore -----------------------------------------------------------------------

function resetExplore(kept: Kept[], archive: E.ArchiveInfo | null) {
  const x = state.explore;
  Object.assign(x, { kept, archive, selected: -1, hover: -1, hit: null });
  x.grown.clear();
  if (archive) x.view = "archive";
  else if (x.view === "archive") x.view = "matrix";
  // Start on the design the families chapter leads with.
  const lead = state.families[0]?.name;
  x.selected = kept.findIndex((d) => d.name === lead);
}

/** A kept design, regrown as the run grew it (its locks and gene ranges), with the run's scores. */
function keptDesign(k: number): E.Design {
  const x = state.explore;
  let d = x.grown.get(k);
  if (!d) {
    const o = state.run!.opts, f = lastFabric();
    d = f ? E.growLast(x.kept[k].genome, G(), f, o.ranges ?? E.DEFAULT_RANGES)
      : E.grow(x.kept[k].genome, G(), o.locked ? Int8Array.from(o.locked) : null, o.ranges ?? E.DEFAULT_RANGES);
    d.scores = x.kept[k].scores;
    x.grown.set(k, d);
  }
  return d;
}

const keptItem = (k: number): Item => {
  const d = state.explore.kept[k];
  return { name: d.name, title: d.name, genome: d.genome, parents: d.parents, design: keptDesign(k), fabric: lastFabric() };
};

function drawExplore() {
  const x = state.explore, has = x.kept.length > 0;
  $(".pc-explore-empty").hidden = has;
  $(".pc-explore-body").hidden = !has;
  $$(".pc-extremes-head").forEach((e) => { e.hidden = !has; });
  $$(".pc-explore-tabs button").forEach((b) => {
    b.setAttribute("aria-pressed", String(b.dataset.view === x.view));
    b.hidden = b.dataset.view === "archive" && !x.archive;
  });
  if (!has) { $(".pc-extremes").innerHTML = ""; return; }
  drawExplorePlot();
  drawPick();
  drawExtremes();
}

function drawExplorePlot() {
  const x = state.explore, canvas = $<HTMLCanvasElement>(".pc-explore-plot"), grid = $(".pc-archive");
  const archive = x.view === "archive" && !!x.archive;
  canvas.hidden = archive;
  grid.hidden = !archive;
  if (archive) { drawArchive(); return; }
  if (syntaxWaiting(true)) {
    const { ctx, w, h } = Draw.fitCanvas(canvas, 0.5);
    ctx.fillStyle = P.paper; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = P.muted; ctx.font = "14px system-ui, sans-serif"; ctx.textAlign = "center";
    ctx.fillText(`Space syntax is still being read (${state.syntax.read} of ${x.kept.length} designs).`, w / 2, h / 2);
    x.hit = null;
    return;
  }
  const marks = { selected: x.selected, hover: x.hover };
  const promoted = X.metricAxes(state.run?.opts.objectives ?? []);
  x.hit = x.view === "matrix" ? X.scatterMatrix(canvas, x.kept, P, marks, [...X.SCORE_AXES, ...promoted])
    : X.parallel(canvas, x.kept, P, marks, measureAxes());
}

/** The measures Explore compares: the scores (with floor area, storeys and any promoted
 *  metrics), or one group of form metrics. */
function measureAxes(): X.Axis[] {
  const x = state.explore, group = X.GROUPS.find(([name]) => name === x.measures);
  return group ? X.metricAxes(group[1]) : [...X.AXES, ...X.metricAxes(state.run?.opts.objectives ?? [])];
}

/** The form metrics of one design, by group, each placed among the designs the run kept
 *  (`pool`). Properties the brief asks for are marked. */
function metricsPanel(m: Partial<E.Metrics>, pool: Partial<E.Metrics>[]): string {
  const asked = new Set<string>((state.brief?.brief.aesthetic_priorities?.value ?? []).map((p) => p.metric));
  const rows = X.GROUPS.map(([name, keys]) => `<h4>${name}</h4><dl>` + keys.map((k) => {
    const def = E.METRICS[k] as E.Metric, v = m[k];
    if (v === undefined) return `<dt title="${def.note}">${def.label}</dt><dd class="pc-muted">reading …</dd>`;
    let bar = "";
    const vs = pool.map((p) => p[k]).filter((x) => x !== undefined);
    if (vs.length > 1) {
      const lo = Math.min(...vs), hi = Math.max(...vs);
      let t = hi > lo ? (v - lo) / (hi - lo) : 0.5;
      if (def.up === false) t = 1 - t;
      bar = `<span class="pc-bar${def.up === null ? " is-neutral" : ""}"><i style="left:${Math.round(Math.min(Math.max(t, 0), 1) * 100)}%"></i></span>`;
    }
    return `<dt title="${def.note}">${def.label}${asked.has(def.property) ? " <em>the brief</em>" : ""}</dt><dd>${def.fmt(v)}${bar}</dd>`;
  }).join("") + "</dl>").join("");
  const missing = Object.entries(E.NOT_MEASURED).map(([p, why]) => `${p.replace(/_/g, " ")} (${why})`).join("; ");
  return rows + `<p class="pc-muted">${pool.length > 1 ? "Each bar places this design among the ones the run kept, the better end "
    + "to the right (grey: neither end is better). " : ""}Hover a name for what it measures. Not measured: ${missing}.</p>`;
}

function drawArchive() {
  const x = state.explore, { axes, bins } = x.archive!, grid = $(".pc-archive");
  const [ax, ay] = axes.map((k) => E.DESCRIPTORS[k]);
  const rows = X.archiveRows(x.kept, bins);
  const fmt = (v: number) => String(+v.toFixed(2));
  grid.style.gridTemplateColumns = `1.4em repeat(${bins}, 1fr)`;
  grid.innerHTML = `<span class="pc-ylab" style="grid-row: span ${bins}">${ay.label}: ${fmt(ay.range[0])} to ${fmt(ay.range[1])} →</span>`
    + rows.flat().map((k) => (k < 0 ? `<span class="pc-empty"></span>`
      : `<button type="button" data-k="${k}" class="${k === x.selected ? "is-on" : ""}" `
        + `title="${x.kept[k].name}: quality ${x.kept[k].quality!.toFixed(2)}"><canvas></canvas></button>`)).join("")
    + `<span></span><span class="pc-xlab" style="grid-column: span ${bins}">${ax.label}: ${fmt(ax.range[0])} to ${fmt(ax.range[1])} →</span>`;
  const a = aspect();
  grid.querySelectorAll<HTMLElement>(".pc-empty").forEach((e) => { e.style.aspectRatio = String(1 / a); });
  const buttons = [...grid.querySelectorAll<HTMLElement>("button[data-k]")];
  const ds = buttons.map((b) => keptDesign(+b.dataset.k!));
  Draw.plans(buttons.map((b) => b.querySelector("canvas")!), site(), ds, P, a, ds.map(roadsOf));
}

function drawPick() {
  const x = state.explore, box = $(".pc-pick");
  box.hidden = x.selected < 0;
  if (x.selected < 0) return;
  const d = keptDesign(x.selected), k = x.kept[x.selected];
  Draw.plan(box.querySelector<HTMLCanvasElement>("canvas")!, site(), d, P, { aspect: aspect(), roads: roadsOf(d) });
  const where = k.cell !== undefined && x.archive
    ? ` · archive column ${k.cell % x.archive.bins + 1}, row ${Math.floor(k.cell / x.archive.bins) + 1} from the bottom` : "";
  box.querySelector("h3")!.textContent = `${k.name}${X.onFront(k) ? " · on the front" : X.onBrief(k) ? "" : " · off the brief"}${where}`;
  box.querySelector(".pc-scores")!.innerHTML = scoreLine(d);
  box.querySelector(".pc-metrics-body")!.innerHTML = metricsPanel(k.metrics, x.kept.map((e) => e.metrics));
}

/** Explore is to show space syntax (the group, or a promoted syntax metric) before every kept
 *  design has been read. `plot`: for the plot (the scatter matrix shows only the scores). */
function syntaxWaiting(plot = false): boolean {
  const x = state.explore, promoted = (state.run?.opts.objectives ?? []).some((k) => E.SYNTAX_KEYS.includes(k));
  if (syntaxReady()) return false;
  return promoted || (x.measures === "space syntax" && (!plot || x.view === "parallel"));
}

function drawExtremes() {
  const x = state.explore;
  if (syntaxWaiting()) { $(".pc-extremes").innerHTML = ""; return; }
  const btn = (k: number, axis: X.Axis, good: boolean) => `<button type="button" data-k="${k}"${good ? ` class="is-best" title="the better end"` : ""}>`
    + `${axis.fmt(axis.get(x.kept[k]))} · ${x.kept[k].name}</button>`;
  $(".pc-extremes").innerHTML = `<thead><tr><th></th><th>lowest</th><th>highest</th></tr></thead><tbody>`
    + X.extremes(x.kept, measureAxes()).map(({ axis, lo, hi }) => `<tr><th>${axis.label}</th><td>${btn(lo, axis, axis.up === false)}</td>`
      + `<td>${btn(hi, axis, axis.up === true)}</td></tr>`).join("") + "</tbody>";
}

function pickKept(k: number) {
  state.explore.selected = k;
  drawExplorePlot();
  drawPick();
}

// --- 07 families ----------------------------------------------------------------------

type Action = [string, (it: Item) => void];
function gallery(box: HTMLElement, items: Item[], actions: Action[]) {
  box.innerHTML = items.map((it, k) => `<figure class="pc-card${state.selected === it ? " is-on" : ""}" data-k="${k}">`
    + `<canvas></canvas><figcaption><b>${it.title}</b><span>${scoreLine(it.design)}</span>`
    + `<span class="pc-actions">${actions.map(([label]) => `<button type="button" data-act="${label}">${label}</button>`).join("")}</span>`
    + `</figcaption></figure>`).join("");
  box.querySelectorAll<HTMLElement>(".pc-card").forEach((card) => {
    const it = items[+card.dataset.k!];
    Draw.plan(card.querySelector("canvas")!, site(), it.design, P, { aspect: aspect(), roads: roadsOf(it.design) });
    card.addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>("[data-act]");
      const act = actions.find(([label]) => label === b?.dataset.act);
      if (act) act[1](it);
    });
  });
}

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
function drawFamilies() {
  const box = $(".pc-families .pc-gallery");
  if (!state.families.length) {
    box.innerHTML = `<p class="pc-muted">Run an evolution above; its families appear here.</p>`;
    $(".pc-detail").hidden = true;
    return;
  }
  state.families.forEach((f, n) => { f.title = `Family ${LETTERS[n % 26]} · ${f.name} (${f.size})`; });
  const shown = state.showAll ? state.families : state.families.slice(0, 10);
  gallery(box, shown, [["view", (it) => choose(it)], ["to the pen", (it) => toPen(it)]]);
  const more = $(".pc-more");
  more.hidden = state.families.length <= 10;
  more.textContent = state.showAll ? "show the first 10" : `show all ${state.families.length} families`;
  drawDetail();
}

function choose(it: Item) {
  state.selected = it;
  drawFamilies();
  drawBreedGalleries();
  $(".pc-detail").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function drawDetail() {
  const it = state.selected, box = $(".pc-detail");
  if (!it) { box.hidden = true; state.syntax.detail = null; return; }
  box.hidden = false;
  box.querySelector("h3")!.textContent = it.title;
  box.querySelector(".pc-scores")!.innerHTML = scoreLine(it.design);
  const nonSyntax = E.METRIC_KEYS.filter((k) => !E.SYNTAX_KEYS.includes(k));
  const metrics = E.measure(it.design, G(), nonSyntax);
  const pool = state.explore.kept.map((e) => e.metrics);
  box.querySelector(".pc-metrics-body")!.innerHTML = metricsPanel(metrics, pool);
  readDetailSyntax(it, metrics, pool);
  Draw.plan(box.querySelector<HTMLCanvasElement>(".pc-plan")!, site(), it.design, P,
    { aspect: aspect(), attractors: true, locked: state.locks, roads: roadsOf(it.design) });
  drawSolid();
  drawShock();
}

// --- space syntax of the opened design ------------------------------------------------

const SYNTAX_MEASURES: [keyof SyntaxDetail["values"] | "nach_rn", string][] = [
  ["nain_r400", "integration, 400 m (NAIN)"], ["nain_r800", "integration, 800 m (NAIN)"], ["nain_rn", "integration, Rn (NAIN)"],
  ["nach_r400", "choice, 400 m (NACH)"], ["nach_r800", "choice, 800 m (NACH)"], ["nach_rn", "choice, Rn (NACH; exact, on request)"],
];
const grownOfItem = (it: Item): Grown => ({ genome: it.genome, locked: state.locks ? Array.from(state.locks) : null, ranges: state.ranges });

async function readDetailSyntax(it: Item, metrics: Partial<E.Metrics>, pool: Partial<E.Metrics>[]) {
  const sx = state.syntax;
  if (sx.detail?.name !== it.name) { sx.detail = null; sx.choice = null; }
  drawSyntax();
  if (sx.detail) return;
  $(".pc-syntax-status").textContent = "reading the network …";
  let d: SyntaxDetail;
  try { d = await state.worker!.api.syntaxDetail(grownOfItem(it)); } catch (err) {
    $(".pc-syntax-status").textContent = `Space syntax failed: ${(err as Error).message}`;
    return;
  }
  if (state.selected !== it) return;
  sx.detail = { ...d, name: it.name };
  $(".pc-syntax-status").textContent = "";
  $(".pc-detail .pc-metrics-body").innerHTML = metricsPanel({ ...metrics, ...d.metrics }, pool);
  drawSyntax();
}

async function exactChoice() {
  const it = state.selected, sx = state.syntax;
  if (!it || !sx.detail) return;
  const status = $(".pc-syntax-status"), btn = $<HTMLButtonElement>(".pc-syntax-choice");
  btn.disabled = true;
  const t0 = performance.now();
  try {
    sx.choice = await state.worker!.api.choiceRn(grownOfItem(it), Comlink.proxy((done: number, of: number) => {
      status.textContent = `choice from every segment: ${done.toLocaleString("en-IN")} of ${of.toLocaleString("en-IN")}`;
    }));
  } catch (err) {
    status.textContent = `Failed: ${(err as Error).message}`;
    btn.disabled = false;
    return;
  }
  btn.disabled = false;
  if (state.selected !== it) return;
  status.textContent = `exact Rn choice in ${((performance.now() - t0) / 1000).toFixed(0)} s`;
  sx.measure = "nach_rn";
  drawSyntax();
}

function drawSyntax() {
  const sx = state.syntax, d = sx.detail, it = state.selected;
  const sel = $<HTMLSelectElement>(".pc-syntax-measure"), body = $(".pc-syntax-body"), legend = $(".pc-syntax-legend");
  sel.innerHTML = SYNTAX_MEASURES.map(([k, label]) => `<option value="${k}"${k === sx.measure ? " selected" : ""}`
    + `${k === "nach_rn" && !sx.choice ? " disabled" : ""}>${label}</option>`).join("");
  const canvas = $<HTMLCanvasElement>(".pc-syntax-map");
  if (!d || !it) { canvas.hidden = true; body.innerHTML = ""; legend.textContent = ""; return; }
  canvas.hidden = false;
  const values = sx.measure === "nach_rn" ? sx.choice?.nach ?? null : d.values[sx.measure as keyof SyntaxDetail["values"]];
  Draw.syntaxMap(canvas, site(), it.design, P, { aspect: aspect(), site: d.site, buffer: d.buffer, values, core: d.core,
    landmarks: d.landmarks });
  legend.innerHTML = `<span>low <i class="pc-ramp"></i> high</span> · thick ink: the integration core (the top 10% of the street`
    + ` length by Rn integration) · triangles: landmarks (${d.landmarks.length}) · grey: existing streets in the buffer`;
  const f2 = (v: number) => (Number.isFinite(v) ? v.toFixed(2) : "–"), f0 = (v: number) => (Number.isFinite(v) ? v.toFixed(0) : "–");
  const m = d.means, pctOf = (v: number) => `${Math.round(v * 100)}%`;
  body.innerHTML = `<table class="pc-syntax-table"><thead><tr><th></th><th>NAIN</th><th>NACH</th>`
    + `<th class="pc-muted">mean depth</th><th class="pc-muted">mean choice</th></tr></thead><tbody>`
    + `<tr><th>400 m</th><td>${f2(m.nain_r400)}</td><td>${f2(m.nach_r400)}</td><td class="pc-muted">${f2(m.depth_r400)}</td><td class="pc-muted">${f0(m.choice_r400)}</td></tr>`
    + `<tr><th>800 m</th><td>${f2(m.nain_r800)}</td><td>${f2(m.nach_r800)}</td><td class="pc-muted">${f2(m.depth_r800)}</td><td class="pc-muted">${f0(m.choice_r800)}</td></tr>`
    + `<tr><th>Rn within the 1 km buffer</th><td>${f2(m.nain_rn)}</td><td>${sx.choice ? f2(sx.choice.mean) : "on request"}</td>`
    + `<td class="pc-muted">${f2(m.depth_rn)}</td><td class="pc-muted">${sx.choice ? f0(sx.choice.choice) : "–"}</td></tr></tbody></table>`
    + `<p class="pc-muted">Means over the site's streets, weighted by length. NAIN and NACH are normalised (Hillier, Yang and Turner`
    + ` 2012), so designs with more or fewer streets compare; mean depth (in 90° turns) and mean choice are the raw values.`
    + ` The network has ${d.segments.toLocaleString("en-IN")} segments, ${d.links} joins between the design and the city.</p>`
    + `<p><b>Legibility ${pctOf(d.parts.legibility)}</b>, the mean of: intelligibility ${f2(d.parts.intelligibility)}`
    + ` (400 m against Rn integration; below zero counts as zero) · centres on the core ${pctOf(d.parts.centres)}`
    + ` · landmarks seen from the core ${pctOf(d.parts.landmarks)}</p>`;
}

// --- shock tests on the opened design (engine/shocks.ts) -------------------------------

type ShockKind = "sea" | "rain" | "heat";
const shockSites = new WeakMap<E.Ground, E.ShockSite>();
const shockSiteOf = () => {
  let s = shockSites.get(G());
  if (!s) { s = E.shockSite(site(), G()); shockSites.set(G(), s); }
  return s;
};
const SHOCK_UNITS: Record<ShockKind, string> = { sea: "sea level, m above mean sea level", rain: "storm, mm in a day", heat: "rise, °C" };

function shockPresets(kind: ShockKind): E.Preset[] {
  return kind === "sea" ? E.seaPresets(site().meta) : kind === "rain" ? E.rainPresets(site().meta) : E.HEAT_PRESETS;
}

/** Set the shock form for a kind: its presets, the default preset, its unit. */
function setShockKind(kind: ShockKind) {
  const f = form(".pc-shock-form"), ps = shockPresets(kind);
  select(f, "kind").value = kind;
  select(f, "preset").innerHTML = ps.map((p, k) => `<option value="${k}">${p.label}</option>`).join("") + `<option value="">typed</option>`;
  const start = kind === "sea" ? Math.max(0, ps.findIndex((p) => /2050, SSP2-4.5/.test(p.label))) : kind === "rain" ? Math.max(0, ps.findIndex((p) => /^100-year/.test(p.label))) : 1;
  select(f, "preset").value = ps.length ? String(Math.min(start, ps.length - 1)) : "";
  input(f, "value").value = ps.length ? String(ps[Math.min(start, ps.length - 1)].value) : kind === "rain" ? String(site().meta.design_storm_mm) : "4";
  $(".pc-shock-unit").textContent = SHOCK_UNITS[kind];
}

function drawShock() {
  const box = $<HTMLDetailsElement>(".pc-shock"), it = state.selected;
  if (!box.open || !it) return;
  const f = form(".pc-shock-form"), S = shockSiteOf();
  const seaOpt = select(f, "kind").querySelector<HTMLOptionElement>("option[value=sea]")!;
  seaOpt.disabled = !S.coastal;
  seaOpt.textContent = S.coastal ? "sea level" : "sea level (not a coastal site)";
  let kind = select(f, "kind").value as ShockKind;
  if (kind === "sea" && !S.coastal) { setShockKind("rain"); kind = "rain"; }
  const v = +input(f, "value").value, ps = shockPresets(kind), p = ps[+select(f, "preset").value];
  $(".pc-shock-source").textContent = p && select(f, "preset").value !== "" && p.value === v ? `Source: ${p.source}.` : "A typed value.";
  const d = it.design;
  if (!d.scores) E.evaluate(d, G());
  const r: E.ShockResult & { share?: [number, number] } = kind === "sea" ? E.seaShock(d, G(), S, v)
    : kind === "rain" ? E.rainShock(d, G(), S, v) : E.heatShock(d, G(), S, v);
  // The map: the design washed pale, failures over it.
  const canvas = $<HTMLCanvasElement>(".pc-shock-map");
  const view = Draw.plan(canvas, site(), d, P, { aspect: aspect(), roads: roadsOf(d) });
  const ctx = canvas.getContext("2d")!, { corners: shape } = Draw.shapeOf(site());
  ctx.save(); ctx.globalAlpha = 0.65; ctx.fillStyle = P.paper; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.restore();
  const ramp = kind === "heat" ? P.oranges : P.blues;
  const col = Array.from(r.fail, (f) => (f === 2 ? ramp[4] : f === 1 ? ramp[2] : null));
  Draw.cells(ctx, view, Array.from(G().x), Array.from(G().y), col, shape, 0.95);
  const legends: Record<ShockKind, [string, string]> = {
    sea: ["flooded ground", "buildings with water above the plinth (45 cm)"],
    rain: ["ponds and tanks that filled and spilled, or water standing over 15 cm", "buildings with water above the plinth"],
    heat: ["cells beside an overheated street", "overheated landscape"],
  };
  $(".pc-shock-legend").innerHTML = `<span><i style="background:${ramp[2]}"></i>${legends[kind][0]}</span>`
    + `<span><i style="background:${ramp[4]}"></i>${legends[kind][1]}</span>`;
  $(".pc-shock-lines").innerHTML = r.lines.map((l) => `<li>${l}</li>`).join("");
  // Before and after, on the scores.
  const rows: [string, (s: E.ShockScores) => string][] = [
    ...E.SCORE_KEYS.map((k): [string, (s: E.ShockScores) => string] => [E.SCORES[k][0], (s) => E.SCORES[k][1](s.scores[k])]),
    ["floor area (net)", (s) => fmtHa(s.floorHa)],
    ["off the floor-area brief by", (s) => pct(s.scores.gap)],
  ];
  if (r.share) rows.push(["public ground overheated", () => ""]);
  $(".pc-shock-table").innerHTML = `<thead><tr><th></th><th>before</th><th>after</th></tr></thead><tbody>`
    + rows.map(([label, fmt], k) => {
      let b = fmt(r.before), a = fmt(r.after);
      if (r.share && k === rows.length - 1) { b = pct(r.share[0]); a = pct(r.share[1]); }
      return `<tr${a !== b ? ` class="is-changed"` : ""}><td>${label}</td><td>${b}</td><td>${a}</td></tr>`;
    }).join("") + "</tbody>";
}

function drawSolid() {
  const it = state.selected;
  if (it) Draw.solid($<HTMLCanvasElement>(".pc-solid"), site(), it.design, P, { bearing: state.bearing });
}

function lock(code: number, label: string) {
  const d = state.selected?.design;
  if (!d) return;
  const locks = state.locks ?? (state.locks = new Int8Array(G().n));
  d.use.forEach((u, i) => { if (u === code) locks[i] = code; });
  state.lockNote.push(`${label} of ${state.selected!.name}`);
  drawEvolve();
  drawDetail();
}

function toPen(it: Item | PenEntry) {
  if (!state.pen.some((p) => p.name === it.name)) state.pen.push({ name: it.name, genome: it.genome, title: it.name });
  drawBreed();
  drawEvolve();
}

/** The massing chapter (Svelte, the massing engine, and three.js later still) loads the first
 *  time a design is sent to it, so the page's first load doesn't carry it. */
let massing: typeof import("./mass/store.svelte") | null = null;
async function loadMassing() {
  if (massing) return massing;
  const [{ mount }, { default: Massing }, store] = await Promise.all([
    import("svelte"), import("./mass/Massing.svelte"), import("./mass/store.svelte"),
  ]);
  const box = $(".pc-mass");
  box.replaceChildren();
  mount(Massing, { target: box });
  return (massing = store);
}

/** Send the selected design to the massing chapter, with what it was grown under. */
async function massSelected() {
  const it = state.selected!;
  const { openMassing } = await loadMassing();
  openMassing({
    siteId: state.id!, site: site(), G: G(), skeletonOff: [...state.skeletonOff], name: it.name, genome: it.genome,
    locks: state.locks ? Array.from(state.locks) : null, ranges: state.ranges, brief: state.brief?.brief ?? null,
    fabric: it.fabric ?? null,
  });
  $("#pc-massing").scrollIntoView({ behavior: "smooth", block: "start" });
}

// --- 08 breeding ----------------------------------------------------------------------

function drawBreed() {
  const f = form(".pc-breed form");
  const opts = state.pen.map((p) => `<option>${p.name}</option>`).join("");
  select(f, "a").innerHTML = opts; select(f, "b").innerHTML = opts;
  if (state.pen.length > 1) select(f, "b").selectedIndex = 1;
  f.querySelector<HTMLButtonElement>("button[type=submit]")!.disabled = state.pen.length < 2;
  drawBreedGalleries();
}

function drawBreedGalleries() {
  const pen: Item[] = state.pen.map((p) => ({ ...p, title: p.name, design: grown(p.genome) }));
  gallery($(".pc-pen"), pen, [["view", (it) => choose(it)], ["remove", (it) => {
    state.pen = state.pen.filter((p) => p.name !== it.name); drawBreed(); drawEvolve();
  }]]);
  if (!pen.length) $(".pc-pen").innerHTML = `<p class="pc-muted">Empty. Send families here, or add random designs.</p>`;
  const kids: Item[] = state.children.map((c) => ({ ...c, title: c.title ?? c.name, design: grown(c.genome) }));
  $(".pc-children-head").hidden = !kids.length;
  if (kids.length) $(".pc-children-head").textContent = `Children of ${kids[0].parents!.join(" × ")}`;
  gallery($(".pc-children"), kids, [["keep", (it) => toPen(it)], ["view", (it) => choose(it)]]);
}

async function breed() {
  const f = form(".pc-breed form");
  const a = state.pen.find((p) => p.name === select(f, "a").value);
  const b = state.pen.find((p) => p.name === select(f, "b").value);
  if (!a || !b) return;
  state.brood += 1;
  // Biased: breed four times as many and keep the six best on the chosen measure.
  const bias = BIAS.find((o) => o.key === select(f, "bias").value);
  let kids = E.breed(a.genome, b.genome, rng, bias ? 24 : 6).map((g) => ({ g, v: 0 }));
  if (bias) {
    const key = bias.key.slice(2) as E.MetricKey;
    if (bias.key.startsWith("m:") && E.SYNTAX_KEYS.includes(key)) {
      $(".pc-children-head").hidden = false;
      $(".pc-children-head").textContent = "Breeding: reading space syntax for 24 children …";
      const ms = await state.worker!.api.measureMany(kids.map((k) => ({ genome: k.g, locked: state.locks ? Array.from(state.locks) : null,
        ranges: state.ranges })), [key], true);
      kids.forEach((kid, j) => { kid.v = ms[j][key]!; });
    } else for (const kid of kids) kid.v = bias.value(grown(kid.g));
    kids = kids.sort((p, q) => (bias.up ? q.v - p.v : p.v - q.v)).slice(0, 6);
  }
  state.children = kids.map(({ g, v }, k) => {
    const name = `B${state.brood}.${k + 1}`;
    return { name, genome: g, parents: [a.name, b.name], title: bias ? `${name} · ${bias.label} ${bias.fmt(v)}` : name };
  });
  drawBreedGalleries();
}

/** What breeding can be biased by: any score, or any metric with a better end. */
const BIAS = [
  ...E.SCORE_KEYS.map((k) => ({ key: `s:${k}`, label: E.SCORES[k][0], up: E.SCORES[k][2], fmt: E.SCORES[k][1],
    value: (d: E.Design) => d.scores![k] })),
  ...E.OBJECTIVE_KEYS.map((k) => {
    const m = E.METRICS[k] as E.Metric;
    return { key: `m:${k}`, label: m.label, up: m.up!, fmt: m.fmt, value: (d: E.Design) => E.measure(d, G(), [k], true)[k]! };
  }),
];
const SEARCH_NAMES = { nsga2: "NSGA-II", nsga3: "NSGA-III", "map-elites": "MAP-Elites" } as const;

// --- wiring ---------------------------------------------------------------------------

function wire() {
  $(".pc-layer-tabs").addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("[data-layer]");
    if (b) { state.layer = b.dataset.layer as LayerKey; drawLayer(); }
  });
  $(".pc-genome .pc-another").addEventListener("click", () => { state.genome = E.randomGenome(rng); drawGenome(); });
  $(".pc-ridges").addEventListener("change", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLInputElement>("[data-ridge]");
    if (!b) return;
    const off = new Set(state.skeletonOff), id = +b.dataset.ridge!;
    if (b.checked) off.delete(id); else off.add(id);
    setSkeleton(off);
  });
  const ev = form(".pc-evolve form");
  ev.addEventListener("submit", (e) => { e.preventDefault(); runEvolution(); });
  $(".pc-tree-all").addEventListener("change", (e) => { state.tree.all = (e.target as HTMLInputElement).checked; state.tree.selected = -1; drawTree(); });
  const treeCanvas = $(".pc-tree-canvas");
  treeCanvas.addEventListener("pointermove", (e) => {
    const t = state.tree, i = t.hit ? t.hit(e.offsetX, e.offsetY) : -1;
    if (i === t.hover) return;
    t.hover = i;
    const L = state.lineage, p = i >= 0 ? t.layout!.placed[i] : null;
    $(".pc-tree-readout").textContent = p && L ? Tree.describeNode(L.nodes[p.k], p.role, treeScores(L.nodes[p.k].scores)) : "";
    treeCanvas.style.cursor = i >= 0 ? "pointer" : "";
    drawTree();
  });
  treeCanvas.addEventListener("pointerleave", () => { state.tree.hover = -1; drawTree(); });
  treeCanvas.addEventListener("click", () => { if (state.tree.hover >= 0) openTreeNode(state.tree.hover); });
  $(".pc-run-link").addEventListener("click", () => copyRunLink());
  $(".pc-run-download").addEventListener("click", () => downloadRun());
  $<HTMLInputElement>(".pc-run-load input").addEventListener("change", (e) => {
    const el = e.target as HTMLInputElement, file = el.files?.[0];
    if (file) loadRun(file).finally(() => { el.value = ""; });
  });
  input(ev, "shock").addEventListener("change", (e) => {
    $(".pc-shock-opts").hidden = !(e.target as HTMLInputElement).checked;
  });
  const traits = E.DESCRIPTOR_KEYS.map((k) => `<option value="${k}">${E.DESCRIPTORS[k].label}</option>`).join("");
  select(ev, "ax").innerHTML = traits; select(ev, "ay").innerHTML = traits;
  select(ev, "ax").value = "mean_levels"; select(ev, "ay").value = "open_share";
  select(ev, "growth").addEventListener("change", (e) => {
    const pm = (e.target as HTMLSelectElement).value === "piecemeal";
    $(".pc-growth-opts").hidden = !pm;
    $(".pc-growth-note").hidden = !pm;
  });
  select(ev, "search").addEventListener("change", (e) => {
    const elites = (e.target as HTMLSelectElement).value === "map-elites";
    $(".pc-elite-opts").hidden = !elites;
    $(".pc-promote").hidden = elites;
  });
  const promotable = `<option value="">none</option>` + E.OBJECTIVE_KEYS
    .map((k) => `<option value="${k}">${(E.METRICS[k] as E.Metric).label}</option>`).join("");
  select(ev, "promote1").innerHTML = promotable; select(ev, "promote2").innerHTML = promotable;
  select(form(".pc-breed form"), "bias").innerHTML = `<option value="">nothing</option>`
    + `<optgroup label="scores">${BIAS.filter((o) => o.key.startsWith("s:")).map((o) => `<option value="${o.key}">${o.label}</option>`).join("")}</optgroup>`
    + `<optgroup label="form metrics">${BIAS.filter((o) => o.key.startsWith("m:")).map((o) => `<option value="${o.key}">${o.label}</option>`).join("")}</optgroup>`;
  $<HTMLSelectElement>(".pc-measures").innerHTML = `<option value="scores">the five scores</option>`
    + X.GROUPS.map(([name]) => `<option value="${name}">${name}</option>`).join("");
  $(".pc-measures").addEventListener("change", (e) => {
    state.explore.measures = (e.target as HTMLSelectElement).value;
    drawExplorePlot(); drawExtremes();
  });
  // Explore: switch views, point at designs, pick one.
  $(".pc-explore-tabs").addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("[data-view]");
    if (b) { state.explore.view = b.dataset.view as ExploreView; drawExplore(); }
  });
  const plot = $(".pc-explore-plot");
  plot.addEventListener("pointermove", (e) => {
    const x = state.explore, k = x.hit ? x.hit(e.offsetX, e.offsetY) : -1;
    if (k === x.hover) return;
    x.hover = k;
    const d = x.kept[k];
    $(".pc-explore-readout").textContent = d ? `${d.name} · ${Math.round(d.floorArea)} ha · ${d.levels.toFixed(1)} storeys · `
      + E.SCORE_KEYS.map((s) => `${E.SCORES[s][0]} ${E.SCORES[s][1](d.scores[s])}`).join(" · ") : "";
    drawExplorePlot();
  });
  plot.addEventListener("pointerleave", () => { state.explore.hover = -1; $(".pc-explore-readout").textContent = ""; drawExplorePlot(); });
  plot.addEventListener("click", () => { if (state.explore.hover >= 0) pickKept(state.explore.hover); });
  for (const sel of [".pc-archive", ".pc-extremes"]) {
    $(sel).addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>("[data-k]");
      if (b) pickKept(+b.dataset.k!);
    });
  }
  $(".pc-pick").addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("[data-pick]"), k = state.explore.selected;
    if (!b || k < 0) return;
    if (b.dataset.pick === "pen") toPen(keptItem(k));
    else choose(keptItem(k));
  });
  $(".pc-locks-clear").addEventListener("click", () => { state.locks = null; state.lockNote = []; drawEvolve(); drawDetail(); });
  $(".pc-detail").addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    const b = t.closest<HTMLElement>("[data-lock]");
    if (b) lock(+b.dataset.lock!, b.dataset.label!);
    if (t.closest(".pc-to-pen") && state.selected) toPen(state.selected);
    if (t.closest(".pc-to-mass") && state.selected) massSelected();
  });
  $(".pc-syntax-measure").addEventListener("change", (e) => {
    state.syntax.measure = (e.target as HTMLSelectElement).value;
    drawSyntax();
  });
  $(".pc-syntax-choice").addEventListener("click", () => exactChoice());
  const shockForm = form(".pc-shock-form");
  $(".pc-shock").addEventListener("toggle", () => {
    if (!select(shockForm, "preset").options.length) setShockKind(shockSiteOf().coastal ? "sea" : "rain");
    drawShock();
  });
  select(shockForm, "kind").addEventListener("change", (e) => { setShockKind((e.target as HTMLSelectElement).value as ShockKind); drawShock(); });
  select(shockForm, "preset").addEventListener("change", (e) => {
    const k = (e.target as HTMLSelectElement).value, p = shockPresets(select(shockForm, "kind").value as ShockKind)[+k];
    if (k !== "" && p) input(shockForm, "value").value = String(p.value);
    drawShock();
  });
  input(shockForm, "value").addEventListener("input", () => { select(shockForm, "preset").value = ""; drawShock(); });
  shockForm.addEventListener("submit", (e) => e.preventDefault());
  // Drag the 3D view to turn it.
  const solid = $(".pc-solid");
  let drag: number | null = null;
  solid.addEventListener("pointerdown", (e) => { drag = e.clientX; solid.setPointerCapture(e.pointerId); });
  solid.addEventListener("pointermove", (e) => {
    if (drag === null) return;
    state.bearing += (e.clientX - drag) * 0.01; drag = e.clientX; drawSolid();
  });
  solid.addEventListener("pointerup", () => { drag = null; });
  $(".pc-more").addEventListener("click", () => { state.showAll = !state.showAll; drawFamilies(); });
  form(".pc-breed form").addEventListener("submit", (e) => { e.preventDefault(); breed(); });
  $(".pc-add-random").addEventListener("click", () => {
    for (let k = 0; k < 4; k++) { state.brood += 1; state.pen.push({ name: `R${state.brood}`, genome: E.randomGenome(rng) }); }
    drawBreed(); drawEvolve();
  });
  // Redraw on resize and when the page theme changes.
  let t: ReturnType<typeof setTimeout>;
  addEventListener("resize", () => { clearTimeout(t); t = setTimeout(drawAll, 150); });
  new MutationObserver(() => { if (state.site) drawAll(); })
    .observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "style"] });
}

wire();
loadSites().catch((err) => { $(".pc-status").textContent = `Could not load the sites: ${err.message}`; });
