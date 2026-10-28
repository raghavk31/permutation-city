// The workbench's state: which step is open, the site, and what each step's panels share.
// The URL carries the site, the step, the rules and brief and, once a run is done, what it was
// bred from (saved.ts), so the address bar always opens the same view and the same run.
import * as Comlink from "comlink";
import type { Snippet } from "../../brief/chunk";
import * as E from "../../engine";
import type { EngineWorker, EvolveResult, FamilyLead } from "../../engine/worker";
import * as Fam from "../families";
import * as Sites from "../sites";
import { MassStep } from "./mass.svelte";
import * as Saved from "./saved";


export type StepId = "site" | "layers" | "rules" | "landform" | "draw" | "brief" | "evolve" | "explore" | "massing";

// COPY: step names
export const STEPS: { id: StepId; name: string; built: boolean }[] = [
  { id: "site", name: "Site", built: true },
  { id: "layers", name: "Layers", built: true },
  { id: "rules", name: "Rules", built: true },
  { id: "landform", name: "Landform", built: true },
  { id: "draw", name: "Draw", built: true },
  { id: "brief", name: "Brief", built: true },
  { id: "evolve", name: "Evolve", built: true },
  { id: "explore", name: "Explore", built: true },
  { id: "massing", name: "Massing", built: true },
];

/** A ready-made site, as sites.json lists it (pc/export.py `index_entry`). */
export interface SiteCard {
  name: string; design_ha: number; target_ha: number; origin?: [number, number]; cells?: number;
  relief?: "flat" | "gentle" | "pronounced" | null; relief_m?: number | null; confidence?: "high" | "low" | null;
  terrain?: string | null; outline?: [number, number][]; thumb?: string[];
}

/** How hilly, in plain words (design system, "Plain words"). */
export const HILLY: Record<string, string> = { flat: "flat", gentle: "gently sloping", pronounced: "hilly" };

/** What the Site step's map offers the rail: moving the map and the drawing tool. */
export interface MapApi {
  flyTo: (center: [number, number], zoom?: number) => void;
  fitBounds: (b: [number, number, number, number]) => void;
  startDrawing: () => void;
  clearDrawing: () => void;
  center: () => [number, number] | undefined;
}

/** The names of the rules that never build, to say why a move conflicts. */
const neverBuilt = (r: E.RuleSet) => new Set(r.list.filter((x) => x.kind === "forbidden").map((x) => x.name));

const store = {
  get(key: string): string | null { try { return localStorage.getItem(key); } catch { return null; } },
  set(key: string, v: string) { try { localStorage.setItem(key, v); } catch { /* private window */ } },
};

class Bench {
  step = $state<StepId>("site");
  index = $state.raw<Record<string, SiteCard>>({});
  /** A ready-made site selected on the Site step (not opened yet). */
  picked = $state<string | null>(null);
  /** The open site. */
  siteId = $state<string | null>(null);
  site = $state.raw<E.SiteExport | null>(null);
  loading = $state(false);
  error = $state("");

  // the Site step's drawing
  polygon = $state.raw<number[][][] | null>(null);
  drawing = $state(false);
  map: MapApi | null = null;

  // the Layers step
  layerOn = $state<Record<string, boolean>>({});
  opacity = $state<Record<string, number>>({});
  hover = $state(-1);
  layerView = $state<"map" | "stack">("map");

  // the Rules step: the rules as edited, with undo and redo; the rule pointed at; before/after
  rules = $state.raw<E.RuleSet | null>(null);
  past = $state.raw<E.RuleSet[]>([]);
  future = $state.raw<E.RuleSet[]>([]);
  ruleHover = $state<number | null>(null);
  showBefore = $state(false);

  // the Landform step: ridges switched off (by ridge id)
  ridgesOff = $state.raw<ReadonlySet<number>>(new Set());

