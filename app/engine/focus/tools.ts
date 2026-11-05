// What an agent can call on a place (docs/architecture-v3.md section 15.2). Every number an agent may
// use comes through here, or from a link the brief holds. All of these read; none of them decides.
import { type Decision, releasedCells, standing, roleWords } from "./decisions.js";
import { readEdge } from "./edge.js";
import type { EdgeOption } from "./edgesearch.js";
import { lineIndex, type Place, zoneOf } from "./place.js";
import { checkRecords, reachAt, riverYear } from "./river.js";
import { todayOf } from "./today.js";
import { viewsOf } from "./views.js";
import type { Walk } from "./walk.js";

export interface ToolContext {
  place: Place; walk: Walk; decisions: Decision[];
  /** What the search has found, and which option is on show. Read here; nothing here can change it. */
  design?: { options: EdgeOption[]; on: string | null } | null;
}

const MARK = { type: "integer", description: "Which river level: an index into read_brief's marks. Leave out for the brief's line." };
const none = { type: "object", properties: {}, additionalProperties: false };
const round1 = (v: number) => Math.round(v * 10) / 10;

export const TOOL_SPECS = [
  { name: "read_brief", description: "The brief: what stays, the rules, river marks, recorded floods and the views, each with its source and status, and what's still to check.", parameters: none },
  { name: "read_decisions", description: "What stakeholders have decided so far, and what's still waiting. The whole log, oldest first.", parameters: none },
  { name: "measure_today", description: "Today's measures for the zone at a river level, each saying whether it's measured, from the map or estimated, plus walks between the monuments.", parameters: { type: "object", properties: { mark: MARK }, additionalProperties: false } },
  { name: "reach_at", description: "Hectares of land and number of buildings a river level in metres would reach, for any level.", parameters: { type: "object", properties: { level_m: { type: "number" } }, required: ["level_m"], additionalProperties: false } },
  { name: "check_floods", description: "Each recorded flood, held against the ground model at the same level, and whether they agree.", parameters: none },
  { name: "river_year", description: "Hectares seen wet each month from the satellite, with clear looks per month.", parameters: none },
  { name: "rules_in_zone", description: "Hectares of the zone inside each rule at a river level, with each rule's effect, source and status.", parameters: { type: "object", properties: { mark: MARK }, additionalProperties: false } },
  { name: "view_limits", description: "Each view: how much of it is clear today, what crosses it, and the height limits it sets on the zone, in metres above ground.", parameters: { type: "object", properties: { mark: MARK }, additionalProperties: false } },
  { name: "edge_stretches", description: "Each stretch of both banks: its length, how much ground it has, what ends that ground, what the law does there and whether a view holds trees down.", parameters: none },
  { name: "design_options", description: "The design options the search found, lawful and what-if, each measured against today with its evidence. Says so if no search has run.", parameters: none },
  { name: "design_stretch", description: "One stretch in one option: whether its ground is kept or reshaped, its levels and earth, the limits checked on it and what it rests on.", parameters: { type: "object", properties: { stretch: { type: "string", description: "A stretch's id, from edge_stretches." }, option: { type: "string", description: "An option's id, from design_options. Leave out for the one on show." } }, required: ["stretch"], additionalProperties: false } },
] as const;

export type ToolName = (typeof TOOL_SPECS)[number]["name"];

const NO_SEARCH = { available: false, note: "Nobody has run the search on this place yet, so there are no design options to read." };
const DESIGN_NOTE = "Options from a search whose weights are assumed. Levels are relative: the terrain is satellite, so a survey comes first. No hydraulic model is behind any of it, so nothing here says what a design does to flood heights. Being down at the water and how a place feels aren't scored.";

function markOf(place: Place, input: Record<string, unknown>): number {
  const m = input.mark;
  if (m === undefined || m === null) return lineIndex(place.brief);
  if (typeof m !== "number" || !Number.isInteger(m) || m < 0 || m >= place.brief.marks.length) throw new Error(`mark must be 0 to ${place.brief.marks.length - 1}`);
  return m;
}

function zone(ctx: ToolContext, mark: number) { return zoneOf(ctx.place, mark, releasedCells(ctx.place, ctx.decisions)); }

