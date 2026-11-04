// A place as it is today, measured the way a design will be, so a design can be held against it
// (docs/architecture-v3.md section 15, step F1). This is the honest baseline for a focused brief:
// the real place, not an imagined opponent. Every measure says where it came from.
import { lineIndex, type Place, zoneOf } from "./place.js";
import { riverYear } from "./river.js";
import { viewsOf } from "./views.js";
import { Walk } from "./walk.js";

export const WALK_10_M = 800;     // ten minutes on foot
export const NEAR_STREET_M = 100; // a piece of bank this close to a mapped street or path counts as reachable
export const DOOR_M = 60;         // a building this close to a street or path has a way out to it
export const WET_LOOKS = 0.1;     // a cell wet in this share of clear satellite looks counts as often wet
export const WET_MONTH_DAYS = 30; // ground wet longer than this each year can't carry much but water and what suits it
export const TIGHT_M = 3;        // a view limit under this leaves room for little more than a person and a tree

/** data: satellite or survey data as read. map: from the open map, which misses things and can't
 *  tell a public path from a closed one. estimate: built on assumptions, which the note names. */
export type Evidence = "data" | "map" | "estimate";

export interface Measure {
  key: string; words: string; value: number | null; unit: string; evidence: Evidence; note: string;
  /** The same measure for the left and right banks, when it differs by side. */
  sides?: { taj: number; mehtab: number };
}

export interface WalkBetween { words: string; straight: number; walk: number | null; note?: string }

export interface Today {
  mark: number;
  zone: Uint8Array;
  measures: Measure[];
  walks: WalkBetween[];
  /** Per building: 1 within a ten-minute walk of the bank. */
  near: Uint8Array;
  /** Named things the brief will be judged on that nobody has measured yet. */
  notYet: string[];
  joined: number;
}

export const NOT_YET = [
  "How deep the water stands through the year (needs a daily gauge record; the satellite shows only where it's wet)",
  "Shade on a hot afternoon, for people walking and sitting",
  "Places to sit",
  "Who can actually walk where: gates, fences, tickets and closed paths aren't on the map",
];

const mean = (vals: number[]) => (vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null);
const round = (v: number | null, nd = 1) => (v === null ? null : Math.round(v * 10 ** nd) / 10 ** nd);

function centre(ring: number[]): [number, number] {
  let x = 0, y = 0;
  for (let k = 0; k < ring.length; k += 2) { x += ring[k]; y += ring[k + 1]; }
  return [x / (ring.length / 2), y / (ring.length / 2)];
}

/** Footprint area of a flat ring, m². */
export function ringArea(ring: number[]): number {
  let a = 0;
  const n = ring.length;
  for (let k = 0; k < n; k += 2) a += ring[k] * ring[(k + 3) % n] - ring[(k + 2) % n] * ring[k + 1];
  return Math.abs(a) / 2;
}

