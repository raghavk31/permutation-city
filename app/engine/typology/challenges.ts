// Climate challenges (architecture-v3 section 13.3): what a place's climate asks a building to
// solve, read from its six climate numbers (climate.ts), and how well a precedent or a nature
// gene answers them through its mechanisms (types.ts). Precedents are chosen by the challenges
// they answer, not by how alike their climate is (user, 31 October): a Kutch bhunga can teach
// Bengaluru about heat even though Kutch is drier.
//
// Each challenge has a weight from 0 (not a problem here) to 1 (the main problem), rising
// linearly between two thresholds. The thresholds are design assumptions, said so, and the
// person can add challenges the climate can't show (floods, a water shortage) or turn one off.
import { profile, type Normals } from "./climate.js";
import type { Mechanism } from "./types.js";

export const CHALLENGES = {
  heat: "Hot days",
  "humid-heat": "Heat with humid air",
  "dry-heat": "Heat with dry air",
  swing: "Hot days, cool nights",
  cold: "Cold",
  rain: "Heavy rain",
  monsoon: "Rain in one season, dry the rest",
  drought: "Little rain",
  flood: "Floods",
  "water-short": "Water in short supply",
} as const;
export type Challenge = keyof typeof CHALLENGES;

/** Mechanisms that answer a challenge, and those that work against it. */
export const ANSWERS: Record<Challenge, { good: Mechanism[]; bad?: Mechanism[] }> = {
  heat: { good: ["shade", "eaves", "mutual-shade", "reflect", "court", "stack"] },
  "humid-heat": { good: ["cross-vent", "porous", "eaves", "raised", "shade"], bad: ["evaporative", "compact"] },
  "dry-heat": { good: ["thermal-mass", "court", "evaporative", "compact", "mutual-shade", "wind-catch", "earth"], bad: ["porous"] },
  swing: { good: ["thermal-mass", "stack", "court", "earth"] },
  cold: { good: ["compact", "insulation", "solar", "thermal-mass", "earth"], bad: ["porous", "cross-vent", "raised"] },
  rain: { good: ["eaves", "raised", "flood-room", "recharge", "rain-harvest"] },
  monsoon: { good: ["storage", "rain-harvest", "recharge", "flood-room"] },
  drought: { good: ["rain-harvest", "storage", "earth", "loop"] },
  flood: { good: ["raised", "flood-room", "recharge", "storage"] },
  "water-short": { good: ["rain-harvest", "storage", "recharge", "loop", "filter"] },
};

/** A linear ramp: 0 at `from`, 1 at `to` (either direction). */
const ramp = (v: number, from: number, to: number) => Math.max(0, Math.min(1, (v - from) / (to - from)));

/** The thresholds (assumed, design judgement; docs/typologies.md "Climate challenges"). */
export const THRESHOLDS = {
  heat: [30, 38],          // hottest month's mean daily maximum, °C
  warm: [28, 34],          // a month's mean daily maximum that makes its humidity matter, °C
  humid: [60, 80],         // relative humidity in a warm month, %
  dry: [50, 30],
  swing: [8, 14],          // mean daily range, °C
  cold: [8, -8],           // coldest month's mean daily minimum, °C
  rain: [800, 2000],       // annual rain, mm
  monsoon: [0.45, 0.7],    // share of the year's rain in its wettest three months
  drought: [600, 250],     // annual rain, mm
} as const;

export interface Need { key: Challenge; weight: number; why: string }

/** What a climate asks of a building, heaviest first; `extra` adds challenges the person names.
 *  Humid and dry heat are read month by month: warm months that are humid (a monsoon summer)
 *  and hot months that are dry (a desert spring) can both happen in one place. */
export function needs(n: Normals, extra: Partial<Record<Challenge, number>> = {}): Need[] {
  const T = THRESHOLDS, c = profile(n), heat = ramp(c.hot, ...T.heat);
  const month = (f: (m: number) => number) => { let best = 0, at = 0; for (let m = 0; m < 12; m++) { const v = f(m); if (v > best) { best = v; at = m; } } return [best, at] as const; };
  const [humid, hm] = month((m) => ramp(n.tmax[m], ...T.warm) * ramp(n.rh[m], ...T.humid));
  const [dry, dm] = month((m) => ramp(n.tmax[m], ...T.heat) * ramp(n.rh[m], ...T.dry));
  const MON = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const out: Need[] = [
    { key: "heat", weight: heat, why: `days reach ${c.hot.toFixed(0)} °C in the hottest month` },
    { key: "humid-heat", weight: humid, why: `${n.tmax[hm].toFixed(0)} °C days at ${Math.round(n.rh[hm])}% humidity in ${MON[hm]}` },
    { key: "dry-heat", weight: dry, why: `${n.tmax[dm].toFixed(0)} °C days at ${Math.round(n.rh[dm])}% humidity in ${MON[dm]}` },
    { key: "swing", weight: ramp(c.swing, ...T.swing), why: `nights ${c.swing.toFixed(0)} °C cooler than days` },
    { key: "cold", weight: ramp(c.cold, ...T.cold), why: `winter nights at ${c.cold.toFixed(0)} °C` },
    { key: "rain", weight: ramp(c.rain, ...T.rain), why: `${Math.round(c.rain)} mm of rain a year` },
    { key: "monsoon", weight: ramp(c.season, ...T.monsoon), why: `${Math.round(c.season * 100)}% of the rain in three months` },
    { key: "drought", weight: ramp(c.rain, ...T.drought), why: `${Math.round(c.rain)} mm of rain a year` },
  ];
  for (const [k, w] of Object.entries(extra) as [Challenge, number][]) {
    const at = out.find((n) => n.key === k);
    if (at) { at.weight = Math.max(0, Math.min(1, w)); at.why += " (set by you)"; }
    else out.push({ key: k, weight: Math.max(0, Math.min(1, w)), why: "named by you" });
  }
  return out.filter((n) => n.weight > 0.05).sort((a, b) => b.weight - a.weight);
}

export interface Answer {
  /** 0..1: the weighted share of the challenges its mechanisms answer, less what works against. */
  fit: number;
  answers: Challenge[];
  against: Challenge[];
}

/** How well a set of mechanisms answers the needs. Each good mechanism for a challenge answers
 *  half of what is left of it (one: 1/2, two: 3/4, three: 7/8), so more ways of answering count
 *  but with less each; a bad one costs a quarter of the challenge's weight. */
export function answer(mechanisms: readonly Mechanism[], ns: readonly Need[]): Answer {
  const has = new Set(mechanisms), total = ns.reduce((s, n) => s + n.weight, 0);
  let got = 0;
  const answers: Challenge[] = [], against: Challenge[] = [];
  for (const n of ns) {
    const a = ANSWERS[n.key];
    const k = a.good.filter((m) => has.has(m)).length;
    if (k) { got += n.weight * (1 - 0.5 ** k); answers.push(n.key); }
    const b = a.bad?.filter((m) => has.has(m)).length ?? 0;
    if (b) { got -= (n.weight * b) / 4; against.push(n.key); }
  }
  return { fit: total > 0 ? Math.max(0, got / total) : 0, answers, against };
}
