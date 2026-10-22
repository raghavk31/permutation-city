// Draw a site's vector plan stages to SVG, for checking by eye (A2).
//   npm run plan-view -- <out dir> [site ...] [--genome seed]
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import * as E from "../engine/index.js";
import { outline, skeletonLines } from "../engine/plan/ground.js";
import { lattice, route } from "../engine/plan/route.js";

const argv = process.argv.slice(2);
const out = argv[0];
const ids = argv.slice(1).filter((a) => !a.startsWith("--"));
const sites = ids.length ? ids : ["mumbai-ewf", "mumbai-docks", "ahmedabad-wadaj", "bengaluru-cascade"];
mkdirSync(out, { recursive: true });

export function svgOf(G: E.Ground, layers: string[]): string {
  const [x0, y0, x1, y1] = G.bounds, m = 80, w = x1 - x0 + 2 * m, h = y1 - y0 + 2 * m;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x0 - m} ${-(y1 + m)} ${w} ${h}" width="${Math.round(w)}" height="${Math.round(h)}">`
    + `<rect x="${x0 - m}" y="${-(y1 + m)}" width="${w}" height="${h}" fill="#fafaf8"/><g transform="scale(1,-1)">${layers.join("")}</g></svg>`;
}
export const path = (pts: [number, number][], close = false) => `M${pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join("L")}${close ? "Z" : ""}`;

for (const id of sites) {
  const site: E.SiteExport = JSON.parse(readFileSync(`public/sites/${id}.json`, "utf8"));
  const G = E.prepare(site), sd = E.sides(G);
  const layers: string[] = [];
  layers.push(`<path d="${outline(G).map((r) => path(r, true)).join("")}" fill="#efede6" stroke="#1c1b18" stroke-width="1.5"/>`);
  for (const r of G.roads ?? []) layers.push(`<path d="${path(r)}" fill="none" stroke="#c4c0b8" stroke-width="2"/>`);
  if (G.skeleton) for (let k = 0; k < G.skeleton.sides.length; k++) {
    const s = G.skeleton.sides[k];
    layers.push(`<path d="M${sd.vx[sd.v0[s]]} ${sd.vy[sd.v0[s]]}L${sd.vx[sd.v1[s]]} ${sd.vy[sd.v1[s]]}" stroke="#f26b1d" stroke-width="2" opacity=".6"/>`);
  }
  const t = performance.now(), lines = skeletonLines(G), ms = performance.now() - t;
  for (const l of lines) layers.push(`<path d="${path(l.points)}" fill="none" stroke="#1c1b18" stroke-width="${l.cls >= 3 ? 4 : 2.5}" stroke-linecap="round" stroke-linejoin="round"/>`);
  writeFileSync(`${out}/${id}-skeleton.svg`, svgOf(G, layers));
  // Routes for one design (v2 growth for its water and green), detour low and high.
  const rng = E.makeRng(5), genome = E.randomGenome(rng), d = E.grow(genome, G);
  const centres = d.attractors.filter((a) => a.kind === "core").map((a) => [a.x, a.y] as [number, number]);
  let t2 = performance.now();
  const L = lattice(G), msL = performance.now() - t2;
  for (const detour of [0, 0.6]) {
    const ls = [...layers.slice(0, 2)];
    for (let i = 0; i < G.n; i++) if (d.use[i] !== 1) ls.push(`<circle cx="${G.x[i]}" cy="${G.y[i]}" r="12" fill="${d.use[i] === 3 ? "#b9d4f1" : "#cfe9e7"}"/>`);
    for (const l of lines) ls.push(`<path d="${path(l.points)}" fill="none" stroke="#1c1b18" stroke-width="5" stroke-linecap="round"/>`);
    t2 = performance.now();
    const r = route(G, d, { detour, w_gates: 0.8, w_centres: 0.8, w_transit: 0.6, w_schools: 0.5, w_markets: 0.5 }, centres);
    const ms2 = performance.now() - t2;
    for (const l of r.lines) ls.push(`<path d="${path(l)}" fill="none" stroke="#57544d" stroke-width="3" stroke-linecap="round"/>`);
    for (const x of r.dests) ls.push(`<circle cx="${x.at[0]}" cy="${x.at[1]}" r="9" fill="${x.kind === "gate" ? "#1c1b18" : x.kind === "centre" ? "#f26b1d" : "#5a3f94"}"/>`);
    writeFileSync(`${out}/${id}-routes-${detour}.svg`, svgOf(G, ls));
    console.log(`  routes detour ${detour}: ${r.dests.length} destinations, ${r.lines.length} lines, ${ms2.toFixed(1)} ms (lattice ${L.n} nodes, ${msL.toFixed(0)} ms once)`);
  }
  // A whole version 3 design per family.
  for (let f = 0; f < 5; f++) {
    const g3 = E.randomGenome(E.makeRng(11 + f), 3);
    g3[40 + 17] = (f + 0.5) / 5;  // the pattern gene: family f
    const t3 = performance.now();
    const d3 = E.grow(g3, G);
    const ms3 = performance.now() - t3;
    E.evaluate(d3, G);
    const pl = d3.plan!, ls: string[] = [layers[0]];
    const fill = (u: number, lv: number) => (u === 1 ? ["#e8d6b2", "#d9c19a", "#c4a67d", "#a68862", "#7f674b", "#56463a"][Math.min(5, Math.floor(lv / 3))] : u === 2 ? "#7fc4c0" : u === 3 ? "#b9d4f1" : "#ddd");
    for (const p of pl.plots) ls.push(`<path d="${path(p.ring, true)}" fill="${fill(p.use, p.levels)}" stroke="#fafaf8" stroke-width="0.8"/>`);
    for (const st of pl.streets) ls.push(`<path d="${path(st.pts)}" fill="none" stroke="${st.cls === 3 ? "#1c1b18" : st.cls === 2 ? "#57544d" : "#a39f96"}" stroke-width="${st.cls === 3 ? 3 : st.cls === 2 ? 2 : 1.2}" stroke-linecap="round"/>`);
    for (const fl of pl.flags) ls.push(`<circle cx="${fl.at[0]}" cy="${fl.at[1]}" r="6" fill="none" stroke="#c0503f" stroke-width="2"/>`);
    writeFileSync(`${out}/${id}-v3-${f}.svg`, svgOf(G, ls));
    const rep = new Map<string, number>(); for (const r of pl.repairs) rep.set(r.kind, (rep.get(r.kind) ?? 0) + 1);
    const fl = new Map<string, number>(); for (const r of pl.flags) fl.set(r.rule, (fl.get(r.rule) ?? 0) + 1);
    console.log(`  v3 ${pl.family}: ${ms3.toFixed(0)} ms · ${pl.streets.length} streets, ${pl.blocks.length} blocks, ${pl.plots.length} plots · `
      + `scores ${JSON.stringify(d3.scores)} · repairs ${JSON.stringify(Object.fromEntries(rep))} · flags ${JSON.stringify(Object.fromEntries(fl))}`);
  }
  console.log(id, `skeleton ${G.skeleton?.source} · ${G.skeleton?.sides.length ?? 0} sides → ${lines.length} lines in ${ms.toFixed(0)} ms`);
}
