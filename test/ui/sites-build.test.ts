// /api/sites (app/sites/build.ts) with stand-ins for GitHub and Vercel Blob.
import { beforeEach, describe, expect, it } from "vitest";
import { cacheKey, checkRequest, handle, resetRateLimit, STEPS, type Deps } from "../../app/sites/build";

const SQUARE = { type: "Polygon", coordinates: [[[72.84, 18.95], [72.8415, 18.95], [72.8415, 18.9512], [72.84, 18.9512], [72.84, 18.95]]] };
const body = { boundary: SQUARE, grid: { type: "hex", size: 20 }, name: "Test", context_m: 250, sea_levels: {} };
const NOW = Date.parse("2026-10-17T12:00:00Z");

interface Fake { runs: Record<string, unknown>[]; steps: { name: string; status: string }[]; blobs: Record<string, string>; dispatched: unknown[] }

function fake(env: Record<string, string> = { GITHUB_DISPATCH_TOKEN: "t", BLOB_READ_WRITE_TOKEN: "b" }): Deps & { f: Fake } {
  const f: Fake = { runs: [], steps: [], blobs: {}, dispatched: [] };
  return {
    f, env, now: () => NOW,
    github: async (path: string, init?: RequestInit) => {
      if (path.endsWith("/dispatches")) { f.dispatched.push(JSON.parse(init!.body as string)); return new Response(null, { status: 204 }); }
      if (path.includes("/jobs")) return Response.json({ jobs: [{ steps: f.steps }] });
      return Response.json({ workflow_runs: f.runs });
    },
    blobUrl: async (p: string) => (p in f.blobs ? `https://blob.example/${p}` : null),
    fetch: (async (url: string) => Response.json(JSON.parse(f.blobs[url.replace("https://blob.example/", "")]))) as typeof fetch,
  };
}

const post = (b: unknown, origin = "https://permutationcity.vercel.app", ip = "1.1.1.1") =>
  new Request("https://permutationcity.vercel.app/api/sites", { method: "POST", body: JSON.stringify(b),
    headers: { "Content-Type": "application/json", Origin: origin, "x-forwarded-for": ip } });
const get = (q = "") => new Request(`https://permutationcity.vercel.app/api/sites${q}`);
const key = cacheKey(checkRequest(body).req, new Date(NOW));
const run = (status: string, conclusion: string | null = null, k = key) => ({
  id: 7, status, conclusion, display_title: `site ${k}`, created_at: "2026-10-17T11:58:00Z",
  run_started_at: "2026-10-17T11:58:30Z", html_url: "https://github.com/x/runs/7",
});

describe("checking a request", () => {
  it("measures the site and keeps only what the build needs", () => {
    const { req, size } = checkRequest({ ...body, extra: "dropped", sea_levels: { surge: 3.8, high: 2.5 } });
    expect(size.km2).toBeGreaterThan(0.015);
    expect(size.km2).toBeLessThan(0.025);
    expect(Object.keys(req).sort()).toEqual(["boundary", "context_m", "grid", "name", "rules", "sea_levels"]);
    expect(Object.keys(req.sea_levels)).toEqual(["high", "surge"]);
  });

  it.each([
    [{ ...body, boundary: { type: "Point", coordinates: [72, 18] } }, "polygon"],
    [{ ...body, boundary: { type: "Polygon", coordinates: [[[0, 0], [1, 1], [1, 0], [0, 1], [0, 0]]] } }, "crosses itself"],
    [{ ...body, grid: { type: "voronoi" } }, "hex or quad"],
    [{ ...body, grid: { size: 5 } }, "between 10 and 50"],
    [{ ...body, sea_levels: { "a b": 1 } }, "letters"],
    [{ ...body, boundary: { type: "Polygon", coordinates: [[[72.8, 18.9], [72.86, 18.9], [72.86, 18.96], [72.8, 18.96], [72.8, 18.9]]] } }, "the limit is 4 km²"],
    [{ ...body, rules: { defaults: {}, forbidden: [{ name: "x", when: "water" }] } }, "structured"],
  ])("refuses %#", (b, message) => {
    expect(() => checkRequest(b)).toThrow(message);
  });

  it("gives the same key for the same site, a new one each month or for a different grid", () => {
    const shuffled = { ...body, grid: { size: 20, type: "hex" }, name: "Another name" };
    expect(cacheKey(checkRequest(shuffled).req, new Date(NOW))).toBe(key);
    expect(cacheKey(checkRequest(body).req, new Date("2026-11-02T00:00:00Z"))).not.toBe(key);
    expect(cacheKey(checkRequest({ ...body, grid: { type: "quad", size: 20 } }).req, new Date(NOW))).not.toBe(key);
    expect(key).toMatch(/^[0-9a-f]{24}$/);
  });
});

