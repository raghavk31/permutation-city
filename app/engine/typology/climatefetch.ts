// Climate for any place (architecture-v3 section 13.6, B6): monthly normals for a point, fetched
// from NASA POWER's climatology API the same way pc/typology_climate.py fetches the library's
// and the sites' (the same parameters, the same conversion), so a typed place and a library
// place are read on one scale. The API answers browsers (Access-Control-Allow-Origin: *). When
// it doesn't answer, the nearest place already in climate.json stands in, and says how far.
import { CLIMATE, type Normals } from "./climate.js";

export const POWER_API = "https://power.larc.nasa.gov/api/temporal/climatology/point";
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const DAYS = [31, 28.25, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export const powerUrl = (lon: number, lat: number) =>
  `${POWER_API}?parameters=T2M,T2M_RANGE,PRECTOTCORR,RH2M&community=AG&longitude=${lon.toFixed(4)}&latitude=${lat.toFixed(4)}&format=JSON`;

interface PowerAnswer { geometry: { coordinates: [number, number, number] }; properties: { parameter: Record<string, Record<string, number>> } }

/** NASA POWER's answer as normals (pc/typology_climate.py `normals`: daily max and min as the
 *  mean plus or minus half the daily range, rain as mm a day times the month's days). */
export function powerNormals(d: PowerAnswer, lon: number, lat: number): Normals {
  const p = d.properties.parameter, t = p.T2M, r = p.T2M_RANGE, ok = (v: number | undefined) => v != null && v > -900;
  const round = (v: number) => Math.round(v * 10) / 10;
  if (!MONTHS.every((m) => ok(t?.[m]) && ok(r?.[m]) && ok(p.PRECTOTCORR?.[m]) && ok(p.RH2M?.[m]))) throw new Error("NASA POWER left months out for this place");
  return {
    at: [lon, lat], elev: Math.round(d.geometry.coordinates[2]),
    tmax: MONTHS.map((m) => round(t[m] + r[m] / 2)),
    tmin: MONTHS.map((m) => round(t[m] - r[m] / 2)),
    rain: MONTHS.map((m, i) => round(p.PRECTOTCORR[m] * DAYS[i])),
    rh: MONTHS.map((m) => round(p.RH2M[m])),
  };
}

/** Great-circle distance (km). */
export function km([lon1, lat1]: [number, number], [lon2, lat2]: [number, number]): number {
  const R = 6371, rad = Math.PI / 180, dLat = (lat2 - lat1) * rad, dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** The place in climate.json nearest a point. */
export function nearestPlace(lon: number, lat: number): { id: string; normals: Normals; km: number } {
  let best = { id: "", normals: undefined as unknown as Normals, km: Infinity };
  for (const [id, n] of Object.entries(CLIMATE.places)) {
    const d = km([lon, lat], n.at);
    if (d < best.km) best = { id, normals: n, km: d };
  }
  return best;
}

export interface PlaceClimate { normals: Normals; from: "power" | "nearest"; near?: { id: string; km: number }; note: string }

/** A point's climate: NASA POWER, else the nearest known place (said so). */
export async function climateAt(lon: number, lat: number, opts: { fetch?: typeof fetch; timeoutMs?: number } = {}): Promise<PlaceClimate> {
  const f = opts.fetch ?? fetch, ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), opts.timeoutMs ?? 60_000);
  try {
    const res = await f(powerUrl(lon, lat), { signal: ctl.signal });
    if (!res.ok) throw new Error(`NASA POWER answered ${res.status}`);
    const normals = powerNormals(await res.json() as PowerAnswer, lon, lat);
    return { normals, from: "power", note: `Climate for this point from NASA POWER (monthly normals, ${CLIMATE.years[0]}-${CLIMATE.years[1]}).` };
  } catch (e) {
    const n = nearestPlace(lon, lat);
    const why = e instanceof Error && e.name === "AbortError" ? "didn't answer in time" : "couldn't be reached";
    return { normals: n.normals, from: "nearest", near: { id: n.id, km: n.km }, note: `NASA POWER ${why}: using the climate of the nearest known place, ${Math.round(n.km)} km away.` };
  } finally { clearTimeout(timer); }
}
