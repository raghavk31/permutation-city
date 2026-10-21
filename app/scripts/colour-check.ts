// Colour-blind readability of the tokens (app/ui/tokens.ts), written to docs/ui/colour.md.
//
// Simulation: Machado, Oliveira and Fernandes 2009, severity 1.0, in linear sRGB. Distance:
// Euclidean in OKLab (Ottosson 2020). Pairs are colours shown side by side on one map; a pair
// passes at 0.08 or more (about four times OKLab's just-noticeable difference of 0.02). Ramps
// pass when their lightness rises or falls monotonically under every vision type.
//
//   npm run colour-check
import { writeFileSync } from "node:fs";
import { tokens as t } from "../ui/tokens.js";

const MACHADO = {
  protanopia: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deuteranopia: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
} as const;
type Vision = "normal" | keyof typeof MACHADO;
const VISIONS: Vision[] = ["normal", "protanopia", "deuteranopia"];

const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const rgb = (hex: string) => [1, 3, 5].map((k) => lin(parseInt(hex.slice(k, k + 2), 16) / 255));
function see(hex: string, v: Vision): number[] {
  const c = rgb(hex);
  if (v === "normal") return c;
  return MACHADO[v].map((row) => Math.min(1, Math.max(0, row[0] * c[0] + row[1] * c[1] + row[2] * c[2])));
}
function oklab([r, g, b]: number[]): number[] {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
const dist = (a: string, b: string, v: Vision) => {
  const p = oklab(see(a, v)), q = oklab(see(b, v));
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
};
const L = (hex: string, v: Vision) => oklab(see(hex, v))[0];

const B = t.building;
// Pairs marked `true` are also told apart without hue: greens carry a stipple in plan, existing
// buildings an edge line (they stay quieter than the design), and the accent is only ever a
// thick outline. They are reported, not hidden.
const PAIRS: [string, string, string, string, boolean?][] = [
  ["water (deep)", t.water.deep, "green (existing)", t.green.existing],
  ["water (storage)", t.water.storage, "green (proposed)", t.green.proposed],
  ["water (storage)", t.water.storage, "building, lowest", B[0]],
  ["water (storage)", t.water.storage, "building, low", B[1]],
  ["water (flood)", t.water.flood, "building, mid", B[2]],
  ["green (proposed)", t.green.proposed, "building, lowest", B[0], true],
  ["green (proposed)", t.green.proposed, "building, low", B[1], true],
  ["green (proposed)", t.green.proposed, "building, mid", B[2], true],
  ["green (existing)", t.green.existing, "building, tall", B[3], true],
  ["green (existing)", t.green.existing, "building, taller", B[4], true],
  ["forbidden", t.forbidden, "paper", t.paper],
  ["forbidden", t.forbidden, "existing city", t.existing.fill],
  ["existing city", t.existing.fill, "building, lowest", B[0], true],
  ["existing city", t.existing.fill, "paper", t.paper, true],
  ["street (on design)", t.street.onDesign, "building, lowest", B[0]],
  ["accent", t.accent, "building, tall", B[3], true],
  ["accent", t.accent, "building, mid", B[2], true],
  ["accent", t.accent, "green (existing)", t.green.existing, true],
  ["accent", t.accent, "water (deep)", t.water.deep, true],
  ["accent", t.accent, "measure, deep", t.measure[4], true],
];
const RAMPS: [string, string[]][] = [
  ["building", B], ["elevation", t.elevation], ["heat", t.heat], ["measure", t.measure],
  ["water (storage, flood, deep)", [t.water.storage, t.water.flood, t.water.deep]],
  ["green (light, proposed, existing)", [t.green.light, t.green.proposed, t.green.existing]],
];
const PASS = 0.08;

const rows: string[] = [], fails: string[] = [];
for (const [an, a, bn, b, backed] of PAIRS) {
  const d = VISIONS.map((v) => dist(a, b, v));
  const ok = d.every((x) => x >= PASS);
  if (!ok && !backed) fails.push(`${an} / ${bn}`);
  rows.push(`| ${an} \`${a}\` | ${bn} \`${b}\` | ${d.map((x) => x.toFixed(3)).join(" | ")} | ${ok ? "pass" : backed ? "low; pattern or outline" : "**low**"} |`);
}
const rampRows: string[] = [];
for (const [name, stops] of RAMPS) {
  const per = VISIONS.map((v) => {
    const ls = stops.map((s) => L(s, v));
    const steps = ls.slice(1).map((x, k) => x - ls[k]);
    const mono = steps.every((s) => s < 0) || steps.every((s) => s > 0);
    return { mono, min: Math.min(...steps.map(Math.abs)) };
  });
  const ok = per.every((p) => p.mono);
  if (!ok) fails.push(`ramp ${name}`);
  rampRows.push(`| ${name} | ${per.map((p) => `${p.mono ? "monotonic" : "**not monotonic**"}, smallest step ${p.min.toFixed(3)}`).join(" | ")} |`);
}

const md = `# Colour

The tokens are in \`app/ui/tokens.ts\`, the one file every map, chart, 3D material and legend
reads. This page records the colour-blind check. It was generated by \`npm run colour-check\`
in \`app/\`, so rerun it after changing a colour.

## Method

- **Simulation:** Machado, Oliveira and Fernandes (2009), "A physiologically-based model for
  simulation of color vision deficiency", severity 1.0, applied in linear sRGB.
- **Distance:** Euclidean distance in OKLab (Ottosson 2020).
- **Pairs:** colours shown side by side on one map. A pair passes at ${PASS} or more under all
  three kinds of vision, about four times OKLab's just-noticeable difference.
- **Ramps:** a ramp passes when its lightness runs one way under all three kinds of vision.
  Then it reads in order even where hue is lost.
- **Not colour alone:** forbidden and constrained ground are hatched, greens carry a stipple
  in plan, existing buildings an edge line, and selections are thick outlines. Pairs that
  fall under the bar but are told apart this way are marked "pattern or outline".

## Pairs

| colour | beside | normal | protanopia | deuteranopia | |
|---|---|---:|---:|---:|---|
${rows.join("\n")}

## Ramps

| ramp | normal | protanopia | deuteranopia |
|---|---|---|---|
${rampRows.join("\n")}

${fails.length ? `**Below the bar:** ${fails.join("; ")}.` : "Every pair and ramp passes."}
`;
writeFileSync("../docs/ui/colour.md", md);
console.log(fails.length ? `low: ${fails.join("; ")}` : "all pass");
