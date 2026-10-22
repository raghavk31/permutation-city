// The Massing step's state: which design and block are massed, the breeding run and its
// result, and what the 3D view shows (the sun, a section, the camera). The engine is
// engine/massing (version 3 designs mass their own vector plots: massing/vector.ts); the
// breeding runs in its own worker (ui/mass/massing.ts Breeder), apart from the urban run's.
import * as E from "../../engine";
import * as M from "../../engine/massing";
import type { MassKept, MassResult } from "../../engine/massing/worker";
import * as Mass from "../mass/massing";

// COPY: the representations
export const KINDS: { kind: M.RepKind; label: string; note: string }[] = [
  { kind: "typology", label: "Typologies", note: "Courtyards, L and U shapes, towers, slabs: each plot gets a type and its dimensions." },
  { kind: "field", label: "Voxel field", note: "Soft blobs fill a grid of small boxes inside the envelope; a smooth skin is drawn over them." },
  { kind: "cppn", label: "Network", note: "A small network turns position, water, height limit and sun into where to build; it grows as it breeds." },
];
// COPY: sun dates
export const DATES = [
  { label: "21 December", month: 12, day: 21 }, { label: "15 March, hot season", month: 3, day: 15 },
  { label: "15 April, hot season", month: 4, day: 15 }, { label: "15 May, hot season", month: 5, day: 15 },
  { label: "21 June", month: 6, day: 21 },
];

/** The design to mass, as the run grew it. */
export interface MassSource { src: Mass.Source; design: E.Design; title: string }

export class MassStep {
  source = $state.raw<MassSource | null>(null);
  block = $state(-1);
  kind = $state<M.RepKind>("typology");
  setbacks = $state<M.Setbacks>({ ...M.DEFAULT_SETBACKS });
  setbacksFrom = $state("defaults (assumed)");
  population = $state(24);
  generations = $state(12);
  seed = $state(1);
  running = $state(false);
  gen = $state(0);
  error = $state("");
  result = $state.raw<MassResult | null>(null);
  resultKey = $state("");
  pick = $state(-1);
  view = $state<"plan" | "3d">("plan");
  date = $state(1);
  hour = $state(16);
  sectionMode = $state<"none" | "plan" | "cut">("none");
  sectionAt = $state(0.5);
  presenting = $state(false);
  private breeder = new Mass.Breeder();

  blocks = $derived(this.source ? M.blocksOf(this.source.design, this.source.src.G) : []);
  key = $derived(this.source ? `${this.source.src.name}|${this.block}|${this.setbacks.front},${this.setbacks.side},${this.setbacks.rear}` : "");
  /** The block ready to mass, on the page (the worker prepares the same). */
  prepared = $derived(this.source && this.block >= 0
    ? M.prepareBlock(this.source.src.G, Mass.setupOf(this.source.src, this.block, $state.snapshot(this.setbacks))) : null);
  stale = $derived(!!this.result && this.resultKey !== this.key);
  chosen = $derived(this.result && this.pick >= 0 && !this.stale ? this.result.kept[this.pick] : null);

  /** Mass a design: start on a mid-sized block, with the brief's setbacks. */
  open(s: MassSource) {
    this.cancel();
    this.source = s;
    this.result = null; this.pick = -1; this.error = ""; this.view = "plan";
    const sb = Mass.setbacksOf(s.src.brief);
    this.setbacks = sb.value; this.setbacksFrom = sb.from;
    const pool = this.blocks.filter((b) => b.ha >= 0.1).sort((a, b) => b.ha - a.ha || a.id - b.id);
    this.block = pool.length ? pool[Math.floor(pool.length / 3)].id : this.blocks[0]?.id ?? -1;
  }

  async breed() {
    const s = this.source;
    if (!s || this.block < 0 || this.running) return;
    this.running = true; this.gen = 0; this.error = "";
    // plain values only: a state proxy can't be posted to a worker
    const req: M.MassRequest = { ...Mass.setupOf(s.src, this.block, $state.snapshot(this.setbacks)), kind: this.kind,
      population: this.population, generations: this.generations, seed: this.seed };
    const key = this.key;
    try {
      const r = await this.breeder.run(s.src, req, (g) => (this.gen = g));
      this.built.clear(); this.meshes.clear();
      this.result = r; this.resultKey = key;
      this.pick = r.kept.map((_, i) => i).sort((a, b) => r.kept[a].rank - r.kept[b].rank || a - b)[0] ?? -1;
      this.view = "3d";
    } catch (e) {
      if (this.running) this.error = `The run stopped: ${(e as Error).message}`;
    } finally {
      this.running = false;
    }
  }

  cancel() { this.breeder.cancel(); this.running = false; }

  // massings and meshes rebuilt on the page from their genomes (identical to the worker's)
  private built = new Map<string, M.Massing>();
  private meshes = new Map<string, M.Mesh>();
  massingOf(k: MassKept): M.Massing | null {
    if (!this.prepared || !this.result) return null;
    let m = this.built.get(k.name);
    if (!m) { m = M.REPRESENTATIONS[this.result.kind].build(k.genome, this.prepared.ctx); this.built.set(k.name, m); }
    return m;
  }
  meshOf(k: MassKept): M.Mesh | null {
    let m = this.meshes.get(k.name);
    const ms = this.massingOf(k);
    if (!m && ms && this.prepared) { m = M.massingMesh(this.prepared.E, ms); this.meshes.set(k.name, m); }
    return m ?? null;
  }

  where = $derived(this.source ? M.whereOf(this.source.src.G.meta) : null);
  /** The sun at the chosen date and local clock time (placed in solar time). */
  sun = $derived.by(() => {
    if (!this.where) return null;
    const d = DATES[this.date], doy = M.dayOfYear(d.month, d.day);
    return M.sunAt(this.where.lat, doy, M.solarHour(this.hour, this.where.lon, this.where.utc, doy));
  });
}