  // the Draw step: moves drawn on the map (moves.ts), with undo and redo; the tool in hand;
  // the move pointed at; what a new spine and a new street take
  moves = $state.raw<E.Move[]>([]);
  movesPast = $state.raw<E.Move[][]>([]);
  movesFuture = $state.raw<E.Move[][]>([]);
  tool = $state<E.MoveKind | null>(null);
  moveHover = $state<number | null>(null);
  spineWidth = $state(E.SPINE_WIDTH_M.default);
  streetCls = $state<2 | 3>(3);

  // the Brief step: the brief, the passages it cites, and whether it is confirmed
  brief = $state.raw<E.Brief | null>(null);
  briefSources = $state.raw<Snippet[]>([]);
  briefLocked = $state(false);

  // the Evolve step: the run's settings, its progress and its result
  settings = $state({ search: "auto" as "auto" | "map-elites", generations: 15, pop: 30, seed: 1 });
  running = $state(false);
  runGen = $state(0);
  runStarted = $state(0);
  history = $state.raw<E.HistoryRow[]>([]);
  leaders = $state.raw<E.Design[]>([]);
  result = $state.raw<EvolveResult | null>(null);
  runSite = $state.raw<E.SiteExport | null>(null);
  runError = $state("");
  /** What the run on show was bred from (the link and the file save these). */
  runInputs = $state.raw<Saved.RunInputs | null>(null);
  /** Rebuilding a run from a link, or opening a file: what is happening, for the Evolve rail. */
  restoring = $state("");
  /** Notes on a link or file opened (older builds, things the workbench doesn't do yet). */
  notes = $state.raw<string[]>([]);
  /** While a link is being opened, the address bar keeps it (so a reload starts it again). */
  private booting = false;
  picked3 = $state(0);   // which leader or family is shown large
  /** Designs kept in the pen (the tray), with the site they were bred on. */
  pen = $state.raw<{ name: string; design: E.Design; site: E.SiteExport }[]>([]);

  // the Explore step: the view, the plot, what colours it, the brushes (an axis key to a range
  // of values), the design selected and pointed at (kept names), the pair compared
  exView = $state<"tradeoffs" | "compare" | "archive" | "tree">("tradeoffs");
  exPlot = $state<"matrix" | "parallel">("matrix");
  exColour = $state("front");
  brush = $state.raw<Record<string, [number, number]>>({});
  exSel = $state<string | null>(null);
  exHover = $state<string | null>(null);
  pair = $state<[string | null, string | null]>([null, null]);
  showAll = $state(false);
  /** Genes locked for the next run, at their decoded values (a lock narrows the gene's range to
   *  one value, so decoding needs no change and designs stay reproducible). */
  geneLocks = $state.raw<Record<string, number>>({});
  lockGene(gene: string, value: number | null) {
    const { [gene]: _, ...rest } = this.geneLocks;
    this.geneLocks = value === null ? rest : { ...rest, [gene]: value };
  }
  /** Ranges with the locked genes pinned. */
  private pinned(r: E.Ranges): E.Ranges {
    return { ...r, ...Object.fromEntries(Object.entries(this.geneLocks).map(([g, v]) => [g, [v, v]])) } as E.Ranges;
  }

  /** Any design the run made, by name: a kept design's genome, else its genome in the lineage. */
  genomeOf(name: string): number[] | null {
    const r = this.result;
    if (!r) return null;
    const k = r.kept.find((x) => x.name === name);
    if (k) return k.genome;
    const i = r.lineage.findIndex((n) => n.name === name);
    if (i < 0) return null;
    const len = r.genomes.length / r.lineage.length;
    return Array.from(r.genomes.subarray(i * len, (i + 1) * len));
  }

  /** Designs grown whole for drawing, by kept name (a run's leads arrive grown). */
  grown = $state.raw<Map<string, E.Design>>(new Map());
  private growing = new Set<string>();
  /** The Massing step; its design is set by massDesign. */
  mass = new MassStep();
  private runOff: number[] = [];
  private runCount = 0;
  private ground: { site: E.SiteExport; G: E.Ground } | null = null;

