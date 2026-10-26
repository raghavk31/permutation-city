// Plot rules: what a site's regulations let each plot hold (FAR, ground coverage, height,
// setbacks) and what they ask of a layout (the share of land in plots, the share in parks).
// Only sites whose regulations have been read carry rules here; the others keep the brief's
// FAR and the rules' height caps as before (built form brief, section 3; docs/built-form.md).
//
// Bengaluru: corpus/regulations/bengaluru-rmp2015-far-setbacks.md and
// bengaluru-byelaws-2003.md, read against the PDFs on 2026-10-27.
import { STOREY_M } from "./config.js";

/** A step table: the value of the first row whose upper bound the input doesn't exceed. */
type Steps = readonly (readonly [upTo: number, value: number])[];
const step = (t: Steps, x: number) => { for (const [u, v] of t) if (x <= u) return v; return t[t.length - 1][1]; };

export interface PlotRules {
  /** The regulation, as the page names it. */
  name: string;
  /** FAR by the width of the road a plot faces (m). */
  far: Steps;
  /** Most ground coverage by plot area (m²). */
  coverage: Steps;
  /** Below this road width (m), buildings stop at `narrowRoadHeightM`. */
  narrowRoadM: number; narrowRoadHeightM: number;
  /** Setbacks for low buildings (up to `lowHeightM`), as shares of the site's depth and width
   *  (front, rear, side), on plots up to `lowAreaM2`; larger plots keep `largePlotM` all round. */
  lowHeightM: number; lowAreaM2: number; lowShares: { front: number; rear: number; side: number }; largePlotM: number;
  /** All-round setbacks above `lowHeightM`, by height (m). */
  high: Steps;
  /** Two buildings on one plot stand this share of the taller one's height apart. */
  spacingOfHeight: number;
  /** A layout keeps at most this share of its land in plots, and at least this share in parks. */
  plotShareMax: number; parkShareMin: number;
  /** From this many storeys a building is high-rise: a site at least `highRiseSiteM` deep and
   *  wide, a road at least `highRiseRoadM` wide, `fireClearM` clear all round. */
  highRiseStoreys: number; highRiseSiteM: number; highRiseRoadM: number; fireClearM: number;
  sources: Record<string, string>;
}

export const BENGALURU: PlotRules = {
  name: "Bengaluru RMP 2015 zoning regulations and Building Bye-laws 2003",
  far: [[12, 1.75], [18, 2.25], [24, 2.5], [30, 3.0], [Infinity, 3.25]],
  coverage: [[360, 0.75], [1000, 0.65], [2000, 0.6], [4000, 0.55], [Infinity, 0.5]],
  narrowRoadM: 9, narrowRoadHeightM: 11.5,
  lowHeightM: 11.5, lowAreaM2: 4000, lowShares: { front: 0.12, rear: 0.08, side: 0.08 }, largePlotM: 5,
  high: [[15, 5], [18, 6], [21, 7], [24, 8], [27, 9], [30, 10], [35, 11], [40, 12], [45, 13], [50, 14], [Infinity, 16]],
  spacingOfHeight: 0.5,
  plotShareMax: 0.55, parkShareMin: 0.15,
  highRiseStoreys: 5, highRiseSiteM: 21, highRiseRoadM: 12, fireClearM: 6,
  sources: {
    far: "RMP 2015 Zoning Regulations, Table 10 (Residential (Main)): FAR by road width",
    coverage: "RMP 2015 Zoning Regulations, Table 10: ground coverage by plot size",
    narrowRoad: "RMP 2015 Zoning Regulations, Table 10 note b: roads under 9 m, at most 11.5 m",
    setbacks: "RMP 2015 Zoning Regulations, Tables 8 and 9",
    spacing: "RMP 2015 Zoning Regulations 3.6 (i); Bye-laws 2003, Tables 4-6 note 12",
    layout: "RMP 2015 Zoning Regulations 6.1 (b), (c): plots at most 55% of the land, parks at least 15%",
    highRise: "Bye-laws 2003, 2.46 (ground plus four floors), 9.3.2, 9.3.3, 16.0 (e)",
  },
};

const BY_SITE: Record<string, PlotRules> = { "bengaluru-cascade": BENGALURU };

/** The plot rules of a site, or null where its regulations haven't been read. */
export const plotRulesOf = (siteId: string): PlotRules | null => BY_SITE[siteId] ?? null;

export const farFor = (R: PlotRules, roadM: number) => step(R.far, roadM);
export const coverageFor = (R: PlotRules, areaM2: number) => step(R.coverage, areaM2);
/** The most storeys a plot's road allows, or Infinity where only FAR, coverage and setbacks
 *  limit height. Storeys of STOREY_M. */
export const roadStoreys = (R: PlotRules, roadM: number) =>
  roadM < R.narrowRoadM ? Math.floor(R.narrowRoadHeightM / STOREY_M + 1e-9) : Infinity;
/** The all-round setback for a building of this height (m), above the low band. */
export const highSetback = (R: PlotRules, heightM: number) => step(R.high, heightM);
/** Setbacks of a low building (front, rear, side), from the plot's depth, width and area. */
export function lowSetbacks(R: PlotRules, depthM: number, widthM: number, areaM2: number) {
  if (areaM2 > R.lowAreaM2) return { front: R.largePlotM, rear: R.largePlotM, side: R.largePlotM };
  // Table 8: over 9 m, shares of depth and width; 6-9 m, 1 m in front and on one side; up to
  // 6 m, 1 m all round.
  const front = depthM > 9 ? R.lowShares.front * depthM : 1;
  const rear = depthM > 9 ? R.lowShares.rear * depthM : depthM > 6 ? 0 : 1;
  const side = widthM > 9 ? R.lowShares.side * widthM : 1;
  return { front, rear, side };
}

/** The most floor area the rules let a plot hold: FAR by its road times its area. Interior
 *  plots (no road) count as facing the narrowest band. */
export const plotCapacity = (R: PlotRules, areaM2: number, roadM: number) => farFor(R, roadM) * areaM2;
