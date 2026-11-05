// The workbench's focused brief: the real place open, the river level the line is drawn at, the
// layer on show, today's numbers measured for that line (engine/focus), stakeholders' decisions and
// what the agents reported.
import * as Comlink from "comlink";
import { type AgentRun, postTurn, runAgent } from "../../agents/run";
import type { AgentId } from "../../agents/roles";
import { type Choice, type Decision, record, releasedCells, type RoleId, withDecisions } from "../../engine/focus/decisions";
import { type EdgeRead, readEdge } from "../../engine/focus/edge";
import { changesFrom, type DesignChange, designOf, type EdgeDesign, fitDesign, type StretchChoice, whatIfStretches, withStretch } from "../../engine/focus/edgedesign";
import type { StretchFit, Works } from "../../engine/focus/edgeform";
import { type Score, scoreEdge } from "../../engine/focus/edgescore";
import type { EdgeOption } from "../../engine/focus/edgesearch";
import type { EdgeWorker } from "../../engine/focus/edgeworker";
import { edgeShapeOf } from "../../engine/typology/openshape";
import { checkBrief, lineIndex, type Place, type Stay } from "../../engine/focus/place";
import { checkRecords, type RecordCheck, riverYear, type RiverYear } from "../../engine/focus/river";
import { type Today, todayOf } from "../../engine/focus/today";
import { type Views, viewsOf } from "../../engine/focus/views";
import { Walk } from "../../engine/focus/walk";
import { DATA } from "../sites";
import type { FocusLayer } from "./focuspaint";

const storeKey = (id: string) => `pc.decisions.${id}`;

export class FocusStep {
  place = $state.raw<Place | null>(null);
  walk = $state.raw<Walk | null>(null);
  id = $state<string | null>(null);
  mark = $state(0);
  layer = $state<FocusLayer>("zone");
  view = $state<"plan" | "section">("plan");
  /** The stay pointed at in the list, heavier on the map. */
  stayOn = $state<string | null>(null);
  /** The river's year: a month (0-11), or null for dry days across the year. */
  month = $state<number | null>(null);
  /** One view picked, or null for the tightest limit of all of them. */
  viewOn = $state<string | null>(null);
  /** The rule pointed at in the list, heavier on the map. */
  ruleOn = $state<string | null>(null);

  /** The design step: the stretch chosen, and the station along it whose section is drawn. */
  stretchOn = $state<string | null>(null);
  stationOn = $state<{ bank: number; k: number } | null>(null);

  /** The design a person holds, with its undo history, and the class of work a change by hand uses. */
  design = $state.raw<EdgeDesign | null>(null);
  past = $state.raw<(EdgeDesign | null)[]>([]);
  future = $state.raw<(EdgeDesign | null)[]>([]);
  works = $state<Works>("soft");

  /** What the search found, and the option on show. */
  options = $state.raw<EdgeOption[] | null>(null);
  searching = $state(false);
  searchError = $state("");
  /** The river's height drawn on the section, or null for an ordinary day's. */
  riverAt = $state<number | null>(null);

  /** The option the design started from. */
  option = $derived.by((): EdgeOption | null => this.options?.find((o) => o.id === this.design?.basedOn) ?? null);
  river = $derived.by((): number => this.riverAt ?? this.edge?.datum.ordinary?.[1] ?? this.place?.brief.marks[0].m ?? 0);

  /** Run the search off the main thread. The result stands until a decision changes the ground. */
  async search() {
    if (!this.place || this.searching) return;
    const id = this.id;
    this.searching = true;
    this.searchError = "";
    const raw = new Worker(new URL("../../engine/focus/edgeworker.ts", import.meta.url), { type: "module" });
    try {
      const out = await Comlink.wrap<EdgeWorker>(raw).search(this.place, this.released);
      if (id === this.id) this.options = out;
    } catch (e) {
      this.searchError = e instanceof Error ? e.message : "The search couldn't finish.";
    } finally {
      raw.terminate();
      this.searching = false;
    }
  }
  /** Change the design, keeping what it was for undo. */
  private hold(d: EdgeDesign | null) {
    this.past = [...this.past, this.design];
    this.future = [];
    this.design = d;
  }
  get canUndo() { return this.past.length > 0; }
  get canRedo() { return this.future.length > 0; }
  undo() {
    if (!this.past.length) return;
    this.future = [this.design, ...this.future];
    this.design = this.past[this.past.length - 1];
    this.past = this.past.slice(0, -1);
  }
  redo() {
    if (!this.future.length) return;
    this.past = [...this.past, this.design];
    this.design = this.future[0];
    this.future = this.future.slice(1);
  }