  /** Open a kept design in the Massing step (it must have grown). */
  massDesign(name: string) {
    const site = this.runSite, d = this.grown.get(name);
    const genome = this.genomeOf(name);
    if (!site || !d || !genome) return false;
    if (this.ground?.site !== site) this.ground = { site, G: Sites.groundOf(site, this.runOff) };
    this.mass.open({
      src: { siteId: `${this.siteId}-run${this.runCount}`, site, G: this.ground.G, skeletonOff: this.runOff, name, genome,
        locks: null, ranges: this.runRanges, brief: this.briefLocked ? this.brief : null },
      design: d, title: this.titleOf(name),
    });
    return true;
  }
  private runRanges: E.Ranges = E.DEFAULT_RANGES;

  /** The front's families as a few representatives, the most distinct first, each named for
   *  what sets it apart (families.ts), with how many designs on the front are like it. */
  reps = $derived.by(() => {
    const fams = (this.result?.families ?? []).filter((f) => f.design) as (FamilyLead & { design: E.Design })[];
    if (!fams.length || !this.runSite) return [];
    const r = Fam.representatives(fams, 6), n = this.runSite.design.x.length;
    const why = Fam.apart(r.map((x) => x.item.design), { n, cellArea: this.runSite.meta.cell_area } as E.Ground);
    // COPY: a representative's name
    return r.map((x, k) => ({ name: x.item.name, title: `Design ${k + 1} · ${why[k]}`, design: x.item.design,
      like: x.members.reduce((s, m) => s + m.size, 0), members: x.members.map((m) => m.name) }));
  });
  /** The designs the Evolve step shows: while a run goes, the best so far; afterwards, the same
   *  representatives as Explore, under the same names. */
  evolveShown = $derived.by((): { name: string; title: string; note: string; d: E.Design }[] => {
    // COPY: names in the strip
    if (this.result) return this.reps.map((r) => ({ name: r.name, title: r.title, note: `${r.like} like it`, d: r.design }));
    return this.leaders.map((d, k) => ({ name: `Best now ${k + 1}`, title: `Best now ${k + 1}`, note: `gen. ${this.runGen}`, d }));
  });
  /** Every name the run kept, with its title when it is a representative. */
  titleOf(name: string | null) {
    if (!name) return "";
    const rep = this.reps.find((r) => r.name === name)?.title;
    if (rep) return rep;
    // COPY: a design with no family title, by its generation ("G3.12" is generation 3, no. 12)
    const m = /^G(\d+)\.(\d+)$/.exec(name);
    return m ? `generation ${+m[1]}, no. ${+m[2]}` : name;
  }

  /** Grow many kept designs at once (the archive's thumbnails). */
  growMany(names: string[]) {
    const todo = names.filter((n) => !this.grown.has(n) && !this.growing.has(n));
    const ks = todo.map((n) => this.result?.kept.find((x) => x.name === n)).filter((k) => !!k);
    if (!ks.length || !this.worker) return;
    ks.forEach((k) => this.growing.add(k.name));
    this.worker.api.whole(ks.map((k) => k.genome), this.runRanges).then((ds) => {
      const m = new Map(this.grown);
      ks.forEach((k, i) => m.set(k.name, ds[i]));
      this.grown = m;
    }).catch(() => {}).finally(() => ks.forEach((k) => this.growing.delete(k.name)));
  }

  /** A kept design grown whole, or null while it grows (the map redraws when it arrives). */
  designOf(name: string | null): E.Design | null {
    if (!name) return null;
    const d = this.grown.get(name);
    if (d) return d;
    const genome = this.genomeOf(name);
    if (genome && this.worker && !this.growing.has(name)) {
      this.growing.add(name);
      this.worker.api.whole([genome], this.runRanges).then(([g]) => {
        this.grown = new Map(this.grown).set(name, g);
      }).catch(() => {}).finally(() => this.growing.delete(name));
    }
    return null;
  }

