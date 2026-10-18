// The layer service (service/ in the repo): send a polygon, follow the job, get the site.
import { SERVICE } from "../sites";

export interface Limits {
  max_km2: number; max_cells: number; grid_types: string[]; cell_size: [number, number];
  context_m: [number, number]; jobs_per_hour: number; steps: string[];
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

function base(): string {
  if (!SERVICE) throw new Error("The layer service isn't set up for this copy of the app yet, so new sites can't be built. The ready-made sites still work.");
  return SERVICE;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let r: Response;
  try {
    r = await fetch(`${base()}${path}`, init);
  } catch {
    throw new Error("Can't reach the layer service. It may be starting up or down; try again in a minute.");
  }
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(typeof body.detail === "string" ? body.detail : `The layer service said ${r.status}.`);
  return body as T;
}

export const limits = () => call<Limits>("/limits");
export const submit = (req: SiteRequest) =>
  call<Job>("/sites", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(req) });
export const status = (job: string) => call<Job>(`/jobs/${job}`);

/** Mumbai's working figures (sites/mumbai-ewf/site.yaml); the template rules expect surge_2050. */
export const COASTAL_SEA_LEVELS = { high_tide: 2.5, surge_today: 3.5, surge_2050: 3.8 };