export function runTool(name: string, input: Record<string, unknown>, ctx: ToolContext): unknown {
  const { place } = ctx, ha = place.meta.cell_area / 1e4;
  switch (name as ToolName) {
    case "read_brief": {
      const b = place.brief;
      return { title: b.title, makes: b.makes, can_change: b.can_change, line: b.line, marks: b.marks, records: b.records, open_checks: b.open_checks,
        stays: b.stays.map(({ rings: _rings, ...s }) => s), rules: (b.rules ?? []).map(({ rings: _rings, ...r }) => r),
        views: (b.views ?? []).map((v) => ({ id: v.id, words: v.words, why: v.why, status: v.status })) };
    }
    case "read_decisions": {
      const now = standing(ctx.decisions);
      return { log: ctx.decisions.map((d) => ({ ...d, by: roleWords(d.by) })), waiting: place.brief.stays.filter((s) => !now.has(s.id)).map((s) => s.id) };
    }
    case "measure_today": {
      const mark = markOf(place, input), t = todayOf(place, mark, ctx.walk, releasedCells(place, ctx.decisions));
      return { level: place.brief.marks[mark].words, measures: t.measures, walks: t.walks.map((w) => ({ ...w, straight: Math.round(w.straight), walk: w.walk === null ? null : Math.round(w.walk) })), not_measured: t.notYet };
    }
    case "reach_at": {
      const level = input.level_m;
      if (typeof level !== "number" || !Number.isFinite(level)) throw new Error("level_m must be a number");
      const reach = reachAt(place, level);
      const cells = reach.reduce((a, v) => a + v, 0);
      const buildings = place.buildings.cell.filter((c) => c >= 0 && reach[c]).length;
      return { level_m: level, land_ha: round1(cells * ha), buildings, evidence: "estimate", note: "Satellite terrain, so rough; the gauge's datum is unchecked." };
    }
    case "check_floods":
      return checkRecords(place).map((c) => ({ date: c.record.date, level_m: c.record.m, reported: c.record.what, source: c.record.source, status: c.record.status, model: c.model || null, agrees: c.agrees }));
    case "river_year": {
      const y = riverYear(place);
      if (!y) return { available: false };
      return { years: place.year!.years, months: y.months.map((m) => ({ month: m.words, wet_ha: m.ha, clear_looks: m.looks, thin_reading: m.thin })),
        note: "Where water is on clear days, not how deep. Cloud hides short floods and muddy water reads weakly, so the monsoon looks smaller than it is." };
    }
    case "rules_in_zone": {
      const mark = markOf(place, input), z = zone(ctx, mark), bits = place.cells.rule ?? [];
      return { level: place.brief.marks[mark].words, zone_ha: round1(z.reduce((a, v) => a + v, 0) * ha),
        rules: (place.brief.rules ?? []).map((r, k) => ({ id: r.id, words: r.words, effect: r.effect, kind: r.kind, source: r.source, status: r.status, whole_study_area: !!r.whole,
          zone_ha: round1(z.reduce<number>((a, v, i) => a + (v && bits[i] & (1 << k) ? 1 : 0), 0) * ha) })) };
    }
    case "view_limits": {
      const mark = markOf(place, input), z = zone(ctx, mark), { results } = viewsOf(place);
      return { level: place.brief.marks[mark].words, views: results.map((r) => {
        const inZone: number[] = [];
        for (let i = 0; i < z.length; i++) if (z[i] && Number.isFinite(r.limit[i])) inZone.push(r.limit[i]);
        inZone.sort((a, b) => a - b);
        return { id: r.def.id, words: r.def.words, status: r.def.status, clear_share_to_foot: r.clear === null ? null : round1(r.clear * 100),
          crossing_today: r.blockers.slice(0, 5).map((b) => ({ name: b.name ?? "unnamed", over_m: b.over })),
          zone_limited_ha: round1(inZone.length * ha), lowest_limit_m: inZone.length ? round1(inZone[0]) : null, middle_limit_m: inZone.length ? round1(inZone[inZone.length >> 1]) : null };
      }), note: "Rough: satellite terrain, an assumed eye, trees left out, and some building heights are guesses." };
    }
    case "edge_stretches":
      return readEdge(place, releasedCells(place, ctx.decisions)).banks.flatMap((b) => b.stretches.map((s) => ({
        id: s.id, bank: b.words, length_m: Math.round(s.length), room: s.room, ground_m_middle: s.reach.mid, law: s.law, view_holds_trees_down: s.viewLow })));
    case "design_options": {
      if (!ctx.design?.options.length) return NO_SEARCH;
      return { on_show: ctx.design.on, note: DESIGN_NOTE, options: ctx.design.options.map((o) => ({
        id: o.id, words: o.words, why: o.why, class: o.works === "soft" ? "lawful, resting on an assumption" : "a what-if",
        scores: o.scores.map((s) => ({ words: s.words, unit: s.unit, evidence: s.evidence, today: s.today, design: s.design, today_band: s.todayBand ?? null, design_band: s.designBand ?? null, note: s.note })) })) };
    }
    case "design_stretch": {
      if (!ctx.design?.options.length) return NO_SEARCH;
      const id = input.option ?? ctx.design.on, o = ctx.design.options.find((x) => x.id === id);
      if (!o) throw new Error(`option must be one of ${ctx.design.options.map((x) => x.id).join(", ")}`);
      const f = o.fits.find((x) => x.stretch.id === input.stretch), s = o.stretches.find((x) => x.id === input.stretch);
      if (!f || !s) throw new Error(`no stretch called ${String(input.stretch)}`);
      return { option: o.id, stretch: f.stretch.id, law: f.stretch.law, ground: f.mode === "reshape" ? "reshaped" : f.mode === "plant" ? "kept" : "no room, left as it is",
        closest_precedent: s.like, levels_m: f.levels.map(round1), earth_dug_m3: Math.round(f.cut), earth_placed_m3: Math.round(f.fill), has_path: f.sections.some((x) => x.path),
        limits: f.checks.map((c) => ({ words: c.words, holds: c.holds, found: c.found })), rests_on: f.notes };
    }
    default:
      throw new Error(`no tool called ${name}`);
  }
}
