// One turn of an agent, behind POST /api/agent. The key, the agent's instructions and its tools stay on
// the server; the browser runs the tools on the place it already holds (agents/run.ts). Kept apart from
// the route so tests can run it with a stand-in for OpenRouter.
import { allowedOrigin, DEFAULT_MODELS, type Env } from "../brief/compile.js";
import { AGENTS, type AgentId, ALL_TOOLS } from "./roles.js";

export const AGENT_LIMITS = { bodyBytes: 1_500_000, messages: 40, perHour: 120, maxTokens: 6000, timeoutMs: 150_000 };
const OPENROUTER = "https://openrouter.ai/api/v1/chat/completions";
const APP_URL = "https://permutationcity.vercel.app";

export interface TurnDeps { fetch: typeof fetch; env: Env; now: () => number }

/** A message as the browser may send it: never a system message, which is the server's alone. */
export interface ChatMessage {
  role: "user" | "assistant" | "tool"; content?: string | null; tool_call_id?: string;
  tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[];
}

class Refused extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

const recent = new Map<string, number[]>();
export const resetAgentLimit = () => recent.clear();

function limit(client: string, now: number) {
  const times = (recent.get(client) ?? []).filter((t) => t > now - 3_600_000);
  if (times.length >= AGENT_LIMITS.perHour) throw new Refused(429, "That's a lot of agent work this hour from here; try again later.");
  times.push(now);
  recent.set(client, times);
}

function readTurn(body: unknown): { agent: AgentId; messages: ChatMessage[] } {
  const b = (body ?? {}) as { agent?: unknown; messages?: unknown };
  if (typeof b.agent !== "string" || !Object.hasOwn(AGENTS, b.agent)) throw new Refused(400, "There's no agent by that name.");
  if (!Array.isArray(b.messages) || !b.messages.length) throw new Refused(400, "Send the messages so far.");
  if (b.messages.length > AGENT_LIMITS.messages) throw new Refused(413, "This agent has gone on too long.");
  for (const m of b.messages as ChatMessage[]) {
    if (!["user", "assistant", "tool"].includes(m?.role)) throw new Refused(400, "A message has a role it can't have.");
  }
  return { agent: b.agent as AgentId, messages: b.messages as ChatMessage[] };
}

export async function agentTurn(request: Request, deps: TurnDeps): Promise<Response> {
  try {
    if (!allowedOrigin(request.headers.get("origin"), deps.env)) throw new Refused(403, "This endpoint only answers the Permutation City app.");
    const text = await request.text();
    if (text.length > AGENT_LIMITS.bodyBytes) throw new Refused(413, "The request is too large.");
    let body: unknown;
    try { body = JSON.parse(text); } catch { throw new Refused(400, "Send JSON."); }
    const { agent, messages } = readTurn(body);
    const key = deps.env.OPENROUTER_API_KEY;
    if (!key) throw new Refused(503, "The agents aren't set up here: there's no OpenRouter key.");
    limit(request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown", deps.now());
    const model = deps.env.OPENROUTER_MODEL_CAREFUL || DEFAULT_MODELS.careful;
    const r = await deps.fetch(OPENROUTER, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "HTTP-Referer": APP_URL, "X-Title": "Permutation City" },
      body: JSON.stringify({
        model, max_tokens: AGENT_LIMITS.maxTokens,
        messages: [{ role: "system", content: AGENTS[agent].system }, ...messages],
        tools: ALL_TOOLS.map((t) => ({ type: "function", function: t })),
        tool_choice: "auto",   // forcing a tool isn't supported for these models (see brief/compile.ts)
      }),
      signal: AbortSignal.timeout(AGENT_LIMITS.timeoutMs),
    });
    const data = await r.json().catch(() => null) as {
      choices?: { message?: ChatMessage }[]; usage?: { prompt_tokens?: number; completion_tokens?: number }; error?: { message?: string };
    } | null;
    if (!r.ok || !data?.choices?.[0]?.message) {
      console.error("openrouter", r.status, JSON.stringify(data?.error ?? data).slice(0, 2000));
      throw new Refused(502, `The language model didn't answer (${data?.error?.message ?? r.status}).`);
    }
    return Response.json({ message: data.choices[0].message, usage: data.usage ?? null, model }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof Refused) return Response.json({ error: e.message }, { status: e.status });
    const timeout = e instanceof Error && e.name === "TimeoutError";
    return Response.json({ error: timeout ? "The language model took too long. Try again." : "Something went wrong with the agent." }, { status: timeout ? 504 : 500 });
  }
}