  /** Start from one of the options, or null for today. Undo brings back what was there. */
  showOption(id: string | null) {
    const o = this.options?.find((x) => x.id === id);
    this.hold(o ? designOf(o) : null);
  }
  private change(id: string, c: StretchChoice | null) {
    const d = withStretch(this.design ?? { basedOn: null, stretches: {} }, id, c);
    this.hold(d.basedOn === null && !Object.keys(d.stretches).length ? null : d);
  }
  private fromPrecedent(id: string): StretchChoice | null {
    const shape = edgeShapeOf(id);
    return shape ? { shape, works: this.works, keepGround: false, pathD: undefined, from: id } : null;
  }

  get choiceHere(): StretchChoice | null { return this.stretchOn ? this.design?.stretches[this.stretchOn] ?? null : null; }
  /** What the chosen stretch came from: a precedent's id, "kept", or an option's id. */
  get tryFrom(): string | null { return this.choiceHere?.from ?? null; }
  /** Change only the chosen stretch: a precedent's section, or null for today's ground. */
  choose(id: string | null) {
    if (this.stretchOn) this.change(this.stretchOn, id ? this.fromPrecedent(id) : null);
  }
  /** Change only the chosen stretch to its ground left as it is, with a path. */
  keepGround() {
    if (!this.stretchOn) return;
    const shape = this.choiceHere?.shape ?? edgeShapeOf("yanweizhou");
    if (shape) this.change(this.stretchOn, { shape, works: this.works, keepGround: true, pathD: this.choiceHere?.pathD, from: "kept" });
  }
  /** Put the chosen stretch back as the option had it. */
  restoreStretch() {
    const o = this.option, id = this.stretchOn;
    if (o && id) this.change(id, designOf(o).stretches[id] ?? null);
  }
  /** Back to the option as the search found it. */
  restoreOption() { if (this.option) this.showOption(this.option.id); }
  /** The class of work for changes by hand; the chosen stretch takes it at once if it's been changed by hand. */
  setWorks(w: Works) {
    this.works = w;
    const c = this.choiceHere;
    if (c && this.stretchOn && !this.option?.stretches.some((s) => s.id === this.stretchOn && c.from === this.option?.id) && c.works !== w) this.change(this.stretchOn, { ...c, works: w });
  }
  /** One precedent on every stretch, as a design of its own, or clear the design. */
  chooseAll(id: string | null) {
    if (!id) { this.hold(null); return; }
    const stretches: Record<string, StretchChoice> = {};
    for (const b of this.edge?.banks ?? []) for (const s of b.stretches) { const c = this.fromPrecedent(id); if (c) stretches[s.id] = c; }
    this.hold({ basedOn: null, stretches });
  }

  /** Stakeholders' decisions, oldest first. Only ever added to. */
  decisions = $state.raw<Decision[]>([]);
  /** The role the person is deciding as. */
  asRole = $state<RoleId>("asi");

  /** What each agent last reported, whether it's running, and what went wrong. */
  runs = $state.raw<Partial<Record<AgentId, AgentRun>>>({});
  /** Which option was on show when each agent ran. */
  runRead = $state.raw<Partial<Record<AgentId, string | null>>>({});
  running = $state<AgentId | null>(null);
  progress = $state("");
  agentError = $state("");

  released = $derived.by(() => (this.place ? releasedCells(this.place, this.decisions) : null));
  stays = $derived.by((): Stay[] => (this.place ? withDecisions(this.place.brief.stays, this.decisions) : []));
  today = $derived.by((): Today | null => (this.place && this.walk ? todayOf(this.place, this.mark, this.walk, this.released) : null));
  views = $derived.by((): Views | null => (this.place ? viewsOf(this.place) : null));
  year = $derived.by((): RiverYear | null => (this.place ? riverYear(this.place) : null));
  /** The banks, read. Only made when the design step asks. */
  edge = $derived.by((): EdgeRead | null => (this.place ? readEdge(this.place, this.decisions.length ? this.released : null) : null));
  /** Every stretch in the design, fitted. */
  fits = $derived.by((): StretchFit[] => (this.place && this.edge && this.design ? fitDesign(this.place, this.edge, this.design) : []));
  /** The chosen stretch's fit. */
  fit = $derived.by((): StretchFit | null => this.fits.find((x) => x.stretch.id === this.stretchOn) ?? null);
  /** The design so far against today. */
  scores = $derived.by((): Score[] => (this.place && this.edge && this.walk && this.fits.length ? scoreEdge(this.place, this.edge, this.fits, this.walk) : []));
  /** What makes the design a what-if: any one of these does. */
  whatIf = $derived.by((): string[] => whatIfStretches(this.fits));
  /** What the design has changed against its option. */
  changes = $derived.by((): DesignChange | null => (this.option && this.design && this.edge ? changesFrom(this.edge, this.option, this.design, this.scores, this.fits) : null));
  records = $derived.by((): RecordCheck[] => (this.place ? checkRecords(this.place) : []));

