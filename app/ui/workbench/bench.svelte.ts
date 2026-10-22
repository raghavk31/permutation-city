// The workbench's state: which step is open, the site, and what each step's panels share.
// The URL carries the step and the site (?site=…&step=…), so any view can be shared.
import * as Comlink from "comlink";
import type { Snippet } from "../../brief/chunk";
import * as E from "../../engine";
import type { EngineWorker, EvolveResult } from "../../engine/worker";
import * as Sites from "../sites";


export type StepId = "site" | "layers" | "rules" | "landform" | "brief" | "evolve" | "explore" | "massing";

// COPY: step names
export const STEPS: { id: StepId; name: string; built: boolean }[] = [
  { id: "site", name: "Site", built: true },
  { id: "layers", name: "Layers", built: true },
  { id: "rules", name: "Rules", built: true },
  { id: "landform", name: "Landform", built: true },
  { id: "brief", name: "Brief", built: true },
  { id: "evolve", name: "Evolve", built: true },
  { id: "explore", name: "Explore", built: false },
  { id: "massing", name: "Massing", built: false },
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
  picked3 = $state(0);   // which leader or family is shown large
  /** Designs kept in the pen (the tray), with the site they were bred on. */
  pen = $state.raw<{ name: string; design: E.Design; site: E.SiteExport }[]>([]);

  keep(name: string, design: E.Design) {
    if (!this.runSite || this.pen.some((p) => p.name === name)) return;
    this.pen = [...this.pen, { name, design, site: this.runSite }];
  }
  private worker: { raw: Worker; api: Comlink.Remote<EngineWorker> } | null = null;

  // panels and intros
  railOpen = $state(true);
  inspOpen = $state(true);
  introSeen = $state<Record<string, boolean>>(JSON.parse(store.get("pc-wb-intro") ?? "{}"));

  constructor() {
    if (typeof window === "undefined") return;
    fetch(`${Sites.DATA}sites.json`).then((r) => r.json()).then((s) => (this.index = s)).catch(() => {});
    const q = new URLSearchParams(location.search), id = q.get("site"), step = q.get("step") as StepId | null;
    if (id) this.open(id, step && step !== "site" ? step : "layers");
  }

  stateOf(id: StepId): "done" | "now" | "todo" | "blocked" {
    if (id === this.step) return "now";
    const s = STEPS.find((x) => x.id === id)!;
    if (!s.built) return "blocked";
    if (id === "site") return this.site ? "done" : "todo";
    if (!this.site) return "blocked";
    if (id === "brief" && this.briefLocked) return "done";
    if (id === "evolve" && this.result) return "done";
    return "todo";
  }

  go(id: StepId) {
    if (this.stateOf(id) === "blocked") return;
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
      this.siteId = id;
      this.picked = id;
      this.layerOn = {};
      this.opacity = {};
      this.rules = s.rules ?? null;
      this.past = []; this.future = [];
      this.ridgesOff = new Set();
      this.brief = null; this.briefLocked = false;
      this.result = null; this.leaders = []; this.history = [];
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
  undo() {
    if (!this.past.length || !this.rules) return;
    this.future = [this.rules, ...this.future];
    this.rules = this.past[this.past.length - 1];
    this.past = this.past.slice(0, -1);
  }
  redo() {
    if (!this.future.length || !this.rules) return;
    this.past = [...this.past, this.rules];
    this.rules = this.future[0];
    this.future = this.future.slice(1);
  }
  get edited() { return !!this.site?.rules && !!this.rules && JSON.stringify(this.rules) !== JSON.stringify(this.site.rules); }

  /** The site as a run sees it: its rules as edited, and the brief's targets and rule changes. */
  underBrief() {
    if (!this.site || !this.rules) return null;
    if (this.brief) {
      const u = Sites.withBrief(this.site, this.rules, this.brief);
      return { site: u.site, result: u.result, ranges: u.config.ranges };
    }
    const u = Sites.withRules(this.site, this.rules);
    return { site: u.site, result: u.result, ranges: E.DEFAULT_RANGES };
  }

  async run() {
    const u = this.underBrief();
    if (!u || this.running) return;
    this.runError = "";
    this.running = true;
    this.runGen = 0;
    this.history = [];
    this.leaders = [];
    this.result = null;
    this.runStarted = performance.now();
    this.runSite = u.site;
    try {
      if (!this.worker) {
        const raw = new Worker(new URL("../../engine/worker.ts", import.meta.url), { type: "module" });
        this.worker = { raw, api: Comlink.wrap<EngineWorker>(raw) };
      }
      const api = this.worker.api;
      await api.setSite(u.site, [...this.ridgesOff]);
      const s = this.settings;
      const r = await api.evolve(
        { search: s.search, objectives: [], generations: s.generations, pop: s.pop, seed: s.seed, shock: null, locked: null,
          start: null, ranges: u.ranges, version: 3, weights: this.brief?.objective_weights?.value ?? null },
        Comlink.proxy((gen: number, row: E.HistoryRow) => { this.runGen = gen; this.history = [...this.history, row]; }),
        Comlink.proxy((_gen: number, ds: E.Design[]) => { this.leaders = ds; }),
      );
      this.result = r;
      this.picked3 = 0;
    } catch (e) {
      if (this.running) this.runError = (e as Error).message;
    } finally {
      this.running = false;
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

  private sync() {
    const q = new URLSearchParams();
    if (this.siteId) q.set("site", this.siteId);
    if (this.step !== "site") q.set("step", this.step);
    const s = q.toString();
    history.replaceState(null, "", s ? `?${s}` : location.pathname);
  }
}

export const bench = new Bench();
