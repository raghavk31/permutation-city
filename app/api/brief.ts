// POST /api/brief: the brief compiler (app/brief/compile.ts). The OpenRouter key stays here.
import { handle } from "../brief/compile.js";
import { CORPUS } from "./_corpus.js";

export function POST(request: Request): Promise<Response> {
  return handle(request, CORPUS, { fetch, env: process.env, now: Date.now });
}