  async open(id: string, mark?: number) {
    const r = await fetch(`${DATA}${id}.place.json`);
    if (!r.ok) throw new Error(`There's no prepared place called ${id}.`);
    const p: Place = await r.json();
    const wrong = checkBrief(p.brief);
    if (wrong.length) throw new Error(`This place's brief has problems: ${wrong.join("; ")}`);
    this.walk = new Walk(p.streets.map((s) => s.pts));
    this.mark = mark !== undefined && mark >= 0 && mark < p.brief.marks.length ? mark : lineIndex(p.brief);
    this.layer = "zone";
    this.view = "plan";
    this.stayOn = null;
    this.month = null;
    this.viewOn = null;
    this.ruleOn = null;
    this.stretchOn = null;
    this.stationOn = null;
    this.design = null;
    this.past = [];
    this.future = [];
    this.works = "soft";
    this.options = null;
    this.searchError = "";
    this.riverAt = null;
    this.decisions = this.load(id);
    this.runs = {};
    this.runRead = {};
    this.agentError = "";
    this.id = id;
    this.place = p;
  }

  /** Choose a stretch: its section is drawn at its middle station. */
  pickStretch(id: string) {
    for (const b of this.edge?.banks ?? []) for (const s of b.stretches) if (s.id === id) {
      this.stretchOn = id;
      this.stationOn = { bank: b.id, k: Math.round((s.stations[0] + s.stations[1]) / 2) };
    }
  }

  /** Choose the station nearest a point on the map, within reason, and its stretch. */
  pickNear(x: number, y: number, withinM = 150) {
    let best: { bank: number; k: number; id: string } | null = null, bestD = withinM;
    for (const b of this.edge?.banks ?? []) b.stations.forEach((t, k) => {
      const d = Math.hypot(t.x - x, t.y - y);
      if (d < bestD) { bestD = d; best = { bank: b.id, k, id: b.stretches.find((s) => k >= s.stations[0] && k <= s.stations[1])?.id ?? "" }; }
    });
    if (best) { const p = best as { bank: number; k: number; id: string }; this.stationOn = { bank: p.bank, k: p.k }; this.stretchOn = p.id; }
  }

  close() { this.place = null; this.walk = null; this.id = null; this.decisions = []; this.runs = {}; }

  private load(id: string): Decision[] {
    try {
      const saved = JSON.parse(localStorage.getItem(storeKey(id)) ?? "[]");
      return Array.isArray(saved) ? saved : [];
    } catch { return []; }
  }

  /** Add a record. Throws in words if it isn't complete. */
  decide(stay: string, choice: Choice, because: string) {
    if (!this.place || !this.id) return;
    this.decisions = [...this.decisions, record(this.place, { stay, choice, by: this.asRole, because }, new Date().toISOString())];
    // A decision can change the ground a design may use, so what was found no longer stands.
    this.options = null;
    this.design = null;
    this.past = [];
    this.future = [];
    try { localStorage.setItem(storeKey(this.id), JSON.stringify(this.decisions)); } catch { /* still held for this session */ }
  }

  /** The log as a file, since a browser's memory isn't a record anyone else can see. */
  download() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(this.decisions, null, 1)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${this.id}-decisions.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async ask(agent: AgentId) {
    if (!this.place || !this.walk || this.running) return;
    this.running = agent;
    this.progress = "";
    this.agentError = "";
    try {
      const on = this.option ? `${this.option.words}${this.changes?.stretches.length ? ", without your changes, which agents can't read yet" : ""}` : null;
      const run = await runAgent(agent, { place: this.place, walk: this.walk, decisions: this.decisions, design: this.options ? { options: this.options, on: this.option?.id ?? null } : null }, postTurn, (w) => (this.progress = w));
      this.runs = { ...this.runs, [agent]: run };
      this.runRead = { ...this.runRead, [agent]: on };
    } catch (e) {
      this.agentError = e instanceof Error ? e.message : "The agent couldn't finish.";
    } finally {
      this.running = null;
    }
  }
}
