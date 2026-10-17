// Seeded random numbers, identical in the browser and Python (pc/rng.py).
// mulberry32, with normal draws as the Irwin-Hall sum of 12 uniforms (additions only, so
// no log or cos whose last digit could differ between the two languages).
import type { Rng } from "./types.js";

export function makeRng(seed = 1): Rng {
  let t = seed >>> 0;
  const random = () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
  const normal = (mu = 0, sigma = 1) => {
    let s = 0;
    for (let k = 0; k < 12; k++) s += random();
    return mu + sigma * (s - 6);
  };
  return { random, normal };
}
