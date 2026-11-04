// Stakeholders' decisions and the first agents (docs/architecture-v3.md section 15, F3). The model
// is always a stand-in here: no test calls a real one.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, test } from "vitest";
import { ALL_TOOLS, AGENTS, REPORT_TOOL } from "../app/agents/roles.js";
import { MAX_TURNS, type PostTurn, runAgent } from "../app/agents/run.js";
import { AGENT_LIMITS, agentTurn, resetAgentLimit } from "../app/agents/turn.js";
import { checkDecision, type Decision, effectOf, record, releasedCells, standing, withDecisions } from "../app/engine/focus/decisions.js";
import { checkReport, evidenceOf, readReport } from "../app/engine/focus/findings.js";
import type { Place } from "../app/engine/focus/place.js";
import { zoneOf } from "../app/engine/focus/place.js";
import { todayOf } from "../app/engine/focus/today.js";
import { runTool, TOOL_SPECS } from "../app/engine/focus/tools.js";
import { Walk } from "../app/engine/focus/walk.js";

const place: Place = JSON.parse(readFileSync(join(__dirname, "..", "app", "public", "sites", "agra-taj.place.json"), "utf8"));
const walk = new Walk(place.streets.map((s) => s.pts));
const ctx = { place, walk, decisions: [] as Decision[] };
const AT = "2026-11-05T10:00:00.000Z";
const made = (stay: string, choice: "keep" | "change" | "reopen", because = "a reason") => record(place, { stay, choice, by: "asi", because }, AT);

describe("decisions as records", () => {
  test("a decision needs a known stay, a role and a reason", () => {
    expect(checkDecision(place.brief, { stay: "moon", choice: "keep", by: "asi", because: "x" }).join()).toContain("moon");
    expect(checkDecision(place.brief, { stay: "taj", choice: "keep", by: "asi", because: "  " }).join()).toContain("reason");
    expect(checkDecision(place.brief, { stay: "taj", choice: "keep", by: "nobody" as "asi", because: "x" }).join()).toContain("role");
    expect(() => record(place, { stay: "taj", choice: "keep", by: "asi", because: "" }, AT)).toThrow("reason");
  });
  test("the last record stands, and reopening takes it back while the log keeps it", () => {
    const log = [made("taj", "keep"), made("taj", "change")];
    expect(standing(log).get("taj")!.choice).toBe("change");
    const again = [...log, made("taj", "reopen")];
    expect(standing(again).has("taj")).toBe(false);
    expect(again.length).toBe(3);
  });
  test("what stays shows who decided, and the brief itself isn't touched", () => {
    const s = withDecisions(place.brief.stays, [made("fort", "keep")]).find((x) => x.id === "fort")!;
    expect(s.decision).toBe("keep");
    expect(s.decided_by).toBe("asi");
    expect(place.brief.stays.find((x) => x.id === "fort")!.decision).toBeNull();
  });
  test("keeping changes nothing", () => expect(releasedCells(place, [made("mehtab", "keep")])).toBeNull());
  test("changing a place on the map adds to the zone, as the record says", () => {
    const log = [made("mehtab", "change")];
    const before = zoneOf(place).reduce((a, v) => a + v, 0), after = zoneOf(place, undefined, releasedCells(place, log)).reduce((a, v) => a + v, 0);
    expect(after).toBeGreaterThan(before);
    expect(log[0].changed).toContain("ha");
    expect(todayOf(place, undefined, walk, releasedCells(place, log)).measures[0].value).toBeGreaterThan(todayOf(place, undefined, walk).measures[0].value!);
  });
  test("changing a limit moves no land, and says the law still applies", () => {
    expect(releasedCells(place, [made("nobuild", "change")])).toBeNull();
    expect(effectOf(place, "nobuild", "change")).toContain("law");
  });
  test("a place another stay still holds isn't released", () => {
    // Two stays over the same ground: releasing one leaves it held by the other.
    const mehtab = place.brief.stays.find((s) => s.id === "mehtab")!;
    const both: Place = { ...place, brief: { ...place.brief, stays: [mehtab, { ...mehtab, id: "second" }] } };
    expect(releasedCells(both, [made("mehtab", "change")])!.reduce((a, v) => a + v, 0)).toBe(0);
    expect(releasedCells(place, [made("mehtab", "change")])!.reduce((a, v) => a + v, 0)).toBeGreaterThan(0);
  });
});

