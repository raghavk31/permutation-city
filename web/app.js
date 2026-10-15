// Permutation City: the page. Chapters: layers, rules, one genome, evolution, families,
// breeding. Data: dist/<site>.json from `pc export`; engine: engine.js (same as Python).
import * as E from "./engine.js";
import * as Draw from "./draw.js";

const root = document.querySelector("[data-pc]");
const DATA = root.dataset.pc.replace(/\/?$/, "/"); // where sites.json and <site>.json live
const $ = (sel) => root.querySelector(sel);
const $$ = (sel) => [...root.querySelectorAll(sel)];

const state = {
  sites: {}, id: null, site: null, G: null, worker: null,
  genome: null, run: null, families: [], selected: null,
  pen: [], children: [], brood: 0, locks: null, lockNote: [], bearing: -0.55,
  layer: "ground",
};
let P = Draw.palette();
const rng = E.makeRng(Date.now() % 2 ** 31);

// --- helpers --------------------------------------------------------------------------

const fmtHa = (v) => `${Math.round(v).toLocaleString("en-IN")} ha`;
const pct = (v) => `${Math.round(v * 100)}%`;
function scoreLine(d) {
  const s = d.scores, st = E.stats(d, state.G);
  return `<b>${fmtHa(st.floor_area_ha)}</b> · ${st.mean_levels.toFixed(1)} storeys avg<br>`
    + `storage ${pct(s.storage)} · +${s.heat.toFixed(1)}°C · ${Math.round(s.carbon)} kg/m²<br>`
    + `daylight ${pct(s.daylight)} · human scale ${pct(s.human)}`;
}
function grown(genome) {
  const d = E.grow(genome, state.G, state.locks);
  E.evaluate(d, state.G);
  return d;
}
const aspect = () => Draw.aspectOf(state.site.design.x, state.site.design.y);
const gridAspect = () => Draw.aspectOf(state.site.grid.x, state.site.grid.y);

// --- site -----------------------------------------------------------------------------

async function loadSites() {
  state.sites = await (await fetch(`${DATA}sites.json`)).json();
  const bar = $(".pc-sites");
  bar.innerHTML = Object.entries(state.sites)
    .map(([id, s]) => `<button type="button" data-site="${id}">${s.name}</button>`).join("");
  bar.addEventListener("click", (e) => { const b = e.target.closest("[data-site]"); if (b) loadSite(b.dataset.site); });
  await loadSite(Object.keys(state.sites)[0]);
}

async function loadSite(id) {
  $$(".pc-sites button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.site === id)));
  $(".pc-status").textContent = "loading the site ...";
  state.site = await (await fetch(`${DATA}${id}.json`)).json();
  state.id = id;
  state.G = E.prepare(state.site);
  Object.assign(state, { run: null, families: [], selected: null, pen: [], children: [], locks: null, lockNote: [] });
  state.worker?.terminate();
  state.worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
  state.worker.postMessage({ type: "site", site: state.site });
  const m = state.site.meta;
  $(".pc-status").textContent = `${m.name} · design ground ${fmtHa(m.design_ha)} · brief ${fmtHa(m.target_ha)} of floor area (±10%) · `
    + `design storm ${m.design_storm_mm} mm`;
  $(".pc-credits").textContent = `Data: ${m.credits.join(" · ")}.`;
  state.genome = E.randomGenome(rng);
  drawAll();
}

function drawAll() {
  P = Draw.palette();
  drawLayer();
  drawRules();
  drawGenome();
  drawEvolve();
  drawFamilies();
  drawBreed();
}

// --- 01 layers ------------------------------------------------------------------------

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
};
function quantiles(a, q0, q1) {
  const s = [...a].sort((x, y) => x - y);
  return [s[Math.floor(q0 * (s.length - 1))], s[Math.floor(q1 * (s.length - 1))]];
}

