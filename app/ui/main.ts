// Permutation City: the page. Chapters: layers, rules, one genome, evolution, explore,
// families, breeding. Data: public/sites/<site>.json from `pc export`; engine: app/engine (same as Python).
import * as Comlink from "comlink";
import * as E from "../engine";
import type { EngineWorker, EvolveResult, FamilyLead, Kept, RunRequest } from "../engine/worker";
import * as Draw from "./draw";
import * as X from "./explore";
import { describe as describeBrief } from "./new/brief";
import * as Sites from "./sites";
import "./style.css";

const root = document.querySelector<HTMLElement>("[data-pc]")!;
const DATA = Sites.DATA; // where sites.json and <site>.json live
const $ = <T extends HTMLElement = HTMLElement>(sel: string) => root.querySelector<T>(sel)!;
const $$ = (sel: string) => [...root.querySelectorAll<HTMLElement>(sel)];

/** A design shown in a gallery: a family lead, a design in the pen, or a child. */
interface Item { name: string; title: string; genome: number[]; design: E.Design; size?: number; parents?: string[] }
interface PenEntry { name: string; genome: number[]; title?: string; parents?: string[] }
interface RunSummary { history: E.HistoryRow[]; everyone: number; frontSize: number; opts: RunOptions }
type RunOptions = Omit<RunRequest, "locked"> & { locked: number[] | null; typologySeeds?: number };
type ExploreView = "matrix" | "parallel" | "archive";

const state = {
  sites: {} as Record<string, { name: string }>, id: null as string | null,
  site: null as E.SiteExport | null, G: null as E.Ground | null,
  worker: null as { raw: Worker; api: Comlink.Remote<EngineWorker> } | null,
  genome: [] as number[], run: null as RunSummary | null, families: [] as Item[], selected: null as Item | null,
  pen: [] as PenEntry[], children: [] as PenEntry[], brood: 0, locks: null as Int8Array | null, lockNote: [] as string[],
  bearing: -0.55, layer: "ground" as LayerKey, showAll: false,
  // A confirmed brief from the link: how genes are read, and whether to seed by typology.
  brief: null as Sites.LinkedBrief | null, ranges: E.DEFAULT_RANGES as E.Ranges, linkRules: null as string | null,
  // What the last run kept, for Explore; designs regrown as they're drawn.
  explore: { kept: [] as Kept[], archive: null as E.ArchiveInfo | null, view: "matrix" as ExploreView, measures: "scores",
    selected: -1, hover: -1, grown: new Map<number, E.Design>(), hit: null as ((x: number, y: number) => number) | null },
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
  return `<b>${fmtHa(st.floor_area_ha)}</b> · ${st.mean_levels.toFixed(1)} storeys avg<br>`
    + `storage ${pct(s.storage)} · +${s.heat.toFixed(1)}°C · ${Math.round(s.carbon)} kg/m²<br>`
    + `daylight ${pct(s.daylight)} · human scale ${pct(s.human)}`;
}
function grown(genome: number[]) {
  const d = E.grow(genome, G(), state.locks, state.ranges);
  E.evaluate(d, G());
  return d;
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
    if (b) loadSite(b.dataset.site!);
  });
  await loadSite(linked ? linked.id : Object.keys(state.sites)[0], linked?.rules ?? null, linked?.brief ?? null);
  if (linked && location.hash) document.querySelector(location.hash)?.scrollIntoView();
}

function startWorker(s: E.SiteExport) {
  state.worker?.raw.terminate();
  const raw = new Worker(new URL("../engine/worker.ts", import.meta.url), { type: "module" });
  const api = Comlink.wrap<EngineWorker>(raw);
  api.setSite(s);
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
  state.G = E.prepare(site());
  Object.assign(state, { run: null, families: [], selected: null, pen: [], children: [], locks: null, lockNote: [] });
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
  const warnings = m.service?.warnings ?? [];
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
  drawGenome();
  drawEvolve();
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
} satisfies Record<string, LayerDef>;
type LayerKey = keyof typeof LAYERS;