  /** The designs J and K step through on this step, in order (names; Evolve: by position). */
  private order(): string[] {
    if (this.step === "explore" && this.result) {
      const all = this.result.families.filter((f) => f.design).map((f) => f.name);
      return this.showAll ? all : this.reps.map((r) => r.name);
    }
    return [];
  }
  /** Next (1) or previous (-1) design on the open step. */
  nextDesign(dir: 1 | -1) {
    if (this.step === "evolve") {
      const n = this.evolveShown.length;
      if (n) this.picked3 = (this.picked3 + dir + n) % n;
    } else if (this.step === "explore") {
      const list = this.order();
      if (!list.length) return;
      const i = list.indexOf(this.exView === "compare" ? this.pair[1] ?? "" : this.exSel ?? "");
      const next = list[i < 0 ? 0 : (i + dir + list.length) % list.length];
      if (this.exView === "compare") this.pair = [this.pair[0] ?? this.exSel, next];
      this.exSel = next;
    } else if (this.step === "massing" && this.mass.result && !this.mass.stale) {
      const r = this.mass.result, ord = r.kept.map((_, i) => i).sort((a, b) => r.kept[a].rank - r.kept[b].rank || a - b);
      const i = ord.indexOf(this.mass.pick);
      this.mass.pick = ord[i < 0 ? 0 : (i + dir + ord.length) % ord.length];
    }
  }
  /** Keep the design open on this step in the pen (P). */
  keepCurrent() {
    if (this.step === "explore" && this.exSel) {
      const d = this.grown.get(this.exSel);
      if (d) this.keep(this.exSel, d);
    } else if (this.step === "evolve") {
      const f = this.evolveShown[this.picked3];
      if (f) this.keep(f.name, f.d);
    }
  }
  /** Open a pen item in Explore, when it is from the current run. */
  openPen(name: string) {
    if (!this.result || !this.genomeOf(name)) return false;
    this.exSel = name;
    this.go("explore");
    return true;
  }

  keep(name: string, design: E.Design) {
    if (!this.runSite || this.pen.some((p) => p.name === name)) return;
    this.pen = [...this.pen, { name, design, site: this.runSite }];
    this.sync();
  }
  private worker: { raw: Worker; api: Comlink.Remote<EngineWorker> } | null = null;

  // panels and intros
  railOpen = $state(true);
  inspOpen = $state(true);
  introSeen = $state<Record<string, boolean>>(JSON.parse(store.get("pc-wb-intro") ?? "{}"));

  constructor() {
    if (typeof window === "undefined") return;
    fetch(`${Sites.DATA}sites.json`).then((r) => r.json()).then((s) => (this.index = s)).catch(() => {});
    const q = new URLSearchParams(location.search), id = q.get("site");
    if (id) this.openLink(id, q);
  }

  stateOf(id: StepId): "done" | "now" | "todo" | "blocked" {
    if (id === this.step) return "now";
    const s = STEPS.find((x) => x.id === id)!;
    if (!s.built) return "blocked";
    if (id === "site") return this.site ? "done" : "todo";
    if (!this.site) return "blocked";
    if (id === "brief" && this.briefLocked) return "done";
    if (id === "evolve" && this.result) return "done";
    if ((id === "explore" || id === "massing") && !this.result) return "blocked";
    return "todo";
  }

  go(id: StepId) {
    if (this.stateOf(id) === "blocked") return;
    // Massing opens on the design open in Explore (the first family's lead before that)
    if (id === "massing") { const name = this.exSel ?? this.result?.families[0]?.name; if (name && this.mass.source?.src.name !== name) this.massDesign(name); }
    this.step = id;
    this.sync();
  }

