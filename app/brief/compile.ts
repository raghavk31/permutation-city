// The brief compiler, behind POST /api/brief (app/api/brief.ts). Kept apart from the route
// so tests can run it with a stand-in for OpenRouter.
//
// In: the site summary (made in the browser), the person's description, and snippets cut
// from their uploads. Out: a validated brief, the warnings for anything dropped, and every
// snippet the compiler was shown, so the page can show each citation.
import * as E from "../engine/index.js";
import type { Snippet } from "./chunk.js";
import { briefSchema, SYSTEM, TOOL, userMessage } from "./prompt.js";
import { retrieve } from "./retrieve.js";
import type { SiteSummary } from "./summary.js";

export const LIMITS = {
  bodyBytes: 4_000_000, description: 4000, uploads: 600, uploadChars: 2000, uploadTotal: 1_200_000,
  perHour: 8, maxTokens: 4000, timeoutMs: 150_000,
};
export const DEFAULT_MODELS = { standard: "anthropic/claude-sonnet-5.5", careful: "anthropic/claude-opus-5.5" };
const OPENROUTER = "https://openrouter.ai/api/v1/chat/completions";
const APP_URL = "https://permutationcity.vercel.app";
// The app, and its preview deployments. (permutation-city.vercel.app is someone else's.)
const ORIGIN_RE = /^https:\/\/(permutationcity|permutation-city-[a-z0-9-]+-raghav-6207s-projects)\.vercel\.app$/;
const LOCAL_RE = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

export interface Env { OPENROUTER_API_KEY?: string; OPENROUTER_MODEL?: string; OPENROUTER_MODEL_CAREFUL?: string; ALLOWED_ORIGINS?: string }
export interface Deps { fetch: typeof fetch; env: Env; now: () => number }

export interface BriefRequest {
  site: SiteSummary;
  description: string;
  uploads: Snippet[];
  quality?: "standard" | "careful";
}
export interface BriefResponse {
  brief: E.Brief; warnings: string[]; snippets: Snippet[]; model: string;
  usage: { prompt_tokens?: number; completion_tokens?: number } | null;
}

class Refused extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

const recent = new Map<string, number[]>(); // client → request times (per instance only)

