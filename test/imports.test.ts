// No new import cycles in the engine. Node resolves a cycle in an order that happens to work
// where the browser's module workers may not: on 4 November one (the plan's street shade ->
// massing setup -> genome -> ... -> the plan) left the grower worker failing at load ("Cannot
// access 'SCORE_KEYS' before initialization") while every Node test passed. Type-only imports
// don't count; the three cycles below were there before and are known to load.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, normalize, relative } from "node:path";
import { expect, test } from "vitest";

const ROOT = join(__dirname, "..", "app", "engine");
const KNOWN = [
  ["metrics/network.ts", "streets.ts"],
  ["genome.ts", "plan/field.ts", "plan/grow.ts"],
  ["massing/envelope.ts", "massing/vector.ts"],
].map((c) => c.sort().join(" "));

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? files(p) : p.endsWith(".ts") ? [p] : []; });
}

test("the engine has no import cycles but the known ones", () => {
  const g = new Map<string, string[]>();
  for (const p of files(ROOT)) {
    const src = readFileSync(p, "utf8"), deps: string[] = [];
    for (const m of src.matchAll(/^(?:import|export)\s+(?!type\b)([^;]*?)from\s+"(\.[^"]+)"/gm)) {
      if (/^\{\s*(type\s+\w+(\s+as\s+\w+)?\s*,?\s*)+\}$/.test(m[1].trim())) continue;   // only types
      deps.push(normalize(join(dirname(p), m[2].replace(/\.js$/, ".ts"))));
    }
    g.set(normalize(p), deps);
  }
  // Tarjan's strongly connected components
  let n = 0;
  const idx = new Map<string, number>(), low = new Map<string, number>(), on = new Set<string>(), st: string[] = [], cycles: string[] = [];
  const visit = (v: string) => {
    idx.set(v, n); low.set(v, n); n++; st.push(v); on.add(v);
    for (const w of g.get(v) ?? []) {
      if (!g.has(w)) continue;
      if (!idx.has(w)) { visit(w); low.set(v, Math.min(low.get(v)!, low.get(w)!)); } else if (on.has(w)) low.set(v, Math.min(low.get(v)!, idx.get(w)!));
    }
    if (low.get(v) === idx.get(v)) {
      const c: string[] = [];
      for (;;) { const w = st.pop()!; on.delete(w); c.push(relative(ROOT, w).replace(/\\/g, "/")); if (w === v) break; }
      if (c.length > 1) cycles.push(c.sort().join(" "));
    }
  };
  for (const v of g.keys()) if (!idx.has(v)) visit(v);
  expect(cycles.filter((c) => !KNOWN.includes(c))).toEqual([]);
});