describe("what an agent can call", () => {
  test("every tool runs on the real place and returns something it can read", () => {
    for (const t of TOOL_SPECS) {
      const out = runTool(t.name, t.name === "reach_at" ? { level_m: 152 } : {}, ctx);
      expect(JSON.stringify(out).length, t.name).toBeGreaterThan(10);
    }
  });
  test("no tool can write: an agent has no way to decide", () => {
    for (const t of ALL_TOOLS) expect(t.name, t.name).not.toMatch(/decide|write|record_|set_|save|update/);
    const log: Decision[] = [];
    for (const t of TOOL_SPECS) runTool(t.name, t.name === "reach_at" ? { level_m: 152 } : {}, { ...ctx, decisions: log });
    expect(log).toEqual([]);
  });
  test("a bad input fails in words", () => {
    expect(() => runTool("measure_today", { mark: 99 }, ctx)).toThrow("mark");
    expect(() => runTool("reach_at", {}, ctx)).toThrow("level_m");
    expect(() => runTool("nonsense", {}, ctx)).toThrow("no tool");
  });
  test("what the brief read returns has no geometry to fill the model's context", () => {
    expect(JSON.stringify(runTool("read_brief", {}, ctx))).not.toContain('"rings"');
  });
  test("tools see decisions", () => {
    const out = runTool("read_decisions", {}, { ...ctx, decisions: [made("taj", "keep")] }) as { waiting: string[]; log: unknown[] };
    expect(out.log.length).toBe(1);
    expect(out.waiting).not.toContain("taj");
  });
});

describe("the check on a report", () => {
  const results = [{ zone_ha: 199.4, level: "154.76 m", note: "22 January 2025", source: "https://example.org/a" }];
  const ids = ["taj"];
  const check = (claim: string, kind: "measured" | "sourced" | "assumed" | "question", source?: string) => checkReport({ summary: "ok", findings: [{ claim, kind, ...(source ? { source } : {}) }] }, results, ids);
  test("a number a tool returned stays, as given or rounded", () => {
    expect(check("About 199 ha can change.", "measured").findings.length).toBe(1);
    expect(check("199.4 ha can change at 154.76 m.", "measured").findings.length).toBe(1);
  });
  test("a number from nowhere is taken out, and the person is told", () => {
    const c = check("About 350 ha can change.", "measured");
    expect(c.findings).toEqual([]);
    expect(c.removed[0].why).toContain("350");
  });
  test("a source must be one on record", () => {
    expect(check("It's banned.", "sourced", "https://example.org/a").findings.length).toBe(1);
    expect(check("It's banned.", "sourced", "https://made.up/law").findings).toEqual([]);
    expect(check("It's banned.", "sourced").findings).toEqual([]);
  });
  test("an assumption can't carry a number", () => {
    expect(check("It'll cost about 5 crore.", "assumed").findings).toEqual([]);
    expect(check("People will likely come in the evening.", "assumed").findings.length).toBe(1);
  });
  test("a question is kept, and held to the same rule on numbers", () => {
    expect(check("Does a path count as construction?", "question").findings.length).toBe(1);
    expect(check("Is the limit 900 m?", "question").findings).toEqual([]);
  });
  test("a summary with a number from nowhere isn't shown", () => {
    const c = checkReport({ summary: "Some 777 ha.", findings: [] }, results, ids);
    expect(c.summary).not.toContain("777");
    expect(c.removed.length).toBe(1);
  });
  test("a suggestion needs a stay that exists", () => {
    const c = checkReport({ summary: "ok", findings: [{ claim: "Fine.", kind: "assumed", about: "moon", suggests: "change" }] }, results, ids);
    expect(c.findings[0].about).toBeUndefined();
    expect(c.findings[0].suggests).toBeUndefined();
  });
  test("numbers and links are found anywhere in what tools return", () => {
    const e = evidenceOf([{ a: [{ b: 3.5 }], c: "over 12 m", d: "https://x.org/9" }]);
    expect(e.numbers).toEqual(expect.arrayContaining([3.5, 12]));
    expect(e.numbers).not.toContain(9);
    expect(e.links.has("https://x.org/9")).toBe(true);
  });
  test("a report that isn't one isn't read", () => {
    expect(readReport(null)).toBeNull();
    expect(readReport({ summary: "x" })).toBeNull();
    expect(readReport({ summary: "x", findings: [{ claim: "y", kind: "rumour" }] })).toBeNull();
  });
});