function drawLayer() {
  const g = state.site.grid, L = LAYERS[state.layer];
  const hasSea = Object.keys(state.site.meta.sea_levels || {}).length > 0;
  $$(".pc-layer-tabs button").forEach((b) => {
    b.setAttribute("aria-pressed", String(b.dataset.layer === state.layer));
    b.hidden = b.dataset.layer === "flood" && !hasSea;
  });
  const [lo, hi] = L.range(g);
  const colourOf = (i) => {
    if (g.water[i]) return P.sea;
    const v = L.value(g, i);
    if (state.layer === "industrial") return v ? P.blues[3] : P.retained;
    if (state.layer === "flood" && v <= 0) return P.retained;
    return Draw.ramp(P.blues, (v - lo) / (hi - lo || 1));
  };
  const canvas = $(".pc-layer canvas");
  const v = Draw.layer(canvas, state.site, colourOf, P, { aspect: gridAspect(), labels: true });
  $(".pc-layer .pc-note").textContent = `${L.note}${state.layer === "industrial" ? "" : ` · ${L.unit(lo)} to ${L.unit(hi)}`}`;
  canvas.onpointermove = (e) => {
    const i = Draw.cellAt(v, g.x, g.y, e.offsetX, e.offsetY, state.site.meta.hex_radius);
    $(".pc-layer .pc-readout").textContent = i < 0 ? "" : g.water[i] ? "water"
      : Object.entries(LAYERS).filter(([k]) => k !== "flood" || hasSea)
        .map(([, l]) => `${l.label} ${l.unit(l.value(g, i))}`).join(" · ");
  };
}

// --- 02 rules -------------------------------------------------------------------------

const STATE_NAMES = ["forbidden", "retained", "constrained", "open"];
function drawRules() {
  const g = state.site.grid, cols = [P.water, P.retained, P.build, P.green];
  const canvas = $(".pc-rules canvas");
  const v = Draw.layer(canvas, state.site, (i) => (g.water[i] ? P.sea : cols[g.state[i]]), P, { aspect: gridAspect() });
  const area = state.site.meta.cell_area / 1e4;
  const ha = [0, 0, 0, 0];
  g.state.forEach((s, i) => { if (!g.water[i]) ha[s] += area; });
  const notes = { forbidden: "never built on", retained: "kept as context", constrained: "buildable with limits", open: "the genes decide" };
  $(".pc-rules .pc-legend").innerHTML = [0, 2, 3, 1].map((s) => `<span><i style="background:${cols[s]}"></i>`
    + `${STATE_NAMES[s]}: ${notes[STATE_NAMES[s]]} · ${fmtHa(ha[s])}</span>`).join("");
  canvas.onpointermove = (e) => {
    const i = Draw.cellAt(v, g.x, g.y, e.offsetX, e.offsetY, state.site.meta.hex_radius);
    $(".pc-rules .pc-readout").textContent = i < 0 ? "" : g.water[i] ? "water"
      : `${STATE_NAMES[g.state[i]]}${g.reasons[i] ? `: ${g.reasons[i]}` : ""}`;
  };
}

// --- 03 one genome --------------------------------------------------------------------

