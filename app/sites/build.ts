// Building new sites without a server of our own: /api/sites (app/api/sites.ts) checks a
// drawn site, and starts .github/workflows/build-site.yml, which runs the layer service's
// pipeline (service/actions.py) on a GitHub runner and puts the result in Vercel Blob.
//
//   GET  /api/sites                     the limits (as the layer service's /limits)
//   POST /api/sites                     a site: done at once if built before, else a job
//   GET  /api/sites?key=<key>&since=<ms>  the job: queued, running (and which step), done, failed
//
// The answers keep the layer service's shapes (app/ui/new/service.ts), so the picker works
// with either. The checks are the service's (service/pipeline.py check); the workflow runs
// them again in Python before building.
import { createHash } from "node:crypto";
import { estimatedCells, polygonKm2 } from "./geo.js";

export const LIMITS = {
  max_km2: 4.0, max_cells: 4500, grid_types: ["hex", "quad"], cell_size: [10, 50] as [number, number],
  context_m: [100, 500] as [number, number], jobs_per_hour: 6,
};
export const LAYERS_VERSION = 2, EXPORT_FORMAT = 3;
// The progress the page shows. The workflow's step names (build-site.yml) are these.
export const STEPS = ["setting up", "elevation", "bare earth", "land cover", "Overture map data", "layers",
  "rules and export"];
const STEP_OF: Record<string, string> = { installing: "setting up", saving: "rules and export" };
const MAX_BUSY = 3;              // builds queued or running at once, across everyone
const MAX_REQUEST_CHARS = 60000; // workflow inputs are limited to 65,535 characters
const MAX_VERTICES = 500;
const START_GRACE_MS = 3 * 60_000; // a run can take a little while to appear after it is started
const WORKFLOW = "build-site.yml";

export class Rejected extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

export interface SiteRequest {
  boundary: { type: "Polygon"; coordinates: number[][][] };
  grid: { type: string; size: number };
  name: string;
  context_m: number;
  sea_levels: Record<string, number>;
  rules: unknown;
}

export interface Job {
  job: string; status: "queued" | "running" | "done" | "failed"; key: string;
  step: string | null; detail: string | null; steps: string[]; position?: number; seconds: number;
  error: string | null; result?: string; size?: { km2: number; cells: number }; run?: string;
}

// --- checking a request ------------------------------------------------------------------

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function cross(a: number[], b: number[], c: number[]) {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

/** Whether two segments cross (touching at shared end points doesn't count). */
function crosses(p1: number[], p2: number[], q1: number[], q2: number[]): boolean {
  const d1 = cross(q1, q2, p1), d2 = cross(q1, q2, p2), d3 = cross(p1, p2, q1), d4 = cross(p1, p2, q2);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

function selfCrossing(ring: number[][]): boolean {
  const n = ring.length - 1;
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue; // first and last edges share a corner
      if (crosses(ring[i], ring[i + 1], ring[j], ring[j + 1])) return true;
    }
  }
  return false;
}

function polygonOf(g: unknown): number[][][] {
  let geom = g as Record<string, unknown> | null;
  if (geom?.type === "FeatureCollection") {
    const fs = geom.features as unknown[];
    if (!Array.isArray(fs) || fs.length !== 1) throw new Rejected(422, "send one polygon");
    geom = fs[0] as Record<string, unknown>;
  }
  if (geom?.type === "Feature") geom = geom.geometry as Record<string, unknown>;
  if (geom?.type !== "Polygon") throw new Rejected(422, "the site must be a polygon");
  const rings = geom.coordinates as number[][][];
  if (!Array.isArray(rings) || !rings.length || !rings.every((r) => Array.isArray(r) && r.length >= 4
    && r.every((p) => Array.isArray(p) && p.length >= 2 && isNum(p[0]) && isNum(p[1])))) {
    throw new Rejected(422, "can't read the polygon");
  }
  if (rings.reduce((s, r) => s + r.length, 0) > MAX_VERTICES) throw new Rejected(422, `use at most ${MAX_VERTICES} corners`);
  for (const r of rings) {
    for (const [lon, lat] of r) {
      if (lon < -180 || lon > 180 || lat < -85 || lat > 85) throw new Rejected(422, "coordinates must be longitude, latitude in degrees");
    }
    const [a, z] = [r[0], r[r.length - 1]];
    if (a[0] !== z[0] || a[1] !== z[1]) throw new Rejected(422, "the polygon must be closed");
    if (selfCrossing(r)) throw new Rejected(422, "the polygon is empty or crosses itself");
  }
  // Six decimals (about 10 cm) is plenty, and keeps the key stable.
  return rings.map((r) => r.map(([lon, lat]) => [Math.round(lon * 1e6) / 1e6, Math.round(lat * 1e6) / 1e6]));
}