  async open(id: string, step: StepId = "layers") {
    this.error = "";
    this.loading = true;
    try {
      const s = await Sites.fetchSite(id);
      if (!s.grid.layers) throw new Error("This site file is from an older export and has no layers to show.");
      this.site = s;
      Sites.warmGround(() => Sites.groundOf(s));
      this.siteId = id;
      this.picked = id;
      this.layerOn = {};
      this.opacity = {};
      this.rules = s.rules ?? null;
      this.past = []; this.future = [];
      this.ridgesOff = new Set();
      this.moves = []; this.movesPast = []; this.movesFuture = []; this.tool = null;
      this.brief = null; this.briefLocked = false;
      this.result = null; this.leaders = []; this.history = []; this.runInputs = null; this.notes = [];
      this.step = step;
      this.sync();
    } catch (e) {
      this.error = (e as Error).message;
    } finally {
      this.loading = false;
    }
  }

  /** Change the rules, keeping the old ones for undo. */
  setRules(r: E.RuleSet) {
    if (!this.rules) return;
    this.past = [...this.past, this.rules].slice(-50);
    this.future = [];
    this.rules = r;
  }
  setMoves(ms: E.Move[]) {
    this.movesPast = [...this.movesPast, this.moves].slice(-50);
    this.movesFuture = [];
    this.moves = ms;
    this.sync();
  }
  addMove(m: Omit<E.Move, "id">) {
    const id = Math.max(0, ...this.moves.map((x) => x.id)) + 1;
    this.setMoves([...this.moves, { ...m, id } as E.Move]);
  }
  removeMove(id: number) { this.setMoves(this.moves.filter((m) => m.id !== id)); }
  updateMove(id: number, patch: Partial<E.Move>) { this.setMoves(this.moves.map((m) => (m.id === id ? { ...m, ...patch } : m))); }
  /** Undo and redo follow the step: moves on the Draw step, rules elsewhere. */
  get canUndo() { return this.step === "draw" ? this.movesPast.length > 0 : this.past.length > 0; }
  get canRedo() { return this.step === "draw" ? this.movesFuture.length > 0 : this.future.length > 0; }
  undo() {
    if (this.step === "draw") {
      if (!this.movesPast.length) return;
      this.movesFuture = [this.moves, ...this.movesFuture];
      this.moves = this.movesPast[this.movesPast.length - 1];
      this.movesPast = this.movesPast.slice(0, -1);
      this.sync();
      return;
    }
    if (!this.past.length || !this.rules) return;
    this.future = [this.rules, ...this.future];
    this.rules = this.past[this.past.length - 1];
    this.past = this.past.slice(0, -1);
  }
  redo() {
    if (this.step === "draw") {
      if (!this.movesFuture.length) return;
      this.movesPast = [...this.movesPast, this.moves];
      this.moves = this.movesFuture[0];
      this.movesFuture = this.movesFuture.slice(1);
      this.sync();
      return;
    }
    if (!this.future.length || !this.rules) return;
    this.past = [...this.past, this.rules];
    this.rules = this.future[0];
    this.future = this.future.slice(1);
  }
  get edited() { return !!this.site?.rules && !!this.rules && JSON.stringify(this.rules) !== JSON.stringify(this.site.rules); }

  /** The site as a run sees it: its rules as edited, the brief's targets and rule changes,
   *  and the moves drawn on it, with any conflicts between the moves and the rules. */
  underBrief() {
    if (!this.site || !this.rules) return null;
    const b = this.brief ? Sites.withBrief(this.site, this.rules, this.brief) : null;
    const u = b ? { site: b.site, result: b.result, ranges: b.config.ranges } : { ...Sites.withRules(this.site, this.rules), ranges: E.DEFAULT_RANGES };
    const m = E.applyMoves(u.site, this.moves, u.result.state, u.result.reasons, neverBuilt(this.rules));
    return { site: m.site, result: u.result, ranges: this.pinned(u.ranges), conflicts: m.conflicts };
  }

  /** The moves on the rules as they stand (the Draw step's map and list): the cells each
   *  covers, and the conflicts. */
  drawn = $derived.by(() => {
    if (!this.site || !this.rules) return null;
    const u = Sites.withRules(this.site, this.rules);
    return E.applyMoves(u.site, this.moves, u.result.state, u.result.reasons, neverBuilt(this.rules));
  });
  /** What the plot rules let plans hold on the ground a run would grow on, against the brief
   *  (engine/capacity.ts): from the table, or measured on the engine's workers after a rule was
   *  edited (seconds). Null where the site has no plot rules. */
  capacity = $state.raw<{ key: string; brief: number; cap: E.Capacity | null; measuring: boolean } | null>(null);
  private measured = new Map<string, E.Capacity>();

