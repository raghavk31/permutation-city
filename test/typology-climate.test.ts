// Climate match (engine/typology/climate.ts): the six numbers, the distance, the plain words,
// and that every precedent and site has measured normals (pc/typology_climate.py).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, test } from "vitest";
import { climateAt, km } from "../app/engine/typology/climatefetch.js";
import { CLIMATE, differences, distance, matchLabel, profile, type Normals } from "../app/engine/typology/climate.js";
import { LIBRARY } from "../app/engine/typology/library.js";

const flat = (v: number) => Array.from({ length: 12 }, () => v);
const place = (o: Partial<Normals>): Normals => ({ at: [0, 0], tmax: flat(30), tmin: flat(20), rain: flat(50), rh: flat(60), ...o });

describe("climate match", () => {
  test("profile reads the hottest month, coldest night, swing, rain and its season", () => {
    const tmax = flat(28); tmax[4] = 35;
    const rain = flat(10); rain[6] = 200; rain[7] = 200; rain[8] = 200;
    const rh = flat(50); rh[4] = 40;
    const p = profile(place({ tmax, tmin: flat(18), rain, rh }));
    expect(p.hot).toBe(35);
    expect(p.cold).toBe(18);
    expect(p.rain).toBe(690);
    expect(p.season).toBeCloseTo(600 / 690, 5);
    expect(p.muggy).toBe(40);
  });

  test("a climate is at distance 0 from itself and grows with each difference", () => {
    const a = profile(place({}));
    expect(distance(a, a)).toBe(0);
    const hotter = profile(place({ tmax: flat(36) }));
    const muchHotter = profile(place({ tmax: flat(42) }));
    expect(distance(hotter, a)).toBeGreaterThan(0);
    expect(distance(muchHotter, a)).toBeGreaterThan(distance(hotter, a));
    expect(matchLabel(0)).toBe("Very close climate");
    expect(matchLabel(5)).toBe("Different climate");
  });

  test("rain counts as a ratio: double is as far as half", () => {
    const a = profile(place({}));
    const dbl = profile(place({ rain: flat(100) })), half = profile(place({ rain: flat(25) }));
    expect(distance(dbl, a)).toBeCloseTo(distance(half, a), 6);
  });

  test("differences name the biggest gaps in plain words", () => {
    const site = profile(place({}));
    const desert = profile(place({ tmax: flat(42), rain: flat(2), rh: flat(20) }));
    const words = differences(desert, site);
    expect(words.length).toBeGreaterThan(0);
    expect(words.join(" ")).toMatch(/hotter|rain|drier/);
  });

  test("every precedent and every site has measured normals", () => {
    const missing = LIBRARY.filter((p) => !CLIMATE.places[p.id]).map((p) => p.id);
    expect(missing).toEqual([]);
    for (const n of Object.values(CLIMATE.places)) {
      expect(n.tmax).toHaveLength(12);
      expect(n.tmax.every((v) => v != null && Number.isFinite(v))).toBe(true);
    }
    expect(Object.keys(CLIMATE.places).some((k) => k === "site:bengaluru-cascade")).toBe(true);
  });
});

describe("climate for any place (climatefetch.ts)", () => {
  const answer = JSON.parse(readFileSync(join(__dirname, "fixtures", "nasa-power-bengaluru.json"), "utf8"));
  const ok = (async () => new Response(JSON.stringify(answer), { status: 200 })) as unknown as typeof fetch;
  const down = (async () => { throw new TypeError("network"); }) as unknown as typeof fetch;

  it("reads NASA POWER the way the library's climate data was read", async () => {
    const c = await climateAt(77.67, 12.907, { fetch: ok });
    expect(c.from).toBe("power");
    // the Bengaluru site in climate.json came from the same source and point
    const site = CLIMATE.places["site:bengaluru-cascade"];
    c.normals.tmax.forEach((v, m) => expect(Math.abs(v - site.tmax[m])).toBeLessThan(0.6));
    c.normals.rain.forEach((v, m) => expect(Math.abs(v - site.rain[m])).toBeLessThan(Math.max(3, 0.1 * site.rain[m])));
  });

  it("falls back to the nearest known place, and says how far", async () => {
    const c = await climateAt(77.6, 12.97, { fetch: down });
    expect(c.from).toBe("nearest");
    expect(["site:bengaluru-cascade", "katte"]).toContain(c.near!.id);
    expect(c.near!.km).toBeLessThan(15);
    expect(c.note).toMatch(/km away/);
  });

  it("measures distance on the globe", () => {
    expect(km([77.59, 12.97], [72.88, 19.08])).toBeGreaterThan(830);
    expect(km([77.59, 12.97], [72.88, 19.08])).toBeLessThan(850);
  });
});