function rulesOk(r: unknown) {
  if (r === null || r === undefined) return;
  if (typeof r !== "object" || !("defaults" in (r as object))) throw new Rejected(422, "rules need defaults");
  for (const kind of ["forbidden", "retained", "constrained"]) {
    for (const rule of ((r as Record<string, unknown>)[kind] as Record<string, unknown>[] | undefined) ?? []) {
      if (typeof rule?.when === "string") throw new Rejected(422, `rule '${rule.name}': send \`when\` in the structured form`);
    }
  }
}

/** The request as the workflow gets it, and its size, or a Rejected with a message a person can act on. */
export function checkRequest(body: unknown): { req: SiteRequest; size: { km2: number; cells: number } } {
  if (typeof body !== "object" || body === null) throw new Rejected(400, "send a JSON object");
  const b = body as Record<string, unknown>;
  const coordinates = polygonOf(b.boundary);
  const grid = (b.grid ?? {}) as Record<string, unknown>;
  const type = String(grid.type ?? "hex"), size = Number(grid.size ?? 20);
  if (!LIMITS.grid_types.includes(type)) throw new Rejected(422, `grid type '${type}' isn't available; use hex or quad`);
  if (!(size >= 10 && size <= 50)) throw new Rejected(422, "cell size must be between 10 and 50 m");
  const context_m = Number(b.context_m ?? 250);
  if (!(context_m >= 100 && context_m <= 500)) throw new Rejected(422, "context margin must be between 100 and 500 m");
  const sea = (b.sea_levels ?? {}) as Record<string, unknown>;
  if (typeof sea !== "object" || Array.isArray(sea)) throw new Rejected(422, "sea levels must be {name: metres}");
  const entries = Object.entries(sea);
  if (entries.length > 4 || entries.some(([, v]) => !isNum(v) || v < -2 || v > 10)) {
    throw new Rejected(422, "give up to 4 sea levels, each between -2 and 10 m");
  }
  if (entries.some(([k]) => !/^[A-Za-z0-9_]+$/.test(k))) throw new Rejected(422, "sea level names may use letters, digits and _ only");
  rulesOk(b.rules);
  const km2 = polygonKm2(coordinates);
  const cells = estimatedCells(km2, type as "hex" | "quad", size);
  if (km2 > LIMITS.max_km2) throw new Rejected(422, `the site is ${km2.toFixed(1)} km²; the limit is ${LIMITS.max_km2} km². Draw a smaller polygon.`);
  if (cells > LIMITS.max_cells) {
    throw new Rejected(422, `about ${cells.toLocaleString("en-IN")} cells at ${size} m; the limit is ${LIMITS.max_cells.toLocaleString("en-IN")}. Use bigger cells or a smaller polygon.`);
  }
  const req: SiteRequest = {
    boundary: { type: "Polygon", coordinates }, grid: { type, size }, context_m,
    name: (typeof b.name === "string" ? b.name.trim() : "").slice(0, 80) || "New site",
    sea_levels: Object.fromEntries(entries.sort(([a], [z]) => a.localeCompare(z))) as Record<string, number>,
    rules: b.rules ?? null,
  };
  if (JSON.stringify(req).length > MAX_REQUEST_CHARS) throw new Rejected(413, "the request is too large (simplify the polygon or the rules)");
  return { req, size: { km2: Math.round(km2 * 1000) / 1000, cells } };
}