  /** The capacity of a ground: known, or measured once and kept by its fingerprint. */
  private known(G: E.Ground): E.Capacity | null { return E.capacityOf(G) ?? this.measured.get(E.groundKey(G)) ?? null; }

  async checkCapacity() {
    const u = this.underBrief();
    if (!u || !E.plotRulesOf(u.site.meta.id)) { this.capacity = null; return; }
    const G = Sites.groundOf(u.site), key = E.groundKey(G), brief = E.briefFloorArea(G);
    const cap = this.known(G);
    if (cap || this.running) { this.capacity = { key, brief, cap, measuring: false }; return; }
    if (this.capacity?.key === key && this.capacity.measuring) return;
    this.capacity = { key, brief, cap: null, measuring: true };
    try {
      const api = await this.engine(u.site, [...this.ridgesOff]);
      const c = await api.capacity();
      if (c) this.measured.set(key, c);
      if (this.capacity?.key === key) this.capacity = { key, brief, cap: c, measuring: false };
    } catch {
      if (this.capacity?.key === key) this.capacity = { key, brief, cap: null, measuring: false };
    }
  }

  async run() {
    const u = this.underBrief();
    if (!u || this.running) return;
    // A capacity measured on this ground travels with the site, so the run's workers aim at it.
    const kept = this.measured.get(E.groundKey(Sites.groundOf(u.site)));
    if (kept) u.site.meta.capacity = kept;
    this.runError = "";
    // COPY: a run held back by conflicts
    if (u.conflicts.length) {
      const one = u.conflicts.length === 1;
      this.runError = `${one ? "A move conflicts" : `${u.conflicts.length} moves conflict`} with the rules. Resolve ${one ? "it" : "them"} on the Draw step, then run.`;
      return;
    }
    this.running = true;
    this.runGen = 0;
    this.history = [];
    this.leaders = [];
    this.result = null;
    this.runStarted = performance.now();
    this.runSite = u.site;
    const inputs: Saved.RunInputs = { settings: { ...this.settings }, rules: this.edited ? this.rules : null, brief: this.brief,
      off: [...this.ridgesOff], geneLocks: { ...this.geneLocks }, moves: this.moves };
    try {
      const api = await this.engine(u.site, inputs.off);
      const c = await api.capacity();   // measured now if the rules were edited and it isn't known
      if (c) { this.measured.set(c.key, c); u.site.meta.capacity = c; }
      const s = inputs.settings;
      const r = await api.evolve(
        { search: s.search, objectives: [], generations: s.generations, pop: s.pop, seed: s.seed, shock: null, locked: null,
          start: null, ranges: u.ranges, version: 3, weights: this.brief?.objective_weights?.value ?? null },
        Comlink.proxy((gen: number, row: E.HistoryRow) => { this.runGen = gen; this.history = [...this.history, row]; }),
        Comlink.proxy((_gen: number, ds: E.Design[]) => { this.leaders = ds; }),
      );
      // MAP-Elites leads come back as genomes; grow them whole so every view can draw them
      const bare = r.families.filter((f) => !f.design);
      if (bare.length) {
        const ds = await api.whole(bare.map((f) => f.genome), u.ranges);
        bare.forEach((f, k) => (f.design = ds[k]));
      }
      this.adopt(r, u.ranges, inputs);
    } catch (e) {
      if (this.running) this.runError = (e as Error).message;
    } finally {
      this.running = false;
    }
  }

