// Scenario presets for the shock tests, each with its source (docs/shocks.md).
import type { SiteMeta } from "./types.js";

export interface Preset { label: string; value: number; source: string }

/** IPCC AR6 relative sea-level projections at the Mumbai (Apollo Bandar) tide gauge, PSMSL 43,
 *  in m relative to 1995-2014 (Fox-Kemper et al. 2021; Garner et al. 2021), as served by the
 *  NASA Sea Level Projection Tool. Medium confidence unless "-low". Quantiles 17, 50, 83. */
export const AR6_MUMBAI = {
  gauge: { name: "Mumbai (Apollo Bandar), PSMSL 43", lat: 18.917, lon: 72.833 },
  years: [2020, 2030, 2040, 2050, 2060, 2070, 2080, 2090, 2100],
  ssp126: { 17: [0.017, 0.052, 0.073, 0.101, 0.128, 0.156, 0.176, 0.197, 0.206], 50: [0.036, 0.076, 0.109, 0.15, 0.182, 0.226, 0.263, 0.3, 0.34], 83: [0.059, 0.107, 0.158, 0.219, 0.268, 0.334, 0.4, 0.465, 0.532] },
  ssp245: { 17: [0.022, 0.054, 0.087, 0.124, 0.156, 0.193, 0.235, 0.278, 0.323], 50: [0.04, 0.078, 0.118, 0.169, 0.213, 0.268, 0.331, 0.394, 0.462], 83: [0.062, 0.11, 0.164, 0.236, 0.303, 0.388, 0.481, 0.58, 0.684] },
  ssp585: { 17: [0.015, 0.059, 0.103, 0.15, 0.199, 0.261, 0.33, 0.425, 0.515], 50: [0.038, 0.082, 0.136, 0.198, 0.264, 0.348, 0.444, 0.564, 0.704], 83: [0.064, 0.114, 0.184, 0.27, 0.364, 0.485, 0.622, 0.787, 0.99] },
  "ssp585-low": { 17: [0.015, 0.058, 0.099, 0.145, 0.193, 0.261, 0.33, 0.425, 0.515], 50: [0.04, 0.084, 0.139, 0.206, 0.28, 0.377, 0.494, 0.644, 0.825], 83: [0.071, 0.138, 0.241, 0.371, 0.537, 0.745, 0.988, 1.27, 1.586] },
} as const;
export type SeaScenario = "ssp126" | "ssp245" | "ssp585" | "ssp585-low";
export const SEA_NAMES: Record<SeaScenario, string> = {
  ssp126: "SSP1-2.6", ssp245: "SSP2-4.5", ssp585: "SSP5-8.5", "ssp585-low": "SSP5-8.5 including low-confidence ice processes",
};
export const BASE_YEAR = 2025;   // the sites' sea levels are today's

/** Sea-level rise from BASE_YEAR to `year` (m), linear between the projection's decades. */
export function seaRise(scenario: SeaScenario, year: number, q: 17 | 50 | 83 = 50): number {
  const ys = AR6_MUMBAI.years, v = AR6_MUMBAI[scenario][q];
  const at = (t: number) => {
    if (t <= ys[0]) return v[0];
    for (let k = 1; k < ys.length; k++) if (t <= ys[k]) return v[k - 1] + ((v[k] - v[k - 1]) * (t - ys[k - 1])) / (ys[k] - ys[k - 1]);
    return v[v.length - 1];
  };
  return Math.round((at(year) - at(BASE_YEAR)) * 1000) / 1000;
}

const km = (lat1: number, lon1: number, lat2: number, lon2: number) =>
  Math.hypot((lat2 - lat1) * 111.3, (lon2 - lon1) * 111.3 * Math.cos(((lat1 + lat2) / 2) * Math.PI / 180));

const SITE_FILE = "the site's working level (site.yaml)";
const MMB = "Maharashtra Maritime Board shoreline plan, as reported (corpus/sites/mumbai-sea-levels.md)";
const AR6 = (s: string) => `IPCC AR6 at the Apollo Bandar gauge, ${s}, rise since ${BASE_YEAR} (NASA Sea Level Projection Tool)`;

/** Sea levels to test (m above mean sea level): the site's own, then, near Mumbai, the monsoon
 *  surge raised by AR6 sea-level rise, and the reported worst-case stacks. */
