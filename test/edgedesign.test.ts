// The options as a person and an agent read them (docs/architecture-v3.md section 15.9, step E5).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, test } from "vitest";
import { ALL_TOOLS, REPORT_TOOL } from "../app/agents/roles.js";
import { type PostTurn, runAgent } from "../app/agents/run.js";
import type { Decision } from "../app/engine/focus/decisions.js";
import { readEdge } from "../app/engine/focus/edge.js";
import { pathUnderAt, waterReach } from "../app/engine/focus/edgescore.js";
import { type EdgeOption, searchEdge } from "../app/engine/focus/edgesearch.js";
import type { Place } from "../app/engine/focus/place.js";
import { runTool } from "../app/engine/focus/tools.js";
import { Walk } from "../app/engine/focus/walk.js";

const place: Place = JSON.parse(readFileSync(join(__dirname, "..", "app", "public", "sites", "agra-taj.place.json"), "utf8"));
const read = readEdge(place), walk = new Walk(place.streets.map((s) => s.pts));
const bare = { place, walk, decisions: [] as Decision[] };
let options: EdgeOption[] = [];
beforeAll(() => { options = searchEdge(place, read, walk); }, 120_000);
const ctx = () => ({ ...bare, design: { options, on: "soft-river" } });

describe("how far the water comes", () => {
  const bank = [{ d: 0, z: 146 }, { d: 10, z: 148 }, { d: 20, z: 150 }, { d: 30, z: 147 }, { d: 40, z: 152 }];
  test("up to where the ground rises above it", () => expect(waterReach(bank, 147)).toBeCloseTo(5, 6));
  test("not at all if the bank stands above it", () => expect(waterReach(bank, 145)).toBe(0));
  test("a hollow behind higher ground stays dry until the water tops it", () => {
    expect(waterReach(bank, 149.9)).toBeLessThan(20);
    expect(waterReach(bank, 151)).toBeGreaterThan(30);
  });
  test("everywhere, if nothing stands above it", () => expect(waterReach(bank, 160)).toBe(40));
  test("nothing to read, nothing reached", () => expect(waterReach([], 150)).toBe(0));
});

describe("how much path is under", () => {
  test("none on the lowest level the slider reaches, and more as the river rises", () => {
    const fits = options[0].fits;
    let last = 0;
    for (const z of [140, 148, 150, 152, 154, 156, 170]) { const u = pathUnderAt(fits, z); expect(u.under).toBeGreaterThanOrEqual(last); expect(u.under).toBeLessThanOrEqual(u.all + 1e-9); last = u.under; }
    expect(pathUnderAt(fits, 140).under).toBe(0);
    expect(pathUnderAt(fits, 170).under).toBeCloseTo(pathUnderAt(fits, 170).all, 6);
  });
  test("adds up to the path the score counts", () => {
    for (const o of options) expect(pathUnderAt(o.fits, 0).all).toBeCloseTo(o.scores.find((s) => s.key === "path_km")!.design!, 0);
  });
});

describe("the options travel to the page", () => {
  test("they survive being sent from the worker", () => {
    const back: EdgeOption[] = structuredClone(options);
    expect(back.map((o) => o.id)).toEqual(options.map((o) => o.id));
    expect(back[0].fits[0].sections.length).toBe(options[0].fits[0].sections.length);
    expect(back[0].scores).toEqual(options[0].scores);
  });
});

describe("what an agent can read of a design", () => {
  test("says plainly when no search has run", () => {
    expect((runTool("design_options", {}, bare) as { available: boolean }).available).toBe(false);
    expect((runTool("design_stretch", { stretch: "B4" }, bare) as { available: boolean }).available).toBe(false);
  });
  test("each stretch, with the law on it", () => {
    const s = runTool("edge_stretches", {}, bare) as { id: string; law: string }[];
    expect(s.length).toBe(25);
    expect(s.find((x) => x.id === "B7")!.law).toBe("prohibited");
  });
  test("every option, with its class and evidence and what it can't claim", () => {
    const o = runTool("design_options", {}, ctx()) as { on_show: string; note: string; options: { id: string; class: string; scores: { evidence: string; design: number | null }[] }[] };
    expect(o.options.length).toBe(options.length);
    expect(o.on_show).toBe("soft-river");
    expect(o.note).toMatch(/hydraulic/);
    expect(o.options.find((x) => x.id === "hard-room")!.class).toMatch(/what-if/);
    for (const x of o.options) for (const s of x.scores) expect(["data", "map", "estimate"]).toContain(s.evidence);
  });
  test("one stretch: the option on show unless told otherwise", () => {
    const shown = runTool("design_stretch", { stretch: "B8" }, ctx()) as { option: string; limits: { holds: boolean }[]; ground: string };
    expect(shown.option).toBe("soft-river");
    expect(shown.limits.every((l) => l.holds)).toBe(true);
    const other = runTool("design_stretch", { stretch: "B4", option: "soft-room" }, ctx()) as { option: string; ground: string; earth_dug_m3: number };
    expect(other.option).toBe("soft-room");
    expect(other.ground).toBe("reshaped");
    expect(other.earth_dug_m3).toBeGreaterThan(0);
  });
  test("a bad input fails in words", () => {
    expect(() => runTool("design_stretch", { stretch: "Z9" }, ctx())).toThrow("no stretch");
    expect(() => runTool("design_stretch", { stretch: "B4", option: "nope" }, ctx())).toThrow("option must be");
  });
  test("reading changes nothing, and nothing offered can change a design", () => {
    const c = ctx(), before = JSON.stringify(options[0].scores);
    for (const t of ["edge_stretches", "design_options"]) runTool(t, {}, c);
    runTool("design_stretch", { stretch: "B4" }, c);
    expect(JSON.stringify(options[0].scores)).toBe(before);
    expect(c.design.on).toBe("soft-river");
    for (const t of ALL_TOOLS) expect(t.name).not.toMatch(/decide|write|record_|set_|save|update|choose|change/);
  });
  test("a report can use a design's numbers, and one it never read is taken out", async () => {
    const days = options.find((o) => o.id === "soft-river")!.scores.find((s) => s.key === "days_walkable")!.design!;
    const steps = [
      [{ id: "1", type: "function" as const, function: { name: "design_options", arguments: "{}" } }],
      [{ id: "2", type: "function" as const, function: { name: REPORT_TOOL, arguments: JSON.stringify({ summary: "Read.", findings: [
        { claim: `The riverside option is walkable on ${days} days.`, kind: "measured" },
        { claim: "It saves 98765 rupees.", kind: "measured" },
      ] }) } }],
    ];
    let k = 0;
    const post: PostTurn = async () => ({ message: { role: "assistant", content: null, tool_calls: steps[k++] } });
    const run = await runAgent("critic", ctx(), post);
    expect(run.findings.map((f) => f.claim).join()).toContain(String(days));
    expect(run.removed.map((f) => f.claim).join()).toContain("98765");
  });
});
