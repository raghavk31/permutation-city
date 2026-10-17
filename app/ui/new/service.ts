// Building a drawn site: send a polygon, follow the job, get the site. Two backends with the
// same answers: /api/sites (a GitHub workflow; app/sites/build.ts), or the layer service in
// service/ when VITE_SERVICE_URL is set (and in local development).
import { SERVICE } from "../sites";

export interface Limits {
  max_km2: number; max_cells: number; grid_types: string[]; cell_size: [number, number];
  context_m: [number, number]; jobs_per_hour: number; steps: string[];
  available?: boolean; // /api/sites: false when building isn't set up for this copy
}
export interface Job {
  job?: string; status: "queued" | "running" | "done" | "failed"; key: string; step?: string | null;
  detail?: string | null; steps?: string[]; position?: number; seconds?: number; error?: string | null;
  result?: string; size?: { km2: number; cells: number };
}
export interface SiteRequest {
  boundary: { type: "Polygon"; coordinates: number[][][] }; grid: { type: string; size: number }; name: string;
  context_m: number; sea_levels: Record<string, number>;
}

const API = `${import.meta.env.BASE_URL}api/sites`;
const started = new Map<string, number>(); // job → when this page started it (a new run takes a moment to appear)

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let r: Response;
  try {
    r = await fetch(path, init);
  } catch {
    throw new Error(SERVICE ? "Can't reach the layer service. It may be starting up or down; try again in a minute."
      : "Can't reach the site builder. Check the connection and try again.");
  }
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(typeof body.detail === "string" ? body.detail : `The layer service said ${r.status}.`);
  return body as T;
}

export const limits = () => call<Limits>(SERVICE ? `${SERVICE}/limits` : API);

export async function submit(req: SiteRequest): Promise<Job> {
  const init = { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(req) };
  const job = await call<Job>(SERVICE ? `${SERVICE}/sites` : API, init);
  if (job.job) started.set(job.job, Date.now());
  return job;
}

export const status = (job: string) => call<Job>(SERVICE ? `${SERVICE}/jobs/${job}`
  : `${API}?key=${job}&since=${started.get(job) ?? 0}`);

/** Mumbai's working figures (sites/mumbai-ewf/site.yaml); the template rules expect surge_2050. */
export const COASTAL_SEA_LEVELS = { high_tide: 2.5, surge_today: 3.5, surge_2050: 3.8 };
