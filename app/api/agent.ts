// POST /api/agent: one turn of an agent (app/agents/turn.ts). The OpenRouter key stays here.
import { agentTurn } from "../agents/turn.js";

export function POST(request: Request): Promise<Response> {
  return agentTurn(request, { fetch, env: process.env, now: Date.now });
}