/** JSON with keys sorted at every level, so equal requests hash equally. */
function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(",")}}`;
  }
  return JSON.stringify(v);
}

/** Everything that changes the result. The month stands in for the Overture release (the
 *  build fetches the latest), so a cached site is reused for at most a month. */
export function cacheKey(req: SiteRequest, now: Date): string {
  const parts = {
    polygon: req.boundary.coordinates, grid: [req.grid.type, req.grid.size], context_m: req.context_m,
    sea_levels: req.sea_levels, rules: req.rules ?? "template", layers: LAYERS_VERSION, export: EXPORT_FORMAT,
    month: now.toISOString().slice(0, 7),
  };
  return createHash("sha256").update(canonical(parts)).digest("hex").slice(0, 24);
}

// --- GitHub and Blob ------------------------------------------------------------------------

export interface Env {
  GITHUB_DISPATCH_TOKEN?: string; GITHUB_REPOSITORY?: string; BUILD_REF?: string; VERCEL_GIT_COMMIT_REF?: string;
  BLOB_READ_WRITE_TOKEN?: string;
}

/** What the handler needs from the outside, so tests can stand in for it. */
export interface Deps {
  env: Env;
  now: () => number;
  github: (path: string, init?: RequestInit) => Promise<Response>;
  /** The public URL of a blob, or null if there is none. */
  blobUrl: (path: string) => Promise<string | null>;
  fetch: typeof fetch;
}

interface Run {
  id: number; status: string; conclusion: string | null; display_title: string; created_at: string;
  run_started_at?: string; html_url: string;
}

const repo = (env: Env) => env.GITHUB_REPOSITORY || "raghavk31/permutation-city";

async function runs(deps: Deps): Promise<Run[]> {
  const r = await deps.github(`/repos/${repo(deps.env)}/actions/workflows/${WORKFLOW}/runs?event=workflow_dispatch&per_page=50`);
  if (!r.ok) throw new Rejected(502, `GitHub didn't answer (${r.status}).`);
  return ((await r.json()) as { workflow_runs: Run[] }).workflow_runs;
}

const titleOf = (key: string) => `site ${key}`;
const active = (r: Run) => r.status !== "completed";

async function currentStep(deps: Deps, run: Run): Promise<{ step: string; detail: string | null }> {
  const r = await deps.github(`/repos/${repo(deps.env)}/actions/runs/${run.id}/jobs`);
  if (!r.ok) return { step: STEPS[0], detail: null };
  const steps = ((await r.json()) as { jobs: { steps?: { name: string; status: string }[] }[] }).jobs[0]?.steps ?? [];
  const now = steps.find((s) => s.status === "in_progress") ?? [...steps].reverse().find((s) => s.status === "completed");
  const name = now?.name ?? "";
  if (STEPS.includes(name)) return { step: name, detail: null };
  if (name === "installing") return { step: STEP_OF[name], detail: "installing tools" };
  if (name === "saving") return { step: STEP_OF[name], detail: "saving the site" };
  return { step: STEPS[0], detail: "starting" };
}

async function jobFromRun(deps: Deps, key: string, run: Run, all: Run[]): Promise<Job> {
  const started = Date.parse(run.run_started_at ?? run.created_at);
  const base: Job = {
    job: key, key, status: "queued", step: null, detail: null, steps: STEPS, error: null, run: run.html_url,
    seconds: Math.max(0, Math.round((deps.now() - started) / 1000)),
  };
  if (run.status === "queued" || run.status === "pending" || run.status === "waiting") {
    base.position = all.filter((r) => r.status === "queued" && Date.parse(r.created_at) <= Date.parse(run.created_at)).length;
    return base;
  }
  if (active(run)) return { ...base, status: "running", ...(await currentStep(deps, run)) };
  const url = await deps.blobUrl(`sites/${key}/site.json`);
  if (url && run.conclusion === "success") return { ...base, status: "done", result: url };
  let error = "The build failed.";
  const errUrl = await deps.blobUrl(`sites/${key}/error.json`);
  if (errUrl) {
    const e = await deps.fetch(errUrl, { cache: "no-store" }).then((r) => r.json()).catch(() => null) as { error?: string } | null;
    if (e?.error) error = e.error;
  }
  return { ...base, status: "failed", error: run.conclusion === "cancelled" ? "The build was cancelled. Try again." : error };
}

// --- the routes -------------------------------------------------------------------------------

const recent = new Map<string, number[]>(); // client → build start times (per function instance)
export const resetRateLimit = () => recent.clear();

function rateLimit(client: string, now: number) {
  const times = (recent.get(client) ?? []).filter((t) => t > now - 3_600_000);
  if (times.length >= LIMITS.jobs_per_hour) throw new Rejected(429, `at most ${LIMITS.jobs_per_hour} new sites an hour; try again later`);
  times.push(now);
  recent.set(client, times);
}

/** The limits, and whether building is set up here at all (a GitHub token and a Blob store). */
export function limits(env: Env) {
  return { ...LIMITS, steps: STEPS, available: !!(env.GITHUB_DISPATCH_TOKEN && env.BLOB_READ_WRITE_TOKEN) };
}