  /** The engine worker, made if need be, set to a site with some ridges off. */
  private async engine(site: E.SiteExport, off: number[]) {
    if (!this.worker) {
      const raw = new Worker(new URL("../../engine/worker.ts", import.meta.url), { type: "module" });
      this.worker = { raw, api: Comlink.wrap<EngineWorker>(raw) };
    }
    await this.worker.api.setSite(site, off);
    return this.worker.api;
  }

  /** Show a finished run (bred here, or opened from a file), its leads already grown. */
  private adopt(r: EvolveResult, ranges: E.Ranges, inputs: Saved.RunInputs) {
    this.runRanges = ranges;
    this.runOff = inputs.off;
    const site = this.runSite;
    if (site) Sites.warmGround(() => Sites.groundOf(site, inputs.off));
    this.runInputs = inputs;
    this.runCount++;
    this.grown = new Map(r.families.map((f) => [f.name, f.design!]));
    this.brush = {}; this.pair = [null, null]; this.showAll = false;
    this.exSel = r.families[0]?.name ?? null;
    this.exView = r.archive ? "archive" : "tradeoffs";
    this.result = r;
    this.picked3 = 0;
    this.sync();
  }

  /** Put a run's inputs back on the steps: rules, brief, ridges, locked genes, settings. */
  private applyInputs(x: { rules: E.RuleSet | null; brief: E.Brief | null; off: number[]; geneLocks: Record<string, number>; settings: Saved.Settings; moves: E.Move[] }) {
    if (x.rules) { this.rules = x.rules; this.past = []; this.future = []; }
    this.moves = x.moves; this.movesPast = []; this.movesFuture = [];
    if (x.brief) { this.brief = x.brief; this.briefLocked = true; }
    this.ridgesOff = new Set(x.off);
    this.geneLocks = x.geneLocks;
    Object.assign(this.settings, x.settings);
  }

  /** Designs of the run on show, grown, into the pen. */
  private async penFrom(entries: { name: string; genome: number[] }[]) {
    if (!entries.length || !this.worker || !this.runSite) return;
    const ds = await this.worker.api.whole(entries.map((e) => e.genome), this.runRanges);
    const site = this.runSite;
    this.pen = [...this.pen.filter((p) => !entries.some((e) => e.name === p.name)), ...entries.map((e, k) => ({ name: e.name, design: ds[k], site }))];
  }

  /** Open a link: the site, then its rules and brief; then, if it has a run, breed it again and
   *  go back to the design and step it showed. */
  private async openLink(id: string, q: URLSearchParams) {
    this.booting = true;
    try { await this.restoreLink(id, q); } finally { this.booting = false; this.sync(); }
  }
  private async restoreLink(id: string, q: URLSearchParams) {
    const want = (q.get("step") as StepId | null) ?? "layers";
    await this.open(id, want === "site" ? "layers" : want === "explore" || want === "massing" ? "evolve" : want);
    if (!this.site) return;
    let r: Saved.Restore;
    try { r = Saved.readLink(q, this.site); } catch (e) { this.runError = (e as Error).message; this.step = "evolve"; return; }
    this.notes = r.notes;
    if (!r.run) {
      this.applyInputs({ rules: r.rules, brief: r.brief, off: [], geneLocks: {}, settings: { ...this.settings }, moves: r.moves });
      return;
    }
    this.applyInputs(r.run);
    this.step = "evolve";
    // COPY: rebuilding a run from a link
    this.restoring = "Breeding this run again from the link: the same inputs give the same designs.";
    await this.run();
    this.restoring = "";
    if (!this.result) return;
    if (r.sel && this.genomeOf(r.sel)) this.exSel = r.sel;
    await this.penFrom(r.keep.map((name) => ({ name, genome: this.genomeOf(name) })).filter((e): e is { name: string; genome: number[] } => !!e.genome));
    const step = (r.step as StepId | null) ?? "explore";
    if (STEPS.some((x) => x.id === step)) this.go(step);
  }