function drawGenome() {
  const d = grown(state.genome);
  Draw.plan($(".pc-genome canvas"), state.site, d, P, { aspect: aspect(), attractors: true });
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

function evolveOptions() {
  const f = $(".pc-evolve form");
  const shock = f.shock.checked ? [Math.min(+f.shockAt.value, +f.gens.value), +f.shockX.value] : null;
  return {
    generations: +f.gens.value, pop: +f.pop.value, seed: Math.floor(rng.random() * 1e9),
    shock, locked: state.locks ? Array.from(state.locks) : null,
    start: f.fromPen.checked ? state.pen.map((p) => p.genome) : null,
  };
}

function runEvolution() {
  const opts = evolveOptions();
  const btn = $(".pc-evolve button[type=submit]");
  btn.disabled = true;
  const rows = [];
  const t0 = performance.now();
  state.worker.onmessage = (e) => {
    const m = e.data;
    if (m.type === "progress") {
      rows.push(m.row);
      $(".pc-progress").textContent = `generation ${m.gen} of ${opts.generations}`;
      drawCharts(rows, opts);
    } else if (m.type === "done") {
      btn.disabled = false;
      const secs = ((performance.now() - t0) / 1000).toFixed(1);
      state.run = { history: m.history, everyone: m.everyone, frontSize: m.frontSize, opts };
      state.families = m.families.map((f) => ({ ...f, design: grown(f.genome) }));
      state.selected = state.families[0] || null;
      state.showAll = false;
      $(".pc-progress").textContent = `${m.everyone.toLocaleString("en-IN")} designs grown in ${secs} s · `
        + `${m.frontSize} on the front, in ${state.families.length} families`;
      drawFamilies();
    }
  };
  state.worker.postMessage({ type: "evolve", options: opts });
}

function drawCharts(rows, opts) {
  const charts = [["on_brief", "designs on brief", (v) => `${v}`],
    ...Object.entries(E.SCORES).map(([k, [label, fmt, up]]) => [k, `best ${label}${up ? "" : " (lower is better)"}`, fmt])];
  const box = $(".pc-charts");
  if (box.children.length !== charts.length) {
    box.innerHTML = charts.map(([k, t]) => `<figure><figcaption>${t}</figcaption><canvas data-k="${k}"></canvas></figure>`).join("");
  }
  for (const [k, , fmt] of charts) {
    Draw.sparkline(box.querySelector(`[data-k="${k}"]`), rows.map((r) => r[k]), P,
      { format: fmt, marker: opts?.shock ? opts.shock[0] : null });
  }
}

function drawEvolve() {
  $(".pc-locks").textContent = state.locks ? `Locked: ${state.lockNote.join("; ")}.` : "";
  $(".pc-locks-clear").hidden = !state.locks;
  const f = $(".pc-evolve form");
  f.fromPen.disabled = !state.pen.length;
  f.querySelector(".pc-pen-count").textContent = state.pen.length;
  if (!state.run) { $(".pc-charts").innerHTML = ""; $(".pc-progress").textContent = ""; }
  else drawCharts(state.run.history, state.run.opts);
}

// --- 05 families ----------------------------------------------------------------------

function gallery(box, items, actions) {
  box.innerHTML = items.map((it, k) => `<figure class="pc-card${state.selected === it ? " is-on" : ""}" data-k="${k}">`
    + `<canvas></canvas><figcaption><b>${it.title}</b><span>${scoreLine(it.design)}</span>`
    + `<span class="pc-actions">${actions.map(([label]) => `<button type="button" data-act="${label}">${label}</button>`).join("")}</span>`
    + `</figcaption></figure>`).join("");
  box.querySelectorAll(".pc-card").forEach((card) => {
    const it = items[+card.dataset.k];
    Draw.plan(card.querySelector("canvas"), state.site, it.design, P, { aspect: aspect() });
    card.addEventListener("click", (e) => {
      const b = e.target.closest("[data-act]");
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
  gallery(box, shown, [["view", (it) => select(it)], ["to the pen", (it) => toPen(it)]]);
  const more = $(".pc-more");
  more.hidden = state.families.length <= 10;
  more.textContent = state.showAll ? "show the first 10" : `show all ${state.families.length} families`;
  drawDetail();
}

function select(it) {
  state.selected = it;
  drawFamilies();
  drawBreedGalleries();
  $(".pc-detail").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function drawDetail() {
  const it = state.selected, box = $(".pc-detail");
  if (!it) { box.hidden = true; return; }
  box.hidden = false;
  box.querySelector("h3").textContent = it.title;
  box.querySelector(".pc-scores").innerHTML = scoreLine(it.design);
  Draw.plan(box.querySelector(".pc-plan"), state.site, it.design, P, { aspect: aspect(), attractors: true, locked: state.locks });
  drawSolid();
}

function drawSolid() {
  const it = state.selected;
  if (it) Draw.solid($(".pc-solid"), state.site, it.design, P, { bearing: state.bearing });
}

function lock(code, label) {
  const d = state.selected?.design;
  if (!d) return;
  state.locks = state.locks || new Int8Array(state.G.n);
  d.use.forEach((u, i) => { if (u === code) state.locks[i] = code; });
  state.lockNote.push(`${label} of ${state.selected.name}`);
  drawEvolve();
  drawDetail();
}

function toPen(it) {
  if (!state.pen.some((p) => p.name === it.name)) state.pen.push({ name: it.name, genome: it.design.genome, title: it.name });
  drawBreed();
  drawEvolve();
}

// --- 06 breeding ----------------------------------------------------------------------

function drawBreed() {
  const f = $(".pc-breed form");
  const opts = state.pen.map((p) => `<option>${p.name}</option>`).join("");
  f.a.innerHTML = opts; f.b.innerHTML = opts;
  if (state.pen.length > 1) f.b.selectedIndex = 1;
  f.querySelector("button[type=submit]").disabled = state.pen.length < 2;
  drawBreedGalleries();
}

function drawBreedGalleries() {
  const pen = state.pen.map((p) => ({ ...p, title: p.name, design: grown(p.genome) }));
  gallery($(".pc-pen"), pen, [["view", (it) => select(it)], ["remove", (it) => {
    state.pen = state.pen.filter((p) => p.name !== it.name); drawBreed(); drawEvolve();
  }]]);
  if (!pen.length) $(".pc-pen").innerHTML = `<p class="pc-muted">Empty. Send families here, or add random designs.</p>`;
  const kids = state.children.map((c) => ({ ...c, title: c.name, design: grown(c.genome) }));
  $(".pc-children-head").hidden = !kids.length;
  if (kids.length) $(".pc-children-head").textContent = `Children of ${kids[0].parents.join(" × ")}`;
  gallery($(".pc-children"), kids, [["keep", (it) => toPen(it)], ["view", (it) => select(it)]]);
}

function breed() {
  const f = $(".pc-breed form");
  const a = state.pen.find((p) => p.name === f.a.value), b = state.pen.find((p) => p.name === f.b.value);
  if (!a || !b) return;
  state.brood += 1;
  state.children = E.breed(a.genome, b.genome, rng, 6)
    .map((g, k) => ({ name: `B${state.brood}.${k + 1}`, genome: g, parents: [a.name, b.name] }));
  drawBreedGalleries();
}

// --- wiring ---------------------------------------------------------------------------

function wire() {
  $(".pc-layer-tabs").addEventListener("click", (e) => {
    const b = e.target.closest("[data-layer]");
    if (b) { state.layer = b.dataset.layer; drawLayer(); }
  });
  $(".pc-genome .pc-another").addEventListener("click", () => { state.genome = E.randomGenome(rng); drawGenome(); });
  $(".pc-evolve form").addEventListener("submit", (e) => { e.preventDefault(); runEvolution(); });
  $(".pc-evolve form").shock.addEventListener("change", (e) => { $(".pc-shock-opts").hidden = !e.target.checked; });
  $(".pc-locks-clear").addEventListener("click", () => { state.locks = null; state.lockNote = []; drawEvolve(); drawDetail(); });
  $(".pc-detail").addEventListener("click", (e) => {
    const b = e.target.closest("[data-lock]");
    if (b) lock(+b.dataset.lock, b.dataset.label);
    if (e.target.closest(".pc-to-pen") && state.selected) toPen(state.selected);
  });
  // Drag the 3D view to turn it.
  const solid = $(".pc-solid");
  let drag = null;
  solid.addEventListener("pointerdown", (e) => { drag = e.clientX; solid.setPointerCapture(e.pointerId); });
  solid.addEventListener("pointermove", (e) => {
    if (drag === null) return;
    state.bearing += (e.clientX - drag) * 0.01; drag = e.clientX; drawSolid();
  });
  solid.addEventListener("pointerup", () => { drag = null; });
  $(".pc-more").addEventListener("click", () => { state.showAll = !state.showAll; drawFamilies(); });
  $(".pc-breed form").addEventListener("submit", (e) => { e.preventDefault(); breed(); });
  $(".pc-add-random").addEventListener("click", () => {
    for (let k = 0; k < 4; k++) { state.brood += 1; state.pen.push({ name: `R${state.brood}`, genome: E.randomGenome(rng) }); }
    drawBreed(); drawEvolve();
  });
  // Redraw on resize and when the page theme changes.
  let t;
  addEventListener("resize", () => { clearTimeout(t); t = setTimeout(drawAll, 150); });
  new MutationObserver(() => { if (state.site) drawAll(); })
    .observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "style"] });
}

wire();
loadSites().catch((err) => { $(".pc-status").textContent = `Could not load the sites: ${err.message}`; });