export function todayOf(place: Place, mark = lineIndex(place.brief), walk?: Walk, released?: Uint8Array | null): Today {
  const { cells, buildings, meta } = place;
  const zone = zoneOf(place, mark, released);
  const n = zone.length, ha = meta.cell_area / 1e4;
  const inZone: number[] = [], landIn: number[] = [];
  for (let i = 0; i < n; i++) {
    if (zone[i]) inZone.push(i);
    if (cells.band[i] > 0 && !cells.tank[i]) landIn.push(i);
  }
  const net = walk ?? new Walk(place.streets.map((s) => s.pts));

  // Bank within reach of the street network, by side.
  const near = (i: number) => net.nearest(cells.x[i], cells.y[i], NEAR_STREET_M) >= 0;
  const side = (s: number) => {
    const bank: number[] = [];
    for (let i = 0; i < n; i++) if (cells.bank[i] && cells.side[i] === s) bank.push(i);
    return { all: bank.length, reach: bank.filter(near).length };
  };
  const taj = side(1), mehtab = side(2);
  const share = (a: { all: number; reach: number }) => (a.all ? a.reach / a.all : 0);

  // Who is within a ten-minute walk of the bank.
  const sources = new Set<number>();
  for (let i = 0; i < n; i++) if (cells.bank[i]) {
    const k = net.nearest(cells.x[i], cells.y[i], NEAR_STREET_M);
    if (k >= 0) sources.add(k);
  }
  const dist = net.from([...sources], WALK_10_M);
  const nearB = new Uint8Array(buildings.rings.length);
  let boxB = 0, nearCount = 0, zoneB = 0, zoneFoot = 0, zoneFloor = 0, guessed = 0;
  buildings.rings.forEach((ring, b) => {
    const cell = buildings.cell[b];
    if (cell < 0) return;
    boxB++;
    const [x, y] = centre(ring);
    const node = net.nearest(x, y, DOOR_M);
    if (node >= 0 && dist[node] <= WALK_10_M) { nearB[b] = 1; nearCount++; }
    if (zone[cell]) {
      const foot = ringArea(ring);
      zoneB++;
      zoneFoot += foot;
      zoneFloor += foot * Math.max(1, Math.round(buildings.h[b] / meta.storey_m));
      if (buildings.src[b] >= 3) guessed++;
    }
  });

  // Walks the brief names, on the map's streets and paths.
  const walks: WalkBetween[] = place.brief.links.map((l) => {
    const a = place.landmarks[l.from], b = place.landmarks[l.to];
    if (!a || !b) return { words: l.words, straight: 0, walk: null, note: "a named place isn't on the map" };
    const straight = Math.hypot(a[0] - b[0], a[1] - b[1]);
    const na = net.nearestMain(a[0], a[1], 300), nb = net.nearestMain(b[0], b[1], 300);
    if (na < 0 || nb < 0) return { words: l.words, straight, walk: null, note: "no mapped street near one end" };
    const d = net.from([na])[nb];
    return { words: l.words, straight, walk: Number.isFinite(d) ? d : null, ...(Number.isFinite(d) ? {} : { note: "no route within the mapped area" }), };
  });

  const lst = inZone.map((i) => cells.lst[i]).filter((v): v is number => v !== null);
  const lstAll = landIn.map((i) => cells.lst[i]).filter((v): v is number => v !== null);
  const measures: Measure[] = [
    { key: "zone_ha", words: "Land that can change", value: round(inZone.length * ha, 0), unit: "ha", evidence: "estimate",
      note: `Ground at or below the ${place.brief.marks[mark].words} mark, joined to the river, except the monuments. Satellite terrain, so rough.` },
    { key: "often_wet", words: "Of it, often wet", value: round(100 * inZone.filter((i) => cells.seasonal[i] >= WET_LOOKS).length / Math.max(1, inZone.length), 0), unit: "%", evidence: "data",
      note: "Wet in at least a tenth of clear satellite looks at the end of the monsoon, 2019 to 2025." },
    { key: "trees", words: "Tree cover in the zone", value: round(100 * (mean(inZone.map((i) => cells.trees[i])) ?? 0), 0), unit: "%", evidence: "data", note: "ESA WorldCover 2021." },
    { key: "green", words: "Other green in the zone", value: round(100 * (mean(inZone.map((i) => cells.green[i])) ?? 0), 0), unit: "%", evidence: "data", note: "Grass, crops and scrub; ESA WorldCover 2021." },
    { key: "hot", words: "Hot-season ground temperature", value: round(mean(lst)), unit: "°C", evidence: "data",
      note: `Satellite surface temperature, March to May, 2023 to 2025. The study box's land averages ${round(mean(lstAll))} °C.` },
    { key: "buildings", words: "Buildings standing in the zone", value: zoneB, unit: "", evidence: "map",
      note: `${round(zoneFoot / 1e4)} ha of footprint. They stay unless stakeholders decide otherwise.` },
    { key: "floor", words: "Floor area exposed at this mark", value: round(zoneFloor / 1e4, 1), unit: "ha", evidence: "estimate",
      note: `Footprint times storeys. ${zoneB ? Math.round(100 * guessed / zoneB) : 0}% of these heights are guesses from neighbours or a default.` },
    { key: "bank_reach", words: "River bank near a street or path", value: round(100 * (taj.reach + mehtab.reach) / Math.max(1, taj.all + mehtab.all), 0), unit: "%", evidence: "map",
      note: `Within ${NEAR_STREET_M} m of a mapped line. The map can't say whether you may walk it.`,
      sides: { taj: Math.round(100 * share(taj)), mehtab: Math.round(100 * share(mehtab)) } },
    { key: "walk_10", words: "Buildings within a 10-minute walk of the bank", value: round(100 * nearCount / Math.max(1, boxB), 0), unit: "%", evidence: "map",
      note: `${nearCount.toLocaleString("en-IN")} of ${boxB.toLocaleString("en-IN")} in the study box, by mapped streets and paths.` },
  ];

  // Rules across the zone, for those drawn on the map.
  const rules = place.brief.rules ?? [], bits = cells.rule ?? [];
  const inRule = (id: string) => {
    const k = rules.findIndex((r) => r.id === id);
    return k < 0 ? 0 : inZone.filter((i) => bits[i] & (1 << k)).length * ha;
  };
  if (rules.some((r) => r.id === "prohibited")) measures.push(
    { key: "prohibited", words: "Of it, in a monument's prohibited area", value: round(inRule("prohibited"), 0), unit: "ha", evidence: "estimate",
      note: "Within 100 m of what stays, from our outlines. No construction there; whether a path or planting counts is still to check." },
    { key: "regulated", words: "Of it, in a monument's regulated area", value: round(inRule("regulated"), 0), unit: "ha", evidence: "estimate",
      note: "The next 200 m out. Construction there needs permission." },
  );

  // The tightest view limit across the zone.
  const views = viewsOf(place);
  const limited = inZone.filter((i) => Number.isFinite(views.limit[i]));
  if (views.results.length) {
    const tight = limited.filter((i) => views.limit[i] < TIGHT_M).length;
    measures.push({ key: "view_limited", words: `Of it, where a view holds things under ${TIGHT_M} m`, value: round(tight * ha, 0), unit: "ha", evidence: "estimate",
      note: `A view sets a limit on ${round(limited.length * ha, 0)} ha of the zone. Rough: satellite terrain, an assumed eye, trees left out.` });
  }

  // The river's year across the zone.
  const year = riverYear(place);
  if (year) {
    const wetLong = inZone.filter((i) => year.dry[i] >= 0 && year.dry[i] <= 365 - WET_MONTH_DAYS).length;
    measures.push({ key: "wet_month", words: `Of it, seen wet over ${WET_MONTH_DAYS} days a year`, value: round(wetLong * ha, 0), unit: "ha", evidence: "data",
      note: `From how often the satellite saw each spot wet, month by month, ${place.year!.years[0]} to ${place.year!.years[1]}. Cloud hides short floods, so the rest isn't always dry.` });
  }
  return { mark, zone, measures, walks, near: nearB, notYet: NOT_YET, joined: net.joinedShare() };
}
