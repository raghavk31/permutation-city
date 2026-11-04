// An agent's whole run, in the browser: ask the model for a turn, run the tools it calls on the place
// held here, and repeat until it hands in a report, which is then checked (engine/focus/findings.ts).
import { type CheckedReport, checkReport, readReport } from "../engine/focus/findings.js";
import { runTool, type ToolContext } from "../engine/focus/tools.js";
import { AGENTS, type AgentId, REPORT_TOOL } from "./roles.js";
import type { ChatMessage } from "./turn.js";

export const MAX_TURNS = 10;

export interface TurnAnswer { message: ChatMessage; usage?: { prompt_tokens?: number; completion_tokens?: number } | null; model?: string }
export type PostTurn = (agent: AgentId, messages: ChatMessage[]) => Promise<TurnAnswer>;

export interface AgentRun extends CheckedReport {
  agent: AgentId; toolsCalled: string[]; tokens: number; model: string;
}

export async function runAgent(agent: AgentId, ctx: ToolContext, post: PostTurn, onProgress?: (words: string) => void): Promise<AgentRun> {
  const messages: ChatMessage[] = [{ role: "user", content: AGENTS[agent].ask }];
  const results: unknown[] = [], toolsCalled: string[] = [];
  let tokens = 0, model = "";
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const a = await post(agent, messages);
    tokens += (a.usage?.prompt_tokens ?? 0) + (a.usage?.completion_tokens ?? 0);
    model = a.model ?? model;
    const calls = a.message.tool_calls ?? [];
    if (!calls.length) {
      messages.push({ role: "assistant", content: a.message.content ?? "" });
      messages.push({ role: "user", content: `Hand in your findings by calling ${REPORT_TOOL}.` });
      continue;
    }
    const final = calls.find((c) => c.function.name === REPORT_TOOL);
    if (final) {
      let raw: unknown = null;
      try { raw = JSON.parse(final.function.arguments); } catch { /* read below */ }
      const report = readReport(raw);
      if (!report) throw new Error("The agent's report couldn't be read. Try again.");
      return { ...checkReport(report, results, ctx.place.brief.stays.map((s) => s.id)), agent, toolsCalled, tokens, model };
    }
    messages.push({ role: "assistant", content: a.message.content ?? null, tool_calls: calls });
    for (const c of calls) {
      onProgress?.(c.function.name);
      toolsCalled.push(c.function.name);
      let content: string;
      try {
        const out = runTool(c.function.name, JSON.parse(c.function.arguments || "{}"), ctx);
        results.push(out);
        content = JSON.stringify(out);
      } catch (e) {
        content = JSON.stringify({ error: e instanceof Error ? e.message : "That tool failed." });
      }
      messages.push({ role: "tool", tool_call_id: c.id, content });
    }
  }
  throw new Error(`The agent didn't finish within ${MAX_TURNS} turns. Try again.`);
}

/** The real thing: one turn through /api/agent. */
export const postTurn: PostTurn = async (agent, messages) => {
  const r = await fetch("/api/agent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ agent, messages }) });
  const data = await r.json().catch(() => null) as (TurnAnswer & { error?: string }) | null;
  if (!r.ok || !data?.message) throw new Error(data?.error ?? `The agent service answered ${r.status}.`);
  return data;
};