function quantiles(a: number[], q0: number, q1: number): [number, number] {
  const s = [...a].sort((x, y) => x - y);
  return [s[Math.floor(q0 * (s.length - 1))], s[Math.floor(q1 * (s.length - 1))]];
}

function drawLayer() {
  const g = site().grid, L: LayerDef = LAYERS[state.layer];
  const hasSea = Object.keys(site().meta.sea_levels || {}).length > 0;
  $$(".pc-layer-tabs button").forEach((b) => {
    b.setAttribute("aria-pressed", String(b.dataset.layer === state.layer));
    b.hidden = b.dataset.layer === "flood" && !hasSea;
  });
  const [lo, hi] = L.range(g);
  const colourOf = (i: number) => {
    if (g.water[i]) return P.sea;
    const v = L.value(g, i);
    if (state.layer === "industrial") return v ? P.blues[3] : P.retained;
    if (state.layer === "flood" && v <= 0) return P.retained;
    return Draw.ramp(P.blues, (v - lo) / (hi - lo || 1));
  };
  const canvas = $<HTMLCanvasElement>(".pc-layer canvas");
  const v = Draw.layer(canvas, site(), colourOf, P, { aspect: gridAspect(), labels: true });
  $(".pc-layer .pc-note").textContent = `${L.note}${state.layer === "industrial" ? "" : ` · ${L.unit(lo)} to ${L.unit(hi)}`}`;
  canvas.onpointermove = (e) => {
    const i = Draw.cellAt(v, g.x, g.y, e.offsetX, e.offsetY, Draw.shapeOf(site()).r);
    $(".pc-layer .pc-readout").textContent = i < 0 ? "" : g.water[i] ? "water"
      : (Object.entries(LAYERS) as [LayerKey, LayerDef][]).filter(([k]) => k !== "flood" || hasSea)
        .map(([, l]) => `${l.label} ${l.unit(l.value(g, i))}`).join(" · ");
  };
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

// --- 03 one genome --------------------------------------------------------------------

function drawGenome() {
  const d = grown(state.genome);
  Draw.plan($<HTMLCanvasElement>(".pc-genome canvas"), site(), d, P, { aspect: aspect(), attractors: true });
  const s = d.settings;
  $(".pc-genome .pc-scores").innerHTML = scoreLine(d)
    + `<br><span class="pc-muted">water ${pct(s.water_share)} · green ${pct(s.green_share)} · follows the site's water ${pct(s.follow_water)} · `
    + `coverage ${pct(s.coverage)}</span>`;
  // The 47 numbers, as a strip: attractor slots in 8 groups of 5, then the 7 site-wide genes.
  $(".pc-genes").innerHTML = state.genome.map((gv, k) => {
    const slot = k < 40 ? Math.floor(k / 5) : -1;
    const kind = slot >= 0 ? d.attractors[slot].kind : "site";
    return `<i title="${k < 40 ? `attractor ${slot + 1} (${kind}): ${["x", "y", "reach", "weight", "kind"][k % 5]}` : E.GLOBAL_GENES[k - 40]} = ${gv.toFixed(2)}" `
      + `class="g-${kind}" style="--v:${gv}"></i>`;
  }).join("");
}

// --- 04 evolution ---------------------------------------------------------------------

function evolveOptions(): RunOptions {
  const f = form(".pc-evolve form");
  const gens = +select(f, "gens").value;
  const shock: [number, number] | null = input(f, "shock").checked
    ? [Math.min(+input(f, "shockAt").value, gens), +input(f, "shockX").value] : null;
  const pop = +select(f, "pop").value, seed = Math.floor(rng.random() * 1e9);
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

async function runEvolution() {
  const opts = evolveOptions();
  const btn = $<HTMLButtonElement>(".pc-evolve button[type=submit]");
  btn.disabled = true;
  const rows: E.HistoryRow[] = [];
  const t0 = performance.now();
  const onProgress = (gen: number, row: E.HistoryRow) => {
    rows.push(row);
    $(".pc-progress").textContent = `generation ${gen} of ${opts.generations}`;
    drawCharts(rows, opts);
  };
  let m: EvolveResult;
  try {
    const { typologySeeds: _, ...engineOpts } = opts;
    m = await state.worker!.api.evolve(engineOpts, Comlink.proxy(onProgress));
  } catch (err) {
    $(".pc-progress").textContent = `The run failed: ${(err as Error).message}`;
    btn.disabled = false;
    return;
  }
  btn.disabled = false;
  const secs = ((performance.now() - t0) / 1000).toFixed(1);
  state.run = { history: m.history, everyone: m.everyone, frontSize: m.frontSize, opts };
  state.families = m.families.map((f: FamilyLead) => ({ ...f, title: f.name, design: grown(f.genome) }));
  const w = state.brief?.brief.objective_weights?.value;
  if (w && Object.values(w).some((x) => x > 0)) {
    const higher = Object.fromEntries(E.SCORE_KEYS.map((k) => [k, E.SCORES[k][2]])) as Record<E.ScoreKey, boolean>;
    const order = E.weightedOrder(state.families.map((f) => f.design.scores!), w, higher);
    state.families = order.map((k) => state.families[k]);
  }
  state.selected = state.families[0] || null;
  state.showAll = false;
  resetExplore(m.kept, m.archive);
  const filled = m.archive ? ` · ${m.kept.length} of ${m.archive.bins ** 2} archive cells filled` : "";
  const ran = E.searchOf(opts), promoted = opts.objectives?.length
    ? ` · ${opts.objectives.map((k) => (E.METRICS[k] as E.Metric).label).join(" and ")} promoted, ${5 + opts.objectives.length} objectives` : "";
  $(".pc-progress").textContent = `${SEARCH_NAMES[ran]}${promoted} · ${m.everyone.toLocaleString("en-IN")} designs grown in ${secs} s${filled} · `
    + `${m.frontSize} on the front, in ${state.families.length} families`
    + (opts.typologySeeds ? ` · Generation 0 had ${opts.typologySeeds} typology seeds` : "")
    + (w ? ` · ${m.archive ? "elites judged and " : ""}families ordered by the brief's weights` : "");
  drawExplore();
  drawFamilies();
}

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
  $(".pc-locks").textContent = state.locks ? `Locked: ${state.lockNote.join("; ")}.` : "";
  $(".pc-locks-clear").hidden = !state.locks;
  const f = form(".pc-evolve form");
  input(f, "fromPen").disabled = !state.pen.length;
  f.querySelector(".pc-pen-count")!.textContent = String(state.pen.length);
  if (!state.run) { $(".pc-charts").innerHTML = ""; $(".pc-charts").dataset.sig = ""; $(".pc-progress").textContent = ""; }
  else drawCharts(state.run.history, state.run.opts);
}

// --- 05 explore -----------------------------------------------------------------------

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
    const o = state.run!.opts;
    d = E.grow(x.kept[k].genome, G(), o.locked ? Int8Array.from(o.locked) : null, o.ranges ?? E.DEFAULT_RANGES);
    d.scores = x.kept[k].scores;
    x.grown.set(k, d);
  }
  return d;
}

