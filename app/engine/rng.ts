// Seeded random numbers (mulberry32) with normal draws (Box-Muller).
import type { Rng } from "./types";

export function makeRng(seed = 1): Rng {
  let t = seed >>> 0;
  const random = () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
  const normal = (mu = 0, sigma = 1) => {
    const u = 1 - random(), v = random();
    return mu + sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  return { random, normal };
}