export function seaPresets(meta: SiteMeta): Preset[] {
  const own = meta.sea_levels ?? {};
  if (!Object.keys(own).length) return [];
  const words: Record<string, string> = { high_tide: "high tide today", surge_today: "monsoon surge today", surge_2050: "monsoon surge in 2050" };
  const out: Preset[] = Object.entries(own).map(([k, v]) => ({ label: `${words[k] ?? k.replace(/_/g, " ")}: +${v} m`, value: v, source: SITE_FILE }));
  const [lon, lat] = meta.origin, surge = own.surge_today;
  if (surge !== undefined && km(lat, lon, AR6_MUMBAI.gauge.lat, AR6_MUMBAI.gauge.lon) < 150) {
    const add = (label: string, s: SeaScenario, year: number, q: 17 | 50 | 83) => {
      const v = Math.round((surge + seaRise(s, year, q)) * 100) / 100;
      out.push({ label: `${label}: +${v} m`, value: v, source: AR6(`${SEA_NAMES[s]}${q === 50 ? " median" : ` ${q}th percentile`}, ${year}`) });
    };
    add("monsoon surge, 2050, SSP2-4.5 median", "ssp245", 2050, 50);
    add("monsoon surge, 2100, SSP2-4.5 median", "ssp245", 2100, 50);
    add("monsoon surge, 2100, SSP5-8.5 median", "ssp585", 2100, 50);
    add("monsoon surge, 2100, SSP5-8.5 high end (low confidence)", "ssp585-low", 2100, 83);
    out.push({ label: "highest reported tide plus largest surge, today: +4.92 m", value: 4.92, source: MMB });
    out.push({ label: "the same with 0.38 m of rise, 2050: +5.3 m", value: 5.3, source: MMB });
  }
  return out;
}

/** One-day rainfall return levels (mm) from IMD's 0.25° gridded daily rainfall (Pai et al.
 *  2014), annual maxima, GEV fitted by L-moments (docs/shocks.md). A grid cell is an areal
 *  mean over about 27 km, so point extremes (one rain gauge) run higher. */
export interface RainTable { cell: [number, number]; years: [number, number]; levels: { years: number; mm: number }[]; record: { mm: number; date: string } }
export const RAIN: RainTable[] = [
  { cell: [19.0, 72.75], years: [1951, 2024], record: { mm: 527.8, date: "1974-07-05" },
    levels: [{ years: 10, mm: 307 }, { years: 25, mm: 392 }, { years: 50, mm: 465 }, { years: 100, mm: 549 }] },
  { cell: [23.0, 72.5], years: [1951, 2024], record: { mm: 323.4, date: "2000-07-14" },
    levels: [{ years: 10, mm: 192 }, { years: 25, mm: 254 }, { years: 50, mm: 309 }, { years: 100, mm: 372 }] },
  { cell: [13.0, 77.75], years: [1951, 2024], record: { mm: 173.1, date: "2021-11-19" },
    levels: [{ years: 10, mm: 103 }, { years: 25, mm: 121 }, { years: 50, mm: 134 }, { years: 100, mm: 147 }] },
  { cell: [26.25, 91.75], years: [1951, 2024], record: { mm: 246.8, date: "1979-10-06" },
    levels: [{ years: 10, mm: 110 }, { years: 25, mm: 141 }, { years: 50, mm: 168 }, { years: 100, mm: 199 }] },
];

/** One rain gauge's record near a site (a point, so above the gridded levels). */
const GAUGE_RECORDS = [
  { lat: 19.09, lon: 72.85, label: "26 July 2005 at the Santacruz gauge: 944 mm", mm: 944,
    source: "IMD Santacruz observatory, 24 hours to 08:30 on 27 July 2005 (the IMD grid cell over the docks shows 492 mm that day)" },
];

/** Storms to test: the site's design storm, then the return levels of the nearest IMD cell
 *  (within 0.2°). */
export function rainPresets(meta: SiteMeta): Preset[] {
  const out: Preset[] = [{ label: `design storm: ${meta.design_storm_mm} mm`, value: meta.design_storm_mm, source: "the site's design storm (site.yaml)" }];
  const [lon, lat] = meta.origin;
  const t = RAIN.map((r) => ({ r, d: Math.hypot(r.cell[0] - lat, r.cell[1] - lon) })).filter((x) => x.d <= 0.2).sort((p, q) => p.d - q.d)[0]?.r;
  if (t) {
    const src = `IMD gridded rainfall, cell ${t.cell[0]}° N ${t.cell[1]}° E, ${t.years[0]}–${t.years[1]}, GEV`;
    for (const l of t.levels) out.push({ label: `${l.years}-year one-day rain: ${l.mm} mm`, value: l.mm, source: src });
    out.push({ label: `wettest day in that record (${t.record.date}): ${t.record.mm} mm`, value: t.record.mm, source: src });
  }
  for (const g of GAUGE_RECORDS) if (km(lat, lon, g.lat, g.lon) < 50) out.push({ label: g.label, value: g.mm, source: g.source });
  return out;
}

/** Heatwave rises (°C over a usual hot-season day), from IMD's definitions: a heat wave when
 *  the day's maximum is 4.5 to 6.4 °C above normal, a severe one above 6.4 °C. */
export const HEAT_PRESETS: Preset[] = [
  { label: "a hot spell: +2 °C", value: 2, source: "a smaller rise, for comparison" },
  { label: "IMD heat wave: +4.5 °C", value: 4.5, source: "India Meteorological Department, heat wave criteria" },
  { label: "IMD severe heat wave: +6.5 °C", value: 6.5, source: "India Meteorological Department, heat wave criteria" },
];
