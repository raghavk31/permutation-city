// Numbers as Python does them, and the shared neighbour smoothing.

/** Round half to even (Python's round / numpy's round). */
export function roundHalfEven(x: number): number {
  const f = Math.floor(x), d = x - f;
  if (d > 0.5) return f + 1;
  if (d < 0.5) return f;
  return f % 2 === 0 ? f : f + 1;
}

/** Python's round(x, nd), close enough for scores (ties are vanishingly rare). */
export function roundTo(x: number, nd: number): number {
  const p = 10 ** nd;
  return roundHalfEven(x * p) / p;
}

export const lerp = (g: number, lo: number, hi: number) => lo + g * (hi - lo);

export function norm(v: Float64Array): Float64Array {
  let top = -Infinity;
  for (const x of v) if (x > top) top = x;
  if (!(top > 0)) return v;
  return v.map((x) => x / top);
}

/** Average each cell with its neighbours, a few times over (pc.genome.smooth). nbr is
 *  n × deg, -1 where there is no neighbour. */
export function smooth(v: ArrayLike<number>, nbr: Int32Array, deg: number, passes = 2): Float64Array {
  const n = v.length;
  let cur = Float64Array.from(v);
  for (let p = 0; p < passes; p++) {
    const next = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let s = 0, c = 0;
      for (let k = 0; k < deg; k++) {
        const j = nbr[i * deg + k];
        if (j >= 0) { s += cur[j]; c++; } else s += 0;
      }
      next[i] = (cur[i] + s) / (1 + c);
    }
    cur = next;
  }
  return cur;
}

/** Python's round(x, nd) on an exported value: correctly rounded to nd decimals, as
 *  toFixed is (they differ only on exact binary ties, which computed values don't hit). */
export function pyRound(x: number, nd: number): number {
  return Number(x.toFixed(nd));
}
