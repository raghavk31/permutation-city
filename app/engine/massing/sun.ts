// Where the sun is (docs/massing.md). Solar time, so 12:00 is solar noon at the site; no
// time zones or equation of time, which a sun study at this grain doesn't need.
//
//   declination   Spencer (1971), from the day of the year
//   altitude      sin(alt) = sin(lat) sin(dec) + cos(lat) cos(dec) cos(hour angle)
//   azimuth       clockwise from north
//
// The sun vectors a score uses are written into the bench file (pc/massing_check.py), so the
// Python check recomputes the scores from the same numbers.

export interface Sun {
  altitude: number;  // radians above the horizon
  azimuth: number;   // radians clockwise from north
  /** Unit vector towards the sun: x east, y north, z up. */
  dir: [number, number, number];
}

const RAD = Math.PI / 180;

/** Day of the year (1 to 365) of a month (1 to 12) and day, in a year that isn't a leap year. */
export function dayOfYear(month: number, day: number): number {
  const starts = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  return starts[month - 1] + day;
}

/** Declination (radians), Spencer's series. */
export function declination(doy: number): number {
  const g = (2 * Math.PI * (doy - 1)) / 365;
  return 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g)
    + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
}

/** The sun at a latitude (degrees), day of the year and solar hour (0 to 24). */
export function sunAt(latDeg: number, doy: number, hour: number): Sun {
  const lat = latDeg * RAD, dec = declination(doy), h = (hour - 12) * 15 * RAD;
  const sinAlt = Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(h);
  const altitude = Math.asin(Math.max(-1, Math.min(1, sinAlt)));
  // Components in east, north, up.
  const e = -Math.cos(dec) * Math.sin(h);
  const n = Math.cos(lat) * Math.sin(dec) - Math.sin(lat) * Math.cos(dec) * Math.cos(h);
  const u = sinAlt;
  const len = Math.hypot(e, n, u) || 1;
  const azimuth = (Math.atan2(e, n) + 2 * Math.PI) % (2 * Math.PI);
  return { altitude, azimuth, dir: [e / len, n / len, u / len] };
}

/** Suns every `step` hours from `from` to `to` (solar time), those above `minAlt` degrees. */
export function sunPath(latDeg: number, doy: number, from: number, to: number, step: number, minAlt = 5): Sun[] {
  const out: Sun[] = [];
  for (let k = 0; from + k * step <= to + 1e-9; k++) {
    const s = sunAt(latDeg, doy, from + k * step);
    if (s.altitude >= minAlt * RAD) out.push(s);
  }
  return out;
}