const keptItem = (k: number): Item => {
  const d = state.explore.kept[k];
  return { name: d.name, title: d.name, genome: d.genome, parents: d.parents, design: keptDesign(k) };
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
function metricsPanel(m: Partial<E.Metrics>, pool: E.Metrics[]): string {
  const asked = new Set<string>((state.brief?.brief.aesthetic_priorities?.value ?? []).map((p) => p.metric));
  const rows = X.GROUPS.map(([name, keys]) => `<h4>${name}</h4><dl>` + keys.map((k) => {
    const def = E.METRICS[k] as E.Metric, v = m[k]!;
    let bar = "";
    if (pool.length > 1) {
      const vs = pool.map((p) => p[k]), lo = Math.min(...vs), hi = Math.max(...vs);
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
  Draw.plans(buttons.map((b) => b.querySelector("canvas")!), site(), buttons.map((b) => keptDesign(+b.dataset.k!)), P, a);
}

function drawPick() {
  const x = state.explore, box = $(".pc-pick");
  box.hidden = x.selected < 0;
  if (x.selected < 0) return;
  const d = keptDesign(x.selected), k = x.kept[x.selected];
  Draw.plan(box.querySelector<HTMLCanvasElement>("canvas")!, site(), d, P, { aspect: aspect() });
  const where = k.cell !== undefined && x.archive
    ? ` · archive column ${k.cell % x.archive.bins + 1}, row ${Math.floor(k.cell / x.archive.bins) + 1} from the bottom` : "";
  box.querySelector("h3")!.textContent = `${k.name}${X.onFront(k) ? " · on the front" : X.onBrief(k) ? "" : " · off the brief"}${where}`;
  box.querySelector(".pc-scores")!.innerHTML = scoreLine(d);
  box.querySelector(".pc-metrics-body")!.innerHTML = metricsPanel(k.metrics, x.kept.map((e) => e.metrics));
}

function drawExtremes() {
  const x = state.explore;
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

// --- 06 families ----------------------------------------------------------------------

type Action = [string, (it: Item) => void];
function gallery(box: HTMLElement, items: Item[], actions: Action[]) {
  box.innerHTML = items.map((it, k) => `<figure class="pc-card${state.selected === it ? " is-on" : ""}" data-k="${k}">`
    + `<canvas></canvas><figcaption><b>${it.title}</b><span>${scoreLine(it.design)}</span>`
    + `<span class="pc-actions">${actions.map(([label]) => `<button type="button" data-act="${label}">${label}</button>`).join("")}</span>`
    + `</figcaption></figure>`).join("");
  box.querySelectorAll<HTMLElement>(".pc-card").forEach((card) => {
    const it = items[+card.dataset.k!];
    Draw.plan(card.querySelector("canvas")!, site(), it.design, P, { aspect: aspect() });
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
  if (!it) { box.hidden = true; return; }
  box.hidden = false;
  box.querySelector("h3")!.textContent = it.title;
  box.querySelector(".pc-scores")!.innerHTML = scoreLine(it.design);
  box.querySelector(".pc-metrics-body")!.innerHTML = metricsPanel(E.measure(it.design, G()), state.explore.kept.map((e) => e.metrics));
  Draw.plan(box.querySelector<HTMLCanvasElement>(".pc-plan")!, site(), it.design, P,
    { aspect: aspect(), attractors: true, locked: state.locks });
  drawSolid();
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

// --- 07 breeding ----------------------------------------------------------------------

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

function breed() {
  const f = form(".pc-breed form");
  const a = state.pen.find((p) => p.name === select(f, "a").value);
  const b = state.pen.find((p) => p.name === select(f, "b").value);
  if (!a || !b) return;
  state.brood += 1;
  // Biased: breed four times as many and keep the six best on the chosen measure.
  const bias = BIAS.find((o) => o.key === select(f, "bias").value);
  let kids = E.breed(a.genome, b.genome, rng, bias ? 24 : 6).map((g) => ({ g, v: 0 }));
  if (bias) {
    for (const kid of kids) kid.v = bias.value(grown(kid.g));
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
    return { key: `m:${k}`, label: m.label, up: m.up!, fmt: m.fmt, value: (d: E.Design) => E.measure(d, G(), [k])[k]! };
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
  const ev = form(".pc-evolve form");
  ev.addEventListener("submit", (e) => { e.preventDefault(); runEvolution(); });
  input(ev, "shock").addEventListener("change", (e) => {
    $(".pc-shock-opts").hidden = !(e.target as HTMLInputElement).checked;
  });
  const traits = E.DESCRIPTOR_KEYS.map((k) => `<option value="${k}">${E.DESCRIPTORS[k].label}</option>`).join("");
  select(ev, "ax").innerHTML = traits; select(ev, "ay").innerHTML = traits;
  select(ev, "ax").value = "mean_levels"; select(ev, "ay").value = "open_share";
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
  });
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