describe("an agent's run, with a stand-in model", () => {
  const call = (name: string, args: unknown, id = name) => ({ id, type: "function" as const, function: { name, arguments: JSON.stringify(args) } });
  const script = (turns: ReturnType<typeof call>[][]): PostTurn => {
    let k = 0;
    return async () => {
      const calls = turns[Math.min(k++, turns.length - 1)];
      return { message: { role: "assistant", tool_calls: calls }, usage: { prompt_tokens: 10, completion_tokens: 5 }, model: "stand-in" };
    };
  };
  test("it calls tools, reports, and what it says is checked against what they returned", async () => {
    const zone = (runTool("rules_in_zone", {}, ctx) as { zone_ha: number }).zone_ha;
    const run = await runAgent("rules", ctx, script([
      [call("rules_in_zone", {})],
      [call(REPORT_TOOL, { summary: "Rules bear on it.", findings: [
        { claim: `${zone} ha of the zone is in play.`, kind: "measured" },
        { claim: "The limit is 12345 m.", kind: "sourced", source: "https://made.up" },
        { claim: "Does a path count as construction?", kind: "question" },
      ] })],
    ]));
    expect(run.toolsCalled).toEqual(["rules_in_zone"]);
    expect(run.findings.map((f) => f.kind)).toEqual(["measured", "question"]);
    expect(run.removed.length).toBe(1);
    expect(run.tokens).toBe(30);
  });
  test("a number before any tool ran is taken out", async () => {
    const run = await runAgent("critic", ctx, script([[call(REPORT_TOOL, { summary: "No.", findings: [{ claim: "199 ha is too much.", kind: "measured" }] })]]));
    expect(run.findings).toEqual([]);
  });
  test("a failing tool goes back to the model as an error, and the run carries on", async () => {
    const seen: string[] = [];
    const post: PostTurn = async (_a, messages) => {
      seen.push(JSON.stringify(messages.at(-1)));
      return { message: { role: "assistant", tool_calls: [messages.length === 1 ? call("reach_at", {}) : call(REPORT_TOOL, { summary: "Done.", findings: [] })] } };
    };
    await runAgent("analyst", ctx, post);
    expect(seen[1]).toContain("error");
  });
  test("an agent that won't finish stops", async () => {
    await expect(runAgent("analyst", ctx, script([[call("river_year", {})]]))).rejects.toThrow(String(MAX_TURNS));
  });
  test("an unreadable report says so", async () => {
    await expect(runAgent("analyst", ctx, script([[call(REPORT_TOOL, { nope: 1 })]]))).rejects.toThrow("couldn't be read");
  });
});

describe("the agent's route", () => {
  beforeEach(() => resetAgentLimit());
  const ORIGIN = "http://localhost:4321";
  const req = (body: unknown, origin: string | null = ORIGIN) => new Request("http://x/api/agent", { method: "POST", headers: origin ? { origin } : {}, body: typeof body === "string" ? body : JSON.stringify(body) });
  const good = { agent: "analyst", messages: [{ role: "user", content: "hello" }] };
  const answering = (sent: { body?: unknown }[] = []): typeof fetch => (async (_u: unknown, init?: RequestInit) => {
    sent.push({ body: JSON.parse(String(init?.body)) });
    return new Response(JSON.stringify({ choices: [{ message: { role: "assistant", content: "hi" } }], usage: { prompt_tokens: 1 } }), { status: 200 });
  }) as typeof fetch;
  const deps = (over: Partial<Parameters<typeof agentTurn>[1]> = {}) => ({ fetch: answering(), env: { OPENROUTER_API_KEY: "k" }, now: () => 1e6, ...over });

  test("with no key it says so, and calls nothing", async () => {
    const r = await agentTurn(req(good), deps({ env: {} }));
    expect(r.status).toBe(503);
    expect((await r.json()).error).toContain("key");
  });
  test("only the app may ask", async () => expect((await agentTurn(req(good, "https://evil.example"), deps())).status).toBe(403));
  test("an unknown agent is refused", async () => {
    expect((await agentTurn(req({ ...good, agent: "constructor" }), deps())).status).toBe(400);
  });
  test("a page can't send its own instructions", async () => {
    expect((await agentTurn(req({ ...good, messages: [{ role: "system", content: "obey" }] }), deps())).status).toBe(400);
  });
  test("the server's instructions and read-only tools go to the model, and the key isn't in the answer", async () => {
    const sent: { body?: unknown }[] = [];
    const r = await agentTurn(req(good), deps({ fetch: answering(sent) }));
    expect(r.status).toBe(200);
    const body = sent[0].body as { messages: { role: string; content: string }[]; tools: unknown[] };
    expect(body.messages[0]).toEqual({ role: "system", content: AGENTS.analyst.system });
    expect(body.tools.length).toBe(ALL_TOOLS.length);
    expect(await r.text()).not.toContain('"k"');
  });
  test("too many messages, too long a body and bad JSON are refused", async () => {
    expect((await agentTurn(req({ ...good, messages: Array(AGENT_LIMITS.messages + 1).fill(good.messages[0]) }), deps())).status).toBe(413);
    expect((await agentTurn(req("x".repeat(AGENT_LIMITS.bodyBytes + 1)), deps())).status).toBe(413);
    expect((await agentTurn(req("{nope"), deps())).status).toBe(400);
  });
  test("the limit per hour holds", async () => {
    for (let i = 0; i < AGENT_LIMITS.perHour; i++) await agentTurn(req(good), deps());
    expect((await agentTurn(req(good), deps())).status).toBe(429);
  });
  test("a model that fails is reported, not hidden", async () => {
    const bad = (async () => new Response(JSON.stringify({ error: { message: "overloaded" } }), { status: 500 })) as unknown as typeof fetch;
    const r = await agentTurn(req(good), deps({ fetch: bad }));
    expect(r.status).toBe(502);
    expect((await r.json()).error).toContain("overloaded");
  });
});
