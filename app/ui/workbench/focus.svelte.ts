// The workbench's focused brief: the real place open, the river level the line is drawn at, the
// layer on show, today's numbers measured for that line (engine/focus), stakeholders' decisions and
// what the agents reported.
import { type AgentRun, postTurn, runAgent } from "../../agents/run";
import type { AgentId } from "../../agents/roles";
import { type Choice, type Decision, record, releasedCells, type RoleId, withDecisions } from "../../engine/focus/decisions";
import { type EdgeRead, readEdge } from "../../engine/focus/edge";
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

  /** Stakeholders' decisions, oldest first. Only ever added to. */
  decisions = $state.raw<Decision[]>([]);
  /** The role the person is deciding as. */
  asRole = $state<RoleId>("asi");

  /** What each agent last reported, whether it's running, and what went wrong. */
  runs = $state.raw<Partial<Record<AgentId, AgentRun>>>({});
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
    this.decisions = this.load(id);
    this.runs = {};
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
      const run = await runAgent(agent, { place: this.place, walk: this.walk, decisions: this.decisions }, postTurn, (w) => (this.progress = w));
      this.runs = { ...this.runs, [agent]: run };
    } catch (e) {
      this.agentError = e instanceof Error ? e.message : "The agent couldn't finish.";
    } finally {
      this.running = null;
    }
  }
}