function allowedOrigin(origin: string | null, env: Env): boolean {
  if (!origin) return false;
  const extra = (env.ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return ORIGIN_RE.test(origin) || LOCAL_RE.test(origin) || extra.includes(origin);
}

function rateLimit(client: string, now: number) {
  const hour = now - 3_600_000;
  const times = (recent.get(client) ?? []).filter((t) => t > hour);
  if (times.length >= LIMITS.perHour) throw new Refused(429, `That's ${LIMITS.perHour} briefs this hour from here; try again later.`);
  times.push(now);
  recent.set(client, times);
}

/** For tests: forget the rate limiter's memory. */
export const resetRateLimit = () => recent.clear();

function readRequest(body: unknown): BriefRequest {
  if (typeof body !== "object" || body === null) throw new Refused(400, "Send JSON: {site, description, uploads}.");
  const b = body as Record<string, unknown>;
  const site = b.site as SiteSummary | undefined;
  if (!site || typeof site !== "object" || !Array.isArray(site.rules) || typeof site.place !== "string") {
    throw new Refused(400, "The site summary is missing.");
  }
  if (site.rules.length > 32) throw new Refused(400, "Too many rules.");
  const description = typeof b.description === "string" ? b.description : "";
  if (description.length > LIMITS.description) throw new Refused(413, `Keep the description under ${LIMITS.description} characters.`);
  const uploads = Array.isArray(b.uploads) ? b.uploads : [];
  if (uploads.length > LIMITS.uploads) throw new Refused(413, "The documents are too long; upload fewer or shorter ones.");
  let total = 0;
  const clean: Snippet[] = uploads.map((u) => {
    const s = u as Partial<Snippet>;
    if (typeof s.id !== "string" || !s.id.startsWith("upload:") || typeof s.text !== "string") {
      throw new Refused(400, "An uploaded snippet is malformed.");
    }
    const text = s.text.slice(0, LIMITS.uploadChars);
    total += text.length;
    return { id: s.id.slice(0, 120), title: String(s.title ?? "upload").slice(0, 120), heading: String(s.heading ?? "").slice(0, 60),
      ref: String(s.ref ?? "").slice(0, 160), source: "uploaded by the user", place: "upload", kind: "upload", text };
  });
  if (total > LIMITS.uploadTotal) throw new Refused(413, "The documents are too long; upload fewer or shorter ones.");
  return { site, description, uploads: clean, quality: b.quality === "careful" ? "careful" : "standard" };
}

/** The pattern cards' numbers, from the corpus ids ("pattern-021#1" → 21). */
export const patternNumbers = (corpus: Snippet[]) =>
  [...new Set(corpus.filter((s) => s.kind === "pattern").map((s) => Number(s.id.slice(8, 11))))].sort((a, b) => a - b);

export async function compileBrief(req: BriefRequest, corpus: Snippet[], deps: Deps): Promise<BriefResponse> {
  const key = deps.env.OPENROUTER_API_KEY;
  if (!key) throw new Refused(503, "The brief compiler isn't set up here (no OpenRouter key).");
  const model = req.quality === "careful"
    ? deps.env.OPENROUTER_MODEL_CAREFUL || DEFAULT_MODELS.careful
    : deps.env.OPENROUTER_MODEL || DEFAULT_MODELS.standard;

  const { snippets } = retrieve([...req.uploads, ...corpus], req.description, req.site.place);
  const ctx: E.BriefContext = {
    rules: req.site.rules.map((r) => ({ name: r.name, kind: r.kind as E.Rule["kind"] })),
    snippets: snippets.map((s) => s.id),
    patterns: patternNumbers(corpus),
  };
  const r = await deps.fetch(OPENROUTER, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "HTTP-Referer": APP_URL, "X-Title": "Permutation City" },
    body: JSON.stringify({
      model, temperature: 0.2, max_tokens: LIMITS.maxTokens,
      messages: [{ role: "system", content: SYSTEM }, { role: "user", content: userMessage(req.site, req.description, snippets) }],
      tools: [{ type: "function", function: { name: TOOL, description: "Propose the brief for this site.", parameters: briefSchema(ctx) } }],
      // Forcing a named tool isn't supported for these models on OpenRouter ("tool_choice: type
      // tool and any are not supported"), so the model is told to use it and may answer in text.
      tool_choice: "auto",
    }),
    signal: AbortSignal.timeout(LIMITS.timeoutMs),
  });
  const data = await r.json().catch(() => null) as {
    choices?: { message?: { tool_calls?: { function?: { arguments?: string } }[]; content?: string } }[];
    usage?: BriefResponse["usage"]; error?: { message?: string; metadata?: { raw?: string; provider_name?: string } };
  } | null;
  if (!r.ok || !data) {
    // The provider's own reason is in metadata.raw; keep it in the logs and, shortened, in the answer.
    console.error("openrouter", r.status, JSON.stringify(data?.error ?? data).slice(0, 2000));
    const raw = data?.error?.metadata?.raw;
    const why = [data?.error?.message ?? String(r.status), raw ? String(raw).slice(0, 300) : ""].filter(Boolean).join(": ");
    throw new Refused(502, `The language model didn't answer (${why}).`);
  }
  const msg = data.choices?.[0]?.message;
  const text = msg?.tool_calls?.[0]?.function?.arguments ?? msg?.content ?? "";
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Refused(502, "The language model's answer wasn't a brief. Try again.");
  }
  const { brief, warnings } = E.validateBrief(raw, ctx);
  return { brief, warnings, snippets, model, usage: data.usage ?? null };
}

/** The route: checks who's asking and how much, then compiles. Errors become JSON
 *  {error} with a status a person can act on. */
export async function handle(request: Request, corpus: Snippet[], deps: Deps): Promise<Response> {
  try {
    const origin = request.headers.get("origin");
    if (!allowedOrigin(origin, deps.env)) throw new Refused(403, "This endpoint only answers the Permutation City app.");
    const length = Number(request.headers.get("content-length") ?? 0);
    if (length > LIMITS.bodyBytes) throw new Refused(413, "The request is too large.");
    const text = await request.text();
    if (text.length > LIMITS.bodyBytes) throw new Refused(413, "The request is too large.");
    let body: unknown;
    try { body = JSON.parse(text); } catch { throw new Refused(400, "Send JSON."); }
    const req = readRequest(body);
    const client = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
    rateLimit(client, deps.now());
    return Response.json(await compileBrief(req, corpus, deps), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof Refused) return Response.json({ error: e.message }, { status: e.status });
    const timeout = e instanceof Error && e.name === "TimeoutError";
    return Response.json({ error: timeout ? "The language model took too long. Try again." : "Something went wrong compiling the brief." },
      { status: timeout ? 504 : 500 });
  }
}