describe("the route", () => {
  beforeEach(resetRateLimit);

  it("gives the limits, and says when building isn't set up", async () => {
    const on = await (await handle(get(), fake())).json();
    expect(on).toMatchObject({ max_km2: 4, available: true, steps: STEPS });
    expect((await (await handle(get(), fake({}))).json()).available).toBe(false);
    expect((await handle(post(body), fake({}))).status).toBe(503);
  });

  it("answers only the app", async () => {
    expect((await handle(post(body, "https://evil.example"), fake())).status).toBe(403);
  });

  it("returns a site built before at once", async () => {
    const d = fake();
    d.f.blobs[`sites/${key}/site.json`] = "{}";
    const r = await handle(post(body), d);
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ status: "done", result: `https://blob.example/sites/${key}/site.json` });
    expect(d.f.dispatched).toEqual([]);
  });

  it("starts the workflow with the key and the checked request", async () => {
    const d = fake({ GITHUB_DISPATCH_TOKEN: "t", BLOB_READ_WRITE_TOKEN: "b", VERCEL_GIT_COMMIT_REF: "v2-phase4" });
    const r = await handle(post({ ...body, extra: 1 }), d);
    expect(r.status).toBe(202);
    expect(await r.json()).toMatchObject({ job: key, status: "queued" });
    const sent = d.f.dispatched[0] as { ref: string; inputs: { key: string; request: string } };
    expect(sent.ref).toBe("v2-phase4");
    expect(sent.inputs.key).toBe(key);
    expect(JSON.parse(sent.inputs.request)).toEqual(checkRequest(body).req);
  });

  it("joins a build already running instead of starting another", async () => {
    const d = fake();
    d.f.runs = [run("in_progress")];
    d.f.steps = [{ name: "Set up job", status: "completed" }, { name: "elevation", status: "in_progress" }];
    const out = await (await handle(post(body), d)).json();
    expect(out).toMatchObject({ status: "running", step: "elevation", seconds: 90 });
    expect(d.f.dispatched).toEqual([]);
  });

  it("refuses when too many builds are running, or too many from one place", async () => {
    const busy = fake();
    busy.f.runs = ["a", "b", "c"].map((c) => run("in_progress", null, c.repeat(24)));
    expect((await handle(post(body), busy)).status).toBe(503);
    const d = fake();
    const codes = [];
    for (let k = 0; k < 7; k++) {
      const b = { ...body, boundary: { ...SQUARE, coordinates: [SQUARE.coordinates[0].map(([x, y]) => [x + k * 0.01, y])] } };
      codes.push((await handle(post(b, undefined, "9.9.9.9"), d)).status);
    }
    expect(codes).toEqual([202, 202, 202, 202, 202, 202, 429]);
  });

  it("reports the job: starting, queued, running, done, failed", async () => {
    const d = fake();
    expect(await (await handle(get(`?key=${key}&since=${NOW - 10_000}`), d)).json()).toMatchObject({ status: "queued", detail: "starting" });
    expect((await handle(get(`?key=${key}`), d)).status).toBe(404);
    d.f.runs = [run("queued")];
    expect(await (await handle(get(`?key=${key}`), d)).json()).toMatchObject({ status: "queued", position: 1 });
    d.f.runs = [run("in_progress")];
    d.f.steps = [{ name: "installing", status: "in_progress" }];
    expect(await (await handle(get(`?key=${key}`), d)).json()).toMatchObject({ status: "running", step: "setting up", detail: "installing tools" });
    d.f.runs = [run("completed", "failure")];
    d.f.blobs[`sites/${key}/error.json`] = JSON.stringify({ error: "the site is 5.0 km²; the limit is 4 km²." });
    expect(await (await handle(get(`?key=${key}`), d)).json()).toMatchObject({ status: "failed", error: "the site is 5.0 km²; the limit is 4 km²." });
    d.f.blobs[`sites/${key}/site.json`] = "{}";
    expect(await (await handle(get(`?key=${key}`), d)).json()).toMatchObject({ status: "done" });
    expect((await handle(get("?key=../../x"), d)).status).toBe(404);
  });
});