  /** The run on show as a file to download (the result too, so it opens without breeding). */
  saveFile(): { text: string; name: string } | null {
    if (!this.result || !this.runInputs || !this.siteId || !this.site) return null;
    const pen = this.pen.flatMap((p) => { const g = this.genomeOf(p.name); return g ? [{ name: p.name, genome: g, title: this.titleOf(p.name) }] : []; });
    const text = Saved.toFile({
      site: { id: this.siteId, name: this.site.meta.name }, base: this.site.rules, run: this.runInputs, ranges: this.runRanges,
      result: this.result, pen, sel: this.exSel, step: this.step,
    });
    return { text, name: `${this.siteId}-run-${this.runInputs.settings.seed}.json` };
  }

  /** Open a saved run file: its site, inputs and result, the leads grown again on this page. */
  async openFile(text: string) {
    this.runError = "";
    let f: ReturnType<typeof Saved.readFile>;
    try { f = Saved.readFile(text); } catch (e) { this.runError = (e as Error).message; this.go("evolve"); return; }
    if (this.running) this.cancel();
    await this.open(f.siteId, "evolve");
    if (!this.site) return;
    // COPY: opening a run file
    this.restoring = "Opening the saved run";
    try {
      const own = this.site.rules;
      const rules = f.rulesText && own ? Sites.decodeRules(f.rulesText, own) : null;
      const base = rules ?? own;
      const brief = f.briefText && base ? Sites.recheck(Sites.decodeBrief(f.briefText).brief, base).brief : null;
      const moves = f.movesText ? Saved.decodeMoves(f.movesText, this.site) : [];
      const inputs: Saved.RunInputs = { ...f.run, rules, brief, moves };
      this.applyInputs(inputs);
      const u = this.underBrief();
      if (!u || !f.result) throw new Error("The file has no finished run in it.");
      const ranges = f.ranges ?? u.ranges;
      const api = await this.engine(u.site, inputs.off);
      const ds = await api.whole(f.result.families.map((x) => x.genome), ranges);
      f.result.families.forEach((x, k) => (x.design = ds[k]));
      this.runSite = u.site;
      this.history = f.result.history;
      this.adopt(f.result, ranges, inputs);
      this.notes = f.notes;
      if (f.sel && this.genomeOf(f.sel)) this.exSel = f.sel;
      this.pen = [];
      await this.penFrom(f.pen.filter((p) => this.genomeOf(p.name)));
      // a file is saved from the Evolve step; it opens on the designs (or where else it was saved)
      const step = f.step && f.step !== "evolve" ? (f.step as StepId) : "explore";
      this.go(STEPS.some((x) => x.id === step) ? step : "explore");
    } catch (e) {
      this.runError = (e as Error).message;
    } finally {
      this.restoring = "";
    }
  }

  /** Stop a run: the worker is ended (it can't be interrupted mid-generation) and made again
   *  for the next one. */
  cancel() {
    if (!this.running) return;
    this.running = false;
    this.worker?.raw.terminate();
    this.worker = null;
  }

  toggleRidge(id: number) {
    const s = new Set(this.ridgesOff);
    if (s.has(id)) s.delete(id); else s.add(id);
    this.ridgesOff = s;
  }

  seen(id: StepId, yes = true) {
    this.introSeen = { ...this.introSeen, [id]: yes };
    store.set("pc-wb-intro", JSON.stringify(this.introSeen));
  }

  /** The address of the workbench as it stands (saved.ts): open it and the same view returns. */
  link(): string {
    if (!this.siteId) return location.pathname;
    const run = this.result ? this.runInputs : null;
    return `${location.pathname}${Saved.writeLink({
      site: this.siteId, base: this.site?.rules, step: this.step, rules: this.edited ? this.rules : null, moves: this.moves,
      brief: this.briefLocked ? this.brief : null, run, sel: run ? this.exSel : null,
      keep: run ? this.pen.filter((p) => this.genomeOf(p.name)).map((p) => p.name) : [],
    })}`;
  }

  sync() {
    const at = this.link();   // read first, so an effect calling this keeps following the state
    if (!this.booting) history.replaceState(null, "", at);
  }
}

export const bench = new Bench();