/** GET ?key=: the job for a site. `since`: when the page started it (a new run takes a
 *  little while to show up). */
export async function status(deps: Deps, key: string, since: number | null): Promise<Job> {
  if (!/^[0-9a-f]{24}$/.test(key)) throw new Rejected(404, "no such site");
  const url = await deps.blobUrl(`sites/${key}/site.json`);
  if (url) return { job: key, key, status: "done", result: url, step: null, detail: null, steps: STEPS, error: null, seconds: 0 };
  const all = await runs(deps);
  const run = all.find((r) => r.display_title === titleOf(key));
  if (run) return jobFromRun(deps, key, run, all);
  if (since !== null && deps.now() - since < START_GRACE_MS) {
    return { job: key, key, status: "queued", step: null, detail: "starting", steps: STEPS, error: null,
      seconds: Math.round((deps.now() - since) / 1000), position: all.filter((r) => r.status === "queued").length + 1 };
  }
  throw new Rejected(404, "There's no build for this site. Draw it and build it again.");
}

/** POST: a cached site at once, the job already building it, or a new build. */
export async function submit(deps: Deps, body: unknown, client: string): Promise<{ code: number; body: Job }> {
  const { req, size } = checkRequest(body);
  const key = cacheKey(req, new Date(deps.now()));
  const done = await deps.blobUrl(`sites/${key}/site.json`);
  if (done) return { code: 200, body: { job: key, key, status: "done", result: done, size, step: null, detail: null, steps: STEPS, error: null, seconds: 0 } };
  if (!limits(deps.env).available) throw new Rejected(503, "Building new sites isn't set up for this copy of the app yet.");
  const all = await runs(deps);
  const mine = all.find((r) => r.display_title === titleOf(key) && active(r));
  if (mine) return { code: 202, body: { ...(await jobFromRun(deps, key, mine, all)), size } };
  if (all.filter(active).length >= MAX_BUSY) throw new Rejected(503, "Several sites are being built right now. Try again in a few minutes.");
  rateLimit(client, deps.now());
  const ref = deps.env.BUILD_REF || deps.env.VERCEL_GIT_COMMIT_REF || "main";
  const r = await deps.github(`/repos/${repo(deps.env)}/actions/workflows/${WORKFLOW}/dispatches`, {
    method: "POST", body: JSON.stringify({ ref, inputs: { key, request: JSON.stringify(req) } }),
  });
  if (!r.ok) {
    const why = await r.text().catch(() => "");
    console.error("dispatch failed", r.status, why.slice(0, 500));
    throw new Rejected(502, `Couldn't start the build (GitHub said ${r.status}).`);
  }
  return { code: 202, body: { job: key, key, status: "queued", step: null, detail: "starting", steps: STEPS, error: null,
    seconds: 0, size, position: all.filter((x) => x.status === "queued").length + 1 } };
}

const ORIGIN_RE = /^https:\/\/(permutationcity|permutation-city-[a-z0-9-]+-raghav-6207s-projects)\.vercel\.app$/;
const LOCAL_RE = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

/** The route: errors become {detail} (the layer service's shape) with a status a person can act on. */
export async function handle(request: Request, deps: Deps): Promise<Response> {
  const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
  try {
    const url = new URL(request.url);
    if (request.method === "GET") {
      const key = url.searchParams.get("key");
      if (!key) return json(limits(deps.env));
      const since = Number(url.searchParams.get("since"));
      return json(await status(deps, key, Number.isFinite(since) && since > 0 ? since : null));
    }
    if (request.method !== "POST") throw new Rejected(405, "use GET or POST");
    const origin = request.headers.get("origin");
    if (!origin || !(ORIGIN_RE.test(origin) || LOCAL_RE.test(origin))) throw new Rejected(403, "This endpoint only answers the Permutation City app.");
    const text = await request.text();
    if (text.length > 200_000) throw new Rejected(413, "the request is too large");
    let body: unknown;
    try { body = JSON.parse(text); } catch { throw new Rejected(400, "send JSON"); }
    const client = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
    const out = await submit(deps, body, client);
    return json(out.body, out.code);
  } catch (e) {
    if (e instanceof Rejected) return json({ detail: e.message }, e.status);
    console.error(e);
    return json({ detail: "Something went wrong. Try again in a minute." }, 500);
  }
}
