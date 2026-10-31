// Climate match (docs/typologies.md, "Climate match"): how close a precedent's climate is to a
// site's, from monthly normals (climate.json, written by pc/typology_climate.py: NASA POWER's
// climatology, MERRA-2 reanalysis at about 0.5°, 2001-2025, one source for every place).
//
// Six numbers describe a climate in the terms that shaped the precedents:
//   hot      mean daily maximum of the hottest month (°C)
//   cold     mean daily minimum of the coldest month (°C)
//   swing    mean daily range, maximum minus minimum, over the year (°C)
//   rain     annual rain (mm)
//   season   share of the year's rain falling in its wettest three months in a row
//   muggy    mean relative humidity in the hottest month (%)
// Each difference is divided by a step a person would notice, and the steps are summed as a
// root mean square: 0 is the same climate, about 1 is "noticeably different on one count".
// Rain is compared as a ratio (a doubling is one step), not as millimetres.
import data from "./climate.json" with { type: "json" };

export interface Normals { at: [number, number]; elev?: number; tmax: number[]; tmin: number[]; rain: number[]; rh: number[]; name?: string }
export interface Profile { hot: number; cold: number; swing: number; rain: number; season: number; muggy: number }

export const CLIMATE = data as unknown as { sources: string; years: [number, number]; places: Record<string, Normals> };

/** One noticeable step for each number. */
export const STEP: Profile = { hot: 3, cold: 4, swing: 3, rain: Math.log(2), season: 0.15, muggy: 12 };

export function profile(n: Normals): Profile {
  const hotMonth = n.tmax.indexOf(Math.max(...n.tmax));
  const total = n.rain.reduce((a, b) => a + b, 0);
  let wet3 = 0;
  for (let m = 0; m < 12; m++) wet3 = Math.max(wet3, n.rain[m] + n.rain[(m + 1) % 12] + n.rain[(m + 2) % 12]);
  return {
    hot: n.tmax[hotMonth],
    cold: Math.min(...n.tmin),
    swing: n.tmax.reduce((a, t, i) => a + t - n.tmin[i], 0) / 12,
    rain: total,
    season: total > 0 ? wet3 / total : 0,
    muggy: n.rh[hotMonth],
  };
}

const diff = (a: Profile, b: Profile): Profile => ({
  hot: (a.hot - b.hot) / STEP.hot,
  cold: (a.cold - b.cold) / STEP.cold,
  swing: (a.swing - b.swing) / STEP.swing,
  rain: Math.log(Math.max(a.rain, 10) / Math.max(b.rain, 10)) / STEP.rain,
  season: (a.season - b.season) / STEP.season,
  muggy: (a.muggy - b.muggy) / STEP.muggy,
});

/** Distance in noticeable steps (root mean square over the six numbers). */
export function distance(a: Profile, b: Profile): number {
  const d = Object.values(diff(a, b));
  return Math.sqrt(d.reduce((s, x) => s + x * x, 0) / d.length);
}

export const MATCH = [
  { upTo: 0.5, label: "Very close climate" },
  { upTo: 1.0, label: "Close climate" },
  { upTo: 1.8, label: "Somewhat alike" },
  { upTo: Infinity, label: "Different climate" },
] as const;
export const matchLabel = (d: number) => MATCH.find((m) => d <= m.upTo)!.label;

/** The two or three biggest differences of a precedent (a) from a site (b), in plain words. */
export function differences(a: Profile, b: Profile, max = 3): string[] {
  const d = diff(a, b);
  const words: [number, string][] = [
    [d.hot, `${Math.abs(a.hot - b.hot).toFixed(0)} °C ${a.hot > b.hot ? "hotter" : "cooler"} at the height of summer`],
    [d.cold, `${Math.abs(a.cold - b.cold).toFixed(0)} °C ${a.cold > b.cold ? "milder" : "colder"} on winter nights`],
    [d.swing, `${a.swing > b.swing ? "bigger" : "smaller"} swing between day and night (${a.swing.toFixed(0)} against ${b.swing.toFixed(0)} °C)`],
    [d.rain, a.rain > b.rain ? `${(a.rain / Math.max(b.rain, 1)).toFixed(1)} times the rain` : `${Math.round((100 * a.rain) / Math.max(b.rain, 1))}% of the rain`],
    [d.season, a.season > b.season ? "rain more bunched into one season" : "rain spread more through the year"],
    [d.muggy, `${a.muggy > b.muggy ? "more humid" : "drier"} in the hot season (${Math.round(a.muggy)}% against ${Math.round(b.muggy)}%)`],
  ];
  return words.filter(([x]) => Math.abs(x) >= 0.7).sort((p, q) => Math.abs(q[0]) - Math.abs(p[0])).slice(0, max).map(([, w]) => w);
}

/** The sites with climate data, as [id, name]. */
export const climateSites = (): [string, string][] =>
  Object.entries(CLIMATE.places).filter(([k]) => k.startsWith("site:")).map(([k, v]) => [k.slice(5), v.name ?? k.slice(5)]);
